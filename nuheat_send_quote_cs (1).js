/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Send Quote Client Script
 * @description Client script for the Send Quote Selection Suitelet form.
 *              Handles button actions: Cancel (back to Opportunity), Preview Proposal.
 * @version     1.1.1
 * @author      Nu-Heat Development
 *
 * NOTE: This script is loaded inline by the Suitelet via form.clientScriptModulePath.
 *       It does NOT need a separate Script Record deployment.
 *
 * CHANGELOG v1.1.1 (Preview Data Fix):
 *   - FIXED: collectSelectedQuotes() now collects ALL required fields from the sublist,
 *     not just tranId/category/url/quoteType. Previously, the preview endpoint received
 *     incomplete data which caused custbody_quote_description (and other fields like
 *     quoteId, title, amount, subtotal, discountTotal, taxTotal) to be missing from
 *     the generated preview proposal.
 *   - Added fields: quoteId (custpage_quote_id), title (custpage_quote_title),
 *     amount (custpage_amount), subtotal (custpage_subtotal), discountTotal
 *     (custpage_discount_total), taxTotal (custpage_tax_total), description
 *     (custpage_quote_description)
 *
 * CHANGELOG v1.1.0:
 *   - Fixed preview validation: now scans all type-based sublists (custpage_quotes_*)
 *   - Preview now opens actual proposal HTML in a new browser window via Suitelet preview endpoint
 *   - Added email validation helper for To/CC/BCC fields
 */

