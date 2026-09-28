/**
 * Tests for Send Quote SL 1.8.0 — update opportunity fields on send.
 *
 * No test framework: the repository has no package.json. `define` is stubbed, the real
 * Suitelet and Opportunity UE are loaded under stubbed N/* modules and a stubbed Master
 * Proposal, and each scenario is checked with ok(). Exits non-zero on any failure.
 *
 *   node test/send-quote-opp-update.js
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

function resetState() {
    state = {
        calls: [],          // ordered call log
        submits: [],        // Suitelet record.submitFields calls
        emails: [],
        logs: [],
        emailThrows: null,
        generateFails: false,
        submitThrows: null,
        selectOptionsThrow: {},   // fieldId → true
        fieldTypes: { entitystatus: 'select', custbody_next_contact: 'date', custbody_opp_del_date: 'date', custbody_build_stage: 'select' },
        oppValues: {
            tranid: 'OPP123', title: 'Test Opp', entity: '55', entitystatus: '10',
            custbody_opp_site_adress: '1 Test Street',
            custbody_next_contact: new Date(2026, 9, 1),     // 01/10/2026
            custbody_opp_del_date: new Date(2026, 10, 15),   // 15/11/2026
            custbody_build_stage: '3'
        },
        options: {
            entitystatus:         [{ value: '10', text: 'Proposal' }, { value: '12', text: 'In Negotiation' }, { value: '13', text: 'Closed Won' }],
            custbody_build_stage: [{ value: '3', text: 'Foundations' }, { value: '4', text: 'Roof on' }]
        },
        lookupText: { entitystatus: 'In Negotiation', custbody_build_stage: 'Roof on' },
        quoteCount: 1
    };
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

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
        updateDisplaySize: function () {},
        updateLayoutType: function () {},
        updateBreakType: function () {}
    };
}

var serverWidgetStub = {
    FieldType: { INLINEHTML: 'inlinehtml', TEXT: 'text', SELECT: 'select', DATE: 'date', CHECKBOX: 'checkbox' },
    FieldDisplayType: { HIDDEN: 'hidden', ENTRY: 'entry' },
    SublistType: { LIST: 'list' },
    createForm: function (o) {
        var form = {
            title: o.title, fields: [], groups: [], sublists: [], buttons: [],
            addField: function (fo) { var f = makeField(fo); this.fields.push(f); return f; },
            addFieldGroup: function (g) { this.groups.push(g); state.calls.push('addFieldGroup'); return g; },
            addSublist: function (so) {
                var sl = { id: so.id, fields: [], addField: function (fo) { var f = makeField(fo); this.fields.push(f); return f; },
                           setSublistValue: function () {} };
                this.sublists.push(sl);
                state.calls.push('addSublist');
                return sl;
            },
            addSubmitButton: function (b) { this.buttons.push(b); },
            addButton: function (b) { this.buttons.push(b); },
            field: function (id) { return this.fields.filter(function (f) { return f.id === id; })[0]; },
            html: function () { return this.fields.map(function (f) { return f.defaultValue || ''; }).join('\n'); }
        };
        return form;
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

var recordStub = {
    Type: { OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate' },
    load: function (o) {
        state.calls.push('record.load:' + o.type);
        if (o.type === 'opportunity') return makeOppRecord(o);
        throw new Error('estimate load not stubbed');   // Suitelet falls back to search values
    },
    submitFields: function (o) {
        state.calls.push('record.submitFields');
        state.submits.push(o);
        if (state.submitThrows) throw new Error(state.submitThrows);
        return o.id;
    }
};

function makeResult() {
    var vals = { internalid: '901', tranid: 'EST901', title: 'HP quote', total: '1000.00',
                 custbody_test_new_quote: 'https://example/q/901', datecreated: '01/09/2026', custbody_quote_description: 'desc' };
    return {
        getValue: function (o) { return vals[typeof o === 'string' ? o : o.name] || ''; },
        getText: function (o) { return (typeof o === 'string' ? o : o.name) === 'custbody_quote_type' ? 'Heat Pump (ASHP)' : ''; }
    };
}

var searchStub = {
    Type: { CUSTOMER: 'customer', OPPORTUNITY: 'opportunity', ESTIMATE: 'estimate' },
    Sort: { DESC: 'DESC', ASC: 'ASC' },
    createColumn: function (o) { return o; },
    lookupFields: function (o) {
        state.calls.push('search.lookupFields:' + o.type);
        if (o.type === 'customer') return { email: 'cust@example.com' };
        var out = {};
        o.columns.forEach(function (c) { out[c] = [{ value: 'x', text: state.lookupText[c] }]; });
        return out;
    },
    create: function (o) {
        var isEstimate = o.type === 'estimate' || o.type === 'transaction';
        var results = isEstimate ? (state.quoteCount ? [makeResult()] : []) : [];
        return {
            run: function () {
                return {
                    getRange: function () { return results; },
                    each: function (cb) { results.forEach(cb); }
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

var masterProposalStub = {
    generateMasterProposal: function () {
        state.calls.push('generateMasterProposal');
        if (state.generateFails) return { success: false, error: 'boom', proposalUrl: '', fileId: 0, fileName: '' };
        return { success: true, proposalUrl: 'https://acct.app.netsuite.com/core/media/media.nl?id=1', fileId: 1, fileName: 'proposal_1.html' };
    },
    generatePreviewHTML: function () { state.calls.push('generatePreviewHTML'); return '<html>preview</html>'; },
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
    'N/url': { resolveScript: function () { return '/app/site/hosting/scriptlet.nl'; } },
    'N/redirect': {},
    'N/runtime': { getCurrentUser: function () { return { id: '7' }; } },
    'N/format': formatStub,
    'N/email': emailStub,
    './nuheat_master_proposal': masterProposalStub
};
modules['./nuheat_bus_grant'] = loadModule('nuheat_bus_grant.js', modules);
modules['./nuheat_vat_rates'] = loadModule('nuheat_vat_rates.js', modules);

var suitelet = loadModule('nuheat_send_quote_sl.js', modules);
var oppUe    = loadModule('nuheat_opportunity_ue.js', modules);

// ─── Request helpers ───────────────────────────────────────────────────────────

function runGet() {
    var ctx = {
        request: { method: 'GET', parameters: { opportunityId: '123' } },
        response: { page: null, writePage: function (f) { this.page = f; }, write: function (h) { this.written = h; }, setHeader: function () {} }
    };
    suitelet.onRequest(ctx);
    return ctx.response.page;
}

/** Builds POST parameters as the unchanged form would submit them. */
function baseParams(overrides) {
    var p = {
        custpage_opportunity_id: '123',
        custpage_email_to: 'cust@example.com', custpage_email_cc: '', custpage_email_bcc: '',
        custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage',
        custpage_upd_entitystatus: '10', custpage_orig_entitystatus: '10', custpage_origtxt_entitystatus: 'Proposal',
        custpage_upd_next_contact: '01/10/2026', custpage_orig_next_contact: '01/10/2026', custpage_origtxt_next_contact: '01/10/2026',
        custpage_upd_del_date: '15/11/2026', custpage_orig_del_date: '15/11/2026', custpage_origtxt_del_date: '15/11/2026',
        custpage_upd_build_stage: '3', custpage_orig_build_stage: '3', custpage_origtxt_build_stage: 'Foundations'
    };
    Object.keys(overrides || {}).forEach(function (k) { p[k] = overrides[k]; });
    return p;
}

