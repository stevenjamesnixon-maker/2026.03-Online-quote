/**
 * Tests for Create order part 1: nuheat_create_order_sl.js 1.1.0, nuheat_order_lib.js 1.1.0, and the
 * Opportunity UE 1.5.1 button and banner (amendment 1: every setting from customrecord_cdb_setting). Same style as update-opp.js: `define` is stubbed, the real
 * Suitelet, libraries and UE are loaded under stubbed N/* modules, every scenario is checked with ok(),
 * non-zero exit on failure. The stubs keep a governance ledger (standard SuiteScript unit costs).
 *
 *   C1–C4    listing (open quotes only, Expired, deposit only for up-front customers, units prefilled)
 *   C5–C17   validation (nothing written, the token not claimed)
 *   C18–C21  project type inference (pure, the page, the server)
 *   C22–C28  convertQuote
 *   C29–C31  multi-quote, nothing created
 *   C32–C33  duplicates
 *   C34–C38  the opportunity write (last; sub-status / value proposition / status)
 *   C39–C40  defaults (sub-status, value proposition)
 *   C41–C43  the email
 *   C44–C47  the mode switch (Suitelet and button)
 *   C48–C50  the banner (nsqs=ord)
 *   C51      governance
 *   C52      no change to the live pages (amendment 1: the Send Quote suite gains only an N/cache stub)
 *   C53–C61  amendment 1: settings from customrecord_cdb_setting (page, POST, UE cache, the pure parser)
 *   C62–C64  amendment 3: partner commission always written as £ (C22 updated: % now writes both fields)
 *   amendment 4: C41–C43b rewritten — one template select, one email per submission filed on the opportunity
 *   C65      amendment 5: the commission £ inline ("→ £64.33", % only); C41: the attachments note
 *
 *   node test/create-order.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var cp   = require('child_process');

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
        console: console, Date: Date, JSON: JSON, Math: Math, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat,
        parseInt: parseInt, String: String, Array: Array, Object: Object, Error: Error, Number: Number
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
    var args = captured.deps.map(function (d) {
        if (!(d in modules)) throw new Error(file + ': no stub for ' + d);
        return modules[d];
    });
    return captured.factory.apply(null, args);
}

// ─── State ─────────────────────────────────────────────────────────────────────

function pad(n) { return (n < 10 ? '0' : '') + n; }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dmy(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
var NOWD = new Date();
var FUTURE = new Date(NOWD.getFullYear(), NOWD.getMonth(), NOWD.getDate() + 20);
var PAST   = new Date(NOWD.getFullYear(), NOWD.getMonth(), NOWD.getDate() - 3);

// Amendment 1: the settings rows (customrecord_cdb_setting). '' = a blank row (missing). Dashboard rows
// and a look-alike Name are there too: neither must be read.
var DEFAULT_SETTINGS = {
    ORDER_MODE:              'ALL',
    ORDER_SO_FORM:           '150',
    ORDER_RECORD_STATUS:     '7',
    NEEDINFO_SUBSTATUS:      '41',
    ORDER_SUBSTATUS_OPTIONS: '',
    ORDER_OPP_STATUS:        '',
    ORDER_PROJTYPE_MAP:      '{"5":"1","6":"3"}',
    ORDER_PROJTYPE_MIXED:    '2',
    PREPAY_TERMS:            '9',
    ORDER_PARENT_OPP_FIELD:  '',
    ORDER_EMAIL_TEMPLATES:   '3198,4186,3182,9999',   // amendment 2: 3182 inactive, 9999 missing
    WON_STATUSES:            '13',
    ORDER_MODE_OLD:          'OFF'
};

var state;
function resetState() {
    state = {
        calls: [], logs: [], writes: [], units: 0, redirect: null, pageMessages: [], emails: [],
        cache: {}, cacheThrows: null, nextSo: 7000, nextLog: 8000,
        roleId: 'customrole_nh_account_manager',
        settings: Object.keys(DEFAULT_SETTINGS).map(function (k, i) { return { id: String(301 + i), name: k, value: DEFAULT_SETTINGS[k], inactive: false }; }),
        settingsThrows: null,
        oppValues: {
            tranid: 'OPP123', title: 'Barn conversion', entity: '55', entitystatus: '10', salesrep: '30', custbody_pe: '',
            custbody_opportunity_sub_status: '40', custbody_value_proposition: '2',
            custbody_opp_site_adress: '1 Test Street',
            custbody_next_contact: new Date(2026, 9, 20), custbody_opp_del_date: new Date(2026, 10, 15),
            custbody_build_stage: '3', expectedclosedate: new Date(2026, 11, 20), custbody_parent_opp: ''
        },
        oppTexts: { entity: 'Customer Ltd', entitystatus: 'Proposal', salesrep: 'Rita Rep' },
        fieldTypes: { entitystatus: 'select', custbody_next_contact: 'date', custbody_opp_del_date: 'date', custbody_build_stage: 'select',
                      expectedclosedate: 'date', custbody_opportunity_sub_status: 'select', custbody_value_proposition: 'select' },
        options: {
            entitystatus: [{ value: '10', text: 'Proposal' }, { value: '12', text: 'Quoted' }, { value: '13', text: 'Closed Won' }],
            custbody_build_stage: [{ value: '3', text: 'Foundations' }, { value: '4', text: 'Roof on' }],
            custbody_opportunity_sub_status: [{ value: '', text: '' }, { value: '40', text: 'Quoted' }, { value: '41', text: 'Awaiting Design Info' },
                                              { value: '42', text: 'Design Required' }, { value: '43', text: 'On &amp; hold' }],
            custbody_value_proposition: [{ value: '1', text: 'UFH Design' }, { value: '2', text: 'UFH Design +' }, { value: '3', text: 'HP Design' }]
        },
        lookup: { custbody_next_contact: '20/10/2026' },
        lists: {
            customlist_bund_proj_type: [{ id: '1', name: 'UFH Only' }, { id: '2', name: 'UFH & Renewables' }, { id: '3', name: 'Renewables Only' }, { id: '4', name: 'Parts' }],
            customlist_order_auth: [{ id: '1', name: 'Email confirmation' }, { id: '2', name: 'System order form' }, { id: '3', name: 'Deposit' },
                                    { id: '4', name: 'Purchase Order' }, { id: '5', name: 'Online acceptance' }, { id: '6', name: 'Verbal' }]
        },
        estimates: [
            { id: '901', opp: '123', tranid: 'EST901', title: 'UFH ground floor', desc: 'UFH &lt;b&gt;ground&lt;/b&gt; floor', status: 'A', qt: '5', qtText: 'UFH',
              total: 12000, exvat: 10000, units: '4', deposit: '1200.00', due: dmy(FUTURE), created: '02/10/2026 10:15' },
            { id: '902', opp: '123', tranid: 'EST902', title: 'Heat pump', desc: 'ASHP', status: 'A', qt: '6', qtText: 'Heat Pump (ASHP)',
              total: 2250, exvat: 2142.86, units: '', deposit: '0', due: dmy(PAST), created: '01/10/2026 09:00' },
            { id: '903', opp: '123', tranid: 'EST903', title: 'Spares', desc: '', status: 'A', qt: '9', qtText: 'Parts',
              total: 500, exvat: 416.67, units: '1', deposit: '', due: '', created: '30/09/2026 08:00' },
            { id: '904', opp: '123', tranid: 'EST904', title: 'Old', desc: 'Converted', status: 'P', qt: '5', qtText: 'UFH',
              total: 900, exvat: 750, units: '2', deposit: '', due: '', created: '01/09/2026 08:00' },
            { id: '950', opp: '777', tranid: 'EST950', title: 'Other opp', desc: '', status: 'A', qt: '5', qtText: 'UFH',
              total: 100, exvat: 83.33, units: '1', deposit: '', due: '', created: '01/10/2026 08:00' }
        ],
        salesOrders: [],
        carryBlank: [],          // fields the transform leaves blank
        soTotalDelta: {},        // est id → added to the transformed SO's total
        postSaveTotal: {},       // est id → the total lookupFields returns after save
        soSaveThrows: {},        // est id → message
        transformThrows: {},
        logSaveThrows: null,
        extrasThrows: null,
        soLookupNoTotal: false,
        customer: { email: 'cust@example.com', terms: [{ value: '9', text: 'Prepay' }] },
        contacts: [{ id: '71', first: 'Ann', last: 'Lee', email: 'ann@example.com', company: '55' }],
        employees: {
            '7':  { firstname: 'Sam', lastname: 'Taylor', entityid: 'Sam Taylor', email: 'sam.taylor@nu-heat.co.uk', phone: '01404 549 770', issalesrep: true, isinactive: false },
            '30': { firstname: 'Rita', lastname: 'Rep', entityid: 'Rita Rep', email: 'rita@nu-heat.co.uk', phone: '01404 000 111', issalesrep: true, isinactive: false },
            '31': { firstname: 'Old', lastname: 'Rep', entityid: 'Old Rep', email: 'old@nu-heat.co.uk', phone: '', issalesrep: true, isinactive: true },
            '32': { firstname: 'Not', lastname: 'Arep', entityid: 'Not Arep', email: 'not@nu-heat.co.uk', phone: '', issalesrep: false, isinactive: false },
            '33': { firstname: 'Una', lastname: 'Flagged', entityid: 'Una Flagged', email: 'una@nu-heat.co.uk', phone: '', issalesrep: false, isinactive: false }
        },
        // amendment 2: email templates (the emailtemplate search), merges, uploads
        templates: { '3198': { name: 'Order confirmation – UFH', inactive: false }, '4186': { name: 'Order confirmation – Heat pump', inactive: false },
                     '3182': { name: 'Old confirmation', inactive: true }, '4185': { name: 'Order confirmation – Parts', inactive: false } },
        templateSearchThrows: null, repSearchThrows: null, mergeThrows: {}, merges: [], files: {}
    };
}

function charge(n) { state.units += n; }

/** Sets one settings row's value (undefined removes every row for the key). */
function setSetting(key, value) {
    state.settings = state.settings.filter(function (r) { return r.name !== key; });
    if (value !== undefined) state.settings.push({ id: String(400 + state.settings.length), name: key, value: value, inactive: false });
}
function uiCacheKey() { return 'nh_opp_ue_order_mode|PRIVATE|order_mode'; }

var logStub = {};
['debug', 'audit', 'error', 'emergency'].forEach(function (lvl) {
    logStub[lvl] = function (title, details) { state.logs.push({ level: lvl, title: title, details: String(details) }); };
});

var formatStub = {
    Type: { DATE: 'date', DATETIME: 'datetime' },
    format: function (o) { return dmy(o.value); },
    parse: function (o) {
        if (o.value instanceof Date) return o.value;
        var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(o.value));
        if (!m) throw new Error('not a date: ' + o.value);
        return new Date(+m[3], +m[2] - 1, +m[1]);
    }
};

var serverWidgetStub = {
    FieldType: { INLINEHTML: 'inlinehtml' },
    createForm: function (o) {
        return { title: o.title, fields: [], buttons: [],
                 addField: function (fo) { var f = { id: fo.id, type: fo.type, defaultValue: undefined }; this.fields.push(f); return f; },
                 addButton: function (b) { this.buttons.push(b); } };
    }
};

function makeOppRecord() {
    return {
        getValue: function (o) { return state.oppValues[o.fieldId]; },
        getText: function (o) { return state.oppTexts[o.fieldId] || ''; },
        getField: function (o) {
            var t = state.fieldTypes[o.fieldId];
            if (!t) return null;
            return { type: t, getSelectOptions: function () { return state.options[o.fieldId] || []; } };
        }
    };
}

function estById(id) { return state.estimates.filter(function (e) { return e.id === String(id); })[0]; }

function makeSoRecord(est) {
    var v = {
        entity: '55', opportunity: est.opp, custbody_quote_type: est.qt, salesrep: '30', department: '3', terms: '9',
        custbody_qdt_number_of_units: est.units, custbody_deposit: est.deposit,
        total: est.total + (state.soTotalDelta[est.id] || 0),
        taxtotal: state.taxBlank ? '' : Math.round((est.total - est.exvat) * 100) / 100   // amendment 3: base = total − taxtotal = the ex VAT
    };
    state.carryBlank.forEach(function (f) { v[f] = ''; });
    return {
        values: v,
        getValue: function (o) { return v[o.fieldId] === undefined ? '' : v[o.fieldId]; },
        setValue: function (o) { v[o.fieldId] = o.value; },
        save: function (opts) {
            charge(20);
            state.calls.push('save:salesorder:' + est.id);
            state.lastSaveOptions = opts;
            if (state.soSaveThrows[est.id]) throw new Error(state.soSaveThrows[est.id]);
            var id = String(state.nextSo++);
            var so = { id: id, tranid: 'SO' + (239950 + state.salesOrders.length), createdfrom: est.id, opportunity: String(v.opportunity || ''),
                       total: state.postSaveTotal.hasOwnProperty(est.id) ? state.postSaveTotal[est.id] : v.total, values: v };
            state.salesOrders.push(so);
            state.writes.push({ kind: 'create', type: 'salesorder', id: id, values: v, from: est.id });
            return id;
        }
    };
}

