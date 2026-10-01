/**
 * Tests for Update Opportunity SL 1.1.0 (+ nuheat_opp_update_lib.js 1.1.0, Opportunity UE 1.4.0).
 * T1–T17 from 1.0.0 (T1 and T3 adjusted for the new section numbering — marked "changed in 1.1.0"),
 * T18–T35 for 1.1.0.
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
        phoneCalls: { '4001': { title: 'Quote follow up', transaction: '123' }, '4002': { title: 'Other opp call', transaction: '777' } },
        // v1.1.0
        emails: [], emailThrows: null, cache: {}, cacheThrows: null,
        customerEmail: 'cust@example.com',
        employee: { firstname: 'Sam', lastname: 'Taylor', entityid: 'Sam Taylor', email: 'sam.taylor@nu-heat.co.uk', phone: '01404 549 770',
                    custentity_employee_photo_link: 'https://1234567.app.netsuite.com/core/media/media.nl?id=5&c=1234567&h=ab' },
        employeeThrows: null
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
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', PHONE_CALL: 'phonecall', EMPLOYEE: 'employee' },
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
        if (o.type === 'customer') return { email: state.customerEmail };   // v1.1.0
        if (o.type === 'employee') {                                        // v1.1.0: the sender
            if (state.employeeThrows) throw new Error(state.employeeThrows);
            var emp = {};
            o.columns.forEach(function (c) { emp[c] = state.employee[c] === undefined ? '' : state.employee[c]; });
            return emp;
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
    'N/ui/message': { Type: { CONFIRMATION: 'confirmation', WARNING: 'warning', INFORMATION: 'information' } },
    // v1.1.0: email.send (10 units) and N/cache (1 unit per get / put / remove)
    'N/email': {
        send: function (o) {
            charge(10);
            state.calls.push('email.send');
            if (state.emailThrows) throw new Error(state.emailThrows);
            state.emails.push(o);
        }
    },
    'N/cache': {
        Scope: { PRIVATE: 'PRIVATE', PROTECTED: 'PROTECTED', PUBLIC: 'PUBLIC' },
        getCache: function (o) {
            if (state.cacheThrows) throw new Error(state.cacheThrows);
            state.cacheName = o.name; state.cacheScope = o.scope;
            return {
                get:    function (g) { charge(1); state.calls.push('cache.get'); return Object.prototype.hasOwnProperty.call(state.cache, g.key) ? state.cache[g.key].value : null; },
                put:    function (p) { charge(1); state.calls.push('cache.put'); state.cache[p.key] = { value: p.value, ttl: p.ttl }; },
                remove: function (r) { charge(1); state.calls.push('cache.remove'); delete state.cache[r.key]; }
            };
        }
    }
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
var tokenSeq = 0;
function post(overrides) {
    var p = {
        custpage_opportunity_id: '123',
        // v1.1.0: what a 1.1 page posts — call on, email off, the browser's today, a fresh token
        custpage_call_on: 'T', custpage_email_on: 'F', custpage_today: TODAY, custpage_save_token: 'tok-test-' + (++tokenSeq),
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
    Object.keys(overrides || {}).forEach(function (k) { if (overrides[k] === undefined) delete p[k]; else p[k] = overrides[k]; });
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
// changed in 1.1.0: a new section 2 "Send an email"; Update the opportunity is 3, objections 4 (was 1, 2, 3)
var i1 = h1.indexOf('Log the call'), i1e = h1.indexOf('Send an email<label'), i2 = h1.indexOf('Update the opportunity</h2>'), i3 = h1.indexOf('Log any objections');
ok(i1 > 0 && i1e > i1 && i2 > i1e && i3 > i2, 'sections in order: 1 Log the call → 2 Send an email → 3 Update the opportunity → 4 Log any objections');
ok(/<span class="nsq-num">1<\/span>Log the call/.test(h1) && /<span class="nsq-num">2<\/span>Send an email/.test(h1) && /<span class="nsq-num">3<\/span>Update the opportunity/.test(h1) && /<span class="nsq-num">4<\/span>Log any objections/.test(h1), 'numbered 1, 2, 3, 4');
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
// changed in 1.1.0: the helper text (D21 — the 1.0 line about call notes is dropped)
ok(/id="nsq-send" disabled>Save<\/button>/.test(h1) && /Optional\. Add a note to any objection if it helps\./.test(h1) && !/Each objection also stores the call notes/.test(h1), 'Save starts disabled; helper text');

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
ok(/Not saved\.<\/strong> Next contact is required — the opportunity has none\. Set it in step 3\./.test(h3), 'error panel');   // changed in 1.1.0: step 3 (was 2)
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

// ─── T18–T32, T35: Update Opportunity 1.1.0 ───────────────────────────────────

var LIB = modules['./nuheat_opp_update_lib'];
function addDays(n) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
/** A 1.1 page with the email on: one contact ticked, no customer, no extras, no CC me, unless overridden. */
function emailPost(overrides) {
    var p = {
        custpage_email_on: 'T', custpage_email_subject: 'An update on OPP123', custpage_email_message: 'Hello Ann,\n\nThe quote is attached to your account.',
        custpage_rcpt_contacts: '71', custpage_rcpt_customer: 'F', custpage_rcpt_extra: '', custpage_rcpt_ccme: 'F'
    };
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });
    return post(p);
}
var CALL_OFF_GARBAGE = { custpage_call_on: 'F', custpage_call_title: '', custpage_call_notes: '', custpage_call_date: 'not a date', custpage_call_contact: '999' };
function rparams() { return state.redirect ? state.redirect.parameters : {}; }

