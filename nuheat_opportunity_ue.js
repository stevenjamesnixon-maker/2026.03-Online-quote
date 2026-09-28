/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Opportunity User Event
 * @description Adds a "Send Quote" button to the Opportunity form (VIEW only) and, after a
 *              proposal is sent, shows the Send Quote result banner.
 * @version     1.2.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_opportunity_ue
 * Deployment ID:  customdeploy_nuheat_opportunity_ue
 * Applies To:     Opportunity
 * Event Types:    Before Load
 *
 * CHANGELOG v1.2.0 (Send Quote SL 2.0.0):
 *   - ADDED: Send Quote result banner. Send Quote SL 2.0.0 redirects here after a send with
 *     code-only parameters (nsq, nsqt, nsqf, nsqff, nsqfi, nsqfx, nsqqf). The banner's words are
 *     built from the record and a fixed key → label map — never from parameter text — so a
 *     crafted link cannot put text on an Opportunity. Ignored when nsqt is missing, garbage or
 *     more than 300 seconds old (a refresh or shared link must not replay it). Failed quote IDs
 *     are shown only if they are Estimates on THIS Opportunity. Fails closed: any error is logged
 *     and the record view is never affected.
 *
 * CHANGELOG v1.1.0 (Send Quote SL 1.8.0):
 *   - CHANGED: The "Send Quote" button is added in VIEW mode only (previously VIEW and EDIT).
 *     Send Quote SL 1.8.0 can write Status, Next contact, Est. delivery date and Build stage
 *     back to the Opportunity. With the record open in EDIT, that write followed by the user's
 *     own save would either fail with "record has been changed" or silently overwrite the
 *     Suitelet's values.
 */

