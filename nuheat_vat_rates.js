/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Nu-Heat VAT Rate Resolution
 *
 * Every Estimate is single-technology, so one VAT rate applies to the whole
 * quote. Rates are keyed off custbody_quote_type.
 *
 * ⚠️ This module DERIVES the rate that SHOULD apply. It does not read the
 * Estimate's tax codes. Where the two disagree, the consumer logs
 * VAT_MISMATCH — the tax codes in NetSuite are the root cause and must be
 * corrected there. The display fix is a stopgap; VAT_MISMATCH entries are
 * the work-list for fixing the source data.
 *
 * ⚠️ DEPLOYMENT: upload to SuiteScripts/NuHeat BEFORE redeploying either
 * consumer, or both fail at load time.
 *
 * Author: Nu-Heat Development Team
 * @version 1.0.0
 * Created: 18 August 2026
 */
define(['N/log'], function (log) {

    'use strict';

    var MODULE_VERSION = '1.0.0';

    // VAT rate by quote type DISPLAY name. Keys match the values (not the keys)
    // of QUOTE_TYPE_MAPPING in nuheat_send_quote_sl.js (~:165).
    //
    // Heat Pump 0%  — energy-saving materials relief
    // Solar     0%  — energy-saving materials relief  ⚠️ CONFIRM WITH STEVE
    // UFH      20%  — standard rated
    var VAT_RATES = {
        'Heat Pump':          0,
        'Solar':              0,
        'Underfloor Heating': 0.20,
        'Other':              0.20
    };

    var DEFAULT_VAT_RATE = 0.20;   // unknown type -> standard rate (never under-charge)

    /**
     * Raw custbody_quote_type list values -> display names.
     *
     * ⚠️ WHY THIS EXISTS. VAT_RATES is keyed on DISPLAY names ('Heat Pump'),
     * but callers hold the RAW list value ('Heat Pump (ASHP)', 'Heat Emitter',
     * 'Full System (DFD)'). Matching a raw value straight against VAT_RATES
     * fails, and the DEFAULT_VAT_RATE fallback would then charge an ASHP/GSHP/
     * EAHP heat pump quote 20% — the exact bug this module exists to fix, made
     * silent because 'Underfloor Heating' happens to default to 20% anyway.
     *
     * Normalising here (rather than at each call site) means both consumers
     * resolve identically whether they pass a raw value or a display name.
     * Keys are lowercased; lookup lowercases too, so case never matters.
     *
     * Mirrors QUOTE_TYPE_MAPPING in nuheat_send_quote_sl.js — if a new quote
     * type is added to the NetSuite list, add it in BOTH places.
     */
    var QUOTE_TYPE_ALIASES = {
        // Underfloor Heating types
        'heat emitter':             'Underfloor Heating',
        'full system (dfd/dfp)':    'Underfloor Heating',
        'multizone (dzm)':          'Underfloor Heating',
        'full system (dfd)':        'Underfloor Heating',
        'extension (dxd)':          'Underfloor Heating',
        'ufh for heat pump (dfhd)': 'Underfloor Heating',
        'full system':              'Underfloor Heating',
        'underfloor heating':       'Underfloor Heating',
        // Heat Pump types
        'heat pump':                'Heat Pump',
        'heat pump (gshp)':         'Heat Pump',
        'heat pump (ashp)':         'Heat Pump',
        'heat pump (eahp)':         'Heat Pump',
        // Solar types
        'solar':                    'Solar',
        'solar thermal':            'Solar',
        // Explicit catch-all
        'other':                    'Other'
    };

    /**
     * Normalises a raw or display quote type to a VAT_RATES key.
     *
     * @param {string} quoteType - raw custbody_quote_type text OR a display name
     * @returns {string} display name, or the trimmed input when unrecognised
     */
    function normaliseQuoteType(quoteType) {
        var s = String(quoteType || '').replace(/\s+/g, ' ').trim();
        if (!s) { return ''; }
        var lower = s.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(QUOTE_TYPE_ALIASES, lower)) {
            return QUOTE_TYPE_ALIASES[lower];
        }
        return s;   // unrecognised — returned as-is so resolveVatRate logs it
    }

    /**
     * Resolves the VAT rate that SHOULD apply to a quote.
     *
     * @param {string} quoteType - raw custbody_quote_type text OR a display name
     * @returns {{rate:number, percent:string, matched:boolean, quoteType:string}}
     */
    function resolveVatRate(quoteType) {
        var key = normaliseQuoteType(quoteType);
        var matched = Object.prototype.hasOwnProperty.call(VAT_RATES, key);
        var rate = matched ? VAT_RATES[key] : DEFAULT_VAT_RATE;

        if (!matched) {
            log.audit('VAT_RATE_UNMATCHED',
                'Quote type "' + quoteType + '" (normalised to "' + key + '") is not in VAT_RATES. ' +
                'Defaulting to ' + (DEFAULT_VAT_RATE * 100) + '%.');
        }

        return {
            rate:      rate,
            percent:   String(Math.round(rate * 100)) + '%',
            matched:   matched,
            quoteType: key
        };
    }

    /**
     * VAT on a net amount, rounded to 2dp.
     * netAmount should be subtotal MINUS discount (VAT applies after discount).
     *
     * @param {number|string} netAmount
     * @param {number} rate - 0 | 0.20
     * @returns {number}
     */
    function calculateVat(netAmount, rate) {
        var n = parseFloat(netAmount);
        if (isNaN(n)) { n = 0; }
        var r = parseFloat(rate);
        if (isNaN(r)) { r = DEFAULT_VAT_RATE; }
        return Math.round(n * r * 100) / 100;
    }

    /**
     * Compares derived VAT against NetSuite's taxtotal and logs a mismatch.
     * Tolerance 1p to absorb rounding.
     *
     * A mismatch means the TAX CODES ON THE ESTIMATE ARE WRONG. The quote page
     * shows the derived (correct) figure, but NetSuite will invoice its own —
     * so every VAT_MISMATCH entry is a record that needs fixing at source.
     *
     * @returns {boolean} true when they disagree
     */
    function logVatMismatch(context, recordId, derivedVat, netsuiteTaxTotal, quoteType) {
        var ns = parseFloat(netsuiteTaxTotal);
        if (isNaN(ns)) { ns = 0; }
        if (Math.abs(derivedVat - ns) <= 0.01) { return false; }

        log.audit('VAT_MISMATCH',
            context + ' — Estimate ' + recordId + ' (' + quoteType + '): derived VAT £' +
            derivedVat.toFixed(2) + ' but NetSuite taxtotal is £' + ns.toFixed(2) +
            '. Displaying the derived figure. FIX THE TAX CODES ON THIS ESTIMATE.');
        return true;
    }

    return {
        MODULE_VERSION:      MODULE_VERSION,
        VAT_RATES:           VAT_RATES,
        DEFAULT_VAT_RATE:    DEFAULT_VAT_RATE,
        QUOTE_TYPE_ALIASES:  QUOTE_TYPE_ALIASES,
        normaliseQuoteType:  normaliseQuoteType,
        resolveVatRate:      resolveVatRate,
        calculateVat:        calculateVat,
        logVatMismatch:      logVatMismatch
    };
});
