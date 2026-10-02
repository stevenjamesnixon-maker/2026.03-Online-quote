/**
 * Tests for nuheat_opp_update_lib.js 1.2.0 (run against 1.3.0) — the customer-safe server functions (Release 2.1 part A):
 * fieldOptions, writeOppUpdate, createObjections. C1–C12 follow the brief's table; C13+ are extra
 * edge cases.
 *
 * Same style as update-opp.js: `define` is stubbed, the real library is loaded under stubbed N/*
 * modules, every scenario is checked with ok(), non-zero exit on failure. The stubs keep a
 * governance ledger (standard SuiteScript unit costs: record.load / create / submitFields of a
 * transaction 10, custom record create 2 + save 4, lookupFields 1, getSelectOptions 0).
 *
 *   node test/opp-lib-customer.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var childProcess = require('child_process');

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

function pad(n) { return (n < 10 ? '0' : '') + n; }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dmy(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }

function resetState() {
    state = {
        calls: [], logs: [], writes: [], units: 0, nextId: 7000, submitThrows: null, objSaveThrows: {},
        fieldTypes: { entitystatus: 'select', custbody_next_contact: 'date', custbody_opp_del_date: 'date', custbody_build_stage: 'select', expectedclosedate: 'date' },
        // the record as lookupFields returns it: selects [{ value, text }], dates in the user's format
        current: {
            entitystatus: [{ value: '10', text: 'Proposal' }],
            custbody_build_stage: [{ value: '3', text: 'Foundations' }],
            custbody_next_contact: '01/10/2026',
            custbody_opp_del_date: '15/11/2026',
            expectedclosedate: ''
        },
        // what getSelectOptions() returns — only the options NetSuite offers (inactive values absent)
        options: {
            entitystatus:         [{ value: '10', text: 'Proposal' }, { value: '12', text: 'Quoted' }, { value: '14', text: 'Closed lost' }],
            custbody_build_stage: [{ value: '3', text: 'Foundations' }, { value: '4', text: 'Roof on' }, { value: '5', text: 'First fix' }]
        }
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
    parse: function (o) {   // dd/mm/yyyy, as a UK user's date preference
        var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(o.value);
        if (!m) throw new Error('INVALID_FLD_VALUE');
        return new Date(+m[3], +m[2] - 1, +m[1]);
    }
};

function makeOppRecord(o) {
    return {
        isDynamic: !!o.isDynamic,
        getField: function (f) {
            var t = state.fieldTypes[f.fieldId];
            if (!t) return null;
            return { type: t, getSelectOptions: function () { state.calls.push('getSelectOptions:' + f.fieldId); return (state.options[f.fieldId] || []).slice(); } };
        }
    };
}

function makeNewRecord(type) {
    var values = {};
    var order = [];
    return {
        values: values,
        setValue: function (o) { values[o.fieldId] = o.value; order.push(o.fieldId); },
        save: function () {
            charge(4);
            state.calls.push('save:' + type);
            if (state.objSaveThrows[values.custrecord_nhobj_type]) throw new Error(state.objSaveThrows[values.custrecord_nhobj_type]);
            var id = String(state.nextId++);
            state.writes.push({ kind: 'create', type: type, id: id, values: values, order: order });
            return id;
        }
    };
}

var recordStub = {
    Type: { OPPORTUNITY: 'opportunity' },
    load: function (o) {
        charge(10);
        state.calls.push('load:' + o.type + (o.isDynamic ? ':dynamic' : ''));
        if (o.type === 'opportunity') return makeOppRecord(o);
        throw new Error('unexpected load of ' + o.type);
    },
    create: function (o) {
        if (o.type === 'opportunity') {   // fieldOptions without an oppId: in memory, never saved
            charge(10);
            state.calls.push('create:opportunity' + (o.isDynamic ? ':dynamic' : ''));
            return makeOppRecord(o);
        }
        charge(2);
        state.calls.push('create:' + o.type);
        return makeNewRecord(o.type);
    },
    submitFields: function (o) {
        charge(10);
        state.calls.push('submitFields:' + o.type);
        state.writes.push({ kind: 'submitFields', type: o.type, id: o.id, values: o.values, options: o.options });
        if (state.submitThrows) throw new Error(state.submitThrows);
        return o.id;
    }
};

var searchStub = {
    Type: { OPPORTUNITY: 'opportunity', CUSTOMER: 'customer', EMPLOYEE: 'employee' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        charge(1);
        state.calls.push('lookupFields:' + o.type + ':' + o.columns.join(','));
        var out = {};
        o.columns.forEach(function (c) { out[c] = state.current[c] === undefined ? '' : state.current[c]; });
        return out;
    },
    create: function () { throw new Error('search.create not expected'); }
};

var modules = {
    'N/ui/serverWidget': { FieldType: {}, createForm: function () { throw new Error('not expected'); } },
    'N/search': searchStub,
    'N/record': recordStub,
    'N/log': logStub,
    'N/url': { resolveRecord: function () { return ''; } },
    'N/format': formatStub,
    'N/email': { send: function () { throw new Error('email not expected'); } },
    'N/runtime': { getCurrentUser: function () { return { id: '7' }; } }
};
var LIB = loadModule('nuheat_opp_update_lib.js', modules);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function writesOf(kind, type) { return state.writes.filter(function (w) { return w.kind === kind && (!type || w.type === type); }); }
function throwsCode(fn) { try { fn(); return ''; } catch (e) { return e.name || ('(no name) ' + e.message); } }
function captured(fn) { try { return { value: fn() }; } catch (e) { return { error: e }; } }

var ALLOWED = { build_stage: ['3', '4'], entitystatus: ['12', '14'] };

// ─── C0. Version and exports ──────────────────────────────────────────────────

console.log('C0. Version and exports');
// changed in lib 1.3.0: the version (the 1.2.0 functions are unchanged)
ok(LIB.LIB_VERSION === '1.3.0', 'LIB_VERSION is 1.3.0 (' + LIB.LIB_VERSION + ')');
ok(typeof LIB.fieldOptions === 'function' && typeof LIB.writeOppUpdate === 'function' && typeof LIB.createObjections === 'function', 'fieldOptions, writeOppUpdate, createObjections exported');
ok(['updateFields', 'pendingChanges', 'prepareFields', 'validateRequired', 'parseIsoDate', 'FIELDS'].every(function (k) { return k in LIB; }), 'existing exports still there');
ok(LIB.FIELDS.length === 5 && !LIB.FIELDS.some(function (d) { return d.fieldId === 'custbody_opportunity_sub_status'; }), 'FIELDS unchanged: five fields, no sub-status');

// ─── C1. fieldOptions ─────────────────────────────────────────────────────────

console.log('C1. fieldOptions(\'custbody_build_stage\')');
resetState();
var opts1 = LIB.fieldOptions('custbody_build_stage');
ok(JSON.stringify(opts1) === JSON.stringify([{ id: '3', text: 'Foundations' }, { id: '4', text: 'Roof on' }, { id: '5', text: 'First fix' }]), 'the options as [{ id, text }]');
ok(state.calls.join(' > ') === 'create:opportunity:dynamic > getSelectOptions:custbody_build_stage', 'mechanism: a dynamic Opportunity in memory + getSelectOptions() (' + state.calls.join(' > ') + ')');
ok(state.writes.length === 0, 'nothing saved');
ok(state.units === 10, 'cost without an oppId: 10 units (record.create of a transaction) — got ' + state.units);
console.log('       cost: ' + state.units + ' units without oppId');

resetState();
var opts1b = LIB.fieldOptions('build_stage', '123');
ok(opts1b.length === 3 && state.calls[0] === 'load:opportunity:dynamic' && state.units === 10, 'library key + oppId: loads that Opportunity, dynamic — the page\'s own list; 10 units');
console.log('       cost: ' + state.units + ' units with oppId');

resetState();
ok(LIB.fieldOptions('entitystatus').map(function (o) { return o.id; }).join(',') === '10,12,14', 'entitystatus too');
resetState();
ok(throwsCode(function () { LIB.fieldOptions('next_contact'); }) === 'OPPLIB_NOT_A_SELECT', 'a date field → OPPLIB_NOT_A_SELECT');
ok(throwsCode(function () { LIB.fieldOptions('custbody_opportunity_sub_status'); }) === 'OPPLIB_NOT_A_SELECT', 'the sub-status → OPPLIB_NOT_A_SELECT');
ok(throwsCode(function () { LIB.fieldOptions('nonsense'); }) === 'OPPLIB_NOT_A_SELECT', 'an unknown key → OPPLIB_NOT_A_SELECT');
ok(state.units === 0, 'no record read for a non-select key');
resetState();
state.fieldTypes.custbody_build_stage = 'text';
ok(throwsCode(function () { LIB.fieldOptions('build_stage'); }) === 'OPPLIB_FIELD_UNAVAILABLE', 'NetSuite reports another type → OPPLIB_FIELD_UNAVAILABLE (prepareFields\' check)');

// ─── C2. writeOppUpdate: an allowed build stage ───────────────────────────────

console.log('C2. writeOppUpdate with an allowed build stage');
resetState();
var r2 = LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4' }, allowed: ALLOWED });
var s2 = writesOf('submitFields');
ok(s2.length === 1 && state.writes.length === 1, 'exactly one submitFields, no other write');
ok(JSON.stringify(s2[0].values) === '{"custbody_build_stage":"4"}', 'writes custbody_build_stage = 4');
ok(s2[0].options.ignoreMandatoryFields === true, 'ignoreMandatoryFields: true');
ok(JSON.stringify(r2) === JSON.stringify({ written: { build_stage: { old: '3', 'new': '4' } }, unchanged: [] }), 'written shows 3 → 4 (' + JSON.stringify(r2) + ')');
ok(state.calls.filter(function (c) { return /^lookupFields/.test(c); }).length === 1, 'current values: one lookupFields');
ok(state.units === 21, 'governance: load 10 + lookupFields 1 + submitFields 10 = 21 (got ' + state.units + ')');
ok(state.logs.some(function (l) { return l.level === 'audit' && /custbody_build_stage: 3 → 4 \(enableSourcing: false\)/.test(l.details); }), 'audit line in updateFields\' format');

// ─── C3. A build stage not allowed / not an option ────────────────────────────

console.log('C3. A build stage not in allowed / not in the options');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '5' }, allowed: ALLOWED }); }) === 'OPPLIB_VALUE_NOT_ALLOWED', 'an option, but not in allowed → OPPLIB_VALUE_NOT_ALLOWED');
ok(state.writes.length === 0 && state.units === 0, 'no write, no I/O');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '99' }, allowed: { build_stage: ['3', '99'] } }); }) === 'OPPLIB_VALUE_NOT_ALLOWED', 'in allowed, but not an option → OPPLIB_VALUE_NOT_ALLOWED');
ok(state.writes.length === 0, 'no write');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4' } }); }) === 'OPPLIB_VALUE_NOT_ALLOWED', 'no allowed list at all → OPPLIB_VALUE_NOT_ALLOWED');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4', next_contact: '2026-12-01' }, allowed: { build_stage: ['3'] } }); }) === 'OPPLIB_VALUE_NOT_ALLOWED' && state.writes.length === 0,
   'one bad select among good values → nothing written (not even the date)');

// ─── C4. An unknown key ───────────────────────────────────────────────────────

console.log('C4. An unknown key');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4', probability: '90' }, allowed: ALLOWED }); }) === 'OPPLIB_UNKNOWN_FIELD', 'probability → OPPLIB_UNKNOWN_FIELD');
ok(state.writes.length === 0 && state.units === 0, 'no write, no I/O');

// ─── C5. Status to an allowed value ───────────────────────────────────────────

console.log('C5. entitystatus to an allowed value');
resetState();
var r5 = LIB.writeOppUpdate({ oppId: '123', values: { entitystatus: '14' }, allowed: ALLOWED });
var s5 = writesOf('submitFields');
ok(s5.length === 1 && s5[0].options.enableSourcing === true && s5[0].options.ignoreMandatoryFields === true, 'enableSourcing: true (probability follows the status)');
ok(s5[0].values.entitystatus === '14' && r5.written.entitystatus.old === '10' && r5.written.entitystatus['new'] === '14', 'written 10 → 14');

// ─── C6. No status in the values ──────────────────────────────────────────────

console.log('C6. No status in the values');
resetState();
LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4', next_contact: '2026-10-20' }, allowed: ALLOWED });
var s6 = writesOf('submitFields');
ok(s6.length === 1 && s6[0].options.enableSourcing === false, 'enableSourcing: false');
ok(s6[0].values.custbody_next_contact instanceof Date && iso(s6[0].values.custbody_next_contact) === '2026-10-20', 'date written as a Date (2026-10-20)');
resetState();
LIB.writeOppUpdate({ oppId: '123', values: { entitystatus: '10', build_stage: '4' }, allowed: { entitystatus: ['10'], build_stage: ['4'] } });
ok(writesOf('submitFields')[0].options.enableSourcing === false && !('entitystatus' in writesOf('submitFields')[0].values),
   'status given but unchanged → not written, enableSourcing: false (as updateFields)');

// ─── C7. A value equal to the current one ─────────────────────────────────────

console.log('C7. A value equal to the current one');
resetState();
var r7 = LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '3', next_contact: '2026-10-01' }, allowed: { build_stage: ['3'] } });
ok(writesOf('submitFields').length === 0, 'nothing changed → no submitFields');
ok(JSON.stringify(r7) === JSON.stringify({ written: {}, unchanged: ['build_stage', 'next_contact'] }), 'both in unchanged (' + JSON.stringify(r7) + ')');
resetState();
var r7b = LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '3', del_date: '2027-01-05' }, allowed: { build_stage: ['3'] } });
ok(JSON.stringify(writesOf('submitFields')[0].values) === JSON.stringify({ custbody_opp_del_date: new Date(2027, 0, 5) }) &&
   r7b.unchanged.join(',') === 'build_stage' && r7b.written.del_date.old === '2026-11-15', 'mixed: only the changed date written; the same one listed unchanged');

// ─── C8. Blank date ───────────────────────────────────────────────────────────

console.log('C8. Blank date');
resetState();
var r8 = LIB.writeOppUpdate({ oppId: '123', values: { next_contact: '', del_date: null, build_stage: '' }, allowed: ALLOWED });
ok(state.writes.length === 0 && state.units === 0, 'blanks: no write and no I/O at all');
ok(r8.unchanged.join(',') === 'next_contact,del_date,build_stage' && Object.keys(r8.written).length === 0, 'blank never clears — listed unchanged');
resetState();
var r8b = LIB.writeOppUpdate({ oppId: '123', values: { next_contact: '  ', close_date: '2027-02-01' }, allowed: ALLOWED });
ok(JSON.stringify(Object.keys(writesOf('submitFields')[0].values)) === '["expectedclosedate"]' && r8b.written.close_date.old === '', 'blank date skipped; an empty field is set (old "")');

// ─── C9. Bad date ─────────────────────────────────────────────────────────────

console.log('C9. Bad date');
[['2026-02-30', 'not a calendar date'], ['01/10/2026', 'a display-format date'], ['2026-1-5', 'unpadded']].forEach(function (c) {
    resetState();
    ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4', next_contact: c[0] }, allowed: ALLOWED }); }) === 'OPPLIB_INVALID_DATE' && state.writes.length === 0 && state.units === 0,
       c[1] + ' (' + c[0] + ') → OPPLIB_INVALID_DATE; nothing written');
});

// ─── C10. The sub-status ──────────────────────────────────────────────────────

console.log('C10. The sub-status in the values');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { custbody_opportunity_sub_status: '1' }, allowed: { custbody_opportunity_sub_status: ['1'] } }); }) === 'OPPLIB_UNKNOWN_FIELD',
   'custbody_opportunity_sub_status → OPPLIB_UNKNOWN_FIELD even when "allowed"');
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { sub_status: '1' }, allowed: ALLOWED }); }) === 'OPPLIB_UNKNOWN_FIELD', 'sub_status → OPPLIB_UNKNOWN_FIELD');
ok(state.writes.length === 0, 'no write');

// ─── C11. createObjections: two types, raisedBy blank ─────────────────────────

console.log('C11. createObjections with 2 types, raisedBy blank');
resetState();
var r11 = LIB.createObjections({ oppId: '123', typeIds: ['12', '11'], notes: { '11': 'Too expensive for us' },
                                 contextLine: 'Customer dashboard (01/10/2026)', raisedBy: '', quoteId: '901' });
var c11 = writesOf('create', 'customrecord_nh_objection');
ok(c11.length === 2 && JSON.stringify(r11.created) === JSON.stringify(['7000', '7001']) && r11.failed.length === 0, 'two records; created ids returned');
ok(c11.every(function (w) { return !('custrecord_nhobj_raised_by' in w.values); }), 'custrecord_nhobj_raised_by left unset');
ok(c11[0].values.custrecord_nhobj_notes === 'Customer dashboard (01/10/2026)', 'no note → the context line alone (D11)');
ok(c11[1].values.custrecord_nhobj_notes === 'Too expensive for us\n\nCustomer dashboard (01/10/2026)', 'note → "<note>\\n\\n<context line>" (D11)');
ok(c11.every(function (w) { return w.values.custrecord_nhobj_opportunity === '123' && w.values.custrecord_nhobj_quote === '901'; }), 'opportunity and quote set');
ok(c11.every(function (w) { return w.values.custrecord_nhobj_raised_on instanceof Date && iso(w.values.custrecord_nhobj_raised_on) === iso(new Date()); }), 'raised on defaults to today');
ok(c11.every(function (w) { return !('custrecord_nhobj_group' in w.values) && !('custrecord_nhobj_customer' in w.values); }), '_group / _customer never set (sourced)');
ok(state.units === 12, 'governance: 2 × (create 2 + save 4) = 12 (got ' + state.units + ')');

resetState();
var r11b = LIB.createObjections({ oppId: '123', typeIds: ['21'], notes: 'n', contextLine: 'ctx', raisedBy: '7', raisedOn: '2026-09-28' });
var w11b = writesOf('create')[0];
ok(w11b.values.custrecord_nhobj_raised_by === '7' && iso(w11b.values.custrecord_nhobj_raised_on) === '2026-09-28' && !('custrecord_nhobj_quote' in w11b.values),
   'raisedBy set when given; raisedOn yyyy-mm-dd; no quote');
ok(r11b.created.length === 1, 'one created');
resetState();
ok(throwsCode(function () { LIB.createObjections({ oppId: '123', typeIds: ['21'], raisedOn: '2026-13-01', contextLine: 'x' }); }) === 'OPPLIB_INVALID_DATE' && state.writes.length === 0, 'bad raisedOn → OPPLIB_INVALID_DATE, nothing created');
ok(throwsCode(function () { LIB.createObjections({ oppId: '123', typeIds: ['21', '11'], notes: { '21': 'only one' } }); }) === 'OPPLIB_NOTES_REQUIRED' && state.writes.length === 0,
   'a type with no notes and no context line → OPPLIB_NOTES_REQUIRED before ANY record (notes are mandatory)');

resetState();
state.objSaveThrows['11'] = 'INVALID_KEY_OR_REF';
var r11c = LIB.createObjections({ oppId: '123', typeIds: ['12', '11', '21'], contextLine: 'ctx', raisedBy: '' });
ok(r11c.created.length === 2 && r11c.failed.join(',') === '11' && r11c.errors['11'] === 'INVALID_KEY_OR_REF', 'one failure does not stop the others; failure reported per type');

// ─── C12. The Suitelet's objection path is byte-identical ─────────────────────

console.log('C12. Update Opportunity SL objection path: the same records as the 1.1.0 loop');
// The Suitelet 1.1.0 loop, verbatim (with its objectionNotes), run on the same stubs as a reference.
function suiteletLoop110(opportunityId, ids, params, contextLine, quoteId, userId, raisedOn) {
    var OBJ = LIB.OBJECTION_FIELDS;
    function objectionNotes(note, ctx) { return note ? note + '\n\n' + ctx : ctx; }
    var created = [], failedTypes = [];
    ids.forEach(function (typeId) {
        try {
            var o = recordStub.create({ type: OBJ.record });
            o.setValue({ fieldId: OBJ.opportunity, value: opportunityId });
            o.setValue({ fieldId: OBJ.type, value: typeId });
            if (quoteId) o.setValue({ fieldId: OBJ.quote, value: quoteId });
            o.setValue({ fieldId: OBJ.notes, value: objectionNotes(String(params['custpage_obj_note_' + typeId] || '').trim(), contextLine) });
            o.setValue({ fieldId: OBJ.raisedBy, value: userId });
            o.setValue({ fieldId: OBJ.raisedOn, value: raisedOn });
            var oid = o.save();
            created.push(oid);
            logStub.audit('UpdateOppSL.Objection', 'Opportunity ' + opportunityId + ' — objection ' + oid + ' created (type ' + typeId + ')');
        } catch (e) {
            failedTypes.push(typeId);
            logStub.error('UpdateOppSL.Objection', 'Opportunity ' + opportunityId + ' — objection of type ' + typeId + ' FAILED: ' + e.message);
        }
    });
    return { created: created, failed: failedTypes };
}
[['no quote, one note', '', { custpage_obj_note_11: '  Said £2k over budget ' }],
 ['quote, a failing type', '901', { custpage_obj_note_12: 'x' }, '12']].forEach(function (c) {
    var ids = ['12', '11', '21'], ctx = 'Call notes (01/10/2026): Customer wants to compare prices.', day = new Date(2026, 9, 1);
    resetState(); if (c[3]) state.objSaveThrows[c[3]] = 'boom';
    var ref = suiteletLoop110('123', ids, c[2], ctx, c[1], '7', day);
    var refDump = JSON.stringify({ w: state.writes, l: state.logs, u: state.units, r: ref });
    resetState(); if (c[3]) state.objSaveThrows[c[3]] = 'boom';
    var notes = {}; ids.forEach(function (t) { notes[t] = String(c[2]['custpage_obj_note_' + t] || '').trim(); });
    var got = LIB.createObjections({ oppId: '123', typeIds: ids, notes: notes, contextLine: ctx, raisedBy: '7', raisedOn: day, quoteId: c[1], logKey: 'UpdateOppSL.Objection' });
    var gotDump = JSON.stringify({ w: state.writes, l: state.logs, u: state.units, r: { created: got.created, failed: got.failed } });
    ok(refDump === gotDump, c[0] + ': records (values and setValue order), logs, units and result identical');
});
// The Suitelet's own suite, unedited, drives the real Suitelet → library path.
var suite = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'update-opp.js')], { encoding: 'utf8' });
var tail = (suite.stdout || '').trim().split('\n').pop();
// changed in lib 1.3.0: update-opp.js gained T52–T62, and T63–T67 with SL 1.2.1 (481 checks); the 293 earlier checks are still in it
ok(suite.status === 0 && tail === '481 passed, 0 failed', 'test/update-opp.js passing (' + tail + ')');

// ─── C13+. Extra edge cases ───────────────────────────────────────────────────

console.log('C13. Field IDs as keys; duplicates; arguments');
resetState();
var r13 = LIB.writeOppUpdate({ oppId: '123', values: { custbody_build_stage: '4' }, allowed: { custbody_build_stage: ['4'] } });
ok(r13.written.build_stage && r13.written.build_stage['new'] === '4', 'field ID accepted as the key; result keyed by the library key');
resetState();
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4', custbody_build_stage: '4' }, allowed: ALLOWED }); }) === 'OPPLIB_UNKNOWN_FIELD', 'the same field twice → OPPLIB_UNKNOWN_FIELD');
ok(throwsCode(function () { LIB.writeOppUpdate({ values: { build_stage: '4' }, allowed: ALLOWED }); }) === 'OPPLIB_BAD_ARGS', 'no oppId → OPPLIB_BAD_ARGS');
ok(throwsCode(function () { LIB.writeOppUpdate({ oppId: '123', values: null }); }) === 'OPPLIB_BAD_ARGS', 'no values → OPPLIB_BAD_ARGS');
ok(state.writes.length === 0, 'no write');

console.log('C14. submitFields fails');
resetState();
state.submitThrows = 'RCRD_HAS_BEEN_CHANGED';
var c14 = captured(function () { return LIB.writeOppUpdate({ oppId: '123', values: { build_stage: '4' }, allowed: ALLOWED }); });
ok(c14.error && /RCRD_HAS_BEEN_CHANGED/.test(c14.error.message), 'the error propagates to the caller');
ok(state.logs.some(function (l) { return l.level === 'error' && /update FAILED/.test(l.details); }), 'logged at error level');

console.log('C15. The current value is a select the caller did not change; sub-status never in a write');
resetState();
LIB.writeOppUpdate({ oppId: '123', values: { entitystatus: '12', build_stage: '4', next_contact: '2026-11-11', del_date: '2027-03-03', close_date: '2027-04-04' },
                     allowed: { entitystatus: ['12'], build_stage: ['4'] } });
var s15 = writesOf('submitFields')[0];
ok(Object.keys(s15.values).sort().join(',') === 'custbody_build_stage,custbody_next_contact,custbody_opp_del_date,entitystatus,expectedclosedate' &&
   !('custbody_opportunity_sub_status' in s15.values), 'all five written in one call; no sub-status');
ok(state.units === 21 && state.calls.filter(function (c) { return /^load:/.test(c); }).length === 1, 'two selects validated with ONE record.load (21 units in all)');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