function runPost(params) {
    var row = {
        custpage_select: 'T', custpage_quote_id: '901', custpage_category: 'main', custpage_quote_number: 'EST901',
        custpage_quote_title: 'HP quote', custpage_quote_type: 'Heat Pump', custpage_amount: '£1,000.00',
        custpage_subtotal: '£1,000.00', custpage_discount_total: '£0.00', custpage_tax_total: '£0.00',
        custpage_quote_url: 'https://example/q/901', custpage_quote_description: '', custpage_bus_amount: '0',
        custpage_bus_rate: 'none', custpage_vat_rate: '0', custpage_vat_percent: '0%'
    };
    var ctx = {
        request: {
            method: 'POST',
            parameters: params,
            getLineCount: function (o) { return o.group === 'custpage_quotes_heat_pump' ? 1 : -1; },
            getSublistValue: function (o) { return row[o.name]; }
        },
        response: { page: null, writePage: function (f) { this.page = f; }, write: function (h) { this.written = h; }, setHeader: function () {} }
    };
    suitelet.onRequest(ctx);
    return ctx.response.page;
}

function allWrittenKeys() {
    var keys = [];
    state.submits.forEach(function (s) { keys = keys.concat(Object.keys(s.values)); });
    return keys;
}

function auditLogs(title) {
    return state.logs.filter(function (l) { return l.level === 'audit' && l.title === title; });
}

