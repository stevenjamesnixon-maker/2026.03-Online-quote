/**
 * Tests for Send Quote SL 2.0.0 / Opportunity UE 1.2.0.
 *
 * No test framework: the repository has no package.json. `define` is stubbed, the real
 * Suitelet and Opportunity UE are loaded under stubbed N/* modules and a stubbed Master
 * Proposal, and each scenario is checked with ok(). Exits non-zero on any failure.
 *
 *   node test/send-quote-opp-update.js
 *
 * Sections:  A — 1.8.0 field-update scenarios, carried forward (A1–A14)
 *            B — 2.0.0 scenarios from the amendment-2 brief (B1–B19)
 *            C — 2.0.1: write order (status revert) and date pickers (C1–C5)
 *            D — 2.0.2 / UE 1.2.1: Expected close date (D1–D7)
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.join(__dirname, '..');
var failures = 0;
var passes = 0;

function ok(cond, msg) {
    if (cond) { passes++; console.log('  ok   ' + msg); }
    else      { failures++; console.log('  FAIL ' + msg); }
}

// ─── AMD loader ────────────────────────────────────────────────────────────────

function loadModule(file, modules) {
    var captured;
    var sandbox = {
        define: function (deps, factory) { captured = { deps: deps, factory: factory }; },
        console: console, Date: Date, JSON: JSON, Math: Math, isNaN: isNaN, parseFloat: parseFloat,
        parseInt: parseInt, String: String, Array: Array, Object: Object, Error: Error, Number: Number
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
    var args = captured.deps.map(function (d) {
        if (!(d in modules)) throw new Error(file + ': no stub for ' + d);
        return modules[d];
    });
    return captured.factory.apply(null, args);
}

// ─── Stubs ─────────────────────────────────────────────────────────────────────

var state;
var ALL_WRITES = [];   // every record.submitFields across every scenario (B18)

function resetState() {
    state = {
        calls: [],
        submits: [],
        emails: [],
        logs: [],
        redirect: null,
        pageMessages: [],
        emailThrows: null,
        generateFails: false,
        submitThrows: null,          // opportunity submitFields error
        estimateSubmitThrows: {},    // estimate id → error message
        selectOptionsThrow: {},
        forecastFieldType: 'checkbox',   // 'absent' → getField returns null
        generated: null,
        previewed: null,
        fieldTypes: { entitystatus: 'select', custbody_next_contact: 'date', custbody_opp_del_date: 'date', custbody_build_stage: 'select' },
        oppValues: {
            tranid: 'OPP123', title: 'Test Opp', entity: '55', entitystatus: '10',
            custbody_opp_site_adress: '1 Test Street',
            custbody_next_contact: new Date(2026, 9, 1),     // 01/10/2026
            custbody_opp_del_date: new Date(2026, 10, 15),   // 15/11/2026
            custbody_build_stage: '3'
        },
        options: {
            entitystatus:         [{ value: '10', text: 'Proposal' }, { value: '12', text: 'Quoted' }, { value: '13', text: 'Closed Won' }],
            custbody_build_stage: [{ value: '3', text: 'Foundations' }, { value: '4', text: 'Roof on' }]
        },
        contacts: [{ id: '71', first: 'Ann', last: 'Lee', email: 'ann@example.com' },
                   { id: '72', first: '</script><b>Bob', last: 'X', email: '' }],
        estimates: [
            { id: '901', opp: '123', tranid: 'EST901', title: '<b>Ground</b> & "x"', type: 'Heat Pump (ASHP)',
              subtotal: 10000, discount: -500, tax: 1900, total: 11400, items: ['Suppak N1(R)HP'],
              url: 'https://acct.example/q/901', desc: 'Air source heat pump', forecast: false },
            { id: '902', opp: '123', tranid: 'EST902', title: 'UFH first floor', type: 'Heat Emitter',
              subtotal: 4000, discount: 0, tax: 800, total: 4800, items: [],
              url: 'https://acct.example/q/902', desc: '</script><script>alert(1)</script>', forecast: true },
            { id: '903', opp: '123', tranid: 'EST903', title: 'Solar', type: 'Solar',
              subtotal: 3000, discount: 0, tax: 0, total: 3000, items: [],
              url: 'https://acct.example/q/903', desc: '', forecast: false },
            { id: '950', opp: '777', tranid: 'EST950', title: 'Other opp', type: 'Solar',
              subtotal: 1, discount: 0, tax: 0, total: 1, items: [], url: 'https://acct.example/q/950', desc: '', forecast: false }
        ]
    };
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
function estimate(id) { return state.estimates.filter(function (e) { return e.id === String(id); })[0]; }

var logStub = {};
['debug', 'audit', 'error', 'emergency'].forEach(function (lvl) {
    logStub[lvl] = function (title, details) { state.logs.push({ level: lvl, title: title, details: String(details) }); };
});

var formatStub = {
    Type: { DATE: 'date', DATETIME: 'datetime' },
    format: function (o) {
        var d = o.value;
        return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    },
    parse: function (o) {
        var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(o.value);
        if (!m) return o.value;          // NetSuite hands back the input when it cannot parse
        return new Date(+m[3], +m[2] - 1, +m[1]);
    }
};

function makeField(o) {
    return {
        id: o.id, type: o.type, label: o.label, container: o.container, options: [], defaultValue: undefined,
        displayType: null,
        addSelectOption: function (opt) { this.options.push(opt); },
        updateDisplayType: function (d) { this.displayType = d.displayType; },
        updateDisplaySize: function () {}, updateLayoutType: function () {}, updateBreakType: function () {}
    };
}

var serverWidgetStub = {
    FieldType: { INLINEHTML: 'inlinehtml', TEXT: 'text', SELECT: 'select', DATE: 'date', CHECKBOX: 'checkbox' },
    FieldDisplayType: { HIDDEN: 'hidden', ENTRY: 'entry' },
    SublistType: { LIST: 'list' },
    createForm: function (o) {
        return {
            title: o.title, fields: [], groups: [], sublists: [], buttons: [],
            addField: function (fo) { var f = makeField(fo); this.fields.push(f); return f; },
            addFieldGroup: function (g) { this.groups.push(g); return g; },
            addSublist: function (so) {
                var sl = { id: so.id, fields: [], rows: {}, addField: function (fo) { var f = makeField(fo); this.fields.push(f); return f; },
                           setSublistValue: function (v) { (this.rows[v.line] = this.rows[v.line] || {})[v.id] = v.value; } };
                this.sublists.push(sl);
                return sl;
            },
            addSubmitButton: function (b) { this.buttons.push(b); },
            addButton: function (b) { this.buttons.push(b); },
            field: function (id) { return this.fields.filter(function (f) { return f.id === id; })[0]; },
            html: function () { return this.fields.map(function (f) { return f.defaultValue || ''; }).join('\n'); }
        };
    }
};

function makeOppRecord(opts) {
    return {
        isDynamic: !!opts.isDynamic,
        getValue: function (o) { return state.oppValues[o.fieldId]; },
        getText: function (o) {
            if (o.fieldId === 'entitystatus') return 'Proposal';
            if (o.fieldId === 'entity') return 'Customer Ltd';
            return '';
        },
        getField: function (o) {
            var t = state.fieldTypes[o.fieldId];
            if (!t) return null;
            var isDyn = this.isDynamic;
            return {
                type: t,
                getSelectOptions: function () {
                    if (!isDyn) throw new Error('SSS_INVALID_API_USAGE: getSelectOptions requires dynamic mode');
                    if (state.selectOptionsThrow[o.fieldId]) throw new Error('getSelectOptions failed for ' + o.fieldId);
                    return state.options[o.fieldId] || [];
                }
            };
        }
    };
}

function makeEstimateRecord(e) {
    var vals = { subtotal: e.subtotal, discounttotal: e.discount, taxtotal: e.tax, total: e.total, includeinforecast: e.forecast };
    return {
        getValue: function (o) { return vals[o.fieldId]; },
        getLineCount: function () { return e.items.length; },
        getSublistText: function (o) { return e.items[o.line]; },
        getField: function (o) {
            if (o.fieldId !== 'includeinforecast' || state.forecastFieldType === 'absent') return null;
            return { type: state.forecastFieldType };
        }
    };
}

var recordStub = {
    Type: { OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate' },
    load: function (o) {
        state.calls.push('record.load:' + o.type);
        if (o.type === 'opportunity') return makeOppRecord(o);
        var e = estimate(o.id);
        if (!e || e.loadFails) throw new Error('could not load estimate ' + o.id);
        return makeEstimateRecord(e);
    },
    submitFields: function (o) {
        state.calls.push('record.submitFields:' + o.type);
        state.submits.push(o);
        ALL_WRITES.push(o);
        if (o.type === 'opportunity' && state.submitThrows) throw new Error(state.submitThrows);
        if (o.type === 'estimate' && state.estimateSubmitThrows[o.id]) throw new Error(state.estimateSubmitThrows[o.id]);
        return o.id;
    }
};

function filterValue(filters, name) {
    for (var i = 0; i < filters.length; i++) {
        if (Array.isArray(filters[i]) && filters[i][0] === name) return filters[i][2];
    }
    return undefined;
}

function estimateResult(e) {
    var vals = { internalid: e.id, tranid: e.tranid, title: e.title, total: String(e.total),
                 custbody_test_new_quote: e.url, datecreated: '01/09/2026', custbody_quote_description: e.desc };
    return {
        getValue: function (o) { return vals[typeof o === 'string' ? o : o.name] || ''; },
        getText: function (o) { return (typeof o === 'string' ? o : o.name) === 'custbody_quote_type' ? e.type : ''; }
    };
}

var searchStub = {
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate' },
    Sort: { DESC: 'DESC', ASC: 'ASC' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        state.calls.push('search.lookupFields:' + o.type);
        if (o.type === 'customer') return { email: 'cust@example.com' };
        return {};
    },
    create: function (o) {
        state.calls.push('search.create:' + o.type);
        var results = [];
        if (o.type === 'estimate') {
            var opp = String(filterValue(o.filters, 'opportunity'));
            var ids = filterValue(o.filters, 'internalid');
            results = state.estimates.filter(function (e) {
                return e.opp === opp && (!ids || ids.indexOf(e.id) !== -1);
            }).map(estimateResult);
        } else if (o.type === 'opportunity') {
            results = state.contacts.map(function (c) {
                var v = { internalid: c.id, firstname: c.first, lastname: c.last, email: c.email };
                return { getValue: function (q) { return v[q.name] || ''; } };
            });
        }
        return {
            run: function () {
                return {
                    getRange: function () { return results; },
                    each: function (cb) { for (var i = 0; i < results.length; i++) { if (cb(results[i]) === false) break; } }
                };
            }
        };
    }
};

var emailStub = {
    send: function (o) {
        state.calls.push('email.send');
        if (state.emailThrows) throw new Error(state.emailThrows);
        state.emails.push(o);
    }
};

var redirectStub = {
    toRecord: function (o) { state.calls.push('redirect.toRecord'); state.redirect = o; }
};

var masterProposalStub = {
    generateMasterProposal: function (oppId, quotes) {
        state.calls.push('generateMasterProposal');
        state.generated = quotes;
        if (state.generateFails) return { success: false, error: 'boom', proposalUrl: '', fileId: 0, fileName: '' };
        return { success: true, proposalUrl: 'https://acct.app.netsuite.com/core/media/media.nl?id=1', fileId: 1, fileName: 'proposal_1.html' };
    },
    generatePreviewHTML: function (oppId, quotes) { state.calls.push('generatePreviewHTML'); state.previewed = quotes; return '<html>preview</html>'; },
    loadOpportunityData: function () {
        return { tranId: 'OPP123', title: 'Test Opp', quoteEmailRef: 'Ref', customerId: '55',
                 salesRep: { id: '7', name: 'AM', email: 'am@example.com', phone: '0123' } };
    }
};

var modules = {
    'N/ui/serverWidget': serverWidgetStub,
    'N/search': searchStub,
    'N/record': recordStub,
    'N/log': logStub,
    'N/url': {
        resolveScript: function (o) { return '/app/site/hosting/scriptlet.nl?script=' + o.scriptId + '&deploy=' + o.deploymentId + '&action=' + o.params.action + '&opportunityId=' + o.params.opportunityId; },
        resolveRecord: function (o) { return '/app/accounting/transactions/opprtnty.nl?id=' + o.recordId; }
    },
    'N/redirect': redirectStub,
    'N/runtime': {
        getCurrentUser: function () { return { id: '7' }; },
        getCurrentScript: function () { return { id: 'customscript_nuheat_send_quote_sl', deploymentId: 'customdeploy_nuheat_send_quote_sl' }; }
    },
    'N/format': formatStub,
    'N/email': emailStub,
    'N/ui/message': { Type: { CONFIRMATION: 'confirmation', WARNING: 'warning', ERROR: 'error', INFORMATION: 'information' } },
    './nuheat_master_proposal': masterProposalStub
};
modules['./nuheat_bus_grant'] = loadModule('nuheat_bus_grant.js', modules);
modules['./nuheat_vat_rates'] = loadModule('nuheat_vat_rates.js', modules);

var suitelet = loadModule('nuheat_send_quote_sl.js', modules);
var oppUe    = loadModule('nuheat_opportunity_ue.js', modules);

// ─── Request helpers ───────────────────────────────────────────────────────────

function makeResponse() {
    return { page: null, written: null, writePage: function (f) { this.page = f; }, write: function (h) { this.written = h; }, setHeader: function () {} };
}

function runGet(params) {
    var ctx = { request: { method: 'GET', parameters: params || { opportunityId: '123' } }, response: makeResponse() };
    suitelet.onRequest(ctx);
    return ctx.response.page;
}

/** POST parameters as the unchanged page would submit them (901 Main, 902 Additional, 903 left out). */
function basePost(overrides) {
    var p = {
        custpage_opportunity_id: '123',
        custpage_sel: JSON.stringify({ '901': 'main', '902': 'additional' }),
        custpage_email_to: 'cust@example.com', custpage_email_cc: '', custpage_email_bcc: '',
        custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage',
        custpage_upd_entitystatus: '10', custpage_orig_entitystatus: '10', custpage_origtxt_entitystatus: 'Proposal',
        custpage_upd_next_contact: '2026-10-01', custpage_orig_next_contact: '2026-10-01', custpage_origtxt_next_contact: '01/10/2026',
        custpage_upd_del_date: '2026-11-15', custpage_orig_del_date: '2026-11-15', custpage_origtxt_del_date: '15/11/2026',
        custpage_upd_build_stage: '3', custpage_orig_build_stage: '3', custpage_origtxt_build_stage: 'Foundations'
    };
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });
    return p;
}