var recordStub = {
    Type: { OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', SALES_ORDER: 'salesorder' },
    load: function (o) {
        charge(10);
        state.calls.push('load:' + o.type);
        if (o.type === 'opportunity') return makeOppRecord();
        throw new Error('unexpected load of ' + o.type);
    },
    transform: function (o) {
        charge(10);
        state.calls.push('transform:' + o.fromId);
        state.lastTransform = o;
        if (state.transformThrows[o.fromId]) throw new Error(state.transformThrows[o.fromId]);
        return makeSoRecord(estById(o.fromId));
    },
    create: function (o) {
        charge(2);
        state.calls.push('create:' + o.type);
        var values = {};
        return {
            values: values,
            setValue: function (s) { values[s.fieldId] = s.value; },
            save: function () {
                charge(4);
                state.calls.push('save:' + o.type);
                if (state.logSaveThrows) throw new Error(state.logSaveThrows);
                var id = String(state.nextLog++);
                state.writes.push({ kind: 'create', type: o.type, id: id, values: values });
                return id;
            }
        };
    },
    submitFields: function (o) {
        charge(10);
        state.calls.push('submitFields:' + o.type);
        state.writes.push({ kind: 'submitFields', type: o.type, id: o.id, values: o.values, options: o.options });
        if (state.submitThrows) throw new Error(state.submitThrows);
        return o.id;
    }
};

function filters(fs) { return (fs || []).filter(function (f) { return Array.isArray(f); }); }
function fval(fs, name) { var f = filters(fs).filter(function (x) { return x[0] === name; })[0]; return f ? f[2] : undefined; }
function anyof(v, x) { return Array.isArray(v) ? v.map(String).indexOf(String(x)) !== -1 : String(v) === String(x); }
function colName(c) { return typeof c === 'string' ? c : c.name; }
function row(vals, texts) {
    return {
        getValue: function (o) { var k = colName(o); return vals[k] === undefined ? '' : vals[k]; },
        getText: function (o) { var k = colName(o); return (texts || {})[k] || ''; }
    };
}
function resultSet(rows, throwMsg) {
    return {
        run: function () {
            return {
                each: function (cb) { charge(10); if (throwMsg) throw new Error(throwMsg); for (var i = 0; i < rows.length; i++) { if (cb(rows[i]) === false) break; } },
                getRange: function () { charge(10); if (throwMsg) throw new Error(throwMsg); return rows; }
            };
        }
    };
}

var searchStub = {
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate', SALES_ORDER: 'salesorder', EMPLOYEE: 'employee', CONTACT: 'contact', PHONE_CALL: 'phonecall' },
    Sort: { DESC: 'DESC', ASC: 'ASC' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        charge(1);
        state.calls.push('lookupFields:' + o.type + ':' + o.columns.join(','));
        var out = {};
        if (o.type === 'opportunity') {
            o.columns.forEach(function (c) {
                if (c === 'custbody_parent_opp') out[c] = state.oppValues.custbody_parent_opp ? [{ value: state.oppValues.custbody_parent_opp, text: 'OPP1' }] : [];
                else out[c] = state.lookup[c] === undefined ? '' : state.lookup[c];
            });
            return out;
        }
        if (o.type === 'employee') {
            var emp = state.employees[String(o.id)];
            if (!emp) throw new Error('no employee ' + o.id);
            o.columns.forEach(function (c) { out[c] = emp[c] === undefined ? '' : emp[c]; });
            return out;
        }
        if (o.type === 'customer') {
            o.columns.forEach(function (c) { out[c] = state.customer[c] === undefined ? '' : state.customer[c]; });
            return out;
        }
        if (o.type === 'salesorder') {
            var so = state.salesOrders.filter(function (s) { return s.id === String(o.id); })[0];
            if (!so) throw new Error('no SO ' + o.id);
            return { tranid: so.tranid, total: state.soLookupNoTotal ? '' : String(so.total) };
        }
        return out;
    },
    create: function (o) {
        state.calls.push('search:' + o.type + ':' + (o.columns || []).map(colName).join(','));
        var cols = (o.columns || []).map(colName);
        if (o.type === 'estimate') {
            var rows = state.estimates.filter(function (e) {
                var opp = fval(o.filters, 'opportunity'), st = fval(o.filters, 'status'), ids = fval(o.filters, 'internalid');
                if (opp !== undefined && !anyof(opp, e.opp)) return false;
                if (st !== undefined && !(anyof(st, 'Estimate:A') && e.status === 'A')) return false;
                if (ids !== undefined && !anyof(ids, e.id)) return false;
                return true;
            }).map(function (e) {
                return row({ internalid: e.id, tranid: e.tranid, title: e.title, custbody_quote_description: e.desc, custbody_quote_type: e.qt,
                             total: String(e.total), duedate: e.due, datecreated: e.created, opportunity: e.opp,
                             custbody_qdt_number_of_units: e.units, custbody_deposit: e.deposit, netamountnotax: String(e.exvat) },
                           { custbody_quote_type: e.qtText });
            });
            var isExtras = cols.indexOf('custbody_qdt_number_of_units') !== -1;
            return resultSet(rows, isExtras ? state.extrasThrows : null);
        }
        if (o.type === 'salesorder') {
            var from = fval(o.filters, 'createdfrom'), sids = fval(o.filters, 'internalid'), sopp = fval(o.filters, 'opportunity');
            var srows = state.salesOrders.filter(function (s) {
                if (from !== undefined && !anyof(from, s.createdfrom)) return false;
                if (sids !== undefined && !anyof(sids, s.id)) return false;
                if (sopp !== undefined && !anyof(sopp, s.opportunity)) return false;
                return true;
            }).map(function (s) { return row({ internalid: s.id, tranid: s.tranid, createdfrom: s.createdfrom, total: String(s.total) }); });
            return resultSet(srows, from !== undefined ? state.dupSearchThrows : null);
        }
        if (o.type === 'customrecord_cdb_setting') {
            state.settingsSearches = (state.settingsSearches || 0) + 1;
            var f = o.filters || [];
            var inact = fval(f, 'isinactive');
            var names = [];
            (function collect(x) {
                if (!Array.isArray(x)) return;
                if (x[0] === 'name' && x[1] === 'contains') { names.push(String(x[2]).toLowerCase()); return; }
                x.forEach(collect);
            })(f);
            var srow = state.settings.filter(function (r) {
                if (inact === 'F' && r.inactive) return false;
                var n = String(r.name).toLowerCase();
                return names.some(function (k) { return n.indexOf(k) !== -1; });
            }).map(function (r) { var x = row({ name: r.name, custrecord_cdb_setting_value: r.value }); x.id = r.id; return x; });
            return resultSet(srow, state.settingsThrows);
        }
        if (o.type.indexOf('customlist_') === 0) {
            return resultSet((state.lists[o.type] || []).map(function (l) { return row({ internalid: l.id, name: l.name }); }));
        }
        if (o.type === 'employee') {
            // As Production (6 Oct): issalesrep is not a valid Employee search filter; salesrep is
            if (fval(o.filters, 'issalesrep') !== undefined) throw new Error('An nlobjSearchFilter contains invalid search criteria: issalesrep.');
            state.repFilter = fval(o.filters, 'salesrep');
            var reps = Object.keys(state.employees).filter(function (id) { var e = state.employees[id]; return (state.repFilter !== 'T' || e.issalesrep) && !e.isinactive; })
                .map(function (id) { return row({ internalid: id, entityid: state.employees[id].entityid }); });
            return resultSet(reps, state.repSearchThrows);
        }
        if (o.type === 'emailtemplate') {
            var tids = fval(o.filters, 'internalid') || [];
            return resultSet(Object.keys(state.templates).filter(function (id) { return anyof(tids, id); }).map(function (id) {
                return row({ internalid: id, name: state.templates[id].name, isinactive: state.templates[id].inactive ? 'T' : 'F' });
            }), state.templateSearchThrows);
        }
        if (o.type === 'opportunity') {
            return resultSet(state.contacts.map(function (c) { return row({ internalid: c.id, firstname: c.first, lastname: c.last, email: c.email, company: c.company }); }));
        }
        return resultSet([]);
    }
};

var modules = {
    'N/ui/serverWidget': serverWidgetStub,
    'N/search': searchStub,
    'N/record': recordStub,
    'N/log': logStub,
    'N/format': formatStub,
    'N/url': {
        resolveRecord: function (o) { return '/app/accounting/transactions/' + (o.recordType === 'estimate' ? 'estimate' : 'opprtnty') + '.nl?id=' + o.recordId; },
        resolveScript: function () { return '/sl'; }
    },
    'N/redirect': { toRecord: function (o) { state.calls.push('redirect'); state.redirect = o; } },
    'N/runtime': {
        getCurrentUser: function () { return { id: '7', name: 'Sam Taylor', roleId: state.roleId }; },
        getCurrentScript: function () {
            return {
                getParameter: function (o) {
                    state.calls.push('getParameter:' + o.name);
                    return undefined;   // amendment 1: Create order has no script parameters
                },
                getRemainingUsage: function () { return 1000 - state.units; }
            };
        }
    },
    'N/ui/message': { Type: { CONFIRMATION: 'confirmation', WARNING: 'warning', INFORMATION: 'information' } },
    // amendment 2: mergeEmail and email.send charged 20 each (the conservative figures)
    'N/render': {
        mergeEmail: function (o) {
            charge(20);
            state.calls.push('render.mergeEmail:' + o.templateId + ':' + o.transactionId);
            state.merges.push(o);
            if (state.mergeThrows[String(o.templateId)]) throw new Error(state.mergeThrows[String(o.templateId)]);
            return { subject: 'Your order ' + o.transactionId, body: '<p>Template ' + o.templateId + ' for SO ' + o.transactionId + '</p>' };
        }
    },
    'N/email': {
        send: function (o) {
            charge(20);
            state.calls.push('email.send');
            if (state.emailThrows) throw new Error(state.emailThrows);
            state.emails.push(o);
        }
    },
    'N/cache': {
        Scope: { PRIVATE: 'PRIVATE', PROTECTED: 'PROTECTED', PUBLIC: 'PUBLIC' },
        getCache: function (o) {
            if (state.cacheThrows) throw new Error(state.cacheThrows);
            var ns = o.name + '|' + o.scope + '|';
            return {
                get:    function (g) { charge(1); state.calls.push('cache.get:' + o.name); return Object.prototype.hasOwnProperty.call(state.cache, ns + g.key) ? state.cache[ns + g.key] : null; },
                put:    function (p) { charge(1); state.calls.push('cache.put:' + o.name); state.cache[ns + p.key] = p.value; },
                remove: function (r) { charge(1); state.calls.push('cache.remove:' + o.name); delete state.cache[ns + r.key]; }
            };
        }
    }
};
modules['./nuheat_opp_update_lib'] = loadModule('nuheat_opp_update_lib.js', modules);
modules['./nuheat_order_lib'] = loadModule('nuheat_order_lib.js', modules);
var orderLib = modules['./nuheat_order_lib'];
var sl = loadModule('nuheat_create_order_sl.js', modules);
var ue = loadModule('nuheat_opportunity_ue.js', modules);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function html(form) { return form ? form.fields.map(function (f) { return f.defaultValue || ''; }).join('\n') : ''; }
function runGet(params) {
    var ctx = { request: { method: 'GET', parameters: params || { opportunityId: '123' } }, response: { page: null, writePage: function (f) { this.page = f; } } };
    sl.onRequest(ctx);
    return html(ctx.response.page);
}
var tokenSeq = 0;
function post(overrides) {
    var p = {
        custpage_opportunity_id: '123',
        custpage_q_sel: '["901"]',
        custpage_units_901: '4', custpage_comm_kind_901: 'pct', custpage_comm_901: '',
        custpage_projtype: '', custpage_auth: '2', custpage_rep: '30',
        custpage_substatus: '41', custpage_valueprop: '2',
        custpage_upd_fields: 'build_stage,next_contact,del_date',
        custpage_upd_build_stage: '3', custpage_orig_build_stage: '3', custpage_origtxt_build_stage: 'Foundations',
        custpage_upd_next_contact: '2026-10-20', custpage_orig_next_contact: '2026-10-20', custpage_origtxt_next_contact: '20/10/2026',
        custpage_upd_del_date: '2026-11-15', custpage_orig_del_date: '2026-11-15', custpage_origtxt_del_date: '15/11/2026',
        custpage_email_on: 'F',
        custpage_save_token: 'tok-' + (++tokenSeq) + '-abcdefgh'
    };
    Object.keys(overrides || {}).forEach(function (k) {
        if (overrides[k] === undefined) delete p[k]; else p[k] = overrides[k];
    });
    // amendment 4: with the email on, the submission's template is 3198 unless the test sets one
    if (p.custpage_email_on === 'T' && !Object.prototype.hasOwnProperty.call(overrides || {}, 'custpage_email_tpl')) p.custpage_email_tpl = '3198';
    return p;
}
function upload(name, size) { return { name: name, size: size, fileType: 'PDF' }; }
function runPost(params, files) {
    var ctx = { request: { method: 'POST', parameters: params, files: files || {} }, response: { page: null, writePage: function (f) { this.page = f; } } };
    sl.onRequest(ctx);
    return { html: html(ctx.response.page), redirect: state.redirect };
}
function tokenClaimed() { return state.calls.some(function (c) { return c === 'cache.put:nh_create_order_save_guard'; }); }
function nothingWritten(r, label) {
    ok(state.writes.length === 0, label + ': nothing written');
    ok(!tokenClaimed(), label + ': the token is not claimed');
    ok(state.emails.length === 0, label + ': no email');
    ok(!r.redirect && r.html.indexOf('Not created.') !== -1, label + ': the page re-renders with "Not created."');
}
function writesOf(kind, type) { return state.writes.filter(function (w) { return w.kind === kind && w.type === type; }); }
function logged(title, re) { return state.logs.some(function (l) { return l.title === title && re.test(l.details); }); }
function between(s, a, b) { var i = s.indexOf(a); if (i === -1) return ''; var j = s.indexOf(b, i + a.length); return s.substring(i, j === -1 ? s.length : j); }

// ═══ Listing ═════════════════════════════════════════════════════════════════

console.log('C1. Listing: open quotes on this opportunity only, newest first');
resetState();
var g1 = runGet();
ok(g1.indexOf('data-qid="901"') !== -1 && g1.indexOf('data-qid="902"') !== -1 && g1.indexOf('data-qid="903"') !== -1, 'the three open quotes are listed');
ok(g1.indexOf('data-qid="904"') === -1, 'a converted (not open) quote is not listed');
ok(g1.indexOf('data-qid="950"') === -1, 'another opportunity’s quote is not listed');
ok(g1.indexOf('data-qid="901"') < g1.indexOf('data-qid="902"'), 'in the search’s order (datecreated DESC)');
var est = state.calls.filter(function (c) { return c.indexOf('search:estimate') === 0; });
ok(est.length === 2, 'two Estimate searches (header + extras), no Estimate loads (' + est.length + ')');
ok(!state.calls.some(function (c) { return c === 'load:estimate'; }), 'no record.load of an Estimate');
var l1 = orderLib.listOrderableQuotes('123', {});
ok(l1.quotes[0].id === '901' && l1.quotes[0].total === 12000 && l1.quotes[0].exVat === 10000 && l1.quotes[0].quoteTypeText === 'UFH', 'row: total, ex VAT, quote type');
ok(l1.quotes[0].description === 'UFH ground floor', 'description cleaned (entities decoded, tags stripped)');
ok(g1.indexOf('<a href="/app/accounting/transactions/estimate.nl?id=901" target="_blank" rel="noopener">EST901</a>') !== -1, 'quote number links to the quote in a new tab');
ok(g1.indexOf('£12,000.00') !== -1 && g1.indexOf('£10,000.00 ex VAT') !== -1, 'values inc and ex VAT');
ok(/<div class="nsq-qmeta">UFH · 02\/10\/2026<\/div>/.test(g1), 'type · date created');

console.log('C2. Listing: Expired tag when duedate is before today');
var r902 = between(g1, 'data-qid="902" data-tranid', 'data-qid="903" data-tranid');
var r901 = between(g1, 'data-qid="901" data-tranid', 'data-qid="902" data-tranid');
ok(r902.indexOf('<span class="nsq-tag-exp">Expired</span>') !== -1, 'EST902 (due in the past) is tagged Expired');
ok(r901.indexOf('Expired') === -1, 'EST901 (due in future) is not');
ok(between(g1, 'data-qid="903" data-tranid', 'nsq-qtotal').indexOf('Expired') === -1, 'EST903 (no due date) is not');
ok(l1.quotes[1].expired === true && l1.quotes[0].expired === false, 'lib: expired flag');

console.log('C3. Listing: deposit only for customers who pay up front');
ok(r901.indexOf('Deposit £1,200.00') !== -1, 'up-front customer: the deposit is shown');
ok(r902.indexOf('Deposit') === -1, 'a zero deposit is not shown');
resetState(); state.customer.terms = [{ value: '4', text: '30 days' }];
var g3 = runGet();
ok(g3.indexOf('Deposit £') === -1, 'credit terms: no deposit anywhere');
resetState(); setSetting('PREPAY_TERMS', '');
ok(runGet().indexOf('Deposit £') === -1, 'prepay parameter empty: no deposit anywhere');
ok(orderLib.paysUpFront('9', ['9']) === true && orderLib.paysUpFront('4', ['9']) === false && orderLib.paysUpFront('', ['9']) === true && orderLib.paysUpFront('9', []) === false,
   'paysUpFront: in list; not in list; blank terms (the dashboard’s rule); empty list');

console.log('C4. Listing: units prefilled; extras failure blanks them, the listing stands');
r901 = between(g1, 'data-qid="901" data-tranid', 'data-qid="902" data-tranid');
r902 = between(g1, 'data-qid="902" data-tranid', 'data-qid="903" data-tranid');
ok(r901.indexOf('name="custpage_units_901" maxlength="6" autocomplete="off" value="4"') !== -1, 'units prefilled from custbody_qdt_number_of_units');
ok(r902.indexOf('name="custpage_units_902" maxlength="6" autocomplete="off" value=""') !== -1, 'blank units stay blank');
resetState(); state.extrasThrows = 'SSS_INVALID_SRCH_COL';
var g4 = runGet();
ok(g4.indexOf('data-qid="901"') !== -1 && g4.indexOf('name="custpage_units_901" maxlength="6" autocomplete="off" value=""') !== -1, 'extras search fails → listed, units blank');
ok(g4.indexOf('Deposit £') === -1 && g4.indexOf(' ex VAT</span>') === -1, '… no deposit, no ex VAT');
ok(logged('CreateOrderSL.List', /extras .* could not be read/), '… logged at error');
resetState(); state.estimates = state.estimates.filter(function (e) { return e.opp !== '123' || e.status !== 'A'; });
var g4b = runGet();
ok(g4b.indexOf('No open quotes to order') !== -1, 'no open quotes → "No open quotes to order"');
ok(/<button type="button" class="nsq-btn nsq-btn-primary" id="nsq-send" disabled>Create orders<\/button>/.test(g4b), 'Create is disabled');
ok(g4b.indexOf('if (!rows().length) return "No open quotes to order.";') !== -1, 'and stays disabled (problem())');

// ═══ Validation — nothing written, the token not claimed ═════════════════════════

console.log('C5. Validation: a quote from another opportunity');
resetState();
nothingWritten(runPost(post({ custpage_q_sel: '["950"]', custpage_units_950: '1' })), 'other opportunity');
console.log('C6. Validation: a closed (converted) quote');
resetState();
var r6 = runPost(post({ custpage_q_sel: '["904"]', custpage_units_904: '1' }));
nothingWritten(r6, 'closed quote');
ok(r6.html.indexOf('is not an open quote on this opportunity') !== -1, 'reason shown');
console.log('C7. Validation: units missing or 0');
resetState(); nothingWritten(runPost(post({ custpage_units_901: '' })), 'units missing');
resetState(); nothingWritten(runPost(post({ custpage_units_901: '0' })), 'units 0');
resetState(); nothingWritten(runPost(post({ custpage_units_901: '2.5' })), 'units not whole');
console.log('C8. Validation: commission out of range');
resetState(); nothingWritten(runPost(post({ custpage_comm_901: '101' })), '101%');
resetState(); nothingWritten(runPost(post({ custpage_comm_kind_901: 'amt', custpage_comm_901: '-5' })), '£ negative');
resetState(); nothingWritten(runPost(post({ custpage_comm_kind_901: 'amt', custpage_comm_901: '10.555' })), '3 dp');
resetState(); nothingWritten(runPost(post({ custpage_comm_kind_901: 'xx', custpage_comm_901: '5' })), 'unknown kind');
console.log('C9. Validation: invalid project type or authority option');
resetState(); nothingWritten(runPost(post({ custpage_projtype: '99' })), 'project type 99');
resetState(); nothingWritten(runPost(post({ custpage_q_sel: '["903"]', custpage_units_903: '1', custpage_projtype: '' })), 'no project type, none inferred (unmapped)');
resetState(); nothingWritten(runPost(post({ custpage_auth: '99' })), 'authority 99');
resetState(); nothingWritten(runPost(post({ custpage_auth: '' })), 'no authority');
console.log('C10. Validation: the rep');
resetState(); nothingWritten(runPost(post({ custpage_rep: '31' })), 'inactive rep');
resetState(); nothingWritten(runPost(post({ custpage_rep: '32' })), 'not a sales rep');
resetState(); nothingWritten(runPost(post({ custpage_rep: '' })), 'no rep');
console.log('C11. Validation: next contact missing (D3, against the record)');
resetState(); state.lookup.custbody_next_contact = ''; state.oppValues.custbody_next_contact = null;
var r11 = runPost(post({ custpage_upd_next_contact: '', custpage_orig_next_contact: '' }));
nothingWritten(r11, 'next contact missing');
ok(r11.html.indexOf('Next contact is required — the opportunity has none. Set it in step 3.') !== -1, 'the D3 message');
console.log('C12. Validation: sub-status missing or not offered');
resetState(); nothingWritten(runPost(post({ custpage_substatus: '' })), 'sub-status missing');
resetState(); nothingWritten(runPost(post({ custpage_substatus: '99' })), 'sub-status not an option');
resetState(); setSetting('ORDER_SUBSTATUS_OPTIONS', '41,43');
var r12 = runPost(post({ custpage_substatus: '42' }));
nothingWritten(r12, 'sub-status outside substatus_options');
ok(r12.html.indexOf('Choose a sub-status from the list.') !== -1, 'reason shown');
console.log('C13. Validation: value proposition missing or not an option');
resetState(); nothingWritten(runPost(post({ custpage_valueprop: '' })), 'value proposition missing');
resetState(); nothingWritten(runPost(post({ custpage_valueprop: '9' })), 'value proposition not an option');
console.log('C14. Validation: nothing ticked / bad selection / too many');
resetState(); nothingWritten(runPost(post({ custpage_q_sel: '[]' })), 'nothing ticked');
resetState(); nothingWritten(runPost(post({ custpage_q_sel: 'oops' })), 'unreadable selection');
resetState(); nothingWritten(runPost(post({ custpage_q_sel: '["901","901"]' })), 'a quote twice');
console.log('C15. Validation: email fields');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'F', custpage_rcpt_contacts: '', custpage_rcpt_extra: '' })), 'no recipient');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_from: 'boss' })), 'unknown From code');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_rcpt_extra: 'not an address' })), 'bad other address');
console.log('C16. Validation: every entry is restored');
resetState();
var r16 = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '0', custpage_comm_kind_901: 'amt', custpage_comm_901: '250', custpage_auth: '5',
                         custpage_projtype: '4', custpage_substatus: '43', custpage_valueprop: '3', custpage_upd_del_date: '2027-01-05' }));
