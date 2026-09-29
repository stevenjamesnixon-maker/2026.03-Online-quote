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
 *            E — 2.0.3: quote card text (E1–E8)
 *            … F, G (2.0.4, 2.1.0), M — 2.1.1 email (M1–M4)
 *            N — 2.2.0: proposal email redesign (N1–N9)
 *            S — 2.2.1 / 2.3.0: send speed and forecast tags (S1–S7)
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
        employee: {},                // search.lookupFields on the sales rep (2.2.0)
        employeeThrows: null,
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
                 custbody_test_new_quote: e.url, datecreated: e.created || '28/09/2026 2:32 pm', custbody_quote_description: e.desc };
    return {
        getValue: function (o) { return vals[typeof o === 'string' ? o : o.name] || ''; },
        getText: function (o) { return (typeof o === 'string' ? o : o.name) === 'custbody_quote_type' ? e.type : ''; }
    };
}

var searchStub = {
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', EMPLOYEE: 'employee' },
    Sort: { DESC: 'DESC', ASC: 'ASC' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        state.calls.push('search.lookupFields:' + o.type);
        if (o.type === 'customer') return { email: 'cust@example.com' };
        if (o.type === 'employee') {
            state.employeeLookups = (state.employeeLookups || []).concat([o]);
            if (state.employeeThrows) throw new Error(state.employeeThrows);
            return state.employee;
        }
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
        return state.oppData || { tranId: 'OPP123', title: 'Test Opp', quoteEmailRef: 'Ref', customerId: '55',
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
modules['./nuheat_opp_update_lib'] = loadModule('nuheat_opp_update_lib.js', modules);

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
var vb = runUe('view').buttons;
ok(vb.length === 2 && vb[0].id === 'custpage_send_quote' && vb[0].label === 'Send Quote' && vb[0].functionName === 'openSendQuoteSuitelet' && vb[1].id === 'custpage_update_opp' && vb[1].label === 'Update opportunity' && vb[1].functionName === 'openUpdateOppSuitelet', 'VIEW → two buttons, in order: Send Quote, Update opportunity');   // D6 exception (UE 1.3.0)
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
// changed in 2.0.3: the card shows tranid · description, not the title (E1–E5 cover the title fallback)
ok(/>EST901 · Air source heat pump<\/div>/.test(h1), 'card line 1 is tranid · description');
ok(!/<b>Ground/.test(h1) && !/Ground &amp; &quot;x&quot;/.test(h1), 'title (with its <b>) not rendered when a description exists');

console.log('B3. Hostile description / contact name');
ok(blocks[0].indexOf('alert') === -1 && blocks[0].indexOf('EST90') === -1 && blocks[0].indexOf('example.com') === -1, 'no record data inside the script block');
ok(scriptBlocks(h1).length === 1 && (h1.match(/<script/gi) || []).length === 1, 'no extra <script> in the page');
ok(!/<\/script><b>Bob/.test(h1) && /&lt;\/script&gt;&lt;b&gt;Bob X \(no email\)/.test(h1), 'contact name escaped');
var sl = fs.readFileSync(path.join(ROOT, 'nuheat_opp_update_lib.js'), 'utf8');
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
ok(u14.buttons.length === 2 && u14.buttons[0].id === 'custpage_send_quote' && u14.buttons[0].label === 'Send Quote' && u14.buttons[0].functionName === 'openSendQuoteSuitelet' && u14.buttons[1].id === 'custpage_update_opp' && u14.buttons[1].label === 'Update opportunity' && u14.buttons[1].functionName === 'openUpdateOppSuitelet', 'both buttons still added, in order');   // D6 exception (UE 1.3.0)
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
ok(!u17.thrown && u17.buttons.length === 2 && u17.buttons[0].id === 'custpage_send_quote' && u17.buttons[0].label === 'Send Quote' && u17.buttons[0].functionName === 'openSendQuoteSuitelet' && u17.buttons[1].id === 'custpage_update_opp' && u17.buttons[1].label === 'Update opportunity' && u17.buttons[1].functionName === 'openUpdateOppSuitelet', 'record getters throw → no exception, both buttons added');   // D6 exception (UE 1.3.0)
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

// ═══ E — 2.0.3: quote card text ════════════════════════════════════════════════

function card(html, id) {
    var i = html.indexOf('data-qid="' + id + '"');
    if (i === -1) return '';
    var j = html.indexOf('<div class="nsq-row', i);
    return html.substring(html.lastIndexOf('<div class="nsq-row', i), j === -1 ? html.indexOf('</section>', i) : j);
}
function cardLines(c) {
    var t = /<div class="nsq-q-title" title="([^"]*)">([^<]*)<\/div>/.exec(c);
    var d = /<div class="nsq-q-desc" title="([^"]*)">([^<]*)<\/div>/.exec(c);
    return { line1: t ? t[2] : null, line1Title: t ? t[1] : null, line2: d ? d[2] : null };
}
function addEstimate(fields) {
    var e = { id: '904', opp: '123', tranid: 'UFH305732', title: '', type: 'Full System (DFD)', subtotal: 5000, discount: 0,
              tax: 1000, total: 6000, items: [], url: 'https://acct.example/q/904', desc: '', forecast: false };
    Object.keys(fields).forEach(function (k) { e[k] = fields[k]; });
    state.estimates.push(e);
}