function runPost(params) {
    var ctx = { request: { method: 'POST', parameters: params }, response: makeResponse() };
    suitelet.onRequest(ctx);
    return ctx.response.page;
}

function oppWrites()      { return state.submits.filter(function (s) { return s.type === 'opportunity'; }); }
function estimateWrites() { return state.submits.filter(function (s) { return s.type === 'estimate'; }); }
function auditLogs(title) { return state.logs.filter(function (l) { return l.level === 'audit' && l.title === title; }); }
function pageHtml(form)   { return form ? form.html() : ''; }
function scriptBlocks(html) {
    var out = [], re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
}
function rowRole(html, id) {
    var m = new RegExp('data-qid="' + id + '" data-role="([a-z]+)"').exec(html);
    return m ? m[1] : null;
}

// ═══ A — 1.8.0 scenarios, carried forward ══════════════════════════════════════

console.log('A1. POST, nothing changed');
resetState();
runPost(basePost());
ok(state.emails.length === 1, 'email sent');
ok(oppWrites().length === 0, 'no opportunity submitFields');
ok(state.redirect && !('nsqf' in state.redirect.parameters) && state.redirect.parameters.nsq === 'ok', 'redirect: nsq=ok, no nsqf');       // changed (was: success-page panel text)
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /no changes/.test(l.details); }), 'audit "no changes"');