define(['N/log', 'N/runtime', 'N/ui/message', 'N/search', 'N/format'],
function (log, runtime, message, search, format) {

    'use strict';

    var SCRIPT_VERSION = '1.2.0';

    /** Banner lifetime. A refresh or a shared link after this shows nothing. */
    var BANNER_MAX_AGE_SECONDS = 300;

    /**
     * Whitelisted field keys (as sent by Send Quote SL) → label and the Opportunity field the
     * new value is read from. Any other key in the URL is dropped.
     */
    var BANNER_FIELDS = {
        entitystatus: { label: 'Status',             fieldId: 'entitystatus',          kind: 'select' },
        next_contact: { label: 'Next contact',       fieldId: 'custbody_next_contact', kind: 'date' },
        del_date:     { label: 'Est. delivery date', fieldId: 'custbody_opp_del_date', kind: 'date' },
        build_stage:  { label: 'Build stage',        fieldId: 'custbody_build_stage',  kind: 'select' }
    };

    /**
     * beforeLoad — Adds the "Send Quote" button to the Opportunity form and shows the
     * Send Quote result banner.
     *
     * Only acts in VIEW mode (not EDIT or CREATE).
     *
     * @param {Object} context
     * @param {Record} context.newRecord - The Opportunity record being loaded.
     * @param {Form}   context.form      - The form object to which the button is added.
     * @param {string} context.type      - The user event type (VIEW, EDIT, CREATE, etc.).
     */
    function beforeLoad(context) {
        // v1.1.0: VIEW only, deliberately not EDIT. The Send Quote Suitelet writes
        // Opportunity fields (Status, Next contact, Est. delivery date, Build stage).
        // If the record were open in EDIT, the user's later save would either fail with
        // "record has been changed" or silently overwrite the Suitelet's values.
        if (context.type !== context.UserEventType.VIEW) {
            return;
        }

        addSendQuoteButton(context);
        addSendQuoteBanner(context);
    }

    function addSendQuoteButton(context) {
        try {
            var form          = context.form;
            var opportunityId = context.newRecord.id;

            log.debug('OpportunityUE.beforeLoad',
                'Adding Send Quote button | Opportunity ID: ' + opportunityId +
                ' | Mode: ' + context.type +
                ' | Version: ' + SCRIPT_VERSION);

            // Defensively remove any existing button with this ID
            try {
                form.removeButton({ id: 'custpage_send_quote' });
            } catch (e) {
                // Button doesn't exist yet — expected
            }

            // Add the "Send Quote" button
            form.addButton({
                id: 'custpage_send_quote',
                label: 'Send Quote',
                functionName: 'openSendQuoteSuitelet'
            });

            // Attach the client script that handles the button click
            form.clientScriptModulePath = './nuheat_opportunity_cs.js';

        } catch (e) {
            log.error('OpportunityUE.beforeLoad',
                'Error adding Send Quote button: ' + e.message + '\n' + e.stack);
            // Non-fatal — don't block the page load
        }
    }

    // ─── Send Quote result banner (v1.2.0) ────────────────────────────────────────

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /** Comma list → whitelisted BANNER_FIELDS keys, de-duplicated. Unknown entries dropped. */
    function whitelistKeys(str) {
        var out = [];
        String(str || '').split(',').forEach(function (k) {
            k = k.trim();
            if (Object.prototype.hasOwnProperty.call(BANNER_FIELDS, k) && out.indexOf(k) === -1) out.push(k);
        });
        return out;
    }

    /** A small non-negative integer, or null. */
    function parseCount(str) {
        return /^\d{1,4}$/.test(String(str || '')) ? parseInt(str, 10) : null;
    }

    /** The field's current value as display text, read from the record. */
    function readValueText(rec, def) {
        try {
            if (def.kind === 'select') {
                return rec.getText({ fieldId: def.fieldId }) || '';
            }
            var v = rec.getValue({ fieldId: def.fieldId });
            return v instanceof Date ? format.format({ value: v, type: format.Type.DATE }) : (v ? String(v) : '');
        } catch (e) {
            return '';
        }
    }

    /**
     * Failed quote IDs → tranids, ONLY for Estimates linked to this Opportunity.
     * Anything else (not numeric, another Opportunity's Estimate, not an Estimate) is dropped.
     */
    function lookupFailedQuotes(opportunityId, str) {
        var ids = [];
        String(str || '').split(',').forEach(function (id) {
            id = id.trim();
            if (/^\d{1,12}$/.test(id) && ids.indexOf(id) === -1) ids.push(id);
        });
        if (!ids.length || !opportunityId) return [];
        ids = ids.slice(0, 50);

        var tranIds = [];
        search.create({
            type: search.Type.ESTIMATE,
            filters: [
                ['internalid', 'anyof', ids],
                'AND',
                ['opportunity', 'anyof', opportunityId],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: ['tranid']
        }).run().getRange({ start: 0, end: 50 }).forEach(function (r) {
            var t = r.getValue({ name: 'tranid' });
            if (t) tranIds.push(t);
        });
        return tranIds;
    }

    /**
     * Shows the Send Quote result banner when the page was reached by the Suitelet's redirect.
     * Never throws.
     */
    function addSendQuoteBanner(context) {
        try {
            var request = context.request;
            if (!request || !request.parameters) return;
            var p = request.parameters;

            var status = p.nsq;
            if (status !== 'ok' && status !== 'warn') return;

            var t = String(p.nsqt || '');
            if (!/^\d{1,12}$/.test(t)) return;
            var age = Math.floor(Date.now() / 1000) - parseInt(t, 10);
            if (age < -60 || age > BANNER_MAX_AGE_SECONDS) {
                log.debug('OpportunityUE.banner', 'Ignored — nsqt is ' + age + ' seconds old');
                return;
            }

            var rec = context.newRecord;
            var lines = [];

            var changed = whitelistKeys(p.nsqf);
            if (changed.length) {
                lines.push('Opportunity updated: ' + changed.map(function (k) {
                    var def = BANNER_FIELDS[k];
                    var value = readValueText(rec, def);
                    return def.label + (value ? ' → ' + value : '');
                }).join(' · '));
            }

            var included = parseCount(p.nsqfi);
            var excluded = parseCount(p.nsqfx);
            if (included !== null && excluded !== null) {
                lines.push('Forecast: ' + included + ' quote' + (included === 1 ? '' : 's') + ' included, ' +
                    excluded + ' excluded');
            }

            var warnings = [];
            var failed = whitelistKeys(p.nsqff);
            if (failed.length) {
                warnings.push('Please set ' + failed.map(function (k) { return BANNER_FIELDS[k].label; }).join(', ') +
                    ' on this record.');
            }
            var failedQuotes = lookupFailedQuotes(rec.id, p.nsqqf);
            if (failedQuotes.length) {
                warnings.push('Forecast flag not updated on ' + failedQuotes.join(', ') + '.');
            }

            var isWarn = status === 'warn';
            var parts = (isWarn ? warnings.concat(lines) : lines).map(escapeHtml);

            var proposalUrl = '';
            try {
                proposalUrl = String(rec.getValue({ fieldId: 'custbody_master_proposal_url' }) || '');
            } catch (e) {
                proposalUrl = '';
            }
            if (/^https:\/\//i.test(proposalUrl)) {
                parts.push('<a href="' + escapeHtml(proposalUrl) + '" target="_blank" rel="noopener">View proposal</a>');
            }

            context.form.addPageInitMessage({
                type:    isWarn ? message.Type.WARNING : message.Type.CONFIRMATION,
                title:   escapeHtml(isWarn ? 'Proposal sent — but the opportunity wasn’t fully updated' : 'Proposal sent'),
                message: parts.join('<br>')
            });

            log.audit('OpportunityUE.banner', 'Opportunity ' + rec.id + ' — ' + status +
                ' | changed: ' + (changed.join(',') || 'none') + ' | failed fields: ' + (failed.join(',') || 'none') +
                ' | failed quotes: ' + (failedQuotes.join(',') || 'none'));

        } catch (e) {
            // Fail closed: no banner, record view unaffected.
            log.error('OpportunityUE.banner', 'Banner not shown: ' + e.message + '\n' + e.stack);
        }
    }

    return {
        beforeLoad: beforeLoad
    };

});