console.log('T18. Call off, email off, nothing ticked, no field change → D23 blocks');
resetState();
var f18 = post({ custpage_call_on: 'F' });
ok(nothingWritten() && state.emails.length === 0, 'nothing written, nothing sent, no redirect');
ok(/Not saved\.<\/strong> Log a call, send an email, tick an objection or change a field\./.test(html(f18)), 'reason: "Log a call, send an email, tick an objection or change a field."');
ok(Object.keys(state.cache).length === 0, 'the save token is not consumed');
ok(/<input type="checkbox" id="nsq-call-on"> Log a phone call<\/label><span class="nsq-off" id="nsq-call-off">Off<\/span>/.test(html(f18)) &&
   /<div id="nsq-call-body" hidden>/.test(html(f18)) && /name="custpage_call_on" id="nsq-call-on-val" value="F"/.test(html(f18)), 're-rendered with the call switch still off');

console.log('T19. Call off; one field changed; Next contact set');
resetState();
post({ custpage_call_on: 'F', custpage_upd_entitystatus: '12' });
ok(writesOf('create', 'phonecall').length === 0 && state.calls.indexOf('create:phonecall') === -1, 'no phone call');
ok(writesOf('submitFields', 'opportunity').length === 1 && writesOf('submitFields', 'opportunity')[0].values.entitystatus === '12', 'fields written');
ok(state.redirect && !('nsqc' in rparams()) && rparams().nsqs === 'upd' && rparams().nsqf === 'entitystatus' && !('nsqe' in rparams()), 'redirect without nsqc or nsqe');
ok(audit('UpdateOppSL.Summary').some(function (l) { return /call off; objections created 0, failed none; fields changed entitystatus, failed none; email off$/.test(l.details); }), 'summary: call off, email off');

console.log('T20. Call off; posted call fields are garbage → ignored');
resetState();
var p20 = {}; Object.keys(CALL_OFF_GARBAGE).forEach(function (k) { p20[k] = CALL_OFF_GARBAGE[k]; }); p20.custpage_upd_build_stage = '4';
post(p20);
ok(!!state.redirect && writesOf('create', 'phonecall').length === 0, 'saved; no call; bad title / notes / date / contact not validated');
ok(state.logs.every(function (l) { return l.title !== 'UpdateOppSL.Validation'; }), 'no validation rejection logged');

console.log('T21. custpage_call_on missing → 1.0 behaviour (call required)');
resetState();
var f21 = post({ custpage_call_on: undefined, custpage_call_title: '' });
ok(nothingWritten() && /Enter a call title\./.test(html(f21)), 'missing switch + blank title → blocked as 1.0');
resetState();
post({ custpage_call_on: undefined, custpage_email_on: undefined, custpage_today: undefined, custpage_save_token: undefined });
ok(writesOf('create', 'phonecall').length === 1 && rparams().nsqc === '5000', 'a 1.0 page (none of the new fields) → call created, nsqc set');

console.log('T22. Email on, happy path: 2 contacts + customer + 1 extra + CC me');
resetState();
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'Cat@Example.com' });
var g22 = html(runGet());
ok(/<span class="nsq-num">2<\/span>Send an email<label class="nsq-switch"><input type="checkbox" id="nsq-email-on"> Send an email<\/label><span class="nsq-off" id="nsq-email-off">Off<\/span>/.test(g22) &&
   /<div id="nsq-email-body" hidden>/.test(g22), 'GET: email switch off, section collapsed, "Off" shown');
ok(/<input type="checkbox" id="nsq-call-on" checked> Log a phone call/.test(g22) && /<div id="nsq-call-body">/.test(g22), 'GET: call switch on');
ok(/id="nsq-email-subject" name="custpage_email_subject" maxlength="120" autocomplete="off" value="An update on OPP123"/.test(g22), 'GET: subject pre-filled "An update on <tranid>", max 120');
ok(/name="custpage_email_message" rows="8" maxlength="10000"/.test(g22), 'GET: message max 10,000');
ok(/<input type="checkbox" class="nsq-rcpt" data-contact-id="71" data-email="ann@example\.com"> Ann Lee/.test(g22) && !/data-contact-id="72"/.test(g22) &&
   /data-customer="1" data-email="cust@example\.com"> Customer/.test(g22) && /id="nsq-rcpt-ccme"> CC me/.test(g22), 'GET: ticks for contacts with an email, Customer, CC me');