console.log('A2. Status changed only');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12' }));
ok(oppWrites().length === 1, 'one opportunity submitFields');
ok(oppWrites()[0] && JSON.stringify(Object.keys(oppWrites()[0].values)) === '["entitystatus"]', 'only entitystatus written');
ok(oppWrites()[0] && oppWrites()[0].values.entitystatus === '12', 'raw value written');
ok(oppWrites()[0] && oppWrites()[0].id === '123', 'targets the opportunity');
ok(oppWrites()[0] && oppWrites()[0].options.enableSourcing === true && oppWrites()[0].options.ignoreMandatoryFields === true, 'enableSourcing true (Status changed), ignoreMandatoryFields true');   // changed (was: enableSourcing false)
ok(state.redirect.parameters.nsqf === 'entitystatus', 'redirect nsqf=entitystatus');                                              // changed (was: panel display text)
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /entitystatus: 10 → 12/.test(l.details); }), 'audit old → new');

console.log('A3. All four changed');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12', custpage_upd_next_contact: '2026-10-05',
                   custpage_upd_del_date: '2026-12-01', custpage_upd_build_stage: '4' }));
ok(oppWrites().length === 1, 'one opportunity submitFields');
var v3 = oppWrites()[0] ? oppWrites()[0].values : {};
ok(Object.keys(v3).sort().join(',') === 'custbody_build_stage,custbody_next_contact,custbody_opp_del_date,entitystatus', 'all four fields');
ok(v3.custbody_next_contact instanceof Date && v3.custbody_opp_del_date instanceof Date, 'both dates are Date objects');
ok(v3.custbody_opp_del_date && v3.custbody_opp_del_date.getMonth() === 11 && v3.custbody_opp_del_date.getDate() === 1, 'delivery date parsed correctly');
ok(v3.custbody_build_stage === '4', 'build stage raw value');
ok(state.redirect.parameters.nsqf === 'entitystatus,next_contact,del_date,build_stage', 'redirect lists all four keys');

console.log('A4. Delivery date cleared');
resetState();
runPost(basePost({ custpage_upd_del_date: '' }));
ok(oppWrites().length === 0, 'blank-only change → no write');
resetState();
runPost(basePost({ custpage_upd_del_date: '', custpage_upd_build_stage: '4' }));
ok(oppWrites().length === 1 && !('custbody_opp_del_date' in oppWrites()[0].values), 'blank not written alongside other change');
resetState();
runPost(basePost({ custpage_upd_build_stage: '' }));
ok(oppWrites().length === 0, 'blank Build stage not written');

console.log('A5–A7. Failure paths — see B8 (email), B5 (validation) and below');
resetState();
state.generateFails = true;
var f6 = runPost(basePost({ custpage_upd_entitystatus: '12' }));
ok(state.submits.length === 0 && state.emails.length === 0 && !state.redirect, 'generation fails → no email, no writes, no redirect');
ok(f6.title === 'Send Quote' && /Not sent\.<\/strong> Proposal generation failed: boom/.test(pageHtml(f6)), 'page re-rendered with error panel');     // changed (was: error page)
resetState();
state.submitThrows = 'You do not have permission to set a value for element custbody_build_stage';
runPost(basePost({ custpage_upd_entitystatus: '12', custpage_upd_build_stage: '4' }));
ok(state.redirect && state.redirect.parameters.nsq === 'warn', 'field write throws → still redirected, nsq=warn');                      // changed (was: success page + warning panel)
ok(state.redirect.parameters.nsqff === 'entitystatus,build_stage' && !('nsqf' in state.redirect.parameters), 'nsqff names the fields, no nsqf');
ok(!/permission/.test(JSON.stringify(state.redirect.parameters)), 'NetSuite error text not in the URL');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'SendQuoteSL.OppUpdate' && /123/.test(l.details) && /entitystatus: 10 → 12/.test(l.details) && /permission/.test(l.details); }), 'error logged with opp ID, attempted values and message');
ok(estimateWrites().length > 0, 'forecast still runs when the field update fails (independent)');

console.log('A8. Order (full order in B7)');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12' }));
ok(state.calls.indexOf('email.send') > state.calls.indexOf('generateMasterProposal') &&
   state.calls.indexOf('record.submitFields:opportunity') > state.calls.indexOf('email.send'), 'generate → email.send → field submitFields');

console.log('A10. Sub-status never written — posted anyway');
resetState();
runPost(basePost({ custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage,sub_status',
                   custpage_upd_sub_status: '99', custpage_orig_sub_status: '1',
                   custbody_opportunity_sub_status: '99', custpage_upd_entitystatus: '12' }));
ok(oppWrites().length === 1 && Object.keys(oppWrites()[0].values).join(',') === 'entitystatus', 'only the known field written');

