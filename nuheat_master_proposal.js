/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Master Proposal Generator
 * @description Module that generates a master proposal HTML page aggregating
 *              multiple quotes under a single Opportunity. Called by the
 *              Send Quote Suitelet after the user selects which quotes to include.
 * @version     1.6.6
 * @author      Nu-Heat Development
 *
 * CHANGELOG v1.6.6 (feat: Site address in Customer Information):
 *   - ADDED: loadOpportunityData() reads custbody_opp_site_adress from Opportunity
 *     record using the same defensive try-catch pattern as custbody_sales_rep_phone.
 *     Result stored as siteAddress on the returned oppData object.
 *   - ADDED: generateHeaderContent() renders a "Site address:" info-item row between
 *     "Customer name" and "System reference" in the Customer Information card.
 *     Row is conditionally rendered — hidden when custbody_opp_site_adress is empty.
 *
 * CHANGELOG v1.6.5 (Fix: UFH benefits wording + Step 2 description):
 *   - CHANGED: SYSTEM_BENEFITS 'Underfloor Heating' — 'Room-by-room heat losses'
 *     replaced with 'Detailed installation pack'.
 *   - CHANGED: generateWhatHappensNext() Step 2 description — removed reference to
 *     "meticulous heat-loss calculations"; text now reads "Our approach ensures
 *     optimal system performance and a seamless installation process."
 *
 * CHANGELOG v1.6.4 (GTM injection):
 *   - ADDED: GTM_CONTAINER_ID constant (GTM-5NJJSBMP).
 *   - ADDED: Data layer push (nuheat_proposal_view event) before GTM snippet.
 *   - ADDED: GTM head snippet and noscript fallback injected into all proposal pages.
 *
 * CHANGELOG v1.6.3 (Fix: Absolute proposal URL for email button):
 *   - FIXED: "VIEW YOUR QUOTES HERE" email button was broken on all clients.
 *     Root cause: file.url returns a relative path (e.g. /core/media/media.nl?id=...)
 *     which email clients cannot resolve — desktop showed "Redirect Notice: invalid URL",
 *     mobile silently did nothing.
 *   - ADDED: getAccountHostname() helper — derives the fully-qualified account hostname
 *     dynamically using N/runtime.accountId, converting '472052_SB1' to
 *     'https://472052-sb1.app.netsuite.com'. Works for both Sandbox and Production
 *     without hardcoding.
 *   - CHANGED: saveProposalToFileCabinet() now stores an absolute https:// URL in
 *     fileUrl (used for proposalUrl in email and Opportunity field update).
 *   - ADDED: N/runtime to module define() imports.
 *
 * CHANGELOG v1.6.0 (Quote Card Redesign — Phase 7.14):
 *   - REDESIGNED: Quote cards transformed into bordered "system cards" with distinct
 *     header (title, ref, description), benefits row (4 checkmarks), and gray footer
 *     (price left, CTA right). Replaces the old flat flexbox layout.
 *   - ADDED: SYSTEM_BENEFITS constant mapping quote types to 4 benefit checkmark texts.
 *   - ADDED: generateBenefitsRow() function renders teal SVG checkmarks per quote type.
 *   - ADDED: generateBUSGrantBanner() renders a contextual BUS grant info banner after
 *     Heat Pump cards in the main quotes section (conditional, controlled by constant).
 *   - ADDED: CSS for .system-card, .system-card-header, .system-card-title,
 *     .system-card-ref, .system-card-desc, .system-benefits, .system-benefit,
 *     .system-benefit-icon, .system-card-footer, .system-card-price,
 *     .system-card-price-detail, .system-card-cta, .grant-highlight.
 *   - CHANGED: Collapsible header padding reduced from 44px to 20px vertical.
 *   - CHANGED: Collapsible header h2 font-size reduced from 32px to 24px.
 *   - CHANGED: .quote-count renamed to .badge-count (14px, 400 weight, 0.8 opacity).
 *   - CHANGED: .main-content renamed to .quotes-content; .section-intro to .quotes-intro.
 *   - CHANGED: CTA button padding restored to 14px 28px, font-size to 15px, border-radius
 *     to 8px, gap to 12px (redesign values). Flex-wrap from v1.5.9 retained.
 *   - CHANGED: Mobile responsive rules added for .system-card-footer, .system-card-cta,
 *     .system-benefits, .system-benefit, .grant-highlight.
 *   - CHANGED: Print styles updated to hide .system-card-cta.
 *   - REMOVED: Old .quote-card-separator <hr> elements between cards.
 *   - REMOVED: Old .quote-card, .quote-card-body, .quote-card-info, .quote-card-pricing
 *     CSS (replaced by .system-card equivalents).
 *
 * CHANGELOG v1.5.9 (CTA Banner Layout Fix):
 *   - FIXED: CTA banner text and buttons overlapping on desktop viewports.
 *   - CHANGED: Reduced CTA button padding (14px 28px → 10px 20px) and font-size (15px → 13px).
 *   - CHANGED: Added flex-wrap, gap, and min-width to CTA banner for graceful reflow.
 *   - CHANGED: Mobile CTA button padding/font-size slightly reduced for consistency.
 *
 * CHANGELOG v1.5.8 (Quote Copy Improvements):
 *   - CHANGED: "Proposal date" label renamed to "Quote date" in Customer Information section.
 *   - CHANGED: Main section title from "Main System Quotes & Costs" to "Quote & Costs Preview".
 *   - CHANGED: "View Quote" button text updated to "View Full Quote".
 *   - CHANGED: Main quotes section description updated with clearer summary text.
 *   - CHANGED: Alternative solutions section description updated with improved guidance text.
 *
 * CHANGELOG v1.5.7 (Dynamic Account Manager Phone):
 *   - FIXED: Account manager phone number now pulls from custbody_sales_rep_phone
 *     on the Opportunity record instead of the employee record's phone field.
 *   - custbody_sales_rep_phone takes priority; falls back to employee phone if empty.
 *
 * CHANGELOG v1.5.6 (Value Proposition Section):
 *   - REMOVED: Trust badges section (TRUST_ICONS object, generateTrustBadges function,
 *     and all related CSS for .trust-badges, .trust-badge, .badge-icon-img, .badge-icon,
 *     .badge-title) — no longer used.
 *   - ADDED: New "Included with every Nu-Heat system" value proposition section with
 *     three cards: "Bespoke heating design", "Ready-to-install system", "Lifetime tech
 *     support". Each card features a circular photograph overlapping the top edge.
 *   - ADDED: generateValueSection() function replacing generateTrustBadges().
 *   - ADDED: Desktop CSS for .value-section, .value-section-title, .value-grid,
 *     .value-card, .value-card-photo, .value-card h3, .value-card p.
 *   - ADDED: Mobile CSS (max-width: 768px) — cards stack to single column with 36px
 *     gap to accommodate overlapping circular photos.
 *   - Images hosted on NetSuite File Cabinet (IDs: 43192427, 43195214, 43192429).
 *
 * CHANGELOG v1.5.5 (Benefit Bar Text Fix):
 *   - FIXED: Trust badge text labels now match the quote page exactly:
 *     "Guaranteed Performance", "Insurance Backed", "Lifetime Tech Support",
 *     "Rated Excellent on Trustpilot" (was previously shortened to single words).
 *
 * CHANGELOG v1.5.4 (Pricing Calculation Fix):
 *   - CRITICAL FIX: totalIncVat was double-counting VAT. The NS 'total' field on
 *     Estimates already includes VAT (total = subtotal - discount + tax), so adding
 *     taxTotal again produced incorrect totals. Now totalIncVat = total directly.
 *   - FIXED: Individual quote card pricing now correctly shows Total inc VAT as the
 *     NS 'total' field value, without re-adding taxTotal.
 *   - FIXED: calculateTotals() aggregation now uses total directly as totalIncVat.
 *   - ADDED: Enhanced debug logging for pricing values on each quote card.
 *
 * CHANGELOG v1.5.3 (Greeting & Pricing Data Fixes):
 *   - FIXED: Greeting name now loads from customer record's 'firstname' field directly
 *     (via record.load) instead of parsing from company/entity name text. This resolves
 *     the issue where NS-prefixed names like "NS281444 Online Quote - Self Builder"
 *     would display incorrectly. If firstname is blank, greeting shows "Hi here is your".
 *   - FIXED: Subtotal now correctly uses standard 'subtotal' field (price ex VAT before
 *     discount) via send quote suitelet, instead of custbody_subtotal. This ensures
 *     Subtotal and Total inc VAT show different values when VAT/discount are applied.
 *   - FIXED: Discount display now correctly renders when discounttotal field has a value,
 *     shown as negative (e.g., "-£500.00"). Data flow verified from send quote SL through
 *     to master proposal quote cards.
 *
 * CHANGELOG v1.5.2 (Price & Styling Fixes):
 *   - FIXED: Quote card pricing now uses actual NetSuite fields (subtotal, discounttotal,
 *     taxtotal, total) instead of calculating VAT from amount. Prices now display correctly.
 *   - FIXED: calculateTotals() now aggregates actual NS price fields for the total price bar.
 *   - FIXED: Alternative options "View Quote" button now uses same btn-view-quote class as
 *     main quotes for consistent styling (removed btn-view-quote-secondary differentiation).
 *   - FIXED: Description rendering guard now also trims whitespace before checking.
 *
 * CHANGELOG v1.5.1 (Bug Fixes):
 *   - FIXED: Logo now hardcoded as base64 (same as nuheat_quote_suitelet.js) instead of
 *     loading from File Cabinet, ensuring it always displays correctly.
 *   - FIXED: Greeting logic now matches quote page exactly — shows "Hi John" or just "Hi"
 *     if no first name (no longer shows "Hi Valued Customer").
 *   - FIXED: Trust signal icons now use exact same base64 PNG images from quote page
 *     (Guaranteed, Insurance, Lifetime Tech, Rated Excellent) instead of SVG approximations.
 *   - FIXED: Quote card layout redesigned — removed technology group headers, added thin
 *     line separators between cards, title now shows "Type (Quote ref: TRANID)" inline.
 *   - ADDED: custbody_quote_description field rendered as HTML in quote cards (bold tags etc.)
 *   - FIXED: View Quote button moved to bottom-left of card (below description).
 *
 * CHANGELOG v1.5.0:
 *   - COMPLETE REDESIGN: Master proposal now matches the individual quote page styling exactly
 *   - Header: Teal bar with logo, phone/email pills, print button
 *   - Hero section: "Hi [name] here is your personalised proposal"
 *   - Customer Info & Account Manager: Two gray-background cards side by side
 *   - Trust badges: 4 trust icons matching quote page (Bespoke Design, Trustpilot, Insurance, Lifetime Support)
 *   - Green total bar: "Your total system price" matching quote page
 *   - Quote sections: Main & Alternative with proper card styling per technology type
 *   - What Happens Next: 4-step process copied from quote page
 *   - CTA Banner: Magenta call-to-action bar
 *   - Footer: Matching quote page footer
 *   - Full responsive CSS matching quote page mobile overrides
 *
 * CHANGELOG v1.4.0:
 *   - Added: Print quote button in header
 *   - Styling improvements
 *
 * CHANGELOG v1.3.0:
 *   - Fixed: Wrapped all log calls in safe logging helper to prevent "log.warn is not a function"
 *     errors during preview generation. All log.debug/warn/audit/error calls now use safeLog().
 *
 * CHANGELOG v1.1.0:
 *   - Fixed: saveProposalToFileCabinet parameter order (was swapped)
 *   - Fixed: updateOpportunityWithProposalUrl now uses correct property name (fileUrl)
 *   - Fixed: Added N/error module import for proper error handling
 *   - Added: generatePreviewHTML() for preview mode (no file save, no field update)
 *   - Added: Enhanced logging throughout for debugging
 *   - Added: proposalUrl and fileName in return object for success page
 *
 * USAGE:
 *   var masterProposal = require('./nuheat_master_proposal');
 *
 *   // Full generation (save to File Cabinet + update Opportunity)
 *   var result = masterProposal.generateMasterProposal(opportunityId, selectedQuotes);
 *
 *   // Preview only (generate HTML without saving)
 *   var html = masterProposal.generatePreviewHTML(opportunityId, selectedQuotes);
 */