console.log('E1. Entity-encoded title with a description present');
resetState();
addEstimate({ title: 'Underfloor heating using a Boiler &lt;b&gt;Ground Floor&lt;/b&gt;: SC14', desc: 'Ground Floor: SC14 - Sand cement screed. 14mm Cliptrack' });
var c1 = cardLines(card(pageHtml(runGet()), '904'));
ok(c1.line1 === 'UFH305732 · Ground Floor: SC14 - Sand cement screed. 14mm Cliptrack', 'line 1 is tranid · description (' + c1.line1 + ')');
ok(card(pageHtml(runGet()), '904').indexOf('Underfloor heating using a Boiler') === -1, 'the title is not rendered');

console.log('E2. Encoded tags and real tags in the description');
resetState();
addEstimate({ desc: '&lt;b&gt;Ground&lt;/b&gt; and a real <i>x</i> &amp; more &#39;q&#39; &#x41;&nbsp;B' });
var c2h = card(pageHtml(runGet()), '904');
var c2 = cardLines(c2h);
ok(c2.line1 === "UFH305732 · Ground and a real x &amp; more &#039;q&#039; A B", 'decoded, stripped, escaped once (' + c2.line1 + ')');
ok(!/&amp;lt;|&amp;amp;|&lt;b|<b>|<i>/.test(c2h), 'no tags, no visible entities, no double encoding');

console.log('E3. Encoded <script> in the description');
resetState();
addEstimate({ desc: '&lt;script&gt;alert(1)&lt;/script&gt;' });
var c3h = card(pageHtml(runGet()), '904');
ok(cardLines(c3h).line1 === 'UFH305732 · alert(1)', 'rendered as the text alert(1)');
ok(!/<script/i.test(c3h) && !/&lt;script/i.test(c3h), 'no <script anywhere in the card');

console.log('E4. Empty description → cleaned title');
resetState();
addEstimate({ title: 'Boiler &lt;b&gt;Ground Floor&lt;/b&gt;  <i>SC14</i>' });
ok(cardLines(card(pageHtml(runGet()), '904')).line1 === 'UFH305732 · Boiler Ground Floor SC14', 'falls back to the cleaned title');

console.log('E5. Empty description and title → tranid alone');
resetState();
addEstimate({});
ok(cardLines(card(pageHtml(runGet()), '904')).line1 === 'UFH305732', 'tranid alone (the "(Untitled)" placeholder is not shown)');

console.log('E6. BUS fact');
resetState();
var h6 = pageHtml(runGet());
ok(/BUS grant £7,500 applied/.test(cardLines(card(h6, '901')).line2), 'busAmount 7500 → "BUS grant £7,500 applied"');
ok(!/BUS grant/.test(cardLines(card(h6, '902')).line2 || ''), 'busAmount 0 → absent');

console.log('E7. Line 2 facts');
ok(cardLines(card(h6, '901')).line2 === 'Created 28/09/2026 · Heat Pump (ASHP) · BUS grant £7,500 applied', 'Created <date> · type · BUS (' + cardLines(card(h6, '901')).line2 + ')');
ok(cardLines(card(h6, '902')).line2 === 'Created 28/09/2026 · Heat Emitter', 'without BUS');
resetState();
addEstimate({ desc: 'x', created: '28 September, 2026 14:32' });
ok(/^Created 28 September, 2026 · /.test(cardLines(card(pageHtml(runGet()), '904')).line2), 'a date format with spaces keeps its date, loses the time');
ok(/\.nsq-q-title\{[^}]*-webkit-line-clamp:2/.test(h6) && /\.nsq-q-desc\{[^}]*white-space:nowrap/.test(h6), 'line 1 clamps at two lines; line 2 one line');
ok(cardLines(card(h6, '901')).line1Title === cardLines(card(h6, '901')).line1, 'full line 1 in the title attribute (hover)');

console.log('E8. Proposal quote objects unchanged');
resetState();
runPost(basePost());
var gE = {};
(state.generated || []).forEach(function (q) { gE[q.quoteId] = q; });
ok(JSON.stringify(gE['901']) === JSON.stringify(PRE_2_0_FIXTURE['901']) && JSON.stringify(gE['902']) === JSON.stringify(PRE_2_0_FIXTURE['902']),
   'identical to the 1.8.0 fixture (B6 itself untouched)');
ok((state.generated || []).every(function (q) { return !('titleRaw' in q) && !('dateCreatedRaw' in q); }), 'page-only card fields never reach the proposal');

// ═══ F — 2.0.4: header title decode ════════════════════════════════════════════