console.log('A11. GET, getSelectOptions throws for Build stage');
resetState();
state.selectOptionsThrow.custbody_build_stage = true;
var g11 = pageHtml(runGet());
ok(/name="custpage_upd_entitystatus"/.test(g11) && /name="custpage_upd_next_contact"/.test(g11) && /name="custpage_upd_del_date"/.test(g11), 'other three present');   // changed (was: native form fields)
ok(!/name="custpage_upd_build_stage"/.test(g11), 'Build stage absent');
ok(/name="custpage_upd_fields" value="entitystatus,next_contact,del_date"/.test(g11), 'shown-keys list excludes build_stage');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /custbody_build_stage/.test(l.details) && /getSelectOptions failed/.test(l.details); }), 'audit logged with error');
ok(/<option value="10" selected>Proposal<\/option>/.test(g11) && !/<select[^>]*custpage_upd_entitystatus[^>]*><option value=""/.test(g11), 'status options from record, current selected, no blank');
ok(/<input type="date" name="custpage_upd_next_contact"[^>]*data-orig="2026-10-01" data-orig-text="01\/10\/2026" value="2026-10-01">/.test(g11), 'next contact: date picker pre-filled yyyy-mm-dd, readable original kept');   // changed in 2.0.1 (was: text input, user format)
ok(/<input type="hidden" name="custpage_orig_del_date" value="2026-11-15"><input type="hidden" name="custpage_origtxt_del_date" value="15\/11\/2026">/.test(g11), 'hidden original yyyy-mm-dd + readable original');   // changed in 2.0.1
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /reported field types: entitystatus=select, custbody_next_contact=date/.test(l.details); }), 'reported types logged');

console.log('A11b. GET: Build stage blank option; type mismatch; status not in options');
resetState();
var g11b = pageHtml(runGet());
ok(/name="custpage_upd_build_stage"[^>]*><option value=""><\/option><option value="3" selected>Foundations/.test(g11b), 'Build stage blank first, current selected');
resetState();
state.fieldTypes.custbody_next_contact = 'datetimetz';
g11b = pageHtml(runGet());
ok(!/name="custpage_upd_next_contact"/.test(g11b), 'unexpected type → field not shown (kept as agreed)');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /custbody_next_contact reports type "datetimetz" but "date" was assumed/.test(l.details); }), 'type mismatch audit-logged');
resetState();
state.oppValues.entitystatus = '99';
ok(!/name="custpage_upd_entitystatus"/.test(pageHtml(runGet())), 'status not among options → not shown');

console.log('A12. GET, no quotes');
resetState();
state.estimates = state.estimates.filter(function (e) { return e.opp !== '123'; });
var g12 = pageHtml(runGet());
ok(!/custpage_upd_/.test(g12) && !/nsq-send/.test(g12), 'no update section, no Send button');
ok(/No quotes found/.test(g12), 'no-quotes panel');

console.log('A13. beforeLoad button');
function runUe(type, params, recOverrides) {
    var buttons = [];
    var form = {
        addButton: function (b) { buttons.push(b); }, removeButton: function () {},
        addPageInitMessage: function (m) { state.pageMessages.push(m); }
    };
    var rec = {
        id: '123',
        getText: function (o) { return { entitystatus: 'Quoted', custbody_build_stage: 'Roof on' }[o.fieldId] || ''; },
        getValue: function (o) {
            return { custbody_next_contact: new Date(2026, 9, 12), custbody_opp_del_date: new Date(2026, 11, 1),
                     expectedclosedate: new Date(2027, 0, 29),
                     custbody_master_proposal_url: 'https://acct.app.netsuite.com/core/media/media.nl?id=1&h=abc' }[o.fieldId];
        }
    };
    Object.keys(recOverrides || {}).forEach(function (k) { rec[k] = recOverrides[k]; });
    var thrown = null;
    try {
        oppUe.beforeLoad({
            type: type,
            UserEventType: { VIEW: 'view', EDIT: 'edit', CREATE: 'create' },
            newRecord: rec,
            form: form,
            request: params ? { parameters: params } : undefined
        });
    } catch (e) { thrown = e; }
    return { buttons: buttons, thrown: thrown, form: form };
}
resetState();
ok(runUe('edit').buttons.length === 0, 'EDIT → no button');
ok(runUe('view').buttons.length === 1 && runUe('view').buttons[0].id === 'custpage_send_quote', 'VIEW → button');
ok(runUe('create').buttons.length === 0, 'CREATE → no button');

// A9 (preview) → B19; A14 (success-panel escaping) → B2/B3/B15; success page removed in 2.0.0.

// ═══ B — 2.0.0 scenarios ═══════════════════════════════════════════════════════

console.log('B1. GET render');
resetState();
var f1 = runGet();
var h1 = pageHtml(f1);
ok(f1.fields.length === 1 && f1.fields[0].type === 'inlinehtml', 'one INLINEHTML body');
ok(f1.buttons.length === 0 && f1.sublists.length === 0, 'no native buttons, no sublists');
ok(f1.clientScriptModulePath === undefined, 'no clientScriptModulePath');
ok(!/clientScriptModulePath\s*=/.test(fs.readFileSync(path.join(ROOT, 'nuheat_send_quote_sl.js'), 'utf8')), 'no clientScriptModulePath assignment anywhere in the Suitelet');
ok(rowRole(h1, '901') === 'leave' && rowRole(h1, '902') === 'leave' && rowRole(h1, '903') === 'leave', 'several quotes → all start at Leave out');
ok(/<a class="nsq-back" href="\/app\/accounting\/transactions\/opprtnty\.nl\?id=123">&larr; Back to opportunity OPP123<\/a>/.test(h1), 'back link to the opportunity');
ok(/data-preview-url="\/app\/site\/hosting\/scriptlet\.nl\?script=customscript_nuheat_send_quote_sl&amp;deploy=customdeploy_nuheat_send_quote_sl&amp;action=preview&amp;opportunityId=123"/.test(h1), 'preview URL in a data- attribute (escaped)');
ok(/<input type="hidden" name="custpage_email_to" id="nsq-to" value="cust@example.com">/.test(h1), 'To defaults to the customer email');
ok(/<option value="ann@example.com">Ann Lee \(ann@example.com\)<\/option>/.test(h1), 'contact picker lists contacts');
ok(/data-qid="902" data-role="leave" data-total="4800"/.test(h1) && /data-qid="901" data-role="leave" data-total="2000"/.test(h1), 'live-total values: inc VAT less BUS grant (HP 9,500 at 0% VAT − 7,500 = 2,000)');
ok(/<strong>£4,800\.00<\/strong><span class="nsq-exvat">£4,000\.00 ex VAT<\/span>/.test(h1), 'inc-VAT price bold, ex-VAT beneath');
ok(/<a class="nsq-view" href="https:\/\/acct\.example\/q\/901" target="_blank" rel="noopener">View<\/a>/.test(h1), '"View" link replaces the URL column');
ok(/id="nsq-send" disabled/.test(h1), 'Send starts disabled (the script enables it)');
var blocks = scriptBlocks(h1);
ok(blocks.length === 1, 'exactly one <script> block');
var parsed = true;
try { new vm.Script(blocks[0]); } catch (e) { parsed = false; console.log('     ' + e.message); }
ok(parsed, 'the inline script parses');
resetState();
state.estimates = state.estimates.filter(function (e) { return e.id !== '902' && e.id !== '903'; });
ok(rowRole(pageHtml(runGet()), '901') === 'main', 'exactly one quote → starts at Main');

