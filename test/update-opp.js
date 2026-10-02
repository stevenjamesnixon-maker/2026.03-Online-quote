/**
 * Tests for Update Opportunity SL 1.1.0 (+ nuheat_opp_update_lib.js 1.1.0, Opportunity UE 1.4.0).
 * T1–T17 from 1.0.0 (T1 and T3 adjusted for the new section numbering — marked "changed in 1.1.0"),
 * T18–T51 for 1.1.0 (T36–T37: amendment 1; T38–T46: amendment 2; T47–T51: amendment 3).
 * T52–T62 for 1.2.0 ("Request an update" part B: the "Give us an update" button; lib 1.3.0).
 * T63–T67 for 1.2.1 (amendment 1: custscript_nuheat_updbtn_mode — OFF / ADMIN / ALL). T52–T62 run with ALL.
 * T74–T81 for 1.3.0 (the v2 customer email design, lib 1.4.0); T28, T37, T41, T42, T45, T60, T61, T69, T70 updated for it.
 * T68–T73 for 1.2.2 (amendment 2: "Write an email" / "Request an update", custpage_email_kind). T52–T67 updated:
 * the tick box became the choice (custpage_email_updbtn=T → custpage_email_kind=update), and the fixed line now
 * appears only when an update request has no message.
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
        getText: function (o) { return ({ entitystatus: 'Proposal', entity: 'Customer Ltd' })[o.fieldId] || (state.oppTexts || {})[o.fieldId] || ''; },
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
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', PHONE_CALL: 'phonecall', EMPLOYEE: 'employee', CONTACT: 'contact' },
    Sort: { DESC: 'DESC', ASC: 'ASC' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        charge(1);
        state.calls.push('lookupFields:' + o.type + ':' + o.columns.join(','));
        if (o.type === 'opportunity') {
            var out = {};
            o.columns.forEach(function (c) {
                if (c === 'entity') out.entity = [{ value: state.oppValues.entity, text: 'Customer Ltd' }];
                else if (c === 'salesrep' || c === 'custbody_pe') {   // amendment 2: select fields → [{ value, text }] or []
                    out[c] = state.oppValues[c] ? [{ value: state.oppValues[c], text: (state.oppTexts || {})[c] || '' }] : [];
                }
                else out[c] = state.lookup[c] === undefined ? '' : state.lookup[c];
            });
            return out;
        }
        if (o.type === 'phonecall') {
            var pc = state.phoneCalls[o.id];
            if (!pc) throw new Error('no phone call ' + o.id);
            return { title: pc.title, transaction: [{ value: pc.transaction, text: 'Opportunity' }] };
        }
        if (o.type === 'customer') {   // v1.1.0: email; v1.2.0: + the dashboard columns (state.customer)
            var cu = { email: state.customerEmail };
            o.columns.forEach(function (c) { if (c !== 'email') cu[c] = (state.customer || {})[c] === undefined ? '' : state.customer[c]; });
            return cu;
        }
        if (o.type === 'contact') {    // v1.2.0: the dashboard contact's email
            if (!(state.dashContacts || {})[String(o.id)]) throw new Error('no contact ' + o.id);
            return { email: state.dashContacts[String(o.id)].email };
        }
        if (o.type === 'employee') {                                        // v1.1.0: the sender
            if (state.employeeThrows) throw new Error(state.employeeThrows);
            var emp = {};
            // amendment 2: other employees (rep, PE) by ID; the current user (7) is state.employee
            var src = String(o.id) === '7' ? state.employee : ((state.employees || {})[String(o.id)] || {});
            o.columns.forEach(function (c) { emp[c] = src[c] === undefined ? '' : src[c]; });
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
            rows = state.contacts.map(function (c) { return result({ internalid: c.id, firstname: c.first, lastname: c.last, email: c.email, company: c.company || '' }); });
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
    // v1.2.1: the role (state.roleId, default a sales role) and script parameters (state.scriptParams)
    'N/runtime': {
        getCurrentUser: function () { return { id: '7', name: 'Sam Taylor', roleId: (state && state.roleId !== undefined) ? state.roleId : 'customrole_nh_account_manager' }; },
        getCurrentScript: function () {
            return { id: 'x', deploymentId: 'y', getParameter: function (o) {
                state.calls.push('getParameter:' + o.name);
                if (state.paramThrows) throw new Error(state.paramThrows);
                return (state.scriptParams || {})[o.name];
            } };
        }
    },
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
ok(!state.calls.some(function (c) { return /^lookupFields:employee/.test(c); }), 'GET: no employee lookup');   // changed in amendment 3: any employee lookup (was: the old column list)
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
ok(b28.indexOf('Best wishes') === -1, 'no "Best wishes" sign-off (changed in 1.3.0: the sender card signs off)');
ok(/<b>An update from Nu-Heat<\/b>/.test(b28) && /<b>YOUR NU-HEAT CONTACT<\/b>/.test(b28) && !/YOUR ACCOUNT MANAGER|YOUR QUOTE IS READY|requested a quote/.test(b28), 'labels: An update from Nu-Heat (eyebrow), YOUR NU-HEAT CONTACT; no proposal copy');   // changed in 1.3.0 (was: A MESSAGE FROM NU-HEAT)
ok(/<b>CALL SAM<\/b>/.test(b28) && /<b>EMAIL SAM<\/b>/.test(b28) && b28.indexOf('href="tel:01404549770"') !== -1 && b28.indexOf('href="mailto:sam.taylor@nu-heat.co.uk"') !== -1, 'CALL SAM → tel:, EMAIL SAM → mailto: (the sender)');
ok(b28.indexOf('<span class="cl-line">01404 549 770</span><span class="cl-sep"> · </span><span class="cl-line">sam.taylor@nu-heat.co.uk</span>') !== -1, 'card: the sender\'s phone (employee phone) and email');
ok(/<img src="https:\/\/1234567\.app\.netsuite\.com\/core\/media\/media\.nl\?id=5&amp;c=1234567&amp;h=ab" width="96"[^>]* alt="Sam Taylor"/.test(b28), 'card: the sender\'s photo');
ok(b28.indexOf('You’re receiving this because you have a project with Nu-Heat.</font></p>') !== -1 && b28.indexOf('Any questions at all') === -1, 'footer: the v2 line (changed in 1.3.0: was the sender\'s "just reply" line)');
var pre28 = (/<span style="display:none;[^"]*">([^<]*)<\/span>/.exec(b28) || [])[1];
ok(MSG28.replace(/\s+/g, ' ').trim().length > 90 && pre28 === LIB.escapeHtml(MSG28.replace(/\s+/g, ' ').trim().substring(0, 90)).replace(/\{\{/g, '&#123;&#123;'),
   'preheader: the first 90 characters of the message, plain text, escaped');
ok(state.calls.indexOf('lookupFields:employee:firstname,lastname,entityid,email,phone,isinactive,custentity_employee_photo_link') !== -1 &&   // changed in amendment 3: + isinactive
   !state.calls.some(function (c) { return /custbody_sales_rep_phone/.test(c); }) &&
   state.calls.filter(function (c) { return /^lookupFields:opportunity:/.test(c) && !/custbody_next_contact/.test(c); }).join() === 'lookupFields:opportunity:entity,salesrep,custbody_pe',
   'one employee lookup (the current user); no opportunity phone override read');   // changed in amendment 2: the opportunity lookup now reads salesrep / custbody_pe for "From" (was: no salesrep anywhere)
var w28 = b28.match(/<[a-z]+[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/gi) || [];
ok(w28.length === 1 && /^<span/.test(w28[0]) && (b28.match(/<!--\[if !mso\]><!-- -->/g) || []).length === 2, 'pitfall 25: only the preheader is display:none; one [if !mso]/[if mso] pair per button');
ok(/<table role="presentation" class="width600 main-container" width="600" align="center"/.test(b28), 'container width="600" (attribute)');
resetState();
state.employee.firstname = ''; state.employee.lastname = ''; state.employee.entityid = ''; state.employee.phone = ''; state.employee.custentity_employee_photo_link = '';
emailPost({});
var b28b = state.emails[0] ? String(state.emails[0].body) : '';
ok(/<b>SEND AN EMAIL<\/b>/.test(b28b) && !/CALL|tel:/.test(b28b.replace(/CLICK TO CALL/g, '')), 'no first name, no phone → SEND AN EMAIL only, no tel:');
ok(b28b.indexOf('You’re receiving this because you have a project with Nu-Heat.</font></p>') !== -1, 'footer: the same line without a first name');   // changed in 1.3.0
ok(/<b>Nu-Heat<\/b>/.test(b28b) && b28b.indexOf('Best wishes') === -1 && b28b.indexOf('<span class="cl-sep">') === -1 && !/width="96"/.test(b28b), 'no name → "Nu-Heat" on the card; card shows the email alone; no photo');   // changed in 1.3.0: no sign-off

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
ok(ALL_WRITES.every(function (w) { return !('custbody_opportunity_sub_status' in w.values) && !('includeinforecast' in w.values) && w.type !== 'estimate'; }),
   'T13 re-checked across the 1.1.0 scenarios: no sub-status, no forecast flag, no Estimate write (' + ALL_WRITES.length + ' writes)');

console.log('T36. Re-render after a validation failure: a section that was off renders as a fresh GET');
resetState();
var CALL_UNPOSTED = { custpage_call_on: 'F', custpage_call_std: undefined, custpage_call_title: undefined, custpage_call_date: undefined,
                      custpage_call_contact: undefined, custpage_call_notes: undefined };
var f36a = post(CALL_UNPOSTED);   // call off, nothing else → D23 failure
var h36a = html(f36a);
ok(nothingWritten() && /Log a call, send an email/.test(h36a), '(a) call off + D23 failure → re-rendered');
ok(new RegExp('id="nsq-call-date" name="custpage_call_date" value="' + TODAY + '" max="' + TODAY + '" data-default="1"').test(h36a),
   '(a) the call date carries data-default="1" (and today), as a fresh GET');
ok(/name="custpage_call_title" maxlength="99" autocomplete="off" value=""/.test(h36a) && /name="custpage_call_notes" rows="5" maxlength="3900"><\/textarea>/.test(h36a) &&
   !/<option value="[^"]+" selected>/.test(h36a.split('id="nsq-call-body"')[1].split('</section>')[0]), '(a) the other call inputs are blank, nothing selected');
resetState();
var f36b = post({ custpage_call_title: '' });   // call on, email off (no email fields posted) → failure
var h36b = html(f36b);
ok(nothingWritten() && /Enter a call title\./.test(h36b), '(b) email off + a failure → re-rendered');
ok(/id="nsq-email-subject" name="custpage_email_subject" maxlength="120" autocomplete="off" value="An update on OPP123"/.test(h36b), '(b) subject = "An update on <tranid>"');
ok(/name="custpage_email_message" rows="8" maxlength="10000"><\/textarea>/.test(h36b) && !/class="nsq-rcpt"[^>]* checked/.test(h36b) && !/id="nsq-rcpt-ccme" checked/.test(h36b),
   '(b) message blank, no recipient ticked, CC me off');
resetState();
var past36 = iso(addDays(-3));
var f36c = emailPost({ custpage_call_date: past36, custpage_call_title: 'Kept title', custpage_rcpt_contacts: '' });   // call on → recipients failure
var h36c = html(f36c);
ok(nothingWritten() && /Choose at least one recipient\./.test(h36c), '(c) call on + a failure → re-rendered');
ok(new RegExp('id="nsq-call-date" name="custpage_call_date" value="' + past36 + '" max="' + TODAY + '"></div>').test(h36c) && /value="Kept title"/.test(h36c),
   '(c) the posted call date and title kept; no data-default');
resetState();
var f36d = emailPost({ custpage_email_subject: 'My own subject', custpage_email_message: 'My own message', custpage_rcpt_contacts: '71', custpage_rcpt_extra: 'bad' });
var h36d = html(f36d);
ok(nothingWritten() && /These addresses are not valid: bad/.test(h36d), '(d) email on + a failure → re-rendered');
ok(/value="My own subject"/.test(h36d) && />My own message<\/textarea>/.test(h36d) && /data-contact-id="71" data-email="ann@example\.com" checked>/.test(h36d),
   '(d) the posted subject, message and ticks kept');

console.log('T37. Building the email body throws → an email failure, the rest still saved (D24)');
resetState();
var realShell = LIB.emailShellV2;   // changed in 1.3.0 (was: emailShell)
LIB.emailShellV2 = function () { throw new Error('shell broke'); };
try {
    emailPost({ custpage_call_on: 'F', custpage_obj_sel: '["11"]', custpage_upd_entitystatus: '12' });
} finally {
    LIB.emailShellV2 = realShell;
}
ok(state.calls.indexOf('email.send') === -1 && state.emails.length === 0, 'no email.send');
ok(objections().length === 1 && writesOf('submitFields', 'opportunity').length === 1 && !!state.redirect, 'objections and fields still written; redirected');
ok(rparams().nsqe === 'fail' && rparams().nsq === 'warn' && !('nsqen' in rparams()), 'nsqe=fail, nsq=warn');
ok(objections()[0].values.custrecord_nhobj_notes === 'Logged via Update opportunity (' + dmy(new Date()) + ')', 'the context line is not "Email sent"');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'UpdateOppSL.Email' && /could not be built; not sent: shell broke/.test(l.details); }), 'UpdateOppSL.Email at error level with the message');
ok(audit('UpdateOppSL.Summary').some(function (l) { return /; email fail \(1 recipient\)$/.test(l.details); }), 'summary: email fail');

// ─── T38–T46: amendment 2 (D18a) — choose who the email is from ──────────────

/** The opportunity has a sales rep (81) and a project engineer (82), both with an email. */
function withTeam() {
    state.oppValues.salesrep = '81';
    state.oppValues.custbody_pe = '82';
    state.oppTexts = { salesrep: 'Rob <Rep>', custbody_pe: 'Pat & PE' };
    state.employees = {
        '81': { firstname: 'Rob', lastname: 'Rep', entityid: 'Rob Rep', email: 'rob.rep@nu-heat.co.uk', phone: '01404 111 222', custentity_employee_photo_link: 'https://x.example/rob.jpg' },
        '82': { firstname: 'Pat', lastname: 'Engineer', entityid: 'Pat Engineer', email: 'pat.pe@nu-heat.co.uk', phone: '01404 333 444', custentity_employee_photo_link: 'https://x.example/pat.jpg' }
    };
}
function fromOptions(h) { var out = []; h.replace(/<option value="(me|rep|pe)"( selected)?>([^<]*)<\/option>/g, function (m, c, sel, label) { out.push(c + (sel ? '*' : '') + '=' + label); }); return out; }

