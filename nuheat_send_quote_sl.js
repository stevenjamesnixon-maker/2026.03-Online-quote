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
 * @version     2.3.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_send_quote_sl
 * Deployment ID:  customdeploy_nuheat_send_quote_sl
 *
 * CHANGELOG v2.3.0 (Faster send with many quotes; "In forecast" tags — pending Sandbox):
 *   - WHY: Send re-ran searchRelatedQuotes(), a full record.load (pricing + BUS line loop) of EVERY
 *     Estimate on the Opportunity, including the ones left out.
 *   - CHANGED (POST only): runQuoteSearch() (the same search, no loads) → the selection is validated
 *     against lightQuote() rows → buildQuote() (the old per-row load, unchanged) runs for the
 *     selected quotes only. Left-out quotes get their current Include in Forecast from one
 *     search.lookupFields each (1 unit) — lookupLeftOutForecast(); missing/'' → false, failure →
 *     unknown (not written). The quote objects for the Master Proposal are identical to 2.2.0; the
 *     forecast targets, change-only writes and order (Estimates, then the Opportunity) are unchanged.
 *   - Unchanged: GET, preview and the re-render after a failed send still fully load every quote
 *     (the cards show derived VAT/BUS figures). A failed send loads the quotes not loaded yet.
 *   - ADDED: an "In forecast" / "Not in forecast" tag under each card's price, from the value the
 *     page already loaded; when the chosen role changes it, "→ will be included / excluded" (Main →
 *     included), updated live by PAGE_SCRIPT from data-forecast / data-role. No tag when the F6
 *     type check fails or the value is unknown.
 *   - Governance, 6 quotes with 1 Main + 1 Additional: Estimate loads 6 → 2 (60 → 20 units) plus
 *     4 lookups (4 units).
 *
 * CHANGELOG v2.2.1 (Timing only — no behaviour change; pending Sandbox):
 *   - ADDED: one audit line SendQuoteSL.Timing per page load (GET) and per send (POST), with the
 *     elapsed ms per phase (Date.now() differences) and the quote counts. Baseline for 2.3.0.
 *
 * CHANGELOG v2.2.0 (Proposal email redesign — pending Sandbox):
 *   - REWRITTEN: buildEmailBody() — one centred 600px column (logo, purple header, hero, Your quote,
 *     Why choose Nu-Heat? 2 × 2, What's next? with an Account Manager card, footer). Layout, width,
 *     alignment and colour are carried by HTML attributes, so it stays centred and single-column where
 *     every style attribute and <style> block is stripped. No floats, no percentage-width "col" tables,
 *     no display:none wrappers; each button is one [if !mso] / [if mso] pair.
 *   - COPY: header label YOUR QUOTE IS READY; project line "Project: ref · tranid" on one line;
 *     "Open your quote online to see your system, prices and options. It's provided subject to our
 *     Terms and Conditions."; button VIEW YOUR QUOTE; "To discuss your quote or place your order, get in
 *     touch with your Account Manager."; buttons CALL / EMAIL <first name>; footer line "You're
 *     receiving this because you requested a quote from Nu-Heat." REMOVED: the "Nu-Heat team" image and
 *     the closing "If you have any questions, you can contact your Account Manager, …" line.
 *   - ADDED: loadRepCardData() — one search.lookupFields on the Opportunity's salesrep (the employee
 *     the email already uses) for firstname and custentity_employee_photo_link. Photo shown only for an
 *     absolute https:// URL; audit log SendQuoteSL.RepPhoto once per send (used / skipped and why).
 *   - CHANGED: tel: links carry digits (and +) only; merge tags are substituted in one pass.
 *   - Unchanged: sender, subject, recipients, relatedRecords, and where name/email/phone come from.
 *
 * CHANGELOG v2.1.1 (Proposal email — duplicated contact buttons, left drift):
 *   - FIXED (buildEmailBody only): the CLICK TO CALL and SEND AN EMAIL Outlook fallbacks were wrapped
 *     in <div style="display:none; mso-hide: none;">, so any viewer that strips inline styles
 *     (NetSuite's message view, some webmail) showed each button twice. They now use
 *     <!--[if mso]> … <![endif]-->, as the VIEW YOUR QUOTE(S) button has since v1.4.1.
 *   - FIXED: both main-container tables were width="100%" with only an inline max-width:600px, so a
 *     viewer that strips styles stretched them full width and the 600px content drifted left. The
 *     attribute is now width="600" and the style width:100%;max-width:600px (styled clients unchanged;
 *     the mobile media queries still force 100% with !important).
 *   - Long-standing: buildEmailBody() was byte-identical from 539edc5 to 2.1.0 — not caused by 2.x.
 *     No copy, colour, image, link or merge tag changed.
 *
 * CHANGELOG v2.1.0 (Extraction — no behaviour change):
 *   - MOVED to ./nuheat_opp_update_lib (1.0.0), unchanged: the update-field definitions and display
 *     order, prepareOpportunityUpdateFields → prepareFields, updateOpportunityFields → updateFields,
 *     the date helpers, the text helpers (escapeHtml, stripTags, decodeEntities, cleanCardText), the
 *     page CSS (buildPageCSS → baseCss), the update field and section markup, the header, the error
 *     page, the Opportunity/contacts loading, and the field part of the redirect codes.
 *   - This page passes rules { logKey: 'SendQuoteSL.OppUpdate' } — nothing required — and renders
 *     byte-identical HTML to 2.0.4 (asserted in the test suite, script block included).
 *   - The page's own inline script (PAGE_SCRIPT) is deliberately NOT moved to the library's
 *     PAGE_SCRIPT_CORE: it still carries its own copy of the update-field/changed-marker logic.
 *     Migrating it is a separate change with its own browser test.
 *   - ⚠️ DEPLOYMENT: upload nuheat_opp_update_lib.js BEFORE this script.
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
    './nuheat_vat_rates',
    './nuheat_opp_update_lib'
], function (serverWidget, search, record, log, url, redirect, runtime, format, email, masterProposal, busGrant, vatRates, lib) {

    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────────

    var SCRIPT_VERSION = '2.3.0';

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
     * v2.1.0: the update-field definitions, display order and parameter names live in
     * ./nuheat_opp_update_lib — aliased here so the rest of this file reads as before.
     * ⚠️ custbody_opportunity_sub_status must NEVER be added there.
     */
    var OPP_UPDATE_FIELDS        = lib.FIELDS;
    var OPP_UPDATE_DISPLAY_ORDER = lib.DISPLAY_ORDER;

    /** v2.1.0: this page's field rules — nothing required (Update Opportunity requires Next contact). */
    var SQ_RULES = { logKey: 'SendQuoteSL.OppUpdate' };

    /**
     * v2.0.0: Estimate "Include in Forecast". ⚠️ ASSUMED standard field ID, not yet confirmed —
     * its type is checked at runtime (must report 'checkbox') before any write.
     */
    var FORECAST_FIELD = 'includeinforecast';
    var OPP_UPDATE_KEYS_FIELD = lib.KEYS_FIELD;
    var updFieldId            = lib.updFieldId;

    // v2.1.0: text helpers from the library (same code, moved)
    var escapeHtml    = lib.escapeHtml;
    var stripTags     = lib.stripTags;
    var cleanCardText = lib.cleanCardText;

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

    // ─── Timing (v2.2.1) ──────────────────────────────────────────────────────────

    /**
     * Per-request phase timer. mark(name) records the ms since the previous mark (or the start).
     * Logged once per request as SendQuoteSL.Timing — measurement only, no behaviour depends on it.
     */
    function newTiming() {
        var start = Date.now();
        var last  = start;
        return {
            phases: [],
            mark: function (name) {
                var now = Date.now();
                this.phases.push(name + '=' + (now - last));
                last = now;
            },
            total: function () { return Date.now() - start; }
        };
    }

    /**
     * @param {string} kind - 'GET' | 'POST'
     * @param {Object} counts - e.g. { quotes: 6, selected: 2, forecastWrites: 1 }
     * @param {string} outcome - e.g. 'rendered', 'sent', 'failed: validation'
     */
    function logTiming(kind, opportunityId, timing, counts, outcome) {
        var c = Object.keys(counts || {}).map(function (k) { return k + '=' + counts[k]; }).join(' ');
        log.audit('SendQuoteSL.Timing', kind + ' Opportunity ' + opportunityId + ' — ms: ' +
            timing.phases.concat(['total=' + timing.total()]).join(' ') +
            (c ? ' | ' + c : '') + ' | ' + outcome);
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

        var timing = newTiming();
        var page = renderSendPage(context, opportunityId, null, '', null, timing);
        logTiming('GET', opportunityId, timing, { quotes: page.quotes ? page.quotes.length : 0 },
            page.loadError ? 'load error' : 'rendered');
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
     * @param {Object} [timing] - v2.2.1: phase timer (GET marks opportunity / quotes / render)
     * @returns {Object} the page data (v2.2.1, for the timing line)
     */
    function renderSendPage(context, opportunityId, restore, errorMessage, quotes, timing) {
        var page = loadSendPageData(opportunityId, quotes, timing);
        if (page.loadError) {
            showErrorPage(context, page.loadError);
            return page;
        }

        var form = serverWidget.createForm({ title: 'Send Quote' });
        var body = form.addField({
            id:    'custpage_page',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        body.defaultValue = buildSendPageHTML(page, restore, errorMessage);

        context.response.writePage(form);
        if (timing) timing.mark('render');
        return page;
    }

    /**
     * Loads everything the Send proposal page shows.
     */
    function loadSendPageData(opportunityId, quotes, timing) {
        // v2.1.0: Opportunity, header fields, customer email and contacts from the library
        var page = lib.loadOppPageBase(opportunityId, { logPrefix: 'SendQuoteSL', customerEmail: true });
        if (timing) timing.mark('opportunity');
        if (page.loadError) return page;

        page.quotes = quotes || searchRelatedQuotes(opportunityId);
        if (timing) timing.mark('quotes');
        page.updateFields = page.quotes.length ? lib.prepareFields(page.oppRecord, opportunityId, SQ_RULES) : [];

        // Links, resolved server-side and handed to the page as data- attributes
        page.oppUrl = lib.resolveOppUrl(opportunityId, 'SendQuoteSL');
        page.previewUrl = '';
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
        var upd = lib.readPostedUpdateValues(params);
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

        var timing = newTiming();   // v2.2.1
        var counts = { quotes: 0, selected: 0, forecastWrites: 0 };

        // v2.0.0: rebuild every quote from NetSuite — the page sends IDs and roles only.
        // v2.3.0: the search alone first (no record loads); the selection is validated against it,
        // and only the selected quotes are then fully loaded (buildQuote, unchanged).
        var rows   = runQuoteSearch(opportunityId);
        var light  = rows.map(lightQuote);
        var loaded = [];      // row index → full quote; undefined = not loaded, null = load failed
        var quotes = light;
        counts.quotes = light.length;

        function fail(message, phase) {
            timing.mark(phase);
            // The re-rendered page prices every card: load the quotes not loaded yet.
            var full = [];
            rows.forEach(function (row, i) {
                var q = loaded[i] !== undefined ? loaded[i] : buildQuote(row, i, rows.length);
                if (q) full.push(q);
            });
            renderSendPage(context, opportunityId, restore, message, full);
            timing.mark('rerender');
            logTiming('POST', opportunityId, timing, counts, 'failed: ' + phase);
        }

        // ── Validation (against the search rows — nothing loaded yet) ────────────
        var resolved = resolveSelection(opportunityId, light, selection);
        counts.selected = resolved.selected.length;
        if (resolved.error) {
            fail(resolved.error, 'rebuild');
            return;
        }

        log.audit('SendQuoteSL.handleSubmission', 'Selected: ' + resolved.selected.length +
            ' | Main: ' + resolved.main.length + ' | Additional: ' + resolved.additional.length);

        if (resolved.selected.length === 0) {
            fail('No quotes were selected. Choose at least one quote to include in the proposal.', 'rebuild');
            return;
        }
        if (resolved.main.length === 0) {
            fail('No Main quote selected. Set at least one quote to "Main".', 'rebuild');
            return;
        }
        if (!parseEmails(emailTo).length) {
            fail('No recipient email address provided. Add at least one "To" address.', 'rebuild');
            return;
        }
        var badEmails = invalidEmails(emailTo).concat(invalidEmails(emailCc), invalidEmails(emailBcc));
        if (badEmails.length) {
            fail('These email addresses are not valid: ' + badEmails.join(', '), 'rebuild');
            return;
        }

        // ── Full load of the selected quotes only (v2.3.0) ────────────────────────
        // Same search order, so resolveSelection() orders them exactly as before. A selected quote
        // whose row cannot be built drops out and the selection is rejected, as before.
        quotes = [];
        rows.forEach(function (row, i) {
            if (!selection.map[String(light[i].id)]) {
                if (light[i].id) quotes.push(light[i]);   // an unreadable row stays out, as before
                return;
            }
            loaded[i] = buildQuote(row, i, rows.length);
            if (loaded[i]) quotes.push(loaded[i]);
        });
        resolved = resolveSelection(opportunityId, quotes, selection);
        if (resolved.error) {
            fail(resolved.error, 'rebuild');
            return;
        }
        timing.mark('rebuild');

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
                '. Nothing was sent. Please try again or contact your administrator.', 'proposal');
            return;
        }
        timing.mark('proposal');

        // ── Send Email ───────────────────────────────────────────────────────────
        try {
            sendProposalEmail(opportunityId, proposalResult.proposalUrl, emailTo, emailCc, emailBcc);
        } catch (emailErr) {
            log.error('SendQuoteSL.handleSubmission', 'Email sending failed: ' + emailErr.message);
            log.audit('SendQuoteSL.OppUpdate', 'Opportunity ' + opportunityId + ' — skipped, email was not sent');
            fail('The email could not be sent: ' + emailErr.message + '. The proposal was generated and its ' +
                'link saved to the opportunity, but no opportunity fields or forecast flags were changed. ' +
                'Check the addresses and send again.', 'email');
            return;
        }
        timing.mark('email');

        // v2.3.0: the left-out quotes were not loaded — read their current flag (lookupFields)
        lookupLeftOutForecast(opportunityId, quotes);

        // ── Forecast flags, then the Opportunity (independent of each other) ──────
        // v2.0.1: Forecast first: an Estimate save can re-sync its Status onto the opportunity.
        // The opportunity update must be last.
        var forecast  = updateForecastFlags(opportunityId, selection.map, quotes, timing);
        var oppUpdate = updateOpportunityFields(opportunityId, request);
        timing.mark('oppUpdate');
        counts.forecastWrites = forecast.changed;

        // ── Back to the Opportunity (VIEW), same tab ──────────────────────────────
        var redirectParams = buildRedirectParams(oppUpdate, forecast);
        log.audit('SendQuoteSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(redirectParams));

        redirect.toRecord({
            type:       record.Type.OPPORTUNITY,
            id:         opportunityId,
            isEditMode: false,
            parameters: redirectParams
        });
        logTiming('POST', opportunityId, timing, counts, 'sent');
    }

    /**
     * Builds the redirect parameters for the Opportunity banner (nuheat_opportunity_ue.js).
     *
     * Codes only — whitelisted field keys, counts, Estimate IDs and a timestamp. No free text,
     * addresses or error messages: the banner builds every word from the record itself.
     */
    function buildRedirectParams(oppUpdate, forecast) {
        var p = lib.fieldRedirectParams(oppUpdate);   // v2.1.0: nsq, nsqt, nsqf / nsqff

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

    // ─── Update opportunity ───────────────────────────────────────────────────────

    /**
     * Writes the Opportunity fields the user changed. v2.1.0: the logic lives in
     * lib.updateFields() (unchanged — changed, non-blank values only, one submitFields, sourcing on
     * only for a Status change, never throws); this wrapper passes this page's rules.
     */
    function updateOpportunityFields(opportunityId, request) {
        return lib.updateFields(opportunityId, request.parameters, SQ_RULES);
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
     * F6: the forecast field type reported by the first quote whose Estimate was loaded, or null.
     * (v2.3.0: extracted from updateForecastFlags, unchanged. On Send the Main quote is always
     * loaded, so a loaded record is always available for the check.)
     */
    function forecastFieldTypeOf(quotes) {
        for (var i = 0; i < quotes.length; i++) {
            if (quotes[i].forecastFieldType !== undefined && quotes[i].forecastFieldType !== null) {
                return quotes[i].forecastFieldType;
            }
        }
        return null;
    }

    /**
     * v2.3.0: current Include in Forecast of the quotes the send did not load (the left-out
     * ones) — one search.lookupFields each (1 unit) instead of a record.load. A missing or empty
     * value counts as false; a failed lookup leaves the value unknown, so it is not written
     * (as for an Estimate that could not be loaded). Skipped when F6 fails: nothing is written then.
     */
    function lookupLeftOutForecast(opportunityId, quotes) {
        if (forecastFieldTypeOf(quotes) !== 'checkbox') return;
        quotes.forEach(function (q) {
            if (!q.lightOnly) return;
            try {
                var v = (search.lookupFields({ type: search.Type.ESTIMATE, id: q.id, columns: [FORECAST_FIELD] }) || {})[FORECAST_FIELD];
                q.includeInForecast = normaliseCheckbox(v === undefined || v === null ? false : v);
            } catch (e) {
                q.includeInForecast = null;
                log.audit('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — Estimate ' + q.id +
                    ' (' + q.tranId + ') lookupFields failed: ' + e.message);
            }
        });
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
     * @param {Object} [timing] - v2.2.1: marks 'forecast' on return (measurement only)
     * @returns {{included: number, excluded: number, failed: Array<string>, changed: number, skipped: boolean}}
     *          included/excluded are the target states of the quotes on the page.
     */
    function updateForecastFlags(opportunityId, selectionMap, quotes, timing) {
        var result = { included: 0, excluded: 0, failed: [], changed: 0, skipped: false };

        try {
            var fieldType = forecastFieldTypeOf(quotes);
            if (fieldType !== 'checkbox') {
                result.skipped = true;
                log.audit('SendQuoteSL.Forecast', 'Opportunity ' + opportunityId + ' — ' + FORECAST_FIELD +
                    ' reported as "' + (fieldType || 'unknown: no Estimate could be loaded') +
                    '", expected "checkbox"; no forecast writes');
                if (timing) timing.mark('forecast');
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

        if (timing) timing.mark('forecast');
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

        // Build professional HTML email body (v2.2.0: plus the account manager's first name and photo)
        var body = buildEmailBody(oppData, proposalUrl, loadRepCardData(opportunityId, oppData.salesRep));

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

    // ─── Proposal email (v2.2.0) ──────────────────────────────────────────────────

    /** loadSalesRepData()'s placeholder name when the Opportunity has no usable sales rep. */
    var GENERIC_REP_NAME = 'Your Account Manager';

    var EMAIL_IMG = 'https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/';
    var EMAIL_FONT = 'font-family:Calibri, Arial, sans-serif;';
    var EMAIL_FACE = 'Calibri, Arial, sans-serif';
    var TERMS_URL = 'https://www.nu-heat.co.uk/wp-content/uploads/2021/04/Nu-Heat-TCs-Consumer-and-Trade.pdf';
    var SOCIAL_LINKS = [
        ['https://www.facebook.com/nuheatuk/',                   '1604502171665_white%20-%20facebook.png'],
        ['https://www.instagram.com/nuheatufh/',                 '1604502172039_white%20-%20instagram.png'],
        ['https://www.linkedin.com/company/nu-heat/',            '1604502171857_white%20-%20linkedin.png'],
        ['https://twitter.com/nuheatuk',                         '1604502172417_white%20-%20twitter.png'],
        ['https://youtube.com/channel/UCsfB8s56fcERuaBFovwYnGQ', '1604502172308_white%20-%20youtube.png']
    ];
    var WHY_TILES = [
        ['1698665508018_Design.png',                          'Bespoke heating design', 'Bespoke heating design', 'We tailor each system to the property for maximum performance'],
        ['1698665474858_Installer%20skills%202.png',          'Heating experts',        'The heating experts',    'Our systems heat more than 80,000 homes across the country!'],
        ['1698665569030_Lifetime%20tech%20support.png',       'Lifetime support',       'Lifetime support',       'We support our systems for life, so you can always call on us if needed'],
        ['1698665474762_Award%20winning%20customer%20service.png', 'Award-winning service', 'Award-winning service', 'Proud to hold a Distinction from the Institute of Customer Service']
    ];

    /** A lookupFields value as text: plain values as-is, select/document values as their first entry. */
    function lookupText(v) {
        if (Array.isArray(v)) return v.length ? String(v[0].text || v[0].value || '') : '';
        return v == null ? '' : String(v);
    }

    /** The first name for the contact buttons: firstname, else the first word of the name, else ''. */
    function resolveFirstName(firstname, fullName) {
        var first = lookupText(firstname).trim();
        if (first) return first;
        var name = String(fullName || '').trim();
        if (!name || name === GENERIC_REP_NAME) return '';
        return name.split(/\s+/)[0];
    }

    /** The photo URL if it is usable in an email (absolute https, no spaces/quotes/angle brackets). */
    function checkPhotoUrl(value) {
        var s = lookupText(value).trim();
        if (!s) return { url: '', reason: 'custentity_employee_photo_link is empty' };
        if (!/^https:\/\//i.test(s)) return { url: '', reason: 'not an https:// URL' };
        if (/[\s"'<>]/.test(s)) return { url: '', reason: 'URL contains spaces, quotes or angle brackets' };
        return { url: s, reason: '' };
    }

    /**
     * v2.2.0: the account manager's first name and photo for the email card. Same employee as the
     * name/email/phone the email already uses: the Opportunity's salesrep, via loadOpportunityData().
     * One search.lookupFields; a failure costs only the photo and first name, never the send.
     *
     * @returns {{ firstName: string, photoUrl: string }}
     */
    function loadRepCardData(opportunityId, salesRep) {
        var fields = {};
        var photo;
        if (!salesRep.id) {
            photo = { url: '', reason: 'the Opportunity has no sales rep' };
        } else {
            try {
                fields = search.lookupFields({
                    type: search.Type.EMPLOYEE,
                    id: salesRep.id,
                    columns: ['firstname', 'custentity_employee_photo_link']
                }) || {};
                photo = checkPhotoUrl(fields.custentity_employee_photo_link);
            } catch (e) {
                photo = { url: '', reason: 'employee lookup failed: ' + e.message };
            }
        }
        log.audit('SendQuoteSL.RepPhoto', 'Opportunity ' + opportunityId + ' — employee ' + (salesRep.id || 'none') +
            (photo.url ? ': photo used' : ': photo skipped — ' + photo.reason));
        return { firstName: resolveFirstName(fields.firstname, salesRep.name), photoUrl: photo.url };
    }

    /**
     * A bulletproof button: one [if !mso] / [if mso] pair, never a display:none wrapper. Colour is
     * carried by bgcolor and <font color>, padding by cellpadding, so it survives stripped styles.
     * href and label must already be escaped.
     */
    function emailButton(href, label) {
        var bg = '#ffb500', fg = '#3e3b39';
        var text = EMAIL_FONT + 'font-size:18px;line-height:22px;font-weight:bold;color:' + fg + ';text-decoration:none;';
        return '' +
            '<!--[if !mso]><!-- -->\n' +
            '<table role="presentation" class="btn-full" align="center" cellpadding="14" cellspacing="0" border="0" bgcolor="' + bg + '" style="background-color:' + bg + ';border-radius:5px;border-collapse:separate;">\n' +
            '<tr><td align="center" valign="middle" bgcolor="' + bg + '" style="padding:0;border-radius:5px;"><a href="' + href + '" target="_blank" style="display:block;padding:15px 28px;' + text + '"><font face="' + EMAIL_FACE + '" color="' + fg + '"><b>' + label + '</b></font></a></td></tr>\n' +
            '</table>\n' +
            '<!--<![endif]-->\n' +
            '<!--[if mso]>\n' +
            '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="' + bg + '">\n' +
            '<tr><td align="center" valign="middle" bgcolor="' + bg + '" style="padding:15px 28px;"><a href="' + href + '" target="_blank" style="' + text + '"><font face="Arial, sans-serif" color="' + fg + '"><b>' + label + '</b></font></a></td></tr>\n' +
            '</table>\n' +
            '<![endif]-->\n';
    }

    /**
     * Builds the HTML email body (v2.2.0 redesign: "Send Quote redesign" artboards 5 and 6).
     *
     * One centred 600px column: logo · purple header · hero · Your quote · Why choose Nu-Heat? (2 × 2)
     * · What's next? with the Account Manager card · footer. Layout, width, alignment and colour are
     * all carried by HTML attributes (width, align, bgcolor, valign, <font color>), so the email stays
     * centred and single-column where every style attribute and <style> block is stripped (NetSuite's
     * message view). CSS only adds polish and the phone stacking. No floats, no percentage-width
     * side-by-side tables, no display:none wrappers (the preheader span excepted).
     *
     * Merge tags (all values HTML-escaped; substituted in one pass, so a value can't inject a tag):
     *   {{QUOTE_EMAIL_REF}}      → oppData.quoteEmailRef, else oppData.title
     *   {{TRAN_ID}}              → oppData.tranId
     *   {{SALES_REP_NAME}}       → oppData.salesRep.name (fallback 'Your Account Manager')
     *   {{SALES_REP_EMAIL}}      → oppData.salesRep.email (fallback info@nu-heat.co.uk)
     *   {{SALES_REP_PHONE}}      → oppData.salesRep.phone (fallback 01404 540604)
     *   {{SALES_REP_FIRST_NAME}} → repCard.firstName, upper-cased for the CALL / EMAIL buttons
     *                              (no first name → CLICK TO CALL / SEND AN EMAIL instead)
     *   {{SALES_REP_PHOTO_URL}}  → repCard.photoUrl (no URL → the photo row is left out entirely)
     *   {{PROPOSAL_URL}}         → proposalUrl
     *
     * @param {Object} oppData - Opportunity data from loadOpportunityData()
     * @param {string} proposalUrl - Public URL to the generated master proposal
     * @param {Object} [repCard] - { firstName, photoUrl } from loadRepCardData()
     * @returns {string} Complete HTML email body
     */
    function buildEmailBody(oppData, proposalUrl, repCard) {
        repCard = repCard || {};
        var rep = oppData.salesRep || {};
        var repEmail  = rep.email || 'info@nu-heat.co.uk';
        var repPhone  = rep.phone || '01404 540604';
        var telDigits = String(repPhone).replace(/[^\d+]/g, '');
        var firstName = String(repCard.firstName || '').trim();
        var photoUrl  = String(repCard.photoUrl || '');

        var values = {
            QUOTE_EMAIL_REF:      escapeHtml(oppData.quoteEmailRef || oppData.title || ''),
            TRAN_ID:              escapeHtml(oppData.tranId || ''),
            SALES_REP_NAME:       escapeHtml(rep.name || GENERIC_REP_NAME),
            SALES_REP_EMAIL:      escapeHtml(repEmail),
            SALES_REP_PHONE:      escapeHtml(repPhone),
            SALES_REP_FIRST_NAME: escapeHtml(firstName.toUpperCase()),
            SALES_REP_PHOTO_URL:  escapeHtml(photoUrl),
            PROPOSAL_URL:         escapeHtml(proposalUrl || '')
        };

        var callLabel  = firstName ? 'CALL {{SALES_REP_FIRST_NAME}}' : 'CLICK TO CALL';
        var emailLabel = firstName ? 'EMAIL {{SALES_REP_FIRST_NAME}}' : 'SEND AN EMAIL';
        var contactButtons = [];
        if (telDigits) contactButtons.push(emailButton('tel:' + escapeHtml(telDigits), callLabel));
        if (repEmail) contactButtons.push(emailButton('mailto:{{SALES_REP_EMAIL}}', emailLabel));

        var tiles = WHY_TILES.map(function (t) {
            return '<td class="stack" width="50%" align="center" valign="top" style="padding:12px 10px;">\n' +
                '<img src="' + EMAIL_IMG + t[0] + '" width="100" height="100" alt="' + t[1] + '" border="0" style="display:block;margin:0 auto;width:100px;height:100px;">\n' +
                '<p style="margin:10px 0 4px 0;' + EMAIL_FONT + 'font-size:20px;line-height:24px;color:#000000;"><font face="' + EMAIL_FACE + '" color="#000000"><b>' + t[2] + '</b></font></p>\n' +
                '<p style="margin:0;' + EMAIL_FONT + 'font-size:16px;line-height:21px;color:#131313;"><font face="' + EMAIL_FACE + '" color="#131313">' + t[3] + '</font></p>\n' +
                '</td>\n';
        });

        var social = SOCIAL_LINKS.map(function (s) {
            return '<td align="center" valign="middle" width="42" style="padding:0 10px;"><a href="' + s[0] + '" target="_blank"><img src="' + EMAIL_IMG + s[1] + '" width="22" height="22" alt="" border="0" style="display:block;width:22px;height:22px;"></a></td>\n';
        }).join('');

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
            '<link href="https://www.nu-heat.co.uk/wp-content/themes/nu-heat/assets/fonts/calibri/calibri-font.css" rel="stylesheet" type="text/css">\n' +
            '<!--[if gte mso 16]>\n' +
            '<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>\n' +
            '<![endif]-->\n' +
            '<style>\n' +
            'body { margin:0; padding:0; -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }\n' +
            'table { border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }\n' +
            'td { border-collapse:collapse; }\n' +
            'img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }\n' +
            'a[x-apple-data-detectors=true] { color:inherit !important; text-decoration:inherit !important; }\n' +
            '@media all and (max-width: 599px) {\n' +
            '.main-container { width:100% !important; }\n' +
            '.fluid { width:100% !important; height:auto !important; }\n' +
            '.stack { display:block !important; width:100% !important; box-sizing:border-box; }\n' +
            '.btn-full { width:100% !important; }\n' +
            '.cl-sep { display:none !important; }\n' +
            '.cl-line { display:block !important; }\n' +
            '.h1 { font-size:30px !important; line-height:34px !important; }\n' +
            '}\n' +
            '</style>\n' +
            '<!--[if mso]>\n' +
            '<style>h1, h2, p, td, a, span, font { font-family:Arial, sans-serif !important; }</style>\n' +
            '<![endif]-->\n' +
            '</head>\n' +
            '<body id="body" bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">\n' +
            '<span style="display:none;font-size:0px;line-height:0px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">Here\'s your Nu-Heat quote.</span>\n' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">\n' +
            '<tr><td align="center" valign="top">\n' +
            '<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="top"><![endif]-->\n' +
            '<table role="presentation" class="width600 main-container" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">\n' +

            // 1 — Logo
            '<tr><td align="center" valign="top" style="padding:20px 10px;">\n' +
            '<img src="' + EMAIL_IMG + '1698400306920_Nu-Heat%20Master%20logo%20green%20-%20transparent%20v3.png" width="170" height="73" alt="Nu-Heat Underfloor Heating &amp; Renewables" border="0" style="display:block;margin:0 auto;width:170px;height:auto;max-width:100%;">\n' +
            '</td></tr>\n' +

            // 2 — Purple header
            '<tr><td align="center" valign="top" bgcolor="#59315f" style="background-color:#59315f;padding:28px 24px;">\n' +
            '<p style="margin:0 0 10px 0;' + EMAIL_FONT + 'font-size:13px;line-height:16px;letter-spacing:2px;color:#ffffff;"><font face="' + EMAIL_FACE + '" color="#ffffff"><b>YOUR QUOTE IS READY</b></font></p>\n' +
            '<h1 class="h1" style="margin:0 0 12px 0;' + EMAIL_FONT + 'font-size:38px;line-height:42px;font-weight:bold;color:#ffffff;"><font face="' + EMAIL_FACE + '" color="#ffffff">Thank you for requesting a quote</font></h1>\n' +
            '<p style="margin:0;' + EMAIL_FONT + 'font-size:20px;line-height:25px;color:#ffffff;word-break:break-word;"><font face="' + EMAIL_FACE + '" color="#ffffff">Project: {{QUOTE_EMAIL_REF}} <span style="white-space:nowrap;">· {{TRAN_ID}}</span></font></p>\n' +
            '</td></tr>\n' +

            // 3 — Hero
            '<tr><td align="center" valign="top">\n' +
            '<img src="' + EMAIL_IMG + '1613738610524_Order%20conformation.jpg" width="600" height="337" alt="Thank you for choosing Nu-Heat" border="0" class="fluid" style="display:block;width:100%;max-width:600px;height:auto;">\n' +
            '</td></tr>\n' +

            // 4 — Your quote
            '<tr><td align="center" valign="top" style="padding:28px 30px 28px 30px;">\n' +
            '<h2 style="margin:0 0 12px 0;' + EMAIL_FONT + 'font-size:32px;line-height:35px;font-weight:bold;color:#59315f;"><font face="' + EMAIL_FACE + '" color="#59315f">Your quote</font></h2>\n' +
            '<p style="margin:0 0 20px 0;' + EMAIL_FONT + 'font-size:18px;line-height:24px;color:#131313;"><font face="' + EMAIL_FACE + '" color="#131313">Open your quote online to see your system, prices and options. It\'s provided subject to our <a href="' + TERMS_URL + '" target="_blank" style="color:#59315f;text-decoration:underline;"><font color="#59315f">Terms and Conditions</font></a>.</font></p>\n' +
            emailButton('{{PROPOSAL_URL}}', 'VIEW YOUR QUOTE') +
            '</td></tr>\n' +

            // 5 — Why choose Nu-Heat? (2 × 2; stacked on phones)
            '<tr><td align="center" valign="top" bgcolor="#f2f2f2" style="background-color:#f2f2f2;padding:28px 10px 16px 10px;">\n' +
            '<h2 style="margin:0 0 8px 0;' + EMAIL_FONT + 'font-size:32px;line-height:35px;font-weight:bold;color:#aa0061;"><font face="' + EMAIL_FACE + '" color="#aa0061">Why choose Nu-Heat?</font></h2>\n' +
            '<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0">\n' +
            '<tr>\n' + tiles[0] + tiles[1] + '</tr>\n' +
            '<tr>\n' + tiles[2] + tiles[3] + '</tr>\n' +
            '</table>\n' +
            '</td></tr>\n' +

            // 6 — What's next? and the Account Manager card
            '<tr><td align="center" valign="top" style="padding:28px 20px 32px 20px;">\n' +
            '<h2 style="margin:0 0 12px 0;' + EMAIL_FONT + 'font-size:32px;line-height:35px;font-weight:bold;color:#59315f;"><font face="' + EMAIL_FACE + '" color="#59315f">What\'s next?</font></h2>\n' +
            '<p style="margin:0 0 20px 0;' + EMAIL_FONT + 'font-size:18px;line-height:24px;color:#131313;"><font face="' + EMAIL_FACE + '" color="#131313">To discuss your quote or place your order, get in touch with your Account Manager.</font></p>\n' +
            '<table role="presentation" class="main-card" width="440" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f2f7" style="width:100%;max-width:440px;background-color:#f6f2f7;border-radius:8px;">\n' +
            (photoUrl
                ? '<tr><td align="center" valign="top" style="padding:24px 20px 0 20px;"><img src="{{SALES_REP_PHOTO_URL}}" width="96" height="96" alt="{{SALES_REP_NAME}}" border="0" style="display:block;margin:0 auto;width:96px;height:96px;border-radius:48px;object-fit:cover;"></td></tr>\n'
                : '') +
            '<tr><td align="center" valign="top" style="padding:' + (photoUrl ? '14px' : '24px') + ' 20px 0 20px;">\n' +
            '<p style="margin:0 0 4px 0;' + EMAIL_FONT + 'font-size:13px;line-height:16px;letter-spacing:2px;color:#59315f;"><font face="' + EMAIL_FACE + '" color="#59315f"><b>YOUR ACCOUNT MANAGER</b></font></p>\n' +
            '<p style="margin:0 0 6px 0;' + EMAIL_FONT + 'font-size:24px;line-height:28px;font-weight:bold;color:#000000;"><font face="' + EMAIL_FACE + '" color="#000000"><b>{{SALES_REP_NAME}}</b></font></p>\n' +
            '<p style="margin:0;' + EMAIL_FONT + 'font-size:17px;line-height:23px;color:#131313;"><font face="' + EMAIL_FACE + '" color="#131313"><span class="cl-line">{{SALES_REP_PHONE}}</span><span class="cl-sep"> · </span><span class="cl-line">{{SALES_REP_EMAIL}}</span></font></p>\n' +
            '</td></tr>\n' +
            '<tr><td align="center" valign="top" style="padding:16px 14px 20px 14px;">\n' +
            '<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0">\n' +
            '<tr>\n' +
            contactButtons.map(function (b) {
                return '<td class="stack" width="' + (contactButtons.length === 2 ? '50%' : '100%') + '" align="center" valign="top" style="padding:6px;">\n' + b + '</td>\n';
            }).join('') +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr>\n' +
            '</table>\n' +
            '</td></tr>\n' +

            // 7 — Footer (logo and social links as before) and the reason line
            '<tr><td align="center" valign="top" bgcolor="#00857d" style="background-color:#00857d;padding:10px 10px 24px 10px;">\n' +
            '<img src="' + EMAIL_IMG + '1604422010305_Nu-Heat%20Master%20logo%20wht%20on%20green.png" width="167" height="94" alt="Nu-Heat Underfloor Heating &amp; Renewables" border="0" style="display:block;margin:0 auto 10px auto;width:167px;height:auto;">\n' +
            '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">\n' +
            '<tr>\n' + social + '</tr>\n' +
            '</table>\n' +
            '</td></tr>\n' +
            '<tr><td align="center" valign="top" style="padding:16px 20px 24px 20px;">\n' +
            '<p style="margin:0;' + EMAIL_FONT + 'font-size:13px;line-height:17px;color:#6b6b6b;"><font face="' + EMAIL_FACE + '" color="#6b6b6b">You\'re receiving this because you requested a quote from Nu-Heat.</font></p>\n' +
            '</td></tr>\n' +

            '</table>\n' +
            '<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</td></tr>\n' +
            '</table>\n' +
            '</body>\n' +
            '</html>\n';

        return template.replace(/\{\{([A-Z_]+)\}\}/g, function (tag, key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : tag;
        });
    }

    // ─── Quote Search ─────────────────────────────────────────────────────────────

    /**
     * Searches for all Estimates linked to the given Opportunity that have
     * a generated online quote URL (custbody_test_new_quote is not empty), and fully loads each
     * one (pricing, BUS lines, forecast flag). Used by the page load (GET), the preview and the
     * re-render after a failed send.
     *
     * v2.3.0: split into runQuoteSearch() (the search, unchanged) and buildQuote() (the per-row
     * load, unchanged). The Send POST runs the search, validates against lightQuote() rows and
     * fully loads only the selected quotes.
     */
    function searchRelatedQuotes(opportunityId) {
        var rows = runQuoteSearch(opportunityId);
        var quotes = [];
        for (var i = 0; i < rows.length; i++) {
            var q = buildQuote(rows[i], i, rows.length);
            if (q) quotes.push(q);
        }
        if (rows.length) {
            log.audit('SendQuoteSL.searchRelatedQuotes', 'v1.4.5 — Successfully processed ' + quotes.length +
                ' of ' + rows.length + ' quotes for Opportunity ' + opportunityId);
        }
        return quotes;
    }

    /**
     * v2.3.0: the quote search alone — same filters and columns as before, no record loads.
     * @returns {Array} search results (empty on any error or no match)
     */
    function runQuoteSearch(opportunityId) {
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

        return results;
    }

    /** custbody_quote_type text for a search row ('' when unreadable). */
    function rowQuoteType(result, i) {
        try {
            return result.getText({ name: 'custbody_quote_type' }) || '';
        } catch (qtErr) {
            log.debug('SendQuoteSL.searchRelatedQuotes', 'Could not read custbody_quote_type text for result ' + i + ': ' + qtErr.message);
            return '';
        }
    }

    /**
     * v2.3.0: a quote from its search row only — no record load. Enough to validate a posted
     * selection (id), order it (quoteTypeDisplay) and address the forecast write (id, tranId).
     * Never shown and never passed to the Master Proposal. includeInForecast is filled later by
     * lookupLeftOutForecast(); forecastFieldType stays undefined (not loaded).
     */
    function lightQuote(result, i) {
        try {
            return {
                id:               result.getValue({ name: 'internalid' }) || '',
                tranId:           result.getValue({ name: 'tranid' }) || '',
                quoteTypeDisplay: getQuoteTypeDisplayName(rowQuoteType(result, i)),
                lightOnly:        true
            };
        } catch (rowErr) {
            // As buildQuote(): a row that cannot be read is skipped (an ID of '' matches no selection)
            log.error('SendQuoteSL.searchRelatedQuotes', 'Error reading result row ' + i + ': ' + rowErr.message);
            return { id: '', tranId: '', quoteTypeDisplay: 'Other', lightOnly: true };
        }
    }

    /**
     * Step 3 of the old searchRelatedQuotes(), unchanged: builds one quote from its search row,
     * loading the Estimate for pricing, BUS and the forecast flag.
     * @returns {Object|null} null when the row could not be processed (logged)
     */
    function buildQuote(result, i, rowCount) {
        try {
            var estimateId = result.getValue({ name: 'internalid' }) || '';

            var rawQuoteType = rowQuoteType(result, i);
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

            var quote = {
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
            };

            log.debug('SendQuoteSL.searchRelatedQuotes', 'Processed quote ' + (i + 1) + '/' + rowCount +
                ': ID=' + estimateId + ', tranId=' + (result.getValue({ name: 'tranid' }) || '') +
                ', type=' + rawQuoteType + ' → ' + quoteTypeDisplay);

            return quote;

        } catch (rowErr) {
            log.error('SendQuoteSL.searchRelatedQuotes', 'Error processing result row ' + i + ': ' +
                rowErr.message + '\nStack: ' + (rowErr.stack || 'N/A'));
            // Continue processing remaining results — don't let one bad row break everything
            return null;
        }
    }

    // ─── Page HTML (v2.0.0) ───────────────────────────────────────────────────────
    //
    // ⚠️ Inline-HTML rules (see AI_AGENT_CONTEXT §9):
    //   - Every interpolated value goes through escapeHtml() (& < > " '). Titles and
    //     descriptions are tag-stripped FIRST (quote titles can contain <b>…</b>).
    //   - Record and user data live ONLY in element text and data- / value attributes.
    //     NOTHING is interpolated into the <script> block: a "</script>" sequence would end the
    //     block regardless of HTML escaping. PAGE_SCRIPT below is a static string.


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

        h.push(lib.baseCss());
        var fcColors = lib.PAGE_COLORS;   // v2.3.0: the forecast tag (the library CSS is not changed)
        h.push('<style>.nsq-fc{display:block;margin-top:4px;font-size:12px;color:' + fcColors.muted + ';}' +
            '.nsq-fc-chg{color:' + fcColors.accent + ';font-weight:600;}</style>');
        h.push('<div id="nsq-root" class="nsq" data-preview-url="' + escapeHtml(page.previewUrl) + '" data-opp-url="' +
            escapeHtml(page.oppUrl) + '">');
        h.push('<div class="nsq-wrap">');

        // ── Header (v2.1.0: library) ──
        h.push(lib.buildHeaderHTML(page, 'Send proposal'));

        if (errorMessage) {
            h.push(lib.buildErrorAlertHTML('Not sent.', errorMessage));
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
        // v2.3.0: "In forecast" tags only when the F6 type check passes (as for the writes)
        var showForecast = forecastFieldTypeOf(page.quotes) === 'checkbox';
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
                h.push(buildQuoteRowHTML(q, role, showForecast));
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

        // ── 3 Update the opportunity (v2.1.0: library) ──
        h.push(lib.buildUpdateSectionHTML(page.updateFields, restore, 3));

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
    function buildQuoteRowHTML(q, role, showForecast) {
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

        // v2.3.0: current forecast state, and what the chosen role will make it (Main → included).
        // PAGE_SCRIPT rewrites the text from data-forecast and data-role on every role change.
        var fcAttr = '', fcTag = '';
        if (showForecast && (q.includeInForecast === true || q.includeInForecast === false)) {
            var fcWill = role === ROLE_MAIN;
            fcAttr = ' data-forecast="' + (q.includeInForecast ? '1' : '0') + '"';
            fcTag = '<span class="nsq-fc' + (fcWill === q.includeInForecast ? '' : ' nsq-fc-chg') + '">' +
                forecastTagText(q.includeInForecast, fcWill) + '</span>';
        }

        return '<div class="nsq-row' + (role === ROLE_MAIN ? ' nsq-row-main' : '') + '" data-qid="' + escapeHtml(String(q.id)) +
            '" data-role="' + role + '" data-total="' + escapeHtml(String(q.totalValue || 0)) + '"' + fcAttr + '>' +
            '<div class="nsq-seg" role="group" aria-label="Include as">' + seg + '</div>' +
            '<div class="nsq-q"><div class="nsq-q-title" title="' + escapeHtml(line1) + '">' + escapeHtml(line1) + '</div>' +
            (line2 ? '<div class="nsq-q-desc" title="' + escapeHtml(line2) + '">' + escapeHtml(line2) + '</div>' : '') +
            '</div>' +
            '<div class="nsq-price"><strong>' + escapeHtml(q.amount) + '</strong>' + exVat + fcTag + '</div>' +
            (q.quoteUrl ? '<a class="nsq-view" href="' + escapeHtml(q.quoteUrl) + '" target="_blank" rel="noopener">View</a>' : '<span class="nsq-view"></span>') +
            '</div>';
    }


    /** v2.3.0: the forecast tag text — the same rule as PAGE_SCRIPT's copy. */
    function forecastTagText(current, will) {
        return (current ? 'In forecast' : 'Not in forecast') +
            (will === current ? '' : (will ? ' → will be included' : ' → will be excluded'));
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
        '        var fc = row.querySelector(".nsq-fc");',
        '        if (fc) {',
        '          var cur = row.getAttribute("data-forecast") === "1", will = r === "main";',
        '          fc.textContent = (cur ? "In forecast" : "Not in forecast") + (will === cur ? "" : (will ? " → will be included" : " → will be excluded"));',
        '          fc.className = "nsq-fc" + (will === cur ? "" : " nsq-fc-chg");',
        '        }',
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
     * v2.1.0: built by the library.
     */
    function showErrorPage(context, message) {
        lib.showErrorPage(context, message, 'Send Quote — Error');
    }

    // ─── Exports ──────────────────────────────────────────────────────────────────

    return {
        onRequest: onRequest
    };

});