console.log('B2. Title with HTML');
ok(/EST901 &middot; Ground &amp; &quot;x&quot;<\/div>/.test(h1), 'rendered as "Ground &amp; &quot;x&quot;"');
ok(!/<b>Ground/.test(h1), 'no <b> tag');

console.log('B3. Hostile description / contact name');
ok(blocks[0].indexOf('alert') === -1 && blocks[0].indexOf('EST90') === -1 && blocks[0].indexOf('example.com') === -1, 'no record data inside the script block');
ok(scriptBlocks(h1).length === 1 && (h1.match(/<script/gi) || []).length === 1, 'no extra <script> in the page');
ok(!/<\/script><b>Bob/.test(h1) && /&lt;\/script&gt;&lt;b&gt;Bob X \(no email\)/.test(h1), 'contact name escaped');
var sl = fs.readFileSync(path.join(ROOT, 'nuheat_send_quote_sl.js'), 'utf8');
var escBody = /function escapeHtml\(str\) \{([\s\S]*?)\n    \}/.exec(sl)[1];
ok(['&amp;', '&lt;', '&gt;', '&quot;', '&#039;'].every(function (e) { return escBody.indexOf(e) !== -1; }), 'escapeHtml escapes & < > " \'');

console.log('B4. Tampered price in the POST body');
resetState();
runPost(basePost({ custpage_amount: '£1.00', custpage_subtotal: '£1.00', custpage_tax_total: '£0.00', amount: '1',
                   custpage_quotes_heat_pump: '901\u00021.00' }));
var g901 = (state.generated || []).filter(function (q) { return q.quoteId === '901'; })[0];
ok(g901 && g901.amount === '£9,500.00' && g901.subtotal === '£10,000.00', 'proposal uses NetSuite values, not the posted ones');

console.log('B5. Selecting a quote not on this opportunity');
resetState();
var f5 = runPost(basePost({ custpage_sel: JSON.stringify({ '901': 'main', '950': 'additional' }) }));
ok(state.calls.indexOf('generateMasterProposal') === -1 && state.submits.length === 0 && !state.redirect, 'nothing generated, written or redirected');
ok(/Not sent\.<\/strong> The selection included a quote that does not belong to this opportunity/.test(pageHtml(f5)), 'page re-rendered with an error');
resetState();
runPost(basePost({ custpage_sel: JSON.stringify({ '901': 'boss' }) }));
ok(state.calls.indexOf('generateMasterProposal') === -1, 'unknown role rejected');
resetState();
runPost(basePost({ custpage_sel: '{not json' }));
ok(state.calls.indexOf('generateMasterProposal') === -1, 'malformed JSON rejected');
resetState();
var f5b = runPost(basePost({ custpage_sel: JSON.stringify({ '902': 'additional' }) }));
ok(state.calls.indexOf('generateMasterProposal') === -1 && /No Main quote selected/.test(pageHtml(f5b)), 'server: no Main → rejected');
resetState();
var f5c = runPost(basePost({ custpage_email_cc: 'not-an-email' }));
ok(state.calls.indexOf('generateMasterProposal') === -1 && /not valid: not-an-email/.test(pageHtml(f5c)), 'server: invalid CC → rejected');

console.log('B6. Quote object shape — identical to the pre-2.0 sublist round trip');
// Captured by running Send Quote SL 1.8.0 (commit 8e73a2a) against this file's fixture — NOT
// hand-written. (Heat pump VAT is derived at 0%, hence amount £9,500.00 on EST901.) GET
// populated the hidden sublist columns, the POST read them back, and this is the object that
// reached generateMasterProposal(). Key order and value types included.
var PRE_2_0_FIXTURE = {
    '901': { quoteId: '901', tranId: 'EST901', title: '<b>Ground</b> & "x"', quoteType: 'Heat Pump', amount: '£9,500.00',
             subtotal: '£10,000.00', discountTotal: '£-500.00', taxTotal: '£0.00', busAmount: 7500, busRate: 'standard',
             vatRate: 0, vatPercent: '0%', quoteUrl: 'https://acct.example/q/901', category: 'main',
             description: 'Air source heat pump' },
    '902': { quoteId: '902', tranId: 'EST902', title: 'UFH first floor', quoteType: 'Underfloor Heating', amount: '£4,800.00',
             subtotal: '£4,000.00', discountTotal: '£0.00', taxTotal: '£800.00', busAmount: 0, busRate: 'none',
             vatRate: 0.2, vatPercent: '20%', quoteUrl: 'https://acct.example/q/902', category: 'additional',
             description: '</script><script>alert(1)</script>' }
};
resetState();
runPost(basePost());
var byId = {};
(state.generated || []).forEach(function (q) { byId[q.quoteId] = q; });
['901', '902'].forEach(function (id) {
    ok(JSON.stringify(byId[id]) === JSON.stringify(PRE_2_0_FIXTURE[id]), 'Estimate ' + id + ': same keys, order, values and types');
    ok(byId[id] && typeof byId[id].busAmount === 'number' && typeof byId[id].vatRate === 'number', 'Estimate ' + id + ': busAmount / vatRate are numbers');
});
ok((state.generated || []).length === 2 && state.generated[0].quoteId === '902' && state.generated[1].quoteId === '901', 'same order as before (UFH, Heat Pump, …)');

console.log('B7. Successful send');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12', custpage_upd_next_contact: '2026-10-12' }));
var order = state.calls.filter(function (c) { return /^(generateMasterProposal|email\.send|record\.submitFields|redirect\.toRecord)/.test(c); });
ok(order.join(' > ') === 'generateMasterProposal > email.send > record.submitFields:estimate > record.submitFields:estimate > record.submitFields:opportunity > redirect.toRecord',
   'generate → email → forecast → field update → redirect (' + order.join(' > ') + ')');   // changed in 2.0.1 (was: field update before forecast)
var rp = state.redirect.parameters;
ok(state.redirect.type === 'opportunity' && state.redirect.id === '123' && state.redirect.isEditMode === false, 'redirect to the opportunity in VIEW');
ok(Object.keys(rp).every(function (k) { return ['nsq', 'nsqt', 'nsqf', 'nsqff', 'nsqfi', 'nsqfx', 'nsqqf'].indexOf(k) !== -1; }), 'only whitelisted parameters');
ok(Object.keys(rp).every(function (k) { return /^[a-z0-9_,]*$/.test(rp[k]); }), 'codes only — no free text');
ok(rp.nsq === 'ok' && /^\d{10}$/.test(rp.nsqt) && rp.nsqf === 'entitystatus,next_contact' && rp.nsqfi === '1' && rp.nsqfx === '2', 'nsq=ok, nsqt epoch, nsqf, nsqfi=1, nsqfx=2');

