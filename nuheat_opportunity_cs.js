/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Opportunity Client Script
 * @description Client script for the Opportunity record.
 *              Handles the "Send Quote" button click — opens the Send Quote
 *              Suitelet in the same browser tab.
 * @version     1.1.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_opportunity_cs
 * Deployment ID:  customdeploy_nuheat_opportunity_cs
 * Applies To:     Opportunity
 *
 * CHANGELOG v1.1.0 (Send Quote SL 2.0.0):
 *   - CHANGED: openSendQuoteSuitelet() navigates in the SAME tab (window.location.href) instead
 *     of window.open(..., '_blank'). Send Quote SL 2.0.0 redirects back to this Opportunity after
 *     a send, so the user ends up where they started with the result banner.
 */

define(['N/url', 'N/currentRecord', 'N/log'],
function (url, currentRecord, log) {

    'use strict';

    var SCRIPT_VERSION = '1.1.0';

    // ─── Suitelet identifiers ─────────────────────────────────────────────────
    var SEND_QUOTE_SCRIPT_ID     = 'customscript_nuheat_send_quote_sl';
    var SEND_QUOTE_DEPLOYMENT_ID = 'customdeploy_nuheat_send_quote_sl';

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

    // Expose function globally so the button's functionName can invoke it
    if (typeof window !== 'undefined') {
        window.openSendQuoteSuitelet = openSendQuoteSuitelet;
    }

    return {
        pageInit:                pageInit,
        openSendQuoteSuitelet:   openSendQuoteSuitelet
    };

});