console.log('T38. GET: rep and PE set, both with email; I am neither');
resetState(); withTeam();
var h38 = html(runGet());
ok(fromOptions(h38).join(' | ') === 'me*=Me (Sam Taylor) | rep=Sales rep (Rob &lt;Rep&gt;) | pe=Project engineer (Pat &amp; PE)',
   'three options, labels escaped, me selected (' + fromOptions(h38).join(' | ') + ')');
ok(/<label class="nsq-label" for="nsq-email-from">From<\/label><select id="nsq-email-from" name="custpage_email_from"/.test(h38) &&
   h38.indexOf('id="nsq-email-from"') < h38.indexOf('id="nsq-email-subject"'), '"From" is the first field in Send an email; posts custpage_email_from');
var s38 = scripts(h38)[0];
ok(!/81|82|Rob|Pat|Sam Taylor|nu-heat\.co\.uk/.test(s38), 'no IDs, names or addresses in the <script>');
ok(/id="nsq-email-note" data-note-me="Sent from you, with your contact details\. Replies come to you\." data-note-pre="Sent as " data-note-post=", with their contact details\. Replies go to them\.">Sent from you, with your contact details\. Replies come to you\.<\/p>/.test(h38),
   'page note: the "me" text, with the other texts in data- attributes');
ok(!/value="81"|value="82"/.test(h38), 'no employee ID anywhere in the page values');
ok(state.calls.filter(function (c) { return /^lookupFields:employee:email,isinactive$/.test(c); }).length === 2, 'two email checks (rep, PE) at GET');   // changed in amendment 3: + isinactive, same lookup

console.log('T39. GET: I am the rep; PE empty');
resetState(); withTeam();
state.oppValues.salesrep = '7'; state.oppValues.custbody_pe = '';
var h39 = html(runGet());
ok(fromOptions(h39).join(' | ') === 'me*=Me (Sam Taylor)', 'only Me offered (' + fromOptions(h39).join(' | ') + ')');
ok(state.calls.filter(function (c) { return /^lookupFields:employee/.test(c); }).length === 0, 'no employee lookups (the rep is me; no PE)');
resetState(); withTeam();
state.oppValues.custbody_pe = '81';
ok(fromOptions(html(runGet())).join(' | ') === 'me*=Me (Sam Taylor) | rep=Sales rep (Rob &lt;Rep&gt;)', 'PE = the rep → PE not repeated');

console.log('T40. GET: the PE has no email');
resetState(); withTeam();
state.employees['82'].email = '';
ok(fromOptions(html(runGet())).join(' | ') === 'me*=Me (Sam Taylor) | rep=Sales rep (Rob &lt;Rep&gt;)', 'no pe option');

console.log('T41. POST from=rep');
resetState(); withTeam();
emailPost({ custpage_email_from: 'rep', custpage_rcpt_ccme: 'T' });
var e41 = state.emails[0] || {}; var b41 = String(e41.body || '');
ok(e41.author === '81', 'author = the rep (81)');
ok(b41.indexOf('Best wishes') === -1 && /<b>Rob Rep<\/b>/.test(b41) && /<b>CALL ROB<\/b>/.test(b41) && /<b>EMAIL ROB<\/b>/.test(b41) &&
   b41.indexOf('href="mailto:rob.rep@nu-heat.co.uk"') !== -1 && b41.indexOf('href="tel:01404111222"') !== -1 && /src="https:\/\/x\.example\/rob\.jpg"/.test(b41),
   'card: the rep (name, photo, phone, email, first name); no sign-off');   // changed in 1.3.0 (was: card and sign-off)
ok(!/Sam/.test(b41), 'nothing of me in the body');   // changed in 1.3.0: the footer no longer carries a first name
ok(JSON.stringify(e41.cc) === JSON.stringify(['sam.taylor@nu-heat.co.uk']) && !e41.bcc, 'CC = only me (CC me ticked)');
ok(audit('UpdateOppSL.Email').some(function (l) { return /from rep \(employee 81\)/.test(l.details); }) && audit('UpdateOppSL.Email').every(function (l) { return !/@/.test(l.details); }),
   'UpdateOppSL.Email: "from rep (employee 81)", never an address');
ok(state.calls.filter(function (c) { return /^lookupFields:opportunity:entity,salesrep,custbody_pe$/.test(c); }).length === 1, 'one opportunity lookup reads entity, salesrep and custbody_pe');
// changed in 1.2.0: nsqt (a Unix time) is left out of the check — it contains "81" at some times of day (a flake, not a leak)
var p41 = {}; Object.keys(rparams()).forEach(function (k) { if (k !== 'nsqt') p41[k] = rparams()[k]; });
ok(!/rob|Rob|81/.test(JSON.stringify(p41)) && /^\d+$/.test(rparams().nsqt) && rparams().nsqe === 'sent', 'banner codes unchanged: no name, code or ID in the URL');
resetState(); withTeam();
emailPost({ custpage_email_from: 'rep' });
ok(state.emails[0] && !state.emails[0].cc && !state.emails[0].bcc, 'CC me not ticked → no CC at all (the rep gets no copy)');

console.log('T42. POST from=pe');
resetState(); withTeam();
emailPost({ custpage_email_from: 'pe' });
var e42 = state.emails[0] || {}; var b42 = String(e42.body || '');
ok(e42.author === '82', 'author = the PE (82)');
ok(b42.indexOf('<span class="cl-line">01404 333 444</span><span class="cl-sep"> · </span><span class="cl-line">design@nu-heat.co.uk</span>') !== -1 &&
   b42.indexOf('href="mailto:design@nu-heat.co.uk"') !== -1 && /<b>EMAIL PAT<\/b>/.test(b42), 'card email line and EMAIL button = design@nu-heat.co.uk');
ok(/<b>Pat Engineer<\/b>/.test(b42) && b42.indexOf('Best wishes') === -1 && b42.indexOf('href="tel:01404333444"') !== -1, 'the PE\'s name and phone shown');
ok(b42.indexOf('pat.pe@') === -1, 'the PE\'s own address appears nowhere in the body');

console.log('T43. POST from=pe, the PE has no phone');
resetState(); withTeam();
state.employees['82'].phone = '';
emailPost({ custpage_email_from: 'pe' });
var b43 = state.emails[0] ? String(state.emails[0].body) : '';
ok(b43 && b43.indexOf('tel:') === -1 && !/CALL PAT|CLICK TO CALL/.test(b43) && b43.indexOf('01404 540604') === -1 && b43.indexOf('<span class="cl-sep">') === -1,
   'no CALL button, no switchboard number; the card shows design@ alone');

console.log('T44. Bad code, or the PE gone from the record → blocked, nothing written, token kept');
[['from=xyz', { custpage_email_from: 'xyz' }, function () {}, 'Choose who the email is from.'],
 ['from=pe, PE removed since GET', { custpage_email_from: 'pe' }, function () { state.oppValues.custbody_pe = ''; }, 'Project engineer has no email address on their employee record, so the email can’t be sent from them.'],
 ['from=rep, rep has no email', { custpage_email_from: 'rep' }, function () { state.employees['81'].email = ''; }, 'Sales rep has no email address on their employee record, so the email can’t be sent from them.']
].forEach(function (c) {
    resetState(); withTeam(); c[2]();
    var f = emailPost(c[1]);
    ok(nothingWritten() && state.emails.length === 0 && Object.keys(state.cache).length === 0 && html(f).indexOf(c[3]) !== -1, c[0] + ' → blocked: "' + c[3] + '"');
});
resetState(); withTeam();
var f44 = emailPost({ custpage_email_from: 'pe', custpage_rcpt_extra: 'bad' });
ok(/<option value="pe" selected>Project engineer \(Pat &amp; PE\)<\/option>/.test(html(f44)) &&
   />Sent as Project engineer \(Pat &amp; PE\), with their contact details\. Replies go to them\.<\/p>/.test(html(f44)), 're-render: the posted code restored (still offered), note to match');
resetState(); withTeam();
state.employees['82'].email = '';   // pe no longer offered on the re-render
var f44b = emailPost({ custpage_email_from: 'pe', custpage_rcpt_extra: 'bad' });
ok(/<option value="me" selected>/.test(html(f44b)) && !/value="pe"/.test(html(f44b)), 're-render: the posted code no longer offered → me');
resetState(); withTeam();
var f44c = post({ custpage_email_from: 'rep', custpage_call_title: '' });   // email off at submit (A1)
ok(/<option value="me" selected>/.test(html(f44c)), 're-render: email off → fresh, me');

console.log('T45. custpage_email_from missing (an in-flight page) → me');
resetState(); withTeam();
emailPost({ custpage_email_from: undefined, custpage_rcpt_ccme: 'T' });
ok(state.emails[0] && state.emails[0].author === '7' && /<b>Sam Taylor<\/b>/.test(String(state.emails[0].body)) &&   // changed in 1.3.0: the card, no sign-off
   JSON.stringify(state.emails[0].cc) === JSON.stringify(['sam.taylor@nu-heat.co.uk']), 'author = me; my card; CC me = me');

console.log('T46. Governance, worst case with from=pe and CC me');
resetState(); withTeam();
state.types = [];
for (var g46 = 1; g46 <= 25; g46++) state.types.push({ id: String(100 + g46), name: 'Type ' + g46, group: String(1 + (g46 % 7)), groupName: 'G' });
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@example.com' });
state.units = 0;
emailPost({ custpage_email_from: 'pe', custpage_obj_sel: JSON.stringify(state.types.map(function (t) { return t.id; })), custpage_obj_quote: '901', custpage_call_contact: '71',
            custpage_rcpt_contacts: '71,73', custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'x@example.org', custpage_rcpt_ccme: 'T',
            custpage_upd_entitystatus: '12', custpage_upd_next_contact: '', custpage_upd_build_stage: '4' });   // blank Next contact → the record check runs too