console.log('F1. Entity-encoded opportunity title in the header');
resetState();
state.oppValues.title = 'Barn &lt;b&gt;conversion&lt;/b&gt; &amp; <i>annex</i> &lt;script&gt;x&lt;/script&gt;';
var hF = pageHtml(runGet());
var metaF = /<div class="nsq-meta">([\s\S]*?)<\/div>/.exec(hF);
ok(metaF && metaF[1].indexOf('<span>Barn conversion &amp; annex x</span>') === 0, 'decoded, stripped, escaped once (' + (metaF && metaF[1].substring(0, 60)) + ')');
ok(metaF && !/&amp;lt;|&lt;b|<i>|<script/i.test(metaF[1]), 'no visible entities, tags or double encoding');

// ═══ G — 2.1.0: extraction proof — Send Quote renders byte-identical to 2.0.4 ═══

var crypto = require('crypto');
/** Every byte of what the Suitelet hands NetSuite: form title, fields (id, type, label, HTML), buttons, sublists. */
function formSnapshot(form) {
    if (!form) return 'NO FORM';
    return JSON.stringify({
        title: form.title,
        fields: form.fields.map(function (f) { return [f.id, f.type, f.label, f.defaultValue === undefined ? null : f.defaultValue, f.displayType]; }),
        buttons: form.buttons, sublists: form.sublists.length, groups: form.groups, cs: form.clientScriptModulePath === undefined ? null : form.clientScriptModulePath
    });
}
function sha(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
var SNAPSHOT_CASES = [
    ['GET, three quotes', function () { return runGet(); }],
    ['GET, five fields incl. Expected close', function () { state.fieldTypes.expectedclosedate = 'date'; state.oppValues.expectedclosedate = new Date(2026, 11, 20); return runGet(); }],
    ['GET, one quote (starts at Main)', function () { state.estimates = state.estimates.filter(function (e) { return e.id === '901'; }); return runGet(); }],
    ['GET, no quotes', function () { state.estimates = state.estimates.filter(function (e) { return e.opp !== '123'; }); return runGet(); }],
    ['GET, Build stage options fail; encoded titles', function () { state.selectOptionsThrow.custbody_build_stage = true; state.oppValues.title = 'A &lt;b&gt;B&lt;/b&gt;'; estimate('902').desc = '&lt;i&gt;x&lt;/i&gt;'; return runGet(); }],
    ['POST, foreign quote → re-render', function () { return runPost(basePost({ custpage_sel: JSON.stringify({ '901': 'main', '950': 'additional' }) })); }],
    ['POST, email fails → re-render with entries restored', function () { state.emailThrows = 'SMTP down'; return runPost(basePost({ custpage_upd_entitystatus: '12', custpage_upd_next_contact: '2026-10-12', custpage_email_cc: 'boss@example.com' })); }],
    ['GET, no opportunityId → error page', function () { return runGet({}); }]
];

// SHA-256 of formSnapshot() per case, captured from Send Quote SL 2.0.4 (commit 6203f9b) before the
// library was extracted. Covers the whole page: CSS, header, sections, footer and the inline script.
var SEND_QUOTE_2_0_4_SNAPSHOTS = {
    "GET, three quotes": "0ec7efa9037822f8f2cfe1b303ad784d0a4635a0ee9c3da044eb6aac55d0dab2",
    "GET, five fields incl. Expected close": "e4df4210d8aafe792a1b9408cf93268a852276c1646829d2e5eca4fdf45a76a6",
    "GET, one quote (starts at Main)": "aedab3aff9641128451e1af81ce17934d178ab21b20b7711fe36a9a8567785ed",
    "GET, no quotes": "a4619c34ea410956a46422742224de704ea435789a3eb499482cdcba91eb799f",
    "GET, Build stage options fail; encoded titles": "dd48e87918b0b3f3a27b6615b763e36d682d5da4dba8ad32d04f3e77f602cec1",
    "POST, foreign quote → re-render": "5b4ee06480d17af93ee242d472f3e6e4f2cf3e0bbaad44bb26d41ca0d8b22c38",
    "POST, email fails → re-render with entries restored": "7bdffa2b03e8c5849af23f63dd8b2d24c2eaa926488a03a09f909dcd21d9e349",
    "GET, no opportunityId → error page": "e2851f0338541bb237685cf2adb5d341d6f8694c3d18f8db024b907af50417b8"
};

console.log('G1. Send Quote renders byte-identical HTML to 2.0.4 after the extraction');
SNAPSHOT_CASES.forEach(function (c) {
    resetState();
    var got = sha(formSnapshot(c[1]()));
    ok(got === SEND_QUOTE_2_0_4_SNAPSHOTS[c[0]], c[0] + ': identical to 2.0.4' + (got === SEND_QUOTE_2_0_4_SNAPSHOTS[c[0]] ? '' : ' (got ' + got.substring(0, 16) + ')'));
});

// ═══ M — 2.1.1: proposal email — duplicated contact buttons, left drift ═════════

/** The email body exactly as email.send() received it, for a normal send. */
function renderEmail() {
    resetState();
    runPost(basePost());
    return state.emails[0] ? String(state.emails[0].body) : '';
}
var MSO_BLOCK = /<!--\[if (?:gte )?mso[^\]]*\]>([\s\S]*?)<!\[endif\]-->/g;          // [if mso], [if gte mso 9]
var NOT_MSO_BLOCK = /<!--\[if !mso\]><!-- -->([\s\S]*?)<!--<!\[endif\]-->/g;
/** What a non-Outlook viewer that strips inline styles (NetSuite's message view, some webmail) shows. */
function nonOutlookStripped(h) {
    return h.replace(MSO_BLOCK, '').replace(/\sstyle="[^"]*"/g, '').replace(/<!--[\s\S]*?-->/g, '');
}
/** What Outlook shows: [if mso] content unwrapped, [if !mso] content removed. */
function outlookView(h) {
    return h.replace(NOT_MSO_BLOCK, '').replace(MSO_BLOCK, '$1').replace(/<!--[\s\S]*?-->/g, '');
}
function count(h, text) { return h.split(text).length - 1; }
var BUTTONS = ['CALL AM', 'EMAIL AM', 'VIEW YOUR QUOTE'];   // changed in 2.2.0 (was: CLICK TO CALL, SEND AN EMAIL, VIEW YOUR QUOTE(S) HERE)
var emailHtml = renderEmail();