// ─── Scenarios ─────────────────────────────────────────────────────────────────

console.log('1. POST, nothing changed');
resetState();
var page = runPost(baseParams());
ok(state.emails.length === 1, 'email sent');
ok(state.submits.length === 0, 'no field submitFields');
ok(/No opportunity fields changed\./.test(page.html()), 'panel says no changes');
ok(/Proposal link saved to the opportunity\./.test(page.html()), 'proposal-link statement shown');
ok(!/has been updated with the proposal URL/.test(page.html()), 'old unconditional statement removed');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /no changes/.test(l.details); }), 'audit "no changes"');

console.log('2. Status changed only');
resetState();
page = runPost(baseParams({ custpage_upd_entitystatus: '12' }));
ok(state.submits.length === 1, 'one submitFields');
ok(state.submits[0] && JSON.stringify(Object.keys(state.submits[0].values)) === '["entitystatus"]', 'only entitystatus written');
ok(state.submits[0] && state.submits[0].values.entitystatus === '12', 'raw value written');
ok(state.submits[0] && state.submits[0].type === 'opportunity' && state.submits[0].id === '123', 'targets the opportunity');
ok(state.submits[0] && state.submits[0].options.enableSourcing === false && state.submits[0].options.ignoreMandatoryFields === true, 'options match existing write');
ok(/Status:<\/span> In Negotiation/.test(page.html()), 'panel shows display text of new status');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /entitystatus: 10 → 12/.test(l.details); }), 'audit old → new');

console.log('3. All four changed');
resetState();
page = runPost(baseParams({ custpage_upd_entitystatus: '12', custpage_upd_next_contact: '05/10/2026',
                             custpage_upd_del_date: '01/12/2026', custpage_upd_build_stage: '4' }));
ok(state.submits.length === 1, 'one submitFields');
var v3 = state.submits[0] ? state.submits[0].values : {};
ok(Object.keys(v3).sort().join(',') === 'custbody_build_stage,custbody_next_contact,custbody_opp_del_date,entitystatus', 'all four fields');
ok(v3.custbody_next_contact instanceof Date && v3.custbody_opp_del_date instanceof Date, 'both dates are Date objects');
ok(v3.custbody_opp_del_date && v3.custbody_opp_del_date.getMonth() === 11 && v3.custbody_opp_del_date.getDate() === 1, 'delivery date parsed correctly');
ok(v3.custbody_build_stage === '4', 'build stage raw value');

console.log('4. Delivery date cleared');
resetState();
runPost(baseParams({ custpage_upd_del_date: '' }));
ok(state.submits.length === 0, 'blank-only change → no write');
resetState();
runPost(baseParams({ custpage_upd_del_date: '', custpage_upd_build_stage: '4' }));
ok(state.submits.length === 1 && !('custbody_opp_del_date' in state.submits[0].values), 'blank not written alongside other change');
resetState();
runPost(baseParams({ custpage_upd_build_stage: '' }));
ok(state.submits.length === 0, 'blank Build stage not written');