ok(objections().length === 25 && state.emails.length === 1 && state.emails[0].author === '82' && !!state.redirect, 'everything saved and sent as the PE');
ok(state.units < 300, 'save used ' + state.units + ' units (< 300) — includes the Next contact record check, the PE lookup and my CC lookup');
console.log('     ledger: ' + JSON.stringify(state.calls.reduce(function (m, c) { var k = c.replace(/:.*$/, ''); m[k] = (m[k] || 0) + 1; return m; }, {})));
resetState(); withTeam();
state.units = 0;
runGet();
ok(state.units <= 60, 'page load used ' + state.units + ' units (two email checks added)');

// ─── T47–T51: amendment 3 — the phone field confirmed, inactive senders ────────────────────

console.log('T47. The card phone is the employee phone field, for every sender');
[['me', '01404549770'], ['rep', '01404111222'], ['pe', '01404333444']].forEach(function (c) {
    resetState(); withTeam();
    state.employee.officephone = '07777 000 111';   // officephone set too — must never be read
    state.employees['81'].officephone = '07777 000 111';
    state.employees['82'].officephone = '07777 000 111';
    state.oppValues.custbody_sales_rep_phone = '07888 999 000';
    emailPost({ custpage_email_from: c[0] });
    var b = state.emails[0] ? String(state.emails[0].body) : '';
    var cols = state.calls.filter(function (x) { return /^lookupFields:/.test(x); });
    ok(cols.indexOf('lookupFields:employee:firstname,lastname,entityid,email,phone,isinactive,custentity_employee_photo_link') !== -1 &&
       !cols.some(function (x) { return /officephone|custbody_sales_rep_phone/.test(x); }),
       c[0] + ': loadSender reads phone (+ isinactive); officephone and custbody_sales_rep_phone never read');
    ok(b.indexOf('href="tel:' + c[1] + '"') !== -1 && b.indexOf('07777') === -1 && b.indexOf('07888') === -1, c[0] + ': card phone = the employee phone (tel:' + c[1] + ')');
});

console.log('T48. phone blank, officephone set');
[['me', function () { state.employee.phone = ''; state.employee.officephone = '07777 444 555'; }],
 ['rep', function () { state.employees['81'].phone = ''; state.employees['81'].officephone = '07777 444 555'; }],
 ['pe', function () { state.employees['82'].phone = ''; state.employees['82'].officephone = '07777 444 555'; }]
].forEach(function (c) {
    resetState(); withTeam(); c[1]();
    emailPost({ custpage_email_from: c[0] });
    var b = state.emails[0] ? String(state.emails[0].body) : '';
    ok(b && b.indexOf('tel:') === -1 && !/CALL [A-Z]|CLICK TO CALL/.test(b) && b.indexOf('07777') === -1 && b.indexOf('01404 540604') === -1 && b.indexOf('<span class="cl-sep">') === -1,
       c[0] + ': no CALL button, the officephone value appears nowhere, no switchboard, email-only line');
});

console.log('T49. GET: the PE is inactive');
[true, 'T', 'true'].forEach(function (v) {
    resetState(); withTeam();
    state.employees['82'].isinactive = v;
    var opts = fromOptions(html(runGet())).join(' | ');
    ok(opts === 'me*=Me (Sam Taylor) | rep=Sales rep (Rob &lt;Rep&gt;)', 'isinactive = ' + JSON.stringify(v) + ' → no PE option (' + opts + ')');
});
[false, 'F', 'false', ''].forEach(function (v) {
    resetState(); withTeam();
    state.employees['82'].isinactive = v;
    ok(/value="pe"/.test(html(runGet())), 'isinactive = ' + JSON.stringify(v) + ' → PE offered');
});

console.log('T50. POST from=rep, the rep inactive since GET');
[true, 'T', 'true'].forEach(function (v) {
    resetState(); withTeam();
    state.employees['81'].isinactive = v;
    var f = emailPost({ custpage_email_from: 'rep', custpage_upd_entitystatus: '12' });
    ok(nothingWritten() && state.emails.length === 0 && Object.keys(state.cache).length === 0 &&
       html(f).indexOf('Sales rep is no longer active, so the email can’t be sent from them.') !== -1, 'isinactive = ' + JSON.stringify(v) + ' → blocked; nothing written; token kept');
});
resetState(); withTeam();
state.employee.isinactive = true;   // never blocks "me" — the current user is logged in
emailPost({});
ok(state.emails.length === 1 && state.emails[0].author === '7', 'me with isinactive set → still sent');

console.log('T51. Governance');
resetState(); withTeam();
state.types = [];
for (var g51 = 1; g51 <= 25; g51++) state.types.push({ id: String(100 + g51), name: 'Type ' + g51, group: String(1 + (g51 % 7)), groupName: 'G' });
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@example.com' });
state.units = 0;
emailPost({ custpage_email_from: 'pe', custpage_obj_sel: JSON.stringify(state.types.map(function (t) { return t.id; })), custpage_obj_quote: '901', custpage_call_contact: '71',
            custpage_rcpt_contacts: '71,73', custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'x@example.org', custpage_rcpt_ccme: 'T',
            custpage_upd_entitystatus: '12', custpage_upd_next_contact: '', custpage_upd_build_stage: '4' });
ok(objections().length === 25 && state.emails.length === 1 && state.units === 222, 'worst case unchanged at 222 units (isinactive rides on existing lookups) — got ' + state.units);
resetState(); withTeam();
state.units = 0;
runGet();
ok(state.units === 53, 'page load unchanged at 53 units — got ' + state.units);

// ─── T52–T62: 1.2.0 — the "Give us an update" button (lib 1.3.0) ───────────────────────────