ok(/Sent from you, with your contact details\. Replies come to you\./.test(g22), 'GET: the sender note');
ok(/name="custpage_save_token" value="u7-[a-z0-9]+-[a-z0-9]+"/.test(g22) && /name="custpage_today" id="nsq-today" value="\d{4}-\d{2}-\d{2}"/.test(g22), 'GET: save token and today hidden fields');
var s22 = scripts(g22);
ok(s22.length === 1 && !/example\.com|Ann|Cat|OPP123|An update/.test(s22[0]), 'GET: no record data in the script');
var parsed22 = true; try { new vm.Script(s22[0]); } catch (e) { parsed22 = false; console.log('     ' + e.message); }
ok(parsed22, 'GET: the script parses');
ok(state.calls.indexOf('lookupFields:employee:firstname,lastname,entityid,email,phone,custentity_employee_photo_link') === -1, 'GET: no employee lookup');
resetState();
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'Cat@Example.com' });
emailPost({ custpage_rcpt_contacts: '71,73', custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'extra@example.org; ANN@example.com', custpage_rcpt_ccme: 'T' });
var e22 = state.emails[0] || {};
ok(state.emails.length === 1, 'email.send once');
ok(e22.author === '7', 'author = the current user (7)');
ok(JSON.stringify(e22.recipients) === JSON.stringify(['ann@example.com', 'Cat@Example.com', 'cust@example.com', 'extra@example.org']),
   'To = 4 addresses rebuilt server-side, de-duplicated case-insensitively (' + JSON.stringify(e22.recipients) + ')');
ok(JSON.stringify(e22.cc) === JSON.stringify(['sam.taylor@nu-heat.co.uk']) && !e22.bcc, 'CC = the sender; no BCC');
ok(e22.relatedRecords && e22.relatedRecords.entityId === '55' && e22.relatedRecords.transactionId === '123', 'relatedRecords = customer + opportunity');
ok(e22.subject === 'An update on OPP123' && !e22.attachments, 'subject as typed; no attachments');
ok(rparams().nsqe === 'sent' && rparams().nsqen === '4' && rparams().nsq === 'ok', 'nsqe=sent, nsqen=4, nsq=ok');
var el22 = audit('UpdateOppSL.Email');
ok(el22.length >= 1 && el22.every(function (l) { return !/@/.test(l.details); }) && el22.some(function (l) { return /email sent OK to 5 addresses/.test(l.details); }), 'UpdateOppSL.Email audit: count, never an address');
ok(audit('UpdateOppSL.Summary').some(function (l) { return /; email sent \(4 recipients\)$/.test(l.details); }), 'summary: email sent (4 recipients)');
resetState();
emailPost({ custpage_rcpt_extra: 'sam.taylor@NU-HEAT.co.uk', custpage_rcpt_ccme: 'T' });
ok(state.emails.length === 1 && !state.emails[0].cc && rparams().nsqen === '2', 'sender already in To → no CC; nsqen counts To only');

console.log('T23. Recipient rules → blocked, nothing written');
[['a contact not on the opportunity', { custpage_rcpt_contacts: '999' }, 'A chosen contact is not on this opportunity.'],
 ['a contact with no email', { custpage_rcpt_contacts: '72' }, 'A chosen contact has no valid email address.'],
 ['a non-numeric contact ID', { custpage_rcpt_contacts: '71,<b>' }, 'A chosen contact is not on this opportunity.'],
 ['a bad extra address', { custpage_rcpt_extra: 'ok@example.com, not-an-email' }, 'These addresses are not valid: not-an-email'],
 ['11 recipients', { custpage_rcpt_contacts: '', custpage_rcpt_extra: 'a1@x.com,a2@x.com,a3@x.com,a4@x.com,a5@x.com,a6@x.com;a7@x.com,a8@x.com,a9@x.com,a10@x.com,a11@x.com' }, 'Send to 10 addresses or fewer (11 chosen).'],
 ['no recipients', { custpage_rcpt_contacts: '' }, 'Choose at least one recipient.'],
 ['customer ticked, no customer email', { custpage_rcpt_customer: 'T', __noCustEmail: true }, 'The customer has no valid email address.'],
 ['blank subject', { custpage_email_subject: '  ' }, 'Enter a subject for the email.'],
 ['subject over 120', { custpage_email_subject: new Array(122).join('s') }, 'The subject is longer than 120 characters.'],
 ['blank message', { custpage_email_message: ' \n ' }, 'Write the email message.'],
 ['message over 10,000', { custpage_email_message: new Array(10002).join('m') }, 'The message is longer than 10000 characters.']
].forEach(function (c) {
    resetState();
    if (c[1].__noCustEmail) { state.customerEmail = ''; delete c[1].__noCustEmail; }
    var f = emailPost(c[1]);
    ok(nothingWritten() && state.emails.length === 0 && html(f).indexOf(c[2]) !== -1 && Object.keys(state.cache).length === 0,
       c[0] + ' → blocked, nothing sent or written, token kept');
});
resetState();
var ten = []; for (var t23 = 1; t23 <= 10; t23++) ten.push('b' + t23 + '@x.com');
emailPost({ custpage_rcpt_contacts: '', custpage_rcpt_extra: ten.join(',') + ',B1@X.com' });
ok(state.emails.length === 1 && state.emails[0].recipients.length === 10, '10 addresses (an 11th duplicate collapses) → sent');
resetState();
var f23r = emailPost({ custpage_rcpt_contacts: '71', custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'x@y.com, bad', custpage_rcpt_ccme: 'T', custpage_email_message: 'Keep <this> & that' });
var h23r = html(f23r);
ok(/<input type="checkbox" id="nsq-email-on" checked>/.test(h23r) && /<div id="nsq-email-body">/.test(h23r) && /name="custpage_email_on" id="nsq-email-on-val" value="T"/.test(h23r), 'restored: email switch on');
ok(/data-contact-id="71" data-email="ann@example\.com" checked>/.test(h23r) && /data-customer="1" data-email="cust@example\.com" checked>/.test(h23r) &&
   /id="nsq-rcpt-ccme" checked>/.test(h23r) && /name="custpage_rcpt_extra" autocomplete="off" placeholder="[^"]*" value="x@y\.com, bad"/.test(h23r), 'restored: ticks, CC me and extras');