ok(r16.html.indexOf('Enter the units for EST902') !== -1, 'the reason names the quote');
ok(/class="nsq-qsel" data-qid="901" checked/.test(r16.html) && /class="nsq-qsel" data-qid="902" checked/.test(r16.html), 'both ticks restored');
ok(r16.html.indexOf('name="custpage_comm_901" maxlength="12" autocomplete="off" value="250"') !== -1 && /name="custpage_comm_kind_901" value="amt" checked/.test(r16.html), 'commission and its £ switch restored');
ok(r16.html.indexOf('name="custpage_units_902" maxlength="6" autocomplete="off" value="0"') !== -1, 'units as posted');
ok(/<option value="5" selected>Online acceptance/.test(r16.html) && /<option value="4" selected>Parts/.test(r16.html) && /data-touched="1"/.test(r16.html), 'authority and project type restored (project type marked as the rep’s)');
ok(/<option value="43" selected>On &amp; hold/.test(r16.html) && /<option value="3" selected>HP Design/.test(r16.html), 'sub-status and value proposition restored');
ok(r16.html.indexOf('value="2027-01-05"') !== -1, 'update field restored');
console.log('C17. Validation: a posted entitystatus key cannot ride along');
resetState();
var r17 = runPost(post({ custpage_upd_fields: 'entitystatus,build_stage,next_contact,del_date', custpage_upd_entitystatus: '13', custpage_orig_entitystatus: '10' }));
ok(r17.redirect && !writesOf('submitFields', 'opportunity').some(function (w) { return w.values.entitystatus; }), 'entitystatus is not written (the key list is cut on the server)');

// ═══ Inference ═══════════════════════════════════════════════════════════════════

console.log('C18. inferProjectType (pure)');
var MAP = { '5': '1', '6': '3', '7': '3' };
ok(orderLib.inferProjectType(['5'], MAP, '2') === '1', 'a single type → its mapping');
ok(orderLib.inferProjectType(['5', '5'], MAP, '2') === '1', 'same type twice → its mapping');
ok(orderLib.inferProjectType(['6', '7'], MAP, '2') === '3', 'two types mapping to the same project type → that type');
ok(orderLib.inferProjectType(['5', '6'], MAP, '2') === '2', 'UFH + HP → mixed');
ok(orderLib.inferProjectType(['5', '6'], MAP, '') === '', 'UFH + HP, no mixed parameter → none');
ok(orderLib.inferProjectType(['5', '9'], MAP, '2') === '', 'any unmapped → no pre-selection');
ok(orderLib.inferProjectType([], MAP, '2') === '' && orderLib.inferProjectType(['5'], null, '2') === '', 'no quotes / no map → none');
console.log('C19. The page carries the inference data (no data in the script)');
resetState();
var g19 = runGet();
ok(/data-qid="901" data-tranid="EST901" data-total="12000" data-exvat="10000" data-deposit="1200" data-projtype="1"/.test(g19), 'UFH row → data-projtype 1');
ok(/data-qid="902" data-tranid="EST902" data-total="2250" data-exvat="2142.86" data-deposit="" data-projtype="3"/.test(g19), 'HP row → 3');
ok(/data-qid="903" data-tranid="EST903" data-total="500" data-exvat="416.67" data-deposit="" data-projtype=""/.test(g19), 'unmapped → empty');
ok(/id="nsq-projtype" name="custpage_projtype" class="nsq-input" data-mixed="2"/.test(g19), 'the mixed id on the select');
var s19 = between(g19, '<script>', '</script>');
ok(s19.indexOf('EST901') === -1 && s19.indexOf('12000') === -1 && s19.indexOf('Customer Ltd') === -1, 'no record data inside the <script>');
ok(s19.indexOf('if (!t.length || unmapped) return "";') !== -1 && s19.indexOf('return $("nsq-projtype").getAttribute("data-mixed") || "";') !== -1 &&
   s19.indexOf('if (!sel || ptTouched) return;') !== -1, 'live inference, stops once the rep chooses');