// The dashboard's token format, copied here as a FIXTURE (NS-Customer-Dashboard lib/cdb_lib_token.js
// 2.1.0 makePayload / assembleToken / asciiToBase64 / toBase64Url) — nothing of the dashboard is required.
var CDB_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function cdbAsciiToBase64(text) {
    var out = '', i, a, b, c;
    for (i = 0; i < text.length; i += 3) {
        a = text.charCodeAt(i);
        b = i + 1 < text.length ? text.charCodeAt(i + 1) : NaN;
        c = i + 2 < text.length ? text.charCodeAt(i + 2) : NaN;
        out += CDB_ALPHABET.charAt(a >> 2);
        out += CDB_ALPHABET.charAt(((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4));
        out += isNaN(b) ? '=' : CDB_ALPHABET.charAt(((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6));
        out += isNaN(c) ? '=' : CDB_ALPHABET.charAt(c & 63);
    }
    return out;
}
function cdbToBase64Url(b64) { return String(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function cdbNormaliseVersion(raw) { var t = String(raw === null || raw === undefined ? '' : raw).trim(); return /^\d+$/.test(t) ? parseInt(t, 10) : 0; }
function makePayload(customerId, version) { return 'c' + String(customerId) + '.v' + cdbNormaliseVersion(version); }
function assembleToken(payload, signatureBase64) { return cdbToBase64Url(cdbAsciiToBase64(payload)) + '.' + cdbToBase64Url(signatureBase64); }
function cdbSign(customerId, version) {
    var payload = makePayload(customerId, version);
    return assembleToken(payload, require('crypto').createHmac('sha256', 'test-key-not-the-secret').update(payload).digest('base64'));
}
var CDB_BASE = 'https://1234567.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2001&deploy=1&compid=1234567&ns-at=AAEJ7tMQ';
function cdbLink(customerId, version) { return CDB_BASE + '&t=' + cdbSign(customerId, version); }
var LIB = modules['./nuheat_opp_update_lib'];

function setMode(m) { state.scriptParams = { custscript_nuheat_updbtn_mode: m }; }
function withLink(extra) {
    setMode('ALL');   // v1.2.1: T52–T62 test the button as built
    state.customer = { custentity_cdb_link: cdbLink(55, 2), custentity_cdb_link_version: '2', isinactive: false, custentity_cdb_dashboard_contact: '' };
    Object.keys(extra || {}).forEach(function (k) { state.customer[k] = extra[k]; });
}
// v1.2.2: the "Request an update" radio — '' offered, ' checked' chosen, ' disabled data-blocked="1"' blocked, null absent
function updTick(h) {
    var m = /<input type="radio" name="custpage_email_kind" id="nsq-kind-update" value="update"([^>]*)>/.exec(h);
    return m ? m[1].replace(/ data-(subject|message|write-subject)="[^"]*"/g, '') : null;
}
function kindAttr(h, name) { var m = new RegExp('id="nsq-kind-update"[^>]* data-' + name + '="([^"]*)"').exec(h); return m ? m[1] : null; }
function ubPost(overrides) {
    var p = { custpage_email_kind: 'update', custpage_call_on: 'F' };
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });
    return emailPost(p);
}
var UB_REFUSAL = 'The update button opens the customer’s whole project page, so it can only go to the customer and their own contacts. Choose ‘Write an email’, or remove: ';   // changed in 1.2.2: was "Untick it"

console.log('T52. lib.cdbLinkMatches — the dashboard\'s pure decode, test vectors');
ok(LIB.LIB_VERSION === '1.4.0', 'LIB_VERSION 1.4.0');   // changed in 1.3.0 (lib 1.4.0)
ok(makePayload(55, '') === 'c55.v0' && assembleToken('c55.v0', 'AAEC/w+=').indexOf('YzU1LnYw.') === 0 && assembleToken('c55.v0', 'AAEC/w+=') === 'YzU1LnYw.AAEC_w-',
   'fixture: makePayload / assembleToken give c55.v0 → YzU1LnYw.<sig, base64url>');
ok(JSON.stringify(LIB.cdbLinkPayload(CDB_BASE + '&t=YzU1LnYw.AAEC_w-')) === '{"customerId":"55","version":0}', 'payload decoded: customer 55, version 0');
ok(LIB.cdbLinkMatches(cdbLink(55, ''), 55, '') && LIB.cdbLinkMatches(cdbLink(55, 0), '55', 0) && LIB.cdbLinkMatches(cdbLink(55, '0'), 55, null), 'empty version means 0, both sides');
ok(LIB.cdbLinkMatches(cdbLink(55, 3), '55', '3') && !LIB.cdbLinkMatches(cdbLink(55, 3), '55', '') && !LIB.cdbLinkMatches(cdbLink(55, 3), '55', '4'), 'version must match');
ok(!LIB.cdbLinkMatches(cdbLink(56, 0), '55', '') && !LIB.cdbLinkMatches(cdbLink(5, 0), '55', '') && !LIB.cdbLinkMatches(cdbLink(55, 0), '', ''), 'customer must match');
ok(LIB.cdbLinkMatches(cdbLink(55, 1) + '&a=update&opp=123', 55, 1) && LIB.cdbLinkMatches('https://x/?t=' + cdbSign(55, 1) + '&script=1', 55, 1), 'extra parameters do not matter; t anywhere');
ok(LIB.cdbLinkMatches(CDB_BASE + '&t=' + cdbToBase64Url(cdbAsciiToBase64('c0055.v1')) + '.sig', 55, 1), 'leading zeros as the dashboard reads them');
ok(LIB.cdbLinkMatches(CDB_BASE + '&t=YzU1LnYw.wrong-signature', 55, ''), 'the signature is NOT checked (the dashboard does that)');
var bad52 = [
    ['empty', ''], ['null', null], ['no t', CDB_BASE], ['empty t', CDB_BASE + '&t='], ['one part', CDB_BASE + '&t=YzU1LnYw'],
    ['three parts', CDB_BASE + '&t=YzU1LnYw.a.b'], ['bad chars', CDB_BASE + '&t=YzU1Ln+w.abc'], ['bad base64 length', CDB_BASE + '&t=YzU1L.abc'],
    ['payload not c<id>.v<n>', CDB_BASE + '&t=' + cdbToBase64Url(cdbAsciiToBase64('c55')) + '.abc'],
    ['payload v not numeric', CDB_BASE + '&t=' + cdbToBase64Url(cdbAsciiToBase64('c55.vx')) + '.abc'],
    ['bad URI escape', CDB_BASE + '&t=%E0%A4%A'], ['xt= not t=', CDB_BASE + '&xt=' + cdbSign(55, 0)]
];
bad52.forEach(function (b) { ok(!LIB.cdbLinkMatches(b[1], 55, '') && LIB.cdbLinkPayload(b[1]) === null, 'malformed (' + b[0] + ') → no match'); });

console.log('T53. GET: "Request an update" offered with a matching link (changed in 1.2.2: was the tick box)');
resetState(); withLink();
state.contacts[0].company = '55';
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@architects.example', company: '99' });
state.calls = [];
var h53 = html(runGet());
ok(updTick(h53) === '' && /id="nsq-kind-write" value="write" checked>/.test(h53), '"Request an update" enabled; "Write an email" selected');
ok(h53.indexOf('<span>Write an email</span></label>') !== -1 && h53.indexOf('<span>Request an update</span></label></div><p class="nsq-help nsq-kind-hint">Sends the customer their personal link to update this project’s stage, timing and details. It can only go to the customer and their own contacts.</p></div>') !== -1,
   'the two options and the hint');
ok(h53.indexOf('id="nsq-email-body"') < h53.indexOf('id="nsq-kind-write"') && h53.indexOf('id="nsq-kind-update"') < h53.indexOf('id="nsq-email-from"'), 'at the top of the section, above From');
ok(h53.indexOf('Add a ‘Give us an update’ button') === -1 && h53.indexOf('custpage_email_updbtn') === -1, 'the 1.2.0 tick box is gone');
ok(h53.indexOf('id="nsq-updbtn-why"') === -1, 'no reason shown');
ok(/data-contact-id="71" data-email="ann@example\.com" data-own="1">/.test(h53) && /data-contact-id="73" data-email="cat@architects\.example" data-own="0"> Cat Day <span class="nsq-tick-addr">cat@architects\.example<\/span> <span class="nsq-rcpt-not" hidden>Not this customer’s contact<\/span>/.test(h53),
   'own contact data-own="1"; another company\'s contact data-own="0" with its (hidden) note');
ok(/id="nsq-rcpt-extra-note" hidden>Other addresses are off for an update request/.test(h53), 'the Other addresses explanation is on the page (hidden)');
ok(state.calls.filter(function (c) { return c === 'lookupFields:customer:email,custentity_cdb_link,custentity_cdb_link_version,isinactive,custentity_cdb_dashboard_contact,isperson,firstname'; }).length === 1 &&
   state.calls.filter(function (c) { return /^lookupFields:customer/.test(c); }).length === 1, 'ONE customer lookup reads email + the three columns + the dashboard contact (+ isperson, firstname in 1.2.2)');
ok(h53.indexOf(cdbSign(55, 2)) === -1 && h53.indexOf('extforms') === -1, 'the link itself is not on the page');
var s53 = scripts(h53);
var parsed53 = true; try { new vm.Script(s53[0]); } catch (e) { parsed53 = false; console.log('     ' + e.message); }
ok(parsed53 && s53.length === 1 && !/example|Cat|55|extforms/.test(s53[0]), 'the script parses; no record data in it');

console.log('T54. GET: "Request an update" disabled, with the reason; "Write an email" selected');
[
    ['no link', {}, null, 'No dashboard link for this customer yet.'],
    ['wrong customer', { custentity_cdb_link: cdbLink(56, 2) }, null, 'The customer’s link is out of date. Ask an administrator to run the link backfill.'],
    ['wrong version', { custentity_cdb_link_version: '3' }, null, 'The customer’s link is out of date. Ask an administrator to run the link backfill.'],
    ['empty version vs v2 link', { custentity_cdb_link_version: '' }, null, 'The customer’s link is out of date. Ask an administrator to run the link backfill.'],
    ['inactive', { isinactive: true }, null, 'Customer is inactive.'],
    ['inactive (T)', { isinactive: 'T' }, null, 'Customer is inactive.'],
    ['malformed link', { custentity_cdb_link: CDB_BASE + '&t=not-a-token' }, null, 'The customer’s link is out of date. Ask an administrator to run the link backfill.'],
    ['customer lookup fails', {}, 'boom', 'No dashboard link for this customer yet.']
].forEach(function (c) {
    resetState();
    if (c[0] === 'no link') { state.customer = {}; setMode('ALL'); } else withLink(c[1]);
    var throwsOrig = searchStub.lookupFields;
    if (c[2]) searchStub.lookupFields = function (o) { if (o.type === 'customer') throw new Error(c[2]); return throwsOrig(o); };
    var h = html(runGet());
    searchStub.lookupFields = throwsOrig;
    ok(updTick(h) === ' disabled data-blocked="1"' && /id="nsq-kind-write" value="write" checked>/.test(h) && kindAttr(h, 'subject') === null &&
       h.indexOf('<p class="nsq-help nsq-updbtn-why" id="nsq-updbtn-why">' + c[3].replace(/&/g, '&amp;') + '</p>') !== -1,
       c[0] + ': disabled — "' + c[3] + '"');
    ok(state.logs.some(function (l) { return l.level === 'debug' && l.title === 'UpdateOppSL.UpdateButton' && l.details === 'Opportunity 123 — update button not offered: ' + c[3]; }), c[0] + ': reason logged at debug');
    ok(!/data-own=|nsq-rcpt-extra-note|nsq-tick-dash/.test(h.split('<script>')[0]), c[0] + ': recipients exactly as 1.1.1 (no own marks)');
});
resetState(); state.customer = {};
var h54 = html(runGet());
ok(h54.indexOf(LIB.buildRecipientsHTML([{ id: '71', name: 'Ann Lee', email: 'ann@example.com' }], 'cust@example.com', null)) !== -1, 'not offered → the recipients block is the 1.1.1 HTML');

console.log('T55. GET: the dashboard contact');
resetState(); withLink({ custentity_cdb_dashboard_contact: [{ value: '80', text: 'Dee Dash' }] });
state.dashContacts = { '80': { email: 'dee@home.example' } };
var h55 = html(runGet());
ok(/<label class="nsq-tick nsq-tick-dash" hidden><input type="checkbox" class="nsq-rcpt nsq-rcpt-dash" data-contact-id="80" data-email="dee@home\.example" data-own="1"> Dashboard contact <span class="nsq-tick-addr">dee@home\.example<\/span><\/label>/.test(h55),
   'not on the opportunity → a (hidden) Dashboard contact tick');
ok(state.calls.filter(function (c) { return c === 'lookupFields:contact:email'; }).length === 1, 'one contact lookup for its email');
resetState(); withLink({ custentity_cdb_dashboard_contact: '71' });
state.dashContacts = { '71': { email: 'ann@example.com' } };
var h55b = html(runGet());
ok(!/nsq-tick-dash/.test(h55b) && /data-contact-id="71" data-email="ann@example\.com" data-own="1">/.test(h55b), 'already on the opportunity → no extra tick; that contact counts as own');
resetState(); withLink();
runGet();
ok(!state.calls.some(function (c) { return /^lookupFields:contact/.test(c); }), 'no dashboard contact → no contact lookup');
resetState(); withLink({ isinactive: true, custentity_cdb_dashboard_contact: '80' });
state.dashContacts = { '80': { email: 'dee@home.example' } };
runGet();
ok(!state.calls.some(function (c) { return /^lookupFields:contact/.test(c); }), 'not offered → no contact lookup');

console.log('T56. POST: a typed extra address is refused');
resetState(); withLink(); state.contacts[0].company = '55';
var f56 = ubPost({ custpage_rcpt_extra: 'friend@example.org; ann@example.com', custpage_email_message: 'Hi Ann' });
ok(state.emails.length === 0 && nothingWritten() && Object.keys(state.cache).length === 0 && !state.calls.some(function (c) { return /^cache/.test(c); }),
   'nothing sent, nothing written, the token not claimed');
ok(html(f56).indexOf('Not saved.</strong> ' + UB_REFUSAL.replace(/’/g, '’') + 'friend@example.org, ann@example.com') !== -1, 'the refusal lists the typed addresses (even one that is a contact\'s)');
ok(updTick(html(f56)) === ' checked' && /id="nsq-rcpt-extra" name="custpage_rcpt_extra"[^>]*value="friend@example\.org; ann@example\.com"/.test(html(f56)) &&
   /Hi Ann<\/textarea>/.test(html(f56)) && /data-contact-id="71" data-email="ann@example\.com" data-own="1" checked>/.test(html(f56)), 're-rendered with every entry restored (tick, extra, message, contact)');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_rcpt_extra: 'not an address' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return l.title === 'UpdateOppSL.Validation' && l.details.indexOf(UB_REFUSAL + 'not an address') !== -1; }), 'even a malformed extra gets the same refusal');

console.log('T57. POST: a contact from another company is refused');
resetState(); withLink(); state.contacts[0].company = '55';
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@architects.example', company: '99' });
var f57 = ubPost({ custpage_rcpt_contacts: '71,73' });
ok(state.emails.length === 0 && nothingWritten() && Object.keys(state.cache).length === 0, 'nothing sent or written; token not claimed');
ok(html(f57).indexOf(UB_REFUSAL + 'cat@architects.example') !== -1, 'refusal names the architect\'s address');
resetState(); withLink();   // no company on Ann at all
ubPost({ custpage_rcpt_contacts: '71' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return l.details.indexOf(UB_REFUSAL + 'ann@example.com') !== -1; }), 'a contact with no company is not the customer\'s');

console.log('T58. POST: the customer, the dashboard contact and the customer\'s own contacts are allowed; CC me too');
resetState(); withLink({ custentity_cdb_dashboard_contact: [{ value: '80', text: 'Dee Dash' }] });
state.dashContacts = { '80': { email: 'dee@home.example' } };
state.contacts[0].company = '55';
ubPost({ custpage_rcpt_contacts: '71,80', custpage_rcpt_customer: 'T', custpage_rcpt_ccme: 'T' });
var e58 = state.emails[0] || {};
ok(state.emails.length === 1 && JSON.stringify(e58.recipients) === JSON.stringify(['ann@example.com', 'dee@home.example', 'cust@example.com']), 'To = own contact, dashboard contact, customer (' + JSON.stringify(e58.recipients) + ')');
ok(JSON.stringify(e58.cc) === JSON.stringify(['sam.taylor@nu-heat.co.uk']), 'CC me allowed');
ok(rparams().nsqe === 'sent' && rparams().nsqen === '3', 'banner codes as before');
resetState(); withLink({ custentity_cdb_dashboard_contact: '80' });
state.dashContacts = { '80': { email: 'dee@home.example' } };
ubPost({ custpage_rcpt_contacts: '', custpage_rcpt_customer: 'T' });
ok(state.emails.length === 1 && JSON.stringify(state.emails[0].recipients) === '["cust@example.com"]', 'the customer alone');
resetState(); withLink();
ubPost({ custpage_rcpt_contacts: '', custpage_rcpt_customer: 'F', custpage_rcpt_ccme: 'T' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return l.title === 'UpdateOppSL.Validation' && /Choose at least one recipient\./.test(l.details); }), 'CC me alone is not enough: at least one To');
resetState(); withLink();
ubPost({ custpage_rcpt_contacts: '80' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return /A chosen contact is not on this opportunity\./.test(l.details); }), 'without a dashboard contact on the customer, ID 80 is just unknown');
resetState(); withLink();
emailPost({ custpage_email_kind: 'write', custpage_rcpt_contacts: '80', custpage_call_on: 'F' });
ok(state.emails.length === 0, '"Write an email" → the dashboard contact is not a recipient');

