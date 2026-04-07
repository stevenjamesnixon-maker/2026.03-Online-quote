/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Nu-Heat Analytics Suitelet
 *
 * Receives view events from customer-facing quote and proposal pages.
 * Called asynchronously (fire-and-forget) from GTM — never blocks page load.
 *
 * Quote page views    → write to Estimate record only
 * Proposal page views → write to Opportunity record only
 *
 * Fields written (must be created manually in NetSuite before testing):
 *
 * Estimate:
 *   custbodycustbody_quote_last_viewed  (DateTime)  — note: double-prefix, created as-is in NetSuite
 *   custbodycustbody_quote_view_count   (Integer)   — note: double-prefix, created as-is in NetSuite
 *
 * Opportunity:
 *   custbody_opp_quote_last_viewed  (DateTime)
 *   custbody_opp_view_count         (Integer)
 *
 * Author: Nu-Heat Development Team
 * Version: 1.0.0
 * Created: April 2026
 */
define(['N/record', 'N/log'], function(record, log) {
    'use strict';

    function onRequest(context) {

        // CORS headers — required so browser fetch() from quote/proposal pages is not blocked
        context.response.setHeader({ name: 'Access-Control-Allow-Origin',  value: '*' });
        context.response.setHeader({ name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' });
        context.response.setHeader({ name: 'Access-Control-Allow-Headers', value: 'Content-Type' });
        context.response.setHeader({ name: 'Content-Type',                 value: 'application/json' });

        // Handle preflight OPTIONS request sent by browser before POST
        if (context.request.method === 'OPTIONS') {
            context.response.write(JSON.stringify({ success: true }));
            return;
        }

        if (context.request.method !== 'POST') {
            context.response.write(JSON.stringify({ success: false }));
            return;
        }

        try {
            var body          = JSON.parse(context.request.body);
            var type          = body.type          || '';  // 'quote' or 'proposal'
            var recordId      = body.recordId      || '';  // Estimate internal ID (quote views only)
            var opportunityId = body.opportunityId || '';  // Opportunity internal ID
            var customerId    = body.customerId    || '';  // Customer internal ID (logged only)

            log.audit('AnalyticsSL', 'View event received — type: ' + type +
                ' | recordId: ' + recordId +
                ' | oppId: ' + opportunityId +
                ' | customerId: ' + customerId);

            var now = new Date().toISOString();

            // ── Quote page view → write to Estimate only ──────────────────────────
            if (type === 'quote' && recordId) {
                try {
                    var estimateRec = record.load({
                        type: record.Type.ESTIMATE,
                        id: recordId,
                        isDynamic: false
                    });
                    var currentQuoteCount = parseInt(
                        estimateRec.getValue({ fieldId: 'custbodycustbody_quote_view_count' }), 10
                    ) || 0;

                    record.submitFields({
                        type: record.Type.ESTIMATE,
                        id: recordId,
                        values: {
                            custbodycustbody_quote_last_viewed: now,
                            custbodycustbody_quote_view_count:  currentQuoteCount + 1
                        }
                    });

                    log.audit('AnalyticsSL', 'Estimate ' + recordId +
                        ' updated — count: ' + (currentQuoteCount + 1));

                } catch (estErr) {
                    log.error('AnalyticsSL', 'Failed to update Estimate ' +
                        recordId + ': ' + estErr.message);
                }
            }

            // ── Proposal page view → write to Opportunity only ────────────────────
            if (type === 'proposal' && opportunityId) {
                try {
                    var oppRec = record.load({
                        type: record.Type.OPPORTUNITY,
                        id: opportunityId,
                        isDynamic: false
                    });
                    var currentOppCount = parseInt(
                        oppRec.getValue({ fieldId: 'custbody_opp_view_count' }), 10
                    ) || 0;

                    record.submitFields({
                        type: record.Type.OPPORTUNITY,
                        id: opportunityId,
                        values: {
                            custbody_opp_quote_last_viewed: now,
                            custbody_opp_view_count:        currentOppCount + 1
                        }
                    });

                    log.audit('AnalyticsSL', 'Opportunity ' + opportunityId +
                        ' updated — count: ' + (currentOppCount + 1));

                } catch (oppErr) {
                    log.error('AnalyticsSL', 'Failed to update Opportunity ' +
                        opportunityId + ': ' + oppErr.message);
                }
            }

            context.response.write(JSON.stringify({ success: true }));

        } catch (e) {
            log.error('AnalyticsSL', 'Unhandled error: ' + e.message);
            context.response.write(JSON.stringify({ success: false }));
        }
    }

    return { onRequest: onRequest };
});