var syntaxErr = null;
try { new vm.Script(s19.replace('<script>', '')); } catch (e) { syntaxErr = e.message; }
ok(syntaxErr === null, 'the page script parses' + (syntaxErr ? ' (' + syntaxErr + ')' : ''));
console.log('C20. Server repeats the inference when nothing is posted');
resetState();
runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_projtype: '' }));
ok(writesOf('create', 'salesorder').length === 2 && writesOf('create', 'salesorder').every(function (w) { return w.values.custbody_bund_proj_type === '2'; }), 'UFH + HP → mixed (2) on both SOs');
console.log('C21. The rep’s override wins');
resetState();
runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_projtype: '4' }));
ok(writesOf('create', 'salesorder').every(function (w) { return w.values.custbody_bund_proj_type === '4'; }), 'posted Parts (4) used on every SO, not the inferred 2');
ok(logged('CreateOrderSL.ProjectType', /inferred 2, posted 4 → 4/), 'both logged');

// ═══ convertQuote ════════════════════════════════════════════════════════════════

var CFG = { soForm: '150', recordStatus: '7', parentOppField: '', logKey: 'T.Convert' };
function convert(over) {
    var o = { estimateId: '901', oppId: '123', projectType: '1', commission: null, units: '4', auth: '2', repId: '30', cfg: CFG };
    Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
    return orderLib.convertQuote(o);
}
function thrown(fn) { try { fn(); return null; } catch (e) { return e; } }

console.log('C22. convertQuote: the fields set');
resetState();
var c22 = convert({ commission: { kind: 'pct', value: '5' } });
var so22 = writesOf('create', 'salesorder')[0];
ok(state.lastTransform.fromType === 'estimate' && state.lastTransform.toType === 'salesorder' && state.lastTransform.isDynamic === false &&
   state.lastTransform.defaultValues.customform === '150', 'transform Estimate → SO, standard mode, customform first (defaultValues)');
ok(so22.values.custbody_finance_status === '7' && so22.values.custbody_bund_proj_type === '1', 'Record Status and project type');
ok(so22.values.custbody_partner_commission === 5 && so22.values.custbody_partner_commission_amount === 500, '5% → both fields: 5 and £500 (5% of the £10,000 ex VAT base) — amendment 3');
ok(state.lastSaveOptions && state.lastSaveOptions.ignoreMandatoryFields === false, 'saved with ignoreMandatoryFields: false');
var log22 = writesOf('create', 'customrecord_order_log')[0];
ok(log22 && log22.values.custrecord_order_so === c22.soId && log22.values.custrecord_parent_opp === '123' && log22.values.custrecord_order_units === 4 &&
   log22.values.custrecord_order_auth === '2' && log22.values.custrecord_order_rep === '30', 'order log: SO, parent opp, units, auth, rep');
ok(Object.keys(log22.values).length === 5, 'order log: nothing else set (the rest is sourced)');
ok(c22.tranId === 'SO239950' && c22.total === 12000 && c22.logId && c22.warnings.length === 0, 'returns { soId, tranId, total, logId, warnings[] }');
ok(logged('T.Convert', /carried: .*entity=55.*\| blank: .*class/), 'the transform report: carried and blank fields');
resetState();
convert({ commission: { kind: 'amt', value: '250.50' } });
var so22b = writesOf('create', 'salesorder')[0];
ok(so22b.values.custbody_partner_commission_amount === 250.5 && so22b.values.custbody_partner_commission === undefined, '£ entered → the £ field only');
resetState();
convert({ commission: null });
var so22c = writesOf('create', 'salesorder')[0];
ok(so22c.values.custbody_partner_commission === undefined && so22c.values.custbody_partner_commission_amount === 0, 'no commission → £0, the % field not written — amendment 3');
console.log('C23. convertQuote: blank opportunity and quote type are copied');
resetState(); state.carryBlank = ['opportunity', 'custbody_quote_type'];
convert();
var so23 = writesOf('create', 'salesorder')[0];
ok(so23.values.opportunity === '123' && so23.values.custbody_quote_type === '5', 'copied from the Estimate');
ok(logged('T.Convert', /opportunity \(copied\), custbody_quote_type \(copied\)/), 'logged as copied');
resetState();
convert();
ok(!logged('T.Convert', /\(copied\)/), 'carried → not overwritten');
console.log('C24. convertQuote: a total mismatch means no save');
resetState(); state.soTotalDelta['901'] = 0.02;
var e24 = thrown(function () { convert(); });
ok(e24 && /total differs from the quote \(£12,000\.02 vs £12,000\.00\)/.test(e24.message), 'refused: "total differs from the quote (£x vs £y)"');
ok(writesOf('create', 'salesorder').length === 0 && writesOf('create', 'customrecord_order_log').length === 0, 'nothing saved');
ok(logged('T.Convert', /TOTAL MISMATCH before save; not saved\. SO 12000\.02 vs quote 12000/), 'both figures logged');
ok(!state.cache['nh_order_estimate_lock|PUBLIC|est_901'], 'the lock is released');
resetState(); state.soTotalDelta['901'] = 0.01;
ok(!thrown(function () { convert(); }), 'exactly 1p apart → saved');
console.log('C25. convertQuote: post-save mismatch is a warning, never deleted');
resetState(); state.postSaveTotal['901'] = 12100;
var c25 = convert();
ok(c25.soId && c25.totalMismatch === true && /total after save differs from the quote \(£12,100\.00 vs £12,000\.00\)/.test(c25.warnings[0]), 'warning returned');
ok(!state.calls.some(function (c) { return /delete/.test(c); }), 'nothing deleted');
resetState(); state.soLookupNoTotal = true;
var c25b = convert();
ok(c25b.total === 12000 && state.calls.some(function (c) { return c.indexOf('search:salesorder:tranid,total') === 0; }), 'no total from lookupFields → a search reads it');
console.log('C26. convertQuote: an order log failure leaves the SO standing');
resetState(); state.logSaveThrows = 'Please enter a value for Units';
var c26 = convert();
ok(c26.soId && writesOf('create', 'salesorder').length === 1 && c26.logId === '' && c26.logFailed === true, 'SO stands, no log');
ok(c26.warnings[0] === 'SO239950 created; order log NOT created: Please enter a value for Units', 'the warning names the SO');
console.log('C27. convertQuote: parent-opp fallback');
resetState();
convert({ cfg: { soForm: '150', recordStatus: '7', parentOppField: 'custbody_parent_opp' } });
ok(writesOf('create', 'customrecord_order_log')[0].values.custrecord_parent_opp === '123', 'parent field empty → this opportunity');
resetState(); state.oppValues.custbody_parent_opp = '100';
convert({ cfg: { soForm: '150', recordStatus: '7', parentOppField: 'custbody_parent_opp' } });
ok(writesOf('create', 'customrecord_order_log')[0].values.custrecord_parent_opp === '100', 'parent field set → its value');
console.log('C28. convertQuote trusts no input');
resetState();
ok(/not an open quote/.test((thrown(function () { convert({ estimateId: '950' }); }) || {}).message || ''), 'another opportunity’s Estimate → refused');
ok(/not an open quote/.test((thrown(function () { convert({ estimateId: '904' }); }) || {}).message || ''), 'a converted Estimate → refused');
ok(thrown(function () { convert({ units: '0' }); }).name === 'ORDERLIB_BAD_INPUT' && thrown(function () { convert({ commission: { kind: 'pct', value: '150' } }); }).name === 'ORDERLIB_BAD_INPUT',
   'units 0, commission 150% → refused');
ok(thrown(function () { convert({ cfg: { soForm: '', recordStatus: '7' } }); }).name === 'ORDERLIB_CONFIG', 'no form → refused');
ok(state.writes.length === 0 && !state.calls.some(function (c) { return c.indexOf('transform') === 0; }), 'nothing transformed or written');
resetState(); state.cache['nh_order_estimate_lock|PUBLIC|est_901'] = '1';
ok(thrown(function () { convert(); }).name === 'ORDERLIB_LOCKED' && state.writes.length === 0, 'locked by another request → refused');

// ═══ Multi-quote ═════════════════════════════════════════════════════════════════

console.log('C29. Two quotes, one failing');
resetState(); state.soSaveThrows['902'] = 'Please enter value(s) for: Lead Source';
var r29 = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '2', custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_from: 'rep' }));
ok(writesOf('create', 'salesorder').length === 1 && writesOf('create', 'salesorder')[0].from === '901', 'the first SO exists');
ok(writesOf('create', 'customrecord_order_log').length === 1, 'and its log');
var p29 = r29.redirect && r29.redirect.parameters;
ok(p29 && p29.nsqs === 'ord' && p29.nsq === 'warn' && p29.nsqso === '7000' && p29.nsqqf === '902', 'redirect: both outcomes as codes (nsqso, nsqqf)');
ok(state.emails.length === 1 && state.emails[0].relatedRecords.transactionId === 123, 'one email (amendment 4: filed on the opportunity), sent though only 1 of 2 converted');
ok(logged('CreateOrderSL.Summary', /failed EST902: Please enter value\(s\) for: Lead Source/), 'the reason is logged');
console.log('C30. Nothing created: no email, no opportunity write, the token is released');
resetState(); state.soSaveThrows['901'] = 'boom';
var r30 = runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' }));
ok(!r30.redirect && r30.html.indexOf('Nothing was created:') !== -1 && r30.html.indexOf('EST901: boom') !== -1, 'the page says "Nothing was created" with the reason');
ok(state.emails.length === 0, 'no email');
ok(writesOf('submitFields', 'opportunity').length === 0, 'no opportunity write');
ok(state.calls.indexOf('cache.remove:nh_create_order_save_guard') !== -1 && Object.keys(state.cache).filter(function (k) { return k.indexOf('nh_create_order_save_guard') === 0; }).length === 0, 'the token is released');
ok(/class="nsq-qsel" data-qid="901" checked/.test(r30.html), 'entries restored');
console.log('C31. Order log failure and post-save mismatch → amber codes; the SO stands');
resetState(); state.logSaveThrows = 'nope'; state.postSaveTotal['901'] = 1;
var p31 = runPost(post()).redirect.parameters;
ok(p31.nsq === 'warn' && p31.nsqlf === '7000' && p31.nsqtm === '7000' && p31.nsqso === '7000', 'nsqlf and nsqtm');

// ═══ Duplicates ══════════════════════════════════════════════════════════════════

console.log('C32. An existing SO created from the quote refuses it');
resetState();
state.salesOrders.push({ id: '6999', tranid: 'SO200001', createdfrom: '901', opportunity: '123', total: 12000 });
var r32 = runPost(post());
ok(writesOf('create', 'salesorder').length === 0 && r32.html.indexOf('EST901 already converted to SO200001') !== -1, '"already converted to SO200001"; nothing created');
console.log('C33. The dup token gives a dup banner');
resetState();
var p33 = post();
runPost(p33);
var firstWrites = state.writes.length;
state.redirect = null;
var r33 = runPost(p33);
ok(firstWrites > 0 && state.writes.length === firstWrites, 'the resubmission writes nothing');
ok(r33.redirect && r33.redirect.parameters.nsqs === 'ord' && r33.redirect.parameters.nsq === 'dup', 'redirect nsqs=ord, nsq=dup');

// ═══ The opportunity write ═══════════════════════════════════════════════════════