console.log('T59. POST: the server rechecks the link (a tampered or stale page)');
[
    ['link now stale', { custentity_cdb_link_version: '3' }, 'The customer’s link is out of date. Ask an administrator to run the link backfill.'],
    ['another customer\'s link', { custentity_cdb_link: cdbLink(56, 2) }, 'The customer’s link is out of date. Ask an administrator to run the link backfill.'],
    ['customer now inactive', { isinactive: true }, 'Customer is inactive.'],
    ['no link', { custentity_cdb_link: '' }, 'No dashboard link for this customer yet.']
].forEach(function (c) {
    resetState(); withLink(c[1]); state.contacts[0].company = '55';
    var f = ubPost({ custpage_rcpt_customer: 'T' });
    ok(state.emails.length === 0 && nothingWritten() && Object.keys(state.cache).length === 0, c[0] + ': nothing sent or written; token not claimed');
    ok(html(f).indexOf('Not saved.</strong> ' + c[2].replace(/&/g, '&amp;')) !== -1 && updTick(html(f)) === ' disabled data-blocked="1"' && /id="nsq-kind-write" value="write" checked>/.test(html(f)),
       c[0] + ': refused, re-rendered with "Request an update" disabled and "Write an email" selected');
});
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_email_on: 'F', custpage_email_kind: 'update' });
ok(state.emails.length === 0 && !state.calls.some(function (c) { return /^lookupFields:customer/.test(c); }), 'email off → the kind is ignored (no lookup, no email)');

console.log('T60. The email: the button only for an update request (changed in 1.2.2: the fixed line only without a message)');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_message: 'Hello Ann,\n\nQuick one.' });
var b60 = String((state.emails[0] || {}).body || '');
var URL60 = cdbLink(55, 2) + '&a=update&opp=123';
ok(state.emails.length === 1 && b60.indexOf('When you have a moment') === -1, 'with a message, no fixed line (1.2.2)');
ok((b60.match(/<b>GIVE US AN UPDATE<\/b>/g) || []).length === 2 && b60.indexOf(LIB.emailButtonV2(URL60, 'GIVE US AN UPDATE')) !== -1, 'lib.emailButtonV2(link, \'GIVE US AN UPDATE\')');   // changed in 1.3.0 (was: lib.emailButton)
var hrefs60 = []; b60.replace(/href="([^"]*a=update[^"]*)"/g, function (m, h) { hrefs60.push(h); });
ok(hrefs60.length === 2 && hrefs60.every(function (h) { return /&amp;a=update&amp;opp=123$/.test(h) && h === LIB.escapeHtml(URL60); }), 'href = the stored link + &a=update&opp=123, escaped');
ok(b60.indexOf('Quick one.') < b60.indexOf('GIVE US AN UPDATE') && b60.indexOf('GIVE US AN UPDATE') < b60.indexOf('YOUR NU-HEAT CONTACT') && b60.indexOf('Best wishes') === -1, 'between the message and the sender card');   // changed in 1.3.0
ok(state.emails[0].subject === 'An update on OPP123' && state.emails[0].author === '7', 'the posted subject; sender unchanged');
ok(JSON.stringify(state.logs).indexOf(cdbSign(55, 2)) === -1 && JSON.stringify(state.logs).indexOf('extforms') === -1, 'the link is never logged');
ok(audit('UpdateOppSL.Email').some(function (l) { return l.details === 'Opportunity 123 — from me (employee 7) | {"updateButton":true,"opp":"123"}'; }), 'audit: updateButton: true and the opportunity ID');
resetState(); withLink({ custentity_cdb_link: cdbLink(55, 2) + '&x="><b>bold</b>' }); state.contacts[0].company = '55';
ubPost();
var b60e = String((state.emails[0] || {}).body || '');
ok(state.emails.length === 1 && b60e.indexOf('"><b>bold') === -1 && b60e.indexOf('&amp;x=&quot;&gt;&lt;b&gt;bold&lt;/b&gt;&amp;a=update&amp;opp=123"') !== -1, 'a hostile stored link is escaped');
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_call_on: 'F' });
var b60off = String((state.emails[0] || {}).body || '');
ok(b60off.indexOf('GIVE US AN UPDATE') === -1 && b60off.indexOf('When you have a moment') === -1 && b60off.indexOf('a=update') === -1, 'no kind (a 1.1 page) → no line, no button');
ok(audit('UpdateOppSL.Email').some(function (l) { return l.details === 'Opportunity 123 — from me (employee 7)'; }), 'no kind → the audit line as before');

// 1.3.0: SHA-256 of the v2 email (lib 1.4.0), captured when the design changed — any later change to it shows here.
var EMAIL_130 = { write: '874f94b6483f1a07a27d087d93408d7727f8dd5723c0b47661394417014fc3d8', multi: '04fdb98ca09c2b69e92382239a353140f411fa02c1eebc8655ffd66897e81c3b' };
console.log('T61. "Write an email" (or no kind) → one email; changed in 1.3.0: the v2 design (was: byte-identical to 1.1.1)');
function sha(s) { return require('crypto').createHash('sha256').update(String(s)).digest('hex'); }
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_rcpt_customer: 'T', custpage_rcpt_ccme: 'T' });
var b61a = state.emails[0].body;
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_email_kind: 'write', custpage_rcpt_customer: 'T', custpage_rcpt_ccme: 'T' });
ok(sha(state.emails[0].body) === sha(b61a), 'kind=write and no kind: the same email');
ok(sha(b61a) === EMAIL_130.write, 'default email: the 1.3.0 baseline SHA-256' + (sha(b61a) === EMAIL_130.write ? '' : ' (got ' + sha(b61a) + ')'));
resetState();
emailPost({ custpage_email_from: 'me', custpage_email_message: 'Line one\nline two\n\nPara <b>&amp;</b> {{x}}' });
ok(sha(state.emails[0].body) === EMAIL_130.multi, 'multi-paragraph, escaped email: the 1.3.0 baseline SHA-256' + (sha(state.emails[0].body) === EMAIL_130.multi ? '' : ' (got ' + sha(state.emails[0].body) + ')'));

console.log('T62. Page script: while "Request an update" is chosen');
resetState(); withLink(); state.contacts[0].company = '55';
var s62 = scripts(html(runGet()))[0];
var fn62 = /  \/\/ updbtn:start\n[\s\S]*?  \/\/ updbtn:end/.exec(s62);
ok(!!fn62, 'the update part found in the page script');
function fakeEl(o) { var e = { hidden: false, disabled: false, checked: false, value: '', attrs: {}, className: '' }; Object.keys(o || {}).forEach(function (k) { e[k] = o[k]; });
    e.getAttribute = function (n) { return e.attrs[n] === undefined ? null : e.attrs[n]; }; return e; }
function fakeRow(input, note) { input.parentNode = { hidden: !!input.startHidden, querySelector: function () { return note || null; } }; return input; }
function page62(blocked) {
    var d = {};
    d.tick = fakeEl({ attrs: blocked ? { 'data-blocked': '1' } : { 'data-subject': 'Could you give us a quick update on OPP123?', 'data-message': 'Hi,\n\nPrefill', 'data-write-subject': 'An update on OPP123' } });
    d.write = fakeEl({ checked: true });
    if (blocked) d.tick.disabled = true;   // the page renders it disabled
    d.subj = fakeEl({ value: 'An update on OPP123' });
    d.msg = fakeEl({ value: '' });
    d.email = fakeEl({ checked: true });
    d.extra = fakeEl({ value: 'x@example.org' });
    d.note = fakeEl({ hidden: true });
    d.ownNote = fakeEl({ hidden: true });
    d.own = fakeRow(fakeEl({ className: 'nsq-rcpt', attrs: { 'data-own': '1' }, checked: true }));
    d.other = fakeRow(fakeEl({ className: 'nsq-rcpt', attrs: { 'data-own': '0' }, checked: true }), d.ownNote);
    d.dash = fakeRow(fakeEl({ className: 'nsq-rcpt nsq-rcpt-dash', attrs: { 'data-own': '1' }, startHidden: true }));
    var ids = { 'nsq-kind-update': d.tick, 'nsq-kind-write': d.write, 'nsq-email-on': d.email, 'nsq-rcpt-extra': d.extra, 'nsq-rcpt-extra-note': d.note,
                'nsq-email-subject': d.subj, 'nsq-email-message': d.msg };
    d.req = fakeEl({});
    var ctx = { $: function (id) { return ids[id] || null; }, each: function (l, f) { Array.prototype.forEach.call(l, f); },
                root: { querySelectorAll: function () { return [d.own, d.other, d.dash]; }, querySelector: function () { return d.req; } } };
    vm.runInNewContext(fn62[0] + '\nthis.applyUpdBtn = applyUpdBtn; this.switchKind = switchKind; this.kindIsUpdate = kindIsUpdate;', ctx);
    d.apply = ctx.applyUpdBtn;
    d.choose = function (update) { d.tick.checked = update; d.write.checked = !update; ctx.switchKind(); ctx.applyUpdBtn(); };
    d.kindIsUpdate = ctx.kindIsUpdate;
    return d;
}
var d62 = page62(false);
d62.apply();
ok(!d62.extra.disabled && d62.extra.value === 'x@example.org' && d62.note.hidden && d62.dash.parentNode.hidden && d62.dash.disabled && !d62.other.disabled && d62.other.checked,
   'tick off: nothing changed (extra enabled, dashboard tick hidden, other contact usable)');
d62.tick.checked = true; d62.apply();
ok(d62.extra.disabled && d62.extra.value === '' && !d62.note.hidden, 'tick on: Other addresses disabled, emptied and explained');
ok(d62.other.disabled && !d62.other.checked && !d62.ownNote.hidden, 'tick on: another company\'s contact unticked, disabled, "Not this customer\'s contact"');
ok(!d62.own.disabled && d62.own.checked && !d62.dash.parentNode.hidden && !d62.dash.disabled, 'tick on: own contact and the dashboard contact usable');
d62.tick.checked = false; d62.apply();
ok(!d62.extra.disabled && d62.extra.value === 'x@example.org' && d62.note.hidden && !d62.other.disabled && d62.ownNote.hidden && d62.dash.parentNode.hidden,
   'tick off again: the typed addresses come back');
d62.tick.checked = true; d62.email.checked = false; d62.apply();
ok(d62.extra.disabled && d62.own.disabled && d62.extra.value === 'x@example.org', 'email switched off: everything disabled, nothing lost');
var b62 = page62(true);
b62.tick.checked = true; b62.tick.disabled = false;   // as if setSection had re-enabled it
b62.apply();
ok(b62.tick.disabled && !b62.tick.checked && b62.write.checked && !b62.extra.disabled && !b62.other.disabled, 'a blocked "Request an update" stays disabled; "Write an email" selected');


console.log('T63. Mode OFF / empty / unknown / unreadable: the 1.1.1 email section');
function emailSection(h) { var a = h.indexOf('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">2</span>'); return a < 0 ? '' : h.substring(a, h.indexOf('</section>', a) + 10); }
// SHA-256 of the email section rendered by 1.1.1 (origin/main 7fe3964) under this harness: A fresh GET; B + another
// company's contact; C re-render after a failed save with the email on, extra and Customer ticked, a tick posted
var SECT_111 = { A: 'eae57f65e92d4940b35f221d6f5948bfd5ada4cb4d4b870e3b6b42dd65b63ead', B: 'fed4fcaa1bad8ed37ec505752d4f4181078bdca90a217ebaf44de1b2f1edb124',
                 C: 'f9abc01ac7978b21a58a147c12c59b6c2db33dc02fa4b25e8974a63d28cc3123' };
