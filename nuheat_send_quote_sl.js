/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Send Quote Selection Suitelet
 * @description "Send proposal" page for an Opportunity: choose quotes (Leave out / Main /
 *              Additional), recipients and four Opportunity fields, then generate and email the
 *              Master Proposal, update the Opportunity and the quotes' forecast flags, and return
 *              to the Opportunity. Supports preview (generates HTML without saving).
 * @version     2.0.4
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_send_quote_sl
 * Deployment ID:  customdeploy_nuheat_send_quote_sl
 *
 * CHANGELOG v2.0.4 (Header title decode):
 *   - FIXED: the page header's opportunity title went through stripTags() without decoding, so an
 *     entity-encoded title showed raw entities (&lt;b&gt;) — the 2.0.3 card defect, in the header.
 *     It now goes through cleanCardText() (decode → strip → collapse) and is escaped once.
 *
 * CHANGELOG v2.0.3 (Quote card text):
 *   - CHANGED: card line 1 is "tranid · description" (the title is no longer shown; it repeated the
 *     description). Falls back to the title, then to the tranid alone. Wraps to two lines at most,
 *     full text on hover. Line 2 is "Created <date> · <quote type> · BUS grant £x applied", each
 *     only when present.
 *   - FIXED: titles/descriptions arriving entity-encoded (&lt;b&gt;) were shown raw and encoded twice.
 *     Card text is now decodeEntities() → stripTags() → whitespace collapse → escapeHtml() once.
 *     Decode BEFORE strip: decoding after would turn &lt;script&gt; into a live tag.
 *   - Display only — the quote objects sent to the Master Proposal are unchanged.
 *
 * CHANGELOG v2.0.2 (Expected close date):
 *   - ADDED: fifth update field, Expected close (standard expectedclosedate, date). Same rules as the
 *     other dates: runtime type check, native picker (yyyy-mm-dd, pre-filled from date parts),
 *     written only when changed and never when blank, in the one Opportunity submitFields — still
 *     the last write. Banner support in nuheat_opportunity_ue.js v1.2.1.
 *   - CHANGED: the section is laid out in OPP_UPDATE_DISPLAY_ORDER (Status, Build stage, Expected
 *     close, Next contact, Est. delivery date) on a grid of columns at least 200 px wide — five in a
 *     row at 1120 px, wrapping when narrower. OPP_UPDATE_FIELDS keeps its processing order (new
 *     field appended) so the posted key lists and redirect parameters are unchanged in shape.
 *
 * CHANGELOG v2.0.1 (Status revert fix; date pickers):
 *   - FIXED (suspected cause): a Status change did not stick in Sandbox (2.0.0). The forecast writes
 *     ran AFTER the Opportunity update, and saving an Estimate linked to the Opportunity can re-sync
 *     the Estimate's own (old) Status onto the Opportunity. updateForecastFlags() now runs BEFORE
 *     updateOpportunityFields(), so the Opportunity update is the last record write. enableSourcing
 *     is deliberately unchanged pending Steve's system-notes evidence.
 *   - CHANGED: Next contact / Est. delivery date are <input type="date"> (native picker). They post
 *     yyyy-mm-dd; the value is validated as a real calendar date and written as
 *     new Date(y, m - 1, d). Pre-fill and hidden originals are yyyy-mm-dd built from the record
 *     Date's own date parts (never toISOString(), which shifts to UTC). The format.format text is
 *     kept for "Changed · was …". parseDateValue() / format.parse removed — nothing posts the
 *     user's date format any more.
 *
 * CHANGELOG v2.0.0 (Redesign, return to the opportunity, forecast flags):
 *   - REWRITTEN: The page is one INLINEHTML body inside a serverWidget form (NetSuite chrome kept):
 *     header, "1 Choose quotes" (segmented Leave out / Main / Additional per quote), "2 Send to"
 *     (To tags, contact picker, CC/BCC), "3 Update the opportunity" and a sticky footer with a live
 *     summary. No native buttons, no sublists, no client script — the static inline script
 *     (PAGE_SCRIPT) reads everything from data- attributes and submits NetSuite's main_form.
 *   - ⚠️ SECURITY: the POST and the preview carry only { estimateId: role }. Quote objects are
 *     rebuilt on the server from searchRelatedQuotes(); an ID not on the Opportunity is rejected.
 *     Client-supplied prices are gone. toProposalQuote() keeps the exact pre-2.0 object shape.
 *   - ADDED: updateForecastFlags() — after a successful email, sets includeinforecast (ASSUMED ID,
 *     type-checked at runtime) true for Main and false for Additional / Leave out, on quotes the page
 *     showed, only where the value differs. Read off the Estimate record already loaded per quote.
 *   - CHANGED: after a successful send → redirect.toRecord to the Opportunity (VIEW, same tab) with
 *     whitelisted code parameters (nsq, nsqt, nsqf, nsqff, nsqfi, nsqfx, nsqqf); the banner is
 *     built by nuheat_opportunity_ue.js v1.2.0 from the record. Generation / email / validation
 *     failures re-render the page with the user's entries restored.
 *   - CHANGED: updateOpportunityFields() uses enableSourcing: true only when Status changed, so
 *     Probability follows the new Status (1.8.0 Sandbox S5).
 *   - REMOVED: showSuccessPage(), buildOppUpdatePanelHTML(), buildTwoColumnTopHTML(),
 *     buildInstructionsHTML(), buildFormCSS(), the sublists and all clientScriptModulePath
 *     assignments (nuheat_send_quote_cs.js is detached).
 *   - UNCHANGED: write after the email; only changed non-blank values; never the sub-status.
 *
 * CHANGELOG v1.8.0 (Update opportunity on send):
 *   - ADDED: "Update opportunity" field group on the form with four optional native fields —
 *     Status (entitystatus), Next contact (custbody_next_contact), Est. delivery date
 *     (custbody_opp_del_date) and Build stage (custbody_build_stage) — pre-populated from the
 *     Opportunity. SELECT options are read from the record itself (dynamic load +
 *     getSelectOptions()), so no list or internal IDs live in code. A field whose options cannot
 *     be read, or whose NetSuite type is not the one assumed, is not shown (audit-logged).
 *   - ADDED: updateOpportunityFields() — runs AFTER a successful email.send, writes only fields
 *     the user changed, never writes a blank, one submitFields call. A failure never turns a
 *     sent proposal into an error page; the success page shows a warning instead.
 *   - CHANGED: The existing Opportunity record.load is now isDynamic (needed for
 *     getSelectOptions()). Same 10-unit cost; the values read from it are unchanged.
 *   - CHANGED: Success page no longer claims unconditionally that the Opportunity was updated;
 *     it states the proposal link was saved and reports the field update outcome separately.
 *   - ⚠️ custbody_opportunity_sub_status is NEVER written here — some sub-status values create
 *     Design Instruction rows.
 *   - NOTE: The Send Quote button is now VIEW-only (nuheat_opportunity_ue.js v1.1.0) so the
 *     write cannot race an open EDIT session.
 *
 * CHANGELOG v1.7.0 (VAT by technology):
 *   - ADDED: Derives the VAT rate from the quote's technology via ./nuheat_vat_rates and passes
 *     vatRate / vatPercent through to the Master Proposal alongside busAmount / busRate.
 *   - ⚠️ CHANGED: taxTotal and amount pushed to the proposal are now DERIVED, not raw NetSuite
 *     values. This is deliberate and is NOT a regression of the v1.4.9 fix below — that fix was
 *     about reading subtotal/discounttotal/taxtotal reliably via record.load() instead of
 *     search.lookupFields(), and those reads are unchanged. What changed is that the tax figure
 *     is now recalculated from subtotal-minus-discount because the TAX CODES on heat pump
 *     Estimates are wrong in NetSuite (20% where it should be 0%). Where derived and NetSuite
 *     figures disagree, VAT_MISMATCH is logged — that log is the work-list for fixing the codes
 *     at source. When record.load() fails, the NetSuite fallback values are still used.
 *   - ADDED: Hidden sublist fields custpage_vat_rate and custpage_vat_percent.
 *   - ⚠️ DEPLOYMENT: nuheat_vat_rates.js must be uploaded to SuiteScripts/NuHeat BEFORE this
 *     script is redeployed, or it fails at load time.
 *
 * CHANGELOG v1.6.0 (BUS grant pass-through):
 *   - ADDED: Resolves the BUS grant rate from the Estimate's Suppak line item via the
 *     shared ./nuheat_bus_grant module and passes busAmount / busRate through to the
 *     Master Proposal, which has no line-item access of its own.
 *   - ADDED: Hidden sublist fields custpage_bus_amount and custpage_bus_rate so the
 *     values survive the serverWidget round trip.
 *   - CHANGED: formatCurrency() gained a signed sibling, formatSignedCurrency(), for
 *     figures that can go negative once the grant exceeds the quote value.
 *   - ⚠️ DEPLOYMENT: nuheat_bus_grant.js must be uploaded to SuiteScripts/NuHeat BEFORE
 *     this script is redeployed, or it fails at load time.
 *   - NOTE: @version had drifted to 1.4.9 while SCRIPT_VERSION read 1.5.1; both now 1.6.0.
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
    './nuheat_master_proposal',
    './nuheat_bus_grant',
    './nuheat_vat_rates'
], function (serverWidget, search, record, log, url, redirect, runtime, format, email, masterProposal, busGrant, vatRates) {

    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────────

    var SCRIPT_VERSION = '2.0.4';

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

    /**
     * v1.8.0: Opportunity fields the account manager can update when sending a proposal.
     *
     * `kind` is the field type ASSUMED for each field — the GET checks it against the type
     * NetSuite reports (record.getField().type) and does not show a field that disagrees.
     * The two date types and the Build stage type are assumptions awaiting confirmation.
     *
     * ⚠️ custbody_opportunity_sub_status must NEVER be added here. Some sub-status values
     * create Design Instruction rows; this Suitelet does not own that field.
     */
    var OPP_UPDATE_FIELDS = [
        { key: 'entitystatus', fieldId: 'entitystatus',          label: 'Status',             kind: 'select', blankOption: false },
        { key: 'next_contact', fieldId: 'custbody_next_contact', label: 'Next contact',       kind: 'date' },
        { key: 'del_date',     fieldId: 'custbody_opp_del_date', label: 'Est. delivery date', kind: 'date' },
        { key: 'build_stage',  fieldId: 'custbody_build_stage',  label: 'Build stage',        kind: 'select', blankOption: true },
        { key: 'close_date',   fieldId: 'expectedclosedate',     label: 'Expected close',     kind: 'date' }   // v2.0.2, standard field
    ];

    /** v2.0.2: order the fields appear in on the page (processing order above is unchanged). */
    var OPP_UPDATE_DISPLAY_ORDER = ['entitystatus', 'build_stage', 'close_date', 'next_contact', 'del_date'];

    /**
     * v2.0.0: Estimate "Include in Forecast". ⚠️ ASSUMED standard field ID, not yet confirmed —
     * its type is checked at runtime (must report 'checkbox') before any write.
     */
    var FORECAST_FIELD = 'includeinforecast';
    var OPP_UPDATE_KEYS_FIELD = 'custpage_upd_fields';   // hidden: keys of the fields actually shown

    function updFieldId(def)     { return 'custpage_upd_' + def.key; }
    function origFieldId(def)    { return 'custpage_orig_' + def.key; }
    function origTextFieldId(def) { return 'custpage_origtxt_' + def.key; }

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
     * v1.6.0: Formats a number as GBP with the minus sign BEFORE the symbol.
     * e.g. -694.40 => '-£694.40' (formatCurrency alone gives '£-694.40').
     * Use for any figure that can go negative once the BUS grant exceeds the quote value.
     */
    function formatSignedCurrency(amount) {
        var num = parseFloat(amount);
        if (isNaN(num)) num = 0;
        return (num < 0 ? '-' : '') + formatCurrency(Math.abs(num));
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

    // ─── Selection (v2.0.0) ───────────────────────────────────────────────────────
    //
    // The browser sends only { "<estimateId>": "main" | "additional" }. Left-out quotes are
    // omitted. Every price, VAT and BUS figure is rebuilt on the server from
    // searchRelatedQuotes() — nothing the page posts is trusted as a quote value.

    var ROLE_MAIN       = 'main';
    var ROLE_ADDITIONAL = 'additional';

    /**
     * Parses the posted selection JSON.
     * @returns {{map: Object<string,string>, invalid: boolean}} `invalid` when the JSON is
     *          malformed or carries a role other than main/additional.
     */
    function parseSelection(json) {
        var result = { map: {}, invalid: false };
        if (!json) return result;
        var obj;
        try {
            obj = JSON.parse(json);
        } catch (e) {
            result.invalid = true;
            return result;
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            result.invalid = true;
            return result;
        }
        Object.keys(obj).forEach(function (id) {
            var role = obj[id];
            if (role === ROLE_MAIN || role === ROLE_ADDITIONAL) {
                result.map[String(id)] = role;
            } else {
                result.invalid = true;
            }
        });
        return result;
    }

    /**
     * Builds the quote object handed to the Master Proposal from a searchRelatedQuotes() row.
     *
     * ⚠️ The shape — keys, key order and value types — is EXACTLY what the pre-2.0 hidden
     * sublist columns produced after their text round trip (setSublistValue → getSublistValue),
     * including the '£0.00' / 'none' / '20%' defaults and the parse-back of busAmount and
     * vatRate. nuheat_master_proposal.js depends on it; the test suite compares the two.
     */
    function toProposalQuote(q, role) {
        var busAmount = parseFloat(String(q.busAmount || 0));
        if (isNaN(busAmount)) busAmount = 0;
        var vatRate = parseFloat(String(q.vatRate === undefined ? '' : q.vatRate));
        if (isNaN(vatRate)) vatRate = vatRates.DEFAULT_VAT_RATE;

        return {
            quoteId:       q.id,
            tranId:        q.tranId,
            title:         q.title,
            quoteType:     q.quoteTypeDisplay,
            amount:        q.amount,
            subtotal:      q.subtotal,
            discountTotal: q.discountTotal || '£0.00',
            taxTotal:      q.taxTotal || '£0.00',
            busAmount:     busAmount,
            busRate:       q.busRate || 'none',
            vatRate:       vatRate,
            vatPercent:    q.vatPercent || '20%',
            quoteUrl:      q.quoteUrl,
            category:      role,
            description:   q.description || ''
        };
    }

    /**
     * Resolves a parsed selection against the Opportunity's own quotes.
     * Any selected ID that is not among them rejects the whole request.
     *
     * @returns {{error: string, selected: Array, main: Array, additional: Array}}
     */
    function resolveSelection(opportunityId, quotes, selection) {
        var out = { error: '', selected: [], main: [], additional: [] };
        var byId = {};
        quotes.forEach(function (q) { byId[String(q.id)] = q; });

        var unknown = Object.keys(selection.map).filter(function (id) { return !byId[id]; });
        if (selection.invalid || unknown.length) {
            log.audit('SendQuoteSL.Selection', 'Opportunity ' + opportunityId + ' — rejected selection' +
                (selection.invalid ? ' (malformed)' : '') + (unknown.length ? ' (not on this opportunity: ' + unknown.join(',') + ')' : ''));
            out.error = 'The selection included a quote that does not belong to this opportunity. ' +
                'Nothing was sent. Please check your selection and try again.';
            return out;
        }

        // Same order the pre-2.0 form posted in: grouped by QUOTE_TYPE_ORDER, then search order.
        QUOTE_TYPE_ORDER.forEach(function (type) {
            quotes.forEach(function (q) {
                var qType = QUOTE_TYPE_ORDER.indexOf(q.quoteTypeDisplay) === -1 ? 'Other' : q.quoteTypeDisplay;
                if (qType !== type) return;
                var role = selection.map[String(q.id)];
                if (!role) return;
                var entry = toProposalQuote(q, role);
                out.selected.push(entry);
                (role === ROLE_MAIN ? out.main : out.additional).push(entry);
            });
        });
        return out;
    }

    var EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;

    function invalidEmails(str) {
        return parseEmails(str).filter(function (e) { return !EMAIL_RE.test(e); });
    }

    // ─── Preview Handler ──────────────────────────────────────────────────────────

    /**
     * Handles the preview action — rebuilds the selected quotes on the server and writes the
     * proposal HTML to the response. Does NOT save to File Cabinet or update any records.
     *
     * v2.0.0: the request carries only opportunityId and the selection (IDs and roles).
     */
    function handlePreview(context) {
        var opportunityId = context.request.parameters.opportunityId;
        var selection     = parseSelection(context.request.parameters.sel);

        log.audit('SendQuoteSL.handlePreview', 'Preview for Opportunity ' + opportunityId);

        function previewError(msg) {
            context.response.write('<html><body><h1>Preview Error</h1><p>' + escapeHtml(msg) + '</p></body></html>');
        }

        if (!opportunityId || !Object.keys(selection.map).length) {
            previewError('Missing Opportunity ID or quote selection.');
            return;
        }

        try {
            var quotes   = searchRelatedQuotes(opportunityId);
            var resolved = resolveSelection(opportunityId, quotes, selection);
            if (resolved.error) {
                previewError(resolved.error);
                return;
            }
            if (!resolved.main.length) {
                previewError('Choose at least one Main quote to preview.');
                return;
            }

            // Generate preview HTML (no save, no field update)
            var html = masterProposal.generatePreviewHTML(opportunityId, resolved.selected);

            context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
            context.response.write(html);

        } catch (e) {
            log.error('SendQuoteSL.handlePreview', 'Preview error: ' + e.message + '\n' + e.stack);
            previewError(e.message);
        }
    }

    // ─── GET: the Send proposal page ──────────────────────────────────────────────

    /**
     * GET entry point — renders the Send proposal page.
     */
    function showQuoteSelectionForm(context) {
        var opportunityId = context.request.parameters.opportunityId;

        if (!opportunityId) {
            showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
            return;
        }

        renderSendPage(context, opportunityId, null, '', null);
    }

    /**
     * Renders the Send proposal page: a serverWidget form (so NetSuite's header and menu stay)
     * carrying ONE inline-HTML field. No native buttons and no client script — the page's own
     * inline script owns all behaviour and submits NetSuite's main_form.
     *
     * @param {Object} context
     * @param {string} opportunityId
     * @param {Object|null} restore - posted state to restore after a failed send, or null
     * @param {string} errorMessage - shown in an error panel at the top, or ''
     * @param {Array|null} quotes - quotes already loaded for this request, or null to search
     */
    function renderSendPage(context, opportunityId, restore, errorMessage, quotes) {
        var page = loadSendPageData(opportunityId, quotes);
        if (page.loadError) {
            showErrorPage(context, page.loadError);
            return;
        }

        var form = serverWidget.createForm({ title: 'Send Quote' });
        var body = form.addField({
            id:    'custpage_page',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        body.defaultValue = buildSendPageHTML(page, restore, errorMessage);

        context.response.writePage(form);
    }

    /**
     * Loads everything the Send proposal page shows.
     */
    function loadSendPageData(opportunityId, quotes) {
        var page = { opportunityId: String(opportunityId), loadError: '' };

        // ── Load Opportunity record ──────────────────────────────────────────────
        // v1.8.0: isDynamic so getSelectOptions() works for the update fields.
        var oppRecord;
        try {
            oppRecord = record.load({ type: record.Type.OPPORTUNITY, id: opportunityId, isDynamic: true });
        } catch (e) {
            log.error('SendQuoteSL.showForm', 'Failed to load Opportunity ' + opportunityId + ': ' + e.message);
            page.loadError = 'Could not load Opportunity record (ID: ' + opportunityId + '). Please check the record exists and you have permission to view it.';
            return page;
        }

        page.tranId       = oppRecord.getValue({ fieldId: 'tranid' })    || '';
        page.title        = oppRecord.getValue({ fieldId: 'title' })     || '';
        page.customerName = oppRecord.getText({ fieldId: 'entity' })     || '';
        var customerId    = oppRecord.getValue({ fieldId: 'entity' })    || '';
        page.status       = oppRecord.getText({ fieldId: 'entitystatus' }) || '';

        // v1.4.5: Defensive loading of site address — field may not exist on all environments
        page.siteAddress = '';
        try {
            page.siteAddress = oppRecord.getValue({ fieldId: 'custbody_opp_site_adress' }) || '';
        } catch (siteErr) {
            log.debug('SendQuoteSL.showForm', 'Could not read custbody_opp_site_adress: ' + siteErr.message + ' — field may not exist');
        }

        // Customer email — the default To address
        page.customerEmail = '';
        if (customerId) {
            try {
                var custFields = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId,
                    columns: ['email']
                });
                page.customerEmail = custFields.email || '';
            } catch (e) {
                log.debug('SendQuoteSL.showForm', 'Could not look up customer email: ' + e.message);
            }
        }

        log.audit('SendQuoteSL.showForm', 'Opportunity: ' + page.tranId + ' | Title: ' + page.title +
            ' | Customer: ' + page.customerName + ' | Email: ' + page.customerEmail + ' | SiteAddr: ' + page.siteAddress);

        // v1.5.0: Contacts linked to this Opportunity via Opportunity search + contact join
        // (the contact sublist API does not work on Opportunities — §9 pitfall 11)
        page.contacts = [];
        try {
            var contactSearch = search.create({
                type: search.Type.OPPORTUNITY,
                filters: [
                    ['internalid', 'anyof', opportunityId]
                ],
                columns: [
                    search.createColumn({ name: 'internalid',  join: 'contact' }),
                    search.createColumn({ name: 'firstname',   join: 'contact' }),
                    search.createColumn({ name: 'lastname',    join: 'contact' }),
                    search.createColumn({ name: 'email',       join: 'contact' })
                ]
            });

            contactSearch.run().each(function (result) {
                var contactId = result.getValue({ name: 'internalid', join: 'contact' });
                if (!contactId) return true;
                var firstName = result.getValue({ name: 'firstname',  join: 'contact' }) || '';
                var lastName  = result.getValue({ name: 'lastname',   join: 'contact' }) || '';
                var email     = result.getValue({ name: 'email',      join: 'contact' }) || '';
                page.contacts.push({
                    id:    contactId,
                    name:  (firstName + ' ' + lastName).trim() || 'Contact ' + contactId,
                    email: email
                });
                return true;
            });
        } catch (contactErr) {
            log.debug('SendQuoteSL.loadContacts', 'Contact search failed: ' + contactErr.message);
        }

        page.quotes = quotes || searchRelatedQuotes(opportunityId);
        page.updateFields = page.quotes.length ? prepareOpportunityUpdateFields(oppRecord, opportunityId) : [];

        // Links, resolved server-side and handed to the page as data- attributes
        page.oppUrl = '';
        page.previewUrl = '';
        try {
            page.oppUrl = url.resolveRecord({ recordType: 'opportunity', recordId: opportunityId, isEditMode: false });
        } catch (e) {
            log.debug('SendQuoteSL.showForm', 'Could not resolve Opportunity URL: ' + e.message);
        }
        try {
            var script = runtime.getCurrentScript();
            page.previewUrl = url.resolveScript({
                scriptId:     script.id,
                deploymentId: script.deploymentId,
                params:       { action: 'preview', opportunityId: String(opportunityId) }
            });
        } catch (e) {
            log.debug('SendQuoteSL.showForm', 'Could not resolve preview URL: ' + e.message);
        }

        return page;
    }

    // ─── POST: Handle form submission ─────────────────────────────────────────────

    /**
     * Reads the posted page state, so a failed send can re-render the page as the user left it.
     */
    function restoreFromRequest(params, selection) {
        var upd = {};
        OPP_UPDATE_FIELDS.forEach(function (def) {
            var v = params[updFieldId(def)];
            if (v !== undefined && v !== null) upd[def.key] = String(v);
        });
        return {
            selection: selection.map,
            to:        params.custpage_email_to  || '',
            cc:        params.custpage_email_cc  || '',
            bcc:       params.custpage_email_bcc || '',
            upd:       upd
        };
    }

    /**
     * Processes the Send proposal POST.
     *
     * Order: validate → generateMasterProposal() → sendProposalEmail() →
     *        updateForecastFlags() → updateOpportunityFields() → redirect.toRecord (VIEW).
     *        (v2.0.1: forecast before the Opportunity update — see the comment at the calls.)
     *
     * Any failure up to and including the email re-renders the page with the user's entries
     * restored and an error panel; nothing further is written and there is no redirect.
     */
    function handleFormSubmission(context) {
        var request       = context.request;
        var params        = request.parameters || {};
        var opportunityId = params.custpage_opportunity_id;

        if (!opportunityId) {
            showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
            return;
        }

        var emailTo  = params.custpage_email_to  || '';
        var emailCc  = params.custpage_email_cc  || '';
        var emailBcc = params.custpage_email_bcc || '';
        var selection = parseSelection(params.custpage_sel);
        var restore   = restoreFromRequest(params, selection);

        log.audit('SendQuoteSL.handleSubmission', 'Opportunity: ' + opportunityId +
            ' | Selection: ' + JSON.stringify(selection.map) +
            ' | To: ' + emailTo + ' | CC: ' + emailCc + ' | BCC: ' + emailBcc);

        // v2.0.0: rebuild every quote from NetSuite — the page sends IDs and roles only
        var quotes = searchRelatedQuotes(opportunityId);

        function fail(message) {
            renderSendPage(context, opportunityId, restore, message, quotes);
        }

        // ── Validation ───────────────────────────────────────────────────────────
        var resolved = resolveSelection(opportunityId, quotes, selection);
        if (resolved.error) {
            fail(resolved.error);
            return;
        }

        log.audit('SendQuoteSL.handleSubmission', 'Selected: ' + resolved.selected.length +
            ' | Main: ' + resolved.main.length + ' | Additional: ' + resolved.additional.length);

        if (resolved.selected.length === 0) {
            fail('No quotes were selected. Choose at least one quote to include in the proposal.');
            return;
        }
        if (resolved.main.length === 0) {
            fail('No Main quote selected. Set at least one quote to "Main".');
            return;
        }
        if (!parseEmails(emailTo).length) {
            fail('No recipient email address provided. Add at least one "To" address.');
            return;
        }
        var badEmails = invalidEmails(emailTo).concat(invalidEmails(emailCc), invalidEmails(emailBcc));
        if (badEmails.length) {
            fail('These email addresses are not valid: ' + badEmails.join(', '));
            return;
        }

        // ── Generate Master Proposal ──────────────────────────────────────────────
        // (also writes custbody_master_proposal_url / custbody_last_proposal_sent_date — unchanged)
        var proposalResult;
        try {
            proposalResult = masterProposal.generateMasterProposal(opportunityId, resolved.selected);
            log.audit('SendQuoteSL.handleSubmission', 'Proposal generated — File ID: ' + proposalResult.fileId +
                ' | URL: ' + proposalResult.proposalUrl);
        } catch (genErr) {
            log.error('SendQuoteSL.handleSubmission', 'Proposal generation failed: ' + genErr.message + '\n' + JSON.stringify(genErr));
            proposalResult = { success: false, error: genErr.message };
        }
        if (!proposalResult.success) {
            fail('Proposal generation failed: ' + (proposalResult.error || 'Unknown error') +
                '. Nothing was sent. Please try again or contact your administrator.');
            return;
        }

        // ── Send Email ───────────────────────────────────────────────────────────
        try {
            sendProposalEmail(opportunityId, proposalResult.proposalUrl, emailTo, emailCc, emailBcc);
        } catch (emailErr) {
            log.error('SendQuoteSL.handleSubmission', 'Email sending failed: ' + emailErr.message);
            log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — skipped, email was not sent');
            fail('The email could not be sent: ' + emailErr.message + '. The proposal was generated and its ' +
                'link saved to the opportunity, but no opportunity fields or forecast flags were changed. ' +
                'Check the addresses and send again.');
            return;
        }

        // ── Forecast flags, then the Opportunity (independent of each other) ──────
        // v2.0.1: Forecast first: an Estimate save can re-sync its Status onto the opportunity.
        // The opportunity update must be last.
        var forecast  = updateForecastFlags(opportunityId, selection.map, quotes);
        var oppUpdate = updateOpportunityFields(opportunityId, request);

        // ── Back to the Opportunity (VIEW), same tab ──────────────────────────────
        var redirectParams = buildRedirectParams(oppUpdate, forecast);
        log.audit('SendQuoteSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(redirectParams));

        redirect.toRecord({
            type:       record.Type.OPPORTUNITY,
            id:         opportunityId,
            isEditMode: false,
            parameters: redirectParams
        });
    }

    /**
     * Builds the redirect parameters for the Opportunity banner (nuheat_opportunity_ue.js).
     *
     * Codes only — whitelisted field keys, counts, Estimate IDs and a timestamp. No free text,
     * addresses or error messages: the banner builds every word from the record itself.
     */
    function buildRedirectParams(oppUpdate, forecast) {
        var p = {
            nsq:  'ok',
            nsqt: String(Math.floor(Date.now() / 1000))
        };

        var keys = (oppUpdate.changed || []).map(function (c) { return c.key; });
        if (oppUpdate.error) {
            p.nsq = 'warn';
            if (keys.length) p.nsqff = keys.join(',');
        } else if (keys.length) {
            p.nsqf = keys.join(',');
        }

        if (forecast.changed > 0) {
            p.nsqfi = String(forecast.included);
            p.nsqfx = String(forecast.excluded);
        }
        if (forecast.failed.length) {
            p.nsq = 'warn';
            p.nsqqf = forecast.failed.join(',');
        }
        return p;
    }

    // ─── Update opportunity (v1.8.0) ──────────────────────────────────────────────

    /**
     * Prepares the four "Update the opportunity" fields.
     *
     * Each field is shown only if NetSuite reports the assumed type and, for SELECTs, the
     * record returns options. Options come from the Opportunity itself (dynamic record,
     * getSelectOptions()), so the list is exactly what NetSuite offers on this record and no
     * internal IDs appear in code.
     *
     * @param {record.Record} oppRecord - Opportunity, loaded with isDynamic: true
     * @param {string} opportunityId
     * @returns {Array<{def: Object, options: Array, orig: string, origText: string}>}
     */
    function prepareOpportunityUpdateFields(oppRecord, opportunityId) {
        var prepared = [];
        var typeReport = [];

        OPP_UPDATE_FIELDS.forEach(function (def) {
            try {
                var nsField = oppRecord.getField({ fieldId: def.fieldId });
                if (!nsField) {
                    typeReport.push(def.fieldId + '=(not on record)');
                    log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                        ' not available on the record; field not shown');
                    return;
                }

                var reportedType = String(nsField.type || '').toLowerCase();
                typeReport.push(def.fieldId + '=' + reportedType);
                if (reportedType !== def.kind) {
                    log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                        ' reports type "' + reportedType + '" but "' + def.kind + '" was assumed; field not shown');
                    return;
                }

                var raw = oppRecord.getValue({ fieldId: def.fieldId });

                if (def.kind === 'select') {
                    var options = nsField.getSelectOptions() || [];
                    if (!options.length) {
                        log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                            ' returned no select options; field not shown');
                        return;
                    }
                    var rawStr = (raw === null || raw === undefined) ? '' : String(raw);
                    var origText = '';
                    options.forEach(function (o) {
                        if (String(o.value) === rawStr) origText = o.text;
                    });
                    // Without a blank option the dropdown would default to its first entry, and an
                    // untouched submit would then write a value the user never chose.
                    if (!def.blankOption && !origText) {
                        log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — current ' + def.fieldId +
                            ' value "' + rawStr + '" is not among its ' + options.length + ' options; field not shown');
                        return;
                    }
                    prepared.push({ def: def, options: options, orig: rawStr, origText: origText });
                } else {
                    // v2.0.1: <input type="date"> takes yyyy-mm-dd. Built from the Date's own parts —
                    // toISOString() would convert to UTC and can move the date back a day.
                    var isoStr = '';
                    var dateText = '';
                    if (raw instanceof Date && !isNaN(raw.getTime())) {
                        isoStr = toIsoDate(raw);
                        dateText = format.format({ value: raw, type: format.Type.DATE });
                    } else if (raw) {
                        log.debug('SendQuoteSL.OppUpdate', def.fieldId + ' returned a non-Date value "' + raw + '"; shown blank');
                        dateText = String(raw);
                    }
                    prepared.push({ def: def, orig: isoStr, origText: dateText });
                }
            } catch (e) {
                log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                    ' could not be prepared (' + e.message + '); field not shown');
            }
        });

        // F3 check: the reported types are the evidence for the assumed ones.
        log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — reported field types: ' + typeReport.join(', '));

        return prepared;
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    /**
     * v2.0.1: Date → 'yyyy-mm-dd' from its own date parts. Never toISOString() (UTC shift).
     */
    function toIsoDate(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    /**
     * v2.0.1: Parses an <input type="date"> value. Accepts only yyyy-mm-dd naming a real
     * calendar date; returns new Date(y, m - 1, d), or null for anything else.
     */
    function parseIsoDate(str) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
        if (!m) return null;
        var y = +m[1], mo = +m[2], d = +m[3];
        var date = new Date(y, mo - 1, d);
        if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
        return date;
    }

    /**
     * Writes the Opportunity fields the user changed in "Update the opportunity".
     *
     * Called only after the proposal email has been sent. Rules:
     *   - Only fields that were shown on the page are considered.
     *   - A blank submitted value is never written (clearing here does nothing).
     *   - An unchanged value is never written; nothing changed → no write at all.
     *   - Everything that did change goes in ONE record.submitFields; dates as Date objects.
     *   - Never throws. A failure is logged and returned in `error`.
     *   - custbody_opportunity_sub_status is never written (not in OPP_UPDATE_FIELDS).
     *
     * @param {string} opportunityId
     * @param {ServerRequest} request
     * @returns {{attempted: boolean, changed: Array<{key: string, label: string, fieldId: string, from: string, to: string}>, error: string}}
     *          On error, `changed` lists the fields that were attempted but not saved.
     */
    function updateOpportunityFields(opportunityId, request) {
        var result = { attempted: false, changed: [], error: '' };
        var values = {};
        var logParts = [];

        try {
            var params = request.parameters || {};
            var shownKeys = String(params[OPP_UPDATE_KEYS_FIELD] || '').split(',').filter(function (k) { return k; });

            OPP_UPDATE_FIELDS.forEach(function (def) {
                if (shownKeys.indexOf(def.key) === -1) return;

                var submitted = String(params[updFieldId(def)] || '').trim();
                var orig      = String(params[origFieldId(def)] || '').trim();
                var origText  = String(params[origTextFieldId(def)] || '').trim();

                if (!submitted) return;   // a blank never clears data

                if (def.kind === 'select') {
                    if (submitted === orig) return;
                    values[def.fieldId] = submitted;
                    result.changed.push({ key: def.key, label: def.label, fieldId: def.fieldId, from: origText || orig, to: submitted });
                    logParts.push(def.fieldId + ': ' + (orig || '(blank)') + ' → ' + submitted);
                } else {
                    // v2.0.1: yyyy-mm-dd from the date picker; compared as strings
                    var newDate = parseIsoDate(submitted);
                    if (!newDate) {
                        log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                            ' value "' + submitted + '" is not a yyyy-mm-dd calendar date; not written');
                        return;
                    }
                    if (submitted === orig) return;
                    values[def.fieldId] = newDate;
                    result.changed.push({ key: def.key, label: def.label, fieldId: def.fieldId, from: origText || orig, to: submitted });
                    logParts.push(def.fieldId + ': ' + (orig || '(blank)') + ' → ' + submitted);
                }
            });

            if (result.changed.length === 0) {
                log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — no changes');
                return result;
            }

            // v2.0.0: sourcing ON only when Status changed. With enableSourcing: false, Probability
            // did not follow a new Status in Sandbox (1.8.0, S5) — Probability is sourced from the
            // status. Kept OFF otherwise so a date/Build stage change sources nothing.
            var statusChanged = values.hasOwnProperty('entitystatus');

            result.attempted = true;
            record.submitFields({
                type:    record.Type.OPPORTUNITY,
                id:      opportunityId,
                values:  values,
                options: {
                    enableSourcing:        statusChanged,
                    ignoreMandatoryFields: true
                }
            });

            log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — updated ' + logParts.join('; ') +
                ' (enableSourcing: ' + statusChanged + ')');

        } catch (e) {
            log.error('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — update FAILED. Attempted: ' +
                (logParts.join('; ') || '(none)') + ' | Error: ' + e.message);
            result.error = e.message || String(e);
        }

        return result;
    }

    // ─── Forecast flags (v2.0.0) ──────────────────────────────────────────────────

    /**
     * Normalises a checkbox value to a boolean. record.getValue() returns a boolean in
     * standard mode, but lookupFields / search results can return 'T' / 'F' strings.
     *
     * @returns {boolean|null} null when the value is unknown
     */
    function normaliseCheckbox(v) {
        if (v === true || v === 'T' || v === 't' || v === 'true' || v === 'Y') return true;
        if (v === false || v === 'F' || v === 'f' || v === 'false' || v === 'N' || v === '') return false;
        return null;
    }

    /**
     * Sets Include in Forecast on the Opportunity's quotes to match the send: true for Main,
     * false for Additional and Leave out.
     *
     *   - Runs only after a successful email; independent of updateOpportunityFields().
     *   - Only quotes the page showed (searchRelatedQuotes) are considered — never any other
     *     Estimate on the Opportunity.
     *   - Writes only where the current value differs. One submitFields per Estimate, each in
     *     its own try/catch.
     *   - F6: the field is ASSUMED to be includeinforecast (checkbox). If the loaded Estimates
     *     report it absent or not a checkbox, nothing is written and it is audit-logged only.
     *
     * @returns {{included: number, excluded: number, failed: Array<string>, changed: number, skipped: boolean}}
     *          included/excluded are the target states of the quotes on the page.
     */
    function updateForecastFlags(opportunityId, selectionMap, quotes) {
        var result = { included: 0, excluded: 0, failed: [], changed: 0, skipped: false };

        try {
            var fieldType = null;
            for (var i = 0; i < quotes.length; i++) {
                if (quotes[i].forecastFieldType !== undefined && quotes[i].forecastFieldType !== null) {
                    fieldType = quotes[i].forecastFieldType;
                    break;
                }
            }
            if (fieldType !== 'checkbox') {
                result.skipped = true;
                log.audit('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — ' + FORECAST_FIELD +
                    ' reported as "' + (fieldType || 'unknown: no Estimate could be loaded') +
                    '", expected "checkbox"; no forecast writes');
                return result;
            }

            quotes.forEach(function (q) {
                var id     = String(q.id);
                var target = selectionMap[id] === ROLE_MAIN;
                if (target) { result.included++; } else { result.excluded++; }

                var current = normaliseCheckbox(q.includeInForecast);
                if (current === null) {
                    log.audit('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — Estimate ' + id +
                        ' (' + q.tranId + ') current value unknown; not written');
                    return;
                }
                if (current === target) return;

                try {
                    record.submitFields({
                        type:    record.Type.ESTIMATE,
                        id:      id,
                        values:  { includeinforecast: target },
                        options: {
                            enableSourcing:        false,
                            ignoreMandatoryFields: true
                        }
                    });
                    result.changed++;
                    log.audit('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — Estimate ' + id +
                        ' (' + q.tranId + ') ' + current + ' → ' + target);
                } catch (e) {
                    result.failed.push(id);
                    log.error('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — Estimate ' + id +
                        ' (' + q.tranId + ') ' + current + ' → ' + target + ' FAILED: ' + e.message);
                }
            });

            log.audit('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — targets: ' + result.included +
                ' included, ' + result.excluded + ' excluded; written: ' + result.changed +
                '; failed: ' + (result.failed.join(',') || 'none'));

        } catch (e) {
            log.error('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — unexpected error: ' + e.message);
        }

        return result;
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
                // v1.6.0: BUS grant resolved from this Estimate's Suppak line item. The Master
                // Proposal never loads an Estimate, so the resolution has to happen here.
                var busAmountVal = 0;
                var busRateVal = 'none';
                // v2.0.0: forecast flag, read off the record this loop already loads — NOT a search
                // column: one invalid column aborts the whole search (see v1.4.5 above). undefined
                // type = record not loaded, so the field could not be checked.
                var includeInForecastVal = null;
                var forecastFieldType;
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

                        // v1.6.0: Read the item sublist and resolve the BUS rate. itemName uses
                        // getSublistText (the SKU/display name), matching how the Quote Suitelet
                        // builds line items — the BUS module normalises either form.
                        var busLineItems = [];
                        var estLineCount = estimateRec.getLineCount({ sublistId: 'item' });
                        for (var li = 0; li < estLineCount; li++) {
                            busLineItems.push({
                                itemName: estimateRec.getSublistText({ sublistId: 'item', fieldId: 'item', line: li }) || ''
                            });
                        }
                        var busResult = busGrant.resolveBusGrant(busLineItems);
                        busAmountVal = busResult.amount;
                        busRateVal   = busResult.rate;

                        log.audit('SendQuoteSL.BUS', 'Estimate ' + estimateId + ' — lines=' + estLineCount +
                            ', rate=' + busRateVal + ', amount=' + busAmountVal +
                            ', matched=' + (busResult.matchedItem || 'none'));

                        try {
                            var forecastField = estimateRec.getField({ fieldId: FORECAST_FIELD });
                            forecastFieldType = forecastField ? String(forecastField.type || '').toLowerCase() : 'absent';
                            if (forecastField) {
                                includeInForecastVal = normaliseCheckbox(estimateRec.getValue({ fieldId: FORECAST_FIELD }));
                            }
                        } catch (forecastErr) {
                            forecastFieldType = 'error: ' + forecastErr.message;
                        }
                    } catch (pricingErr) {
                        log.debug('SendQuoteSL.searchRelatedQuotes', 'Could not load Estimate record ' + estimateId +
                            ' for pricing: ' + pricingErr.message + ' — will use search total as fallback');
                        // Fallback: use total from search for amount, zeros for discount/tax
                        totalVal = result.getValue({ name: 'total' }) || '';
                    }
                }

                // ── v1.7.0: VAT derived from the quote's technology ──────────────────────
                // ⚠️ quoteTypeDisplay, NOT rawQuoteType. VAT_RATES is keyed on display names
                // ('Heat Pump'), while rawQuoteType holds the list value ('Heat Pump (ASHP)',
                // 'Heat Emitter'). Passing the raw value would fail to match and fall through
                // to the 20% default — charging an ASHP/GSHP/EAHP heat pump quote 20% VAT,
                // which is the exact bug this change exists to fix. (nuheat_vat_rates also
                // normalises raw values defensively, so both forms resolve correctly.)
                var vatInfo = vatRates.resolveVatRate(quoteTypeDisplay);

                // Only derive when record.load() actually returned pricing. On the fallback
                // path (load failed) subtotalVal is empty and the search 'total' is all we
                // have — deriving there would silently zero the quote's amount.
                var hasPricing = (subtotalVal !== '' && subtotalVal !== null && subtotalVal !== undefined);
                var netAmount  = hasPricing
                    ? (parseFloat(subtotalVal) || 0) - Math.abs(parseFloat(discountTotalVal) || 0)
                    : 0;
                var derivedVat = hasPricing ? vatRates.calculateVat(netAmount, vatInfo.rate) : 0;

                if (hasPricing) {
                    vatRates.logVatMismatch('SendQuoteSL', estimateId, derivedVat, taxTotalVal, quoteTypeDisplay);
                } else {
                    log.audit('SendQuoteSL.VAT', 'Estimate ' + estimateId +
                        ' — no pricing from record.load(); using NetSuite fallback figures, VAT not derived.');
                }

                log.audit('SendQuoteSL.VAT', 'Estimate ' + estimateId + ' — type="' + quoteTypeDisplay +
                    '", rate=' + vatInfo.percent + ', net=' + netAmount.toFixed(2) +
                    ', derivedVat=' + derivedVat.toFixed(2) + ', nsTaxTotal=' + (taxTotalVal || '0'));

                var amountValue = hasPricing ? (netAmount + derivedVat)
                                             : (parseFloat(totalVal || result.getValue({ name: 'total' })) || 0);
                // Live total on the page mirrors the proposal's "Total inc. VAT": inc-VAT amount
                // less the BUS grant where one applies (master proposal calculateTotals()).
                var grantDeduction = (busRateVal !== 'none' && busAmountVal > 0) ? busAmountVal : 0;

                quotes.push({
                    id:               estimateId,
                    dateCreated:      formatDate(result.getValue({ name: 'datecreated' })),
                    dateCreatedRaw:   result.getValue({ name: 'datecreated' }) || '',   // v2.0.3: user-format text, for the card
                    titleRaw:         result.getValue({ name: 'title' }) || '',         // v2.0.3: card fallback (no '(Untitled)')
                    tranId:           result.getValue({ name: 'tranid' }) || '',
                    title:            result.getValue({ name: 'title' })  || '(Untitled)',
                    quoteTypeRaw:     rawQuoteType,
                    quoteTypeDisplay: quoteTypeDisplay,
                    subtotal:         formatCurrency(subtotalVal),
                    discountTotal:    formatCurrency(discountTotalVal),
                    // ⚠️ v1.7.0: taxTotal and amount are DERIVED, not NetSuite values — see the
                    // v1.7.0 changelog at the top of this file before "fixing" this back.
                    taxTotal:         hasPricing ? formatCurrency(derivedVat) : formatCurrency(taxTotalVal),
                    amount:           hasPricing ? formatCurrency(netAmount + derivedVat)
                                                 : formatCurrency(totalVal || result.getValue({ name: 'total' })),
                    busAmount:        busAmountVal,   // v1.6.0: 0 | 7500 | 9000
                    busRate:          busRateVal,     // v1.6.0: 'none' | 'standard' | 'enhanced'
                    vatRate:          vatInfo.rate,     // v1.7.0: 0 | 0.20
                    vatPercent:       vatInfo.percent,  // v1.7.0: '0%' | '20%'
                    quoteUrl:         result.getValue({ name: 'custbody_test_new_quote' }) || '',
                    description:      result.getValue({ name: 'custbody_quote_description' }) || '',
                    // v2.0.0: page-only values — never passed to the Master Proposal
                    netValue:          hasPricing ? netAmount : null,        // ex VAT, after discount
                    totalValue:        Math.round((amountValue - grantDeduction) * 100) / 100,
                    includeInForecast: includeInForecastVal,                  // true | false | null
                    forecastFieldType: forecastFieldType                      // 'checkbox' expected
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

    // ─── Page HTML (v2.0.0) ───────────────────────────────────────────────────────
    //
    // ⚠️ Inline-HTML rules (see AI_AGENT_CONTEXT §9):
    //   - Every interpolated value goes through escapeHtml() (& < > " '). Titles and
    //     descriptions are tag-stripped FIRST (quote titles can contain <b>…</b>).
    //   - Record and user data live ONLY in element text and data- / value attributes.
    //     NOTHING is interpolated into the <script> block: a "</script>" sequence would end the
    //     block regardless of HTML escaping. PAGE_SCRIPT below is a static string.

    var PAGE_COLORS = {
        page:   '#f4f2ef',
        card:   '#ffffff',
        border: '#e2ded9',
        text:   '#2b2a2e',
        muted:  '#5f5b66',
        accent: '#59315f',
        send:   '#ffb500'
    };

    function stripTags(str) {
        return String(str || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * v2.0.3: Decodes HTML entities — &amp; &lt; &gt; &quot; &#39; &apos; &nbsp; and numeric
     * &#nnn; / &#xhh;. Single pass. ⚠️ Call BEFORE stripTags(), never after: decoding after
     * stripping would turn "&lt;script&gt;" into a live tag.
     */
    function decodeEntities(str) {
        var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        return String(str || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
            var code;
            if (e.charAt(0) === '#') {
                code = (e.charAt(1) === 'x' || e.charAt(1) === 'X') ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10);
                return (code > 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : m;
            }
            var k = e.toLowerCase();
            return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : m;
        });
    }

    /**
     * v2.0.3: Card text — decode, then strip tags, then collapse whitespace. The caller escapes
     * the result exactly once with escapeHtml().
     */
    function cleanCardText(str) {
        return stripTags(decodeEntities(str));
    }

    /** v2.0.3: "28/09/2026 2:32 pm" → "28/09/2026" — the user's own date format, time removed. */
    function createdDateText(raw) {
        return String(raw || '').trim().replace(/[\sT]+\d{1,2}:\d{2}(:\d{2})?(\s*[ap]\.?m\.?)?$/i, '').trim();
    }

    function money(n) {
        return formatSignedCurrency(n);
    }

    /**
     * Builds the Send proposal page body.
     */
    function buildSendPageHTML(page, restore, errorMessage) {
        var h = [];
        var hasQuotes = page.quotes.length > 0;

        h.push(buildPageCSS());
        h.push('<div id="nsq-root" class="nsq" data-preview-url="' + escapeHtml(page.previewUrl) + '" data-opp-url="' +
            escapeHtml(page.oppUrl) + '">');
        h.push('<div class="nsq-wrap">');

        // ── Header ──
        h.push('<a class="nsq-back" href="' + escapeHtml(page.oppUrl) + '">&larr; Back to opportunity ' + escapeHtml(page.tranId) + '</a>');
        h.push('<h1 class="nsq-h1">Send proposal</h1>');
        var meta = [];
        if (page.title)        meta.push('<span>' + escapeHtml(cleanCardText(page.title)) + '</span>');   // v2.0.4: decode first
        if (page.customerName) meta.push('<span>' + escapeHtml(page.customerName) + '</span>');
        if (page.siteAddress)  meta.push('<span>Site: ' + escapeHtml(page.siteAddress) + '</span>');
        if (page.status)       meta.push('<span class="nsq-badge">' + escapeHtml(page.status) + '</span>');
        h.push('<div class="nsq-meta">' + meta.join('<span class="nsq-dot">&middot;</span>') + '</div>');

        if (errorMessage) {
            h.push('<div class="nsq-alert nsq-alert-error" role="alert"><strong>Not sent.</strong> ' + escapeHtml(errorMessage) + '</div>');
        }

        if (!hasQuotes) {
            h.push('<div class="nsq-alert nsq-alert-warn">' +
                '<strong>No quotes found.</strong> There are no Estimates linked to this Opportunity with a generated online quote. ' +
                'Open the Estimate and click <strong>Regen quote</strong>, then come back.' +
                '</div>');
            h.push('</div></div>');
            return h.join('');
        }

        h.push('<input type="hidden" name="custpage_opportunity_id" value="' + escapeHtml(page.opportunityId) + '">');
        h.push('<input type="hidden" name="custpage_sel" id="nsq-sel" value="">');

        // ── 1 Choose quotes ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">1</span>Choose quotes</h2>');
        var single = page.quotes.length === 1;
        QUOTE_TYPE_ORDER.forEach(function (type) {
            var group = page.quotes.filter(function (q) {
                var qType = QUOTE_TYPE_ORDER.indexOf(q.quoteTypeDisplay) === -1 ? 'Other' : q.quoteTypeDisplay;
                return qType === type;
            });
            if (!group.length) return;
            h.push('<h3 class="nsq-h3">' + escapeHtml(type) + ' <span class="nsq-count">' + group.length + '</span></h3>');
            group.forEach(function (q) {
                var role;
                if (restore) {
                    role = restore.selection[String(q.id)] || 'leave';
                } else {
                    role = single ? ROLE_MAIN : 'leave';
                }
                h.push(buildQuoteRowHTML(q, role));
            });
        });
        h.push('</section>');

        // ── 2 Send to ──
        var toValue = restore ? restore.to : page.customerEmail;
        var ccValue = restore ? restore.cc : '';
        var bccValue = restore ? restore.bcc : '';
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">2</span>Send to</h2>');
        h.push('<div class="nsq-to-row">');
        h.push('<div class="nsq-field nsq-grow"><label class="nsq-label" for="nsq-to-input">To</label>' +
            '<div class="nsq-tagbox" id="nsq-tagbox"><span id="nsq-tags"></span>' +
            '<input type="text" id="nsq-to-input" class="nsq-tag-input" autocomplete="off" placeholder="Add an email address"></div>' +
            '<input type="hidden" name="custpage_email_to" id="nsq-to" value="' + escapeHtml(toValue) + '"></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-contact">Add a contact on this opportunity</label>' +
            '<select id="nsq-contact" class="nsq-input"><option value="">Choose a contact…</option>');
        page.contacts.forEach(function (c) {
            if (c.email) {
                h.push('<option value="' + escapeHtml(c.email) + '">' + escapeHtml(c.name + ' (' + c.email + ')') + '</option>');
            } else {
                h.push('<option value="" disabled>' + escapeHtml(c.name + ' (no email)') + '</option>');
            }
        });
        h.push('</select></div></div>');
        h.push('<div class="nsq-links"><a href="#" id="nsq-add-cc">+ Add CC</a><a href="#" id="nsq-add-bcc">+ Add BCC</a></div>');
        h.push('<div class="nsq-field" id="nsq-cc-wrap"' + (ccValue ? '' : ' hidden') + '><label class="nsq-label" for="nsq-cc">CC</label>' +
            '<input type="text" class="nsq-input" name="custpage_email_cc" id="nsq-cc" value="' + escapeHtml(ccValue) + '" placeholder="Separate addresses with commas"></div>');
        h.push('<div class="nsq-field" id="nsq-bcc-wrap"' + (bccValue ? '' : ' hidden') + '><label class="nsq-label" for="nsq-bcc">BCC</label>' +
            '<input type="text" class="nsq-input" name="custpage_email_bcc" id="nsq-bcc" value="' + escapeHtml(bccValue) + '" placeholder="Separate addresses with commas"></div>');
        h.push('</section>');

        // ── 3 Update the opportunity ──
        if (page.updateFields.length) {
            h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">3</span>Update the opportunity</h2>');
            h.push('<div class="nsq-upd-grid">');
            page.updateFields.slice().sort(function (a, b) {
                return OPP_UPDATE_DISPLAY_ORDER.indexOf(a.def.key) - OPP_UPDATE_DISPLAY_ORDER.indexOf(b.def.key);
            }).forEach(function (p) {
                h.push(buildUpdateFieldHTML(p, restore));
            });
            h.push('</div>');
            h.push('<input type="hidden" name="' + OPP_UPDATE_KEYS_FIELD + '" value="' +
                escapeHtml(page.updateFields.map(function (p) { return p.def.key; }).join(',')) + '">');
            h.push('</section>');
        }

        h.push('</div>'); // .nsq-wrap

        // ── Sticky footer ──
        h.push('<div class="nsq-footer"><div class="nsq-footer-in">');
        h.push('<div class="nsq-sum"><div class="nsq-sum-main" id="nsq-sum-line"></div>' +
            '<div class="nsq-sum-sub" id="nsq-sum-to"></div><div class="nsq-sum-sub" id="nsq-sum-changes"></div></div>');
        h.push('<div class="nsq-actions"><span class="nsq-reason" id="nsq-reason"></span>' +
            '<a class="nsq-btn nsq-btn-link" href="' + escapeHtml(page.oppUrl) + '">Cancel</a>' +
            '<button type="button" class="nsq-btn nsq-btn-secondary" id="nsq-preview">Preview</button>' +
            '<button type="button" class="nsq-btn nsq-btn-primary" id="nsq-send" disabled>Send proposal</button></div>');
        h.push('</div></div>');

        h.push('</div>'); // #nsq-root
        h.push('<script>' + PAGE_SCRIPT + '</script>');
        return h.join('');
    }

    /**
     * One quote row. Prices live in data- attributes for the live total; nothing here is
     * posted except the role, which the script collects into custpage_sel.
     */
    function buildQuoteRowHTML(q, role) {
        // v2.0.3: line 1 = tranid · description (falls back to the title, then tranid alone);
        // line 2 = facts. Every text: decode → strip → collapse → escape once.
        var desc  = cleanCardText(q.description);
        var main  = desc || cleanCardText(q.titleRaw);
        var line1 = main ? q.tranId + ' · ' + main : String(q.tranId || '');
        var facts = [];
        var created = createdDateText(q.dateCreatedRaw);
        if (created) facts.push('Created ' + created);
        var qType = cleanCardText(q.quoteTypeRaw);
        if (qType) facts.push(qType);
        var bus = parseFloat(q.busAmount);
        if (bus > 0) facts.push('BUS grant ' + formatCurrency(bus).replace(/\.00$/, '') + ' applied');
        var line2 = facts.join(' · ');
        var roles = [['leave', 'Leave out'], [ROLE_MAIN, 'Main'], [ROLE_ADDITIONAL, 'Additional']];
        var seg = roles.map(function (r) {
            return '<button type="button" class="nsq-seg-btn" data-set-role="' + r[0] + '" aria-pressed="' +
                (r[0] === role ? 'true' : 'false') + '">' + r[1] + '</button>';
        }).join('');

        var exVat = (q.netValue === null || q.netValue === undefined) ? '' :
            '<span class="nsq-exvat">' + escapeHtml(money(q.netValue)) + ' ex VAT</span>';

        return '<div class="nsq-row' + (role === ROLE_MAIN ? ' nsq-row-main' : '') + '" data-qid="' + escapeHtml(String(q.id)) +
            '" data-role="' + role + '" data-total="' + escapeHtml(String(q.totalValue || 0)) + '">' +
            '<div class="nsq-seg" role="group" aria-label="Include as">' + seg + '</div>' +
            '<div class="nsq-q"><div class="nsq-q-title" title="' + escapeHtml(line1) + '">' + escapeHtml(line1) + '</div>' +
            (line2 ? '<div class="nsq-q-desc" title="' + escapeHtml(line2) + '">' + escapeHtml(line2) + '</div>' : '') +
            '</div>' +
            '<div class="nsq-price"><strong>' + escapeHtml(q.amount) + '</strong>' + exVat + '</div>' +
            (q.quoteUrl ? '<a class="nsq-view" href="' + escapeHtml(q.quoteUrl) + '" target="_blank" rel="noopener">View</a>' : '<span class="nsq-view"></span>') +
            '</div>';
    }

    /**
     * One update field: a plain <select> / text <input> named as the 1.8.0 parameters, plus
     * its hidden originals. Originals are also data- attributes for the "Changed" marker.
     */
    function buildUpdateFieldHTML(p, restore) {
        var def = p.def;
        var id = updFieldId(def);
        var value = (restore && restore.upd[def.key] !== undefined) ? restore.upd[def.key] : p.orig;
        var attrs = ' name="' + id + '" id="' + id + '" class="nsq-input nsq-upd" data-key="' + def.key +
            '" data-label="' + escapeHtml(def.label) + '" data-orig="' + escapeHtml(p.orig) +
            '" data-orig-text="' + escapeHtml(p.origText) + '"';
        var control;

        if (def.kind === 'select') {
            var known = p.options.some(function (o) { return String(o.value) === value; });
            if (!known && !(def.blankOption && value === '')) value = p.orig;
            var opts = [];
            if (def.blankOption) {
                opts.push('<option value=""' + (value === '' ? ' selected' : '') + '></option>');
            }
            p.options.forEach(function (o) {
                var v = String(o.value);
                opts.push('<option value="' + escapeHtml(v) + '"' + (v === value ? ' selected' : '') + '>' + escapeHtml(o.text) + '</option>');
            });
            control = '<select' + attrs + '>' + opts.join('') + '</select>';
        } else {
            // v2.0.1: native date picker — displays in the browser's locale, posts yyyy-mm-dd
            control = '<input type="date"' + attrs + ' value="' + escapeHtml(value) + '">';
        }

        return '<div class="nsq-field nsq-upd-field"><label class="nsq-label" for="' + id + '">' + escapeHtml(def.label) + '</label>' +
            control + '<div class="nsq-was" hidden></div>' +
            '<input type="hidden" name="' + origFieldId(def) + '" value="' + escapeHtml(p.orig) + '">' +
            '<input type="hidden" name="' + origTextFieldId(def) + '" value="' + escapeHtml(p.origText) + '">' +
            '</div>';
    }

    function buildPageCSS() {
        var c = PAGE_COLORS;
        return '<style>' +
            '.nsq{font-size:15px;color:' + c.text + ';background:' + c.page + ';margin:0;padding:20px 16px 140px;box-sizing:border-box;font-family:inherit;}' +
            '.nsq *{box-sizing:border-box;}' +
            '.nsq-wrap{max-width:1120px;margin:0 auto;}' +
            '.nsq a{color:' + c.accent + ';}' +
            '.nsq-back{display:inline-block;margin-bottom:8px;text-decoration:none;font-size:14px;}' +
            '.nsq-h1{font-size:26px;margin:0 0 6px;font-weight:700;color:' + c.text + ';}' +
            '.nsq-meta{color:' + c.muted + ';margin-bottom:18px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;}' +
            '.nsq-dot{color:' + c.border + ';}' +
            '.nsq-badge{background:#ede6ef;color:' + c.accent + ';border-radius:999px;padding:2px 10px;font-weight:600;font-size:13px;}' +
            '.nsq-alert{border-radius:10px;padding:14px 16px;margin:0 0 16px;border:1px solid;}' +
            '.nsq-alert-error{background:#fbeaea;border-color:#e3a5a5;color:#7a1d1d;}' +
            '.nsq-alert-warn{background:#fff6e0;border-color:#f0cf7a;color:#6b4d00;}' +
            '.nsq-card{background:' + c.card + ';border:1px solid ' + c.border + ';border-radius:10px;padding:20px;margin-bottom:16px;}' +
            '.nsq-h2{font-size:18px;margin:0 0 14px;display:flex;align-items:center;gap:10px;color:' + c.text + ';}' +
            '.nsq-num{display:inline-flex;width:28px;height:28px;border-radius:50%;background:' + c.accent + ';color:#fff;align-items:center;justify-content:center;font-size:14px;}' +
            '.nsq-h3{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:' + c.muted + ';margin:16px 0 8px;}' +
            '.nsq-count{background:' + c.page + ';border-radius:999px;padding:1px 8px;font-size:12px;margin-left:4px;}' +
            '.nsq-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:16px;align-items:center;border:1px solid ' + c.border + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;}' +
            '.nsq-row-main{border:2px solid ' + c.accent + ';padding:11px 13px;}' +
            '.nsq-seg{display:inline-flex;border:1px solid ' + c.border + ';border-radius:8px;overflow:hidden;}' +
            '.nsq-seg-btn{min-height:44px;padding:0 14px;border:0;background:#fff;color:' + c.muted + ';font-size:14px;cursor:pointer;}' +
            '.nsq-seg-btn+.nsq-seg-btn{border-left:1px solid ' + c.border + ';}' +
            '.nsq-seg-btn[aria-pressed="true"]{background:' + c.accent + ';color:#fff;font-weight:600;}' +
            '.nsq-q{min-width:0;}' +
            '.nsq-q-title{font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;overflow-wrap:anywhere;}' +
            '.nsq-q-desc{color:' + c.muted + ';font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.nsq-price{text-align:right;white-space:nowrap;}' +
            '.nsq-price strong{display:block;font-size:16px;}' +
            '.nsq-exvat{display:block;color:' + c.muted + ';font-size:13px;}' +
            '.nsq-view{font-weight:600;min-width:40px;}' +
            '.nsq-to-row{display:flex;gap:16px;flex-wrap:wrap;}' +
            '.nsq-grow{flex:1 1 360px;}' +
            '.nsq-field{margin-bottom:12px;}' +
            '.nsq-label{display:block;font-weight:600;font-size:14px;margin-bottom:6px;}' +
            '.nsq-input{min-height:44px;width:100%;padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;font-size:15px;color:' + c.text + ';background:#fff;}' +
            '.nsq-tagbox{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:44px;padding:6px 8px;border:1px solid ' + c.border + ';border-radius:8px;background:#fff;}' +
            '.nsq-tag{display:inline-flex;align-items:center;gap:6px;background:#ede6ef;color:' + c.accent + ';border-radius:999px;padding:4px 6px 4px 12px;font-size:14px;}' +
            '.nsq-tag-bad{background:#fbeaea;color:#7a1d1d;}' +
            '.nsq-tag button{border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1;color:inherit;padding:0 4px;}' +
            '.nsq-tag-input{flex:1 1 180px;border:0;outline:0;min-height:30px;font-size:15px;}' +
            '.nsq-links{display:flex;gap:18px;margin-bottom:12px;}' +
            '.nsq-upd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;}' +
            '.nsq-upd-changed{border:2px solid ' + c.accent + ';}' +
            '.nsq-was{font-size:13px;color:' + c.accent + ';margin-top:4px;}' +
            '.nsq-footer{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid ' + c.border + ';box-shadow:0 -2px 8px rgba(0,0,0,.06);z-index:1000;}' +
            '.nsq-footer-in{max-width:1120px;margin:0 auto;padding:12px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;}' +
            '.nsq-sum-main{font-weight:600;}' +
            '.nsq-sum-sub{color:' + c.muted + ';font-size:13px;}' +
            '.nsq-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}' +
            '.nsq-reason{color:' + c.muted + ';font-size:13px;}' +
            '.nsq-btn{min-height:44px;padding:0 18px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;}' +
            '.nsq-btn-link{background:transparent;border:0;}' +
            '.nsq-btn-secondary{background:#fff;border:1px solid ' + c.accent + ';color:' + c.accent + ';}' +
            '.nsq-btn-primary{background:' + c.send + ';border:0;color:' + c.text + ';}' +
            '.nsq-btn[disabled]{opacity:.45;cursor:not-allowed;}' +
            '@media (max-width:900px){.nsq-row{grid-template-columns:1fr auto;}}' +
            '</style>';
    }

    /**
     * The page's behaviour. STATIC — nothing is interpolated into it (see the rules above).
     * It reads quote IDs, totals, roles and field originals from data- attributes.
     */
    var PAGE_SCRIPT = [
        '(function () {',
        '  "use strict";',
        '  var EMAIL_RE = /^[^\\s@,;<>"\']+@[^\\s@,;<>"\']+\\.[^\\s@,;<>"\']+$/;',
        '  function $(id) { return document.getElementById(id); }',
        '  function each(list, fn) { Array.prototype.forEach.call(list, fn); }',
        '  function money(n) { var s = Math.abs(n).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); return (n < 0 ? "-£" : "£") + s; }',
        '  function split(v) { return String(v || "").split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean); }',
        '  function init() {',
        '    var root = $("nsq-root");',
        '    if (!root || !$("nsq-sel")) return;',
        '    var rows = root.querySelectorAll(".nsq-row");',
        '    var toHidden = $("nsq-to"), toInput = $("nsq-to-input"), tagsEl = $("nsq-tags");',
        '    var to = split(toHidden.value);',
        '    function renderTags() {',
        '      tagsEl.innerHTML = "";',
        '      to.forEach(function (addr, i) {',
        '        var tag = document.createElement("span");',
        '        tag.className = "nsq-tag" + (EMAIL_RE.test(addr) ? "" : " nsq-tag-bad");',
        '        tag.appendChild(document.createTextNode(addr));',
        '        var x = document.createElement("button");',
        '        x.type = "button"; x.setAttribute("aria-label", "Remove " + addr); x.appendChild(document.createTextNode("×"));',
        '        x.addEventListener("click", function () { to.splice(i, 1); renderTags(); update(); });',
        '        tag.appendChild(x); tagsEl.appendChild(tag);',
        '      });',
        '      toHidden.value = to.join(",");',
        '    }',
        '    function addTo(v) { split(v).forEach(function (a) { if (to.indexOf(a) === -1) to.push(a); }); renderTags(); update(); }',
        '    toInput.addEventListener("keydown", function (e) {',
        '      if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); if (toInput.value.trim()) { addTo(toInput.value); toInput.value = ""; } }',
        '      else if (e.key === "Backspace" && !toInput.value && to.length) { to.pop(); renderTags(); update(); }',
        '    });',
        '    toInput.addEventListener("blur", function () { if (toInput.value.trim()) { addTo(toInput.value); toInput.value = ""; } });',
        '    var contact = $("nsq-contact");',
        '    if (contact) contact.addEventListener("change", function () { if (contact.value) addTo(contact.value); contact.value = ""; });',
        '    function reveal(linkId, wrapId, inputId) {',
        '      var link = $(linkId);',
        '      link.addEventListener("click", function (e) { e.preventDefault(); $(wrapId).hidden = false; link.hidden = true; $(inputId).focus(); });',
        '      if (!$(wrapId).hidden) link.hidden = true;',
        '    }',
        '    reveal("nsq-add-cc", "nsq-cc-wrap", "nsq-cc");',
        '    reveal("nsq-add-bcc", "nsq-bcc-wrap", "nsq-bcc");',
        '    each(rows, function (row) {',
        '      each(row.querySelectorAll("[data-set-role]"), function (btn) {',
        '        btn.addEventListener("click", function () { row.setAttribute("data-role", btn.getAttribute("data-set-role")); update(); });',
        '      });',
        '    });',
        '    var upd = root.querySelectorAll(".nsq-upd");',
        '    each(upd, function (el) { el.addEventListener("change", update); el.addEventListener("input", update); });',
        '    each(root.querySelectorAll("input[type=text], input[type=date]"), function (el) {',
        '      if (el === toInput) return;',
        '      el.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });',
        '      el.addEventListener("input", update);',
        '    });',
        '    function selection() {',
        '      var sel = {};',
        '      each(rows, function (row) { var r = row.getAttribute("data-role"); if (r === "main" || r === "additional") sel[row.getAttribute("data-qid")] = r; });',
        '      return sel;',
        '    }',
        '    function fieldText(el) {',
        '      if (el.tagName === "SELECT") return el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : "";',
        '      if (el.type === "date" && el.valueAsDate) return el.valueAsDate.toLocaleDateString(undefined, { timeZone: "UTC" });',
        '      return el.value.trim();',
        '    }',
        '    function problem() {',
        '      var sel = selection(), hasMain = false;',
        '      Object.keys(sel).forEach(function (k) { if (sel[k] === "main") hasMain = true; });',
        '      if (!hasMain) return "Choose at least one Main quote.";',
        '      if (!to.length) return "Add a To address.";',
        '      if (to.some(function (a) { return !EMAIL_RE.test(a); })) return "Check the To addresses.";',
        '      var bad = split($("nsq-cc").value).concat(split($("nsq-bcc").value)).some(function (a) { return !EMAIL_RE.test(a); });',
        '      if (bad) return "Check the CC / BCC addresses.";',
        '      return "";',
        '    }',
        '    function update() {',
        '      var main = 0, add = 0, total = 0;',
        '      each(rows, function (row) {',
        '        var r = row.getAttribute("data-role");',
        '        each(row.querySelectorAll("[data-set-role]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-set-role") === r ? "true" : "false"); });',
        '        row.className = "nsq-row" + (r === "main" ? " nsq-row-main" : "");',
        '        if (r === "main") { main++; total += parseFloat(row.getAttribute("data-total")) || 0; }',
        '        else if (r === "additional") { add++; }',
        '      });',
        '      var line = main + " main quote" + (main === 1 ? "" : "s") + ", " + add + " additional";',
        '      if (main) line += " · " + money(total) + " inc VAT";',
        '      $("nsq-sum-line").textContent = line;',
        '      $("nsq-sum-to").textContent = to.length ? "To " + to[0] + (to.length > 1 ? " +" + (to.length - 1) : "") : "No To address yet";',
        '      var changes = [];',
        '      each(upd, function (el) {',
        '        var wrap = el.parentNode, was = wrap.querySelector(".nsq-was");',
        '        var v = el.value.trim(), orig = el.getAttribute("data-orig");',
        '        var origText = el.getAttribute("data-orig-text") || "blank";',
        '        if (v !== orig && v !== "") {',
        '          el.classList.add("nsq-upd-changed"); was.hidden = false; was.textContent = "Changed · was " + origText;',
        '          changes.push(el.getAttribute("data-label") + " → " + fieldText(el));',
        '        } else if (v === "" && orig !== "") {',
        '          el.classList.remove("nsq-upd-changed"); was.hidden = false; was.textContent = "Blank is not saved · stays " + origText;',
        '        } else {',
        '          el.classList.remove("nsq-upd-changed"); was.hidden = true; was.textContent = "";',
        '        }',
        '      });',
        '      $("nsq-sum-changes").textContent = changes.join(" · ");',
        '      var p = problem();',
        '      $("nsq-send").disabled = !!p;',
        '      $("nsq-reason").textContent = p;',
        '    }',
        '    function formEl() { return document.getElementById("main_form") || root.closest("form"); }',
        '    $("nsq-send").addEventListener("click", function () {',
        '      var p = problem(); if (p) { $("nsq-reason").textContent = p; return; }',
        '      var form = formEl();',
        '      if (!form) { $("nsq-reason").textContent = "Could not find the page form. Please reload and try again."; return; }',
        '      $("nsq-sel").value = JSON.stringify(selection());',
        '      toHidden.value = to.join(",");',
        '      $("nsq-send").disabled = true; $("nsq-send").textContent = "Sending…"; $("nsq-preview").disabled = true;',
        '      HTMLFormElement.prototype.submit.call(form);',
        '    });',
        '    $("nsq-preview").addEventListener("click", function () {',
        '      var sel = selection(), hasMain = Object.keys(sel).some(function (k) { return sel[k] === "main"; });',
        '      if (!hasMain) { $("nsq-reason").textContent = "Choose at least one Main quote to preview."; return; }',
        '      var base = root.getAttribute("data-preview-url");',
        '      if (!base) { $("nsq-reason").textContent = "Preview is unavailable."; return; }',
        '      window.open(base + (base.indexOf("?") === -1 ? "?" : "&") + "sel=" + encodeURIComponent(JSON.stringify(sel)), "_blank");',
        '    });',
        '    renderTags();',
        '    update();',
        '  }',
        '  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }',
        '})();'
    ].join('\n');

    /**
     * Shows a fatal error page (no Opportunity, record not loadable, unhandled error).
     */
    function showErrorPage(context, message) {
        var form = serverWidget.createForm({ title: 'Send Quote — Error' });

        var errorField = form.addField({ id: 'custpage_error', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        errorField.defaultValue = buildPageCSS() +
            '<div class="nsq"><div class="nsq-wrap">' +
            '<div class="nsq-alert nsq-alert-error" role="alert"><strong>Error.</strong> ' + escapeHtml(message) + '</div>' +
            '<p>Please try again or contact your administrator if the problem persists. ' +
            '<a href="javascript:history.back()">Go back</a></p>' +
            '</div></div>';

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