console.log('C34. The opportunity write is last');
resetState();
runPost(post({ custpage_upd_next_contact: '2026-11-01', custpage_email_on: 'T', custpage_rcpt_customer: 'T' }));
var order = state.calls.filter(function (c) { return /^save:|^submitFields:|^email\.send/.test(c); });
ok(order.join(',') === 'save:salesorder:901,save:customrecord_order_log,email.send,submitFields:opportunity,submitFields:opportunity', 'SO → log → email → opportunity (' + order.join(',') + ')');
var opw = writesOf('submitFields', 'opportunity');
ok(opw[0].values.custbody_next_contact instanceof Date && opw[0].options.enableSourcing === false, 'lib.updateFields: next contact');
ok(opw[1].values.custbody_opportunity_sub_status === '41' && !('custbody_value_proposition' in opw[1].values) && !('entitystatus' in opw[1].values), 'second write: the changed sub-status only');
console.log('C35. Sub-status / value proposition written only when changed');
resetState(); state.oppValues.custbody_opportunity_sub_status = '41';
runPost(post());
ok(writesOf('submitFields', 'opportunity').length === 0, 'nothing changed → no opportunity write at all');
resetState();
runPost(post({ custpage_valueprop: '3' }));
var w35 = writesOf('submitFields', 'opportunity')[0];
ok(w35.values.custbody_value_proposition === '3' && w35.values.custbody_opportunity_sub_status === '41', 'value proposition and sub-status in one submitFields');
console.log('C36. The status is written only when its parameter is set');
resetState(); setSetting('ORDER_OPP_STATUS', '13');
var p36 = runPost(post()).redirect.parameters;
var w36 = writesOf('submitFields', 'opportunity')[0];
ok(w36.values.entitystatus === '13' && w36.options.enableSourcing === true, 'entitystatus written, enableSourcing on');
ok(p36.nsqf === 'sub_status,entitystatus', 'banner keys');
resetState();
runPost(post());
ok(!writesOf('submitFields', 'opportunity').some(function (w) { return 'entitystatus' in w.values; }) && writesOf('submitFields', 'opportunity')[0].options.enableSourcing === false, 'parameter empty → no status, no sourcing');
resetState(); setSetting('ORDER_OPP_STATUS', '99');
var p36c = runPost(post()).redirect.parameters;
ok(!writesOf('submitFields', 'opportunity').some(function (w) { return 'entitystatus' in w.values; }) && p36c.nsq === 'warn' && /entitystatus/.test(p36c.nsqff), 'not an option → not written, amber');
console.log('C37. An opportunity write failure: amber, the SOs stand');
resetState(); state.submitThrows = 'RCRD_HAS_BEEN_CHANGED';
var p37 = runPost(post()).redirect.parameters;
ok(writesOf('create', 'salesorder').length === 1 && p37.nsq === 'warn' && /sub_status/.test(p37.nsqff), 'SO stands; amber with the field keys');
console.log('C38. Codes only in the redirect');
resetState();
var p38 = runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_message: 'Hello <b>there</b>' })).redirect.parameters;
ok(Object.keys(p38).every(function (k) { return /^[a-z0-9,_]*$/i.test(String(p38[k])); }), 'every value is a code (' + JSON.stringify(p38) + ')');

// ═══ Defaults ════════════════════════════════════════════════════════════════════

console.log('C39. Sub-status default: the parameter, else the current value');
resetState();
ok(/<option value="41" selected>Awaiting Design Info/.test(between(runGet(), 'id="nsq-substatus"', '</select>')), 'parameter 41 pre-selected');
resetState(); setSetting('NEEDINFO_SUBSTATUS', '');
ok(/<option value="40" selected>Quoted/.test(between(runGet(), 'id="nsq-substatus"', '</select>')), 'parameter empty → current (40)');
resetState(); setSetting('ORDER_SUBSTATUS_OPTIONS', '41,43');
var s39 = between(runGet(), 'id="nsq-substatus"', '</select>');
ok(s39.indexOf('value="40"') === -1 && s39.indexOf('value="42"') === -1 && s39.indexOf('value="41"') < s39.indexOf('value="43"'), 'substatus_options: only those, in that order');
console.log('C40. Value proposition: required, prefilled with the current value');
resetState();
var g40 = runGet();
ok(/<option value="2" selected>UFH Design \+/.test(between(g40, 'id="nsq-valueprop"', '</select>')), 'current value pre-selected');
ok(/for="nsq-valueprop">Value proposition <span class="nsq-req"/.test(g40) && g40.indexOf('if (!$("nsq-valueprop").value) return "Choose a value proposition.";') !== -1, 'required (label and client)');
ok(/<option value="30" selected>Rita Rep/.test(between(g40, 'id="nsq-rep"', '</select>')), 'rep defaults to the opportunity’s sales rep');
ok(g40.indexOf('custpage_upd_next_contact') !== -1 && g40.indexOf('custpage_upd_del_date') !== -1 && g40.indexOf('custpage_upd_build_stage') !== -1 &&
   g40.indexOf('custpage_upd_entitystatus') === -1 && g40.indexOf('custpage_upd_close_date') === -1, 'update section: delivery date, next contact, build stage only');

// ═══ The email ═══════════════════════════════════════════════════════════════════

console.log('C41. One confirmation email per submission, filed on the opportunity (amendment 4)');
resetState();
runPost(post());
ok(state.emails.length === 0 && state.merges.length === 0, 'switch off → nothing merged, nothing sent');
var g41 = runGet();
ok(/<input type="checkbox" id="nsq-email-on"> Send the customer an order confirmation/.test(g41) && /<div id="nsq-email-body" hidden>/.test(g41), 'the switch is off by default');
ok(/<option value="rep" selected>Sales rep \(Rita Rep\)/.test(g41), 'From defaults to the sales rep');
ok(/data-customer="1" data-email="cust@example.com" checked/.test(g41), 'To defaults to the Customer');
ok(g41.indexOf('nsq-email-message') === -1 && g41.indexOf('custpage_email_message') === -1, 'no free-text message box');
ok(/<input type="file" id="nsq-att" class="nsq-att" multiple>/.test(g41) && g41.indexOf('<p class="nsq-help" id="nsq-att-note">Attached to the confirmation email.</p>') !== -1, 'the attachments input, multiple; the note reads "Attached to the confirmation email." (amendment 5)');
ok(g41.indexOf('MAX_FILES = 5, MAX_BYTES = ' + (10 * 1024 * 1024) + ';') !== -1, 'the limits are still checked on the page (5 files, 10 MB)');
ok((g41.match(/<input type="file" name="custpage_att_\d" class="nsq-att-slot" hidden>/g) || []).length === 5, 'five hidden slots custpage_att_1…5');
ok(g41.indexOf('f.enctype = "multipart/form-data"') !== -1, 'the page sets the form to multipart/form-data');
resetState();
var r41 = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_from: 'rep', custpage_email_tpl: '4186' }));
ok(writesOf('create', 'salesorder').length === 2, 'two orders created');
ok(state.merges.length === 1 && state.merges[0].templateId === 4186 && state.merges[0].transactionId === 123, 'merged exactly once, with the chosen template and transactionId = the opportunity');
ok(state.merges[0].entity.type === 'customer' && state.merges[0].entity.id === 55 && state.merges[0].recipient.type === 'customer' && state.merges[0].recipient.id === 55, 'entity and recipient = the customer');
ok(state.emails.length === 1 && state.emails[0].author === '30' && state.emails[0].recipients.join() === 'cust@example.com', 'sent exactly once, from the rep, to the customer');
ok(state.emails[0].subject === 'Your order 123' && state.emails[0].body === '<p>Template 4186 for SO 123</p>', 'subject and body from the merge');
ok(state.emails[0].relatedRecords.transactionId === 123 && state.emails[0].relatedRecords.entityId === 55, 'filed on the opportunity (relatedRecords.transactionId) and the customer');
ok(!state.emails[0].attachments, 'no attachments chosen → none sent');
ok(r41.redirect.parameters.nsqe === 'sent' && !r41.redirect.parameters.nsqen && !r41.redirect.parameters.nsqef, 'nsqe=sent (no nsqen, no nsqef)');
ok(logged('CreateOrderSL.Email', /^Opportunity 123 — template 4186 merged; from rep \(employee 30\), 1 recipient, 0 attachments \(0 bytes\), 2 orders created$/), 'log: opportunity, template, recipients, attachments, orders created');
ok(!state.logs.some(function (l) { return /Template 4186 for SO/.test(l.details); }), 'the body is never logged');
resetState(); state.soSaveThrows['901'] = 'x'; state.soSaveThrows['902'] = 'y';
var r41b = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_email_on: 'T', custpage_rcpt_customer: 'T' }));
ok(!r41b.redirect && state.merges.length === 0 && state.emails.length === 0, '0 of 2 converted → nothing merged, nothing sent');

console.log('C42. Attachments: on the one email; the limits');
resetState();
var files42 = { custpage_att_1: upload('a.pdf', 1000), custpage_att_2: upload('b.pdf', 2000) };
runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_email_on: 'T', custpage_rcpt_customer: 'T' }), files42);
ok(state.emails.length === 1 && state.emails[0].attachments.length === 2 && state.emails[0].attachments[0] === files42.custpage_att_1, 'the uploaded file objects go on the one email, unsaved');
ok(!state.calls.some(function (c) { return /save:file|create:file/.test(c); }), 'nothing saved to the File Cabinet');
ok(logged('CreateOrderSL.Email', /2 attachments \(3000 bytes\)/), 'count and total size logged');
var six = {};
[1, 2, 3, 4, 5, 6].forEach(function (n) { six['custpage_att_' + n] = upload('f' + n + '.pdf', 10); });
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' }), six), '6 files');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' }), { custpage_att_1: upload('big.pdf', 6 * 1024 * 1024), custpage_att_2: upload('big2.pdf', 5 * 1024 * 1024) }), 'more than 10 MB');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' }), { custpage_att_1: upload('empty.pdf', 0) }), 'an empty file');
resetState();
var r42 = runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' }), { custpage_att_1: { name: '', size: 0 } });
ok(r42.redirect && state.emails.length === 1 && !state.emails[0].attachments, 'an unused slot (no name, no content) is ignored');
resetState();
runPost(post({ custpage_email_on: 'F' }), files42);
ok(state.emails.length === 0 && state.merges.length === 0, 'email off → files ignored, nothing merged or sent');

console.log('C43. The template: one select in the email section, none on the rows; the server check');
resetState();
var g43 = runGet();
var t43 = between(g43, 'id="nsq-email-tpl"', '</select>');
ok(/^id="nsq-email-tpl" name="custpage_email_tpl" class="nsq-input"><option value=""><\/option><option value="3198">Order confirmation – UFH<\/option><option value="4186">Order confirmation – Heat pump<\/option>$/.test(t43),
   'one select: ORDER_EMAIL_TEMPLATES order; inactive 3182 and missing 9999 dropped; no pre-selection (' + t43 + ')');
ok((g43.match(/name="custpage_email_tpl"/g) || []).length === 1 && g43.indexOf('custpage_tpl_') === -1 && g43.indexOf('nsq-qf-tpl') === -1, 'exactly one template select; none on the rows');
ok(between(g43, 'id="nsq-email-body"', 'id="nsq-email-tpl"').indexOf('Confirmation email template <span class="nsq-req"') !== -1, 'in the email section, labelled and required');
ok(g43.indexOf('if (!$("nsq-email-tpl").value) return "Choose the confirmation email template.";') !== -1, 'required on the page while the email is on');
ok(logged('CreateOrderSL.Config', /template 3182 is inactive; not offered/) && logged('CreateOrderSL.Config', /template 9999 not found; not offered/), 'inactive and missing logged');
ok(state.calls.some(function (c) { return c === 'search:emailtemplate:internalid,name,isinactive'; }), 'one emailtemplate search: name, isinactive');
resetState(); setSetting('ORDER_EMAIL_TEMPLATES', '');
var g43b = runGet();
ok(/<input type="checkbox" id="nsq-email-on" disabled> Send the customer an order confirmation/.test(g43b) && g43b.indexOf('No confirmation templates are set up (ORDER_EMAIL_TEMPLATES).') !== -1, 'empty setting → switch disabled, with the reason');
resetState(); setSetting('ORDER_EMAIL_TEMPLATES', '');
nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' })), 'email posted on with no templates set');
resetState(); setSetting('ORDER_EMAIL_TEMPLATES', '3182');
ok(/id="nsq-email-on" disabled/.test(runGet()), 'only inactive templates → disabled too');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_tpl: '' })), 'missing template');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_tpl: '3182' })), 'inactive (unoffered) template');
resetState(); nothingWritten(runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_tpl: '4185' })), 'a template not in ORDER_EMAIL_TEMPLATES');
resetState();
var r43 = runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_tpl: '9999' }));
ok(r43.html.indexOf('The confirmation email template is not one of the offered templates.') !== -1, 'the refusal names the reason');
resetState();
var r43r = runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T', custpage_email_tpl: '4186', custpage_units_901: '0' }));
ok(/<option value="4186" selected>Order confirmation – Heat pump/.test(r43r.html), 'restored after a refusal');

console.log('C43b. A merge or send failure → nsqe=fail; the orders stand');
resetState(); state.mergeThrows['3198'] = 'INVALID_TEMPLATE: legacy CRMSDK template';
var r43b = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_email_on: 'T', custpage_rcpt_customer: 'T' }));
var p43b = r43b.redirect.parameters;
ok(state.emails.length === 0 && writesOf('create', 'salesorder').length === 2 && writesOf('create', 'customrecord_order_log').length === 2, 'nothing sent; both orders and logs stand');
ok(p43b.nsqe === 'fail' && p43b.nsq === 'warn' && !p43b.nsqef && p43b.nsqso === '7000,7001', 'nsqe=fail, amber, no nsqef');
ok(logged('CreateOrderSL.Email', /Opportunity 123 — template 3198 could not be merged \(a legacy CRMSDK template can’t be; it must be FreeMarker\); not sent: INVALID_TEMPLATE/), 'the failed merge logged');
ok(logged('CreateOrderSL.Summary', /; email fail \(template 3198\)/), 'the summary says so');
ok(writesOf('submitFields', 'opportunity').length > 0, 'the opportunity is still written last');
resetState(); state.emailThrows = 'SSS_EMAIL_FAILED';
var p43c = runPost(post({ custpage_email_on: 'T', custpage_rcpt_customer: 'T' })).redirect.parameters;
ok(p43c.nsqe === 'fail' && writesOf('create', 'salesorder').length === 1, 'the send fails → nsqe=fail; the SO stands');
var NOW43 = String(Math.floor(Date.now() / 1000));
function ordBanner(extra) {
    resetState();
    state.salesOrders.push({ id: '7000', tranid: 'SO239950', createdfrom: '901', opportunity: '123', total: 1 }, { id: '7001', tranid: 'SO239951', createdfrom: '902', opportunity: '123', total: 1 });
    var prm = { nsqs: 'ord', nsq: 'ok', nsqt: NOW43, nsqso: '7000,7001' };
    Object.keys(extra).forEach(function (k) { prm[k] = extra[k]; });
    return runUe(prm, 'ALL').msg;
}
var u43a = ordBanner({ nsqe: 'sent', nsqen: '2', nsqef: '7001' });
ok(u43a && u43a.title === 'Orders created' && u43a.message === 'Created SO239950, SO239951<br>Confirmation email sent', 'banner: "Confirmation email sent" (old nsqen / nsqef ignored) (' + (u43a && u43a.message) + ')');
var u43b = ordBanner({ nsq: 'warn', nsqe: 'fail' });
ok(u43b && u43b.type === 'warning' && u43b.message === 'The confirmation email was not sent.<br>Created SO239950, SO239951', 'banner: "The confirmation email was not sent." (' + (u43b && u43b.message) + ')');