ok(/value="An update on OPP123"/.test(h23r) && />Keep &lt;this&gt; &amp; that<\/textarea>/.test(h23r), 'restored: subject and message, escaped');

console.log('T24. The sender has no employee email');
resetState();
state.employee.email = '';
var f24 = emailPost({});
ok(nothingWritten() && state.emails.length === 0 && /Your employee record has no email address, so the email can’t be sent from you\./.test(html(f24)), 'blocked with the D18 message');
resetState();
state.employeeThrows = 'Permission violation';
var f24b = emailPost({});
ok(nothingWritten() && /Your employee record could not be read/.test(html(f24b)), 'employee lookup fails → blocked');

console.log('T25. Order with everything on');
resetState();
emailPost({ custpage_obj_sel: '["11","12"]', custpage_upd_entitystatus: '12' });
var o25 = state.calls.filter(function (c) { return /^(cache\.put|save:|email\.send|submitFields|redirect)/.test(c); });
ok(o25.join(' > ') === 'cache.put > save:phonecall > email.send > save:customrecord_nh_objection > save:customrecord_nh_objection > submitFields:opportunity > redirect',
   'guard → call → email → objections → opportunity submitFields last (' + o25.join(' > ') + ')');
ok(rparams().nsqc === '5000' && rparams().nsqo === '2' && rparams().nsqe === 'sent' && rparams().nsqen === '1' && rparams().nsqf === 'entitystatus', 'all codes present');
ok(Object.keys(rparams()).every(function (k) { return /^[a-z0-9_,]*$/.test(rparams()[k]); }), 'codes only — no subject, address or error text');

console.log('T26. email.send throws');
resetState();
state.emailThrows = 'SMTP refused';
emailPost({ custpage_obj_sel: '["11"]', custpage_upd_entitystatus: '12' });
ok(state.calls.filter(function (c) { return c === 'email.send'; }).length === 1, 'tried once — no retry');
ok(objections().length === 1 && writesOf('submitFields', 'opportunity').length === 1, 'objections and fields still written');
ok(rparams().nsqe === 'fail' && rparams().nsq === 'warn' && !('nsqen' in rparams()) && !/SMTP/.test(JSON.stringify(rparams())), 'nsqe=fail, nsq=warn, no count, no error text');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'UpdateOppSL.Email' && /FAILED \(1 address\): SMTP refused/.test(l.details); }), 'UpdateOppSL.Email logged at error level');

console.log('T27. The call fails with the email on');
resetState();
state.callSaveThrows = 'No permission';
var f27 = emailPost({ custpage_obj_sel: '["11"]', custpage_upd_entitystatus: '12', custpage_save_token: 'tok-fixed-27' });
ok(state.emails.length === 0 && state.calls.indexOf('email.send') === -1, 'no email sent');
ok(objections().length === 0 && writesOf('submitFields').length === 0 && !state.redirect, 'nothing written');
ok(!('tok-fixed-27' in state.cache) && state.calls.indexOf('cache.remove') !== -1, 'token removed');
ok(/Nothing was saved:<\/strong> No permission/.test(html(f27)) && /name="custpage_save_token" value="tok-fixed-27"/.test(html(f27)), '"Nothing was saved"; the page keeps its token');

