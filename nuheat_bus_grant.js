/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Nu-Heat BUS (Boiler Upgrade Scheme) Grant Resolution
 *
 * Shared by nuheat_quote_suitelet.js and nuheat_send_quote_sl.js so the
 * Suppak -> grant-rate rules cannot drift between the quote page and the
 * Master Proposal.
 *
 * ⚠️ DEPLOYMENT: this file must be uploaded to SuiteScripts/NuHeat BEFORE
 * either consumer script is redeployed, or both fail at load time.
 * Custom modules need no script deployment record — File Cabinet upload only.
 *
 * Author: Nu-Heat Development Team
 * @version 1.0.0
 * Created: 18 August 2026
 */
define(['N/log'], function (log) {

    'use strict';

    var MODULE_VERSION = '1.0.0';

    // The three possible BUS outcomes.
    var BUS_RATES = {
        STANDARD: 7500,
        ENHANCED: 9000,
        NONE:     0
    };

    // Suppak items qualifying for the STANDARD £7,500 rate.
    var BUS_STANDARD_ITEMS = [
        'suppak n1(r)hp',
        'suppak n1(nb)hp',
        'suppak bus'
    ];

    // Suppak items qualifying for the ENHANCED £9,000 rate.
    var BUS_ENHANCED_ITEMS = [
        'suppak bus - uplift'
    ];

    // Any line whose normalised name starts with this is treated as a Suppak
    // line. A Suppak line matching neither list above suppresses the grant.
    var SUPPAK_PREFIX = 'suppak';

    /**
     * Normalises a line item name for BUS matching.
     * NetSuite getSublistText() may return "Parent : Child" for sub-items,
     * so take the last colon-delimited segment, collapse whitespace, lowercase.
     *
     * @param {string} name - raw itemName as returned by NetSuite
     * @returns {string} normalised name ('' when input is empty)
     */
    function normaliseItemName(name) {
        if (!name) { return ''; }
        var s = String(name);
        if (s.indexOf(':') !== -1) {
            s = s.split(':').pop();
        }
        return s.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    /**
     * Resolves the BUS grant for a quote from its line items.
     *
     * Matching is EXACT array membership, never substring — 'suppak bus - uplift'
     * can therefore never be caught by the 'suppak bus' entry, so no
     * longest-match ordering is required. Do NOT switch to startsWith/indexOf
     * matching: a future SKU could then silently match the wrong tier.
     *
     * Precedence:
     *   1. Enhanced ('Suppak BUS - Uplift')    -> £9,000
     *   2. Standard (N1(R)HP / N1(NB)HP / BUS) -> £7,500
     *   3. Any other Suppak line, or no Suppak line -> no grant
     * A non-qualifying Suppak line only suppresses the grant when NO
     * qualifying line is present; it does not override one.
     *
     * @param {Array} lineItems - all estimate lines, each with .itemName
     * @returns {{amount:number, rate:string, matchedItem:string|null, suppressedBy:string|null}}
     */
    function resolveBusGrant(lineItems) {
        var result = { amount: BUS_RATES.NONE, rate: 'none', matchedItem: null, suppressedBy: null };

        var enhancedMatch = null;
        var standardMatch = null;
        var otherSuppak   = null;

        (lineItems || []).forEach(function (item) {
            var n = normaliseItemName(item && item.itemName);
            if (n.indexOf(SUPPAK_PREFIX) !== 0) { return; }   // not a Suppak line

            if (BUS_ENHANCED_ITEMS.indexOf(n) !== -1) {
                if (!enhancedMatch) { enhancedMatch = item.itemName; }
            } else if (BUS_STANDARD_ITEMS.indexOf(n) !== -1) {
                if (!standardMatch) { standardMatch = item.itemName; }
            } else if (!otherSuppak) {
                otherSuppak = item.itemName;
                // Loud, greppable audit entry — the exact itemName string NetSuite
                // returns for a Suppak line could not be confirmed from the repo,
                // so an unmatched line must be visible rather than silently paying
                // no grant.
                log.audit('BUS_UNMATCHED',
                    'Suppak line did not match any BUS tier. Raw itemName="' + item.itemName +
                    '", normalised="' + n + '". No grant applied from this line.');
            }
        });

        if (enhancedMatch) {
            result.amount = BUS_RATES.ENHANCED;
            result.rate = 'enhanced';
            result.matchedItem = enhancedMatch;
        } else if (standardMatch) {
            result.amount = BUS_RATES.STANDARD;
            result.rate = 'standard';
            result.matchedItem = standardMatch;
        } else {
            result.suppressedBy = otherSuppak;
        }

        log.audit('BUS_RESOLVE', 'rate=' + result.rate + ', amount=' + result.amount +
            ', matched=' + (result.matchedItem || 'none') +
            ', suppressedBy=' + (result.suppressedBy || 'none'));

        return result;
    }

    return {
        MODULE_VERSION:      MODULE_VERSION,
        BUS_RATES:           BUS_RATES,
        BUS_STANDARD_ITEMS:  BUS_STANDARD_ITEMS,
        BUS_ENHANCED_ITEMS:  BUS_ENHANCED_ITEMS,
        normaliseItemName:   normaliseItemName,
        resolveBusGrant:     resolveBusGrant
    };
});
