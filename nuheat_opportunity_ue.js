/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Opportunity User Event
 * @description Adds a "Send Quote" button to the Opportunity record form.
 *              The button opens the Send Quote Selection Suitelet in a new window.
 * @version     1.0.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_opportunity_ue
 * Deployment ID:  customdeploy_nuheat_opportunity_ue
 * Applies To:     Opportunity
 * Event Types:    Before Load
 */

define(['N/log', 'N/runtime'],
function (log, runtime) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    /**
     * beforeLoad — Adds the "Send Quote" button to the Opportunity form.
     *
     * Only adds the button in VIEW and EDIT modes (not CREATE).
     *
     * @param {Object} context
     * @param {Record} context.newRecord - The Opportunity record being loaded.
     * @param {Form}   context.form      - The form object to which the button is added.
     * @param {string} context.type      - The user event type (VIEW, EDIT, CREATE, etc.).
     */
    function beforeLoad(context) {
        try {
            // Only add button when viewing or editing an existing record
            if (context.type !== context.UserEventType.VIEW &&
                context.type !== context.UserEventType.EDIT) {
                return;
            }

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

    return {
        beforeLoad: beforeLoad
    };

});