console.log('T28. The email body');
var MSG28 = 'Hi <script>alert(1)</script> & {{KEY}}\nline two, long enough to be cut for the preheader\n\n\n  Para two {{PROPOSAL_URL}}';
var SUBJ28 = '<b>Q&A</b> {{TRAN_ID}}';
resetState();
emailPost({ custpage_email_subject: SUBJ28, custpage_email_message: MSG28 });
var b28 = state.emails[0] ? String(state.emails[0].body) : '';
ok(state.emails[0] && state.emails[0].subject === SUBJ28, 'subject sent as typed (plain text)');
var SUBJ28_HTML = '&lt;b&gt;Q&amp;A&lt;/b&gt; &#123;&#123;TRAN_ID}}';
ok(b28.indexOf('<title>' + SUBJ28_HTML + '</title>') !== -1 && /<h1 class="h1"[^>]*><font [^>]*>&lt;b&gt;Q&amp;A&lt;\/b&gt; &#123;&#123;TRAN_ID\}\}<\/font><\/h1>/.test(b28), 'subject = headline (and title), escaped, {{ neutralised');
ok(b28.indexOf('<script') === -1 && b28.indexOf('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#123;&#123;KEY}}<br>line two, long enough to be cut for the preheader</font></p>') !== -1, 'message escaped; <script>, & and {{KEY}} literal; single newline → <br>');
ok(!/\{\{/.test(b28), 'no "{{" left anywhere in the body');
var paras28 = b28.match(/<p style="margin:0 0 16px 0;[^"]*text-align:left;"><font [^>]*>[\s\S]*?<\/font><\/p>/g) || [];
ok(paras28.length === 2 && /Para two &#123;&#123;PROPOSAL_URL\}\}<\/font><\/p>$/.test(paras28[1]), 'blank lines → a new paragraph (2 paragraphs)');
ok(/<font [^>]*>Best wishes,<br>Sam Taylor<\/font><\/p>/.test(b28) && b28.indexOf('Best wishes,') > b28.indexOf('Para two'), 'sign-off directly under the body: Best wishes, Sam Taylor');
ok(/<b>A MESSAGE FROM NU-HEAT<\/b>/.test(b28) && /<b>YOUR NU-HEAT CONTACT<\/b>/.test(b28) && !/YOUR ACCOUNT MANAGER|YOUR QUOTE IS READY|requested a quote/.test(b28), 'labels: A MESSAGE FROM NU-HEAT, YOUR NU-HEAT CONTACT; no proposal copy');
ok(/<b>CALL SAM<\/b>/.test(b28) && /<b>EMAIL SAM<\/b>/.test(b28) && b28.indexOf('href="tel:01404549770"') !== -1 && b28.indexOf('href="mailto:sam.taylor@nu-heat.co.uk"') !== -1, 'CALL SAM → tel:, EMAIL SAM → mailto: (the sender)');
ok(b28.indexOf('<span class="cl-line">01404 549 770</span><span class="cl-sep"> · </span><span class="cl-line">sam.taylor@nu-heat.co.uk</span>') !== -1, 'card: the sender\'s phone (employee phone) and email');
ok(/<img src="https:\/\/1234567\.app\.netsuite\.com\/core\/media\/media\.nl\?id=5&amp;c=1234567&amp;h=ab" width="96"[^>]* alt="Sam Taylor"/.test(b28), 'card: the sender\'s photo');
ok(b28.indexOf('Any questions at all, just reply to this email – it comes straight to me. Sam</font></p>') !== -1, 'footer from the sender, with the first name');
var pre28 = (/<span style="display:none;[^"]*">([^<]*)<\/span>/.exec(b28) || [])[1];
ok(MSG28.replace(/\s+/g, ' ').trim().length > 90 && pre28 === LIB.escapeHtml(MSG28.replace(/\s+/g, ' ').trim().substring(0, 90)).replace(/\{\{/g, '&#123;&#123;'),
   'preheader: the first 90 characters of the message, plain text, escaped');
ok(state.calls.indexOf('lookupFields:employee:firstname,lastname,entityid,email,phone,custentity_employee_photo_link') !== -1 &&
   !state.calls.some(function (c) { return /custbody_sales_rep_phone|salesrep/.test(c); }), 'one employee lookup (the current user); no opportunity phone override read');
var w28 = b28.match(/<[a-z]+[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/gi) || [];
ok(w28.length === 1 && /^<span/.test(w28[0]) && (b28.match(/<!--\[if !mso\]><!-- -->/g) || []).length === 2, 'pitfall 25: only the preheader is display:none; one [if !mso]/[if mso] pair per button');
ok(/<table role="presentation" class="width600 main-container" width="600" align="center"/.test(b28), 'container width="600" (attribute)');
resetState();
state.employee.firstname = ''; state.employee.lastname = ''; state.employee.entityid = ''; state.employee.phone = ''; state.employee.custentity_employee_photo_link = '';
emailPost({});
var b28b = state.emails[0] ? String(state.emails[0].body) : '';
ok(/<b>SEND AN EMAIL<\/b>/.test(b28b) && !/CALL|tel:/.test(b28b.replace(/CLICK TO CALL/g, '')), 'no first name, no phone → SEND AN EMAIL only, no tel:');
ok(b28b.indexOf('Any questions at all, just reply to this email – it comes straight to me.</font></p>') !== -1, 'footer without a first name');
ok(/Best wishes,<br>Nu-Heat<\/font>/.test(b28b) && b28b.indexOf('<span class="cl-sep">') === -1 && !/width="96"/.test(b28b), 'no name → "Nu-Heat"; card shows the email alone; no photo');

console.log('T29. Objection notes (D21)');
function notesFor(over, setup) {
    resetState();
    if (setup) setup();
    var p = { custpage_obj_sel: '["11","12"]', custpage_obj_note_11: 'Too dear' };
    Object.keys(over).forEach(function (k) { p[k] = over[k]; });
    if (p.custpage_email_on === 'T') emailPost(p); else post(p);
    return objections().map(function (w) { return w.values.custrecord_nhobj_notes; });
}
var TD = dmy(new Date());
var n29a = notesFor({});
ok(n29a[0] === 'Too dear\n\nCall notes (' + TD + '): Customer wants to compare prices.' && n29a[1] === 'Call notes (' + TD + '): Customer wants to compare prices.', 'call on → the D11 call-notes line, with and without a note');
var n29b = notesFor({ custpage_call_on: 'F', custpage_email_on: 'T', custpage_email_subject: 'Your heat pump options' });
ok(n29b[0] === 'Too dear\n\nEmail sent (' + TD + '): Your heat pump options' && n29b[1] === 'Email sent (' + TD + '): Your heat pump options', 'call off, email sent → "Email sent (<today>): <subject>", with and without a note');
var n29c = notesFor({ custpage_call_on: 'F' });
ok(n29c[0] === 'Too dear\n\nLogged via Update opportunity (' + TD + ')' && n29c[1] === 'Logged via Update opportunity (' + TD + ')', 'no call, no email → "Logged via Update opportunity (<today>)", with and without a note');
var n29d = notesFor({ custpage_call_on: 'F', custpage_email_on: 'T' }, function () { state.emailThrows = 'down'; });
ok(n29d[0] === 'Too dear\n\nLogged via Update opportunity (' + TD + ')' && n29d.every(function (n) { return !/Email sent/.test(n); }), 'email failed → never "Email sent"; the logged-via line');
var n29e = notesFor({ custpage_email_on: 'T' });
ok(/^Too dear\n\nCall notes \(/.test(n29e[0]), 'call and email both on → the call line wins');
ok([].concat(n29a, n29b, n29c, n29d, n29e).every(function (n) { return typeof n === 'string' && n.trim().length > 0; }), 'never empty (10 notes)');

console.log('T30. Raised on with the call off (D22)');
[['browser today = server today', iso(addDays(0)), iso(addDays(0))],
 ['browser today = server today + 1 (UK ahead)', iso(addDays(1)), iso(addDays(1))],
 ['server today + 2', iso(addDays(2)), iso(addDays(0))],
 ['yesterday', iso(addDays(-1)), iso(addDays(0))],
 ['invalid (30 Feb)', '2026-02-30', iso(addDays(0))],
 ['garbage', 'today', iso(addDays(0))],
 ['missing', undefined, iso(addDays(0))]
].forEach(function (c) {
    resetState();
    post({ custpage_call_on: 'F', custpage_obj_sel: '["11"]', custpage_today: c[1] });
    var w = objections()[0];
    ok(w && iso(w.values.custrecord_nhobj_raised_on) === c[2] && w.values.custrecord_nhobj_notes === 'Logged via Update opportunity (' + dmy(w.values.custrecord_nhobj_raised_on) + ')',
       c[0] + ' → raised on ' + c[2] + ', same date in the note');
});
resetState();
var past30 = addDays(-4);
post({ custpage_obj_sel: '["11"]', custpage_call_date: iso(past30), custpage_today: iso(addDays(1)) });
ok(iso(objections()[0].values.custrecord_nhobj_raised_on) === iso(past30), 'call on → raised on = the call date (D10), custpage_today ignored');

console.log('T31. Save guard (D25)');
resetState();
post({ custpage_upd_entitystatus: '12', custpage_save_token: 'tok-fixed-31' });
ok(state.cacheName === 'nh_update_opp_save_guard' && state.cacheScope === 'PRIVATE' && state.cache['tok-fixed-31'] && state.cache['tok-fixed-31'].ttl === 3600, 'token put: own cache name, PRIVATE scope, TTL 1 hour');
var writes31 = state.writes.length;
state.redirect = null; state.calls = [];
post({ custpage_upd_entitystatus: '12', custpage_save_token: 'tok-fixed-31', custpage_email_on: 'T', custpage_email_subject: 'x', custpage_email_message: 'y', custpage_rcpt_contacts: '71' });
ok(state.writes.length === writes31 && state.emails.length === 0 && state.calls.indexOf('create:phonecall') === -1, 'second POST with the same token → nothing written or sent');
ok(rparams().nsqs === 'upd' && rparams().nsq === 'dup' && /^\d{10}$/.test(rparams().nsqt) && Object.keys(rparams()).length === 3, 'redirect nsqs=upd, nsq=dup, nsqt only');
ok(audit('UpdateOppSL.Guard').some(function (l) { return /duplicate save/.test(l.details); }), 'Guard: duplicate logged');
resetState();
state.callSaveThrows = 'locked';
post({ custpage_save_token: 'tok-fixed-31b' });
ok(!('tok-fixed-31b' in state.cache), 'a call failure frees the token');
state.callSaveThrows = null;
post({ custpage_save_token: 'tok-fixed-31b' });
ok(writesOf('create', 'phonecall').length === 1 && state.redirect && rparams().nsq === 'ok', '… so the corrected retry saves');
resetState();
var f31 = post({ custpage_call_title: '', custpage_save_token: 'tok-fixed-31c' });
ok(nothingWritten() && !('tok-fixed-31c' in state.cache) && state.calls.indexOf('cache.get') === -1, 'a validation failure never touches the cache');
ok(/name="custpage_save_token" value="tok-fixed-31c"/.test(html(f31)), 'the re-rendered page keeps the same token');
post({ custpage_save_token: 'tok-fixed-31c' });
ok(!!state.redirect && rparams().nsq === 'ok', '… and the corrected save goes through');
resetState();
post({ custpage_save_token: undefined });
ok(!!state.redirect && writesOf('create', 'phonecall').length === 1 && audit('UpdateOppSL.Guard').some(function (l) { return /no save token/.test(l.details); }), 'missing token (a 1.0 page) → allowed, logged');
resetState();
post({ custpage_save_token: 'bad token <x>' });
ok(!!state.redirect && Object.keys(state.cache).length === 0 && audit('UpdateOppSL.Guard').some(function (l) { return /no save token/.test(l.details); }), 'malformed token → treated as missing (never used as a key)');
resetState();
state.cacheThrows = 'cache down';
post({});
ok(!!state.redirect && state.logs.some(function (l) { return l.level === 'error' && l.title === 'UpdateOppSL.Guard' && /cache unavailable/.test(l.details); }), 'cache unavailable → saved without the guard, error logged');

console.log('T32. lib.pendingChanges agrees with updateFields');
var cases32 = [
    ['nothing changed', {}],
    ['Status changed', { custpage_upd_entitystatus: '12' }],
    ['two dates changed', { custpage_upd_next_contact: '2026-10-20', custpage_upd_del_date: '2026-12-01' }],
    ['blank never clears', { custpage_upd_del_date: '', custpage_upd_build_stage: '' }],
    ['invalid date', { custpage_upd_next_contact: '2026-02-30', custpage_upd_build_stage: '4' }],
    ['field not shown', { custpage_upd_fields: 'entitystatus', custpage_upd_build_stage: '4' }]
];
cases32.forEach(function (c) {
    resetState();
    var p = { custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage,close_date',
              custpage_upd_entitystatus: '10', custpage_orig_entitystatus: '10', custpage_origtxt_entitystatus: 'Proposal',
              custpage_upd_next_contact: '2026-10-01', custpage_orig_next_contact: '2026-10-01',
              custpage_upd_del_date: '2026-11-15', custpage_orig_del_date: '2026-11-15',
              custpage_upd_build_stage: '3', custpage_orig_build_stage: '3',
              custpage_upd_close_date: '2026-12-20', custpage_orig_close_date: '2026-12-20' };
    Object.keys(c[1]).forEach(function (k) { p[k] = c[1][k]; });
    var pend = LIB.pendingChanges(p);
    var res = LIB.updateFields('123', p, { logKey: 'T32' });
    var sub = writesOf('submitFields', 'opportunity')[0];
    ok(JSON.stringify(pend.changed) === JSON.stringify(res.changed) && (sub ? JSON.stringify(sub.values) === JSON.stringify(pend.values) : !pend.changed.length) && state.units <= 10,
       c[0] + ': same changes (' + pend.changed.map(function (x) { return x.key; }).join(',') + ') and the same values written');
});
resetState();
var u32 = state.units;
LIB.pendingChanges({ custpage_upd_fields: 'entitystatus', custpage_upd_entitystatus: '12', custpage_orig_entitystatus: '10' });
ok(state.units === u32 && state.calls.length === 0 && state.logs.length === 0, 'pendingChanges is pure: no units, calls or logs');

console.log('T35. Governance, worst case: call + email + 25 objections + fields');
resetState();
state.types = [];
for (var g35 = 1; g35 <= 25; g35++) state.types.push({ id: String(100 + g35), name: 'Type ' + g35, group: String(1 + (g35 % 7)), groupName: 'G' });
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@example.com' });
state.lookup.custbody_next_contact = '';
state.units = 0;
emailPost({ custpage_obj_sel: JSON.stringify(state.types.map(function (t) { return t.id; })), custpage_obj_quote: '901', custpage_call_contact: '71',
            custpage_rcpt_contacts: '71,73', custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'x@example.org', custpage_rcpt_ccme: 'T',
            custpage_upd_entitystatus: '12', custpage_upd_next_contact: '2026-10-20', custpage_upd_build_stage: '4' });
ok(objections().length === 25 && state.emails.length === 1 && !!state.redirect && rparams().nsq === 'ok', 'everything saved and sent');
ok(state.units < 300, 'save used ' + state.units + ' units (< 300)');
console.log('     ledger: ' + JSON.stringify(state.calls.reduce(function (m, c) { var k = c.replace(/:.*$/, ''); m[k] = (m[k] || 0) + 1; return m; }, {})));

// ─── T14–T16 (UE 1.3.0) and T33–T34 (UE 1.4.0): Opportunity UE banner ─────────────────────────────────────

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

console.log('T33. UE 1.4.0: email codes, dup, email-only titles');
resetState();
var u33a = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqe: 'sent', nsqen: '3', nsqo: '0' });
ok(u33a.msg && u33a.msg.type === 'confirmation' && u33a.msg.title === 'Email sent' && u33a.msg.message === 'Email sent to 3 recipients', 'email only, sent → "Email sent" / "Email sent to 3 recipients"');
resetState();
var u33a1 = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqe: 'sent', nsqen: '1' });
ok(u33a1.msg && u33a1.msg.message === 'Email sent to 1 recipient', 'singular');
resetState();
var u33b = runUe({ nsqs: 'upd', nsq: 'warn', nsqt: NOW, nsqe: 'fail', nsqo: '0' });
ok(u33b.msg && u33b.msg.type === 'warning' && u33b.msg.title === 'Email not sent' && u33b.msg.message === 'The email was not sent.', 'email only, failed → WARNING "Email not sent" / "The email was not sent."');
resetState();
var u33c = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqc: '4001', nsqe: 'sent', nsqen: '2', nsqo: '1', nsqf: 'entitystatus' });
ok(u33c.msg && u33c.msg.title === 'Opportunity updated' &&
   u33c.msg.message === 'Call logged: Quote follow up<br>Email sent to 2 recipients<br>1 objection logged<br>Opportunity updated: Status → Quoted',
   'with a call, objections and a field → 1.3.0 title; email line after the call (' + (u33c.msg && u33c.msg.message) + ')');
resetState();
var u33d = runUe({ nsqs: 'upd', nsq: 'warn', nsqt: NOW, nsqe: 'fail', nsqf: 'next_contact' });
ok(u33d.msg && u33d.msg.title === 'Opportunity updated — but not everything saved' && u33d.msg.message === 'The email was not sent.<br>Opportunity updated: Next contact → 12/10/2026',
   'email failed + a field changed → 1.3.0 warning title, the warning first');
resetState();
var u33e = runUe({ nsqs: 'upd', nsq: 'warn', nsqt: NOW, nsqe: 'fail', nsqof: '12' });
ok(u33e.msg && u33e.msg.title === 'Opportunity updated — but not everything saved', 'email failed + an objection failed → not "only an email"');
resetState();
var u33f = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqe: 'junk<script>', nsqen: '<b>9', nsqf: 'build_stage' });
ok(u33f.msg && u33f.msg.title === 'Opportunity updated' && u33f.msg.message === 'Opportunity updated: Build stage → Roof on' && !/junk|script|<b>|9/.test(JSON.stringify(u33f.msg)),
   'nsqe=junk → ignored; nothing echoed');