console.log('C43c. Live totals (display only)');
resetState();
var g43c = runGet();
ok(/data-qid="901" data-tranid="EST901" data-total="12000" data-exvat="10000" data-deposit="1200" data-projtype="1"/.test(g43c), 'row carries total, ex VAT and deposit (up front)');
ok(/id="nsq-root" class="nsq" data-opp-url="[^"]*" data-upfront="1"/.test(g43c) && g43c.indexOf('id="nsq-qtotal-line"') !== -1 && g43c.indexOf('id="nsq-sum-ex"') !== -1, 'the section 1 total and the footer ex VAT line');
ok(g43c.indexOf('(root.getAttribute("data-upfront") === "1" ? " · Deposit " + money(dep) : "")') !== -1, 'deposit part only for up-front customers');
resetState(); state.customer.terms = [{ value: '4', text: '30 days' }];
var g43d = runGet();
ok(/id="nsq-root" class="nsq" data-opp-url="[^"]*" data-upfront="0"/.test(g43d) && /data-qid="901"[^>]*data-deposit=""/.test(g43d), 'account customer: no deposit data, data-upfront 0');
resetState();
runPost(post({ custpage_q_sel: '["901"]', custpage_total: '1', custpage_qtotal: '1' }));
ok(writesOf('create', 'salesorder').length === 1, 'a posted total is ignored (the server never reads totals)');

console.log('C43d. The rep list (Production defect, 6 Oct)');
resetState();
var g43e = runGet();
ok(state.repFilter === 'T', 'the Employee search filters on salesrep (not issalesrep)');
ok(!state.logs.some(function (l) { return /Sales reps could not be read/.test(l.details); }), 'no search error');
var rep43 = between(g43e, 'id="nsq-rep"', '</select>');
ok(/<option value="30" selected>Rita Rep<\/option>/.test(rep43) && rep43.indexOf('value="7"') !== -1 && rep43.indexOf('value="32"') === -1 && rep43.indexOf('value="31"') === -1, 'active sales reps offered; inactive and unflagged not');
resetState(); state.oppValues.salesrep = '33'; state.oppTexts.salesrep = 'Una Flagged';
var rep43b = between(runGet(), 'id="nsq-rep"', '</select>');
ok(/^id="nsq-rep" name="custpage_rep" class="nsq-input"><option value=""><\/option><option value="33" selected>Una Flagged<\/option>/.test(rep43b), 'an unflagged opportunity rep is offered first and pre-selected');
resetState(); state.oppValues.salesrep = '33'; state.oppTexts.salesrep = 'Una Flagged';
var r43e = runPost(post({ custpage_rep: '33' }));
ok(r43e.redirect && writesOf('create', 'customrecord_order_log')[0].values.custrecord_order_rep === '33', '… and accepted by the server');
resetState(); nothingWritten(runPost(post({ custpage_rep: '33' })), 'an employee who was not offered (33 on another opportunity)');
resetState(); state.repSearchThrows = 'boom';
var rep43c = between(runGet(), 'id="nsq-rep"', '</select>');
ok(/^id="nsq-rep" name="custpage_rep" class="nsq-input"><option value=""><\/option><option value="30" selected>Rita Rep<\/option>$/.test(rep43c), 'search fails → only the opportunity’s rep, pre-selected (never an empty select)');
ok(logged('CreateOrderSL.Lists', /Sales reps could not be read: boom — offering the opportunity’s sales rep only/), 'logged');
resetState(); state.repSearchThrows = 'boom';
nothingWritten(runPost(post({ custpage_rep: '7' })), 'search fails → any other rep refused');
ok(!fs.readFileSync(path.join(ROOT, 'nuheat_create_order_sl.js'), 'utf8').match(/['"]issalesrep['"]/), 'issalesrep appears nowhere in the Suitelet');

// ═══ The mode switch ═════════════════════════════════════════════════════════════

function runUe(params, mode, role) {
    if (mode !== null) setSetting('ORDER_MODE', mode);   // null: leave the rows as the test set them
    delete state.cache[uiCacheKey()];   // a fresh 5-minute window
    if (role) state.roleId = role;
    var buttons = [];
    var form = { addButton: function (b) { buttons.push(b); }, removeButton: function () {}, addPageInitMessage: function (m) { state.pageMessages.push(m); } };
    var rec = { id: '123', getText: function (o) { return { custbody_opportunity_sub_status: 'Awaiting Design Info', custbody_value_proposition: 'HP Design' }[o.fieldId] || ''; },
                getValue: function () { return ''; } };
    var t = null;
    try { ue.beforeLoad({ type: 'view', UserEventType: { VIEW: 'view' }, newRecord: rec, form: form, request: params ? { parameters: params } : undefined }); } catch (e) { t = e; }
    return { buttons: buttons.map(function (b) { return b.id + ':' + b.functionName + ':' + b.label; }), thrown: t, msg: state.pageMessages[state.pageMessages.length - 1] };
}

console.log('C44. Suitelet: OFF refuses');
resetState(); setSetting('ORDER_MODE', '');
var g44 = runGet();
ok(g44.indexOf('Create order is switched off.') !== -1 && g44.indexOf('nsq-qrow') === -1, 'empty → OFF: the page refuses');
resetState(); setSetting('ORDER_MODE', 'OFF');
var r44 = runPost(post());
ok(r44.html.indexOf('Create order is switched off.') !== -1 && state.writes.length === 0, 'OFF: the POST refuses, nothing written');
resetState(); setSetting('ORDER_MODE', 'maybe');
ok(runGet().indexOf('switched off') !== -1, 'unknown → OFF');
console.log('C45. Suitelet: ADMIN and ALL');
resetState(); setSetting('ORDER_MODE', 'admin');
ok(runGet().indexOf('only available to administrators') !== -1, 'ADMIN, a sales role → refused');
resetState(); setSetting('ORDER_MODE', 'ADMIN'); state.roleId = 'administrator';
ok(runGet().indexOf('nsq-qrow') !== -1, 'ADMIN, Administrator → the page');
resetState();
ok(runGet().indexOf('nsq-qrow') !== -1, 'ALL → the page');
console.log('C46. Suitelet: missing form / Record Status refuses with a clear error');
resetState(); setSetting('ORDER_SO_FORM', '');
var g46 = runGet();
ok(g46.indexOf('Create order can’t run: ORDER_SO_FORM is not set in Customer Dashboard Settings.') !== -1, 'blank ORDER_SO_FORM → refused, naming the key');
resetState(); setSetting('ORDER_RECORD_STATUS', 'Awaiting');
ok(runGet().indexOf('ORDER_RECORD_STATUS is not set in Customer Dashboard Settings.') !== -1, 'ORDER_RECORD_STATUS not an id → refused, naming the key');
console.log('C47. The button: OFF / ADMIN / ALL; the other two never removed');
resetState();
ok(runUe(null, '').buttons.join() === 'custpage_send_quote:openSendQuoteSuitelet:Send Quote,custpage_update_opp:openUpdateOppSuitelet:Update opportunity', 'OFF (empty) → no Create order button');
ok(runUe(null, 'nonsense').buttons.length === 2, 'unknown → no button');
ok(runUe(null, 'ADMIN').buttons.length === 2, 'ADMIN, sales role → no button');
ok(runUe(null, 'ADMIN', 'administrator').buttons[2] === 'custpage_create_order:openCreateOrderSuitelet:Create order', 'ADMIN, Administrator → the button, third');
resetState();
ok(runUe(null, 'ALL').buttons[2] === 'custpage_create_order:openCreateOrderSuitelet:Create order', 'ALL → the button');
resetState(); state.settingsThrows = 'Permission Violation: customrecord_cdb_setting';
var u47 = runUe(null, 'ALL');
ok(!u47.thrown && u47.buttons.length === 2, 'settings search fails → no button, the other two stand');
var cs = fs.readFileSync(path.join(ROOT, 'nuheat_opportunity_cs.js'), 'utf8');
ok(/window\.openCreateOrderSuitelet = openCreateOrderSuitelet;/.test(cs) && /customscript_nuheat_create_order_sl/.test(cs) && /customdeploy_nuheat_create_order_sl/.test(cs), 'CS: openCreateOrderSuitelet exposed, the Suitelet’s IDs');

// ═══ The banner ══════════════════════════════════════════════════════════════════

var NOW = String(Math.floor(Date.now() / 1000));
console.log('C48. Banner: created orders, verified against this opportunity');
resetState();
state.salesOrders.push({ id: '7000', tranid: 'SO239950', createdfrom: '901', opportunity: '123', total: 1 },
                       { id: '7001', tranid: 'SO239951', createdfrom: '902', opportunity: '123', total: 1 },
                       { id: '7009', tranid: 'SO999999', createdfrom: '950', opportunity: '777', total: 1 });
var b48 = runUe({ nsqs: 'ord', nsq: 'ok', nsqt: NOW, nsqso: '7000,7001,7009', nsqf: 'sub_status,value_prop' }, 'ALL').msg;
ok(b48 && b48.type === 'confirmation' && b48.title === 'Orders created', 'CONFIRMATION "Orders created"');
ok(b48 && b48.message === 'Created SO239950, SO239951<br>Opportunity updated: Sub-status → Awaiting Design Info · Value proposition → HP Design', 'the orders by name; another opportunity’s SO dropped (' + (b48 && b48.message) + ')');
resetState();
state.salesOrders.push({ id: '7009', tranid: 'SO999999', createdfrom: '950', opportunity: '777', total: 1 });
var n48 = state.pageMessages.length;
runUe({ nsqs: 'ord', nsq: 'ok', nsqt: NOW, nsqso: '7009' }, 'ALL');
ok(state.pageMessages.length === n48, 'no verified order → no banner');
console.log('C49. Banner: failed quotes, log, total, email');
resetState();
state.salesOrders.push({ id: '7000', tranid: 'SO239950', createdfrom: '901', opportunity: '123', total: 1 });
var b49 = runUe({ nsqs: 'ord', nsq: 'warn', nsqt: NOW, nsqso: '7000', nsqqf: '902,950', nsqlf: '7000', nsqtm: '7000', nsqe: 'sent', nsqen: '2' }, 'ALL').msg;
ok(b49 && b49.type === 'warning' && b49.title === 'Orders created — but not everything saved', 'WARNING title');
ok(b49 && b49.message === 'Not created: EST902.<br>Order log not created for SO239950 — please add it.<br>Total differs from the quote on SO239950 — please check.<br>Created SO239950<br>Confirmation email sent',
   'the outcomes (' + (b49 && b49.message) + ')');
resetState();
state.salesOrders.push({ id: '7000', tranid: 'SO239950', createdfrom: '901', opportunity: '123', total: 1 });
var b49b = runUe({ nsqs: 'ord', nsq: 'ok', nsqt: NOW, nsqso: '7000' }, 'ALL').msg;
ok(b49b.title === 'Order created' && b49b.message === 'Created SO239950', 'one order → "Order created"');
console.log('C50. Banner: dup; no text from the URL');
resetState();
var b50 = runUe({ nsqs: 'ord', nsq: 'dup', nsqt: NOW }, 'ALL').msg;
ok(b50 && b50.type === 'information' && b50.title === 'Already created' && b50.message === 'These orders had already been created, so nothing was repeated.', 'dup banner');
resetState();
state.salesOrders.push({ id: '7000', tranid: 'SO239950', createdfrom: '901', opportunity: '123', total: 1 });
var b50b = runUe({ nsqs: 'ord', nsq: 'ok', nsqt: NOW, nsqso: '7000,<script>', nsqf: 'evil' }, 'ALL').msg;
ok(b50b.message === 'Created SO239950', 'junk ids and keys dropped');

// ═══ Amendment 1: settings from customrecord_cdb_setting ═════════════════════════

console.log('C53. Every key present: one search, no script parameter, values never logged');
resetState();
var g53 = runGet();
ok(g53.indexOf('nsq-qrow') !== -1 && state.settingsSearches === 1, 'the page renders; one settings search per request');
ok(!state.calls.some(function (c) { return c.indexOf('getParameter:') === 0; }), 'no script parameter is read');
var sl53 = state.logs.filter(function (l) { return l.title === 'CreateOrderSL.Settings'; });
ok(sl53.length === 1 && /found: ORDER_MODE, ORDER_SO_FORM, ORDER_RECORD_STATUS, NEEDINFO_SUBSTATUS, ORDER_PROJTYPE_MAP, ORDER_PROJTYPE_MIXED, PREPAY_TERMS, ORDER_EMAIL_TEMPLATES \| missing: ORDER_SUBSTATUS_OPTIONS, ORDER_OPP_STATUS, ORDER_PARENT_OPP_FIELD$/.test(sl53[0].details) && sl53[0].level === 'audit',
   'audit once: found and missing keys (' + (sl53[0] && sl53[0].details) + ')');
ok(sl53.length === 1 && sl53[0].details.indexOf('150') === -1 && sl53[0].details.indexOf('{"5"') === -1, 'no value in the log');
var srch53 = state.calls.filter(function (c) { return c.indexOf('search:customrecord_cdb_setting') === 0; })[0];
ok(srch53 === 'search:customrecord_cdb_setting:name,custrecord_cdb_setting_value', 'columns: name and the value');

console.log('C54. Each required key missing → the page refuses, naming the key');
['ORDER_SO_FORM', 'ORDER_RECORD_STATUS'].forEach(function (k) {
    resetState(); setSetting(k, undefined);
    var h = runGet();
    ok(h.indexOf('Create order can’t run: ' + k + ' is not set in Customer Dashboard Settings.') !== -1 && h.indexOf('nsq-qrow') === -1, k + ' missing → refused, naming it');
    resetState(); setSetting(k, undefined);
    var r = runPost(post());
    ok(r.html.indexOf(k + ' is not set') !== -1 && state.writes.length === 0, k + ' missing → the POST refuses too, nothing written');
});
resetState(); setSetting('ORDER_MODE', undefined);
ok(runGet().indexOf('Create order is switched off.') !== -1, 'ORDER_MODE missing → OFF');
resetState(); state.settings.forEach(function (r) { if (r.name === 'ORDER_SO_FORM') r.inactive = true; });
ok(runGet().indexOf('ORDER_SO_FORM is not set') !== -1, 'an inactive row is not read');

console.log('C55. A duplicate row makes that key missing (fail closed), naming the row IDs');
resetState(); state.settings.push({ id: '777', name: 'ORDER_SO_FORM', value: '151', inactive: false });
var g55 = runGet();
ok(g55.indexOf('ORDER_SO_FORM is not set in Customer Dashboard Settings.') !== -1, 'two active ORDER_SO_FORM rows → refused');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'ORDER_SETTING_DUPLICATE' && /ORDER_SO_FORM \(302, 777\)/.test(l.details); }), 'logged at error with both row IDs');
resetState(); state.settings.push({ id: '778', name: 'ORDER_SO_FORM', value: '151', inactive: true });
ok(runGet().indexOf('nsq-qrow') !== -1, 'a second, INACTIVE row is no duplicate');
resetState(); state.settings.push({ id: '779', name: ' ORDER_MODE ', value: 'ALL', inactive: false });
ok(runGet().indexOf('switched off') !== -1, 'a duplicate ORDER_MODE (Name with spaces counts — it is trimmed) → OFF');

