/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Opportunity Client Script
 * @description Client script for the Opportunity record.
 *              Handles the "Send Quote", "Update opportunity" and "Create order" button
 *              clicks — opens each Suitelet in the same browser tab.
 * @version     1.3.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_opportunity_cs
 * Deployment ID:  customdeploy_nuheat_opportunity_cs
 * Applies To:     Opportunity
 *
 * CHANGELOG v1.3.0 (Create order SL 1.0.0):
 *   - ADDED: openCreateOrderSuitelet() for the "Create order" button (Opportunity UE 1.5.0) — same
 *     pattern as openUpdateOppSuitelet(), own script / deployment IDs, same tab.
 *
 * CHANGELOG v1.2.0 (Update Opportunity SL 1.0.0):
 *   - ADDED: openUpdateOppSuitelet() for the "Update opportunity" button — same pattern as
 *     openSendQuoteSuitelet(), own script / deployment IDs, same tab.
 *
 * CHANGELOG v1.1.0 (Send Quote SL 2.0.0):
 *   - CHANGED: openSendQuoteSuitelet() navigates in the SAME tab (window.location.href) instead
 *     of window.open(..., '_blank'). Send Quote SL 2.0.0 redirects back to this Opportunity after
 *     a send, so the user ends up where they started with the result banner.
 */

define(['N/url', 'N/currentRecord', 'N/log'],
function (url, currentRecord, log) {

    'use strict';

    var SCRIPT_VERSION = '1.3.0';

    // ─── Suitelet identifiers ─────────────────────────────────────────────────
    var SEND_QUOTE_SCRIPT_ID     = 'customscript_nuheat_send_quote_sl';
    var SEND_QUOTE_DEPLOYMENT_ID = 'customdeploy_nuheat_send_quote_sl';
    var UPDATE_OPP_SCRIPT_ID     = 'customscript_nuheat_update_opp_sl';        // v1.2.0
    var UPDATE_OPP_DEPLOYMENT_ID = 'customdeploy_nuheat_update_opp_sl';
    var CREATE_ORDER_SCRIPT_ID     = 'customscript_nuheat_create_order_sl';    // v1.3.0
    var CREATE_ORDER_DEPLOYMENT_ID = 'customdeploy_nuheat_create_order_sl';

    /**
     * pageInit — Runs when the Opportunity form loads.
     */
    function pageInit(context) {
        log.debug('OpportunityCS.pageInit', 'Nu-Heat Opportunity Client Script loaded (v' + SCRIPT_VERSION + ')');
    }

    /**
     * openSendQuoteSuitelet — Opens the Send Quote Selection Suitelet.
     *
     * Called by the "Send Quote" button added by nuheat_opportunity_ue.js.
     * Builds the Suitelet URL with the current Opportunity ID as a parameter
     * and opens it in the same tab (v1.1.0).
     */
    function openSendQuoteSuitelet() {
        try {
            var rec           = currentRecord.get();
            var opportunityId = rec.id;

            if (!opportunityId) {
                alert('Please save the Opportunity record before sending a quote.');
                return;
            }

            log.debug('OpportunityCS.openSendQuoteSuitelet',
                'Opening Send Quote Suitelet for Opportunity: ' + opportunityId);

            // Resolve the Suitelet URL
            var suiteletUrl = url.resolveScript({
                scriptId:          SEND_QUOTE_SCRIPT_ID,
                deploymentId:      SEND_QUOTE_DEPLOYMENT_ID,
                returnExternalUrl: false,
                params: {
                    opportunityId: opportunityId
                }
            });

            // v1.1.0: same tab — the Suitelet returns here after a send
            window.location.href = suiteletUrl;

        } catch (e) {
            log.error('OpportunityCS.openSendQuoteSuitelet', 'Error: ' + e.message);
            alert('Could not open the Send Quote page. Error: ' + e.message);
        }
    }

    /**
     * v1.2.0: openUpdateOppSuitelet — Opens the Update Opportunity Suitelet in the same tab.
     * Called by the "Update opportunity" button added by nuheat_opportunity_ue.js.
     */
    function openUpdateOppSuitelet() {
        try {
            var rec           = currentRecord.get();
            var opportunityId = rec.id;

            if (!opportunityId) {
                alert('Please save the Opportunity record before updating it.');
                return;
            }

            var suiteletUrl = url.resolveScript({
                scriptId:          UPDATE_OPP_SCRIPT_ID,
                deploymentId:      UPDATE_OPP_DEPLOYMENT_ID,
                returnExternalUrl: false,
                params: {
                    opportunityId: opportunityId
                }
            });

            // Same tab — the Suitelet returns here after a save
            window.location.href = suiteletUrl;

        } catch (e) {
            log.error('OpportunityCS.openUpdateOppSuitelet', 'Error: ' + e.message);
            alert('Could not open the Update opportunity page. Error: ' + e.message);
        }
    }

    /**
     * v1.3.0: openCreateOrderSuitelet — Opens the Create order Suitelet in the same tab.
     * Called by the "Create order" button added by nuheat_opportunity_ue.js 1.5.0.
     */
    function openCreateOrderSuitelet() {
        try {
            var rec           = currentRecord.get();
            var opportunityId = rec.id;

            if (!opportunityId) {
                alert('Please save the Opportunity record before creating an order.');
                return;
            }

            var suiteletUrl = url.resolveScript({
                scriptId:          CREATE_ORDER_SCRIPT_ID,
                deploymentId:      CREATE_ORDER_DEPLOYMENT_ID,
                returnExternalUrl: false,
                params: {
                    opportunityId: opportunityId
                }
            });

            // Same tab — the Suitelet returns here after the orders are created
            window.location.href = suiteletUrl;

        } catch (e) {
            log.error('OpportunityCS.openCreateOrderSuitelet', 'Error: ' + e.message);
            alert('Could not open the Create order page. Error: ' + e.message);
        }
    }

    // Expose functions globally so the buttons' functionName can invoke them
    if (typeof window !== 'undefined') {
        window.openSendQuoteSuitelet = openSendQuoteSuitelet;
        window.openUpdateOppSuitelet = openUpdateOppSuitelet;
        window.openCreateOrderSuitelet = openCreateOrderSuitelet;   // v1.3.0
    }

    return {
        pageInit:                pageInit,
        openSendQuoteSuitelet:   openSendQuoteSuitelet,
        openUpdateOppSuitelet:   openUpdateOppSuitelet,
        openCreateOrderSuitelet: openCreateOrderSuitelet
    };

});