console.log('B8. Email fails');
resetState();
state.emailThrows = 'SMTP down';
var f8 = runPost(basePost({ custpage_upd_entitystatus: '12', custpage_email_cc: 'boss@example.com',
                            custpage_sel: JSON.stringify({ '901': 'main', '903': 'additional' }) }));
var h8 = pageHtml(f8);
ok(state.submits.length === 0 && !state.redirect, 'no Suitelet writes, no redirect');
ok(/The email could not be sent: SMTP down/.test(h8), 'error panel');
ok(rowRole(h8, '901') === 'main' && rowRole(h8, '903') === 'additional' && rowRole(h8, '902') === 'leave', 'selections restored');
ok(/name="custpage_email_to" id="nsq-to" value="cust@example.com"/.test(h8) && /id="nsq-cc" value="boss@example.com"/.test(h8), 'addresses restored');
ok(/<option value="12" selected>Quoted<\/option>/.test(h8) && /name="custpage_orig_entitystatus" value="10"/.test(h8), 'field value restored, original kept');

console.log('B9. Forecast: Main false, Additional true, Leave-out false');
resetState();   // fixture: 901 false (Main), 902 true (Additional), 903 false (left out)
runPost(basePost());
var ew = estimateWrites();
ok(ew.length === 2, 'two writes');
ok(ew.some(function (w) { return w.id === '901' && w.values.includeinforecast === true; }) &&
   ew.some(function (w) { return w.id === '902' && w.values.includeinforecast === false; }), '901 → true, 902 → false');
ok(!ew.some(function (w) { return w.id === '903'; }), 'no write for 903');
ok(!ew.some(function (w) { return w.id === '950'; }), 'another opportunity\'s Estimate never touched');
ok(ew.every(function (w) { return w.options.enableSourcing === false && w.options.ignoreMandatoryFields === true; }), 'options');
ok(auditLogs('SendQuoteSL.Forecast').some(function (l) { return /Estimate 901 \(EST901\) false → true/.test(l.details); }), 'audit from → to');

console.log('B10. Forecast values as "T" / "F" strings');
resetState();
estimate('901').forecast = 'T'; estimate('902').forecast = 'F'; estimate('903').forecast = 'F';
runPost(basePost());
ok(estimateWrites().length === 0, 'normalised; no spurious writes');
ok(!('nsqfi' in state.redirect.parameters), 'no forecast counts when nothing changed');

console.log('B11. One Estimate write throws');
resetState();
state.estimateSubmitThrows['901'] = 'Record locked';
runPost(basePost());
ok(estimateWrites().some(function (w) { return w.id === '902'; }), 'the others still written');
ok(state.redirect.parameters.nsqqf === '901' && state.redirect.parameters.nsq === 'warn', 'nsqqf=901, nsq=warn');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'SendQuoteSL.Forecast' && /Record locked/.test(l.details); }), 'failure logged with message');

console.log('B12. includeinforecast absent / not a checkbox');
['absent', 'text'].forEach(function (t) {
    resetState();
    state.forecastFieldType = t;
    runPost(basePost());
    ok(estimateWrites().length === 0, t + ': no forecast writes');
    ok(auditLogs('SendQuoteSL.Forecast').some(function (l) { return /no forecast writes/.test(l.details); }), t + ': audit logged');
    ok(state.redirect.parameters.nsq === 'ok' && !('nsqqf' in state.redirect.parameters), t + ': nsq unaffected');
});

console.log('B13. Probability sourcing');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12' }));
ok(oppWrites()[0].options.enableSourcing === true, 'Status changed → enableSourcing true');
resetState();
runPost(basePost({ custpage_upd_build_stage: '4' }));
ok(oppWrites()[0].options.enableSourcing === false, 'Status unchanged → enableSourcing false');

var NOW = Math.floor(Date.now() / 1000);

console.log('B14. UE banner, valid');
resetState();
var u14 = runUe('view', { nsq: 'ok', nsqt: String(NOW - 5), nsqf: 'entitystatus,next_contact', nsqfi: '1', nsqfx: '2' });
var m14 = state.pageMessages[0];
ok(m14 && m14.type === 'confirmation' && m14.title === 'Proposal sent', 'CONFIRMATION, "Proposal sent"');
ok(m14 && m14.message.indexOf('Opportunity updated: Status → Quoted · Next contact → 12/10/2026') === 0, 'values read from the record');
ok(m14 && /Forecast: 1 quote included, 2 excluded/.test(m14.message), 'forecast line');
ok(m14 && /<a href="https:\/\/acct\.app\.netsuite\.com\/core\/media\/media\.nl\?id=1&amp;h=abc" target="_blank" rel="noopener">View proposal<\/a>/.test(m14.message), 'View proposal link from the record');
ok(u14.buttons.length === 1, 'button still added');
resetState();
runUe('view', { nsq: 'warn', nsqt: String(NOW), nsqff: 'build_stage', nsqqf: '902' });
var w14 = state.pageMessages[0];
ok(w14 && w14.type === 'warning' && /wasn’t fully updated/.test(w14.title), 'WARNING title');
ok(w14 && /Please set Build stage on this record\./.test(w14.message) && /Forecast flag not updated on EST902\./.test(w14.message), 'warning names the field and the quote');

console.log('B15. UE banner, hostile or stale parameters');
[
    ['stale', { nsq: 'ok', nsqt: String(NOW - 301), nsqf: 'entitystatus' }],
    ['missing nsqt', { nsq: 'ok', nsqf: 'entitystatus' }],
    ['garbage nsqt', { nsq: 'ok', nsqt: 'abc', nsqf: 'entitystatus' }],
    ['unknown nsq', { nsq: 'yes', nsqt: String(NOW), nsqf: 'entitystatus' }]
].forEach(function (c) {
    resetState();
    runUe('view', c[1]);
    ok(state.pageMessages.length === 0, c[0] + ' → no banner');
});
resetState();
runUe('view', { nsq: 'ok', nsqt: String(NOW), nsqf: 'entitystatus,<script>alert(1)</script>,foo', nsqfi: '<b>', nsqfx: '2' });
var m15 = state.pageMessages[0];
ok(m15 && /Status → Quoted/.test(m15.message) && !/script|foo|alert|<b>/i.test(m15.message), 'unknown keys dropped, never echoed');
ok(m15 && !/Forecast/.test(m15.message), 'non-numeric count → no forecast line');
resetState();
runUe('edit', { nsq: 'ok', nsqt: String(NOW), nsqf: 'entitystatus' });
ok(state.pageMessages.length === 0, 'EDIT → no banner');

console.log('B16. UE banner, failed quote from another opportunity');
resetState();
runUe('view', { nsq: 'warn', nsqt: String(NOW), nsqqf: '950,902,abc' });
var m16 = state.pageMessages[0];
ok(m16 && /Forecast flag not updated on EST902\.<br>/.test(m16.message) && !/EST950/.test(m16.message), 'other opportunity\'s Estimate and non-numeric IDs dropped (only EST902 named)');