define([
    'N/record',
    'N/search',
    'N/file',
    'N/log',
    'N/url',
    'N/runtime',
    'N/format',
    'N/error'
], function (record, search, file, log, url, runtime, format, error) {

    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────────

    var MODULE_VERSION = '1.6.6';

    var GTM_CONTAINER_ID = 'GTM-5NJJSBMP';

    /**
     * Safe logging helper — wraps N/log calls in try-catch to prevent
     * "log.warn is not a function" errors when the log module is unavailable
     * or partially loaded (e.g. during preview generation in some contexts).
     */
    function safeLog(level, title, details) {
        try {
            if (log && typeof log[level] === 'function') {
                log[level](title, details);
            }
        } catch (e) {
            // Silently ignore logging failures
        }
    }

    /**
     * File Cabinet folder ID for storing generated proposal HTML files.
     * Same folder as individual quotes: "Quote HTML Files" (ID: 26895192)
     */
    var FOLDER_ID = 26895192;

    /**
     * Nu-Heat brand colours — identical to nuheat_quote_suitelet.js v4.3.36
     */
    var BRAND = {
        primary:      '#00857D',
        primaryDark:  '#074F71',
        secondary:    '#00B0B9',
        accent:       '#E35205',
        yellow:       '#FFB500',
        purple:       '#59315F',
        magenta:      '#AA0061',
        text:         '#53565A',
        textLight:    '#796E65',
        grayLight:    '#D9D9D6',
        white:        '#ffffff',
        bg:           '#F5F5F5',
        success:      '#00b67a'
    };

    /**
     * Technology type ordering for display.
     * Lower number = displayed first.
     */
    var TECHNOLOGY_ORDER = {
        'Underfloor Heating': 1,
        'Heat Pump':          2,
        'Solar':              3,
        'Other':              4
    };

    /**
     * Quote type display names → CSS class slugs
     */
    var QUOTE_TYPE_SLUGS = {
        'Underfloor Heating': 'ufh',
        'Heat Pump':          'heat-pump',
        'Solar':              'solar',
        'Other':              'other'
    };

    /**
     * v1.6.0: Static benefit checkmarks per quote type.
     * Displayed as a row of teal SVG checkmarks inside each system card.
     * Edit these arrays to update benefit text — no other code changes needed.
     */
    var SYSTEM_BENEFITS = {
        'Underfloor Heating': [
            'Bespoke pipework design',
            'Detailed installation pack',
            'All components included',
            'Lifetime tech support'
        ],
        'Heat Pump': [
            'MCS certified installation',
            'BUS grant application handled',
            '7-year warranty',
            'Complete system package'
        ],
        'Solar': [
            'MCS certified installation',
            'Reduced energy bills',
            'Complete system package',
            'Lifetime tech support'
        ],
        'Other': [
            'Designed for your project',
            'All components included',
            'Professional installation',
            'Lifetime tech support'
        ]
    };

    /**
     * v1.6.0: Whether to show the BUS Grant banner after Heat Pump cards.
     * Set to false to hide the banner without removing code.
     */
    var SHOW_BUS_GRANT_BANNER = true;

    // ─── Logo (hardcoded base64 — identical to nuheat_quote_suitelet.js v4.3.36) ─
    // v1.5.1 FIX: Hardcode logo base64 directly instead of loading from File Cabinet
    // to ensure logo always displays correctly, matching the individual quote page.
    var NUHEAT_LOGO_BASE64 = 'data:image/png;base64,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';

    /**
     * Returns the hardcoded logo base64 string.
     * v1.5.1: No longer loads from File Cabinet — hardcoded for reliability.
     */
    function loadLogo() {
        return NUHEAT_LOGO_BASE64;
    }

    // ─── Main Entry Points ───────────────────────────────────────────────────────

    /**
     * Generates a master proposal HTML page and saves it to the File Cabinet.
     * Also updates the Opportunity record with the proposal URL and sent date.
     *
     * @param {string|number} opportunityId - Internal ID of the Opportunity record
     * @param {Array<Object>} selectedQuotes - Array of selected quote objects
     * @returns {Object} { success, proposalUrl, fileId, fileName, error }
     */
    function generateMasterProposal(opportunityId, selectedQuotes) {
        safeLog('audit', 'MasterProposal.generate', 'Starting for Opportunity ' + opportunityId +
            ' with ' + selectedQuotes.length + ' quotes (v' + MODULE_VERSION + ')');

        try {
            // 1. Load Opportunity data
            var oppData = loadOpportunityData(opportunityId);
            safeLog('debug', 'MasterProposal.generate', 'Loaded Opportunity data: ' + oppData.tranId + ' | Customer: ' + oppData.customerName);

            // 2. Split into Main vs Alternative and sort by technology order
            var mainQuotes = [];
            var alternativeQuotes = [];

            selectedQuotes.forEach(function (q) {
                if (q.category === 'main') {
                    mainQuotes.push(q);
                } else {
                    alternativeQuotes.push(q);
                }
            });

            mainQuotes.sort(sortByTechnology);
            alternativeQuotes.sort(sortByTechnology);

            safeLog('debug', 'MasterProposal.generate', 'Main: ' + mainQuotes.length +
                ' | Alternative: ' + alternativeQuotes.length);

            // 3. Generate HTML
            var html = generateMasterProposalHTML(oppData, mainQuotes, alternativeQuotes);
            safeLog('debug', 'MasterProposal.generate', 'HTML generated (' + html.length + ' chars)');

            // 4. v1.6.2: Removed cleanup — keep all proposal versions for history
            // Previously: cleanupOldProposals(opportunityId);
            // Timestamped filenames already provide good security, and retaining
            // all versions builds a complete proposal history over time.

            // 5. Save to File Cabinet
            var saveResult = saveProposalToFileCabinet(opportunityId, html);
            safeLog('audit', 'MasterProposal.generate', 'File saved — ID: ' + saveResult.fileId +
                ' | Name: ' + saveResult.fileName + ' | URL: ' + saveResult.fileUrl);

            // 6. Update Opportunity record with URL and date
            updateOpportunityWithProposalUrl(opportunityId, saveResult.fileUrl);
            safeLog('audit', 'MasterProposal.generate', 'Opportunity ' + opportunityId + ' updated with proposal URL');

            return {
                success:     true,
                proposalUrl: saveResult.fileUrl,
                fileId:      saveResult.fileId,
                fileName:    saveResult.fileName,
                error:       ''
            };

        } catch (e) {
            safeLog('error', 'MasterProposal.generate', 'Error: ' + e.message + '\n' + e.stack);
            return {
                success:     false,
                proposalUrl: '',
                fileId:      0,
                fileName:    '',
                error:       e.message
            };
        }
    }

    /**
     * Generates the proposal HTML without saving to File Cabinet or updating any records.
     * Used for the Preview functionality.
     *
     * @param {string|number} opportunityId - Internal ID of the Opportunity record
     * @param {Array<Object>} selectedQuotes - Array of selected quote objects
     * @returns {string} The complete HTML string for the proposal
     */
    function generatePreviewHTML(opportunityId, selectedQuotes) {
        safeLog('audit', 'MasterProposal.preview', 'Generating preview for Opportunity ' + opportunityId +
            ' with ' + selectedQuotes.length + ' quotes');

        var oppData = loadOpportunityData(opportunityId);

        var mainQuotes = [];
        var alternativeQuotes = [];

        selectedQuotes.forEach(function (q) {
            if (q.category === 'main') {
                mainQuotes.push(q);
            } else {
                alternativeQuotes.push(q);
            }
        });

        mainQuotes.sort(sortByTechnology);
        alternativeQuotes.sort(sortByTechnology);

        var html = generateMasterProposalHTML(oppData, mainQuotes, alternativeQuotes);
        safeLog('debug', 'MasterProposal.preview', 'Preview HTML generated (' + html.length + ' chars)');

        return html;
    }

    // ─── Data Loading ─────────────────────────────────────────────────────────────

    /**
     * Loads Opportunity record data needed for the proposal.
     */
    function loadOpportunityData(opportunityId) {
        safeLog('debug', 'MasterProposal.loadOppData', 'Loading Opportunity ' + opportunityId);

        var oppRecord = record.load({
            type: record.Type.OPPORTUNITY,
            id: opportunityId
        });

        var salesRepId = oppRecord.getValue({ fieldId: 'salesrep' });
        var salesRepData = loadSalesRepData(salesRepId);

        // v1.5.7: Pull phone from custbody_sales_rep_phone on the opportunity record
        // This field takes priority over the employee record's phone field
        var salesRepPhone = '';
        try {
            salesRepPhone = (oppRecord.getValue({ fieldId: 'custbody_sales_rep_phone' }) || '').trim();
        } catch (e) {
            safeLog('debug', 'MasterProposal.loadOppData', 'Could not read custbody_sales_rep_phone: ' + e.message);
        }
        if (salesRepPhone) {
            safeLog('debug', 'MasterProposal.loadOppData', 'Using custbody_sales_rep_phone: "' + salesRepPhone + '"');
            salesRepData.phone = salesRepPhone;
        } else {
            safeLog('debug', 'MasterProposal.loadOppData', 'custbody_sales_rep_phone empty — falling back to employee phone: "' + salesRepData.phone + '"');
        }

        var siteAddress = '';
        try {
            siteAddress = (oppRecord.getValue({ fieldId: 'custbody_opp_site_adress' }) || '').trim();
        } catch (e) {
            safeLog('debug', 'MasterProposal.loadOppData', 'Could not read custbody_opp_site_adress: ' + e.message);
        }

        var customerId = oppRecord.getValue({ fieldId: 'entity' });
        var customerName = oppRecord.getText({ fieldId: 'entity' }) || '';

        // v1.5.3 FIX: Load customer record to get firstname field directly,
        // instead of parsing from company/entity name which includes prefixes like "NS281444".
        // If firstname is blank/null, greeting will show "Hi here is your" (no name).
        var firstName = '';
        var customerEmail = '';
        if (customerId) {
            try {
                var custRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId
                });
                firstName = (custRecord.getValue({ fieldId: 'firstname' }) || '').trim();
                customerEmail = (custRecord.getValue({ fieldId: 'email' }) || '').trim();
                safeLog('debug', 'MasterProposal.loadOppData', 'Customer record loaded — firstname: "' + firstName + '", email: "' + customerEmail + '"');
            } catch (e) {
                safeLog('debug', 'MasterProposal.loadOppData', 'Could not load customer record ' + customerId + ': ' + e.message);
                // Fallback: try lookupFields for email only
                try {
                    var custFields = search.lookupFields({
                        type: search.Type.CUSTOMER,
                        id: customerId,
                        columns: ['email']
                    });
                    customerEmail = custFields.email || '';
                } catch (e2) {
                    safeLog('debug', 'MasterProposal.loadOppData', 'Could not look up customer email: ' + e2.message);
                }
            }
        }

        return {
            id:                opportunityId,
            tranId:            oppRecord.getValue({ fieldId: 'tranid' }) || '',
            title:             oppRecord.getValue({ fieldId: 'title' }) || '',
            quoteEmailRef:     oppRecord.getValue({ fieldId: 'custbody_quote_email_ref' }) || '',
            customerName:      customerName,
            customerFirst:     firstName,
            customerId:        customerId,
            customerEmail:     customerEmail,
            siteAddress:       siteAddress,
            status:            oppRecord.getText({ fieldId: 'entitystatus' }) || '',
            salesRep:          salesRepData,
            proposalDate:      formatDate(new Date())
        };
    }

    /**
     * Loads sales rep employee data for the account manager card.
     */
    function loadSalesRepData(salesRepId) {
        if (!salesRepId) {
            return {
                id:       '',
                name:     'Your Account Manager',
                email:    'info@nu-heat.co.uk',
                phone:    '01404 540604',
                initials: 'NH'
            };
        }

        try {
            var empRecord = record.load({
                type: record.Type.EMPLOYEE,
                id: salesRepId
            });

            var firstName = empRecord.getValue({ fieldId: 'firstname' }) || '';
            var lastName  = empRecord.getValue({ fieldId: 'lastname' }) || '';
            var fullName  = (firstName + ' ' + lastName).trim() || 'Your Account Manager';

            var initials = '';
            if (firstName) initials += firstName.charAt(0).toUpperCase();
            if (lastName) initials += lastName.charAt(0).toUpperCase();
            if (!initials) initials = 'NH';

            return {
                id:       salesRepId,
                name:     fullName,
                email:    empRecord.getValue({ fieldId: 'email' }) || 'info@nu-heat.co.uk',
                phone:    empRecord.getValue({ fieldId: 'phone' }) || '01404 540604',
                initials: initials
            };
        } catch (e) {
            safeLog('warn', 'MasterProposal.loadSalesRep', 'Could not load sales rep ' + salesRepId + ': ' + e.message);
            return {
                id:       salesRepId,
                name:     'Your Account Manager',
                email:    'info@nu-heat.co.uk',
                phone:    '01404 540604',
                initials: 'NH'
            };
        }
    }

    // ─── HTML Generation ──────────────────────────────────────────────────────────

    /**
     * Generates the complete master proposal HTML document.
     * Matches the individual quote page styling exactly.
     */
    function generateMasterProposalHTML(oppData, mainQuotes, alternativeQuotes) {
        var logo = loadLogo();
        var html = [];

        html.push('<!DOCTYPE html>');
        html.push('<html lang="en">');
        html.push('<head>');

        // Data layer — must be before GTM snippet so values are available on gtm.js load
        html.push('<script>');
        html.push('window.dataLayer = window.dataLayer || [];');
        html.push('window.dataLayer.push({');
        html.push('  "event": "nuheat_proposal_view",');
        html.push('  "customerId": "' + (oppData.customerId || '') + '",');
        html.push('  "opportunityId": "' + (oppData.id || '') + '",');
        html.push('  "pageType": "proposal"');
        html.push('});');
        html.push('</script>');

        // GTM head snippet
        html.push('<!-- Google Tag Manager -->');
        html.push('<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":');
        html.push('new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],');
        html.push('j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src=');
        html.push('"https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);');
        html.push('})(window,document,"script","dataLayer","' + GTM_CONTAINER_ID + '");</script>');
        html.push('<!-- End Google Tag Manager -->');

        html.push('<meta charset="UTF-8">');
        html.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
        html.push('<meta name="robots" content="noindex, nofollow">');
        html.push('<title>Your Nu-Heat Proposal | ' + escapeHtml(oppData.title || oppData.tranId) + '</title>');
        html.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
        html.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
        html.push('<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">');
        html.push('<style>');
        html.push(generateCSS());
        html.push('</style>');
        html.push('</head>');
        html.push('<body>');

        // GTM noscript — immediately after <body>
        html.push('<!-- Google Tag Manager (noscript) -->');
        html.push('<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=' + GTM_CONTAINER_ID + '"');
        html.push('height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>');
        html.push('<!-- End Google Tag Manager (noscript) -->');

        html.push('<div class="page-container">');

        // 1. Header — teal bar with logo, phone, email, print button
        html.push(generateHeader(oppData, logo));

        // 2. Hero + Customer Info + Account Manager
        html.push(generateHeaderContent(oppData));

        // 3. Value Proposition Section — "Included with every Nu-Heat system" (v1.5.6)
        html.push(generateValueSection());

        // 4. Green Total Price Bar (Main quotes only)
        html.push(generateTotalPriceBar(mainQuotes));

        // 5. Main System Quotes Section
        html.push(generateQuotesSection('Main System Quotes &amp; Costs', mainQuotes, true));

        // 6. Alternative Quotes Section (only if any exist)
        if (alternativeQuotes.length > 0) {
            html.push(generateQuotesSection('Alternative Solutions', alternativeQuotes, false));
        }

        // 7. What Happens Next
        html.push(generateWhatHappensNext(oppData));

        // 8. CTA Banner
        html.push(generateCTABanner(oppData));

        // 9. Footer
        html.push(generateFooter(oppData, logo));

        html.push('</div>'); // end .page-container

        // Print script
        html.push(generatePrintScript());

        html.push('</body>');
        html.push('</html>');

        return html.join('\n');
    }

    /**
     * Generates the header top bar — teal background with logo, phone, email, print button.
     * Matches the individual quote page header exactly.
     */
    function generateHeader(oppData, logo) {
        var h = [];
        h.push('<header class="header-top-bar">');
        h.push('  <div class="header-top-bar-inner">');
        h.push('    <div class="logo-area">');
        if (logo) {
            h.push('      <img src="' + logo + '" alt="Nu-Heat" class="nuheat-logo">');
        } else {
            h.push('      <span class="logo-placeholder">N\u00fc-Heat</span>');
            h.push('      <span class="logo-tagline">Feel the difference</span>');
        }
        h.push('    </div>');
        h.push('    <div class="header-actions">');
        h.push('      <div class="header-contact">');
        // Phone pill
        h.push('        <a href="tel:' + escapeHtml(oppData.salesRep.phone) + '">');
        h.push('          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>');
        h.push('          ' + escapeHtml(oppData.salesRep.phone));
        h.push('        </a>');
        // Email pill
        h.push('        <a href="mailto:' + escapeHtml(oppData.salesRep.email) + '">');
        h.push('          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>');
        h.push('          ' + escapeHtml(oppData.salesRep.email));
        h.push('        </a>');
        // Print button (magenta)
        h.push('        <a href="#" class="btn-print-quote" onclick="window.print();return false;">');
        h.push('          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>');
        h.push('          Print quote');
        h.push('        </a>');
        h.push('      </div>');
        h.push('    </div>');
        h.push('  </div>');
        h.push('</header>');
        return h.join('\n');
    }

    /**
     * Generates the greeting and customer info section.
     * Matches the individual quote page layout:
     *   - "Hi [name] here is your" (h2)
     *   - "personalised proposal" (h1 - bold hero)
     *   - Two cards side by side: Customer Information | Your Account Manager
     */
    function generateHeaderContent(oppData) {
        var h = [];
        h.push('<div class="header-content">');

        // Greeting
        h.push('  <div class="greeting-row">');
        h.push('    <div class="greeting-text">');
        h.push('      <h2 class="greeting-h2">Hi' + (oppData.customerFirst ? ' ' + escapeHtml(oppData.customerFirst) : '') + ' here is your</h2>');
        h.push('      <h1 class="greeting-h1">personalised proposal</h1>');
        h.push('    </div>');
        h.push('  </div>');

        // Customer info & Account manager grid (two gray cards)
        h.push('  <div class="customer-info-grid">');

        // Left: Customer info
        h.push('    <div class="info-block">');
        h.push('      <h3>Customer Information</h3>');
        h.push('      <div class="info-item"><span class="info-label">Customer name:</span><span class="info-value">' + escapeHtml(oppData.customerName) + '</span></div>');
        if (oppData.siteAddress) {
            h.push('      <div class="info-item"><span class="info-label">Site address:</span><span class="info-value">' + escapeHtml(oppData.siteAddress) + '</span></div>');
        }
        h.push('      <div class="info-item"><span class="info-label">System reference:</span><span class="info-value">' + escapeHtml(oppData.tranId) + '</span></div>');
        h.push('      <div class="info-item"><span class="info-label">Quote date:</span><span class="info-value">' + escapeHtml(oppData.proposalDate) + '</span></div>');
        h.push('    </div>');

        // Right: Account Manager (NO photo/avatar — just text, matching quote page)
        h.push('    <div class="info-block">');
        h.push('      <h3>Your Account Manager</h3>');
        h.push('      <div class="info-item"><span class="info-label">Name:</span><span class="info-value">' + escapeHtml(oppData.salesRep.name) + '</span></div>');
        h.push('      <div class="info-item"><span class="info-label">Email:</span><span class="info-value"><a href="mailto:' + escapeHtml(oppData.salesRep.email) + '">' + escapeHtml(oppData.salesRep.email) + '</a></span></div>');
        h.push('      <div class="info-item"><span class="info-label">Phone:</span><span class="info-value"><a href="tel:' + escapeHtml(oppData.salesRep.phone) + '">' + escapeHtml(oppData.salesRep.phone) + '</a></span></div>');
        h.push('    </div>');

        h.push('  </div>'); // end .customer-info-grid
        h.push('</div>'); // end .header-content
        return h.join('\n');
    }

    /**
     * Generates the "Included with every Nu-Heat system" value proposition section.
     * v1.5.6: Replaces the old trust badges section with three value cards featuring
     * circular photographs overlapping the top edge of each card.
     * Images hosted on NetSuite File Cabinet.
     */
    function generateValueSection() {
        var h = [];
        h.push('<section class="value-section">');
        h.push('  <h2 class="value-section-title">Included with every Nu-Heat system</h2>');
        h.push('  <div class="value-grid">');

        // Card 1: Bespoke heating design
        h.push('    <div class="value-card">');
        h.push('      <div class="value-card-photo">');
        h.push('        <img src="https://472052.app.netsuite.com/core/media/media.nl?id=43192427&c=472052&h=-1YhzW-dJpHwnB7ZY7wFiFSC7NOaPlPzNqZlAvGEsCJFveKp" alt="Bespoke heating design">');
        h.push('      </div>');
        h.push('      <h3>Bespoke heating design</h3>');
        h.push('      <p>Specialist layouts tailored to your project. Engineered for seamless install and performance.</p>');
        h.push('    </div>');

        // Card 2: Ready-to-install system
        h.push('    <div class="value-card">');
        h.push('      <div class="value-card-photo">');
        h.push('        <img src="https://472052.app.netsuite.com/core/media/media.nl?id=43195214&c=472052&h=RMjeukcJ5yQ6Fvt6Lfftlrc_TIe2EtLu9T_QT1_1zFBWl4HE" alt="Ready-to-install system">');
        h.push('      </div>');
        h.push('      <h3>Ready-to-install system</h3>');
        h.push('      <p>All the components you need for a professional install. No hidden extras or surprise add-ons.</p>');
        h.push('    </div>');

        // Card 3: Lifetime tech support
        h.push('    <div class="value-card">');
        h.push('      <div class="value-card-photo">');
        h.push('        <img src="https://472052.app.netsuite.com/core/media/media.nl?id=43192429&c=472052&h=NwoaJ06FPWkcuawv4l3EWW90jioTdV8UxME4oFvVyKmnhrw1" alt="Lifetime tech support">');
        h.push('      </div>');
        h.push('      <h3>Lifetime tech support</h3>');
        h.push('      <p>Our expert team are just a phone call away, before, during and after installation.</p>');
        h.push('    </div>');

        h.push('  </div>');
        h.push('</section>');
        return h.join('\n');
    }



    /**
     * Generates the green total price bar — matches the quote page "Your total system price" section.
     * Only uses MAIN quotes for the total calculation.
     */
    function generateTotalPriceBar(mainQuotes) {
        var totals = calculateTotals(mainQuotes);
        var h = [];

        h.push('<section class="top-total-section">');
        h.push('  <div class="top-total-header">');
        h.push('    <div class="top-total-left">');
        h.push('      <h1 class="top-total-title">Your total system price</h1>');
        h.push('      <p class="top-total-terms">This proposal is subject to our terms and conditions</p>');
        h.push('    </div>');
        h.push('    <div class="top-total-right">');
        h.push('      <div class="top-total-amount">' + formatCurrency(totals.subtotal) + ' <span class="top-total-plus-vat">plus VAT</span></div>');

        // Breakdown
        if (totals.discount > 0) {
            h.push('      <div class="top-total-breakdown">');
            h.push('        <div class="top-total-breakdown-item">Discount: -' + formatCurrency(totals.discount) + '</div>');
            h.push('      </div>');
        }

        h.push('      <div class="top-total-inc-vat">Total inc. VAT: ' + formatCurrency(totals.totalIncVat) + '</div>');
        h.push('    </div>');
        h.push('  </div>');
        h.push('</section>');

        return h.join('\n');
    }

    /**
     * Generates a quotes section (Main or Alternative).
     * v1.5.1 REDESIGN: Removed technology group headers. Each quote card is standalone
     * with thin line separators between cards, matching the individual quote page layout.
     *
     * @param {string} sectionTitle - Section title HTML
     * @param {Array} quotes - Array of quote objects
     * @param {boolean} isMain - Whether this is the Main section
     */
    function generateQuotesSection(sectionTitle, quotes, isMain) {
        var sectionId = isMain ? 'main-quotes' : 'alt-quotes';
        var headerClass = isMain ? 'main-quotes-header' : 'alt-quotes-header';
        var h = [];

        h.push('<div class="collapsible-section">');
        h.push('  <div class="collapsible-header ' + headerClass + '" onclick="toggleSection(\'' + sectionId + '\')">');
        h.push('    <h2>' + sectionTitle + ' <span class="badge-count">(' + quotes.length + ' quote' + (quotes.length !== 1 ? 's' : '') + ')</span></h2>');
        h.push('    <span class="collapsible-toggle" id="' + sectionId + '-icon">\u25BC</span>');
        h.push('  </div>');
        h.push('  <div class="collapsible-content" id="' + sectionId + '-content">');
        h.push('    <div class="quotes-content">');

        if (isMain) {
            h.push('      <p class="quotes-intro">Your system covers every component needed for your project. Each quote contains a full component breakdown, bespoke design layouts, and detailed pricing.</p>');
        } else {
            h.push('      <p class="quotes-intro">These are alternative options that may be of interest. They represent different configurations or upgrade possibilities for your project.</p>');
        }

        // v1.6.0: Render all quotes as system cards (no separators — cards have own borders)
        var hasHeatPump = false;
        quotes.forEach(function (quote) {
            h.push(generateQuoteCard(quote, isMain));
            if (quote.quoteType === 'Heat Pump') {
                hasHeatPump = true;
            }
        });

        // v1.6.0: BUS Grant banner — shown only in main quotes if a Heat Pump is present
        if (isMain && hasHeatPump && SHOW_BUS_GRANT_BANNER) {
            h.push(generateBUSGrantBanner());
        }

        h.push('    </div>');
        h.push('  </div>');
        h.push('</div>');

        return h.join('\n');
    }

    /**
     * Generates a technology group within a quotes section.
     * e.g. "Underfloor Heating (1 quote)" with cards below.
     */
    function generateTechnologyGroup(techName, quotes, isMain) {
        var slug = QUOTE_TYPE_SLUGS[techName] || 'other';
        var h = [];

        h.push('<div class="tech-group tech-group-' + slug + '">');
        h.push('  <h3 class="tech-group-title">' + escapeHtml(techName) + ' <span class="tech-group-count">(' + quotes.length + ' quote' + (quotes.length !== 1 ? 's' : '') + ')</span></h3>');

        quotes.forEach(function (quote) {
            h.push(generateQuoteCard(quote, isMain));
        });

        h.push('</div>');

        return h.join('\n');
    }

    /**
     * Generates a single quote card using the new system card layout (v1.6.0).
     * Structure:
     *   - .system-card (bordered container)
     *     - .system-card-header (title, ref, description)
     *     - .system-benefits (4 checkmark items per quote type)
     *     - .system-card-footer (price left, CTA button right)
     *
     * All dynamic data variables are preserved from v1.5.x.
     * Price calculation logic (v1.5.4 fix) is preserved.
     */
    function generateQuoteCard(quote, isMain) {
        var h = [];

        h.push('<div class="system-card">');

        // ── Card Header: title, reference, description ──
        h.push('  <div class="system-card-header">');
        h.push('    <h3 class="system-card-title">' + escapeHtml(quote.quoteType || 'Quote') + '</h3>');
        if (quote.tranId) {
            h.push('    <div class="system-card-ref">Quote ref: ' + escapeHtml(quote.tranId) + '</div>');
        }
        // Render custbody_quote_description HTML (bold tags etc. rendered properly)
        if (quote.description && quote.description.trim()) {
            h.push('    <p class="system-card-desc">' + quote.description + '</p>');
        }
        h.push('  </div>');

        // ── Benefits Row: 4 checkmarks per quote type ──
        h.push(generateBenefitsRow(quote.quoteType));

        // ── Card Footer: price left, CTA right ──
        h.push('  <div class="system-card-footer">');

        // v1.5.4 FIX preserved: Use actual NetSuite price fields from record.load().
        // NS 'total' field ALREADY includes VAT (total = subtotal - discount + tax).
        var subtotal      = parseCurrencyAmount(quote.subtotal);
        var discountTotal = parseCurrencyAmount(quote.discountTotal);
        var taxTotal      = parseCurrencyAmount(quote.taxTotal);
        var total         = parseCurrencyAmount(quote.amount);  // 'amount' = NS 'total' (already inc VAT)

        safeLog('debug', 'MasterProposal.renderQuoteCard', 'Pricing for quote ' + (quote.tranId || quote.quoteId) +
            ': subtotal=' + subtotal + ', discount=' + discountTotal +
            ', tax=' + taxTotal + ', total(amount)=' + total);

        // Price display — compact footer format
        h.push('    <div class="system-card-pricing">');
        if (subtotal > 0) {
            h.push('      <div class="system-card-price">' + formatCurrency(subtotal) + '</div>');
        }

        // Price detail line: discount and/or total inc VAT
        var detailParts = [];
        if (discountTotal !== 0) {
            var discountDisplay = Math.abs(discountTotal);
            detailParts.push('<span class="discount">Discount: -' + formatCurrency(discountDisplay) + '</span>');
        }
        var totalIncVat = total;  // v1.5.4 FIX: NS 'total' already includes VAT
        if (totalIncVat > 0) {
            detailParts.push('Total inc. VAT: <strong>' + formatCurrency(totalIncVat) + '</strong>');
        }
        if (detailParts.length > 0) {
            h.push('      <div class="system-card-price-detail">' + detailParts.join(' &middot; ') + '</div>');
        }

        h.push('    </div>');

        // CTA button
        if (quote.quoteUrl) {
            h.push('    <a href="' + escapeHtml(quote.quoteUrl) + '" class="system-card-cta" target="_blank">');
            h.push('      View Full Quote');
            h.push('      <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>');
            h.push('    </a>');
        }

        h.push('  </div>');  // end .system-card-footer
        h.push('</div>');    // end .system-card

        return h.join('\n');
    }

    /**
     * v1.6.0: Generates a row of benefit checkmarks for a given quote type.
     * Uses the SYSTEM_BENEFITS constant. Falls back to 'Other' if type not found.
     */
    function generateBenefitsRow(quoteType) {
        var benefits = SYSTEM_BENEFITS[quoteType] || SYSTEM_BENEFITS['Other'];
        var h = [];
        h.push('<div class="system-benefits">');
        benefits.forEach(function (text) {
            h.push('  <div class="system-benefit">');
            h.push('    <div class="system-benefit-icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>');
            h.push('    <span>' + escapeHtml(text) + '</span>');
            h.push('  </div>');
        });
        h.push('</div>');
        return h.join('\n');
    }

    /**
     * v1.6.0: Generates the BUS Grant contextual banner.
     * Displayed after Heat Pump cards in the main quotes section.
     * Static informational text — not from NetSuite fields.
     */
    function generateBUSGrantBanner() {
        var h = [];
        h.push('<div class="grant-highlight">');
        h.push('  <div class="grant-highlight-icon">');
        h.push('    <span style="font-size: 24px; font-weight: 700; color: white;">&pound;</span>');
        h.push('  </div>');
        h.push('  <div class="grant-highlight-content">');
        h.push('    <div class="grant-highlight-title">Save &pound;7,500 with the Boiler Upgrade Scheme</div>');
        h.push('    <div class="grant-highlight-desc">Your heat pump may qualify for a &pound;7,500 government grant. We handle the full application &mdash; speak to your account manager for details.</div>');
        h.push('  </div>');
        h.push('</div>');
        return h.join('\n');
    }

    /**
     * Generates the "What happens next" section — copied from quote page.
     * 4 steps: Confirm → Bespoke Design → Delivery & Installation → Support for Life
     */
    function generateWhatHappensNext(oppData) {
        var h = [];

        h.push('<section class="what-happens-next-section">');
        h.push('  <h2 class="section-title">What happens next</h2>');
        h.push('  <div class="stages-container">');

        // Step 1
        h.push('    <div class="stage-item">');
        h.push('      <div class="stage-number-row"><div class="stage-number">1</div><div class="dotted-line"></div></div>');
        h.push('      <h3 class="stage-title">Confirm your quote</h3>');
        h.push('      <p class="stage-description">Call ' + escapeHtml(oppData.salesRep.name) + ' on ' + escapeHtml(oppData.salesRep.phone) + ' to discuss your quote and confirm your order. Once you\u2019re happy with the system specification, we will finalise your order and begin the next phase of your project.</p>');
        h.push('    </div>');

        // Step 2
        h.push('    <div class="stage-item">');
        h.push('      <div class="stage-number-row"><div class="stage-number">2</div><div class="dotted-line"></div></div>');
        h.push('      <h3 class="stage-title">Bespoke design</h3>');
        h.push('      <p class="stage-description">Our specialists craft a custom layout tailored specifically to the requirements of your property. Our approach ensures optimal system performance and a seamless installation process.</p>');
        h.push('    </div>');

        // Step 3
        h.push('    <div class="stage-item">');
        h.push('      <div class="stage-number-row"><div class="stage-number">3</div><div class="dotted-line"></div></div>');
        h.push('      <h3 class="stage-title">Delivery &amp; installation</h3>');
        h.push('      <p class="stage-description">We coordinate delivery to align with your project timelines, ensuring you have what you need, when you need it. Our technical team is available to guide you through the bespoke manual to ensure a smooth, professional installation from start to finish.</p>');
        h.push('    </div>');

        // Step 4
        h.push('    <div class="stage-item">');
        h.push('      <div class="stage-number-row"><div class="stage-number">4</div><div class="dotted-line"></div></div>');
        h.push('      <h3 class="stage-title">Support for life</h3>');
        h.push('      <p class="stage-description">Whether you are enjoying the system yourself or maintaining it, our dedicated technical team is always available for expert advice. Because we believe in our systems, we offer full support for life.</p>');
        h.push('    </div>');

        h.push('  </div>');
        h.push('</section>');

        return h.join('\n');
    }

    /**
     * Generates the CTA banner — magenta bar with call/email buttons.
     * Matches the quote page CTA banner.
     */
    function generateCTABanner(oppData) {
        var h = [];

        h.push('<div class="cta-banner">');
        h.push('  <div class="cta-text">');
        h.push('    <h3>Call ' + escapeHtml(oppData.salesRep.name) + ' on ' + escapeHtml(oppData.salesRep.phone) + '</h3>');
        h.push('    <p>Ready to get started? Your dedicated account manager is here to help, get in touch to confirm your order or ask any questions.</p>');
        h.push('  </div>');
        h.push('  <div class="cta-buttons">');
        h.push('    <a href="tel:' + escapeHtml(oppData.salesRep.phone) + '" class="cta-button">Call Now</a>');
        h.push('    <a href="mailto:' + escapeHtml(oppData.salesRep.email) + '" class="cta-button outline">Email ' + escapeHtml(oppData.salesRep.name.split(' ')[0]) + '</a>');
        h.push('  </div>');
        h.push('</div>');

        return h.join('\n');
    }

    /**
     * Generates the footer — matches the individual quote page footer exactly.
     */
    function generateFooter(oppData, logo) {
        var h = [];
        h.push('<footer class="footer">');
        h.push('  <div class="footer-content">');
        h.push('    <div class="footer-brand">');
        h.push('      <div class="footer-logo">');
        if (logo) {
            h.push('        <img src="' + logo + '" alt="Nu-Heat" style="height: 46px; width: auto;">');
        }
        h.push('      </div>');
        h.push('      <p class="footer-tagline">We believe there is a better way to make homes feel incredible. Our experts go further to ensure precise performance with systems that work better.</p>');
        h.push('    </div>');
        h.push('    <div class="footer-contact">');
        h.push('      <h4 class="footer-heading">Contact Us</h4>');
        h.push('      <p>Phone: <a href="tel:01404540650">01404 540650</a></p>');
        h.push('      <p>Email: <a href="mailto:info@nu-heat.co.uk">info@nu-heat.co.uk</a></p>');
        h.push('      <p>Web: <a href="https://www.nu-heat.co.uk" target="_blank">www.nu-heat.co.uk</a></p>');
        h.push('    </div>');
        h.push('  </div>');
        h.push('  <div class="footer-bottom">');
        h.push('    <p>&copy; ' + new Date().getFullYear() + ' Nu-Heat UK Ltd. All rights reserved. | Nu-Heat UK Ltd, Heathpark House, Devonshire Road, Heathpark Industrial Estate, Honiton, Devon EX14 1SD</p>');
        h.push('    <p style="margin-top: 8px;">Proposal Reference: ' + escapeHtml(oppData.tranId) + ' | Generated: ' + formatDateShort(new Date()) + '</p>');
        h.push('  </div>');
        h.push('</footer>');
        return h.join('\n');
    }

    /**
     * Generates the print + collapsible toggle JavaScript.
     */
    function generatePrintScript() {
        return '<script>\n' +
            'function toggleSection(sectionId) {\n' +
            '  var content = document.getElementById(sectionId + "-content");\n' +
            '  var icon = document.getElementById(sectionId + "-icon");\n' +
            '  if (content) { content.classList.toggle("collapsed"); }\n' +
            '  if (icon) { icon.classList.toggle("collapsed"); }\n' +
            '}\n' +
            '</script>';
    }

    // ─── CSS Generation ───────────────────────────────────────────────────────────

    /**
     * Generates all CSS for the master proposal page.
     * Matches the individual quote page styling exactly, including:
     *   - Same CSS variables
     *   - Same header, greeting, info blocks, trust badges
     *   - Same green total bar
     *   - Same collapsible sections
     *   - Same footer
     *   - Same responsive breakpoints
     *   - Same print styles
     */
    function generateCSS() {
        return [
            // ── CSS Variables (identical to quote page) ──
            ':root {',
            '  --color-primary: #00857D;',
            '  --color-primary-dark: #074F71;',
            '  --color-secondary: #00B0B9;',
            '  --color-accent: #E35205;',
            '  --color-yellow: #FFB500;',
            '  --color-purple: #59315F;',
            '  --color-magenta: #AA0061;',
            '  --color-text: #53565A;',
            '  --color-text-light: #796E65;',
            '  --color-gray-light: #D9D9D6;',
            '  --color-white: #FFFFFF;',
            '  --color-bg: #F5F5F5;',
            '  --color-success: #00b67a;',
            '  --font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
            '  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);',
            '  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);',
            '  --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);',
            '  --radius-sm: 4px;',
            '  --radius-md: 8px;',
            '  --radius-lg: 12px;',
            '  --radius-xl: 16px;',
            '  --max-width: 1000px;',
            '}',

            // ── Reset ──
            '* { margin: 0; padding: 0; box-sizing: border-box; }',
            'body { font-family: var(--font-family); font-size: 16px; line-height: 1.6; color: var(--color-text); background-color: var(--color-bg); -webkit-font-smoothing: antialiased; }',
            '.page-container { max-width: var(--max-width); margin: 0 auto; background: var(--color-white); box-shadow: var(--shadow-lg); }',

            // ── Header Top Bar (teal) ──
            '.header-top-bar { background: var(--color-primary); color: var(--color-white); padding: 22px 40px; }',
            '.header-top-bar-inner { display: flex; justify-content: space-between; align-items: center; }',
            '.logo-area { display: flex; flex-direction: column; }',
            '.logo-area .nuheat-logo { height: 40px; width: auto; }',
            '.logo-placeholder { font-size: 28px; font-weight: 700; color: var(--color-white); letter-spacing: -0.5px; }',
            '.logo-tagline { font-size: 12px; font-weight: 400; opacity: 0.9; margin-top: 2px; }',
            '.header-actions { display: flex; gap: 12px; align-items: center; }',
            '.header-contact { display: flex; gap: 12px; font-size: 14px; }',
            '.header-contact a { color: var(--color-white); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.2s ease; }',
            '.header-contact a:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.5); text-decoration: none; }',
            '.btn-print-quote { background: var(--color-magenta) !important; border-color: var(--color-magenta) !important; font-weight: 600 !important; }',
            '.btn-print-quote:hover { background: #8a0050 !important; }',

            // ── Header Content (greeting + info cards) ──
            '.header-content { background: var(--color-white); padding: 24px 40px 29px; }',
            '.greeting-row { display: flex; align-items: flex-start; gap: 60px; margin-bottom: 26px; max-width: 100%; }',
            '.greeting-text { flex: 0 0 auto; max-width: 100%; overflow: hidden; }',
            '.greeting-h1 { font-size: 48px; font-weight: 700; color: #333; margin: 0 0 20px 0; line-height: 1.1; }',
            '.greeting-h2 { font-size: 26px; font-weight: 400; color: #333; margin: 10px 0 0 0; }',

            // ── Customer Info Grid (two cards side by side) ──
            '.customer-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }',
            '.info-block { background: #f5f5f5; border-radius: 8px; padding: 20px 24px; }',
            '.info-block h3 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--color-primary); margin-bottom: 12px; text-align: left; }',
            '.info-item { display: flex; justify-content: flex-start; align-items: flex-start; margin-bottom: 4px; padding: 2px 0; font-size: 15px; color: #333; line-height: 1.4; }',
            '.info-label { font-weight: 500; color: #666; text-align: left; margin-right: 8px; flex-shrink: 0; }',
            '.info-value { font-weight: 400; text-align: left; color: #333; }',
            '.info-value a { color: var(--color-primary); text-decoration: none; }',
            '.info-value a:hover { text-decoration: underline; }',

            // ── Value Proposition Section (v1.5.6: replaces trust badges) ──
            '.value-section { padding: 40px 40px 48px; background: #ffffff; border-top: 1px solid #D9D9D6; }',
            '.value-section-title { font-size: 28px; font-weight: 600; color: #00857D; margin-bottom: 52px; text-align: center; line-height: 1.15; }',
            '.value-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }',
            '.value-card { padding: 52px 24px 28px; background: #f5f5f5; border-radius: 8px; text-align: center; position: relative; }',
            '.value-card-photo { width: 80px; height: 80px; border-radius: 50%; position: absolute; top: -40px; left: 50%; transform: translateX(-50%); overflow: hidden; border: 3px solid #00857D; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); background: #e0e0e0; }',
            '.value-card-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }',
            '.value-card h3 { font-size: 17px; font-weight: 600; color: #333333; margin-bottom: 8px; line-height: 1.3; }',
            '.value-card p { font-size: 14px; color: #666666; line-height: 1.55; margin: 0; }',

            // ── Green Total Price Bar ──
            '.top-total-section { background: #00857D; color: var(--color-white); padding: 25px 40px; margin: 0; }',
            '.top-total-header { display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; }',
            '.top-total-left { text-align: left; }',
            '.top-total-title { font-size: 32px; font-weight: 700; margin: 0; }',
            '.top-total-terms { font-size: 13px; opacity: 0.7; margin: 10px 0 0 0; text-align: left; }',
            '.top-total-right { text-align: right; }',
            '.top-total-amount { font-size: 36px; font-weight: 700; margin-bottom: 0; }',
            '.top-total-plus-vat { font-size: 20px; font-weight: 400; vertical-align: middle; }',
            '.top-total-breakdown { font-size: 14px; opacity: 0.9; margin-top: 6px; }',
            '.top-total-breakdown-item { margin-bottom: 5px; }',
            '.top-total-inc-vat { font-size: 16px; font-weight: 700; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3); }',

            // ── Collapsible Sections (v1.6.0: reduced padding & font) ──
            '.collapsible-section { margin-bottom: 0; overflow: hidden; }',
            '.collapsible-header { padding: 20px 40px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; }',
            '.collapsible-header:hover { opacity: 0.95; }',
            '.collapsible-header h2 { font-size: 24px; font-weight: 700; margin: 0; line-height: 1.2; color: white; }',
            '.collapsible-header .badge-count { font-size: 14px; font-weight: 400; opacity: 0.8; margin-left: 10px; }',
            '.collapsible-toggle { font-size: 20px; color: white; transition: transform 0.3s ease; }',
            '.collapsible-toggle.collapsed { transform: rotate(-90deg); }',
            '.collapsible-content { transition: max-height 0.3s ease-out; overflow: hidden; }',
            '.collapsible-content.collapsed { display: none; }',

            // Main quotes header (dark gray)
            '.main-quotes-header { background: #53565a; }',
            '.main-quotes-header:hover { background: #45484b; }',

            // Alternative quotes header (lighter gray)
            '.alt-quotes-header { background: #7e8083; }',
            '.alt-quotes-header:hover { background: #6e7073; }',

            // ── Quotes Content Area (v1.6.0: renamed from .main-content) ──
            '.quotes-content { padding: 30px 40px; }',
            '.quotes-intro { font-size: 15px; color: #666; line-height: 1.6; margin-bottom: 24px; }',

            // ── Technology Groups (kept for backward compat) ──
            '.tech-group { margin-bottom: 0; }',
            '.tech-group + .tech-group { border-top: 1px solid #D3D3D3; padding-top: 30px; margin-top: 30px; }',
            '.tech-group-title { font-size: 28px; font-weight: 600; color: var(--color-primary); margin-bottom: 16px; margin-top: 0; }',
            '.tech-group-count { font-size: 14px; font-weight: 400; color: #999; margin-left: 8px; }',

            // ── System Cards (v1.6.0 REDESIGN — replaces .quote-card) ──
            '.system-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 0; margin-bottom: 24px; overflow: hidden; }',
            '.system-card:last-child { margin-bottom: 0; }',

            // System Card Header
            '.system-card-header { padding: 20px 24px 0; }',
            '.system-card-title { font-size: 22px; font-weight: 700; color: #333; margin-bottom: 2px; }',
            '.system-card-ref { font-size: 13px; color: #999; margin-bottom: 8px; }',
            '.system-card-desc { font-size: 14px; color: #666; line-height: 1.5; margin-bottom: 16px; }',
            '.system-card-desc strong { font-weight: 600; color: #333; }',

            // System Benefits Row
            '.system-benefits { display: flex; gap: 20px; padding: 0 24px 16px; flex-wrap: wrap; }',
            '.system-benefit { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text); }',
            '.system-benefit-icon { width: 18px; height: 18px; color: var(--color-primary); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }',
            '.system-benefit-icon svg { width: 16px; height: 16px; stroke: var(--color-primary); stroke-width: 2.5; fill: none; }',

            // System Card Footer
            '.system-card-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #f9f9f9; border-top: 1px solid #eee; }',
            '.system-card-price { font-size: 22px; font-weight: 700; color: #333; }',
            '.system-card-price-detail { font-size: 13px; color: #999; margin-top: 2px; }',
            '.system-card-price-detail .discount { color: var(--color-primary); font-weight: 500; }',

            // System Card CTA Button
            '.system-card-cta { display: inline-flex; align-items: center; gap: 8px; background: var(--color-magenta); color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; transition: all 0.2s ease; font-family: var(--font-family); }',
            '.system-card-cta:hover { background: #8a0050; transform: translateY(-1px); }',
            '.system-card-cta svg { width: 16px; height: 16px; stroke: white; stroke-width: 2; fill: none; }',

            // ── BUS Grant Banner (v1.6.0) ──
            '.grant-highlight { margin-top: 20px; padding: 20px 24px; background: linear-gradient(135deg, #f0f9f8 0%, #e8f7f6 100%); border-radius: 8px; border-left: 4px solid var(--color-primary); display: flex; align-items: center; gap: 16px; }',
            '.grant-highlight-icon { width: 48px; height: 48px; background: var(--color-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
            '.grant-highlight-icon svg { width: 24px; height: 24px; stroke: white; stroke-width: 2; fill: none; }',
            '.grant-highlight-content { flex: 1; }',
            '.grant-highlight-title { font-size: 16px; font-weight: 700; color: var(--color-primary); margin-bottom: 4px; }',
            '.grant-highlight-desc { font-size: 14px; color: #666; line-height: 1.5; }',

            // ── What Happens Next ──
            '.what-happens-next-section { background: #f9f9f9; padding: 40px; margin: 0; }',
            '.what-happens-next-section .section-title { font-size: 28px; font-weight: 600; color: var(--color-primary); margin-bottom: 16px; text-align: left; }',
            '.stages-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 25px; max-width: 1400px; margin: 0 auto; }',
            '.stage-item { display: flex; flex-direction: column; align-items: flex-start; }',
            '.stage-number-row { display: flex; align-items: center; width: 100%; margin-bottom: 15px; position: relative; }',
            '.stage-number { width: 50px; height: 50px; background: var(--color-primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0; z-index: 2; }',
            '.dotted-line { flex: 1; height: 2px; border-top: 2px dotted var(--color-primary); margin-left: 10px; }',
            '.stage-item:last-child .dotted-line { display: none; }',
            '.stage-title { font-size: 18px; font-weight: 700; color: #000; margin-bottom: 10px; text-align: left; }',
            '.stage-description { font-size: 15px; color: #666; line-height: 1.6; text-align: left; }',
            '.stage-item:hover { transform: translateY(-5px); transition: transform 0.3s ease; }',

            // ── CTA Banner (v1.6.0: restored redesign button sizes, flex-wrap from v1.5.9 retained) ──
            '.cta-banner { background: var(--color-magenta); color: var(--color-white); padding: 25px 40px; display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; }',
            '.cta-text { flex: 1 1 auto; min-width: 280px; }',
            '.cta-text h3 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }',
            '.cta-text p { font-size: 14px; opacity: 0.9; }',
            '.cta-buttons { display: flex; gap: 12px; flex-shrink: 0; }',
            '.cta-button { background: var(--color-white); color: var(--color-magenta); padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none; transition: transform 0.2s ease; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; font-family: var(--font-family); }',
            '.cta-button:hover { transform: scale(1.02); }',
            '.cta-button.outline { background: transparent; border: 2px solid var(--color-white); color: var(--color-white); }',

            // ── Footer ──
            '.footer { background: var(--color-text); color: var(--color-white); padding: 30px 40px; }',
            '.footer-content { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; }',
            '.footer-tagline { font-size: 14px; opacity: 0.8; line-height: 1.6; margin-top: 10px; }',
            '.footer-heading { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; color: var(--color-white); }',
            '.footer-contact p { font-size: 14px; margin-bottom: 6px; color: rgba(255,255,255,0.8); font-weight: 400; }',
            '.footer-contact a { color: rgba(255,255,255,0.8); text-decoration: none; font-weight: 400; }',
            '.footer-contact a:hover { color: var(--color-white); text-decoration: underline; }',
            '.footer-bottom { margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; font-size: 12px; opacity: 0.7; }',

            // ── Desktop/Universal Consistency ──
            '.info-label { font-weight: 500 !important; color: #666 !important; }',

            // ── Mobile Responsive (v1.6.0: updated for system cards) ──
            '@media (max-width: 768px) {',
            '  .page-container { max-width: 100%; box-shadow: none; }',
            '',
            '  .header-top-bar { padding: 20px; }',
            '  .logo-area img { height: 34px !important; }',
            '  .header-contact a[href^="mailto"] { display: none; }',
            '  .header-contact a.btn-print { display: none; }',
            '  .btn-print-quote { display: none; }',
            '  .header-contact a[href^="tel"] { padding: 0; font-size: 14px; font-weight: 600; background: none !important; border: none !important; border-radius: 0; }',
            '  .header-contact { gap: 8px; }',
            '',
            '  .header-content { padding: 28px 20px 12px; }',
            '  .greeting-h1 { font-size: 28px; line-height: 1.2; margin-bottom: 10px; }',
            '  .greeting-h2 { font-size: 16px; color: #666; margin-bottom: 8px; order: -1; }',
            '  .greeting-row { display: flex; flex-direction: column; margin-bottom: 20px; }',
            '',
            '  .customer-info-grid { grid-template-columns: 1fr; gap: 12px; margin-bottom: 8px; }',
            '  .info-block { padding: 16px; }',
            '  .info-block h3 { font-size: 11px; margin-bottom: 10px; }',
            '  .info-item { font-size: 13px; flex-direction: column; margin-bottom: 6px; }',
            '  .info-label { font-size: 13px; margin-right: 0; margin-bottom: 1px; }',
            '',
            // ── Value Proposition Section (mobile) ──
            '  .value-section { padding: 32px 20px 36px; }',
            '  .value-section-title { font-size: 24px; margin-bottom: 48px; }',
            '  .value-grid { grid-template-columns: 1fr; gap: 36px; }',
            '  .value-card { padding: 48px 20px 24px; }',
            '  .value-card-photo { width: 72px; height: 72px; top: -36px; border-width: 3px; }',
            '  .value-card h3 { font-size: 16px; }',
            '  .value-card p { font-size: 13px; }',
            '',
            '  .top-total-section { padding: 16px 20px; }',
            '  .top-total-header { flex-direction: column; align-items: center; text-align: center; }',
            '  .top-total-left { text-align: center; margin-bottom: 8px; }',
            '  .top-total-right { text-align: center; }',
            '  .top-total-title { font-size: 26px; }',
            '  .top-total-amount { font-size: 32px; }',
            '  .top-total-terms { text-align: center; }',
            '',
            '  .collapsible-header { padding: 16px 20px; }',
            '  .collapsible-header h2 { font-size: 20px; }',
            '',
            '  .quotes-content { padding: 24px 20px; }',
            '',
            // ── System Cards (mobile) ──
            '  .system-card-footer { flex-direction: column; gap: 16px; align-items: stretch; text-align: center; }',
            '  .system-card-cta { justify-content: center; }',
            '  .system-benefits { gap: 8px 16px; }',
            '  .system-benefit { flex: 0 0 calc(50% - 10px); }',
            '',
            // ── BUS Grant Banner (mobile) ──
            '  .grant-highlight { padding: 16px 20px; }',
            '  .grant-highlight-title { font-size: 15px; }',
            '  .grant-highlight-desc { font-size: 13px; }',
            '',
            '  .what-happens-next-section { padding: 24px 20px; }',
            '  .what-happens-next-section .section-title { font-size: 24px; }',
            '  .stages-container { grid-template-columns: 1fr; gap: 0; }',
            '  .stage-item { display: grid; grid-template-columns: 48px 1fr; grid-template-rows: auto auto; gap: 0 14px; padding: 18px 0; border-bottom: 1px solid #e8e8e8; }',
            '  .stage-item:last-child { border-bottom: none; padding-bottom: 0; }',
            '  .stage-item:hover { transform: none; }',
            '  .stage-number-row { grid-column: 1; grid-row: 1 / 3; margin-bottom: 0; padding-top: 2px; }',
            '  .stage-number { width: 42px; height: 42px; font-size: 18px; }',
            '  .dotted-line { display: none; }',
            '  .stage-title { grid-column: 2; grid-row: 1; font-size: 16px; margin-bottom: 4px; padding-top: 2px; }',
            '  .stage-description { grid-column: 2; grid-row: 2; font-size: 14px; }',
            '',
            '  .cta-banner { flex-direction: column; text-align: center; gap: 16px; padding: 24px 20px; }',
            '  .cta-buttons { flex-direction: column; width: 100%; gap: 10px; }',
            '  .cta-button { width: 100%; text-align: center; padding: 14px 20px; }',
            '',
            '  .footer { padding: 24px 20px; }',
            '  .footer-content { grid-template-columns: 1fr; gap: 16px; }',
            '  .footer-contact p { font-size: 13px; margin-bottom: 4px; }',
            '  .footer-heading { font-size: 13px; margin-bottom: 8px; }',
            '  .footer-tagline { font-size: 13px; margin-top: 6px; }',
            '  .footer-bottom { margin-top: 16px; padding-top: 14px; }',
            '  .footer-bottom p { font-size: 11px; line-height: 1.5; }',
            '}',

            // ── Print Styles (v1.6.0: updated for system cards) ──
            '@media print {',
            '  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
            '  body { background: white; font-size: 12px; }',
            '  .page-container { box-shadow: none; max-width: 100%; }',
            '  .header-contact { display: none !important; }',
            '  .cta-banner { display: none !important; }',
            '  .system-card-cta { display: none !important; }',
            '  .collapsible-content.collapsed { display: block !important; max-height: none !important; }',
            '}'
        ].join('\n');
    }

    // ─── File Cabinet Operations ──────────────────────────────────────────────────

    /**
     * Cleans up old proposal files for the same Opportunity.
     */
    function cleanupOldProposals(opportunityId) {
        try {
            var fileSearch = search.create({
                type: 'file',
                filters: [
                    ['folder', 'is', FOLDER_ID],
                    'AND',
                    ['name', 'startswith', 'proposal_' + opportunityId + '_']
                ],
                columns: ['name', 'internalid']
            });

            var results = fileSearch.run().getRange({ start: 0, end: 20 });

            results.forEach(function (result) {
                try {
                    file.delete({ id: result.getValue('internalid') });
                    safeLog('debug', 'MasterProposal.cleanup', 'Deleted old file: ' + result.getValue('name'));
                } catch (delErr) {
                    safeLog('warn', 'MasterProposal.cleanup', 'Could not delete file: ' + delErr.message);
                }
            });

            safeLog('debug', 'MasterProposal.cleanup', 'Cleanup complete — deleted ' + results.length + ' old files');

        } catch (e) {
            safeLog('warn', 'MasterProposal.cleanup', 'Cleanup search failed: ' + e.message);
        }
    }

    /**
     * Saves the generated HTML proposal to the NetSuite File Cabinet.
     */
    function saveProposalToFileCabinet(opportunityId, htmlContent) {
        safeLog('debug', 'MasterProposal.saveFile', 'Saving proposal for Opportunity ' + opportunityId +
            ' (' + htmlContent.length + ' chars)');

        var timestamp = format.format({
            value: new Date(),
            type: format.Type.DATETIME
        }).replace(/[\/\s:]/g, '_');

        var fileName = 'proposal_' + opportunityId + '_' + timestamp + '.html';

        var proposalFile = file.create({
            name: fileName,
            fileType: file.Type.HTMLDOC,
            contents: htmlContent,
            folder: FOLDER_ID,
            isOnline: true,
            description: 'Master Proposal for Opportunity ' + opportunityId + ' generated on ' + new Date().toISOString()
        });

        var fileId = proposalFile.save();
        safeLog('debug', 'MasterProposal.saveFile', 'Saved proposal file ID: ' + fileId + ', name: ' + fileName);

        var savedFile = file.load({ id: fileId });
        var relativeUrl = savedFile.url;

        // file.url returns a relative path (e.g. '/core/media/media.nl?id=...')
        // which breaks email button links as email clients have no base URL to
        // resolve against. Prepend the account hostname to produce a fully-qualified
        // https:// URL that works externally in all email clients and browsers.
        var accountHost = getAccountHostname();
        var fileUrl = (relativeUrl && relativeUrl.indexOf('http') === 0)
            ? relativeUrl
            : accountHost + relativeUrl;

        safeLog('debug', 'MasterProposal.saveFile',
            'Relative URL: ' + relativeUrl + ' | Absolute URL: ' + fileUrl +
            ' | Account host: ' + accountHost);

        return {
            fileId:   fileId,
            fileName: fileName,
            fileUrl:  fileUrl
        };
    }

    /**
     * Updates the Opportunity record with the proposal URL and sent date.
     */
    function updateOpportunityWithProposalUrl(opportunityId, proposalUrl) {
        safeLog('debug', 'MasterProposal.updateOpp', 'Updating Opportunity ' + opportunityId +
            ' with URL: ' + proposalUrl);

        try {
            record.submitFields({
                type: record.Type.OPPORTUNITY,
                id: opportunityId,
                values: {
                    custbody_master_proposal_url: proposalUrl,
                    custbody_last_proposal_sent_date: new Date()
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                }
            });
            safeLog('audit', 'MasterProposal.updateOpp', 'SUCCESS — Updated Opportunity ' + opportunityId + ' with proposal URL and date');
        } catch (e) {
            safeLog('error', 'MasterProposal.updateOpp', 'Failed to update Opportunity ' + opportunityId +
                ': ' + e.message + '\n' + e.stack);

            throw error.create({
                name: 'UPDATE_OPPORTUNITY_FAILED',
                message: 'Could not save proposal URL to Opportunity: ' + e.message,
                notifyOff: false
            });
        }
    }

    // ─── Helper Functions ─────────────────────────────────────────────────────────

    /**
     * Derives the fully-qualified NetSuite account hostname dynamically
     * using N/runtime, so proposal URLs work correctly in both Sandbox
     * and Production without any hardcoding.
     *
     * NetSuite account ID format:
     *   - Production:  '1234567'    → 'https://1234567.app.netsuite.com'
     *   - Sandbox:     '1234567_SB1' → 'https://1234567-sb1.app.netsuite.com'
     *
     * The transformation lowercases the ID and replaces underscores with hyphens,
     * which is the standard NetSuite subdomain format.
     *
     * @returns {string} e.g. 'https://472052-sb1.app.netsuite.com'
     */
    function getAccountHostname() {
        try {
            var accountId = runtime.accountId || '';
            // Convert '472052_SB1' → '472052-sb1' (lowercase, underscores to hyphens)
            var subdomain = accountId.toLowerCase().replace(/_/g, '-');
            return 'https://' + subdomain + '.app.netsuite.com';
        } catch (e) {
            safeLog('error', 'MasterProposal.getAccountHostname',
                'Could not derive account hostname: ' + e.message);
            // Hard fallback — prevents a total failure, but logs clearly
            return 'https://472052-sb1.app.netsuite.com';
        }
    }

    /**
     * Sorts quotes by technology type order.
     */
    function sortByTechnology(a, b) {
        var orderA = TECHNOLOGY_ORDER[a.quoteType] || 99;
        var orderB = TECHNOLOGY_ORDER[b.quoteType] || 99;
        return orderA - orderB;
    }

    /**
     * Groups quotes by their technology type.
     * @returns {Object} e.g. { 'Underfloor Heating': [...], 'Heat Pump': [...] }
     */
    function groupQuotesByTechnology(quotes) {
        var groups = {};
        quotes.forEach(function (q) {
            var tech = q.quoteType || 'Other';
            if (!groups[tech]) groups[tech] = [];
            groups[tech].push(q);
        });
        return groups;
    }

    /**
     * Calculates totals from an array of quote objects (for main quotes only).
     * v1.5.4 FIX: NS 'total' field already includes VAT (total = subtotal - discount + tax).
     * Previous code added vat to total, double-counting VAT.
     * Returns subtotal, discount, VAT, and total inc. VAT.
     */
    function calculateTotals(quotes) {
        var subtotal = 0;
        var discount = 0;
        var vat = 0;
        var total = 0;

        quotes.forEach(function (q) {
            subtotal += parseCurrencyAmount(q.subtotal);
            discount += Math.abs(parseCurrencyAmount(q.discountTotal));
            vat      += parseCurrencyAmount(q.taxTotal);
            total    += parseCurrencyAmount(q.amount);  // NS 'total' field = already inc VAT
        });

        // v1.5.4 FIX: NS 'total' already includes VAT — do NOT add vat again
        var totalIncVat = total;

        return {
            subtotal:    subtotal,
            discount:    discount,
            vat:         vat,
            totalIncVat: totalIncVat
        };
    }

    /**
     * Parses a currency amount string (e.g. "£8,500.00") to a number.
     */
    function parseCurrencyAmount(value) {
        if (!value) return 0;
        var str = String(value).replace(/[£,\s]/g, '');
        return parseFloat(str) || 0;
    }

    /**
     * Formats a number as a GBP currency string.
     */
    function formatCurrency(amount) {
        var num = parseFloat(amount) || 0;
        return '\u00A3' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Formats a date as "23 March 2026" (UK readable format).
     */
    function formatDate(dateVal) {
        var months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        try {
            var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
            if (isNaN(d.getTime())) return 'N/A';
            return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
        } catch (e) {
            return 'N/A';
        }
    }

    /**
     * Formats a date as "DD/MM/YYYY" (short UK format for footer).
     */
    function formatDateShort(dateVal) {
        try {
            var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
            if (isNaN(d.getTime())) return 'N/A';
            var day = ('0' + d.getDate()).slice(-2);
            var month = ('0' + (d.getMonth() + 1)).slice(-2);
            return day + '/' + month + '/' + d.getFullYear();
        } catch (e) {
            return 'N/A';
        }
    }

    /**
     * Extracts the first name from a full name string.
     * v1.5.1 FIX: Returns empty string if no first name found,
     * matching nuheat_quote_suitelet.js greeting logic exactly.
     * Result: "Hi John here is your" or "Hi here is your" (no name).
     */
    function extractFirstName(fullName) {
        if (!fullName) return '';
        // Skip NS-style prefixes like "NS281442" at start of customer name
        var name = fullName.trim();
        // If name starts with NS followed by digits, try to get the real first name
        if (/^NS\d+/i.test(name)) {
            var parts = name.split(/\s+/);
            // Skip the NS prefix part
            return parts.length > 1 ? parts[1] : '';
        }
        var parts = name.trim().split(/\s+/);
        return parts[0] || '';
    }

    /**
     * Escapes HTML special characters to prevent XSS.
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

    // ─── Module Exports ───────────────────────────────────────────────────────────

    return {
        generateMasterProposal: generateMasterProposal,
        generatePreviewHTML:    generatePreviewHTML,
        loadOpportunityData:    loadOpportunityData
    };
});