[['no parameter', function () {}], ['empty', function () { setMode(''); }], ['OFF', function () { setMode('OFF'); }], ['off ', function () { setMode(' off '); }],
 ['unknown "YES"', function () { setMode('YES'); }], ['unreadable', function () { state.paramThrows = 'no such parameter'; }],
 ['ADMIN, sales role', function () { setMode('ADMIN'); }], ['ADMIN, no role', function () { setMode('ADMIN'); state.roleId = ''; }],
 ['ADMIN, custom admin-like role', function () { setMode('ADMIN'); state.roleId = 'customrole_administrator_copy'; }]].forEach(function (c) {
    function prep() { resetState(); state.customer = { custentity_cdb_link: cdbLink(55, 2), custentity_cdb_link_version: '2', isinactive: false, custentity_cdb_dashboard_contact: '80' };
        state.dashContacts = { '80': { email: 'dee@home.example' } }; state.contacts[0].company = '55'; c[1](); }
    prep(); state.calls = [];
    var ha = html(runGet());
    ok(sha(emailSection(ha)) === SECT_111.A && ha.split('<script>')[0].indexOf('custpage_email_kind') === -1, c[0] + ': fresh GET — email section byte-identical to 1.1.1, no choice');
    ok(state.calls.filter(function (x) { return /^lookupFields:customer/.test(x); }).join() === 'lookupFields:customer:email' && !state.calls.some(function (x) { return /^lookupFields:contact/.test(x); }),
       c[0] + ': the 1.1.1 customer lookup (email only), no contact lookup');
    prep(); state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@architects.example', company: '99' });
    ok(sha(emailSection(html(runGet()))) === SECT_111.B, c[0] + ': with another company\'s contact — byte-identical');
    prep();
    ok(sha(emailSection(html(emailPost({ custpage_email_subject: '', custpage_rcpt_extra: 'x@example.org', custpage_rcpt_customer: 'T', custpage_email_kind: 'update' })))) === SECT_111.C,
       c[0] + ': re-rendered page after a failed save — byte-identical');
    prep();
    ubPost({ custpage_rcpt_extra: 'friend@example.org', custpage_rcpt_customer: 'T' });
    var e = state.emails[0] || {};
    ok(state.emails.length === 1 && String(e.body).indexOf('GIVE US AN UPDATE') === -1 && String(e.body).indexOf('a=update') === -1 &&
       JSON.stringify(e.recipients) === '["ann@example.com","cust@example.com","friend@example.org"]', c[0] + ': a posted update is sent as write — no button, typed extra allowed as in 1.1.1');
    ok(sha(e.body) === sha((function () { prep(); emailPost({ custpage_call_on: 'F', custpage_rcpt_extra: 'friend@example.org', custpage_rcpt_customer: 'T' }); return state.emails[0].body; })()),
       c[0] + ': that email is byte-identical to the same email without the kind');
    prep();
    ubPost({ custpage_rcpt_customer: 'T' });
    var mode = /^ADMIN/.test(c[0]) ? 'ADMIN' : 'OFF';
    ok(audit('UpdateOppSL.UpdateButton').some(function (l) { return l.details === 'Opportunity 123 — ignored: mode ' + mode; }) &&
       audit('UpdateOppSL.Email').every(function (l) { return l.details.indexOf('updateButton') === -1; }), c[0] + ': audit "ignored: mode ' + mode + '"; no updateButton in the email log');
    ok(!state.calls.some(function (x) { return /^lookupFields:customer:email,custentity/.test(x); }), c[0] + ': no dashboard lookup on the POST');
});

console.log('T64. Unknown and unreadable values are logged once per request, at debug');
resetState(); setMode('Yes please');
emailPost({ custpage_email_subject: '', custpage_email_kind: 'update' });   // refused → re-rendered in the same request
var d64 = state.logs.filter(function (l) { return l.title === 'UpdateOppSL.UpdateButton' && l.level === 'debug'; });
ok(d64.length === 1 && d64[0].details === 'Unknown mode "Yes please"; OFF', 'one debug line with the value (' + d64.length + ')');
ok(state.calls.filter(function (x) { return x === 'getParameter:custscript_nuheat_updbtn_mode'; }).length === 1, 'the parameter is read once per request');
resetState(); state.paramThrows = 'no such parameter';
runGet();
ok(state.logs.some(function (l) { return l.level === 'debug' && l.details === 'Mode parameter could not be read (no such parameter); OFF'; }), 'unreadable → debug, OFF');
resetState(); setMode('OFF'); runGet();
ok(!state.logs.some(function (l) { return l.title === 'UpdateOppSL.UpdateButton'; }), 'OFF itself → nothing logged on GET');

console.log('T65. Mode ADMIN');
resetState(); withLink(); setMode('ADMIN'); state.roleId = 'administrator'; state.contacts[0].company = '55';
var h65 = html(runGet());
ok(updTick(h65) === '' && h65.indexOf('<span>Request an update</span>') !== -1, 'Administrator (roleId "administrator") → the choice is offered');
ubPost({ custpage_rcpt_customer: 'T' });
ok(state.emails.length === 1 && String(state.emails[0].body).indexOf('GIVE US AN UPDATE') !== -1, 'Administrator → the button is sent');
resetState(); withLink(); setMode('ADMIN'); state.roleId = 'administrator';
ubPost({ custpage_rcpt_extra: 'friend@example.org' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return l.details.indexOf(UB_REFUSAL + 'friend@example.org') !== -1; }), 'Administrator → the recipient rule applies');
resetState(); withLink(); setMode('admin'); state.roleId = 'administrator';
ok(updTick(html(runGet())) === '', '"admin" (any case) = ADMIN');
resetState(); withLink(); setMode('ADMIN');   // default role: a sales role
ok(html(runGet()).split('<script>')[0].indexOf('custpage_email_kind') === -1, 'a sales role → the 1.1.1 page (see T63 for byte-identity)');

console.log('T66. Mode ALL: as built');
resetState(); withLink(); state.roleId = 'customrole_nh_account_manager'; state.contacts[0].company = '55';
ok(updTick(html(runGet())) === '', 'a sales role gets the choice');
ubPost({ custpage_rcpt_customer: 'T' });
ok(state.emails.length === 1 && String(state.emails[0].body).indexOf('GIVE US AN UPDATE') !== -1 && !audit('UpdateOppSL.UpdateButton').length, 'and the button; nothing "ignored"');
resetState(); withLink(); setMode(' all ');
ok(updTick(html(runGet())) === '', '" all " (trimmed, any case) = ALL');

console.log('T67. The page script with no choice');
resetState(); setMode('OFF');
var s67 = scripts(html(runGet()))[0];
var parsed67 = true; try { new vm.Script(s67); } catch (e) { parsed67 = false; }
ok(parsed67 && /each\(root\.querySelectorAll\("input\[name=custpage_email_kind\]"\)/.test(s67) && (s67.match(/if \(!u\) return;/g) || []).length === 1 && /if \(!u \|\| u\.disabled\) return;/.test(s67),
   'the script copes with no choice (listeners over a query; switchKind and applyUpdBtn return early)');


// ─── T68–T73: 1.2.2 — "Write an email" / "Request an update" ─────────────────────────────

console.log('T68. Mode not allowed: a posted update is sent as write (message then required)');
resetState(); withLink(); setMode('OFF'); state.contacts[0].company = '55';
ubPost({ custpage_email_message: '', custpage_rcpt_customer: 'T' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return l.title === 'UpdateOppSL.Validation' && /Write the email message\./.test(l.details); }) &&
   audit('UpdateOppSL.UpdateButton').some(function (l) { return l.details === 'Opportunity 123 — ignored: mode OFF'; }), 'OFF + update + empty message → "Write the email message." (treated as write)');
resetState(); withLink(); setMode('ADMIN'); state.contacts[0].company = '55';
ubPost({ custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'friend@example.org' });
ok(state.emails.length === 1 && String(state.emails[0].body).indexOf('a=update') === -1 && state.emails[0].recipients.indexOf('friend@example.org') !== -1, 'ADMIN, sales role: sent as write, no button, extras allowed');

console.log('T69. "Request an update": the prefill on the page');
resetState(); withLink({ isperson: true, firstname: 'Jo &amp; "Jay"' });
var h69 = html(runGet());
ok(kindAttr(h69, 'subject') === 'Could you give us a quick update on OPP123?', 'subject prefill: "Could you give us a quick update on OPP123?"');
ok(kindAttr(h69, 'message') === 'Hi Jo &amp; &quot;Jay&quot;,\n\nWe’d love to know where your project is up to, so we can be ready when you need us. Just press the button below. It only takes a minute.',   // changed in 1.3.0: no "Thanks,"
   'message prefill for a person: "Hi <first name>," (decoded once, escaped in the attribute)');
ok(kindAttr(h69, 'write-subject') === 'An update on OPP123', 'the write subject is kept for switching back');
ok(/id="nsq-email-subject" name="custpage_email_subject" maxlength="120" autocomplete="off" value="An update on OPP123"/.test(h69) && /name="custpage_email_message" rows="8" maxlength="10000"><\/textarea>/.test(h69),
   'the page itself still opens as "Write an email" (subject and message as 1.1.1)');
var s69 = scripts(h69)[0];
ok(!/Jo|OPP123|Could you/.test(s69), 'no prefill or record data in the <script>');
[['company', { isperson: false, firstname: '' }], ['company with a firstname set', { isperson: false, firstname: 'Ann' }], ['person, no first name', { isperson: 'T', firstname: '' }]].forEach(function (c) {
    resetState(); withLink(c[1]);
    ok(/^Hi,\n\nWe’d love/.test(kindAttr(html(runGet()), 'message') || ''), c[0] + ' → "Hi,"');
});
resetState(); withLink({ isperson: 'T', firstname: 'Ann' });
ok(/^Hi Ann,\n/.test(kindAttr(html(runGet()), 'message') || ''), 'isperson "T" → "Hi Ann,"');

console.log('T70. "Request an update": the email');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_message: '', custpage_email_subject: 'Could you give us a quick update on OPP123?', custpage_rcpt_customer: 'T' });
var b70 = String((state.emails[0] || {}).body || '');
ok(state.emails.length === 1 && state.emails[0].subject === 'Could you give us a quick update on OPP123?', 'an empty message is allowed; the posted subject is used');
ok(b70.indexOf('When you have a moment, let us know where your project is up to. It only takes a minute, and it helps us be ready when you need us.</font></p>') !== -1 &&
   b70.indexOf('When you have a moment') < b70.indexOf('GIVE US AN UPDATE') && b70.indexOf('GIVE US AN UPDATE') < b70.indexOf('YOUR NU-HEAT CONTACT'), 'empty message → the fixed line, then the button, then the sender card');   // changed in 1.3.0
ok(b70.indexOf('overflow:hidden;">When you have a moment, let us know where your project is up to. It only takes a minute, a</span>') !== -1,
   'the preheader is the fixed line too (first 90 characters)');
var m70 = 'Hi Ann,\n\nWe’d love to know where your project is up to, so we can be ready when you need us. Just press the button below. It only takes a minute.';   // changed in 1.3.0: no "Thanks,"
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_message: m70, custpage_rcpt_customer: 'T' });
var b70p = String((state.emails[0] || {}).body || '');
ok(b70p.indexOf('We’d love to know') !== -1 && b70p.indexOf('When you have a moment') === -1 && b70p.indexOf('It only takes a minute.') < b70p.indexOf('GIVE US AN UPDATE'), 'the prefilled message is sent; no fixed line; the button after it');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_message: 'Ann — any news on the slab pour? <b>x</b>', custpage_rcpt_customer: 'T' });
var b70e = String((state.emails[0] || {}).body || '');
ok(b70e.indexOf('Ann — any news on the slab pour? &lt;b&gt;x&lt;/b&gt;') !== -1 && b70e.indexOf('We’d love') === -1 && b70e.indexOf('When you have a moment') === -1 && b70e.indexOf('GIVE US AN UPDATE') !== -1,
   'a rep-edited message is kept (escaped) and sent with the button');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_message: new Array(10002).join('x'), custpage_rcpt_customer: 'T' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return /The message is longer than 10000 characters\./.test(l.details); }), 'the message limit still applies');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_subject: '', custpage_rcpt_customer: 'T' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return /Enter a subject for the email\./.test(l.details); }), 'the subject is still required');