console.log('C56. A failed settings search → the page refuses, the button is OFF');
resetState(); state.settingsThrows = 'Permission Violation: You need a higher level of the Customer Dashboard Settings permission';
var g56 = runGet();
ok(g56.indexOf('Create order can’t run: its settings can’t be read. Ask an administrator.') !== -1 && g56.indexOf('nsq-qrow') === -1, 'the page refuses with the settings message');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'ORDER_SETTINGS_UNAVAILABLE'; }), 'ORDER_SETTINGS_UNAVAILABLE at error');
resetState(); state.settingsThrows = 'no record type';
var r56 = runPost(post());
ok(r56.html.indexOf('its settings can’t be read') !== -1 && state.writes.length === 0 && !tokenClaimed(), 'the POST refuses, nothing written, no token');
resetState(); state.settingsThrows = 'no permission';
var u56 = runUe(null, 'ALL');
ok(!u56.thrown && u56.buttons.length === 2, 'the button is OFF; Send Quote and Update opportunity stand');
ok(!state.cache[uiCacheKey()], 'a failed search is not cached');

console.log('C57. A blank value counts as missing');
resetState(); setSetting('ORDER_PROJTYPE_MAP', '   ');
var g57 = runGet();
ok(/data-qid="901" data-tranid="EST901" data-total="12000" data-exvat="10000" data-deposit="1200" data-projtype=""/.test(g57), 'blank ORDER_PROJTYPE_MAP → no inference');
resetState(); setSetting('ORDER_MODE', '');
ok(runGet().indexOf('switched off') !== -1, 'blank ORDER_MODE → OFF');
resetState(); setSetting('ORDER_PROJTYPE_MAP', '{"5": "x"}');
ok(/data-projtype=""/.test(runGet()) && state.logs.some(function (l) { return l.title === 'CreateOrderSL.Config' && /ORDER_PROJTYPE_MAP could not be read/.test(l.details); }), 'an invalid map → none, logged as before');
resetState(); setSetting('ORDER_MODE', ' all ');
ok(runGet().indexOf('nsq-qrow') !== -1, 'ORDER_MODE is case-insensitive and trimmed');

console.log('C58. NEEDINFO_SUBSTATUS with two ids: the first is the default');
resetState(); setSetting('NEEDINFO_SUBSTATUS', '42,41');
ok(/<option value="42" selected>Design Required/.test(between(runGet(), 'id="nsq-substatus"', '</select>')), '"42,41" → 42 pre-selected');
resetState(); setSetting('NEEDINFO_SUBSTATUS', '41, 42');
ok(/<option value="41" selected>Awaiting Design Info/.test(between(runGet(), 'id="nsq-substatus"', '</select>')), '"41, 42" → 41');
resetState(); setSetting('PREPAY_TERMS', '4, 9');
ok(runGet().indexOf('Deposit £1,200.00') !== -1, 'PREPAY_TERMS as an idlist (the dashboard’s value)');

console.log('C59. The UE: cache miss, hit and failure');
resetState();
var u59a = runUe(null, 'ALL');
ok(u59a.buttons.length === 3 && state.settingsSearches === 1 && state.cache[uiCacheKey()] === 'ALL', 'miss → one search, ALL cached under order_mode');
ok(state.calls.indexOf('cache.put:nh_opp_ue_order_mode') !== -1, 'cache PRIVATE, key order_mode');
state.settings.forEach(function (r) { if (r.name === 'ORDER_MODE') r.value = 'OFF'; });
var srch = state.settingsSearches;
var u59b = (function () { var b = []; ue.beforeLoad({ type: 'view', UserEventType: { VIEW: 'view' }, newRecord: { id: '123', getText: function () { return ''; }, getValue: function () { return ''; } },
    form: { addButton: function (x) { b.push(x.id); }, removeButton: function () {}, addPageInitMessage: function () {} } }); return b; })();
ok(u59b.length === 3 && state.settingsSearches === srch, 'hit → no search; the cached ALL still shows the button (up to 5 minutes)');
resetState(); state.cacheThrows = 'cache down';
var u59c = runUe(null, 'ALL');
ok(!u59c.thrown && u59c.buttons.length === 2 && !state.settingsSearches, 'cache failure → OFF, no search, the other buttons stand');
resetState(); setSetting('ORDER_MODE', 'OFF'); state.cache[uiCacheKey()] = 'garbage';
var u59d = (function () { var b = []; ue.beforeLoad({ type: 'view', UserEventType: { VIEW: 'view' }, newRecord: { id: '123', getText: function () { return ''; }, getValue: function () { return ''; } },
    form: { addButton: function (x) { b.push(x.id); }, removeButton: function () {}, addPageInitMessage: function () {} } }); return b; })();
ok(u59d.length === 2 && state.settingsSearches === 1 && state.cache[uiCacheKey()] === 'OFF', 'a cached value that is not OFF/ADMIN/ALL is re-read');

console.log('C60. The UE: unknown and odd values');
resetState();
ok(runUe(null, 'yes').buttons.length === 2 && state.cache[uiCacheKey()] === 'OFF', 'unknown "yes" → OFF (cached)');
resetState();
ok(runUe(null, ' Admin ', 'administrator').buttons.length === 3, '" Admin " → ADMIN (trimmed, case-insensitive), Administrator sees it');
resetState(); setSetting('ORDER_MODE', undefined);
ok(runUe(null, undefined).buttons.length === 2, 'no ORDER_MODE row → OFF (ORDER_MODE_OLD is not read)');
resetState(); state.settings.push({ id: '880', name: 'ORDER_MODE', value: 'ALL', inactive: false });
ok(runUe(null, null).buttons.length === 2 && state.logs.some(function (l) { return l.title === 'ORDER_SETTING_DUPLICATE' && /ORDER_MODE \(301, 880\)/.test(l.details); }), 'two ORDER_MODE rows → OFF, logged with both row IDs');

console.log('C61. parseSettingRows (pure)');
var p61 = orderLib.parseSettingRows([
    { id: '1', name: ' ORDER_SO_FORM ', value: ' 150 ' },
    { id: '2', name: 'ORDER_RECORD_STATUS', value: '' },
    { id: '3', name: 'ORDER_MODE', value: 'ALL' }, { id: '4', name: 'ORDER_MODE', value: 'OFF' },
    { id: '5', name: 'order_so_form', value: '9' }, { id: '6', name: 'OTHER', value: 'x' }
], ['ORDER_SO_FORM', 'ORDER_RECORD_STATUS', 'ORDER_MODE', 'PREPAY_TERMS']);
ok(p61.values.ORDER_SO_FORM === '150' && Object.keys(p61.values).join() === 'ORDER_SO_FORM', 'trimmed Name and value; only clean keys have values');
ok(p61.missing.join() === 'ORDER_RECORD_STATUS,ORDER_MODE,PREPAY_TERMS' && p61.duplicates.join() === 'ORDER_MODE (3, 4)', 'blank, duplicate and absent are missing');
ok(p61.found.join() === 'ORDER_SO_FORM', 'case as typed (order_so_form is not ORDER_SO_FORM), other rows ignored');

// ═══ Amendment 3: partner commission always written as £ ════════════════════════

console.log('C62. Commission: the £ field always, as a number');
function soOf(estId) { return writesOf('create', 'salesorder').filter(function (w) { return w.from === estId; })[0]; }
resetState();
var r62 = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '1', custpage_comm_kind_901: 'amt', custpage_comm_901: '0', custpage_comm_kind_902: 'amt', custpage_comm_902: '0' }));
ok(r62.redirect && soOf('901').values.custbody_partner_commission_amount === 0 && soOf('902').values.custbody_partner_commission_amount === 0, 'Steve’s 6 Oct case (two quotes, £ 0): £ = 0 on both');
ok(typeof soOf('901').values.custbody_partner_commission_amount === 'number' && soOf('901').values.custbody_partner_commission === undefined, '… a number, not a string; no % field');
resetState();
runPost(post({ custpage_comm_kind_901: 'amt', custpage_comm_901: '250' }));
ok(soOf('901').values.custbody_partner_commission_amount === 250 && soOf('901').values.custbody_partner_commission === undefined, '£ 250 entered → £ field 250 only');
resetState();
runPost(post({ custpage_comm_kind_901: 'pct', custpage_comm_901: '' }));
ok(soOf('901').values.custbody_partner_commission_amount === 0 && !('custbody_partner_commission' in soOf('901').values), 'blank (with % chosen) → £0, the % field not written');
resetState();
runPost(post({ custpage_comm_kind_901: 'pct', custpage_comm_901: '2.5' }));
ok(soOf('901').values.custbody_partner_commission === 2.5 && soOf('901').values.custbody_partner_commission_amount === 250, '2.5% of £10,000 → % 2.5 and £250');
ok(typeof soOf('901').values.custbody_partner_commission === 'number' && typeof soOf('901').values.custbody_partner_commission_amount === 'number', 'both numbers');
ok(logged('CreateOrderSL.Convert', /^SO 7000 — commission: 2\.5% → £250\.00 \(base £10,000\.00\)$/), 'audit: "commission: 2.5% → £250.00 (base £10,000.00)"');
resetState();
runPost(post({ custpage_comm_kind_901: 'amt', custpage_comm_901: '250' }));
ok(logged('CreateOrderSL.Convert', /^SO 7000 — commission: £250\.00$/), 'audit: "commission: £250.00"');
resetState();
runPost(post({ custpage_comm_kind_901: 'pct', custpage_comm_901: '100' }));
ok(soOf('901').values.custbody_partner_commission === 100 && soOf('901').values.custbody_partner_commission_amount === 10000, '100% → £ = the base');
resetState(); state.estimates[2].exvat = 416.67;
runPost(post({ custpage_q_sel: '["903"]', custpage_units_903: '1', custpage_projtype: '4', custpage_comm_kind_903: 'pct', custpage_comm_903: '37' }));
ok(soOf('903').values.custbody_partner_commission_amount === 154.17, '37% of £416.67 = 154.1679 → £154.17 (rounded to 2 dp)');
console.log('C63. A % with no readable base → refused, nothing saved');
resetState(); state.taxBlank = true;
var r63 = runPost(post({ custpage_comm_kind_901: 'pct', custpage_comm_901: '5' }));
ok(!r63.redirect && writesOf('create', 'salesorder').length === 0 && writesOf('create', 'customrecord_order_log').length === 0, 'not saved');
ok(r63.html.indexOf('Nothing was created:') !== -1 && r63.html.indexOf('EST901 commission could not be calculated') !== -1, '"commission could not be calculated" on the page');
ok(logged('CreateOrderSL.Convert', /commission 5% NOT calculated; not saved\. total 12000, taxtotal $/), 'both raw figures logged');
resetState(); state.taxBlank = true;
var r63b = runPost(post({ custpage_comm_kind_901: 'amt', custpage_comm_901: '50' }));
ok(r63b.redirect && soOf('901').values.custbody_partner_commission_amount === 50, 'a £ amount needs no base: saved');
console.log('C64. commissionValues (pure) and the page');
ok(JSON.stringify(orderLib.commissionValues(null, null)) === JSON.stringify({ amount: 0, pct: null, log: 'commission: £0.00' }), 'none → £0');
ok(orderLib.commissionValues({ kind: 'pct', n: 5 }, 1286.61).amount === 64.33 && orderLib.commissionValues({ kind: 'pct', n: 5 }, 1286.61).log === 'commission: 5% → £64.33 (base £1,286.61)', 'the brief’s example: 5% of £1,286.61 → £64.33');
ok(orderLib.commissionValues({ kind: 'pct', n: 0 }, 1000).amount === 0 && orderLib.commissionValues({ kind: 'pct', n: 0 }, 1000).pct === 0, '0% → £0 and % 0');
var e64 = null; try { orderLib.commissionValues({ kind: 'pct', n: 5 }, null); } catch (e) { e64 = e; }
ok(e64 && e64.name === 'ORDERLIB_COMMISSION', 'no base → ORDERLIB_COMMISSION');
var g64 = runGet();
ok(g64.indexOf('<span class="nsq-comm-calc" aria-live="polite"></span>') !== -1, 'each % row has the "→ £…" slot (amendment 5: inline)');