resetState();
var u33g = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqe: 'sent', nsqen: 'abc' });
ok(u33g.msg && u33g.msg.message === 'Email sent' && u33g.msg.title === 'Email sent', 'bad count → "Email sent" without a number');
resetState();
var u33h = runUe({ nsqs: 'upd', nsq: 'dup', nsqt: NOW });
ok(u33h.msg && u33h.msg.type === 'information' && u33h.msg.title === 'Already saved' && u33h.msg.message === 'This update had already been saved, so nothing was repeated.', 'nsq=dup → "Already saved"');
resetState();
var u33i = runUe({ nsqs: 'upd', nsq: 'dup', nsqt: NOW, nsqc: '4001', nsqe: 'sent', nsqen: '2', nsqf: 'entitystatus' });
ok(u33i.msg && u33i.msg.message === 'This update had already been saved, so nothing was repeated.', 'dup ignores any other codes');
resetState();
runUe({ nsqs: 'upd', nsq: 'dup', nsqt: String(Math.floor(Date.now() / 1000) - 301) });
ok(state.pageMessages.length === 0, 'dup older than 300 s → no banner');
resetState();
var u33j = runUe({ nsqs: 'upd', nsq: 'ok', nsqt: NOW, nsqc: '4001' });
ok(u33j.msg && u33j.msg.title === 'Opportunity updated' && u33j.msg.message === 'Call logged: Quote follow up', 'no nsqe → as 1.3.0');

console.log('T34. UE 1.4.0: a Send Quote banner ignores nsqe / nsqen / dup');
resetState();
var t34base = runUe({ nsq: 'ok', nsqt: NOW, nsqf: 'entitystatus', nsqfi: '1', nsqfx: '0' }).msg;
resetState();
var t34e = runUe({ nsq: 'ok', nsqt: NOW, nsqf: 'entitystatus', nsqfi: '1', nsqfx: '0', nsqe: 'fail', nsqen: '4' }).msg;
ok(t34base && JSON.stringify(t34base) === JSON.stringify(t34e) && /^Proposal sent$/.test(t34e.title), 'send + nsqe/nsqen → identical to without');
resetState();
var t34s = runUe({ nsqs: 'send', nsq: 'ok', nsqt: NOW, nsqe: 'sent', nsqen: '2' }).msg;
ok(t34s && t34s.title === 'Proposal sent' && !/Email/.test(t34s.message), 'nsqs=send + nsqe=sent → no email line, Send Quote title');
resetState();
runUe({ nsq: 'dup', nsqt: NOW });
runUe({ nsqs: 'send', nsq: 'dup', nsqt: NOW });
ok(state.pageMessages.length === 0, 'nsq=dup without nsqs=upd → no banner');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
