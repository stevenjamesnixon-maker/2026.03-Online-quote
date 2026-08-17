/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Nu-Heat BUS (Boiler Upgrade Scheme) Grant Resolution
 * ============================================================================
 *
 * Shared module holding the single source of truth for how much BUS grant
 * applies to an Estimate. Imported directly (AMD) by both the Quote Suitelet
 * and the Send Quote Suitelet so the quote page and the Master Proposal can
 * never disagree about the rate.
 *
 * Per project rules, same-account scripts import each other directly — never
 * via https.get().
 *
 * @version 1.0.0
 *
 * CHANGELOG v1.0.0 (Initial release):
 *   - ADDED: BUS_RATES, BUS_STANDARD_ITEMS, BUS_ENHANCED_ITEMS, SUPPAK_PREFIX.
 *   - ADDED: normaliseItemName() — strips "Parent : Child" prefixes, collapses
 *     whitespace, lowercases, for exact-match comparison.
 *   - ADDED: resolveBusGrant() — resolves an estimate's line items to one of
 *     three outcomes: £9,000 (enhanced), £7,500 (standard), or none.
 */
define(['N/log'], function (log) {

    'use strict';

    var MODULE_VERSION = '1.0.0';

    // =====================================================================
    // BUS (BOILER UPGRADE SCHEME) CONFIGURATION
    // =====================================================================
    // The BUS deduction applied to a heat pump quote is determined by which
    // Suppak line item is present on the Estimate. Item names are matched
    // exactly (case-insensitive, whitespace-normalised).
    var BUS_RATES = {
        STANDARD: 7500,
        ENHANCED: 9000
    };

    // Suppak items that qualify for the STANDARD £7,500 BUS rate.
    var BUS_STANDARD_ITEMS = [
        'suppak n1(r)hp',
        'suppak n1(nb)hp',
        'suppak bus'
    ];

    // Suppak items that qualify for the ENHANCED £9,000 BUS rate.
    var BUS_ENHANCED_ITEMS = [
        'suppak bus - uplift'
    ];

    // Any line whose normalised name starts with this prefix is treated as a
    // Suppak line. A Suppak line that matches neither list above suppresses BUS.
    var SUPPAK_PREFIX = 'suppak';

    /**
     * Normalises a line item name for BUS matching.
     * Takes the last colon-delimited segment, collapses whitespace, lowercases.
     *
     * NetSuite returns sub-item names as "Parent : Child" from
     * getSublistText({ fieldId: 'item' }), so the parent prefix must go before
     * an exact-match comparison can work.
     *
     * @param {string} name
     * @returns {string}
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
     * Determines the BUS grant amount for a quote from its line items.
     *
     * Matching is by exact equality against BUS_STANDARD_ITEMS /
     * BUS_ENHANCED_ITEMS, so 'suppak bus - uplift' can never be caught by the
     * 'suppak bus' entry and no longest-match ordering is needed. Do NOT switch
     * this to startsWith/substring matching.
     *
     * Precedence:
     *   - Enhanced beats standard if both are somehow present.
     *   - A non-qualifying Suppak line only suppresses the grant when no
     *     qualifying Suppak line is present. It never overrides a qualifying one.
     *   - No Suppak line at all means no BUS deduction.
     *
     * @param {Array} lineItems - all estimate lines (unfiltered)
     * @returns {{amount:number, rate:string, matchedItem:string|null, suppressedBy:string|null}}
     */
    function resolveBusGrant(lineItems) {
        var result = { amount: 0, rate: 'none', matchedItem: null, suppressedBy: null };
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
        SUPPAK_PREFIX:       SUPPAK_PREFIX,
        normaliseItemName:   normaliseItemName,
        resolveBusGrant:     resolveBusGrant
    };
});