console.log('5. Email send fails');
resetState();
state.emailThrows = 'SMTP down';
page = runPost(baseParams({ custpage_upd_entitystatus: '12' }));
ok(state.submits.length === 0, 'no field write');
ok(/Opportunity fields were not updated because the email was not sent\./.test(page.html()), 'panel explains');
ok(/Email Sending Failed/.test(page.html()), 'existing email-failure panel still shown');

console.log('6. Generation fails');
resetState();
state.generateFails = true;
page = runPost(baseParams({ custpage_upd_entitystatus: '12' }));
ok(state.submits.length === 0, 'no field write');
ok(state.emails.length === 0, 'no email');
ok(page.title === 'Send Quote — Error' && /Proposal generation failed: boom/.test(page.html()), 'error page as today');

console.log('7. Field submitFields throws');
resetState();
state.submitThrows = 'You do not have permission to set a value for element custbody_build_stage';
page = runPost(baseParams({ custpage_upd_entitystatus: '12', custpage_upd_build_stage: '4' }));
var h7 = page.html();
ok(page.title === 'Quote Proposal — Generated Successfully', 'success page, not error page');
ok(/View Master Proposal/.test(h7), 'proposal link shown');
ok(/Email Sent Successfully/.test(h7), 'email success shown');
ok(/The proposal was sent, but the opportunity could not be updated: You do not have permission/.test(h7), 'warning with message');
ok(/Please set Status, Build stage on the opportunity\./.test(h7), 'warning names the fields');
ok(state.logs.some(function (l) { return l.level === 'error' && l.title === 'SendQuoteSL.OppUpdate' && /123/.test(l.details) && /entitystatus: 10 → 12/.test(l.details); }), 'error logged with opp ID and attempted values');

console.log('8. Order');
resetState();
runPost(baseParams({ custpage_upd_entitystatus: '12' }));
var iGen = state.calls.indexOf('generateMasterProposal');
var iEmail = state.calls.indexOf('email.send');
var iSubmit = state.calls.indexOf('record.submitFields');
ok(iGen >= 0 && iEmail > iGen && iSubmit > iEmail, 'generate → email.send → submitFields (' + state.calls.join(' > ') + ')');

console.log('9. Preview');
resetState();
var pctx = {
    request: { method: 'GET', parameters: { action: 'preview', opportunityId: '123',
        quotes: JSON.stringify([{ tranId: 'EST901', category: 'main' }]),
        custpage_upd_fields: 'entitystatus', custpage_upd_entitystatus: '12', custpage_orig_entitystatus: '10' } },
    response: { writePage: function () {}, write: function (h) { this.written = h; }, setHeader: function () {} }
};
suitelet.onRequest(pctx);
ok(state.calls.indexOf('generatePreviewHTML') >= 0 && /preview/.test(pctx.response.written), 'preview rendered');
ok(state.submits.length === 0 && state.calls.indexOf('record.submitFields') === -1, 'no submitFields');

console.log('10. Sub-status never written');
resetState();
runPost(baseParams({ custpage_upd_fields: 'entitystatus,next_contact,del_date,build_stage,sub_status',
                     custpage_upd_sub_status: '99', custpage_orig_sub_status: '1',
                     custbody_opportunity_sub_status: '99', custpage_upd_entitystatus: '12' }));
