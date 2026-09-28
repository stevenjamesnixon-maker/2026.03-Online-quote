/**
 * Tests for Update Opportunity SL 1.0.0 (+ nuheat_opp_update_lib.js 1.0.0, Opportunity UE 1.3.0).
 *
 * Same style as send-quote-opp-update.js: `define` is stubbed, the real Suitelet, library and UE are
 * loaded under stubbed N/* modules, every scenario is checked with ok(), non-zero exit on failure.
 * The stubs also keep a governance ledger (standard SuiteScript unit costs) for T17.
 *
 *   node test/update-opp.js
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

// ─── State and stubs ───────────────────────────────────────────────────────────

var state;
var ALL_WRITES = [];   // every record write across every scenario (T13)

function pad(n) { return (n < 10 ? '0' : '') + n; }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dmy(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }

function resetState() {
    state = {
        calls: [], logs: [], writes: [], units: 0, redirect: null, pageMessages: [],
        callSaveThrows: null, objSaveThrows: {}, submitThrows: null, nextId: 5000,
        fieldTypes: { entitystatus: 'select', custbody_next_contact: 'date', custbody_opp_del_date: 'date', custbody_build_stage: 'select', expectedclosedate: 'date' },
        oppValues: {
            tranid: 'OPP123', title: 'Barn &lt;b&gt;conversion&lt;/b&gt;', entity: '55', entitystatus: '10',
            custbody_opp_site_adress: '1 Test Street',
            custbody_next_contact: new Date(2026, 9, 1),
            custbody_opp_del_date: new Date(2026, 10, 15),
            custbody_build_stage: '3',
            expectedclosedate: new Date(2026, 11, 20)
        },
        lookup: { custbody_next_contact: '01/10/2026' },
        options: {
            entitystatus:         [{ value: '10', text: 'Proposal' }, { value: '12', text: 'Quoted' }],
            custbody_build_stage: [{ value: '3', text: 'Foundations' }, { value: '4', text: 'Roof on' }]
        },
        callTitles: [{ id: '2', name: 'Quote follow up' }, { id: '1', name: 'Initial enquiry/pre quote' }, { id: '10', name: 'No answer/left VM' }],
        types: [
            { id: '21', name: 'Speed of quote', group: '2', groupName: 'Speed &amp; service' },
            { id: '12', name: 'Cheaper competitor quote', group: '1', groupName: 'Price & funding' },
            { id: '11', name: '&lt;b&gt;Price&lt;/b&gt; too high', group: '1', groupName: 'Price & funding' },
            { id: '71', name: 'Other (see notes)', group: '7', groupName: 'Other' }
        ],
        estimates: [
            { id: '901', opp: '123', tranid: 'EST901', title: 'Heat pump', desc: 'Air source &lt;b&gt;heat&lt;/b&gt; pump' },
            { id: '902', opp: '123', tranid: 'EST902', title: 'UFH &amp; screed', desc: '' },
            { id: '950', opp: '777', tranid: 'EST950', title: 'Other opp', desc: '' }
        ],
        contacts: [{ id: '71', first: 'Ann', last: 'Lee', email: 'ann@example.com' }, { id: '72', first: 'Bob', last: 'Ray', email: '' }],
        phoneCalls: { '4001': { title: 'Quote follow up', transaction: '123' }, '4002': { title: 'Other opp call', transaction: '777' } }
    };
}

function charge(n) { state.units += n; }

var logStub = {};
['debug', 'audit', 'error', 'emergency'].forEach(function (lvl) {
    logStub[lvl] = function (title, details) { state.logs.push({ level: lvl, title: title, details: String(details) }); };
});

var formatStub = {
    Type: { DATE: 'date', DATETIME: 'datetime' },
    format: function (o) { return dmy(o.value); },
    parse: function (o) { return o.value; }
};

function makeField(o) {
    return { id: o.id, type: o.type, label: o.label, defaultValue: undefined,
             addSelectOption: function () {}, updateDisplayType: function () {} };
}
var serverWidgetStub = {
    FieldType: { INLINEHTML: 'inlinehtml', TEXT: 'text', SELECT: 'select', DATE: 'date' },
    FieldDisplayType: { HIDDEN: 'hidden' },
    createForm: function (o) {
        return { title: o.title, fields: [], buttons: [],
                 addField: function (fo) { var f = makeField(fo); this.fields.push(f); return f; },
                 addButton: function (b) { this.buttons.push(b); },
                 html: function () { return this.fields.map(function (f) { return f.defaultValue || ''; }).join('\n'); } };
    }
};

function makeOppRecord() {
    return {
        getValue: function (o) { return state.oppValues[o.fieldId]; },
        getText: function (o) { return { entitystatus: 'Proposal', entity: 'Customer Ltd' }[o.fieldId] || ''; },
        getField: function (o) {
            var t = state.fieldTypes[o.fieldId];
            if (!t) return null;
            return { type: t, getSelectOptions: function () { return state.options[o.fieldId] || []; } };
        }
    };
}

function makeNewRecord(type) {
    var values = {};
    return {
        values: values,
        setValue: function (o) { values[o.fieldId] = o.value; },
        save: function () {
            var isCall = type === 'phonecall';
            charge(isCall ? 10 : 4);
            state.calls.push('save:' + type);
            if (isCall && state.callSaveThrows) throw new Error(state.callSaveThrows);
            if (!isCall && state.objSaveThrows[values.custrecord_nhobj_type]) throw new Error(state.objSaveThrows[values.custrecord_nhobj_type]);
            var id = String(state.nextId++);
            var w = { kind: 'create', type: type, id: id, values: values };
            state.writes.push(w); ALL_WRITES.push(w);
            return id;
        }
    };
}

var recordStub = {
    Type: { OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', PHONE_CALL: 'phonecall' },
    load: function (o) {
        charge(10);
        state.calls.push('load:' + o.type);
        if (o.type === 'opportunity') return makeOppRecord();
        throw new Error('unexpected load of ' + o.type);
    },
    create: function (o) {
        charge(o.type === 'phonecall' ? 5 : 2);
        state.calls.push('create:' + o.type);
        return makeNewRecord(o.type);
    },
    submitFields: function (o) {
        charge(10);
        state.calls.push('submitFields:' + o.type);
        var w = { kind: 'submitFields', type: o.type, id: o.id, values: o.values, options: o.options };
        state.writes.push(w); ALL_WRITES.push(w);
        if (state.submitThrows) throw new Error(state.submitThrows);
        return o.id;
    }
};

function filterValue(filters, name) {
    for (var i = 0; i < filters.length; i++) {
        if (Array.isArray(filters[i]) && filters[i][0] === name) return filters[i][2];
    }
    return undefined;
}
function result(vals, texts) {
    return {
        getValue: function (o) { var k = typeof o === 'string' ? o : o.name; return vals[k] === undefined ? '' : vals[k]; },
        getText: function (o) { var k = typeof o === 'string' ? o : o.name; return (texts || {})[k] || ''; }
    };
}

var searchStub = {
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', PHONE_CALL: 'phonecall' },
    Sort: { DESC: 'DESC', ASC: 'ASC' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        charge(1);
        state.calls.push('lookupFields:' + o.type + ':' + o.columns.join(','));
        if (o.type === 'opportunity') {
            var out = {};
            o.columns.forEach(function (c) {
                if (c === 'entity') out.entity = [{ value: state.oppValues.entity, text: 'Customer Ltd' }];
                else out[c] = state.lookup[c] === undefined ? '' : state.lookup[c];
            });
            return out;
        }
        if (o.type === 'phonecall') {
            var pc = state.phoneCalls[o.id];
            if (!pc) throw new Error('no phone call ' + o.id);
            return { title: pc.title, transaction: [{ value: pc.transaction, text: 'Opportunity' }] };
        }
        return {};
    },
    create: function (o) {
        state.calls.push('search:' + o.type);
        var rows = [];
        if (o.type === 'customlist_nh_call_title') {
            rows = state.callTitles.slice().sort(function (a, b) { return a.id - b.id; }).map(function (t) { return result({ internalid: t.id, name: t.name }); });
        } else if (o.type === 'customrecord_nh_objection_type') {
            var ids = filterValue(o.filters, 'internalid');
            rows = state.types.filter(function (t) { return !ids || ids.indexOf(t.id) !== -1; })
                .map(function (t) { return result({ internalid: t.id, name: t.name, custrecord_nhot_group: t.group }, { custrecord_nhot_group: t.groupName }); });
        } else if (o.type === 'estimate') {
            var opp = String(filterValue(o.filters, 'opportunity'));
            var eids = filterValue(o.filters, 'internalid');
            rows = state.estimates.filter(function (e) { return e.opp === opp && (!eids || eids.indexOf(e.id) !== -1); })
                .map(function (e) { return result({ internalid: e.id, tranid: e.tranid, title: e.title, custbody_quote_description: e.desc }); });
        } else if (o.type === 'opportunity') {
            rows = state.contacts.map(function (c) { return result({ internalid: c.id, firstname: c.first, lastname: c.last, email: c.email }); });
        }
        return {
            run: function () {
                return {
                    getRange: function () { charge(10); return rows; },
                    each: function (cb) { charge(10); for (var i = 0; i < rows.length; i++) { if (cb(rows[i]) === false) break; } }
                };
            }
        };
    }
};

var redirectStub = { toRecord: function (o) { state.calls.push('redirect'); state.redirect = o; } };

var modules = {
    'N/ui/serverWidget': serverWidgetStub,
    'N/search': searchStub,
    'N/record': recordStub,
    'N/log': logStub,
    'N/url': { resolveRecord: function (o) { return '/app/accounting/transactions/opprtnty.nl?id=' + o.recordId; }, resolveScript: function () { return '/sl'; } },
    'N/redirect': redirectStub,
    'N/runtime': { getCurrentUser: function () { return { id: '7' }; }, getCurrentScript: function () { return { id: 'x', deploymentId: 'y' }; } },
    'N/format': formatStub,
    'N/ui/message': { Type: { CONFIRMATION: 'confirmation', WARNING: 'warning' } }
};
modules['./nuheat_opp_update_lib'] = loadModule('nuheat_opp_update_lib.js', modules);
var sl = loadModule('nuheat_update_opp_sl.js', modules);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function response() { return { page: null, writePage: function (f) { this.page = f; } }; }
function runGet(params) {
    var ctx = { request: { method: 'GET', parameters: params || { opportunityId: '123' } }, response: response() };
    sl.onRequest(ctx);
    return ctx.response.page;
}
var TODAY = iso(new Date());
function post(overrides) {
    var p = {
        custpage_opportunity_id: '123',
        custpage_call_std: 'Quote follow up', custpage_call_title: 'Quote follow up', custpage_call_date: TODAY,
        custpage_call_contact: '', custpage_call_notes: 'Customer wants to compare prices.',
        custpage_obj_sel: '[]', custpage_obj_quote: '',
        custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage,close_date',
        custpage_upd_entitystatus: '10', custpage_orig_entitystatus: '10', custpage_origtxt_entitystatus: 'Proposal',
        custpage_upd_next_contact: '2026-10-01', custpage_orig_next_contact: '2026-10-01', custpage_origtxt_next_contact: '01/10/2026',
        custpage_upd_del_date: '2026-11-15', custpage_orig_del_date: '2026-11-15', custpage_origtxt_del_date: '15/11/2026',
        custpage_upd_build_stage: '3', custpage_orig_build_stage: '3', custpage_origtxt_build_stage: 'Foundations',
        custpage_upd_close_date: '2026-12-20', custpage_orig_close_date: '2026-12-20', custpage_origtxt_close_date: '20/12/2026'
    };
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });
    var ctx = { request: { method: 'POST', parameters: p }, response: response() };
    sl.onRequest(ctx);
    return ctx.response.page;
}
function html(form) { return form ? form.html() : ''; }
function scripts(h) { var out = [], re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi, m; while ((m = re.exec(h))) out.push(m[1]); return out; }
function writesOf(kind, type) { return state.writes.filter(function (w) { return w.kind === kind && (!type || w.type === type); }); }
function objections() { return writesOf('create', 'customrecord_nh_objection'); }
function audit(title) { return state.logs.filter(function (l) { return l.level === 'audit' && l.title === title; }); }
function nothingWritten() { return state.writes.length === 0 && !state.redirect; }

// ─── T1–T13: the Suitelet ──────────────────────────────────────────────────────

console.log('T1. GET');
resetState();
var f1 = runGet();
var h1 = html(f1);
ok(f1.title === 'Update opportunity' && f1.fields.length === 1 && f1.fields[0].type === 'inlinehtml' && f1.buttons.length === 0, 'one INLINEHTML body, no native buttons');
var i1 = h1.indexOf('Log the call'), i2 = h1.indexOf('Update the opportunity</h2>'), i3 = h1.indexOf('Log any objections');
ok(i1 > 0 && i2 > i1 && i3 > i2, 'sections in order: 1 Log the call → 2 Update the opportunity → 3 Log any objections');
ok(/<span class="nsq-num">1<\/span>Log the call/.test(h1) && /<span class="nsq-num">2<\/span>Update the opportunity/.test(h1) && /<span class="nsq-num">3<\/span>Log any objections/.test(h1), 'numbered 1, 2, 3');
var chipOrder = []; h1.replace(/data-type-id="(\d+)" data-group="(\d+)"/g, function (m, t, g) { chipOrder.push(g + ':' + t); });
ok(chipOrder.join(',') === '1:11,1:12,2:21,7:71', 'chips grouped by group ID, then type ID (' + chipOrder.join(',') + ')');
var groups = []; h1.replace(/<h3 class="nsq-h3">([^<]*)<\/h3>/g, function (m, g) { groups.push(g); });
ok(groups.join(' | ') === 'Price &amp; funding | Speed &amp; service | Other', 'group headings in group order, cleaned (' + groups.join(' | ') + ')');
var titleOpts = []; h1.replace(/<option value="([^"]*)">([^<]*)<\/option>/g, function (m, v) { titleOpts.push(v); });
ok(/<select id="nsq-std-title" name="custpage_call_std" class="nsq-input"><option value=""><\/option><option value="Initial enquiry\/pre quote">Initial enquiry\/pre quote<\/option><option value="Quote follow up">/.test(h1), 'standard titles: blank first, then internal-ID order');
ok(/id="nsq-call-title" name="custpage_call_title" maxlength="99"/.test(h1), 'Title maxlength = CALL_TITLE_MAX (99)');
ok(new RegExp('id="nsq-call-date" name="custpage_call_date" value="' + TODAY + '" max="' + TODAY + '" data-default="1"').test(h1), 'call date defaults to today, max today, browser may correct it');
ok(/name="custpage_call_notes" rows="5" maxlength="3900"/.test(h1), 'notes max 3,900');
ok(/<option value="71">Ann Lee<\/option><option value="72">Bob Ray<\/option>/.test(h1), 'contact select from the opportunity contacts');
ok(/<input type="date" name="custpage_upd_next_contact"[^>]*data-required="1"/.test(h1) && /Next contact <span class="nsq-req"/.test(h1), 'Next contact has data-required and a required marker');
ok((h1.split('<script>')[0].match(/data-required="1"/g) || []).length === 1, 'no other field is required (markup only)');
var s1 = scripts(h1);
ok(s1.length === 1 && (h1.match(/<script/gi) || []).length === 1, 'exactly one <script>');
ok(!/EST9|Ann|Price|Quote follow|OPP123|Barn/.test(s1[0]), 'no record data inside the script');
var parsed = true; try { new vm.Script(s1[0]); } catch (e) { parsed = false; console.log('     ' + e.message); }
ok(parsed, 'the script parses');
ok(/<option value="901">EST901 · Air source heat pump<\/option><option value="902">EST902 · UFH &amp; screed<\/option>/.test(h1) && !/EST950/.test(h1), 'About quote: every Estimate on this opportunity (tranid · description || title)');
ok(/id="nsq-send" disabled>Save<\/button>/.test(h1) && /Each objection also stores the call notes from step 1\./.test(h1), 'Save starts disabled; helper text');

console.log('T2. Entity-encoded text is decoded, stripped, escaped once');
ok(/aria-pressed="false">Price too high<\/button>/.test(h1), 'type name');
ok(/<span>Barn conversion<\/span>/.test(h1), 'opportunity title in the header');
ok(/EST901 · Air source heat pump/.test(h1) && !/&amp;lt;|&lt;b&gt;/.test(h1), 'quote label; no visible entities or double encoding');

console.log('T3. Next contact blank, record empty → blocked');
resetState();
state.lookup.custbody_next_contact = '';
var f3 = post({ custpage_upd_next_contact: '', custpage_orig_next_contact: '', custpage_obj_sel: '["11"]', custpage_obj_note_11: 'Too dear', custpage_call_title: 'My title' });
var h3 = html(f3);
ok(nothingWritten(), 'nothing written, no redirect');
ok(/Not saved\.<\/strong> Next contact is required — the opportunity has none\. Set it in step 2\./.test(h3), 'error panel');
ok(/value="My title"/.test(h3) && /data-type-id="11" data-group="1" aria-pressed="true"/.test(h3) && /name="custpage_obj_note_11"[^>]*value="Too dear"/.test(h3), 'entries restored: title, ticked chip, its note');
ok(/id="nsq-obj-note-11">/.test(h3) && /id="nsq-obj-note-12" hidden>/.test(h3), 'ticked note visible, others hidden');
ok(state.calls.indexOf('lookupFields:opportunity:custbody_next_contact') !== -1, 'the record was read (lookupFields)');

console.log('T4. Next contact blank, record has one → allowed, not written');
resetState();
post({ custpage_upd_next_contact: '', custpage_upd_entitystatus: '12' });
var sub4 = writesOf('submitFields', 'opportunity');
ok(state.redirect && sub4.length === 1 && !('custbody_next_contact' in sub4[0].values), 'saved; Next contact not written (blank never clears)');

console.log('T5. Forged original, record empty → still blocked');
resetState();
state.lookup.custbody_next_contact = '';
post({ custpage_upd_next_contact: '', custpage_orig_next_contact: '2026-10-01' });
ok(nothingWritten(), 'blocked — the gate reads the record, not the posted original');
resetState();
state.lookup.custbody_next_contact = '';
post({ custpage_upd_next_contact: '2026-10-20', custpage_orig_next_contact: '' });
ok(!!state.redirect && writesOf('submitFields', 'opportunity')[0].values.custbody_next_contact instanceof Date, 'record empty but a date chosen → allowed and written');

console.log('T6. Call date');
var d = new Date(); var plus3 = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3)); var plus1 = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
[['future (+3 days)', plus3], ['invalid', '2026-02-30'], ['garbage', 'yesterday'], ['blank', '']].forEach(function (c) {
    resetState();
    var f = post({ custpage_call_date: c[1] });
    ok(nothingWritten() && /Not saved\./.test(html(f)), c[0] + ' → blocked');
});
resetState();
post({ custpage_call_date: plus1 });
ok(!!state.redirect, 'server today + 1 accepted (time-zone tolerance: the browser caps at its own today)');

console.log('T7. Unknown type, foreign quote, foreign contact, bad input');
[['unknown objection type', { custpage_obj_sel: '["11","999"]' }, 'An objection type is not recognised'],
 ['duplicate type', { custpage_obj_sel: '["11","11"]' }, 'ticked twice'],
 ['malformed selection', { custpage_obj_sel: '{bad' }, 'could not be read'],
 ['non-numeric type', { custpage_obj_sel: '["<b>"]' }, 'could not be read'],
 ['quote on another opportunity', { custpage_obj_quote: '950' }, 'not on this opportunity'],
 ['foreign contact', { custpage_call_contact: '999' }, 'contact is not on this opportunity'],
 ['blank title', { custpage_call_title: '   ' }, 'Enter a call title'],
 ['title too long', { custpage_call_title: new Array(101).join('x') }, 'longer than 99'],
 ['blank notes', { custpage_call_notes: ' ' }, 'Enter what was discussed'],
 ['notes too long', { custpage_call_notes: new Array(3902).join('x') }, 'longer than 3900'],
 ['objection note too long', { custpage_obj_sel: '["11"]', custpage_obj_note_11: new Array(302).join('x') }, 'longer than 300']
].forEach(function (c) {
    resetState();
    var f = post(c[1]);
    ok(nothingWritten() && html(f).indexOf(c[2]) !== -1, c[0] + ' → blocked, nothing written');
});

console.log('T8. Happy path: two objections, Status + Next contact changed');
resetState();
post({ custpage_obj_sel: '["12","11"]', custpage_obj_note_11: 'Said £2k over budget', custpage_obj_quote: '901', custpage_call_contact: '71',
       custpage_upd_entitystatus: '12', custpage_upd_next_contact: '2026-10-12' });
var order8 = state.calls.filter(function (c) { return /^(save:|submitFields|redirect)/.test(c); });
ok(order8.join(' > ') === 'save:phonecall > save:customrecord_nh_objection > save:customrecord_nh_objection > submitFields:opportunity > redirect',
   'call → objection → objection → opportunity submitFields last → redirect (' + order8.join(' > ') + ')');
var rp = state.redirect.parameters;
ok(state.redirect.type === 'opportunity' && state.redirect.id === '123' && state.redirect.isEditMode === false, 'redirect to the opportunity in VIEW');
ok(rp.nsqs === 'upd' && rp.nsq === 'ok' && /^\d{10}$/.test(rp.nsqt) && rp.nsqc === '5000' && rp.nsqo === '2' && rp.nsqf === 'entitystatus,next_contact' && !('nsqof' in rp),
   'nsqs=upd, nsq=ok, nsqc=<call id>, nsqo=2, nsqf');
ok(Object.keys(rp).every(function (k) { return /^[a-z0-9_,]*$/.test(rp[k]); }), 'codes only');
var call = writesOf('create', 'phonecall')[0].values;
ok(call.title === 'Quote follow up' && call.message === 'Customer wants to compare prices.' && call.status === 'COMPLETE' && call.company === '55' &&
   call.transaction === '123' && call.assigned === '7' && call.contact === '71' && call.startdate instanceof Date && iso(call.startdate) === TODAY,
   'phone call: title, message, startdate (Date), COMPLETE, company, transaction, assigned, contact');
var sub8 = writesOf('submitFields', 'opportunity')[0];
ok(sub8.options.enableSourcing === true, 'Status changed → enableSourcing true (lib rule kept)');
ok(audit('UpdateOppSL.Summary').some(function (l) { return /call 5000; objections created 2, failed none; fields changed entitystatus,next_contact, failed none/.test(l.details); }), 'summary audit line');
ok(audit('UpdateOppSL.Call').length === 1 && audit('UpdateOppSL.Objection').length === 2 && audit('UpdateOppSL.OppUpdate').length > 0 && audit('UpdateOppSL.Redirect').length === 1, 'audit keys Call, Objection, OppUpdate, Redirect');

console.log('T9. Objection record values');
var o = objections();
var callDateText = dmy(new Date());
ok(o.length === 2 && o[0].values.custrecord_nhobj_type === '12' && o[1].values.custrecord_nhobj_type === '11', 'one record per tick, in tick order');
ok(o[1].values.custrecord_nhobj_notes === 'Said £2k over budget\n\nCall notes (' + callDateText + '): Customer wants to compare prices.', 'notes with a per-objection note (D11)');
ok(o[0].values.custrecord_nhobj_notes === 'Call notes (' + callDateText + '): Customer wants to compare prices.', 'notes without a per-objection note (D11)');
ok(o.every(function (w) { return w.values.custrecord_nhobj_opportunity === '123' && w.values.custrecord_nhobj_quote === '901' && w.values.custrecord_nhobj_raised_by === '7' &&
    w.values.custrecord_nhobj_raised_on instanceof Date && iso(w.values.custrecord_nhobj_raised_on) === TODAY; }), 'opportunity, quote, raised by, raised on = the call date');
ok(o.every(function (w) { return !('custrecord_nhobj_group' in w.values) && !('custrecord_nhobj_customer' in w.values); }), '_group / _customer never set');
resetState();
var past = new Date(); past = new Date(past.getFullYear(), past.getMonth(), past.getDate() - 5);
post({ custpage_obj_sel: '["11"]', custpage_call_date: iso(past) });
ok(iso(objections()[0].values.custrecord_nhobj_raised_on) === iso(past) && objections()[0].values.custrecord_nhobj_notes.indexOf('Call notes (' + dmy(past) + ')') === 0, 'raised on and notes use the call date, not today');

console.log('T10. Phone call save throws');
resetState();
state.callSaveThrows = 'You do not have permission to create a phone call';
var f10 = post({ custpage_obj_sel: '["11","12"]', custpage_upd_entitystatus: '12' });
ok(objections().length === 0 && writesOf('submitFields').length === 0 && !state.redirect, 'no objections, no submitFields, no redirect');
ok(/Nothing was saved:<\/strong> You do not have permission to create a phone call/.test(html(f10)), 're-rendered "Nothing was saved"');
ok(/<option value="12" selected>Quoted<\/option>/.test(html(f10)) && /data-type-id="11" data-group="1" aria-pressed="true"/.test(html(f10)), 'entries restored');

console.log('T11. One of three objections throws');
resetState();
state.objSaveThrows['12'] = 'Record locked';
post({ custpage_obj_sel: '["11","12","21"]', custpage_upd_build_stage: '4' });
ok(objections().map(function (w) { return w.values.custrecord_nhobj_type; }).join(',') === '11,21', 'the other two created');
ok(writesOf('submitFields', 'opportunity').length === 1, 'fields still written');
ok(state.redirect.parameters.nsq === 'warn' && state.redirect.parameters.nsqof === '12' && state.redirect.parameters.nsqo === '2', 'nsq=warn, nsqof=12, nsqo=2');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'UpdateOppSL.Objection' && /Record locked/.test(l.details); }), 'failure logged');

console.log('T12. Field update throws');
resetState();
state.submitThrows = 'Field is read-only';
post({ custpage_obj_sel: '["11"]', custpage_upd_entitystatus: '12' });
ok(writesOf('create', 'phonecall').length === 1 && objections().length === 1, 'call and objection already exist');
ok(state.redirect.parameters.nsq === 'warn' && state.redirect.parameters.nsqff === 'entitystatus' && !/read-only/.test(JSON.stringify(state.redirect.parameters)), 'nsq=warn, nsqff; no error text in the URL');

console.log('T13. Never the sub-status or a forecast flag');
ok(ALL_WRITES.length > 15, 'writes recorded across all scenarios (' + ALL_WRITES.length + ')');
ok(ALL_WRITES.every(function (w) { return !('custbody_opportunity_sub_status' in w.values) && !('includeinforecast' in w.values) && w.type !== 'estimate'; }),
   'no write carries custbody_opportunity_sub_status or includeinforecast, and no Estimate is ever written');

console.log('T17. Governance, N = 25');
resetState();
state.types = [];
for (var g = 1; g <= 25; g++) state.types.push({ id: String(100 + g), name: 'Type ' + g, group: String(1 + (g % 7)), groupName: 'G' });
var all = state.types.map(function (t) { return t.id; });
state.units = 0;
post({ custpage_obj_sel: JSON.stringify(all), custpage_obj_quote: '901', custpage_call_contact: '71', custpage_upd_entitystatus: '12' });
ok(objections().length === 25 && !!state.redirect, '25 objections saved');
ok(state.units < 300, 'save used ' + state.units + ' units (< 300)');
resetState();
state.units = 0;
runGet();
ok(state.units <= 60, 'page load used ' + state.units + ' units');

// ─── T14–T16: Opportunity UE 1.3.0 banner ─────────────────────────────────────

var ue = loadModule('nuheat_opportunity_ue.js', modules);
function runUe(params, recId) {
    var buttons = [];
    var form = { addButton: function (b) { buttons.push(b); }, removeButton: function () {},
                 addPageInitMessage: function (m) { state.pageMessages.push(m); } };
    var rec = {
        id: recId || '123',
        getText: function (o) { return { entitystatus: 'Quoted', custbody_build_stage: 'Roof on' }[o.fieldId] || ''; },
        getValue: function (o) {
            return { custbody_next_contact: new Date(2026, 9, 12), expectedclosedate: new Date(2027, 0, 29),
                     custbody_master_proposal_url: 'https://acct.app.netsuite.com/core/media/media.nl?id=1&h=abc' }[o.fieldId];
        }
    };
    var thrown = null;
    try {
        ue.beforeLoad({ type: 'view', UserEventType: { VIEW: 'view', EDIT: 'edit' }, newRecord: rec, form: form,
                        request: params ? { parameters: params } : undefined });
    } catch (e) { thrown = e; }
    return { buttons: buttons, thrown: thrown, msg: state.pageMessages[state.pageMessages.length - 1] };
}
var NOW = String(Math.floor(Date.now() / 1000));

console.log('T14. UE, upd: valid codes');
resetState();
var u14 = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqc: '4001', nsqo: '2', nsqf: 'entitystatus,next_contact' });
ok(u14.msg && u14.msg.type === 'confirmation' && u14.msg.title === 'Opportunity updated', 'CONFIRMATION, "Opportunity updated"');
ok(u14.msg && u14.msg.message === 'Call logged: Quote follow up<br>2 objections logged<br>Opportunity updated: Status → Quoted · Next contact → 12/10/2026',
   'call title from the record, "2 objections logged", field line (' + (u14.msg && u14.msg.message) + ')');
ok(u14.msg && !/View proposal|href/.test(u14.msg.message), 'no proposal link');
ok(u14.buttons.map(function (b) { return b.id + ':' + b.functionName; }).join(',') === 'custpage_send_quote:openSendQuoteSuitelet,custpage_update_opp:openUpdateOppSuitelet', 'two buttons, in order');
resetState();
var u14b = runUe({ nsqs: 'upd', nsq: 'warn', nsqt: NOW, nsqc: '4001', nsqo: '1', nsqof: '12', nsqff: 'build_stage' });
ok(u14b.msg && u14b.msg.type === 'warning' && u14b.msg.title === 'Opportunity updated — but not everything saved', 'WARNING title');
ok(u14b.msg && u14b.msg.message.indexOf('Please set Build stage on this record.<br>Objections not saved: Cheaper competitor quote.<br>Call logged: Quote follow up<br>1 objection logged') === 0,
   'warnings first: fields, objections (names from the record); then the call and count (' + (u14b.msg && u14b.msg.message) + ')');
resetState();
var u14c = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqc: '4001', nsqo: '0', nsqf: 'close_date' });
ok(u14c.msg && u14c.msg.message === 'Call logged: Quote follow up<br>Opportunity updated: Expected close → 29/01/2027', 'zero objections → no objection line; Expected close from the record');
resetState();
var u14d = runUe({ nsqs: 'upd', nsq: 'warn', nsqt: NOW, nsqc: '4001', nsqof: '11' });
ok(u14d.msg && /Objections not saved: Price too high\./.test(u14d.msg.message) && !/&amp;lt;|&lt;b/.test(u14d.msg.message), 'objection names decoded and stripped');

console.log('T15. UE: foreign call, non-type IDs, unknown source');
resetState();
var u15 = runUe({ nsqs: 'upd', nsq: 'warn', nsqt: NOW, nsqc: '4002', nsqo: '<b>', nsqof: '950,abc,<script>,12' });
ok(u15.msg && !/Call logged|Other opp call/.test(u15.msg.message), 'a call linked to another opportunity is dropped');
ok(u15.msg && /Objections not saved: Cheaper competitor quote\./.test(u15.msg.message) && !/950|abc|script/i.test(u15.msg.message), 'only real Objection Type IDs are named; nothing echoed');
ok(u15.msg && !/objections? logged/.test(u15.msg.message), 'non-numeric count → no line');
resetState();
var u15b = runUe({ nsqs: 'hack<script>', nsq: 'ok', nsqt: NOW, nsqc: '4001', nsqo: '2', nsqf: 'entitystatus' });
ok(u15b.msg && u15b.msg.title === 'Proposal sent' && !/Call logged|objection/.test(u15b.msg.message) && !/hack|script/.test(u15b.msg.message + u15b.msg.title),
   'unknown nsqs → treated as send; never echoed');
resetState();
runUe({ nsqs: 'upd', nsq: 'ok', nsqt: String(Math.floor(Date.now() / 1000) - 301), nsqc: '4001' });
ok(state.pageMessages.length === 0, 'stale (301 s) → no banner');
resetState();
var u15c = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqc: '4001' }, '777');
ok(u15c.msg && !/Call logged/.test(u15c.msg.message), 'call shown only on its own opportunity');

console.log('T16. UE: no nsqs (old redirect) behaves as 1.2.1');
[
    { nsq: 'ok', nsqt: NOW, nsqf: 'entitystatus,next_contact', nsqfi: '1', nsqfx: '2' },
    { nsq: 'warn', nsqt: NOW, nsqff: 'build_stage', nsqqf: '902' },
    { nsq: 'ok', nsqt: NOW }
].forEach(function (pr, i) {
    resetState();
    var a1 = runUe(pr).msg;
    resetState();
    var withSend = {}; Object.keys(pr).forEach(function (k) { withSend[k] = pr[k]; }); withSend.nsqs = 'send';
    var a2 = runUe(withSend).msg;
    resetState();
    var withCall = {}; Object.keys(pr).forEach(function (k) { withCall[k] = pr[k]; }); withCall.nsqc = '4001'; withCall.nsqo = '3'; withCall.nsqof = '12';
    var a3 = runUe(withCall).msg;
    ok(a1 && JSON.stringify(a1) === JSON.stringify(a2) && JSON.stringify(a1) === JSON.stringify(a3), 'case ' + (i + 1) + ': identical with no nsqs, nsqs=send, and with upd-only codes ignored');
    ok(a1 && /^Proposal sent/.test(a1.title) && /View proposal<\/a>$/.test(a1.message), 'case ' + (i + 1) + ': Send Quote title and proposal link');
});
resetState();
var t16 = runUe({ nsq: 'ok', nsqt: NOW, nsqf: 'entitystatus,next_contact', nsqfi: '1', nsqfx: '2' }).msg;
ok(t16 && t16.message === 'Opportunity updated: Status → Quoted · Next contact → 12/10/2026<br>Forecast: 1 quote included, 2 excluded<br><a href="https://acct.app.netsuite.com/core/media/media.nl?id=1&amp;h=abc" target="_blank" rel="noopener">View proposal</a>',
   'exact 1.2.1 message for a Send Quote redirect');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