console.log('M1. Non-Outlook view with every inline style stripped: each button once');
ok(emailHtml.length > 10000, 'email rendered (' + emailHtml.length + ' chars)');
var m1 = nonOutlookStripped(emailHtml);
BUTTONS.forEach(function (b) { ok(count(m1, b) === 1, '"' + b + '" appears exactly once (' + count(m1, b) + ')'); });

console.log('M2. Outlook view: each button once');
var m2 = outlookView(emailHtml);
BUTTONS.forEach(function (b) { ok(count(m2, b) === 1, '"' + b + '" appears exactly once (' + count(m2, b) + ')'); });

console.log('M3. No display:none / mso-hide wrapper element remains');
var wrappers = emailHtml.match(/<[a-z]+[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/gi) || [];
ok(!wrappers.some(function (w) { return /mso-hide/i.test(w); }), 'no element with display:none + mso-hide');
ok(wrappers.length === 1 && /^<span style="display:none;font-size:0px/.test(wrappers[0]) && emailHtml.indexOf('Here\'s your Nu-Heat quote.</span>') !== -1,
   'the only display:none element is the preheader span (' + wrappers.length + ')');

console.log('M4. The main container carries an attribute width');   // changed in 2.2.0 (was: both main containers)
var containers = emailHtml.match(/<table [^>]*class="width600 main-container"[^>]*>/g) || [];
ok(containers.length === 1, 'one main-container table');   // changed in 2.2.0 (was: two)
ok(containers.every(function (c) { return / width="600"/.test(c) && /style="[^"]*max-width:600px/.test(c); }),
   'each has width="600" and max-width:600px in its style (' + containers.map(function (c) { return (/ width="([^"]*)"/.exec(c) || [])[1]; }).join(', ') + ')');

// 2.2.0: the sample writer moved to section N (docs/samples/send-quote-email-2.2.0*.html);
// send-quote-email-2.1.1.html is kept as the record of the old design.

// ═══ N — 2.2.0: proposal email redesign ════════════════════════════════════════

/** Every <style> block and style attribute removed, [if mso] blocks dropped: the most hostile viewer. */
function fullyStripped(h) {
    return h.replace(MSO_BLOCK, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/\sstyle="[^"]*"/g, '').replace(/<!--[\s\S]*?-->/g, '');
}
/** Visible text of the <body> for a non-Outlook client: tags stripped, entities decoded, spaces collapsed. */
function textOf(h) {
    var body = (/<body[^>]*>([\s\S]*)<\/body>/.exec(h) || [, h])[1];
    return body.replace(MSO_BLOCK, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?(a|b|font|span)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
/** Send once with the given Opportunity data / employee lookup; returns the email body. */
function sendWith(opts) {
    resetState();
    if (opts.oppData) state.oppData = opts.oppData;
    if (opts.employee) state.employee = opts.employee;
    if (opts.employeeThrows) state.employeeThrows = opts.employeeThrows;
    runPost(basePost());
    return state.emails[0] ? String(state.emails[0].body) : '';
}
function oppDataWith(rep, extra) {
    var d = { tranId: 'OPP123', title: 'Test Opp', quoteEmailRef: 'Ref', customerId: '55',
              salesRep: { id: '7', name: 'AM', email: 'am@example.com', phone: '0123' } };
    Object.keys(rep || {}).forEach(function (k) { d.salesRep[k] = rep[k]; });
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    return d;
}
var PHOTO = 'https://1234567.app.netsuite.com/core/media/media.nl?id=5&c=1234567&h=ab';
function photoImgs(h) { return h.match(/<img [^>]*width="96"[^>]*>/g) || []; }
function imgCount(h) { return (h.match(/<img\b/g) || []).length; }

console.log('N1. Fully stripped view: one of each button, no floats, every td centred, container 600');
var n1 = fullyStripped(emailHtml);
ok(!/<style/i.test(n1) && !/\sstyle=/.test(n1), 'no <style> block or style attribute left');
BUTTONS.forEach(function (b) { ok(count(n1, b) === 1, '"' + b + '" appears exactly once (' + count(n1, b) + ')'); });
ok(!/float/i.test(emailHtml), 'no float anywhere in the email');
ok(!/align="(left|right)"/.test(emailHtml), 'no align="left" / align="right"');
ok(!/class="[^"]*\bm?col\b/.test(emailHtml), 'no "col" / "mcol" tables');
var n1Tables = n1.match(/<table\b[^>]*>/g) || [];
ok(n1Tables.every(function (t) { return !/width="(\d+(\.\d+)?)%"/.test(t) || / width="100%"/.test(t); }),
   'no table with a percentage width other than 100%');
var n1Tds = n1.match(/<td\b[^>]*>/g) || [];
ok(n1Tds.length > 15 && n1Tds.every(function (t) { return / align="center"/.test(t); }),
   'every td has align="center" (' + n1Tds.length + ' tds)');
ok(n1Tds.filter(function (t) { return / width="\d/.test(t); }).every(function (t) { return / width="(50%|100%|42)"/.test(t); }),
   'td widths are only 50% (two-up), 100% or the 42px social cells');
ok(/<table [^>]*class="width600 main-container"[^>]* width="600" align="center"/.test(n1), 'container: width="600" align="center"');
ok(/bgcolor="#59315f"[^>]*>\s*<p[^>]*><font face="[^"]*" color="#ffffff">/.test(n1), 'header: bgcolor attribute, white text via <font color>');
ok((n1.match(/<table [^>]*bgcolor="#ffb500"/g) || []).length === 3, 'three yellow buttons, each coloured by bgcolor');

console.log('N2. Outlook view: each button once');
var n2 = outlookView(emailHtml);
BUTTONS.forEach(function (b) { ok(count(n2, b) === 1, '"' + b + '" appears exactly once (' + count(n2, b) + ')'); });
ok((emailHtml.match(/<!--\[if !mso\]><!-- -->/g) || []).length === 3 && (emailHtml.match(/<!--\[if mso\]>\n<table/g) || []).length === 3,
   'exactly one [if !mso] / [if mso] pair per button');

console.log('N3. Agreed copy');
var n3 = textOf(emailHtml);
[
    'YOUR QUOTE IS READY', 'Thank you for requesting a quote', 'Project: Ref · OPP123',
    'Your quote',
    'Open your quote online to see your system, prices and options. It\'s provided subject to our Terms and Conditions.',
    'VIEW YOUR QUOTE', 'Why choose Nu-Heat?',
    'Bespoke heating design', 'We tailor each system to the property for maximum performance',
    'The heating experts', 'Our systems heat more than 80,000 homes across the country!',
    'Lifetime support', 'We support our systems for life, so you can always call on us if needed',
    'Award-winning service', 'Proud to hold a Distinction from the Institute of Customer Service',
    'What\'s next?', 'To discuss your quote or place your order, get in touch with your Account Manager.',
    'YOUR ACCOUNT MANAGER', 'AM', '0123 · am@example.com', 'CALL AM', 'EMAIL AM',
    'You\'re receiving this because you requested a quote from Nu-Heat.'
].forEach(function (t) { ok(n3.indexOf(t) !== -1, 'copy: "' + t + '"'); });
ok(n3.indexOf('Here\'s your Nu-Heat quote.') === 0, 'preheader "Here\'s your Nu-Heat quote." kept, first');
ok(!/tailored/.test(emailHtml), '"tailored" gone');
ok(!/If you have any questions/.test(emailHtml), 'closing "If you have any questions…" line removed');
ok(!/Account%20manager\.jpg/.test(emailHtml) && !/Nu-Heat team/.test(emailHtml), 'team image removed');
ok(/<a href="https:\/\/www\.nu-heat\.co\.uk\/wp-content\/uploads\/2021\/04\/Nu-Heat-TCs-Consumer-and-Trade\.pdf"/.test(emailHtml), 'T&C link unchanged');
ok(emailHtml.indexOf('<link href="https://www.nu-heat.co.uk/wp-content/themes/nu-heat/assets/fonts/calibri/calibri-font.css"') !== -1, 'Calibri font link kept');
['1698400306920_Nu-Heat%20Master%20logo%20green%20-%20transparent%20v3.png', '1613738610524_Order%20conformation.jpg',
 '1698665508018_Design.png', '1698665474858_Installer%20skills%202.png', '1698665569030_Lifetime%20tech%20support.png',
 '1698665474762_Award%20winning%20customer%20service.png', '1604422010305_Nu-Heat%20Master%20logo%20wht%20on%20green.png'
].forEach(function (img) { ok(emailHtml.indexOf(img) !== -1, 'image kept: ' + decodeURIComponent(img)); });
[['https://www.facebook.com/nuheatuk/', 'facebook'], ['https://www.instagram.com/nuheatufh/', 'instagram'],
 ['https://www.linkedin.com/company/nu-heat/', 'linkedin'], ['https://twitter.com/nuheatuk', 'twitter'],
 ['https://youtube.com/channel/UCsfB8s56fcERuaBFovwYnGQ', 'youtube']
].forEach(function (sl) {
    ok(new RegExp('<a href="' + sl[0].replace(/[.?/]/g, '\\$&') + '" target="_blank"><img src="[^"]*white%20-%20' + sl[1] + '\\.png"').test(emailHtml), 'social link and icon: ' + sl[1]);
});
ok(/<a href="https:\/\/acct\.app\.netsuite\.com\/core\/media\/media\.nl\?id=1" target="_blank"[^>]*><font[^>]*><b>VIEW YOUR QUOTE<\/b>/.test(emailHtml), 'VIEW YOUR QUOTE → proposal URL');
ok(/<a href="tel:0123"[^>]*><font[^>]*><b>CALL AM<\/b>/.test(emailHtml) && /<a href="mailto:am@example\.com"[^>]*><font[^>]*><b>EMAIL AM<\/b>/.test(emailHtml),
   'CALL → tel:, EMAIL → mailto:');
var order3 = ['YOUR QUOTE IS READY', 'Order%20conformation', 'Your quote<', 'Why choose', 'What\'s next?', 'YOUR ACCOUNT MANAGER', 'CALL AM', 'wht%20on%20green', 'You\'re receiving'];
ok(order3.every(function (t, i) { return i === 0 || emailHtml.indexOf(t) > emailHtml.indexOf(order3[i - 1]); }), 'blocks in design order');

console.log('N4. Merge tags');
var n4 = [emailHtml, sendWith({ employee: { firstname: 'Steve', custentity_employee_photo_link: PHOTO } }),
          sendWith({ oppData: oppDataWith({ id: '', name: 'Your Account Manager' }) })];
n4.forEach(function (h, i) { ok(h.length > 5000 && !/\{\{[^}]*\}\}/.test(h), 'variant ' + (i + 1) + ': no {{…}} left'); });
var n4b = sendWith({ oppData: oppDataWith({ name: 'Ann {{TRAN_ID}} $& Lee' }) });
ok(n4b.indexOf('Ann {{TRAN_ID}} $&amp; Lee') !== -1, 'a value is never re-substituted, and "$&" is literal');

console.log('N5. First name');
var n5a = sendWith({ employee: { firstname: 'Steve' }, oppData: oppDataWith({ name: 'Steven Nixon' }) });
ok(count(fullyStripped(n5a), 'CALL STEVE') === 1 && count(fullyStripped(n5a), 'EMAIL STEVE') === 1 && n5a.indexOf('CLICK TO CALL') === -1, 'from firstname: CALL STEVE / EMAIL STEVE');
ok(state.employeeLookups.length === 1 && state.employeeLookups[0].id === '7' &&
   state.employeeLookups[0].columns.join() === 'firstname,custentity_employee_photo_link', 'one lookupFields on the Opportunity\'s sales rep (7): firstname, photo');
var n5b = sendWith({ employee: { firstname: '  ' }, oppData: oppDataWith({ name: 'Jo Bloggs' }) });
ok(count(fullyStripped(n5b), 'CALL JO') === 1 && count(fullyStripped(n5b), 'EMAIL JO') === 1, 'firstname empty → first word of the name: CALL JO');
var n5c = sendWith({ employeeThrows: 'no permission', oppData: oppDataWith({ name: 'Jo Bloggs' }) });
ok(state.emails.length === 1 && count(fullyStripped(n5c), 'CALL JO') === 1, 'lookup throws → still sent, first word of the name');
ok(auditLogs('SendQuoteSL.RepPhoto').some(function (l) { return /photo skipped — employee lookup failed: no permission/.test(l.details); }), 'lookup failure logged');
var n5d = sendWith({ oppData: oppDataWith({ id: '', name: 'Your Account Manager', email: 'info@nu-heat.co.uk', phone: '01404 540604' }) });
ok(count(fullyStripped(n5d), 'CLICK TO CALL') === 1 && count(fullyStripped(n5d), 'SEND AN EMAIL') === 1 && !/CALL YOUR/.test(n5d), 'no sales rep → CLICK TO CALL / SEND AN EMAIL (not "CALL YOUR")');
ok(!state.employeeLookups, 'no sales rep → no employee lookup');
var n5e = sendWith({ oppData: oppDataWith({ name: '' }) });
ok(count(fullyStripped(n5e), 'CLICK TO CALL') === 1 && count(fullyStripped(n5e), 'SEND AN EMAIL') === 1, 'no first name and no name → CLICK TO CALL / SEND AN EMAIL');
ok([n5a, n5b, n5c, n5d, n5e].every(function (h) { var t = fullyStripped(h); return count(t, 'mailto:') === 1 && count(t, 'tel:') === 1; }),
   'every variant: one tel: and one mailto: in the stripped view');

console.log('N6. Photo');
var n6 = sendWith({ employee: { firstname: 'Steve', custentity_employee_photo_link: '  ' + PHOTO + ' ' } });
var n6img = photoImgs(n6);
ok(n6img.length === 1 && n6img[0].indexOf('src="' + PHOTO.replace(/&/g, '&amp;') + '"') !== -1, 'https URL → one photo img, trimmed, & escaped');
ok(/ alt="AM"/.test(n6img[0]) && / height="96"/.test(n6img[0]), 'alt = the rep\'s name, 96 × 96');
ok(n6.indexOf('YOUR ACCOUNT MANAGER') > n6.indexOf(n6img[0]), 'photo above the label');
ok(auditLogs('SendQuoteSL.RepPhoto').length === 1 && /Opportunity 123 — employee 7: photo used/.test(auditLogs('SendQuoteSL.RepPhoto')[0].details), 'audit once: photo used');
ok(photoImgs(fullyStripped(n6)).length === 1, 'photo still there in the stripped view');
var BASE_IMGS = imgCount(emailHtml);
ok(BASE_IMGS === 12, 'no photo: 12 images (logo, hero, 4 icons, footer logo, 5 social) (' + BASE_IMGS + ')');
[['', 'empty', /custentity_employee_photo_link is empty/], [undefined, 'absent', /custentity_employee_photo_link is empty/],
 ['http://example.com/p.jpg', 'http://', /not an https:\/\/ URL/], ['javascript:alert(1)', 'javascript:', /not an https:\/\/ URL/],
 ['/core/media/media.nl?id=5&c=1&h=ab', 'relative', /not an https:\/\/ URL/], ['p.jpg', 'bare file name', /not an https:\/\/ URL/],
 ['https://x.example/a b.jpg', 'https with a space', /spaces, quotes/], ['https://x.example/a.jpg"onerror="x', 'https with a quote', /spaces, quotes/],
 [[{ value: '12', text: 'photo.jpg' }], 'a file (select-style value)', /not an https:\/\/ URL/]
].forEach(function (c) {
    var h = sendWith({ employee: { firstname: 'Steve', custentity_employee_photo_link: c[0] } });
    var logs = auditLogs('SendQuoteSL.RepPhoto');
    ok(photoImgs(h).length === 0 && imgCount(h) === BASE_IMGS && h.indexOf('border-radius:48px') === -1,
       c[1] + ' → no photo <img>, no empty circle');
    ok(logs.length === 1 && /photo skipped/.test(logs[0].details) && c[2].test(logs[0].details), c[1] + ' → audit once: skipped, why (' + (logs[0] || {}).details + ')');
});
sendWith({ oppData: oppDataWith({ id: '' }) });
ok(auditLogs('SendQuoteSL.RepPhoto').length === 1 && /employee none: photo skipped — the Opportunity has no sales rep/.test(auditLogs('SendQuoteSL.RepPhoto')[0].details), 'no sales rep → audit: skipped, no sales rep');

console.log('N7. Escaping');
var EVIL = '<script>alert(1)</script> & "Q\'s"';
var n7 = sendWith({
    employee: { firstname: '<i>Jo</i> & "x"', custentity_employee_photo_link: PHOTO },
    oppData: oppDataWith({ name: EVIL, email: 'a"b@example.com', phone: '01404 <b>540604' }, { quoteEmailRef: '<b>Barn</b> & "Loft"', tranId: 'OPP<1>' })
});
ok(n7.indexOf('<script>') === -1 && n7.indexOf('<b>Barn') === -1 && n7.indexOf('<i>') === -1 && n7.indexOf('<I>') === -1 && n7.indexOf('<b>540604') === -1,
   'no raw tag from any value');
var EVIL_ESC = '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Q&#039;s&quot;';
ok(count(n7, EVIL_ESC) === 2 && n7.indexOf('alt="' + EVIL_ESC + '"') !== -1, 'name escaped in the card and the photo alt');
ok(n7.indexOf('Project: &lt;b&gt;Barn&lt;/b&gt; &amp; &quot;Loft&quot; <span') !== -1 && n7.indexOf('· OPP&lt;1&gt;</span>') !== -1, 'project and reference escaped');
ok(n7.indexOf('<title>Your quote for &lt;b&gt;Barn&lt;/b&gt; &amp; &quot;Loft&quot; (OPP&lt;1&gt;)</title>') !== -1, 'title escaped');
ok(count(fullyStripped(n7), 'CALL &lt;I&gt;JO&lt;/I&gt; &amp; &quot;X&quot;') === 1, 'first name upper-cased, then escaped');
ok(n7.indexOf('href="mailto:a&quot;b@example.com"') !== -1 && n7.indexOf('href="tel:01404540604"') !== -1, 'mailto: escaped; tel: digits only');
ok(n7.indexOf('01404 &lt;b&gt;540604') !== -1, 'phone text escaped');
var n7b = sendWith({ oppData: oppDataWith({ phone: 'ask for Sam' }) });
ok(n7b.indexOf('href="tel:') === -1 && count(fullyStripped(n7b), 'EMAIL AM') === 1 && n7b.indexOf('<td class="stack" width="100%"') !== -1,
   'phone with no digits → no tel: button, EMAIL alone at full width');
ok(!/href="(tel|mailto):"/.test(n7b), 'never an empty tel: or mailto:');
var n7c = sendWith({ oppData: oppDataWith({ phone: '', email: '' }) });
ok(n7c.indexOf('href="tel:01404540604"') !== -1 && n7c.indexOf('href="mailto:info@nu-heat.co.uk"') !== -1 && textOf(n7c).indexOf('01404 540604 \u00b7 info@nu-heat.co.uk') !== -1,
   'missing phone / email → today\'s fallbacks (01404 540604, info@nu-heat.co.uk)');

console.log('N8. Long project name');
var LONG = 'Barn conversion and two-storey extension with a detached garage, annex and a garden studio at Upper Hollow Farm Estate';
while (LONG.length < 120) LONG += 'x';
var n8 = sendWith({ oppData: oppDataWith({}, { quoteEmailRef: LONG }) });
ok(LONG.length === 120 && n8.indexOf('Project: ' + LONG + ' <span style="white-space:nowrap;">· OPP123</span>') !== -1, 'reference and its dot in one no-wrap span');
ok((n8.match(/<table [^>]*class="width600 main-container"[^>]* width="600"/g) || []).length === 1 &&
   (fullyStripped(n8).match(/ width="600"/g) || []).length === 2, 'column still width="600" (container + hero), also stripped');

console.log('N9. No display:none wrapper (preheader excepted), every variant');
[emailHtml, n5d, n6, n7, n7b, n8].forEach(function (h, i) {
    var w = h.match(/<[a-z]+[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/gi) || [];
    ok(w.length === 1 && /^<span style="display:none;font-size:0px/.test(w[0]) && !/mso-hide/i.test(h),
       'variant ' + (i + 1) + ': only the preheader span (' + w.length + ')');
});

if (process.env.WRITE_EMAIL_SAMPLE) {
    var sample = sendWith({
        employee: { firstname: 'Sam', custentity_employee_photo_link: process.env.SAMPLE_PHOTO_URL || PHOTO },
        oppData: oppDataWith({ name: 'Sam Taylor', email: 'sam.taylor@nu-heat.co.uk', phone: '01404 549 770' },
                             { quoteEmailRef: 'Barn conversion, Upper Hollow Farm', tranId: 'OPP41872' })
    });
    fs.writeFileSync(path.join(ROOT, 'docs', 'samples', 'send-quote-email-2.2.0.html'), sample);
    fs.writeFileSync(path.join(ROOT, 'docs', 'samples', 'send-quote-email-2.2.0-stripped.html'), fullyStripped(sample));
    console.log('  (wrote docs/samples/send-quote-email-2.2.0.html and -stripped.html)');
}

// ═══ S — 2.2.1 / 2.3.0: send speed, forecast tags ════════════════════════════════

function timingLines() { return auditLogs('SendQuoteSL.Timing').map(function (l) { return l.details; }); }

console.log('S6. SendQuoteSL.Timing — one line per GET and per POST, all phases and counts');
resetState();
runGet();
var s6g = timingLines();
ok(s6g.length === 1 && /^GET Opportunity 123 — ms: opportunity=\d+ quotes=\d+ render=\d+ total=\d+ \| quotes=3 \| rendered$/.test(s6g[0]),
   'GET: opportunity, quotes, render, total; quotes=3 (' + s6g[0] + ')');
resetState();
runPost(basePost({ custpage_upd_entitystatus: '12' }));
var s6p = timingLines();
ok(s6p.length === 1 && /^POST Opportunity 123 — ms: rebuild=\d+ proposal=\d+ email=\d+ forecast=\d+ oppUpdate=\d+ total=\d+ \| quotes=3 selected=2 forecastWrites=2 \| sent$/.test(s6p[0]),
   'POST: rebuild, proposal, email, forecast, oppUpdate, total; quotes, selected, forecast writes (' + s6p[0] + ')');
resetState();
state.emailThrows = 'SMTP down';
runPost(basePost());
var s6f = timingLines();
ok(s6f.length === 1 && /^POST Opportunity 123 — ms: rebuild=\d+ proposal=\d+ email=\d+ rerender=\d+ total=\d+ \| quotes=3 selected=2 forecastWrites=0 \| failed: email$/.test(s6f[0]),
   'POST, email fails: one line, phases up to the failure, then the re-render (' + s6f[0] + ')');
resetState();
runPost(basePost({ custpage_sel: JSON.stringify({ '901': 'main', '950': 'additional' }) }));
ok(timingLines().length === 1 && / \| failed: rebuild$/.test(timingLines()[0]), 'POST, foreign quote: one line, failed: rebuild');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