console.log('B17. UE throws internally');
resetState();
var u17 = runUe('view', { nsq: 'ok', nsqt: String(NOW), nsqf: 'entitystatus' },
    { getText: function () { throw new Error('boom'); }, getValue: function () { throw new Error('boom'); } });
ok(!u17.thrown && u17.buttons.length === 1, 'record getters throw → no exception, button added');
resetState();
var u17b = runUe('view', { nsq: 'ok', nsqt: String(NOW), nsqf: 'entitystatus' });
u17b.form.addPageInitMessage = function () { throw new Error('no message API'); };
var thrown17 = null;
try {
    oppUe.beforeLoad({ type: 'view', UserEventType: { VIEW: 'view' }, newRecord: { id: '123', getText: function () { return ''; }, getValue: function () { return ''; } },
        form: u17b.form, request: { parameters: { nsq: 'ok', nsqt: String(NOW) } } });
} catch (e) { thrown17 = e; }
ok(!thrown17 && state.logs.some(function (l) { return l.level === 'error' && l.title === 'OpportunityUE.banner'; }), 'addPageInitMessage throws → caught and logged');

console.log('B18. Sub-status never written in any path');
ok(ALL_WRITES.length > 20, 'writes recorded across all scenarios (' + ALL_WRITES.length + ')');
ok(ALL_WRITES.every(function (w) { return !('custbody_opportunity_sub_status' in w.values); }), 'custbody_opportunity_sub_status never in any write');

console.log('B19. Preview');
resetState();
var pctx = {
    request: { method: 'GET', parameters: { action: 'preview', opportunityId: '123',
        sel: JSON.stringify({ '901': 'main', '902': 'additional' }),
        quotes: JSON.stringify([{ quoteId: '901', amount: '£1.00' }]) } },
    response: makeResponse()
};
suitelet.onRequest(pctx);
ok(state.previewed && state.previewed.length === 2 && state.previewed[1].amount === '£9,500.00', 'rebuilt from the search; posted "quotes" ignored');
ok(state.submits.length === 0 && state.calls.indexOf('email.send') === -1, 'no writes, no email');
ok(state.calls.filter(function (c) { return c === 'record.load:estimate'; }).length === 3, 'governance: one Estimate load per quote on the opportunity');
resetState();
pctx.request.parameters.sel = JSON.stringify({ '950': 'main' });
pctx.response = makeResponse();
suitelet.onRequest(pctx);
ok(/Preview Error/.test(pctx.response.written) && !state.previewed, 'foreign quote in preview → error, nothing generated');
var ps = scriptBlocks(h1)[0];
ok(/"sel=" \+ encodeURIComponent\(JSON\.stringify\(sel\)\)/.test(ps) && !/amount|total\b.*sel/.test(ps.split('nsq-preview')[1] || ''), 'page script sends only the selection to preview');

// ═══ C — 2.0.1 ═════════════════════════════════════════════════════════════════

console.log('C1. The Opportunity write is the last record write before the redirect');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12' }));
var writes = state.calls.filter(function (c) { return /^(record\.submitFields|redirect\.toRecord)/.test(c); });
ok(writes.length === 4 && writes[writes.length - 1] === 'redirect.toRecord' && writes[writes.length - 2] === 'record.submitFields:opportunity',
   'last write before redirect is the Opportunity (' + writes.join(' > ') + ')');
ok(writes.slice(0, -2).every(function (c) { return c === 'record.submitFields:estimate'; }), 'every Estimate (forecast) write comes before it');
var sl201 = fs.readFileSync(path.join(ROOT, 'nuheat_send_quote_sl.js'), 'utf8');
ok(/Forecast first: an Estimate save can re-sync its Status onto the opportunity\.\s*\n\s*\/\/ The opportunity update must be last\.\s*\n\s*var forecast  = updateForecastFlags\([^)]*\);\s*\n\s*var oppUpdate = updateOpportunityFields\(/.test(sl201),
   'order and reason commented at the calls');

console.log('C2. Dates round-trip with no day shift, in any server time zone');
var ORIGINAL_TZ = process.env.TZ;
[['America/Los_Angeles'], ['Pacific/Auckland'], ['UTC']].forEach(function (tz) {
    process.env.TZ = tz[0];
    [[2026, 9, 1, '2026-10-01', '01/10/2026'], [2026, 11, 31, '2026-12-31', '31/12/2026'], [2028, 1, 29, '2028-02-29', '29/02/2028']].forEach(function (c) {
        resetState();
        state.oppValues.custbody_next_contact = new Date(c[0], c[1], c[2]);
        var h = pageHtml(runGet());
        var shown = new RegExp('name="custpage_upd_next_contact"[^>]*data-orig="' + c[3] + '" data-orig-text="' + c[4].replace(/\//g, '\\/') + '" value="' + c[3] + '"').test(h);
        resetState();
        runPost(basePost({ custpage_upd_next_contact: c[3], custpage_orig_next_contact: '2000-01-01' }));
        var d = oppWrites()[0] && oppWrites()[0].values.custbody_next_contact;
        ok(shown && d instanceof Date && d.getFullYear() === c[0] && d.getMonth() === c[1] && d.getDate() === c[2],
           tz[0] + ' ' + c[4] + ': pre-filled ' + c[3] + ', written back as the same calendar date');
    });
});
process.env.TZ = 'Pacific/Auckland';
ok(new Date(2026, 9, 1).toISOString().slice(0, 10) === '2026-09-30', '(control: toISOString() would have shifted 01/10/2026 back a day in Auckland)');
if (ORIGINAL_TZ === undefined) { delete process.env.TZ; } else { process.env.TZ = ORIGINAL_TZ; }

console.log('C3. Invalid dates are rejected');
['2026-02-30', 'abc', '01/10/2026', '2026-13-01', '2026-1-5'].forEach(function (bad) {
    resetState();
    runPost(basePost({ custpage_upd_del_date: bad }));
    ok(oppWrites().length === 0, '"' + bad + '" not written');
    ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return l.details.indexOf('"' + bad + '" is not a yyyy-mm-dd calendar date') !== -1; }), '"' + bad + '" audit-logged');
});
resetState();
runPost(basePost({ custpage_upd_del_date: '2026-02-30', custpage_upd_build_stage: '4' }));
ok(oppWrites().length === 1 && Object.keys(oppWrites()[0].values).join(',') === 'custbody_build_stage', 'a bad date does not block the other changes');

console.log('C4. Unchanged date is not written');
resetState();
runPost(basePost({ custpage_upd_next_contact: '2026-10-01', custpage_upd_del_date: '2026-11-15' }));
ok(oppWrites().length === 0, 'same yyyy-mm-dd as the original → no write');