// ═══ Amendment 5: the commission £ inline ════════════════════════════════════════

console.log('C65. Amendment 5: the worked-out commission £ inline ("→ £64.33"), % only');
var g65 = runGet();
// The page's own money() and commCalc(), run against a stub row (the page script is static text)
var m65 = g65.match(/  function money\(n\) \{[^\n]*\}\n/), c65 = g65.match(/  function commCalc\(r\) \{[\s\S]*?\n  \}\n/);
ok(!!(m65 && c65), 'money() and commCalc() found in the page script');
var commCalc = new Function(m65[0] + c65[0] + 'return commCalc;')();
function calcRow(kind, value, exVat) {
    var out = { hidden: false, textContent: '' }, inp = { value: value };
    return { out: out, inp: inp, kind: kind,
        querySelector: function (sel) {
            if (sel === '.nsq-comm-calc') return out;
            if (sel === '.nsq-comm') return inp;
            if (sel === '.nsq-comm-kind:checked') return { value: this.kind };
            return null;
        },
        getAttribute: function (a) { return a === 'data-exvat' ? exVat : null; } };
}
function shown(r) { commCalc(r); return r.out.hidden ? '(hidden)' : r.out.textContent; }
ok(shown(calcRow('pct', '5', '1286.61')) === '→ £64.33', '% 5 of £1,286.61 ex VAT → "→ £64.33" (the brief’s example)');
ok(shown(calcRow('amt', '5', '1286.61')) === '(hidden)', '£ selected → hidden');
var r65 = calcRow('pct', '', '10000'), seen65 = [];
['', '1', '12', '12.', '12.5', '0', '100'].forEach(function (v) { r65.inp.value = v; seen65.push(shown(r65)); });
ok(seen65.join(' | ') === '→ £0.00 | → £100.00 | → £1,200.00 |  | → £1,250.00 | → £0.00 | → £10,000.00',
    'updates as the rep types: blank → £0.00, 1 → £100.00, 12 → £1,200.00, "12." → nothing (invalid), 12.5 → £1,250.00, 0 → £0.00, 100 → £10,000.00 (' + seen65.join(' | ') + ')');
ok(shown(calcRow('pct', '', '')) === '→ £0.00' && shown(calcRow('pct', '0', '')) === '→ £0.00' && shown(calcRow('pct', '0.00', '2142.86')) === '→ £0.00',
    'blank or 0 → "→ £0.00" (also when the row has no ex VAT)');
ok(shown(calcRow('pct', '5', '')) === '', 'a % with no ex VAT on the row → nothing (the server refuses it, C63)');
ok(shown(calcRow('pct', '101', '1000')) === '' && shown(calcRow('pct', 'abc', '1000')) === '' && shown(calcRow('pct', '1.234', '1000')) === '', 'over 100, not a number or 3 dp → nothing (the footer gives the reason)');
r65 = calcRow('pct', '5', '1000'); shown(r65); r65.kind = 'amt';
ok(shown(r65) === '(hidden)' && r65.out.textContent === '', '% → £: hidden and emptied');
r65.kind = 'pct';
ok(shown(r65) === '→ £50.00', '£ → % again: shown');
ok(g65.indexOf('each(rows(), commCalc);') !== -1 && g65.indexOf('el.addEventListener("input", update);') !== -1,
    'refreshed on every keystroke (the inputs’ "input" → update() → summary() → commCalc on every row)');
// The page and the server agree (display only: the server still calculates it itself, order lib unchanged)
var agree65 = [[5, 1286.61], [37, 416.67], [2.5, 10000], [12.34, 2142.86], [100, 999999.99], [0.01, 0.5]].every(function (c) {
    return shown(calcRow('pct', String(c[0]), String(c[1]))) === '→ ' + orderLib.money(orderLib.commissionValues({ kind: 'pct', n: c[0] }, c[1]).amount);
});
ok(agree65, 'the page’s figure = orderLib.commissionValues for 5% / 37% / 2.5% / 12.34% / 100% / 0.01%');
resetState(); state.estimates[0].exvat = 1286.61; state.estimates[0].total = 1543.93;
runPost(post({ custpage_comm_kind_901: 'pct', custpage_comm_901: '5' }));
ok(soOf('901').values.custbody_partner_commission === 5 && soOf('901').values.custbody_partner_commission_amount === 64.33, 'the server is unchanged: 5% on a £1,286.61 base → % 5 and £64.33 on the SO');
resetState();
runPost(post({ custpage_comm_kind_901: 'pct', custpage_comm_901: '' }));
ok(soOf('901').values.custbody_partner_commission_amount === 0 && soOf('901').values.custbody_partner_commission === undefined, 'blank → £0 written, no % (unchanged)');
// The markup: the slot follows the input in the same group, hidden from the start for a £ row
ok(/class="nsq-input nsq-comm" id="nsq-comm-901"[^>]*><span class="nsq-comm-calc" aria-live="polite"><\/span><\/span><\/div>/.test(g65), 'the figure sits right after the input, in the commission group');
resetState();
var r65b = runPost(post({ custpage_q_sel: '["901","902"]', custpage_units_902: '0', custpage_comm_kind_901: 'amt', custpage_comm_901: '25', custpage_comm_kind_902: 'pct', custpage_comm_902: '3' }));
ok(!r65b.redirect && /name="custpage_comm_901"[^>]*><span class="nsq-comm-calc" aria-live="polite" hidden><\/span>/.test(r65b.html) &&
    /name="custpage_comm_902"[^>]*><span class="nsq-comm-calc" aria-live="polite"><\/span>/.test(r65b.html), 'a page restored after a refusal: £ row hidden, % row shown');
ok(/\.nsq-comm-calc\{flex:0 0 108px;width:108px;font-size:14px;line-height:32px;color:#5f5b66;/.test(g65) &&
    g65.indexOf('.nsq-qrow .nsq-input{min-height:32px;height:32px;padding:4px 8px;font-size:14px;') !== -1,
    'the figure: a fixed 108px, 14px like the units and commission inputs, the muted colour');
ok(g65.indexOf('.nsq-comm-calc[hidden]{display:inline-block;visibility:hidden;}') !== -1, 'hidden keeps its space (the row never moves)');
ok(g65.indexOf('grid-template-columns:24px minmax(100px,1fr) 150px 100px 340px 112px;') !== -1, 'desktop: the commission column 340px (232 + 108), fixed so the rows line up');
ok(g65.indexOf('font-size:10px') === -1 && g65.indexOf('position:absolute;right:0;top:100%') === -1, 'the small "= £…" under the field is gone');

// ═══ Governance ══════════════════════════════════════════════════════════════════

console.log('C51. Governance (mergeEmail and email.send counted at 20 units each; one of each per submission)');
function addQuotes(n) {
    for (var k = 0; k < n; k++) state.estimates.push({ id: String(910 + k), opp: '123', tranid: 'EST' + (910 + k), title: 'Extra', desc: '', status: 'A', qt: '5', qtText: 'UFH',
        total: 1000, exvat: 833.33, units: '1', deposit: '', due: '', created: '01/10/2026 07:00' });
}
function scenario(n, emailOn) {
    resetState(); setSetting('ORDER_OPP_STATUS', '13');
    addQuotes(Math.max(0, n - 3));
    var ids = ['901', '902', '903'].concat(state.estimates.filter(function (e) { return e.opp === '123' && +e.id >= 910; }).map(function (e) { return e.id; })).slice(0, n);
    var o = { custpage_q_sel: JSON.stringify(ids), custpage_projtype: '2', custpage_upd_next_contact: '2026-11-01' };
    ids.forEach(function (id) { o['custpage_units_' + id] = '1'; });
    if (emailOn) { o.custpage_email_on = 'T'; o.custpage_rcpt_customer = 'T'; o.custpage_rcpt_ccme = 'T'; o.custpage_email_from = 'rep'; }
    var r = runPost(post(o), emailOn ? { custpage_att_1: upload('a.pdf', 1000) } : {});
    return { units: state.units, created: writesOf('create', 'salesorder').length, emails: state.emails.length, ok: !!r.redirect, html: r.html };
}
var G = {};
[[1, false], [1, true], [3, false], [3, true], [6, false], [6, true], [8, false], [8, true]].forEach(function (c) { G[c[0] + (c[1] ? 'e' : '')] = scenario(c[0], c[1]); });
console.log('       units: 1 quote ' + G['1'].units + ' (email on ' + G['1e'].units + '), 3 quotes ' + G['3'].units + ' (email on ' + G['3e'].units +
    '), 6 quotes ' + G['6'].units + ' (email on ' + G['6e'].units + '), 8 quotes ' + G['8'].units + ' (email on ' + G['8e'].units + ')');
ok(G['1'].units < 150 && G['3'].units < 250, '1 quote < 150, 3 quotes < 250 without the email');
ok(G['1e'].emails === 1 && G['3e'].emails === 1 && G['8e'].emails === 1, 'one email per submission at every size');
ok(G['8e'].ok && G['8e'].created === 8 && G['8e'].units < 800, 'MAX_QUOTES 8 with the email on: every order, one email, under 800 units');
var s9 = scenario(9, true);
ok(!s9.ok && s9.html.indexOf('Create up to 8 orders at a time.') !== -1 && s9.created === 0, '9 quotes → refused before any write (MAX_QUOTES 8)');

// ═══ No change to the live pages ═════════════════════════════════════════════════

console.log('C52. No change to the live pages');
var LIVE = ['nuheat_update_opp_sl.js', 'nuheat_send_quote_sl.js', 'nuheat_opp_update_lib.js', 'nuheat_quote_suitelet.js',
            'test/update-opp.js', 'test/opp-lib-customer.js'];
var base = null;
['origin/main', 'main'].some(function (b) {
    try { cp.execSync('git rev-parse --verify --quiet ' + b, { cwd: ROOT, stdio: 'ignore' }); base = b; return true; } catch (e) { return false; }
});
if (base) {
    var diff = cp.execSync('git diff --name-only ' + base + ' -- ' + LIVE.join(' '), { cwd: ROOT }).toString().trim();
    ok(diff === '', 'empty diff against ' + base + ' for ' + LIVE.join(', ') + (diff ? ' — changed: ' + diff : ''));
    // Amendment 1: the Send Quote suite loads the Opportunity UE, which now needs N/cache — its only change is that stub.
    var sq = cp.execSync('git diff -U0 ' + base + ' -- test/send-quote-opp-update.js', { cwd: ROOT }).toString().split('\n')
        .filter(function (l) { return /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l); });
    ok(sq.length === 0 || (sq.filter(function (l) { return l.charAt(0) === '-'; }).join() === "-    './nuheat_master_proposal': masterProposalStub" &&
        sq.filter(function (l) { return l.charAt(0) === '+'; }).every(function (l) { return /masterProposalStub,$|ORDER_MODE setting|'N\/cache': \{ Scope/.test(l); })),
        'test/send-quote-opp-update.js: only the N/cache stub added (' + sq.length + ' changed lines), no assertion touched');
} else {
    console.log('  skip (no git base branch here) — check: git diff main -- ' + LIVE.join(' '));
}
['test/update-opp.js', 'test/send-quote-opp-update.js', 'test/opp-lib-customer.js'].forEach(function (t) {
    var out = '', code = 0;
    try { out = cp.execSync('node ' + t, { cwd: ROOT }).toString(); } catch (e) { code = e.status; out = String(e.stdout || ''); }
    var last = out.trim().split('\n').pop();
    ok(code === 0 && / 0 failed$/.test(last), t + ' passes unchanged (' + last + ')');
});

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