ok(allWrittenKeys().indexOf('custbody_opportunity_sub_status') === -1, 'not written even when posted');
ok(allWrittenKeys().join(',') === 'entitystatus', 'only the known field written');
var slSrc = fs.readFileSync(path.join(ROOT, 'nuheat_send_quote_sl.js'), 'utf8');
ok(!/custbody_opportunity_sub_status['"]?\s*:/.test(slSrc) && !/fieldId:\s*'custbody_opportunity_sub_status'/.test(slSrc), 'source never uses sub-status as a write key or field def');

console.log('11. GET, getSelectOptions throws for Build stage');
resetState();
state.selectOptionsThrow.custbody_build_stage = true;
var form = runGet();
ok(!!form.field('custpage_upd_entitystatus') && !!form.field('custpage_upd_next_contact') && !!form.field('custpage_upd_del_date'), 'other three present');
ok(!form.field('custpage_upd_build_stage'), 'Build stage absent');
ok(form.field('custpage_upd_fields').defaultValue === 'entitystatus,next_contact,del_date', 'shown-keys list excludes build_stage');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /custbody_build_stage/.test(l.details) && /getSelectOptions failed/.test(l.details); }), 'audit logged with error');
ok(form.groups.length === 1 && form.groups[0].id === 'custpage_grp_opp_update' && form.groups[0].label === 'Update opportunity', 'field group added');
ok(state.calls.indexOf('addFieldGroup') < state.calls.indexOf('addSublist'), 'group added before quote sublists');
var st = form.field('custpage_upd_entitystatus');
ok(st.container === 'custpage_grp_opp_update' && st.type === 'select', 'status is SELECT in the group');
ok(st.options.length === 3 && st.options.filter(function (o) { return o.isSelected; })[0].value === '10', 'status options from record, current selected, no blank');
ok(form.field('custpage_upd_next_contact').defaultValue === '01/10/2026', 'next contact pre-populated (formatted)');
ok(form.field('custpage_orig_del_date').defaultValue === '15/11/2026' && form.field('custpage_orig_del_date').displayType === 'hidden', 'hidden original date');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /reported field types: entitystatus=select, custbody_next_contact=date/.test(l.details); }), 'reported types logged');

console.log('11b. GET, full section; type mismatch; current status not in options');
resetState();
form = runGet();
var bs = form.field('custpage_upd_build_stage');
ok(bs && bs.options[0].value === '' && bs.options.length === 3, 'Build stage has blank first option');
ok(bs && bs.options.filter(function (o) { return o.isSelected; })[0].value === '3', 'Build stage current selected');
ok(form.field('custpage_orig_entitystatus').defaultValue === '10', 'hidden original status raw value');
resetState();
state.fieldTypes.custbody_next_contact = 'datetimetz';
form = runGet();
ok(!form.field('custpage_upd_next_contact'), 'unexpected type → field not shown');
ok(auditLogs('SendQuoteSL.OppUpdate').some(function (l) { return /custbody_next_contact reports type "datetimetz" but "date" was assumed/.test(l.details); }), 'type mismatch audit-logged');
resetState();
state.oppValues.entitystatus = '99';
form = runGet();
ok(!form.field('custpage_upd_entitystatus'), 'status not among options → not shown (would silently change it)');

console.log('12. GET, no quotes');
resetState();
state.quoteCount = 0;
form = runGet();
ok(form.groups.length === 0, 'no field group');
ok(!form.fields.some(function (f) { return /^custpage_(upd|orig|origtxt)_/.test(f.id); }), 'no update fields');

console.log('13. beforeLoad');
function runUe(type) {
    var buttons = [];
    oppUe.beforeLoad({
        type: type,
        UserEventType: { VIEW: 'view', EDIT: 'edit', CREATE: 'create' },
        newRecord: { id: '123' },
        form: { addButton: function (b) { buttons.push(b); }, removeButton: function () {} }
    });
    return buttons;
}
ok(runUe('edit').length === 0, 'EDIT → no button');
ok(runUe('view').length === 1 && runUe('view')[0].id === 'custpage_send_quote', 'VIEW → button');
ok(runUe('create').length === 0, 'CREATE → no button');

console.log('14. Escaping');
resetState();
state.submitThrows = '<script>alert(1)</script>';
page = runPost(baseParams({ custpage_upd_entitystatus: '12' }));
ok(!/<script>alert/.test(page.html()) && /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(page.html()), 'error message escaped');
resetState();
state.lookupText.entitystatus = '<script>x</script>';
page = runPost(baseParams({ custpage_upd_entitystatus: '12' }));
ok(!/<script>x/.test(page.html()) && /&lt;script&gt;x/.test(page.html()), 'changed value text escaped');

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
