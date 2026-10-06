/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Opportunity User Event
 * @description Adds the "Send Quote", "Update opportunity" and "Create order" buttons to the
 *              Opportunity form (VIEW only) and, after any of those pages saves, shows its result banner.
 * @version     1.5.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_opportunity_ue
 * Deployment ID:  customdeploy_nuheat_opportunity_ue
 * Applies To:     Opportunity
 * Event Types:    Before Load
 *
 * ⚠️ 1.5.0: create the script parameter custscript_nuheat_co_btn_mode (Free-Form Text) on THIS
 *    deployment first. Empty = OFF = no "Create order" button.
 *
 * CHANGELOG v1.5.0 (Create order SL 1.0.0 — 6 Oct 2026):
 *   - ADDED: third VIEW-only button "Create order" (custpage_create_order → openCreateOrderSuitelet in
 *     nuheat_opportunity_cs.js 1.3.0), after Update opportunity, in its own try/catch — a failure there
 *     can never remove Send Quote or Update opportunity. Shown only when custscript_nuheat_co_btn_mode
 *     (on THIS deployment — a twin of the Suitelet's custscript_nuheat_co_mode) allows the user:
 *     OFF (default; empty, unknown or unreadable too) → no button; ADMIN → the Administrator role only;
 *     ALL → everyone. The Suitelet applies its own parameter as well.
 *   - ADDED: banner source nsqs = 'ord' (whitelisted). Titles "Order created" / "Orders created" /
 *     "Orders created — but not everything saved"; nsq = 'dup' → "Already created". Codes:
 *       - nsqso: the created Sales Orders — shown ONLY when each SO's opportunity is this one (one
 *         search): "Created SO239950, SO239951". None verified → no banner;
 *       - nsqqf: quotes not converted (lookupFailedQuotes, this opportunity's Estimates only);
 *       - nsqlf / nsqtm: SOs whose order log failed / whose total after save differs from the quote
 *         (only the SOs verified above);
 *       - nsqe / nsqen and nsqf / nsqff as for 'upd'; two more field keys, sub_status and value_prop.
 *   - 'send' and 'upd' banners unchanged.
 *
 * CHANGELOG v1.4.0 (Update Opportunity SL 1.1.0 — in Production, 1 Oct 2026):
 *   - ADDED (nsqs=upd only; a Send Quote banner ignores all of these):
 *       - nsqe = 'sent' | 'fail' (whitelisted; anything else ignored) and nsqen (a count):
 *         "Email sent to <n> recipient(s)" / warning "The email was not sent.";
 *       - nsq = 'dup' (a resubmitted page that saved nothing): title "Already saved", line "This
 *         update had already been saved, so nothing was repeated.";
 *       - titles when the only action was an email (no call, no objection logged or failed, no
 *         field changed or failed): "Email sent" / "Email not sent". Otherwise as 1.3.0.
 *   - Every word is still fixed text or read from the record — never the subject or an address.
 *
 * CHANGELOG v1.3.0 (Update Opportunity SL 1.0.0):
 *   - ADDED: second VIEW-only button "Update opportunity" (custpage_update_opp →
 *     openUpdateOppSuitelet in nuheat_opportunity_cs.js v1.2.0), after the Send Quote button.
 *   - ADDED: banner source code nsqs = 'send' | 'upd' (whitelisted; missing or unknown → 'send', so
 *     redirects already in flight still work and the Send Quote banner is unchanged). For 'upd':
 *       - titles "Opportunity updated" / "Opportunity updated — but not everything saved";
 *       - "Call logged: <title>" — nsqc is looked up as a Phone Call and shown ONLY if its
 *         transaction is this Opportunity;
 *       - "<n> objection(s) logged" from nsqo;
 *       - "Objections not saved: <names>" — nsqof IDs looked up on customrecord_nh_objection_type
 *         (anything that is not one is dropped);
 *       - the same field lines; NO proposal link.
 *   - Deliberately does NOT depend on nuheat_opp_update_lib.js: a missing library would stop this
 *     UE loading and could break the Opportunity view. It carries a small local text cleaner.
 *
 * CHANGELOG v1.2.1 (Send Quote SL 2.0.2):
 *   - ADDED: close_date → Expected close (expectedclosedate) in BANNER_FIELDS. Without it the
 *     banner would silently drop the change — keys not on the whitelist are discarded.
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

    var SCRIPT_VERSION = '1.5.0';

    /**
     * v1.5.0: who gets the "Create order" button — on THIS deployment (a twin of the Create order
     * Suitelet's custscript_nuheat_co_mode; a User Event can't read another script's parameters).
     * OFF (default; empty, unknown or unreadable too — fail closed), ADMIN, ALL.
     */
    var CO_MODE_PARAM = 'custscript_nuheat_co_btn_mode';
    var ADMIN_ROLE_ID = 'administrator';   // the standard Administrator role's script ID (roleId)

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
        build_stage:  { label: 'Build stage',        fieldId: 'custbody_build_stage',  kind: 'select' },
        close_date:   { label: 'Expected close',     fieldId: 'expectedclosedate',     kind: 'date' },  // v1.2.1
        sub_status:   { label: 'Sub-status',         fieldId: 'custbody_opportunity_sub_status', kind: 'select' },   // v1.5.0 (Create order)
        value_prop:   { label: 'Value proposition',  fieldId: 'custbody_value_proposition',      kind: 'select' }    // v1.5.0
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
        addUpdateOppButton(context);
        addCreateOrderButton(context);   // v1.5.0
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

    /**
     * v1.3.0: the "Update opportunity" button, after Send Quote. Same client script. Never throws.
     */
    function addUpdateOppButton(context) {
        try {
            var form = context.form;
            try {
                form.removeButton({ id: 'custpage_update_opp' });
            } catch (e) {
                // Button doesn't exist yet — expected
            }
            form.addButton({
                id: 'custpage_update_opp',
                label: 'Update opportunity',
                functionName: 'openUpdateOppSuitelet'
            });
            form.clientScriptModulePath = './nuheat_opportunity_cs.js';
        } catch (e) {
            log.error('OpportunityUE.beforeLoad',
                'Error adding Update opportunity button: ' + e.message + '\n' + e.stack);
        }
    }

    /**
     * v1.5.0: the mode for the "Create order" button. Any doubt → OFF.
     * @returns {{ mode: string, allowed: boolean }}
     */
    function createOrderAccess() {
        var raw = '';
        try {
            raw = runtime.getCurrentScript().getParameter({ name: CO_MODE_PARAM });
        } catch (e) {
            log.debug('OpportunityUE.CreateOrder', 'Mode parameter could not be read (' + e.message + '); OFF');
            return { mode: 'OFF', allowed: false };
        }
        var v = String(raw === null || raw === undefined ? '' : raw).trim().toUpperCase();
        if (v === 'ALL') return { mode: v, allowed: true };
        if (v === 'ADMIN') {
            var role = '';
            try { role = String(runtime.getCurrentUser().roleId || ''); } catch (e) { role = ''; }
            return { mode: v, allowed: role === ADMIN_ROLE_ID };
        }
        if (v !== '' && v !== 'OFF') log.debug('OpportunityUE.CreateOrder', 'Unknown mode "' + v.substring(0, 40) + '"; OFF');
        return { mode: 'OFF', allowed: false };
    }

    /**
     * v1.5.0: the "Create order" button, after Update opportunity, only when the mode allows this user.
     * Its own try/catch: a failure here never removes the other two buttons. Never throws.
     */
    function addCreateOrderButton(context) {
        try {
            if (!createOrderAccess().allowed) return;
            var form = context.form;
            try {
                form.removeButton({ id: 'custpage_create_order' });
            } catch (e) {
                // Button doesn't exist yet — expected
            }
            form.addButton({
                id: 'custpage_create_order',
                label: 'Create order',
                functionName: 'openCreateOrderSuitelet'
            });
            form.clientScriptModulePath = './nuheat_opportunity_cs.js';
        } catch (e) {
            log.error('OpportunityUE.beforeLoad',
                'Error adding Create order button: ' + e.message + '\n' + e.stack);
        }
    }

    // ─── Result banner (v1.2.0; Update Opportunity source from v1.3.0) ────────────

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
     * v1.3.0: minimal text cleaner for record text shown in the banner (decode entities, strip
     * tags, collapse whitespace). The library has the canonical version; this UE deliberately
     * does not depend on the library (see the header).
     */
    function cleanText(str) {
        var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        return String(str || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
            if (e.charAt(0) === '#') {
                var code = (e.charAt(1) === 'x' || e.charAt(1) === 'X') ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10);
                return (code > 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : m;
            }
            var k = e.toLowerCase();
            return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : m;
        }).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    /** A comma list of numeric internal IDs, de-duplicated; anything else dropped. */
    function idList(str) {
        var ids = [];
        String(str || '').split(',').forEach(function (id) {
            id = id.trim();
            if (/^\d{1,12}$/.test(id) && ids.indexOf(id) === -1) ids.push(id);
        });
        return ids.slice(0, 50);
    }

    /**
     * v1.3.0: nsqc → the Phone Call's title, ONLY if the call's transaction is this Opportunity.
     * '' otherwise (not numeric, not found, another record's call).
     */
    function lookupCallTitle(opportunityId, str) {
        var ids = idList(str);
        if (ids.length !== 1 || !opportunityId) return '';
        try {
            var f = search.lookupFields({ type: search.Type.PHONE_CALL, id: ids[0], columns: ['title', 'transaction'] });
            var tx = Array.isArray(f.transaction) && f.transaction.length ? String(f.transaction[0].value) : '';
            return tx === String(opportunityId) ? cleanText(f.title) : '';
        } catch (e) {
            log.debug('OpportunityUE.banner', 'Call ' + ids[0] + ' not shown: ' + e.message);
            return '';
        }
    }

    /** v1.3.0: nsqof → Objection Type names. IDs that are not Objection Types are dropped. */
    function lookupObjectionTypeNames(str) {
        var ids = idList(str);
        if (!ids.length) return [];
        var names = [];
        search.create({
            type:    'customrecord_nh_objection_type',
            filters: [['internalid', 'anyof', ids]],
            columns: ['name']
        }).run().getRange({ start: 0, end: 50 }).forEach(function (r) {
            var n = cleanText(r.getValue({ name: 'name' }));
            if (n) names.push(n);
        });
        return names;
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
     * v1.5.0: Sales Order IDs → { id: tranid }, ONLY for Sales Orders whose opportunity is this one.
     * Anything else (not numeric, another opportunity's order, not a Sales Order) is dropped. One search.
     */
    function lookupCreatedOrders(opportunityId, ids) {
        var out = {};
        if (!ids.length || !opportunityId) return out;
        search.create({
            type: search.Type.SALES_ORDER,
            filters: [
                ['internalid', 'anyof', ids],
                'AND',
                ['opportunity', 'anyof', opportunityId],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: ['internalid', 'tranid']
        }).run().getRange({ start: 0, end: 50 }).forEach(function (r) {
            var t = r.getValue({ name: 'tranid' });
            if (t) out[String(r.getValue({ name: 'internalid' }))] = t;
        });
        return out;
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
            if (status !== 'ok' && status !== 'warn' && status !== 'dup') return;

            var t = String(p.nsqt || '');
            if (!/^\d{1,12}$/.test(t)) return;
            var age = Math.floor(Date.now() / 1000) - parseInt(t, 10);
            if (age < -60 || age > BANNER_MAX_AGE_SECONDS) {
                log.debug('OpportunityUE.banner', 'Ignored — nsqt is ' + age + ' seconds old');
                return;
            }

            // v1.3.0: which page sent us here. Whitelisted; missing or unknown → 'send'. v1.5.0: + 'ord'.
            var source = p.nsqs === 'upd' ? 'upd' : (p.nsqs === 'ord' ? 'ord' : 'send');

            // v1.4.0: a resubmitted Update Opportunity page saved nothing (nsq=dup). Fixed words only.
            // v1.5.0: the same for a resubmitted Create order page.
            if (status === 'dup') {
                if (source === 'send') return;
                context.form.addPageInitMessage({
                    type:    message.Type.INFORMATION,
                    title:   escapeHtml(source === 'ord' ? 'Already created' : 'Already saved'),
                    message: escapeHtml(source === 'ord' ? 'These orders had already been created, so nothing was repeated.'
                        : 'This update had already been saved, so nothing was repeated.')
                });
                log.audit('OpportunityUE.banner', 'Opportunity ' + context.newRecord.id + ' — upd/dup');
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

            var included = source === 'send' ? parseCount(p.nsqfi) : null;
            var excluded = source === 'send' ? parseCount(p.nsqfx) : null;
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
            var failedQuotes = source === 'send' ? lookupFailedQuotes(rec.id, p.nsqqf) : [];
            if (failedQuotes.length) {
                warnings.push('Forecast flag not updated on ' + failedQuotes.join(', ') + '.');
            }

            // v1.5.0: Create order — the orders (verified against this opportunity), words from the records
            var ordLines = [];
            var ordCount = 0;
            if (source === 'ord') {
                var soIds = idList(p.nsqso);
                var flagged = idList(p.nsqlf).concat(idList(p.nsqtm)).filter(function (id) { return soIds.indexOf(id) === -1; });
                var orders = lookupCreatedOrders(rec.id, soIds.concat(flagged).slice(0, 50));
                var createdNames = soIds.filter(function (id) { return orders[id]; }).map(function (id) { return orders[id]; });
                if (!createdNames.length) {
                    log.audit('OpportunityUE.banner', 'Opportunity ' + rec.id + ' — ord: no created order on this opportunity; no banner');
                    return;
                }
                ordCount = createdNames.length;
                ordLines.push('Created ' + createdNames.join(', '));
                var notCreated = lookupFailedQuotes(rec.id, p.nsqqf);
                if (notCreated.length) warnings.push('Not created: ' + notCreated.join(', ') + '.');
                var logNames = idList(p.nsqlf).filter(function (id) { return orders[id]; }).map(function (id) { return orders[id]; });
                if (logNames.length) warnings.push('Order log not created for ' + logNames.join(', ') + ' — please add it.');
                var totalNames = idList(p.nsqtm).filter(function (id) { return orders[id]; }).map(function (id) { return orders[id]; });
                if (totalNames.length) warnings.push('Total differs from the quote on ' + totalNames.join(', ') + ' — please check.');
            }

            // v1.3.0: Update Opportunity — the call and the objections, words from the records
            var updLines = [];
            var onlyEmail = '';   // v1.4.0: 'sent' | 'fail' when the email was the only action
            if (source === 'ord') {   // v1.5.0: the email — the same fixed words as 'upd'
                var ordEmail = (p.nsqe === 'sent' || p.nsqe === 'fail') ? p.nsqe : '';
                if (ordEmail === 'sent') {
                    var ordTo = parseCount(p.nsqen);
                    ordLines.push(ordTo ? 'Confirmation email sent to ' + ordTo + ' recipient' + (ordTo === 1 ? '' : 's') : 'Confirmation email sent');
                } else if (ordEmail === 'fail') {
                    warnings.push('The confirmation email was not sent.');
                }
            }
            if (source === 'upd') {
                var callTitle = lookupCallTitle(rec.id, p.nsqc);
                if (callTitle) updLines.push('Call logged: ' + callTitle);
                // v1.4.0: the email — fixed words and a count only
                var emailState = (p.nsqe === 'sent' || p.nsqe === 'fail') ? p.nsqe : '';
                if (emailState === 'sent') {
                    var sentTo = parseCount(p.nsqen);
                    updLines.push(sentTo ? 'Email sent to ' + sentTo + ' recipient' + (sentTo === 1 ? '' : 's') : 'Email sent');
                } else if (emailState === 'fail') {
                    warnings.push('The email was not sent.');
                }
                var logged = parseCount(p.nsqo);
                if (logged) updLines.push(logged + ' objection' + (logged === 1 ? '' : 's') + ' logged');
                var notSaved = lookupObjectionTypeNames(p.nsqof);
                if (notSaved.length) warnings.push('Objections not saved: ' + notSaved.join(', ') + '.');
                if (emailState && !idList(p.nsqc).length && !logged && !idList(p.nsqof).length && !changed.length && !failed.length) {
                    onlyEmail = emailState;
                }
            }
            lines = ordLines.concat(updLines).concat(lines);

            var isWarn = status === 'warn';
            var parts = (isWarn ? warnings.concat(lines) : lines).map(escapeHtml);

            if (source === 'send') {
                var proposalUrl = '';
                try {
                    proposalUrl = String(rec.getValue({ fieldId: 'custbody_master_proposal_url' }) || '');
                } catch (e) {
                    proposalUrl = '';
                }
                if (/^https:\/\//i.test(proposalUrl)) {
                    parts.push('<a href="' + escapeHtml(proposalUrl) + '" target="_blank" rel="noopener">View proposal</a>');
                }
            }

            var TITLES = {
                send: ['Proposal sent', 'Proposal sent — but the opportunity wasn’t fully updated'],
                upd:  ['Opportunity updated', 'Opportunity updated — but not everything saved'],
                ord:  [ordCount === 1 ? 'Order created' : 'Orders created', 'Orders created — but not everything saved']   // v1.5.0
            };
            var title = TITLES[source][isWarn ? 1 : 0];
            if (onlyEmail === 'sent') title = 'Email sent';          // v1.4.0
            else if (onlyEmail === 'fail') title = 'Email not sent';
            context.form.addPageInitMessage({
                type:    isWarn ? message.Type.WARNING : message.Type.CONFIRMATION,
                title:   escapeHtml(title),
                message: parts.join('<br>')
            });

            log.audit('OpportunityUE.banner', 'Opportunity ' + rec.id + ' — ' + source + '/' + status +
                ' | changed: ' + (changed.join(',') || 'none') + ' | failed fields: ' + (failed.join(',') || 'none') +
                ' | failed quotes: ' + (failedQuotes.join(',') || 'none') +
                (source !== 'send' ? ' | email: ' + ((p.nsqe === 'sent' || p.nsqe === 'fail') ? p.nsqe : 'none') : '') +
                (source === 'ord' ? ' | orders: ' + ordCount : ''));

        } catch (e) {
            // Fail closed: no banner, record view unaffected.
            log.error('OpportunityUE.banner', 'Banner not shown: ' + e.message + '\n' + e.stack);
        }
    }

    return {
        beforeLoad: beforeLoad
    };

});