resetState(); withLink(); state.contacts[0].company = '55';
var f70 = ubPost({ custpage_email_message: '', custpage_rcpt_extra: 'friend@example.org' });
ok(state.emails.length === 0 && Object.keys(state.cache).length === 0 && html(f70).indexOf(UB_REFUSAL + 'friend@example.org') !== -1, 'typed extras refused, nothing sent, token not claimed');
ok(updTick(html(f70)) === ' checked' && /name="custpage_email_message" rows="8" maxlength="10000"><\/textarea>/.test(html(f70)), 're-rendered with "Request an update" chosen and the (empty) message as posted');
resetState(); withLink(); state.contacts[0].company = '55';
state.contacts.push({ id: '73', first: 'Cat', last: 'Day', email: 'cat@architects.example', company: '99' });
ubPost({ custpage_email_message: '', custpage_rcpt_contacts: '71,73' });
ok(state.emails.length === 0 && Object.keys(state.cache).length === 0 && state.logs.some(function (l) { return l.details.indexOf(UB_REFUSAL + 'cat@architects.example') !== -1; }), 'another company\'s contact refused, token not claimed');
resetState(); withLink(); state.contacts[0].company = '55';
ubPost({ custpage_email_message: '', custpage_rcpt_customer: 'T' });
var h70 = []; String(state.emails[0].body).replace(/href="([^"]*a=update[^"]*)"/g, function (m, x) { h70.push(x); });
ok(h70.length === 2 && h70.every(function (x) { return /&amp;a=update&amp;opp=123$/.test(x); }) && JSON.stringify(state.logs).indexOf(cdbSign(55, 2)) === -1, 'button URL ends &a=update&opp=123; the link is never logged');

console.log('T71. "Write an email" with the mode allowed: as 1.1.1');
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_email_kind: 'write', custpage_email_message: '', custpage_call_on: 'F' });
ok(state.emails.length === 0 && state.logs.some(function (l) { return /Write the email message\./.test(l.details); }), 'the message is required');
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_email_kind: 'write', custpage_rcpt_extra: 'friend@example.org', custpage_call_on: 'F' });
ok(state.emails.length === 1 && String(state.emails[0].body).indexOf('GIVE US AN UPDATE') === -1 && state.emails[0].recipients.indexOf('friend@example.org') !== -1 &&
   !state.calls.some(function (c) { return /^lookupFields:customer:email,custentity/.test(c); }), 'no button; typed extras allowed; no dashboard lookup');
resetState(); withLink(); state.contacts[0].company = '55';
emailPost({ custpage_email_kind: 'junk', custpage_rcpt_extra: 'friend@example.org', custpage_call_on: 'F' });
ok(state.emails.length === 1 && String(state.emails[0].body).indexOf('a=update') === -1, 'an unknown kind = write');

console.log('T72. Switching modes on the page');
var d72 = page62(false);
d72.choose(true);
ok(d72.subj.value === 'Could you give us a quick update on OPP123?' && d72.msg.value === 'Hi,\n\nPrefill', 'to update: the write default subject and an empty message are prefilled');
ok(d72.extra.disabled && d72.extra.value === '' && d72.other.disabled, 'to update: the 1.2.0 recipient rule');
ok(d72.req.hidden, 'to update: the Message "*" is hidden (optional)');
d72.choose(false);
ok(d72.subj.value === 'An update on OPP123' && d72.msg.value === '', 'back to write: unedited prefill cleared (subject back to "An update on …")');
ok(!d72.extra.disabled && d72.extra.value === 'x@example.org' && !d72.other.disabled, 'back to write: recipients and the set-aside addresses restored');
ok(!d72.req.hidden, 'back to write: the Message "*" is shown again');
d72.choose(true);
d72.subj.value = 'Quick one'; d72.msg.value = 'Hi,\n\nPrefill plus my note';
d72.choose(false);
ok(d72.subj.value === 'Quick one' && d72.msg.value === 'Hi,\n\nPrefill plus my note', 'back to write: edited subject and message are kept');
var e72 = page62(false);
e72.subj.value = 'My own subject'; e72.msg.value = 'Typed first';
e72.choose(true);
ok(e72.subj.value === 'My own subject' && e72.msg.value === 'Typed first', 'to update: a subject and message the rep already typed are kept');
e72.choose(false);
ok(e72.subj.value === 'My own subject' && e72.msg.value === 'Typed first', 'and still kept going back');
var f72 = page62(false);
f72.subj.value = '  ';
f72.choose(true);
ok(f72.subj.value === 'Could you give us a quick update on OPP123?', 'to update: a blank subject is prefilled');
f72.choose(false);
ok(f72.subj.value === '  ', 'back to write: the blank subject is put back as it was');
var g72 = page62(false); g72.choose(true);
ok(g72.kindIsUpdate(), 'kindIsUpdate() true while chosen (the message is then optional on the page)');
var b72 = page62(true); b72.choose(true);
ok(!b72.kindIsUpdate() && b72.subj.value === 'An update on OPP123' && b72.msg.value === '' && b72.write.checked, 'blocked: choosing it changes nothing');

console.log('T73. The page script: message optional only for an update request');
resetState(); withLink();
var s73 = scripts(html(runGet()))[0];
ok(/if \(!msg\.value\.trim\(\) && !kindIsUpdate\(\)\) return "Write the message\.";/.test(s73), 'problem(): "Write the message." only when not an update request');
ok(html(runGet()).indexOf('.nsq-tick[hidden]{display:none;}') !== -1, 'CSS: a hidden recipient row (the Dashboard contact) is really hidden');

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

// ═══ T74–T82 — 1.3.0: the v2 customer email design (lib 1.4.0) ═══════════════════

var MSO_BLOCK_V2 = /<!--\[if (?:gte )?mso[^\]]*\]>([\s\S]*?)<!\[endif\]-->/g;
var NOT_MSO_BLOCK_V2 = /<!--\[if !mso\]><!-- -->([\s\S]*?)<!--<!\[endif\]-->/g;
/** What Outlook shows: [if mso] content unwrapped, [if !mso] content removed. */
function outlookViewV2(h) { return h.replace(NOT_MSO_BLOCK_V2, '').replace(MSO_BLOCK_V2, '$1').replace(/<!--[\s\S]*?-->/g, ''); }
/** Every <style> block and style attribute removed, [if mso] blocks dropped: the most hostile viewer. */
function fullyStrippedV2(h) {
    return h.replace(MSO_BLOCK_V2, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/\sstyle="[^"]*"/g, '').replace(/<!--[\s\S]*?-->/g, '');
}
function countOf(h, t) { return h.split(t).length - 1; }
var HERO_V2 = 'https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1613738610524_Order%20conformation.jpg';
var FOOTER_V2 = 'You’re receiving this because you have a project with Nu-Heat.';
/** The v2 email of each mode, as email.send() received it. */
function v2Write(over, setup) { resetState(); if (setup) setup(); emailPost(over || {}); return String((state.emails[0] || {}).body || ''); }
function v2Update(over, setup) {
    resetState(); withLink(); state.contacts[0].company = '55'; if (setup) setup();
    var p = { custpage_rcpt_customer: 'T' }; Object.keys(over || {}).forEach(function (k) { p[k] = over[k]; });
    ubPost(p); return String((state.emails[0] || {}).body || '');
}
var PREFILL_V2 = 'Hi Ann,\n\nWe’d love to know where your project is up to, so we can be ready when you need us. Just press the button below. It only takes a minute.';