define(['N/currentRecord', 'N/url', 'N/log', 'N/ui/dialog'],
function (currentRecord, url, log, dialog) {

    'use strict';

    var SCRIPT_VERSION = '1.2.0';

    /**
     * All known sublist type slugs — must match the Suitelet's QUOTE_TYPE_SLUGS values.
     */
    var SUBLIST_SLUGS = ['underfloor_heating', 'heat_pump', 'solar', 'other'];

    /**
     * pageInit — Runs when the Suitelet form loads.
     */
    function pageInit(context) {
        log.debug('SendQuoteCS.pageInit', 'Send Quote Client Script loaded (v' + SCRIPT_VERSION + ')');
    }

    /**
     * fieldChanged — Handles contact selector changes (v1.2.0).
     *
     * When the user selects a contact with a valid email from custpage_contact_selector,
     * updates both the visible email input and the hidden NetSuite field so that:
     *   - The user sees the new address immediately in the To field
     *   - saveRecord() validation reads the correct value from the hidden field
     *   - The sync-on-submit inline script carries the visible value to the hidden field
     *
     * Contacts with no email have value '' — these are intentionally skipped so the
     * existing To address is not cleared.
     */
    function fieldChanged(context) {
        if (context.fieldId !== 'custpage_contact_selector') { return; }

        try {
            var rec           = context.currentRecord;
            var selectedEmail = rec.getValue({ fieldId: 'custpage_contact_selector' });

            if (selectedEmail) {
                // Update visible input so the user sees the change immediately
                var visibleInput = document.getElementById('custpage_email_to_input');
                if (visibleInput) { visibleInput.value = selectedEmail; }

                // Update hidden NetSuite field so saveRecord() validation is correct
                rec.setValue({ fieldId: 'custpage_email_to', value: selectedEmail });
            }
            // If selectedEmail is '' (contact has no email), leave the To field unchanged.
            // The "(no email)" label in the dropdown is sufficient warning.
        } catch (e) {
            log.error('SendQuoteCS.fieldChanged', 'Error updating email from contact selector: ' + e.message);
        }
    }

    /**
     * goBackToOpportunity — Navigates back to the Opportunity record.
     *
     * Reads the hidden custpage_opportunity_id field and redirects.
     */
    function goBackToOpportunity() {
        try {
            var rec           = currentRecord.get();
            var opportunityId = rec.getValue({ fieldId: 'custpage_opportunity_id' });

            if (opportunityId) {
                var oppUrl = url.resolveRecord({
                    recordType: 'opportunity',
                    recordId:   opportunityId,
                    isEditMode: false
                });
                window.location.href = oppUrl;
            } else {
                history.back();
            }
        } catch (e) {
            log.error('SendQuoteCS.goBackToOpportunity', 'Error: ' + e.message);
            history.back();
        }
    }

    /**
     * collectSelectedQuotes — Iterates over all type-based sublists to find checked quotes.
     *
     * v1.1.1: Now collects ALL fields needed by the preview endpoint and master proposal,
     * including quoteId, title, amount, subtotal, discountTotal, taxTotal, and description.
     * Previously only sent tranId/category/url/quoteType, which caused description (and
     * other fields) to be missing from preview proposals.
     *
     * @returns {Array<Object>} Array of selected quote objects with all fields for preview/submit
     */
    function collectSelectedQuotes() {
        var rec      = currentRecord.get();
        var selected = [];

        SUBLIST_SLUGS.forEach(function (slug) {
            var sublistId = 'custpage_quotes_' + slug;
            var lineCount = rec.getLineCount({ sublistId: sublistId });

            if (lineCount < 0 || lineCount === 0) {
                return; // Sublist doesn't exist or is empty
            }

            for (var i = 0; i < lineCount; i++) {
                var isChecked = rec.getSublistValue({
                    sublistId: sublistId,
                    fieldId:   'custpage_select',
                    line:      i
                });

                if (isChecked === true || isChecked === 'T') {
                    var tranId       = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_quote_number', line: i });
                    var category     = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_category', line: i });
                    var qUrl         = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_quote_url', line: i });
                    var qType        = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_quote_type', line: i });

                    // v1.1.1: Collect additional fields required by master proposal for preview
                    var quoteId      = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_quote_id', line: i }) || '';
                    var title        = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_quote_title', line: i }) || '';
                    var amount       = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_amount', line: i }) || '';
                    var subtotal     = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_subtotal', line: i }) || '';
                    var discountTotal = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_discount_total', line: i }) || '';
                    var taxTotal     = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_tax_total', line: i }) || '';
                    var description  = rec.getSublistValue({ sublistId: sublistId, fieldId: 'custpage_quote_description', line: i }) || '';

                    selected.push({
                        tranId:        tranId,
                        category:      category,
                        url:           qUrl,
                        quoteType:     qType,
                        quoteId:       quoteId,          // v1.1.1
                        title:         title,            // v1.1.1
                        amount:        amount,           // v1.1.1
                        subtotal:      subtotal,         // v1.1.1
                        discountTotal: discountTotal,    // v1.1.1
                        taxTotal:      taxTotal,         // v1.1.1
                        description:   description       // v1.1.1: custbody_quote_description for preview rendering
                    });
                }
            }
        });

        return selected;
    }

    /**
     * previewProposal — Validates selection and opens a live proposal preview.
     *
     * Collects selected quotes from all type-based sublists, validates at least one
     * main quote is selected, then calls the Suitelet preview endpoint to generate
     * and display the proposal HTML in a new browser tab (without saving to File Cabinet).
     */
    function previewProposal() {
        try {
            var rec           = currentRecord.get();
            var opportunityId = rec.getValue({ fieldId: 'custpage_opportunity_id' });
            var selected      = collectSelectedQuotes();

            if (selected.length === 0) {
                dialog.alert({
                    title:   'No Quotes Selected',
                    message: 'Please tick the "Include" checkbox for at least one quote before previewing.'
                });
                return;
            }

            // Check at least one Main quote
            var hasMain = selected.some(function (q) { return q.category === 'main'; });
            if (!hasMain) {
                dialog.alert({
                    title:   'No Main Quote',
                    message: 'Please ensure at least one selected quote is categorised as "Main Quote".'
                });
                return;
            }

            // Build the preview URL — calls the same Suitelet with action=preview
            var suiteletUrl = url.resolveScript({
                scriptId:     'customscript_nuheat_send_quote_sl',
                deploymentId: 'customdeploy_nuheat_send_quote_sl',
                params: {
                    action:        'preview',
                    opportunityId: opportunityId,
                    quotes:        JSON.stringify(selected)
                }
            });

            // Open in new tab
            window.open(suiteletUrl, '_blank');

        } catch (e) {
            log.error('SendQuoteCS.previewProposal', 'Error: ' + e.message);
            dialog.alert({
                title:   'Error',
                message: 'Could not generate preview: ' + e.message
            });
        }
    }

    /**
     * validateEmailField — Validates a comma-separated email field value.
     *
     * @param {string} value - Comma-separated email addresses
     * @returns {boolean} True if all addresses are valid (or field is empty)
     */
    function validateEmailField(value) {
        if (!value || !value.trim()) return true;
        var emails = value.split(',');
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (var i = 0; i < emails.length; i++) {
            var email = emails[i].trim();
            if (email && !emailRegex.test(email)) {
                return false;
            }
        }
        return true;
    }

    /**
     * saveRecord — Validates the form before submission (Generate & Send).
     *
     * Checks:
     *   1. At least one quote selected
     *   2. At least one Main quote
     *   3. Valid email in To field
     *   4. Valid emails in CC/BCC fields (if provided)
     */
    function saveRecord(context) {
        try {
            var rec      = currentRecord.get();
            var selected = collectSelectedQuotes();

            if (selected.length === 0) {
                dialog.alert({
                    title:   'No Quotes Selected',
                    message: 'Please tick the "Include" checkbox for at least one quote.'
                });
                return false;
            }

            var hasMain = selected.some(function (q) { return q.category === 'main'; });
            if (!hasMain) {
                dialog.alert({
                    title:   'No Main Quote',
                    message: 'Please ensure at least one selected quote is categorised as "Main Quote".'
                });
                return false;
            }

            // Validate email fields
            var toEmail = rec.getValue({ fieldId: 'custpage_email_to' }) || '';
            if (!toEmail.trim()) {
                dialog.alert({
                    title:   'Email Required',
                    message: 'Please enter a recipient email address in the "To" field.'
                });
                return false;
            }

            if (!validateEmailField(toEmail)) {
                dialog.alert({
                    title:   'Invalid Email',
                    message: 'The "To" email address is not valid. Please check and try again.'
                });
                return false;
            }

            var ccEmail  = rec.getValue({ fieldId: 'custpage_email_cc' }) || '';
            var bccEmail = rec.getValue({ fieldId: 'custpage_email_bcc' }) || '';

            if (!validateEmailField(ccEmail)) {
                dialog.alert({
                    title:   'Invalid CC Email',
                    message: 'One or more CC email addresses are not valid. Please check and try again.'
                });
                return false;
            }

            if (!validateEmailField(bccEmail)) {
                dialog.alert({
                    title:   'Invalid BCC Email',
                    message: 'One or more BCC email addresses are not valid. Please check and try again.'
                });
                return false;
            }

            return true;

        } catch (e) {
            log.error('SendQuoteCS.saveRecord', 'Validation error: ' + e.message);
            dialog.alert({
                title:   'Validation Error',
                message: 'An error occurred during validation: ' + e.message
            });
            return false;
        }
    }

    // Expose functions globally for button functionName references
    if (typeof window !== 'undefined') {
        window.goBackToOpportunity = goBackToOpportunity;
        window.previewProposal     = previewProposal;
    }

    return {
        pageInit:              pageInit,
        fieldChanged:          fieldChanged,
        saveRecord:            saveRecord,
        goBackToOpportunity:   goBackToOpportunity,
        previewProposal:       previewProposal
    };

});