console.log('C5. Blank date is not written');
resetState();
runPost(basePost({ custpage_upd_next_contact: '', custpage_upd_del_date: '' }));
ok(oppWrites().length === 0, 'blank → no write (never clears)');
ok(!/function parseDateValue|format\.parse\(/.test(sl201), 'the user-format format.parse path is gone');

// ═══ D — 2.0.2: Expected close date ════════════════════════════════════════════

/** Turns on the standard Opportunity field expectedclosedate (20/12/2026) for one scenario. */
function withCloseDate() {
    state.fieldTypes.expectedclosedate = 'date';
    state.oppValues.expectedclosedate = new Date(2026, 11, 20);
}
/** POST as the five-field page submits it. */
function closePost(overrides) {
    var p = basePost({
        custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage,close_date',
        custpage_upd_close_date: '2026-12-20', custpage_orig_close_date: '2026-12-20', custpage_origtxt_close_date: '20/12/2026'
    });
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });
    return p;
}

console.log('D1. GET: fifth field, display order, picker');
resetState();
withCloseDate();
var hD = pageHtml(runGet());
ok(/<input type="date" name="custpage_upd_close_date" id="custpage_upd_close_date" class="nsq-input nsq-upd" data-key="close_date" data-label="Expected close" data-orig="2026-12-20" data-orig-text="20\/12\/2026" value="2026-12-20">/.test(hD),
   'Expected close: date picker pre-filled 2026-12-20, readable original 20/12/2026');
var orderD = [];
hD.replace(/name="custpage_upd_([a-z_]+)" id=/g, function (m, k) { orderD.push(k); });
ok(orderD.join(',') === 'entitystatus,build_stage,close_date,next_contact,del_date', 'display order: Status, Build stage, Expected close, Next contact, Est. delivery date (' + orderD.join(',') + ')');
ok(/name="custpage_upd_fields" value="entitystatus,next_contact,del_date,build_stage,close_date"/.test(hD), 'shown-keys list includes close_date');
ok(/\.nsq-upd-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(200px,1fr\)\)/.test(hD), 'grid columns at least 200 px, wrapping');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /expectedclosedate=date/.test(l.details); }), 'reported type logged');
resetState();
withCloseDate();
state.fieldTypes.expectedclosedate = 'datetimetz';
ok(!/custpage_upd_close_date/.test(pageHtml(runGet())) &&
   auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /expectedclosedate reports type "datetimetz" but "date" was assumed/.test(l.details); }),
   'not a date → hidden and audit-logged');

console.log('D2. Round trip with no day shift, in any server time zone');
var TZ_BEFORE = process.env.TZ;
['America/Los_Angeles', 'Pacific/Auckland', 'UTC'].forEach(function (tz) {
    process.env.TZ = tz;
    [[2026, 9, 1, '2026-10-01'], [2026, 11, 31, '2026-12-31'], [2028, 1, 29, '2028-02-29']].forEach(function (c) {
        resetState();
        withCloseDate();
        state.oppValues.expectedclosedate = new Date(c[0], c[1], c[2]);
        var shown = new RegExp('name="custpage_upd_close_date"[^>]*data-orig="' + c[3] + '"[^>]*value="' + c[3] + '"').test(pageHtml(runGet()));
        resetState();
        runPost(closePost({ custpage_upd_close_date: c[3], custpage_orig_close_date: '2000-01-01' }));
        var d = oppWrites()[0] && oppWrites()[0].values.expectedclosedate;
        ok(shown && d instanceof Date && d.getFullYear() === c[0] && d.getMonth() === c[1] && d.getDate() === c[2],
           tz + ' ' + c[3] + ': pre-filled and written back as the same calendar date');
    });
});
if (TZ_BEFORE === undefined) { delete process.env.TZ; } else { process.env.TZ = TZ_BEFORE; }

console.log('D3. Bad input rejected; unchanged and blank not written');
['2026-02-30', 'abc', '20/12/2026'].forEach(function (bad) {
    resetState();
    runPost(closePost({ custpage_upd_close_date: bad }));
    ok(oppWrites().length === 0 && auditLogs('SendQuoteSL.OppUpdate').some(function (l) {
        return l.details.indexOf('expectedclosedate value "' + bad + '" is not a yyyy-mm-dd calendar date') !== -1;
    }), '"' + bad + '" not written, audit-logged');
});
resetState();
runPost(closePost());
ok(oppWrites().length === 0, 'unchanged → no write');
resetState();
runPost(closePost({ custpage_upd_close_date: '' }));
ok(oppWrites().length === 0, 'blank → no write (never clears)');

console.log('D4. Same single submitFields, still the last write');
resetState();
runPost(closePost({ custpage_upd_entitystatus: '12', custpage_upd_next_contact: '2026-10-12', custpage_upd_close_date: '2027-01-29' }));
ok(oppWrites().length === 1, 'one Opportunity submitFields');
var vD = oppWrites()[0].values;
ok(Object.keys(vD).sort().join(',') === 'custbody_next_contact,entitystatus,expectedclosedate' &&
   vD.expectedclosedate instanceof Date && vD.expectedclosedate.getMonth() === 0 && vD.expectedclosedate.getDate() === 29,
   'expectedclosedate written alongside the other changes, as a Date');
var wD = state.calls.filter(function (c) { return /^(record\.submitFields|redirect\.toRecord)/.test(c); });
ok(wD[wD.length - 1] === 'redirect.toRecord' && wD[wD.length - 2] === 'record.submitFields:opportunity' &&
   wD.slice(0, -2).every(function (c) { return c === 'record.submitFields:estimate'; }), 'Opportunity write is still last (' + wD.join(' > ') + ')');
ok(state.redirect.parameters.nsqf === 'entitystatus,next_contact,close_date', 'redirect nsqf includes close_date');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /expectedclosedate: 2026-12-20 → 2027-01-29/.test(l.details); }), 'audit old → new');

console.log('D5. Page script covers the new field (static check; browser check in the PR)');
ok(/data-key="close_date"[^>]*class|class="nsq-input nsq-upd" data-key="close_date"/.test(hD), 'carries the .nsq-upd class the script uses for markers and summary');

console.log('D6. UE banner');
resetState();
runUe('view', { nsq: 'ok', nsqt: String(Math.floor(Date.now() / 1000)), nsqf: 'close_date,nonsense' });
var mD = state.pageMessages[0];
ok(mD && mD.message.indexOf('Opportunity updated: Expected close → 29/01/2027') === 0, '"Expected close → 29/01/2027" read from the record');
ok(mD && !/nonsense/.test(mD.message), 'unknown key still dropped');
resetState();
runUe('view', { nsq: 'warn', nsqt: String(Math.floor(Date.now() / 1000)), nsqff: 'close_date' });
ok(state.pageMessages[0] && /Please set Expected close on this record\./.test(state.pageMessages[0].message), 'failed close_date named in the warning');

console.log('D7. Sub-status still never written');
ok(ALL_WRITES.every(function (w) { return !('custbody_opportunity_sub_status' in w.values); }), 'no write ever carries custbody_opportunity_sub_status (' + ALL_WRITES.length + ' writes)');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