console.log('T74. Both modes: logo · band (the subject as headline) · hero · message · sender card · teal footer; no "Best wishes"');
var v74 = [
    ['write', v2Write({ custpage_email_subject: 'Your heat pump options' }), 'An update from Nu-Heat', 'Your heat pump options', 'The quote is attached to your account.'],
    ['update', v2Update({ custpage_email_subject: 'Could you give us a quick update on OPP123?', custpage_email_message: PREFILL_V2 }), 'Your project', 'Could you give us a quick update on OPP123?', 'It only takes a minute.']
];
v74.forEach(function (c) {
    var h = c[1];
    ok(h.length > 5000, c[0] + ': email rendered (' + h.length + ' chars)');
    ok(/<td align="center" valign="top" bgcolor="#59315f" class="pad" style="background-color:#59315f;padding:36px 48px 40px 48px;/.test(h), c[0] + ': purple band #59315f (bgcolor attribute)');
    ok(h.indexOf('color="#e7d9ea"><b>' + c[2] + '</b></font>') !== -1 && /text-transform:uppercase/.test(h), c[0] + ': eyebrow "' + c[2] + '" (shown in capitals)');
    ok(new RegExp('<h1 class="h1"[^>]*><font [^>]*color="#ffffff">' + c[3].replace(/[?]/g, '\\?') + '</font></h1>').test(h), c[0] + ': headline = the subject');
    var band = (/bgcolor="#59315f" class="pad"[^>]*>([\s\S]*?)<\/td><\/tr>/.exec(h) || [])[1] || '';
    ok(countOf(band, '<p ') === 1 && /<\/h1>\n$/.test(band) && h.indexOf('#f3ecf4') === -1, c[0] + ': no greeting line in the band (eyebrow and headline only)');
    ok(h.indexOf('<img src="' + HERO_V2 + '" width="600" height="337" alt="" border="0" class="fluid"') !== -1, c[0] + ': the hero (Order conformation.jpg, 600 × 337)');
    ok(h.indexOf(c[4]) !== -1, c[0] + ': the message');
    ok(/<b>YOUR NU-HEAT CONTACT<\/b>/.test(h) && /<b>Sam Taylor<\/b>/.test(h) && /bgcolor="#f6f2f7"/.test(h), c[0] + ': the sender card');
    ok(/bgcolor="#25847a" class="pad" style="background-color:#25847a;/.test(h) && h.indexOf('color="#e6f3f1">' + FOOTER_V2 + '</font></p>') !== -1 && !/#00857d/.test(h), c[0] + ': teal footer #25847a with its one line inside');
    ok((h.match(/1604502\d+_white%20-%20(facebook|instagram|linkedin|twitter|youtube)\.png/g) || []).length === 5 && h.indexOf('logo%20wht%20on%20green.png') !== -1, c[0] + ': white logo and the five social icons');
    ok(h.indexOf('Best wishes') === -1 && h.indexOf('Any questions at all') === -1, c[0] + ': no "Best wishes" paragraph, no "just reply" line');
    var from = h.indexOf('<body'), order = ['logo%20green%20-%20transparent', 'bgcolor="#59315f"', HERO_V2, c[4] + '</font></p>', 'YOUR NU-HEAT CONTACT', 'bgcolor="#25847a"'].every(function (t) {
        var n = h.indexOf(t, from); if (n === -1) return false; from = n; return true;
    });
    ok(order, c[0] + ': in order — logo, band, hero, message, card, footer');
    ok(/<table role="presentation" class="width600 main-container" width="600" align="center"[^>]*style="width:100%;max-width:600px;"/.test(h), c[0] + ': one 600px centred column');
});
ok(v74[0][1].indexOf('GIVE US AN UPDATE') === -1 && v74[0][1].indexOf('a=update') === -1, 'write: no button');

console.log('T75. Request an update: the GIVE US AN UPDATE button (v2 primary, #ffb500, centred, bulletproof)');
var b75 = v74[1][1];
var URL75 = cdbLink(55, 2) + '&a=update&opp=123';
var hrefs75 = []; b75.replace(/href="([^"]*a=update[^"]*)"/g, function (m, h) { hrefs75.push(h); });
ok(hrefs75.length === 2 && hrefs75.every(function (h) { return h === LIB.escapeHtml(URL75) && /&amp;a=update&amp;opp=123$/.test(h); }), 'href = the stored link + &a=update&opp=123 (escaped), in both halves of the pair');
ok(b75.indexOf('<td align="center" valign="top" style="padding:8px 0 16px 0;">\n' + LIB.emailButtonV2(URL75, 'GIVE US AN UPDATE')) !== -1, 'lib.emailButtonV2, in a centred cell');
var btn75 = LIB.emailButtonV2(URL75, 'GIVE US AN UPDATE');
ok(/<table [^>]*align="center"[^>]*bgcolor="#ffb500" style="background-color:#ffb500;border-radius:6px;/.test(btn75) && /color="#3e3b39"><b>GIVE US AN UPDATE<\/b>/.test(btn75), 'yellow #ffb500, text #3e3b39, by bgcolor and <font color>');
ok(countOf(btn75, '<!--[if !mso]><!-- -->') === 1 && countOf(btn75, '<!--[if mso]>') === 1 && !/display:\s*none/.test(btn75), 'one [if !mso] / [if mso] pair, no display:none');
ok(b75.indexOf('It only takes a minute.') < b75.indexOf('GIVE US AN UPDATE') && b75.indexOf('When you have a moment') === -1, 'with a message: the message, then the button; no fixed line');
var b75e = v2Update({ custpage_email_message: '' });
ok(b75e.indexOf('When you have a moment, let us know where your project is up to.') !== -1 &&
   b75e.indexOf('When you have a moment') < b75e.indexOf('GIVE US AN UPDATE') && b75e.indexOf('GIVE US AN UPDATE') < b75e.indexOf('YOUR NU-HEAT CONTACT'),
   'empty message: the fixed line, then the button, then the card');
ok(b75e.indexOf('overflow:hidden;">When you have a moment, let us know where your project is up to. It only takes a minute, a</span>') !== -1, 'empty message: the preheader is the fixed line');

console.log('T76. Escaping: the subject in the band and <title>, the message in the body — both modes');
var SUBJ76 = 'Q&A <b>"hot"</b> {{X}}', MSG76 = 'Line <i>one</i> & "two"\nnext {{Y}}';
[['write', v2Write({ custpage_email_subject: SUBJ76, custpage_email_message: MSG76 })], ['update', v2Update({ custpage_email_subject: SUBJ76, custpage_email_message: MSG76 })]].forEach(function (c) {
    var h = c[1];
    ok(h.indexOf('<font face="Calibri, Arial, sans-serif" color="#ffffff">Q&amp;A &lt;b&gt;&quot;hot&quot;&lt;/b&gt; &#123;&#123;X}}</font></h1>') !== -1 && h.indexOf('<title>Q&amp;A &lt;b&gt;&quot;hot&quot;&lt;/b&gt; &#123;&#123;X}}</title>') !== -1, c[0] + ': subject escaped in the band and the title');
    ok(h.indexOf('Line &lt;i&gt;one&lt;/i&gt; &amp; &quot;two&quot;<br>next &#123;&#123;Y}}</font></p>') !== -1 && h.indexOf('<i>') === -1 && h.indexOf('<b>"hot"') === -1, c[0] + ': message escaped; a single newline kept as <br>');
    ok(!/\{\{/.test(h), c[0] + ': no "{{" anywhere');
});
var b76p = v2Write({ custpage_email_message: 'One\n\n\nTwo\nthree' });
var paras76 = b76p.match(/<p style="margin:0 0 16px 0;[^"]*font-size:17px;line-height:25px;color:#2b2a2e;text-align:left;"><font [^>]*>[\s\S]*?<\/font><\/p>/g) || [];
ok(paras76.length === 2 && /Two<br>three<\/font><\/p>$/.test(paras76[1]), 'blank lines → paragraphs in the v2 body style (17px / 25px, #2b2a2e)');

console.log('T77. The sender card');
var b77 = v74[0][1];
ok(/<b>CALL SAM<\/b>/.test(b77) && /<b>EMAIL SAM<\/b>/.test(b77) && countOf(b77, 'href="tel:01404549770"') === 2 && countOf(b77, 'href="mailto:sam.taylor@nu-heat.co.uk"') === 2, 'CALL SAM → tel:, EMAIL SAM → mailto: (each in both halves of its pair)');
ok(/<table [^>]*bgcolor="#59315f"[^>]*>\n<tr><td [^>]*><a href="tel:/.test(b77) && /bgcolor="#59315f" style="background-color:#59315f;border-radius:6px;border-collapse:separate;">\n<tr><td align="center" valign="middle" bgcolor="#59315f" style="padding:2px;border-radius:6px;">\n<table [^>]*bgcolor="#ffffff"/.test(b77), 'CALL purple filled; EMAIL purple outline (an outer bgcolor frame)');
ok(b77.indexOf('<span class="cl-line">01404 549 770</span><span class="cl-sep"> · </span><span class="cl-line">sam.taylor@nu-heat.co.uk</span>') !== -1, 'name, phone · email');
ok(/<img src="https:\/\/1234567\.app\.netsuite\.com\/core\/media\/media\.nl\?id=5&amp;c=1234567&amp;h=ab" width="96" height="96" alt="Sam Taylor"/.test(b77), 'https photo shown, 96px');
var b77h = v2Write({}, function () { state.employee.custentity_employee_photo_link = 'http://insecure.example/p.jpg'; });
ok(!/width="96"/.test(b77h) && b77h.indexOf('insecure.example') === -1, 'http photo → no photo row');
var b77n = v2Write({}, function () { state.employee.phone = ''; });
ok(b77n.indexOf('tel:') === -1 && !/CALL SAM/.test(b77n) && /<b>EMAIL SAM<\/b>/.test(b77n) && b77n.indexOf('<span class="cl-sep">') === -1 &&
   /<td class="stack" width="100%"[^>]*>\n<!--\[if !mso\]><!-- -->\n<table [^>]*bgcolor="#59315f"/.test(b77n), 'no phone → the email line alone, no CALL button, EMAIL full width (as 1.1.0)');
ok(b77n.indexOf('01404 540604') === -1 && b77n.indexOf('info@nu-heat.co.uk') === -1, 'no phone → no office fallback (this repo\'s rule, not the dashboard\'s)');
var b77d = v2Write({}, function () { state.employee.phone = 'ask for Sam'; });
ok(b77d.indexOf('ask for Sam</span>') !== -1 && b77d.indexOf('tel:') === -1, 'a phone with no digits → shown, no CALL button');
var b77f = v2Write({}, function () { state.employee.firstname = ''; state.employee.lastname = ''; state.employee.entityid = ''; });
ok(/<b>Nu-Heat<\/b>/.test(b77f) && /<b>CLICK TO CALL<\/b>/.test(b77f) && /<b>SEND AN EMAIL<\/b>/.test(b77f), 'no name → "Nu-Heat", CLICK TO CALL / SEND AN EMAIL');
var b77e = v2Write({ custpage_email_from: 'me' }, function () { state.employee.email = ''; });
ok(state.emails.length === 0, 'missing sender email → not sent (refused before the card, as 1.1.0)');
var c77 = LIB.emailSenderCardV2({ fullName: 'A B', firstName: 'A', phone: '', photoUrl: '' }, '', 'L');
ok(c77.indexOf('mailto:') === -1 && c77.indexOf('tel:') === -1 && c77.indexOf('<td class="stack"') === -1, 'lib: no phone and no email → no buttons');
var b77p = v2Write({ custpage_email_from: 'pe' }, withTeam);
ok(b77p.indexOf('href="mailto:design@nu-heat.co.uk"') !== -1 && b77p.indexOf('pat.pe@') === -1 && /<b>CALL PAT<\/b>/.test(b77p), 'the PE: design@nu-heat.co.uk on the card (Send Design\'s rule)');

console.log('T78. The "Request an update" prefill no longer ends with "Thanks,"');
[{ isperson: true, firstname: 'Ann' }, { isperson: false, firstname: '' }].forEach(function (x) {
    resetState(); withLink(x);
    var m = kindAttr(html(runGet()), 'message') || '';
    ok(/It only takes a minute\.$/.test(m) && m.indexOf('Thanks') === -1, (x.isperson ? 'person' : 'company') + ': ends after "It only takes a minute."');
});

console.log('T79. Outlook safety (Send Quote 2.2.0 rules) for the v2 shell');
[['write', v74[0][1], ['CALL SAM', 'EMAIL SAM']], ['update', v74[1][1], ['GIVE US AN UPDATE', 'CALL SAM', 'EMAIL SAM']], ['no phone', b77n, ['EMAIL SAM']]].forEach(function (c) {
    var h = c[1];
    ok(!/display:\s*(flex|grid|inline-flex)|grid-template|flex-direction|float\s*:/i.test(h) && !/<div\b/i.test(h), c[0] + ': tables only — no flex, grid, float or <div>');
    var w = h.match(/<[a-z]+[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>/gi) || [];
    ok(w.length === 1 && /^<span style="display:none;font-size:0px/.test(w[0]) && !/mso-hide/i.test(h), c[0] + ': only the preheader span is display:none');
    ok(countOf(h, '<!--[if !mso]><!-- -->') === c[2].length && countOf(h, '<!--[if mso]>\n<table') === c[2].length, c[0] + ': one [if !mso] / [if mso] pair per button (' + c[2].length + ')');
    var ov = outlookViewV2(h), fs_ = fullyStrippedV2(h);
    c[2].forEach(function (b) { ok(countOf(ov, '<b>' + b + '</b>') === 1 && countOf(fs_, '<b>' + b + '</b>') === 1, c[0] + ': "' + b + '" once in Outlook and once fully stripped'); });
    ok(!/<style/i.test(fs_) && !/\sstyle=/.test(fs_), c[0] + ': stripped view has no CSS left');
    ok(/<table [^>]*class="width600 main-container"[^>]* width="600" align="center"/.test(fs_), c[0] + ': stripped: container width="600" align="center"');
    ok(/bgcolor="#59315f"[^>]*>\n<p[^>]*><font [^>]*color="#e7d9ea">/.test(fs_) && /<h1 class="h1"><font [^>]*color="#ffffff">/.test(fs_) && /bgcolor="#25847a"/.test(fs_) && /bgcolor="#f6f2f7"/.test(fs_),
       c[0] + ': stripped: band, footer and card coloured by attributes, text by <font color>');
    ok((h.match(/<(p|h1)\b[^>]*>/g) || []).every(function (t) { return / style="[^"]*font-family:/.test(t); }), c[0] + ': every <p> / <h1> carries its own inline font style');
    ok((h.match(/<table\b[^>]*>/g) || []).every(function (t) { return /role="presentation"/.test(t) && /cellpadding=/.test(t) && /border="0"/.test(t); }), c[0] + ': every table is role="presentation" with cellpadding and border attributes');
    ok(/<!--\[if mso\]><table role="presentation" width="600" align="center"/.test(h) && /<!--\[if mso\]>\n<style>h1, h2, p, td, a, span, font \{ font-family:Arial/.test(h), c[0] + ': the mso 600px wrapper and Arial override');
});

console.log('T80. Send Quote unchanged: emailShell / emailRepCard / emailButton byte-identical to lib 1.3.0');
var SQ80 = {
    title: 'T', preheader: 'P', headerLabel: 'L', headerH1: 'H', headerSub: 'S', rows: '<tr><td>R</td></tr>\n',
    card: { intro: '<p>I</p>', html: LIB.emailRepCard({ name: 'N', phone: '1', email: 'e@x.y', photo: 'https://p/x.jpg', tel: '1', mailto: 'e@x.y', firstUpper: 'N' }, 'C') },
    footerLine: 'F'
};
var SQ80_HASH = 'b46890dbda68dc3d1d9f9f780e2fe2cf9d61286ede2b73bd83ee60c303c9ae77';   // captured from lib 1.3.0 (origin/main d14ccb4)
ok(sha(LIB.emailShell(SQ80) + LIB.emailButton('h', 'l')) === SQ80_HASH, 'the 1.3.0 functions\' output, same SHA-256' + (sha(LIB.emailShell(SQ80) + LIB.emailButton('h', 'l')) === SQ80_HASH ? '' : ' (got ' + sha(LIB.emailShell(SQ80) + LIB.emailButton('h', 'l')) + ')'));

console.log('T81. Previews in docs/email-previews match the fixtures');
var PREVIEWS = {
    'update-opportunity-write-email.html':     function () { return v2Write({ custpage_email_subject: 'Your heat pump options', custpage_email_message: 'Hi Ann,\n\nThanks for your time on the phone today. As promised, I’ve attached the updated layout for the ground floor, with the extra zone in the snug.\n\nShall we pencil in a call next week to go through it together?' }); },
    'update-opportunity-request-update.html':  function () { return v2Update({ custpage_email_subject: 'Could you give us a quick update on OPP123?', custpage_email_message: PREFILL_V2 }); },
    'update-opportunity-request-update-empty-message.html': function () { return v2Update({ custpage_email_subject: 'Could you give us a quick update on OPP123?', custpage_email_message: '' }); }
};
Object.keys(PREVIEWS).forEach(function (f) {
    var file = path.join(ROOT, 'docs', 'email-previews', f);
    var body = PREVIEWS[f]();
    if (process.env.WRITE_EMAIL_PREVIEWS) fs.writeFileSync(file, body);
    ok(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body, f + ' is the current email');
});

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
