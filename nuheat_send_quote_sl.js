/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Send Quote Selection Suitelet
 * @description Suitelet that displays all Quotes (Estimates) linked to an Opportunity,
 *              allowing the user to select which quotes to include in a proposal,
 *              categorise them as Main or Additional, and trigger proposal generation.
 *              Supports preview (generates HTML without saving) and email sending.
 *              Quotes are grouped into separate sections by type.
 * @version     1.4.9
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_send_quote_sl
 * Deployment ID:  customdeploy_nuheat_send_quote_sl
 *
 * CHANGELOG v1.4.9 (Pricing Data Fix - record.load):
 *   - CRITICAL FIX: Replaced search.lookupFields() with record.load() for pricing
 *     fields (subtotal, discounttotal, taxtotal). lookupFields does NOT support
 *     calculated/summary fields on Estimate records — it was silently failing and
 *     falling back to the search 'total' field, causing System Price and Total inc VAT
 *     to show identical values. record.load().getValue() reliably returns these fields.
 *   - FIXED: Discount and VAT values were always £0.00 because lookupFields was throwing
 *     an error and the catch block only set subtotalVal (to fallback total), leaving
 *     discountTotalVal and taxTotalVal empty.
 *   - ADDED: Enhanced debug logging showing all four pricing fields after record.load.
 *
 * CHANGELOG v1.4.8 (UI & Pricing Fixes):
 *   - FIXED: Removed green border-left shadow from Email Recipients box. The CSS
 *     class .nuheat-email-info no longer applies border-left: 3px solid teal.
 *   - FIXED: User Instructions now display as full-width bar underneath the
 *     Opportunity Details and Email Recipients 50/50 layout, with clear separation.
 *   - FIXED: "System Price" / Subtotal now pulls from standard 'subtotal' field
 *     (price ex VAT before discount) instead of custbody_subtotal custom field.
 *     This ensures correct subtotal values are passed to the master proposal.
 *   - ADDED: Debug logging for pricing field values loaded from Estimate records.
 *   - Updated instruction text: "Enter email recipients" now says "above" instead of "below".
 *
 * CHANGELOG v1.4.7 (System Price Fix + Preview Description Fix):
 *   - FIXED: "System Price" column now pulls from custbody_subtotal (custom transaction body field)
 *     instead of the standard 'subtotal' field. The standard 'subtotal' is a NetSuite-calculated
 *     field that sums all line items, whereas custbody_subtotal is a custom field holding the
 *     intended system price value. lookupFields call updated accordingly.
 *   - FIXED: Preview mode was not displaying custbody_quote_description because the client script
 *     (nuheat_send_quote_cs.js) collectSelectedQuotes() was only sending tranId, category, url,
 *     and quoteType to the preview endpoint. Now collects and sends all required fields including
 *     description, quoteId, title, amount, subtotal, discountTotal, and taxTotal.
 *   - Updated nuheat_send_quote_cs.js to v1.1.1 with expanded collectSelectedQuotes() function.
 *
 * CHANGELOG v1.4.6 (log.warn Fix):
 *   - Replaced all log.warn() calls with log.debug() — NetSuite does not support log.warn()
 *   - Valid NS log methods: log.debug(), log.audit(), log.error(), log.emergency()
 *   - This was causing "log.warn is not a function" error at line 1863 in searchRelatedQuotes,
 *     preventing all 13 quotes from being processed
 *
 * CHANGELOG v1.4.5 (Critical Bug Fixes):
 *   - CRITICAL FIX: Quote search regression — 'subtotal', 'discounttotal', 'taxtotal' are NOT valid
 *     NetSuite search columns on Estimates and caused SSS_INVALID_SRCH_COL error.
 *     The try-catch silently swallowed the error, returning zero quotes.
 *     Fix: Removed invalid columns from search. Now loads pricing data from individual
 *     Estimate records after search completes (record.load with fields subset).
 *   - FIX: Added comprehensive error logging throughout searchRelatedQuotes with
 *     separate try-catch for search creation vs. result processing
 *   - FIX: "No quotes found" banner now displays full width at top of page with
 *     prominent styling and clear instructions
 *   - FIX: Opportunity title now correctly displays — added null safety and fallback
 *     for custbody_opp_site_adress field loading
 *   - Added: Defensive null checks on all field value reads in search results
 *   - Added: Error logging with search filter/column details for easier debugging
 *   - Added: Fallback pricing values when record-level field loading fails
 *
 * CHANGELOG v1.4.4 (UI/UX Improvements):
 *   - Removed: Icons/emojis from all form buttons (Generate & Send, Preview, Cancel, Back)
 *   - Added: Site address (custbody_opp_site_adress) displayed as title heading in Opportunity Details
 *   - Changed: Email fields (To, CC, BCC) are now rendered inside the Email Recipients grey box
 *     via inline HTML inputs, instead of separate NetSuite form fields below the sublists
 *   - Expanded: Underfloor Heating quote type mapping now includes Full System (DFD/DFP),
 *     Multizone (DZM), Full System (DFD), Extension (DXD), UFH for Heat Pump (DFHD), Full System
 *   - Expanded: Heat Pump quote type mapping now includes Heat Pump (GSHP), Heat Pump (ASHP),
 *     Heat Pump (EAHP)
 *   - Added: Description column (custbody_quote_description) visible in quote selection sublists
 *   - Changed: URL column width reduced for better table layout
 *
 * CHANGELOG v1.4.3 (Price Field Fixes):
 *   - Fixed: Search column changed from custbody_subtotal to standard 'subtotal' field
 *   - Added: 'discounttotal' and 'taxtotal' search columns for actual NS pricing data
 *   - Added: Hidden sublist fields custpage_discount_total and custpage_tax_total
 *   - Fixed: POST handler now reads discountTotal and taxTotal from sublist and passes
 *     them through to the master proposal as discountTotal and taxTotal properties
 *   - Fixed: Preview handler now maps discountTotal and taxTotal fields
 *   - Version bump: nuheat_master_proposal.js 1.5.1 → 1.5.2
 *
 * CHANGELOG v1.4.1:
 *   - Fixed: Email "VIEW YOUR QUOTE" button was appearing twice when rendered.
 *     Root cause: The MSO/Outlook fallback button used CSS `display:none; mso-hide:none`
 *     which was not respected by all email clients, causing both buttons to show.
 *     Fix: Replaced CSS-based hiding with proper MSO conditional comments
 *     (`<!--[if mso]>...<![endif]-->`) so only one button renders per client.
 *   - Changed: Button text updated from "VIEW YOUR QUOTE" to "VIEW YOUR QUOTE(S) HERE"
 *
 * CHANGELOG v1.4.0:
 *   - Changed: Replaced basic email template with Nu-Heat branded Chamaileon-designed
 *     HTML email template (from QUOTE_ New quote_2026-3-17.html)
 *   - Changed: Email subject now uses custbody_quote_email_ref field for project reference
 *   - Added: Merge tag system for email template (QUOTE_EMAIL_REF, TRAN_ID, SALES_REP_NAME,
 *     SALES_REP_EMAIL, SALES_REP_PHONE, PROPOSAL_URL)
 *   - Changed: "View Your Quote" button in email now links to master proposal URL
 *   - Changed: "Click to Call" and "Send an Email" buttons use sales rep contact details
 *   - Added: quoteEmailRef field (custbody_quote_email_ref) to Opportunity data loading
 *   - Version bump: nuheat_master_proposal.js 1.3.0 → 1.4.0
 *
 * CHANGELOG v1.3.0:
 *   - Changed: Restructured UI layout — Opportunity Details and Email Recipients
 *     now display side-by-side in a two-column (50/50) layout at the top of the form
 *   - Removed: Green/teal section header divs for each quote type (Underfloor Heating,
 *     Heat Pump, Solar, Other). Sublists now display directly without coloured headers.
 *   - Fixed: Version bump to align with nuheat_master_proposal.js v1.3.0
 *
 * CHANGELOG v1.1.0:
 *   - Added preview endpoint (action=preview) — generates proposal HTML in-browser without saving
 *   - Added email fields: To, CC, BCC (To prepopulated from Customer email)
 *   - Added email sending via N/email after proposal generation
 *   - Added communication logging to Opportunity Messages subtab
 *   - Updated success page to show email confirmation and recipient list
 *   - Added email field group with descriptive help text
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/log',
    'N/url',
    'N/redirect',
    'N/runtime',
    'N/format',
    'N/email',
    './nuheat_master_proposal'
], function (serverWidget, search, record, log, url, redirect, runtime, format, email, masterProposal) {

    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────────

    var SCRIPT_VERSION = '1.5.1';

    /**
     * Mapping from the NetSuite custbody_quote_type list values
     * to the customer-facing display names used in proposals.
     */
    var QUOTE_TYPE_MAPPING = {
        // Underfloor Heating types
        'Heat Emitter':             'Underfloor Heating',
        'heat emitter':             'Underfloor Heating',
        'Full System (DFD/DFP)':    'Underfloor Heating',
        'full system (dfd/dfp)':    'Underfloor Heating',
        'Multizone (DZM)':          'Underfloor Heating',
        'multizone (dzm)':          'Underfloor Heating',
        'Full System (DFD)':        'Underfloor Heating',
        'full system (dfd)':        'Underfloor Heating',
        'Extension (DXD)':          'Underfloor Heating',
        'extension (dxd)':          'Underfloor Heating',
        'UFH for Heat Pump (DFHD)': 'Underfloor Heating',
        'ufh for heat pump (dfhd)': 'Underfloor Heating',
        'Full System':              'Underfloor Heating',
        'full system':              'Underfloor Heating',
        // Heat Pump types
        'Heat Pump':                'Heat Pump',
        'heat pump':                'Heat Pump',
        'Heat Pump (GSHP)':         'Heat Pump',
        'heat pump (gshp)':         'Heat Pump',
        'Heat Pump (ASHP)':         'Heat Pump',
        'heat pump (ashp)':         'Heat Pump',
        'Heat Pump (EAHP)':         'Heat Pump',
        'heat pump (eahp)':         'Heat Pump',
        // Solar types
        'Solar':                    'Solar',
        'solar':                    'Solar'
    };

    var UNSUPPORTED_QUOTE_TYPE = 'Other';

    /**
     * Ordered list of quote type sections. Only types with quotes will render.
     */
    var QUOTE_TYPE_ORDER = ['Underfloor Heating', 'Heat Pump', 'Solar', 'Other'];

    /**
     * Sublist ID-safe slugs for each quote type.
     */
    var QUOTE_TYPE_SLUGS = {
        'Underfloor Heating': 'underfloor_heating',
        'Heat Pump':          'heat_pump',
        'Solar':              'solar',
        'Other':              'other'
    };

    /**
     * Nu-Heat brand colours — used for inline HTML styling on the form.
     */
    var BRAND = {
        primary:    '#00857D',  // teal
        secondary:  '#333333',
        accent:     '#9E1B5E',  // berry / CTA
        lightBg:    '#f8f9fa',
        white:      '#ffffff',
        border:     '#dee2e6',
        textMuted:  '#6c757d'
    };

    // ─── Helpers ──────────────────────────────────────────────────────────────────

    /**
     * Maps a raw quote type value to a customer-facing display name.
     */
    function getQuoteTypeDisplayName(rawType) {
        if (!rawType) return UNSUPPORTED_QUOTE_TYPE;
        var trimmed = rawType.trim();
        return QUOTE_TYPE_MAPPING[trimmed] || QUOTE_TYPE_MAPPING[trimmed.toLowerCase()] || UNSUPPORTED_QUOTE_TYPE;
    }

    /**
     * Formats a NetSuite date value to DD/MM/YYYY string.
     */
    function formatDate(dateValue) {
        if (!dateValue) return '';
        try {
            var d = (typeof dateValue === 'string') ? new Date(dateValue) : dateValue;
            if (isNaN(d.getTime())) return String(dateValue);
            var day   = ('0' + d.getDate()).slice(-2);
            var month = ('0' + (d.getMonth() + 1)).slice(-2);
            var year  = d.getFullYear();
            return day + '/' + month + '/' + year;
        } catch (e) {
            return String(dateValue);
        }
    }

    /**
     * Formats a number as GBP currency string.
     */
    function formatCurrency(amount) {
        if (amount === null || amount === undefined || amount === '') return '£0.00';
        var num = parseFloat(amount);
        if (isNaN(num)) return '£0.00';
        return '£' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Parses a comma-separated email string into an array of trimmed addresses.
     * Returns empty array if input is empty/null.
     */
    function parseEmails(emailStr) {
        if (!emailStr || !emailStr.trim()) return [];
        return emailStr.split(',').map(function (e) { return e.trim(); }).filter(function (e) { return e.length > 0; });
    }

    // ─── Suitelet Entry Point ─────────────────────────────────────────────────────

    /**
     * Main Suitelet handler.
     */
    function onRequest(context) {
        log.audit('SendQuoteSL.onRequest', 'Method: ' + context.request.method + ' | Version: ' + SCRIPT_VERSION);

        try {
            // Handle preview action (GET with action=preview)
            if (context.request.method === 'GET' && context.request.parameters.action === 'preview') {
                handlePreview(context);
                return;
            }

            if (context.request.method === 'GET') {
                showQuoteSelectionForm(context);
            } else {
                handleFormSubmission(context);
            }
        } catch (e) {
            log.error('SendQuoteSL.onRequest', 'Unhandled error: ' + e.message + '\n' + e.stack);
            showErrorPage(context, e.message);
        }
    }

    // ─── Preview Handler ──────────────────────────────────────────────────────────

    /**
     * Handles the preview action — generates proposal HTML and writes it directly
     * to the response (opens as a new page). Does NOT save to File Cabinet or
     * update any records.
     */
    function handlePreview(context) {
        var opportunityId = context.request.parameters.opportunityId;
        var quotesJson    = context.request.parameters.quotes;

        log.audit('SendQuoteSL.handlePreview', 'Preview for Opportunity ' + opportunityId);

        if (!opportunityId || !quotesJson) {
            context.response.write('<html><body><h1>Preview Error</h1><p>Missing Opportunity ID or quote data.</p></body></html>');
            return;
        }

        try {
            var selectedQuotes = JSON.parse(quotesJson);

            // Map client-side quote objects to the format expected by master proposal
            // Client sends: { tranId, category, url, quoteType }
            // Master proposal expects: { quoteId, tranId, title, quoteType, amount, subtotal, quoteUrl, category, description }
            var mappedQuotes = selectedQuotes.map(function (q) {
                return {
                    quoteId:       q.quoteId || '',
                    tranId:        q.tranId || '',
                    title:         q.title || q.tranId || 'Quote',
                    quoteType:     q.quoteType || 'Other',
                    amount:        q.amount || '£0.00',
                    subtotal:      q.subtotal || '',
                    discountTotal: q.discountTotal || '',   // v1.4.3: Discount total
                    taxTotal:      q.taxTotal || '',        // v1.4.3: VAT total
                    quoteUrl:      q.url || q.quoteUrl || '',
                    category:      q.category || 'main',
                    description:   q.description || ''     // v1.4.2: For master proposal HTML rendering
                };
            });

            // Generate preview HTML (no save, no field update)
            var html = masterProposal.generatePreviewHTML(opportunityId, mappedQuotes);

            // Write HTML directly to response
            context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
            context.response.write(html);

        } catch (e) {
            log.error('SendQuoteSL.handlePreview', 'Preview error: ' + e.message + '\n' + e.stack);
            context.response.write('<html><body><h1>Preview Error</h1><p>' + escapeHtml(e.message) + '</p></body></html>');
        }
    }

    // ─── GET: Show the Quote Selection Form ───────────────────────────────────────

    /**
     * Builds and displays the quote selection form.
     * Quotes are grouped into separate sublists by quote type.
     */
    function showQuoteSelectionForm(context) {
        var opportunityId = context.request.parameters.opportunityId;

        if (!opportunityId) {
            showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
            return;
        }

        // ── Load Opportunity record ──────────────────────────────────────────────
        var oppRecord;
        try {
            oppRecord = record.load({ type: record.Type.OPPORTUNITY, id: opportunityId });
        } catch (e) {
            log.error('SendQuoteSL.showForm', 'Failed to load Opportunity ' + opportunityId + ': ' + e.message);
            showErrorPage(context, 'Could not load Opportunity record (ID: ' + opportunityId + '). Please check the record exists and you have permission to view it.');
            return;
        }

        var oppTranId    = oppRecord.getValue({ fieldId: 'tranid' })    || '';
        var oppTitle     = oppRecord.getValue({ fieldId: 'title' })     || '';
        var customerName = oppRecord.getText({ fieldId: 'entity' })     || '';
        var customerId   = oppRecord.getValue({ fieldId: 'entity' })    || '';
        var oppStatus    = oppRecord.getText({ fieldId: 'entitystatus' }) || '';

        // v1.4.5: Defensive loading of site address — field may not exist on all environments
        var siteAddress  = '';
        try {
            siteAddress = oppRecord.getValue({ fieldId: 'custbody_opp_site_adress' }) || '';
        } catch (siteErr) {
            log.debug('SendQuoteSL.showForm', 'Could not read custbody_opp_site_adress: ' + siteErr.message + ' — field may not exist');
        }

        log.debug('SendQuoteSL.showForm', 'Loaded Opportunity fields — tranId: ' + oppTranId +
            ', title: ' + oppTitle + ', siteAddress: ' + siteAddress +
            ', customer: ' + customerName + ', status: ' + oppStatus);

        // Load customer email for prepopulation
        var customerEmail = '';
        if (customerId) {
            try {
                var custFields = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId,
                    columns: ['email']
                });
                customerEmail = custFields.email || '';
            } catch (e) {
                log.debug('SendQuoteSL.showForm', 'Could not look up customer email: ' + e.message);
            }
        }

        log.audit('SendQuoteSL.showForm', 'v1.4.5 — Opportunity: ' + oppTranId + ' | Title: ' + oppTitle +
            ' | Customer: ' + customerName + ' | Email: ' + customerEmail + ' | SiteAddr: ' + siteAddress);

        // v1.5.0: Load contacts from Opportunity contact sublist
        // v1.5.1: Corrected sublist ID from 'contact' to 'contactroles' — the correct internal ID for
        //         the Contacts sublist on Opportunity records. fieldId 'contact' within the sublist is unchanged.
        var contacts = [];
        try {
            var contactCount = oppRecord.getLineCount({ sublistId: 'contactroles' });
            for (var ci = 0; ci < contactCount; ci++) {
                var contactId = oppRecord.getSublistValue({ sublistId: 'contactroles', fieldId: 'contact', line: ci });
                if (contactId) {
                    try {
                        var contactRecord = record.load({ type: record.Type.CONTACT, id: contactId });
                        var firstName = contactRecord.getValue({ fieldId: 'firstname' }) || '';
                        var lastName  = contactRecord.getValue({ fieldId: 'lastname' })  || '';
                        var email     = contactRecord.getValue({ fieldId: 'email' })     || '';
                        contacts.push({
                            id:    contactId,
                            name:  (firstName + ' ' + lastName).trim() || 'Contact ' + contactId,
                            email: email
                        });
                    } catch (contactErr) {
                        log.debug('SendQuoteSL.loadContacts', 'Could not load contact ' + contactId + ': ' + contactErr.message);
                    }
                }
            }
            log.debug('SendQuoteSL.loadContacts', 'Loaded ' + contacts.length + ' contacts for Opportunity ' + opportunityId);
        } catch (contactListErr) {
            log.debug('SendQuoteSL.loadContacts', 'Could not read contact sublist: ' + contactListErr.message);
        }

        // ── Create form ──────────────────────────────────────────────────────────
        var form = serverWidget.createForm({
            title: 'Send Quote — Select Quotes to Include'
        });

        // Inject custom CSS via inline HTML field
        var cssField = form.addField({
            id: 'custpage_css',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        cssField.defaultValue = buildFormCSS();

        // ── Two-column top section: Opportunity Details (left) + Email Recipients (right) ──
        var topSectionField = form.addField({
            id: 'custpage_top_section',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        topSectionField.defaultValue = buildTwoColumnTopHTML(oppTranId, oppTitle, customerName, oppStatus, customerEmail, siteAddress);

        // ── Hidden fields ────────────────────────────────────────────────────────
        var hiddenOppId = form.addField({
            id: 'custpage_opportunity_id',
            type: serverWidget.FieldType.TEXT,
            label: 'Opportunity ID'
        });
        hiddenOppId.defaultValue = opportunityId;
        hiddenOppId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // ── Search for related Quotes (Estimates) ────────────────────────────────
        var quotes = searchRelatedQuotes(opportunityId);

        if (quotes.length === 0) {
            log.audit('SendQuoteSL.showForm', 'No quotes found for Opportunity ' + opportunityId + ' — displaying banner');

            // v1.4.5: Full-width prominent banner at top of page
            var noQuotesField = form.addField({
                id: 'custpage_no_quotes',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            noQuotesField.defaultValue =
                '<div style="width:100%; padding:24px 28px; background:#fff3cd; border:2px solid #ffc107; border-radius:8px; margin:0 0 20px 0; box-sizing:border-box;">' +
                    '<h3 style="margin:0 0 10px 0; color:#856404; font-size:18px;">⚠️ No Quotes Found</h3>' +
                    '<p style="margin:0 0 8px 0; color:#856404; font-size:14px;">' +
                        'There are no Estimates linked to this Opportunity that have a generated online quote URL.' +
                    '</p>' +
                    '<p style="margin:0 0 8px 0; color:#856404; font-size:14px;">' +
                        'To generate an online quote, go to the Estimate record and click the <strong>Regen quote</strong> button.' +
                    '</p>' +
                    '<p style="margin:0; color:#856404; font-size:13px;">' +
                        '<strong>Troubleshooting:</strong> Ensure the Estimate has the <code>custbody_test_new_quote</code> field populated ' +
                        'and is linked to this Opportunity (ID: ' + escapeHtml(opportunityId) + ').' +
                    '</p>' +
                '</div>';

            form.addButton({
                id: 'custpage_btn_back',
                label: 'Back to Opportunity',
                functionName: 'goBackToOpportunity'
            });

            // Inject minimal client script for the back button
            form.clientScriptModulePath = './nuheat_send_quote_cs.js';

            context.response.writePage(form);
            return;
        }

        // ── Collapsible User Instructions ─────────────────────────────────────────
        var instructionsField = form.addField({
            id: 'custpage_instructions',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Instructions'
        });
        instructionsField.defaultValue = buildInstructionsHTML(quotes.length);

        // ── Group quotes by type ──────────────────────────────────────────────────
        var quotesByType = {};
        QUOTE_TYPE_ORDER.forEach(function (type) {
            quotesByType[type] = [];
        });

        quotes.forEach(function (q) {
            var type = q.quoteTypeDisplay;
            if (quotesByType[type]) {
                quotesByType[type].push(q);
            } else {
                quotesByType['Other'].push(q);
            }
        });

        log.debug('SendQuoteSL.showForm', 'Quote counts by type — ' +
            QUOTE_TYPE_ORDER.map(function (t) { return t + ': ' + quotesByType[t].length; }).join(', '));

        // ── Create separate sublists for each quote type ──────────────────────────
        QUOTE_TYPE_ORDER.forEach(function (quoteType) {
            var typeQuotes = quotesByType[quoteType];

            if (typeQuotes.length === 0) {
                return; // Skip empty types
            }

            var slug = QUOTE_TYPE_SLUGS[quoteType];

            // v1.3.0: Removed green/teal section header divs — sublists display directly

            // Create sublist for this type
            var sublist = form.addSublist({
                id: 'custpage_quotes_' + slug,
                type: serverWidget.SublistType.LIST,
                label: quoteType + ' Quotes'
            });

            // Checkbox: Include this quote
            sublist.addField({
                id: 'custpage_select',
                type: serverWidget.FieldType.CHECKBOX,
                label: 'Include'
            });

            // Select: Main / Additional
            var categoryField = sublist.addField({
                id: 'custpage_category',
                type: serverWidget.FieldType.SELECT,
                label: 'Category'
            });
            categoryField.addSelectOption({ value: 'main',       text: 'Main Quote' });
            categoryField.addSelectOption({ value: 'additional',  text: 'Additional Option' });

            // Read-only info columns
            sublist.addField({ id: 'custpage_date_created',  type: serverWidget.FieldType.TEXT, label: 'Date Created' });
            sublist.addField({ id: 'custpage_quote_number',  type: serverWidget.FieldType.TEXT, label: 'Quote Number' });
            sublist.addField({ id: 'custpage_quote_title',   type: serverWidget.FieldType.TEXT, label: 'Quote Title' });

            // v1.4.4: Visible description column
            sublist.addField({ id: 'custpage_description_display', type: serverWidget.FieldType.TEXT, label: 'Description' });

            sublist.addField({ id: 'custpage_subtotal',      type: serverWidget.FieldType.TEXT, label: 'System Price' });
            // v1.4.10: Visible discount column between System Price and Total inc VAT
            sublist.addField({ id: 'custpage_discount',      type: serverWidget.FieldType.TEXT, label: 'Discount' });
            sublist.addField({ id: 'custpage_amount',        type: serverWidget.FieldType.TEXT, label: 'Total inc VAT' });

            // v1.4.4: Reduced URL column width
            var urlField = sublist.addField({ id: 'custpage_quote_url', type: serverWidget.FieldType.TEXT, label: 'URL' });
            urlField.updateDisplaySize({ height: 1, width: 20 });

            // Hidden: internal ID for processing
            var hiddenId = sublist.addField({
                id: 'custpage_quote_id',
                type: serverWidget.FieldType.TEXT,
                label: 'Quote Internal ID'
            });
            hiddenId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // Hidden: quote type for submission processing
            var hiddenType = sublist.addField({
                id: 'custpage_quote_type',
                type: serverWidget.FieldType.TEXT,
                label: 'Quote Type'
            });
            hiddenType.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // v1.4.3: Hidden: discount total for master proposal pricing
            var hiddenDiscount = sublist.addField({
                id: 'custpage_discount_total',
                type: serverWidget.FieldType.TEXT,
                label: 'Discount Total'
            });
            hiddenDiscount.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // v1.4.3: Hidden: tax (VAT) total for master proposal pricing
            var hiddenTax = sublist.addField({
                id: 'custpage_tax_total',
                type: serverWidget.FieldType.TEXT,
                label: 'Tax Total'
            });
            hiddenTax.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // v1.4.2: Hidden: quote description for master proposal
            var hiddenDesc = sublist.addField({
                id: 'custpage_quote_description',
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Quote Description'
            });
            hiddenDesc.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // ── Populate sublist rows ──────────────────────────────────────────────
            for (var i = 0; i < typeQuotes.length; i++) {
                var q = typeQuotes[i];

                sublist.setSublistValue({ id: 'custpage_select',       line: i, value: 'F' });
                sublist.setSublistValue({ id: 'custpage_category',     line: i, value: 'main' });
                sublist.setSublistValue({ id: 'custpage_date_created', line: i, value: q.dateCreated });
                sublist.setSublistValue({ id: 'custpage_quote_number', line: i, value: q.tranId });
                sublist.setSublistValue({ id: 'custpage_quote_title',  line: i, value: q.title });

                // v1.4.4: Set visible description (strip HTML tags for display, truncate if long)
                var descText = (q.description || '').replace(/<[^>]*>/g, '').trim();
                if (descText.length > 80) descText = descText.substring(0, 80) + '...';
                sublist.setSublistValue({ id: 'custpage_description_display', line: i, value: descText || '—' });

                sublist.setSublistValue({ id: 'custpage_subtotal',     line: i, value: q.subtotal });
                // v1.4.10: Populate visible discount column
                var discountDisplay = q.discountTotal || '£0.00';
                sublist.setSublistValue({ id: 'custpage_discount',     line: i, value: discountDisplay });
                sublist.setSublistValue({ id: 'custpage_amount',       line: i, value: q.amount });
                sublist.setSublistValue({ id: 'custpage_quote_url',    line: i, value: q.quoteUrl });
                sublist.setSublistValue({ id: 'custpage_quote_id',     line: i, value: q.id });
                sublist.setSublistValue({ id: 'custpage_quote_type',   line: i, value: q.quoteTypeDisplay });
                sublist.setSublistValue({ id: 'custpage_discount_total', line: i, value: q.discountTotal || '£0.00' });  // v1.4.3
                sublist.setSublistValue({ id: 'custpage_tax_total',      line: i, value: q.taxTotal || '£0.00' });       // v1.4.3
                if (q.description) {
                    sublist.setSublistValue({ id: 'custpage_quote_description', line: i, value: q.description });  // v1.4.2
                }
            }
        });

        // ── Contact Selector (v1.5.0) ────────────────────────────────────────────
        // Dropdown populated from Opportunity contact sublist.
        // Selecting a contact with an email populates the To field via fieldChanged in the CS.
        // Option value = contact email address (empty string for contacts with no email).
        var contactField = form.addField({
            id:    'custpage_contact_selector',
            type:  serverWidget.FieldType.SELECT,
            label: 'Select Contact'
        });
        contactField.addSelectOption({ value: '', text: '-- Select a contact to populate email --' });
        contacts.forEach(function (c) {
            var label = c.email ? c.name + ' (' + c.email + ')' : c.name + ' (no email)';
            contactField.addSelectOption({ value: c.email, text: label });
        });

        // ── Email Fields (v1.4.4: rendered inside grey box via inline HTML, hidden NS fields carry values) ──
        var hiddenEmailTo = form.addField({
            id: 'custpage_email_to',
            type: serverWidget.FieldType.TEXT,
            label: 'Email To'
        });
        hiddenEmailTo.defaultValue = customerEmail;
        hiddenEmailTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        var hiddenEmailCc = form.addField({
            id: 'custpage_email_cc',
            type: serverWidget.FieldType.TEXT,
            label: 'Email CC'
        });
        hiddenEmailCc.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        var hiddenEmailBcc = form.addField({
            id: 'custpage_email_bcc',
            type: serverWidget.FieldType.TEXT,
            label: 'Email BCC'
        });
        hiddenEmailBcc.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // ── Buttons (v1.4.4: icons removed) ─────────────────────────────────────
        form.addSubmitButton({ label: 'Generate & Send' });

        form.addButton({
            id: 'custpage_btn_preview',
            label: 'Preview Proposal',
            functionName: 'previewProposal'
        });

        form.addButton({
            id: 'custpage_btn_cancel',
            label: 'Cancel',
            functionName: 'goBackToOpportunity'
        });

        // Client script for button handlers
        form.clientScriptModulePath = './nuheat_send_quote_cs.js';

        // ── Render ───────────────────────────────────────────────────────────────
        context.response.writePage(form);
    }

    // ─── POST: Handle form submission ─────────────────────────────────────────────

    /**
     * Processes the submitted form — extracts selected quotes from all type-based sublists,
     * generates the proposal, sends the email, and shows the success page.
     */
    function handleFormSubmission(context) {
        var request       = context.request;
        var opportunityId = request.parameters.custpage_opportunity_id;

        // Get email fields
        var emailTo  = request.parameters.custpage_email_to  || '';
        var emailCc  = request.parameters.custpage_email_cc  || '';
        var emailBcc = request.parameters.custpage_email_bcc || '';

        log.audit('SendQuoteSL.handleSubmission', 'Opportunity: ' + opportunityId +
            ' | To: ' + emailTo + ' | CC: ' + emailCc + ' | BCC: ' + emailBcc);

        var selectedQuotes   = [];
        var mainQuotes       = [];
        var additionalQuotes = [];

        // Loop through each quote type sublist
        var typeSlugs = ['underfloor_heating', 'heat_pump', 'solar', 'other'];

        typeSlugs.forEach(function (slug) {
            var sublistId = 'custpage_quotes_' + slug;
            var lineCount = request.getLineCount({ group: sublistId });

            if (lineCount < 0) {
                return; // Sublist doesn't exist
            }

            log.debug('SendQuoteSL.handleSubmission', 'Processing sublist: ' + sublistId + ' | Lines: ' + lineCount);

            for (var i = 0; i < lineCount; i++) {
                var isSelected = request.getSublistValue({ group: sublistId, name: 'custpage_select', line: i });

                if (isSelected === 'T') {
                    var quoteId  = request.getSublistValue({ group: sublistId, name: 'custpage_quote_id', line: i });
                    var category = request.getSublistValue({ group: sublistId, name: 'custpage_category',  line: i });
                    var tranId   = request.getSublistValue({ group: sublistId, name: 'custpage_quote_number', line: i });
                    var title    = request.getSublistValue({ group: sublistId, name: 'custpage_quote_title', line: i });
                    var qType    = request.getSublistValue({ group: sublistId, name: 'custpage_quote_type', line: i });
                    var amount       = request.getSublistValue({ group: sublistId, name: 'custpage_amount', line: i });
                    var subtotal     = request.getSublistValue({ group: sublistId, name: 'custpage_subtotal', line: i });
                    var discountTotal = request.getSublistValue({ group: sublistId, name: 'custpage_discount_total', line: i }) || '';  // v1.4.3
                    var taxTotal     = request.getSublistValue({ group: sublistId, name: 'custpage_tax_total', line: i }) || '';        // v1.4.3
                    var quoteUrl     = request.getSublistValue({ group: sublistId, name: 'custpage_quote_url', line: i });
                    var description  = request.getSublistValue({ group: sublistId, name: 'custpage_quote_description', line: i }) || '';  // v1.4.2

                    var entry = {
                        quoteId:       quoteId,
                        tranId:        tranId,
                        title:         title,
                        quoteType:     qType,
                        amount:        amount,
                        subtotal:      subtotal,
                        discountTotal: discountTotal,   // v1.4.3: Discount total from NS discounttotal field
                        taxTotal:      taxTotal,        // v1.4.3: VAT total from NS taxtotal field
                        quoteUrl:      quoteUrl,
                        category:      category,
                        description:   description      // v1.4.2: For master proposal HTML rendering
                    };

                    selectedQuotes.push(entry);

                    if (category === 'main') {
                        mainQuotes.push(entry);
                    } else {
                        additionalQuotes.push(entry);
                    }
                }
            }
        });

        log.audit('SendQuoteSL.handleSubmission', 'Selected: ' + selectedQuotes.length +
            ' | Main: ' + mainQuotes.length + ' | Additional: ' + additionalQuotes.length);

        // ── Validation ───────────────────────────────────────────────────────────
        if (selectedQuotes.length === 0) {
            showErrorPage(context, 'No quotes were selected. Please go back and select at least one quote to include in the proposal.');
            return;
        }

        if (mainQuotes.length === 0) {
            showErrorPage(context, 'No Main Quote selected. Please go back and ensure at least one quote is categorised as "Main Quote".');
            return;
        }

        if (!emailTo.trim()) {
            showErrorPage(context, 'No recipient email address provided. Please go back and enter an email address in the "To" field.');
            return;
        }

        // ── Generate Master Proposal ──────────────────────────────────────────────
        var proposalResult;
        try {
            proposalResult = masterProposal.generateMasterProposal(opportunityId, selectedQuotes);
            log.audit('SendQuoteSL.handleSubmission', 'Proposal generated — File ID: ' + proposalResult.fileId +
                ' | URL: ' + proposalResult.proposalUrl);

            if (!proposalResult.success) {
                showErrorPage(context, 'Proposal generation failed: ' + (proposalResult.error || 'Unknown error') + '. Please try again.');
                return;
            }
        } catch (genErr) {
            log.error('SendQuoteSL.handleSubmission', 'Proposal generation failed: ' + genErr.message + '\n' + JSON.stringify(genErr));
            showErrorPage(context, 'Proposal generation failed: ' + genErr.message + '. Please try again or contact your administrator.');
            return;
        }

        // ── Send Email ───────────────────────────────────────────────────────────
        var emailResult = { success: false, error: '' };
        try {
            emailResult = sendProposalEmail(opportunityId, proposalResult.proposalUrl, emailTo, emailCc, emailBcc);
        } catch (emailErr) {
            log.error('SendQuoteSL.handleSubmission', 'Email sending failed: ' + emailErr.message);
            emailResult = { success: false, error: emailErr.message };
        }

        // ── Show Success Page ────────────────────────────────────────────────────
        showSuccessPage(context, opportunityId, mainQuotes, additionalQuotes, proposalResult, {
            sent:    emailResult.success,
            error:   emailResult.error,
            to:      emailTo,
            cc:      emailCc,
            bcc:     emailBcc
        });
    }

    // ─── Email Sending ────────────────────────────────────────────────────────────

    /**
     * Sends the proposal email to specified recipients and logs it to the Opportunity.
     *
     * @param {string} opportunityId - Opportunity internal ID
     * @param {string} proposalUrl - Public URL to the generated proposal
     * @param {string} toAddresses - Comma-separated To addresses
     * @param {string} ccAddresses - Comma-separated CC addresses (optional)
     * @param {string} bccAddresses - Comma-separated BCC addresses (optional)
     * @returns {Object} { success: boolean, error: string }
     */
    function sendProposalEmail(opportunityId, proposalUrl, toAddresses, ccAddresses, bccAddresses) {
        log.audit('SendQuoteSL.sendEmail', 'Sending email for Opportunity ' + opportunityId);

        // Load opportunity data for email content
        var oppData = masterProposal.loadOpportunityData(opportunityId);

        // Determine sender — use sales rep if available, otherwise current user
        var senderId = oppData.salesRep.id || runtime.getCurrentUser().id;
        if (!senderId) {
            senderId = runtime.getCurrentUser().id;
        }

        var toList  = parseEmails(toAddresses);
        var ccList  = parseEmails(ccAddresses);
        var bccList = parseEmails(bccAddresses);

        if (toList.length === 0) {
            throw new Error('No valid recipient email addresses provided.');
        }

        var subject = 'Your quote for ' + (oppData.quoteEmailRef || oppData.title || '') + ' (' + oppData.tranId + ')';

        // Build professional HTML email body
        var body = buildEmailBody(oppData, proposalUrl);

        log.debug('SendQuoteSL.sendEmail', 'Sender: ' + senderId + ' | To: ' + toList.join(', ') +
            ' | CC: ' + ccList.join(', ') + ' | BCC: ' + bccList.join(', '));

        // Send the email
        var emailParams = {
            author:     senderId,
            recipients: toList,
            subject:    subject,
            body:       body,
            relatedRecords: {
                entityId:      oppData.customerId || undefined,
                transactionId: opportunityId
            }
        };

        if (ccList.length > 0) {
            emailParams.cc = ccList;
        }
        if (bccList.length > 0) {
            emailParams.bcc = bccList;
        }

        email.send(emailParams);

        log.audit('SendQuoteSL.sendEmail', 'Email sent successfully to ' + toList.join(', ') +
            ' | Related to Opportunity ' + opportunityId);

        return { success: true, error: '' };
    }

    /**
     * Builds the HTML email body using the Nu-Heat branded email template.
     * Template source: Chamaileon-designed email (QUOTE_ New quote_2026-3-17.html)
     *
     * Merge Tag Mapping:
     *   {{QUOTE_EMAIL_REF}}  → oppData.quoteEmailRef (custbody_quote_email_ref)
     *   {{TRAN_ID}}          → oppData.tranId (Opportunity transaction ID)
     *   {{SALES_REP_NAME}}   → oppData.salesRep.name (Account Manager name)
     *   {{SALES_REP_EMAIL}}  → oppData.salesRep.email (Account Manager email)
     *   {{SALES_REP_PHONE}}  → oppData.salesRep.phone (Account Manager phone)
     *   {{PROPOSAL_URL}}     → proposalUrl (link to the master proposal)
     *
     * @param {Object} oppData - Opportunity data from loadOpportunityData()
     * @param {string} proposalUrl - Public URL to the generated master proposal
     * @returns {string} Complete HTML email body
     */
    function buildEmailBody(oppData, proposalUrl) {
        // Resolve merge tag values with fallbacks for missing data
        var quoteEmailRef = escapeHtml(oppData.quoteEmailRef || oppData.title || '');
        var tranId        = escapeHtml(oppData.tranId || '');
        var salesRepName  = escapeHtml(oppData.salesRep.name || 'Your Account Manager');
        var salesRepEmail = escapeHtml(oppData.salesRep.email || 'info@nu-heat.co.uk');
        var salesRepPhone = escapeHtml(oppData.salesRep.phone || '01404 540604');
        var safeProposalUrl = escapeHtml(proposalUrl || '');

        // Nu-Heat branded email template (Chamaileon design)
        var template = '' +
            '<!DOCTYPE html>\n' +
            '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n' +
            '<head>\n' +
            '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
            '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
            '<meta name="x-apple-disable-message-reformatting">\n' +
            '<meta name="format-detection" content="telephone=no">\n' +
            '<title>Your quote for {{QUOTE_EMAIL_REF}} ({{TRAN_ID}})</title>\n' +
            '\n' +
            '<link href="https://www.nu-heat.co.uk/wp-content/themes/nu-heat/assets/fonts/calibri/calibri-font.css" rel="stylesheet" type="text/css">\n' +
            '<!--##custom-font-resource##-->\n' +
            '<!--[if gte mso 16]>\n' +
            '<xml>\n' +
            '<o:OfficeDocumentSettings>\n' +
            '<o:AllowPNG/>\n' +
            '<o:PixelsPerInch>96</o:PixelsPerInch>\n' +
            '</o:OfficeDocumentSettings>\n' +
            '</xml>\n' +
            '<![endif]-->\n' +
            '<style>\n' +
            'html,body,table,tbody,tr,td,div,p,ul,ol,li,h1,h2,h3,h4,h5,h6 {\n' +
            'margin: 0;\n' +
            'padding: 0;\n' +
            '}\n' +
            '\n' +
            'body {\n' +
            '-ms-text-size-adjust: 100%;\n' +
            '-webkit-text-size-adjust: 100%;\n' +
            '}\n' +
            '\n' +
            'table {\n' +
            'border-spacing: 0;\n' +
            'mso-table-lspace: 0pt;\n' +
            'mso-table-rspace: 0pt;\n' +
            '}\n' +
            '\n' +
            'table td {\n' +
            'border-collapse: collapse;\n' +
            '}\n' +
            '\n' +
            'h1,h2,h3,h4,h5,h6 {\n' +
            'font-family: Arial;\n' +
            '}\n' +
            '\n' +
            '.ExternalClass {\n' +
            'width: 100%;\n' +
            '}\n' +
            '\n' +
            '.ExternalClass,\n' +
            '.ExternalClass p,\n' +
            '.ExternalClass span,\n' +
            '.ExternalClass font,\n' +
            '.ExternalClass td,\n' +
            '.ExternalClass div {\n' +
            'line-height: 100%;\n' +
            '}\n' +
            '\n' +
            '/* Outermost container in Outlook.com */\n' +
            '.ReadMsgBody {\n' +
            'width: 100%;\n' +
            '}\n' +
            '\n' +
            'img {\n' +
            '-ms-interpolation-mode: bicubic;\n' +
            '}\n' +
            '\n' +
            '</style>\n' +
            '\n' +
            '<style>\n' +
            'a[x-apple-data-detectors=true]{\n' +
            'color: inherit !important;\n' +
            'text-decoration: inherit !important;\n' +
            '}\n' +
            '\n' +
            'u + #body a {\n' +
            'color: inherit;\n' +
            'text-decoration: inherit !important;\n' +
            'font-size: inherit;\n' +
            'font-family: inherit;\n' +
            'font-weight: inherit;\n' +
            'line-height: inherit;\n' +
            '}\n' +
            '\n' +
            'a, a:link, .no-detect-local a, .appleLinks a {\n' +
            'color: inherit !important;\n' +
            'text-decoration: inherit;\n' +
            '}\n' +
            '</style>\n' +
            '\n' +
            '<style>\n' +
            '\n' +
            '.width600 {\n' +
            'width: 600px;\n' +
            'max-width: 100%;\n' +
            '}\n' +
            '\n' +
            '@media all and (max-width: 599px) {\n' +
            '.width600 {\n' +
            'width: 100% !important;\n' +
            '}\n' +
            '}\n' +
            '\n' +
            '@media screen and (min-width: 600px) {\n' +
            '.hide-on-desktop {\n' +
            'display: none !important;\n' +
            '}\n' +
            '}\n' +
            '\n' +
            '@media all and (max-width: 599px),\n' +
            'only screen and (max-device-width: 599px) {\n' +
            '.main-container {\n' +
            'width: 100% !important;\n' +
            '}\n' +
            '\n' +
            '.col {\n' +
            'width: 100%;\n' +
            '}\n' +
            '\n' +
            '.fluid-on-mobile {\n' +
            'width: 100% !important;\n' +
            'height: auto !important;\n' +
            'text-align:center;\n' +
            '}\n' +
            '\n' +
            '.fluid-on-mobile img {\n' +
            'width: 100% !important;\n' +
            '}\n' +
            '\n' +
            '.hide-on-mobile {\n' +
            'display:none !important;\n' +
            'width:0px !important;\n' +
            'height:0px !important;\n' +
            'overflow:hidden;\n' +
            '}\n' +
            '}\n' +
            '\n' +
            '</style>\n' +
            '\n' +
            '<!--[if gte mso 9]>\n' +
            '<style>\n' +
            '\n' +
            '.col {\n' +
            'width: 100%;\n' +
            '}\n' +
            '\n' +
            '.width600 {\n' +
            'width: 600px;\n' +
            '}\n' +
            '\n' +
            '.width170 {\n' +
            'width: 170px;\n' +
            'height: auto;\n' +
            '}\n' +
            '.width600 {\n' +
            'width: 600px;\n' +
            'height: auto;\n' +
            '}\n' +
            '.width125 {\n' +
            'width: 125px;\n' +
            'height: auto;\n' +
            '}\n' +
            '.width167 {\n' +
            'width: 167px;\n' +
            'height: auto;\n' +
            '}\n' +
            '.width22 {\n' +
            'width: 22px;\n' +
            'height: auto;\n' +
            '}\n' +
            '\n' +
            '.hide-on-desktop {\n' +
            'display: none;\n' +
            '}\n' +
            '\n' +
            '.hide-on-desktop table {\n' +
            'mso-hide: all;\n' +
            '}\n' +
            '\n' +
            '.hide-on-desktop div {\n' +
            'mso-hide: all;\n' +
            '}\n' +
            '\n' +
            '.nounderline { text-decoration: none; }\n' +
            '\n' +
            '.mso-font-fix-arial { font-family: Arial, sans-serif; }\n' +
            '</style>\n' +
            '<![endif]-->\n' +
            '\n' +
            '</head>\n' +
            '<body id="body" leftmargin="0" marginwidth="0" topmargin="0" marginheight="0" offset="0" style="font-family:Arial, sans-serif; font-size:0px;margin:0;padding:0;background-color:#ffffff;">\n' +
            '<span style="display:none;font-size:0px;line-height:0px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">Here\'s your Nu-Heat quote.</span>\n' +
            '<style>\n' +
            '@media screen and (min-width: 600px) {\n' +
            '.hide-on-desktop {\n' +
            'display: none;\n' +
            '}\n' +
            '}\n' +
            '@media all and (max-width: 599px) {\n' +
            '.hide-on-mobile {\n' +
            'display:none !important;\n' +
            'width:0px !important;\n' +
            'height:0px !important;\n' +
            'overflow:hidden;\n' +
            '}\n' +
            '.main-container {\n' +
            'width: 100% !important;\n' +
            '}\n' +
            '.col {\n' +
            'width: 100%;\n' +
            '}\n' +
            '.fluid-on-mobile {\n' +
            'width: 100% !important;\n' +
            'height: auto !important;\n' +
            'text-align:center;\n' +
            '}\n' +
            '.fluid-on-mobile img {\n' +
            'width: 100% !important;\n' +
            '}\n' +
            '}\n' +
            '</style>\n' +
            '<div style="background-color:#ffffff;">\n' +
            '<table height="100%" width="100%" cellpadding="0" cellspacing="0" border="0">\n' +
            '<tr>\n' +
            '<td valign="top" align="left">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td width="100%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td align="center" width="100%">\n' +
            '<!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table class="width600 main-container" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">\n' +
            '<tr>\n' +
            '<td width="100%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" class="mcol">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding:0;mso-cellspacing:0in;">\n' +
            '<!--[if gte mso 9]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><![endif]-->\n' +
            '<!--[if gte mso 9]><td valign="top" style="padding:0;width:100px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="16.666666666666668%" height="0" class="col hide-on-mobile" style="float:left;min-width:100px;height:1px;" align="left">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="line-height:1px;padding:0;font-size:0px;">&nbsp;</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:236.99999999999997px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="39.49999999999999%" class="col hide-on-mobile" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td style="padding-right:10px;padding-left:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:10px solid transparent;">\n' +
            '<tr>\n' +
            '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:73px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="12.166666666666666%" height="0" class="col hide-on-mobile" style="float:left;min-width:73px;height:1px;" align="left">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="line-height:1px;padding:0;font-size:0px;">&nbsp;</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:190px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="31.666666666666668%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="190" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center" style="padding:10px;"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698400306920_Nu-Heat%20Master%20logo%20green%20-%20transparent%20v3.png" width="170" height="73" alt="Nu-Heat Underfloor Heating & Renewables" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width170" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]-->\n' +
            '<!--[if gte mso 9]></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top"><table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#59315f" style="background-color:#59315f;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding:15px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding:10px;"><h1 style="font-family:Calibri, Arial, sans-serif;font-size:40px;color:#ffffff;font-weight:normal;line-height:43px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:1px;text-align:center;padding:0;margin:0;"><span class="mso-font-fix-arial"><b>Thank you for requesting a quote</b></span></h1>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:20px;color:#ffffff;font-weight:normal;line-height:25px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="margin-left:0px;margin-top:0px;margin-right:0px;margin-bottom:0px;padding:0;"><span class="mso-font-fix-arial">Project: {{QUOTE_EMAIL_REF}}</span></p>\n' +
            '<p style="padding:0;margin:0;"><span class="mso-font-fix-arial">{{TRAN_ID}}</span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="fluid-on-mobile img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1613738610524_Order%20conformation.jpg" width="600" height="337" alt="Thank you for choosing Nu-Heat" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width600" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:15px;padding-right:10px;padding-bottom:15px;padding-left:10px;"><h1 style="font-family:Calibri, Arial, sans-serif;font-size:32px;color:#59315f;font-weight:normal;line-height:35px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:1px;text-align:center;padding:0;margin:0;"><span class="mso-font-fix-arial"><strong>Your quote</strong></span></h1>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;padding-right:10px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#131313;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:3px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><strong>You can view your tailored quote(s) below. This is provided subject to our <a href="https://www.nu-heat.co.uk/wp-content/uploads/2021/04/Nu-Heat-TCs-Consumer-and-Trade.pdf" target="_blank" style="text-decoration:underline !important;color:#59315f !important;"><font style="color:#59315f;">Terms and Conditions</font></a>.</strong></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center" style="padding:20px;">\n' +
            '<!-- Button for non-Outlook clients (v1.4.1: fixed duplication, updated text) -->\n' +
            '<!--[if !mso]><!-- -->\n' +
            '<a href="{{PROPOSAL_URL}}" target="_blank" style="display:inline-block; text-decoration:none;" class="fluid-on-mobile">\n' +
            '<span>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">\n' +
            '<tr>\n' +
            '<td align="center" style="padding:15px;">\n' +
            '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">\n' +
            '<font style="color:#3e3b39;" class="button">\n' +
            '<span><b>VIEW YOUR QUOTE(S) HERE</b></span>\n' +
            '</font>\n' +
            '</span>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</span>\n' +
            '</a>\n' +
            '<!--<![endif]-->\n' +
            '<!-- Button for Outlook/MSO clients only (v1.4.1: uses conditional comment instead of CSS display:none to prevent duplication) -->\n' +
            '<!--[if mso]>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">\n' +
            '<tr>\n' +
            '<td align="center" style="padding:15px;">\n' +
            '<a href="{{PROPOSAL_URL}}" target="_blank" style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;text-decoration:none;text-align:center;">\n' +
            '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">\n' +
            '<font style="color:#3e3b39;" class="button">\n' +
            '<span><b>VIEW YOUR QUOTE(S) HERE</b></span>\n' +
            '</font>\n' +
            '</span>\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;"><table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#d8d8d8" style="background-color:#d8d8d8;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;padding-right:10px;padding-bottom:20px;padding-left:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;padding-right:10px;padding-left:10px;"><h1 style="font-family:Calibri, Arial, sans-serif;font-size:32px;color:#aa0061;font-weight:normal;line-height:35px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:1px;text-align:center;padding:0;margin:0;"><span style="font-family: Arial, Helvetica Neue, Helvetica, sans-serif; font-size: 31px; color: #aa0061; font-weight: normal; line-height: 40px; padding: 0px; margin: 0px;" class="mso-font-fix-arial"><span><strong>Why choose Nu-Heat?</strong></span></span></h1>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" class="mcol">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding:0;mso-cellspacing:0in;">\n' +
            '<!--[if gte mso 9]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><![endif]-->\n' +
            '<!--[if gte mso 9]><td valign="top" style="padding:0;width:145px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="25%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:15px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:20px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;"><strong>Bespoke heating design</strong></span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;padding-bottom:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="125" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698665508018_Design.png" width="125" height="125" alt="Bespoke heating design" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width125" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:22px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;">We tailor each system to the property for maximum performance</span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:145px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="25%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:15px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:20px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;"><strong>The heating experts</strong></span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;padding-bottom:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="125" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698665474858_Installer%20skills%202.png" width="125" height="125" alt="Heating experts" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width125" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;padding-right:10px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:22px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;">Our systems heat more than 80,000 homes across the country!</span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:145px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="25%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:15px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:20px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;"><strong>Lifetime support</strong></span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;padding-bottom:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="125" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698665569030_Lifetime%20tech%20support.png" width="125" height="125" alt="Lifetime support" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width125" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;padding-right:10px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:22px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;">We support our systems for life, so you can always call on us if needed</span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:145px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="25%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:15px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:20px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;"><strong>Award-winning service</strong></span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;padding-bottom:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="125" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698665474762_Award%20winning%20customer%20service.png" width="125" height="125" alt="Award-winning service" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width125" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;padding-right:10px;padding-bottom:5px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:22px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;">Proud to hold a Distinction from the Institute of Customer Service</span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]-->\n' +
            '<!--[if gte mso 9]></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:20px;padding-right:10px;padding-bottom:10px;padding-left:10px;"><h1 style="font-family:Calibri, Arial, sans-serif;font-size:32px;color:#59315f;font-weight:normal;line-height:35px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:1px;text-align:center;padding:0;margin:0;"><span style="font-family: Arial, Helvetica Neue, Helvetica, sans-serif; font-size: 31px; color: #59315f; font-weight: normal; line-height: 40px; padding: 0px; margin: 0px;" class="mso-font-fix-arial"><span><strong>What\'s next?</strong></span></span></h1>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-bottom:15px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:3px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;">To discuss&nbsp;your quote or place your order please contact your Account Manager below.</span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center" style="padding-bottom:10px;"><!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="fluid-on-mobile img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1648042888934_Account%20manager.jpg" width="600" height="337" alt="Nu-Heat team" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width600" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:5px;"><table cellpadding="0" cellspacing="0" border="0" width="100%" class="mcol">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding:0;mso-cellspacing:0in;">\n' +
            '<!--[if gte mso 9]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><![endif]-->\n' +
            '<!--[if gte mso 9]><td valign="top" style="padding:0;width:300px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="50%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center" style="padding:10px;">\n' +
            '<!--[if !mso]><!-- -->\n' +
            '<a href="tel:{{SALES_REP_PHONE}}" target="_blank" style="display:inline-block; text-decoration:none;" class="fluid-on-mobile">\n' +
            '<span>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">\n' +
            '<tr>\n' +
            '<td align="center" style="padding:15px;">\n' +
            '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:24px;mso-text-raise:3px;letter-spacing: normal;">\n' +
            '<font style="color:#3e3b39;" class="button">\n' +
            '<span><strong>CLICK TO CALL</strong></span>\n' +
            '</font>\n' +
            '</span>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</span>\n' +
            '</a>\n' +
            '<!--<![endif]-->\n' +
            '<div style="display:none; mso-hide: none;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">\n' +
            '<tr>\n' +
            '<td align="center" style="padding:15px;">\n' +
            '<a href="tel:{{SALES_REP_PHONE}}" target="_blank" style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:24px;mso-text-raise:3px;letter-spacing: normal;text-decoration:none;text-align:center;">\n' +
            '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:24px;mso-text-raise:3px;letter-spacing: normal;">\n' +
            '<font style="color:#3e3b39;" class="button">\n' +
            '<span><strong>CLICK TO CALL</strong></span>\n' +
            '</font>\n' +
            '</span>\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:300px;"><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="50%" class="col" align="left" style="float:left;">\n' +
            '<tr>\n' +
            '<td valign="top" width="100%" style="padding:0;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center" style="padding:10px;">\n' +
            '<!--[if !mso]><!-- -->\n' +
            '<a href="mailto:{{SALES_REP_EMAIL}}" style="display:inline-block; text-decoration:none;" class="fluid-on-mobile">\n' +
            '<span>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">\n' +
            '<tr>\n' +
            '<td align="center" style="padding:15px;">\n' +
            '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:24px;mso-text-raise:3px;letter-spacing: normal;">\n' +
            '<font style="color:#3e3b39;" class="button">\n' +
            '<span><strong>SEND AN EMAIL</strong></span>\n' +
            '</font>\n' +
            '</span>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</span>\n' +
            '</a>\n' +
            '<!--<![endif]-->\n' +
            '<div style="display:none; mso-hide: none;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">\n' +
            '<tr>\n' +
            '<td align="center" style="padding:15px;">\n' +
            '<a href="mailto:{{SALES_REP_EMAIL}}" style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:24px;mso-text-raise:3px;letter-spacing: normal;text-decoration:none;text-align:center;">\n' +
            '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:24px;mso-text-raise:3px;letter-spacing: normal;">\n' +
            '<font style="color:#3e3b39;" class="button">\n' +
            '<span><strong>SEND AN EMAIL</strong></span>\n' +
            '</font>\n' +
            '</span>\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td><![endif]-->\n' +
            '<!--[if gte mso 9]></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td style="padding-top:20px;padding-right:10px;padding-bottom:10px;padding-left:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #a9a9a9;">\n' +
            '<tr>\n' +
            '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-top:10px;padding-right:10px;padding-bottom:20px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:3px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><span style="padding: 0px; margin: 0px;">If you have any questions, you can contact your Account Manager, {{SALES_REP_NAME}}, via {{SALES_REP_EMAIL}} or {{SALES_REP_PHONE}}.</span></span></p></div>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">\n' +
            '<tr>\n' +
            '<td align="center" width="100%">\n' +
            '<!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table class="width600 main-container" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">\n' +
            '<tr>\n' +
            '<td width="100%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-bottom:10px;"><table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00857d" style="background-color:#00857d;"><tr><td>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" style="padding-bottom:20px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="167" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604422010305_Nu-Heat%20Master%20logo%20wht%20on%20green.png" width="167" height="94" alt="Nu-Heat Underfloor Heating & Renewables" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width167" />\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" width="30%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td style="padding-right:10px;padding-left:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:10px solid transparent;">\n' +
            '<tr>\n' +
            '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '<td valign="top" width="0.8333333333333334%">&nbsp;</td>\n' +
            '<td valign="top" width="7.000000000000003%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><a href="https://www.facebook.com/nuheatuk/" class="imglink" target="_blank">\n' +
            '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502171665_white%20-%20facebook.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '<td valign="top" width="0.8333333333333334%">&nbsp;</td>\n' +
            '<td valign="top" width="7%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><a href="https://www.instagram.com/nuheatufh/" class="imglink" target="_blank">\n' +
            '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502172039_white%20-%20instagram.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '<td valign="top" width="0.8333333333333334%">&nbsp;</td>\n' +
            '<td valign="top" width="7%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><a href="https://www.linkedin.com/company/nu-heat/" class="imglink" target="_blank">\n' +
            '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502171857_white%20-%20linkedin.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '<td valign="top" width="0.8333333333333334%">&nbsp;</td>\n' +
            '<td valign="top" width="7%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><a href="https://twitter.com/nuheatuk" class="imglink" target="_blank">\n' +
            '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502172417_white%20-%20twitter.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '<td valign="top" width="0.8333333333333334%">&nbsp;</td>\n' +
            '<td valign="top" width="7%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->\n' +
            '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">\n' +
            '<tr>\n' +
            '<td valign="top" align="center"><a href="https://youtube.com/channel/UCsfB8s56fcERuaBFovwYnGQ" class="imglink" target="_blank">\n' +
            '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502172308_white%20-%20youtube.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />\n' +
            '</a>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '<td valign="top" width="0.8333333333333334%">&nbsp;</td>\n' +
            '<td valign="top" width="30%">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%">\n' +
            '<tr>\n' +
            '<td style="padding-right:10px;padding-left:10px;">\n' +
            '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:10px solid transparent;">\n' +
            '<tr>\n' +
            '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr></table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '<!--[if gte mso 9]></td></tr></table><![endif]-->\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</td>\n' +
            '</tr>\n' +
            '</table>\n' +
            '</div>\n' +
            '</body>\n' +
            '</html>\n';

        // Replace merge tag placeholders with actual values
        template = template.replace(/\{\{QUOTE_EMAIL_REF\}\}/g, quoteEmailRef);
        template = template.replace(/\{\{TRAN_ID\}\}/g, tranId);
        template = template.replace(/\{\{SALES_REP_NAME\}\}/g, salesRepName);
        template = template.replace(/\{\{SALES_REP_EMAIL\}\}/g, salesRepEmail);
        template = template.replace(/\{\{SALES_REP_PHONE\}\}/g, salesRepPhone);
        template = template.replace(/\{\{PROPOSAL_URL\}\}/g, safeProposalUrl);

        return template;
    }

    // ─── Quote Search ─────────────────────────────────────────────────────────────

    /**
     * Searches for all Estimates linked to the given Opportunity that have
     * a generated online quote URL (custbody_test_new_quote is not empty).
     */
    function searchRelatedQuotes(opportunityId) {
        var quotes = [];

        log.audit('SendQuoteSL.searchRelatedQuotes', 'v1.4.5 — Starting quote search for Opportunity: ' + opportunityId);

        // ── Step 1: Create and run the search ────────────────────────────────────
        // v1.4.5 CRITICAL FIX: Removed 'subtotal', 'discounttotal', 'taxtotal' from search columns.
        // These are NOT valid NetSuite search columns on Estimate records and caused
        // SSS_INVALID_SRCH_COL error. The old try-catch silently returned empty array.
        // Pricing data is now loaded per-record after the search completes.
        var estimateSearch;
        try {
            estimateSearch = search.create({
                type: search.Type.ESTIMATE,
                filters: [
                    ['opportunity', 'anyof', opportunityId],
                    'AND',
                    ['custbody_test_new_quote', 'isnotempty', ''],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'tranid' }),
                    search.createColumn({ name: 'title' }),
                    search.createColumn({ name: 'custbody_quote_type' }),
                    search.createColumn({ name: 'total' }),
                    search.createColumn({ name: 'custbody_test_new_quote' }),
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'custbody_quote_description' })
                ]
            });
            log.debug('SendQuoteSL.searchRelatedQuotes', 'Search created successfully with ' +
                'filters: opportunity=' + opportunityId + ', custbody_test_new_quote isnotempty, mainline=T');
        } catch (searchCreateErr) {
            log.error('SendQuoteSL.searchRelatedQuotes', 'FAILED to create search: ' + searchCreateErr.name +
                ' — ' + searchCreateErr.message + '\nStack: ' + (searchCreateErr.stack || 'N/A'));
            return quotes;
        }

        // ── Step 2: Execute search and process results ───────────────────────────
        var results;
        try {
            var resultSet = estimateSearch.run();
            results = resultSet.getRange({ start: 0, end: 100 });
            log.debug('SendQuoteSL.searchRelatedQuotes', 'Search returned ' + results.length + ' results');
        } catch (searchRunErr) {
            log.error('SendQuoteSL.searchRelatedQuotes', 'FAILED to run search: ' + searchRunErr.name +
                ' — ' + searchRunErr.message + '\nStack: ' + (searchRunErr.stack || 'N/A'));
            return quotes;
        }

        if (!results || results.length === 0) {
            log.audit('SendQuoteSL.searchRelatedQuotes', 'No results returned. Check: ' +
                '(1) Estimates linked to Opportunity ' + opportunityId + ' exist, ' +
                '(2) custbody_test_new_quote has a URL value on those Estimates, ' +
                '(3) Current user has permission to view them.');
            return quotes;
        }

        // ── Step 3: Process each result and load pricing from record ─────────────
        for (var i = 0; i < results.length; i++) {
            try {
                var result = results[i];
                var estimateId = result.getValue({ name: 'internalid' }) || '';

                var rawQuoteType = '';
                try {
                    rawQuoteType = result.getText({ name: 'custbody_quote_type' }) || '';
                } catch (qtErr) {
                    log.debug('SendQuoteSL.searchRelatedQuotes', 'Could not read custbody_quote_type text for result ' + i + ': ' + qtErr.message);
                }
                var quoteTypeDisplay = getQuoteTypeDisplayName(rawQuoteType);

                // v1.4.9 CRITICAL FIX: Use record.load() instead of search.lookupFields().
                // lookupFields does NOT support calculated/summary fields (subtotal, discounttotal,
                // taxtotal) on Estimate records — it silently fails or throws errors.
                // record.load().getValue() reliably returns these standard pricing fields.
                var subtotalVal = '';
                var discountTotalVal = '';
                var taxTotalVal = '';
                var totalVal = '';
                if (estimateId) {
                    try {
                        var estimateRec = record.load({
                            type: record.Type.ESTIMATE,
                            id: estimateId,
                            isDynamic: false
                        });
                        subtotalVal      = estimateRec.getValue({ fieldId: 'subtotal' }) || '';
                        discountTotalVal = estimateRec.getValue({ fieldId: 'discounttotal' }) || '';
                        taxTotalVal      = estimateRec.getValue({ fieldId: 'taxtotal' }) || '';
                        totalVal         = estimateRec.getValue({ fieldId: 'total' }) || '';

                        log.debug('SendQuoteSL.searchRelatedQuotes', 'Pricing loaded via record.load for Estimate ' + estimateId +
                            ': subtotal=' + subtotalVal + ', discount=' + discountTotalVal +
                            ', tax=' + taxTotalVal + ', total=' + totalVal);
                    } catch (pricingErr) {
                        log.debug('SendQuoteSL.searchRelatedQuotes', 'Could not load Estimate record ' + estimateId +
                            ' for pricing: ' + pricingErr.message + ' — will use search total as fallback');
                        // Fallback: use total from search for amount, zeros for discount/tax
                        totalVal = result.getValue({ name: 'total' }) || '';
                    }
                }

                quotes.push({
                    id:               estimateId,
                    dateCreated:      formatDate(result.getValue({ name: 'datecreated' })),
                    tranId:           result.getValue({ name: 'tranid' }) || '',
                    title:            result.getValue({ name: 'title' })  || '(Untitled)',
                    quoteTypeRaw:     rawQuoteType,
                    quoteTypeDisplay: quoteTypeDisplay,
                    subtotal:         formatCurrency(subtotalVal),
                    discountTotal:    formatCurrency(discountTotalVal),
                    taxTotal:         formatCurrency(taxTotalVal),
                    amount:           formatCurrency(totalVal || result.getValue({ name: 'total' })),
                    quoteUrl:         result.getValue({ name: 'custbody_test_new_quote' }) || '',
                    description:      result.getValue({ name: 'custbody_quote_description' }) || ''
                });

                log.debug('SendQuoteSL.searchRelatedQuotes', 'Processed quote ' + (i + 1) + '/' + results.length +
                    ': ID=' + estimateId + ', tranId=' + (result.getValue({ name: 'tranid' }) || '') +
                    ', type=' + rawQuoteType + ' → ' + quoteTypeDisplay);

            } catch (rowErr) {
                log.error('SendQuoteSL.searchRelatedQuotes', 'Error processing result row ' + i + ': ' +
                    rowErr.message + '\nStack: ' + (rowErr.stack || 'N/A'));
                // Continue processing remaining results — don't let one bad row break everything
            }
        }

        log.audit('SendQuoteSL.searchRelatedQuotes', 'v1.4.5 — Successfully processed ' + quotes.length +
            ' of ' + results.length + ' quotes for Opportunity ' + opportunityId);

        return quotes;
    }

    // ─── HTML Builders ────────────────────────────────────────────────────────────

    /**
     * Builds the inline CSS for the form.
     */
    function buildFormCSS() {
        return '<style>' +
            /* v1.3.0: Two-column top layout for Opportunity Details + Email Recipients */
            '.nuheat-top-columns { display: flex; gap: 20px; margin: 10px 0 20px 0; }' +
            '.nuheat-top-col { flex: 1; min-width: 0; }' +
            '.nuheat-summary { background: ' + BRAND.lightBg + '; border: 1px solid ' + BRAND.border + '; border-radius: 8px; padding: 20px; height: 100%; box-sizing: border-box; }' +
            '.nuheat-summary h3 { color: ' + BRAND.primary + '; margin: 0 0 12px 0; font-size: 16px; }' +
            '.nuheat-summary-list { display: flex; flex-direction: column; gap: 6px; }' +
            '.nuheat-summary-item { display: flex; gap: 8px; }' +
            '.nuheat-summary-label { font-weight: 600; color: ' + BRAND.secondary + '; min-width: 120px; }' +
            '.nuheat-summary-value { color: ' + BRAND.textMuted + '; }' +
            '.nuheat-email-info { }' + /* v1.4.8: Removed green border-left shadow */
            /* v1.4.8: Full-width bar instructions styling (below 50/50 layout) */
            '.nuheat-instructions-wrapper { margin: 0 0 20px 0; width: 100%; clear: both; }' +
            '.nuheat-instructions-wrapper details { border: 1px solid ' + BRAND.border + '; border-radius: 6px; overflow: hidden; width: 100%; box-sizing: border-box; }' +
            '.nuheat-instructions-wrapper summary { cursor: pointer; font-weight: 600; font-size: 14px; padding: 12px 16px; background: ' + BRAND.lightBg + '; color: ' + BRAND.secondary + '; user-select: none; list-style: none; }' +
            '.nuheat-instructions-wrapper summary::-webkit-details-marker { display: none; }' +
            '.nuheat-instructions-wrapper summary::before { content: "▶ "; font-size: 11px; margin-right: 6px; display: inline-block; transition: transform 0.2s; }' +
            '.nuheat-instructions-wrapper details[open] summary::before { transform: rotate(90deg); }' +
            '.nuheat-instructions-content { padding: 16px 20px; border-top: 1px solid ' + BRAND.border + '; background: #e8f5f4; }' +
            '.nuheat-instructions-content ol { margin: 8px 0 0 0; padding-left: 20px; }' +
            '.nuheat-instructions-content li { margin-bottom: 4px; color: ' + BRAND.secondary + '; }' +
            '.nuheat-instructions-content .nuheat-note { margin-top: 10px; padding: 8px 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; font-size: 12px; color: #856404; }' +
            /* Badge styles */
            '.nuheat-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }' +
            '.nuheat-badge-active { background: #d4edda; color: #155724; }' +
            /* Success & error pages */
            '.nuheat-success { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 24px; margin: 20px 0; }' +
            '.nuheat-success h3 { color: #155724; margin: 0 0 16px 0; }' +
            '.nuheat-error { background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 24px; margin: 20px 0; }' +
            '.nuheat-error h3 { color: #721c24; margin: 0 0 12px 0; }' +
            /* Confirmation tables */
            '.nuheat-table { width: 100%; border-collapse: collapse; margin: 12px 0; }' +
            '.nuheat-table th { background: ' + BRAND.primary + '; color: ' + BRAND.white + '; padding: 10px 12px; text-align: left; font-size: 13px; }' +
            '.nuheat-table td { padding: 8px 12px; border-bottom: 1px solid ' + BRAND.border + '; font-size: 13px; }' +
            '.nuheat-table tr:nth-child(even) { background: ' + BRAND.lightBg + '; }' +
            /* Email confirmation */
            '.nuheat-email-confirm { background: #e8f5f4; border: 1px solid #b2dfdb; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }' +
            '.nuheat-email-confirm h4 { color: ' + BRAND.primary + '; margin: 0 0 10px 0; font-size: 14px; }' +
            '.nuheat-email-item { font-size: 13px; margin-bottom: 4px; color: #333; }' +
            '.nuheat-email-label { font-weight: 600; display: inline-block; min-width: 50px; }' +
            '.nuheat-email-warn { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }' +
            '.nuheat-email-warn h4 { color: #856404; margin: 0 0 8px 0; font-size: 14px; }' +
            /* Shrink URL column in sublists */
            'td[data-label="URL"], th[data-label="URL"] { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }' +
            '[id$="_custpage_quote_url"] { max-width: 120px; }' +
            '</style>';
    }

    /**
     * Builds the two-column top section with Opportunity Details (left)
     * and Email Recipients with input fields (right) side by side.
     * v1.3.0: Replaces the old full-width Opportunity summary.
     * v1.4.4: Added site address as title, email input fields inside grey box,
     *         removed icons from headings.
     */
    function buildTwoColumnTopHTML(tranId, title, customerName, status, customerEmail, siteAddress) {
        // v1.4.5: Build heading — show site address if available, otherwise show opportunity title/name
        var headingText = siteAddress || title || '';
        var headingHtml = headingText
            ? '<h2 style="color:' + BRAND.secondary + '; margin:0 0 12px 0; font-size:18px; font-weight:700;">' + escapeHtml(headingText) + '</h2>'
            : '';

        return '<div class="nuheat-top-columns">' +
            // Left column: Opportunity Details
            '<div class="nuheat-top-col">' +
                '<div class="nuheat-summary">' +
                    headingHtml +
                    '<h3>Opportunity Details</h3>' +
                    '<div class="nuheat-summary-list">' +
                        '<div class="nuheat-summary-item"><span class="nuheat-summary-label">Opportunity:</span><span class="nuheat-summary-value">' + escapeHtml(tranId) + '</span></div>' +
                        '<div class="nuheat-summary-item"><span class="nuheat-summary-label">Customer:</span><span class="nuheat-summary-value">' + escapeHtml(customerName) + '</span></div>' +
                        '<div class="nuheat-summary-item"><span class="nuheat-summary-label">Title:</span><span class="nuheat-summary-value">' + escapeHtml(title || '(No title)') + '</span></div>' +
                        (siteAddress ? '<div class="nuheat-summary-item"><span class="nuheat-summary-label">Site Address:</span><span class="nuheat-summary-value">' + escapeHtml(siteAddress) + '</span></div>' : '') +
                        '<div class="nuheat-summary-item"><span class="nuheat-summary-label">Status:</span><span class="nuheat-summary-value"><span class="nuheat-badge nuheat-badge-active">' + escapeHtml(status) + '</span></span></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            // Right column: Email Recipients with input fields inside grey box
            '<div class="nuheat-top-col">' +
                '<div class="nuheat-summary nuheat-email-info">' +
                    '<h3>Email Recipients</h3>' +
                    '<p style="color:' + BRAND.textMuted + '; font-size:13px; margin:0 0 12px 0;">' +
                        'Enter recipient email addresses below. Separate multiple addresses with commas.' +
                    '</p>' +
                    // v1.4.4: Email input fields rendered inside the grey box
                    '<div class="nuheat-email-fields">' +
                        '<div style="margin-bottom:8px;">' +
                            '<label style="display:block; font-weight:600; font-size:13px; color:' + BRAND.secondary + '; margin-bottom:3px;">To <span style="color:#c00;">*</span></label>' +
                            '<input type="text" id="custpage_email_to_input" value="' + escapeHtml(customerEmail) + '" ' +
                                'style="width:100%; padding:6px 8px; border:1px solid ' + BRAND.border + '; border-radius:4px; font-size:13px; box-sizing:border-box;" />' +
                        '</div>' +
                        '<div style="margin-bottom:8px;">' +
                            '<label style="display:block; font-weight:600; font-size:13px; color:' + BRAND.secondary + '; margin-bottom:3px;">CC</label>' +
                            '<input type="text" id="custpage_email_cc_input" value="" ' +
                                'style="width:100%; padding:6px 8px; border:1px solid ' + BRAND.border + '; border-radius:4px; font-size:13px; box-sizing:border-box;" />' +
                        '</div>' +
                        '<div style="margin-bottom:4px;">' +
                            '<label style="display:block; font-weight:600; font-size:13px; color:' + BRAND.secondary + '; margin-bottom:3px;">BCC</label>' +
                            '<input type="text" id="custpage_email_bcc_input" value="" ' +
                                'style="width:100%; padding:6px 8px; border:1px solid ' + BRAND.border + '; border-radius:4px; font-size:13px; box-sizing:border-box;" />' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '</div>' +
            // v1.4.4: Script to sync inline email inputs with hidden NetSuite fields on form submit
            '<script>' +
                'document.addEventListener("DOMContentLoaded", function() {' +
                    'function syncEmailFields() {' +
                        'var toInput = document.getElementById("custpage_email_to_input");' +
                        'var ccInput = document.getElementById("custpage_email_cc_input");' +
                        'var bccInput = document.getElementById("custpage_email_bcc_input");' +
                        'var toHidden = document.getElementById("custpage_email_to");' +
                        'var ccHidden = document.getElementById("custpage_email_cc");' +
                        'var bccHidden = document.getElementById("custpage_email_bcc");' +
                        'if (toInput && toHidden) toHidden.value = toInput.value;' +
                        'if (ccInput && ccHidden) ccHidden.value = ccInput.value;' +
                        'if (bccInput && bccHidden) bccHidden.value = bccInput.value;' +
                    '}' +
                    // Sync on every input change
                    '["custpage_email_to_input","custpage_email_cc_input","custpage_email_bcc_input"].forEach(function(id) {' +
                        'var el = document.getElementById(id);' +
                        'if (el) { el.addEventListener("input", syncEmailFields); el.addEventListener("change", syncEmailFields); }' +
                    '});' +
                    // Also sync before form submit
                    'var form = document.getElementById("main_form");' +
                    'if (form) form.addEventListener("submit", syncEmailFields);' +
                '});' +
            '</script>';
    }

    /**
     * Builds the collapsible User Instructions panel.
     */
    function buildInstructionsHTML(quoteCount) {
        return '<div class="nuheat-instructions-wrapper">' +
            '<details>' +
                '<summary>User Instructions</summary>' +
                '<div class="nuheat-instructions-content">' +
                    '<p>' + quoteCount + ' quote' + (quoteCount !== 1 ? 's' : '') + ' found for this Opportunity. Quotes are grouped by type below.</p>' +
                    '<ol>' +
                        '<li><strong>Tick "Include"</strong> for each quote you want in the proposal.</li>' +
                        '<li><strong>Set Category</strong> — choose "Main Quote" for the primary recommendation or "Additional Option" for alternatives.</li>' +
                        '<li><strong>Enter email recipients</strong> in the Email Recipients section above.</li>' +
                        '<li>Click <strong>Preview Proposal</strong> to review before sending (opens in a new tab), or <strong>Generate &amp; Send</strong> to generate the proposal and email it to the customer.</li>' +
                    '</ol>' +
                    '<div class="nuheat-note">💡 <strong>Note:</strong> Preview is optional — you can generate and send directly. "Other" quote type denotes an unsupported or unrecognised quote type.</div>' +
                '</div>' +
            '</details>' +
            '</div>';
    }

    /**
     * Shows the success confirmation page after submission.
     */
    function showSuccessPage(context, opportunityId, mainQuotes, additionalQuotes, proposalResult, emailInfo) {
        var form = serverWidget.createForm({ title: 'Quote Proposal — Generated Successfully' });

        var cssField = form.addField({ id: 'custpage_css', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        cssField.defaultValue = buildFormCSS() +
            '<style>' +
            '.nuheat-proposal-link { display: inline-block; margin: 12px 0; padding: 10px 20px; background: ' + BRAND.primary + '; color: ' + BRAND.white + '; text-decoration: none; border-radius: 6px; font-weight: 600; }' +
            '.nuheat-proposal-link:hover { opacity: 0.9; }' +
            '.nuheat-meta { margin-top: 8px; font-size: 12px; color: ' + BRAND.textMuted + '; }' +
            '</style>';

        var html = '<div class="nuheat-success">' +
            '<h3>✅ Master Proposal Generated Successfully</h3>' +
            '<p>The proposal has been generated and saved. The Opportunity record has been updated with the proposal URL.</p>';

        // Proposal link
        if (proposalResult && proposalResult.proposalUrl) {
            html += '<p style="margin-top:12px;"><a class="nuheat-proposal-link" href="' + escapeHtml(proposalResult.proposalUrl) + '" target="_blank">🔗 View Master Proposal</a></p>';
            html += '<p class="nuheat-meta">File: ' + escapeHtml(proposalResult.fileName || '') + ' | File ID: ' + escapeHtml(String(proposalResult.fileId || '')) + '</p>';
        }

        html += '</div>';

        // Email confirmation or warning
        if (emailInfo) {
            if (emailInfo.sent) {
                html += '<div class="nuheat-email-confirm">';
                html += '<h4>📧 Email Sent Successfully</h4>';
                html += '<div class="nuheat-email-item"><span class="nuheat-email-label">To:</span> ' + escapeHtml(emailInfo.to) + '</div>';
                if (emailInfo.cc) {
                    html += '<div class="nuheat-email-item"><span class="nuheat-email-label">CC:</span> ' + escapeHtml(emailInfo.cc) + '</div>';
                }
                if (emailInfo.bcc) {
                    html += '<div class="nuheat-email-item"><span class="nuheat-email-label">BCC:</span> ' + escapeHtml(emailInfo.bcc) + '</div>';
                }
                html += '<p style="margin-top:10px; font-size:12px; color:#666;">The email has been logged to the Opportunity\'s Messages subtab (Communication tab).</p>';
                html += '</div>';
            } else {
                html += '<div class="nuheat-email-warn">';
                html += '<h4>⚠️ Email Sending Failed</h4>';
                html += '<p style="font-size:13px; color:#856404;">The proposal was generated successfully, but the email could not be sent.</p>';
                if (emailInfo.error) {
                    html += '<p style="font-size:12px; color:#856404;">Error: ' + escapeHtml(emailInfo.error) + '</p>';
                }
                html += '<p style="font-size:12px; color:#856404;">You can share the proposal link manually using the "View Master Proposal" button above.</p>';
                html += '</div>';
            }
        }

        // Main quotes table
        if (mainQuotes.length > 0) {
            html += '<h4 style="margin-top:16px; color:' + BRAND.primary + ';">Main Quote' + (mainQuotes.length > 1 ? 's' : '') + ' (included in total)</h4>' +
                '<table class="nuheat-table"><thead><tr>' +
                '<th>Quote Number</th><th>Title</th><th>Type</th><th>System Price</th><th>Total Amount</th>' +
                '</tr></thead><tbody>';
            for (var i = 0; i < mainQuotes.length; i++) {
                html += '<tr><td>' + escapeHtml(mainQuotes[i].tranId) + '</td>' +
                    '<td>' + escapeHtml(mainQuotes[i].title) + '</td>' +
                    '<td>' + escapeHtml(mainQuotes[i].quoteType) + '</td>' +
                    '<td>' + escapeHtml(mainQuotes[i].subtotal || '') + '</td>' +
                    '<td>' + escapeHtml(mainQuotes[i].amount) + '</td></tr>';
            }
            html += '</tbody></table>';
        }

        // Alternative quotes table
        if (additionalQuotes.length > 0) {
            html += '<h4 style="margin-top:16px; color:' + BRAND.textMuted + ';">Alternative Quote' + (additionalQuotes.length > 1 ? 's' : '') + ' (not included in total)</h4>' +
                '<table class="nuheat-table"><thead><tr>' +
                '<th>Quote Number</th><th>Title</th><th>Type</th><th>System Price</th><th>Total Amount</th>' +
                '</tr></thead><tbody>';
            for (var j = 0; j < additionalQuotes.length; j++) {
                html += '<tr><td>' + escapeHtml(additionalQuotes[j].tranId) + '</td>' +
                    '<td>' + escapeHtml(additionalQuotes[j].title) + '</td>' +
                    '<td>' + escapeHtml(additionalQuotes[j].quoteType) + '</td>' +
                    '<td>' + escapeHtml(additionalQuotes[j].subtotal || '') + '</td>' +
                    '<td>' + escapeHtml(additionalQuotes[j].amount) + '</td></tr>';
            }
            html += '</tbody></table>';
        }

        var resultField = form.addField({ id: 'custpage_result', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        resultField.defaultValue = html;

        // Hidden opportunity ID for back navigation
        var hiddenOppId = form.addField({ id: 'custpage_opportunity_id', type: serverWidget.FieldType.TEXT, label: 'Opportunity ID' });
        hiddenOppId.defaultValue = opportunityId;
        hiddenOppId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        form.addButton({
            id: 'custpage_btn_back',
            label: 'Back to Opportunity',
            functionName: 'goBackToOpportunity'
        });

        form.clientScriptModulePath = './nuheat_send_quote_cs.js';

        context.response.writePage(form);
    }

    /**
     * Shows an error page.
     */
    function showErrorPage(context, message) {
        var form = serverWidget.createForm({ title: 'Send Quote — Error' });

        var cssField = form.addField({ id: 'custpage_css', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        cssField.defaultValue = buildFormCSS();

        var errorField = form.addField({ id: 'custpage_error', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        errorField.defaultValue = '<div class="nuheat-error">' +
            '<h3>❌ Error</h3>' +
            '<p>' + escapeHtml(message) + '</p>' +
            '<p style="margin-top:12px;">Please try again or contact your administrator if the problem persists.</p>' +
            '</div>';

        form.addButton({
            id: 'custpage_btn_back',
            label: 'Go Back',
            functionName: 'history.back'
        });

        context.response.writePage(form);
    }

    /**
     * Basic HTML escaping to prevent XSS.
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ─── Exports ──────────────────────────────────────────────────────────────────

    return {
        onRequest: onRequest
    };

});