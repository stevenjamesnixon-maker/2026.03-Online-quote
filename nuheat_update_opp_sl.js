/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Update Opportunity Suitelet
 * @description "Update opportunity" page, opened from the Opportunity (VIEW) button: 1 Log the call
 *              (switch, on) → 2 Send an email (switch, off) → 3 Update the opportunity → 4 Log any
 *              objections. Saves a completed Phone Call, sends a bespoke email from the user, saves one
 *              Customer Objection per ticked type, then the Opportunity fields LAST, and returns to the
 *              Opportunity with the result banner (nuheat_opportunity_ue.js, nsqs=upd).
 * @version     1.3.1
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_update_opp_sl
 * Deployment ID:  customdeploy_nuheat_update_opp_sl
 *
 * ⚠️ DEPLOYMENT: nuheat_opp_update_lib.js (1.4.1) must be uploaded to SuiteScripts/NuHeat/2026 Quote/
 *    BEFORE this script, or it fails at load time.
 * ⚠️ 1.2.1: create the script parameter custscript_nuheat_updbtn_mode (Free-Form Text) first and leave
 *    it empty (= OFF) on the Released deployment until the dashboard go-live — DEPLOYMENT_CHECKLIST 2f-2.
 *
 * CHANGELOG v1.3.1 (PR #37 amendment 1 — a "Your project" box, 2 Oct 2026):
 *   - Both modes: after the hero and before the message, the dashboard's "Your order" box as "YOUR
 *     PROJECT" (lib.emailFactBoxV2, lib 1.4.1). Title: the Opportunity title, else the site address
 *     (line breaks → ", "), else the QR number. Rows, each only with a value: Project ("QR · site", the
 *     site left out when it is the title), Project stage (custbody_build_stage's text, the leading
 *     number removed — the dashboard's stageLabel), Expected start (custbody_opp_del_date, "Mar 2027",
 *     past dates too).
 *   - "Request an update" only: under the box, "Has anything changed? Let us know with the button
 *     below." — or "Tell us where your project is up to with the button below." with no stage and no
 *     expected start. The message, the fixed-line rule and the button follow as before.
 *   - The facts are the Opportunity's CURRENT values: one extra lookupFields (1 unit) when an email is
 *     built, never posted values. Fields are written last, so a value changed in the same save shows as
 *     it was before. A failed lookup → no box (logged at error), the email still goes.
 *
 * CHANGELOG v1.3.0 (Customer email family v2, step 1 — the v2 customer email design, 2 Oct 2026):
 *   - The email (both "Write an email" and "Request an update") now matches the dashboard's "Book your
 *     delivery" email: lib.emailShellV2 (lib 1.4.0) — coloured logo, purple band (eyebrow "An update
 *     from Nu-Heat", or "Your project" for an update request; headline = the subject; no greeting),
 *     the hero, the message in the v2 body style, the GIVE US AN UPDATE button in the v2 primary style
 *     (lib.emailButtonV2), the sender card (lib.emailSenderCardV2: CALL filled, EMAIL outlined) and the
 *     teal footer with one line, "You’re receiving this because you have a project with Nu-Heat."
 *   - The separate "Best wishes, <name>" paragraph is gone (the card signs off), and so is "Thanks,"
 *     at the end of the "Request an update" prefill. The footer's "just reply to this email" line is
 *     replaced by the footer line above.
 *   - Unchanged: the label (YOUR NU-HEAT CONTACT for every sender), the photo rule (https only), the
 *     contact rules (no phone → email alone, no CALL button; the PE's card shows design@nu-heat.co.uk),
 *     escaping, the fixed line only for an update request with no message, and the button URL.
 *
 * CHANGELOG v1.2.2 (PR #36 amendment 2 — "Write an email" or "Request an update", 2 Oct 2026):
 *   - The tick box is REMOVED. When the mode allows it, Send an email opens with a two-option choice,
 *     posted as custpage_email_kind = write (default) | update (missing or anything else = write).
 *     "Write an email" = the 1.1.1 email: message required, no button, no recipient restriction.
 *     "Request an update" = a ready-made, editable email: subject "Could you give us a quick update on
 *     <tranid>?" (unless the rep already changed the subject), message "Hi <first name>, …" (unless the
 *     rep already typed one; first name only when the customer isperson, else "Hi,"). The message is
 *     OPTIONAL in this mode: empty → the fixed line (EMAIL_COPY.updateLine) stands in, so the button
 *     never stands alone; otherwise the fixed line is dropped (the message carries that wording).
 *     Recipients: the 1.2.0 rule. Switching back restores the recipients (and set-aside addresses)
 *     and puts back the subject / message only where the prefill was not edited.
 *   - Not offerable (no link / stale / inactive) → "Request an update" disabled with the reason;
 *     "Write an email" stays selected. Mode excludes the user → no choice, the 1.1.1 section; a posted
 *     update is treated as write ("ignored: mode X", as 1.2.1) — so its message is then required.
 *   - The Message label's "*" is hidden while "Request an update" is chosen; .nsq-tick[hidden] now
 *     really hides (1.2.0's Dashboard contact row stayed visible, disabled, because of display:flex).
 *   - The server adds the button; the page never sends it. The customer lookup adds isperson and
 *     firstname (only when the mode allows the user). The refusal now says "Choose ‘Write an email’".
 *
 * CHANGELOG v1.2.1 (PR #36 amendment 1 — an on/off switch, 2 Oct 2026):
 *   - New script parameter custscript_nuheat_updbtn_mode (Free-Form Text, "Give us an update button:
 *     OFF, ADMIN or ALL"). Empty, OFF, unknown, or unreadable → OFF (fail closed): the tick box is not
 *     rendered, the customer lookup reads only email, the email section is byte-identical to 1.1.1 and
 *     a posted tick is ignored. ADMIN → offered only to runtime.getCurrentUser().roleId ===
 *     'administrator' (the standard role's script ID). ALL → everyone, as 1.2.0.
 *   - The POST applies the same rule: a tick from a user the mode excludes is treated as tick off
 *     (no button, no recipient rule), audit UpdateOppSL.UpdateButton "ignored: mode X". An unknown value
 *     is logged once per request at debug. Value trimmed and case-insensitive.
 *
 * CHANGELOG v1.2.0 ("Request an update" part B — a "Give us an update" button in the email, 2 Oct 2026):
 *   - Section 2 gains a tick box under the message, "Add a 'Give us an update' button" (off;
 *     custpage_email_updbtn = 'T' when ticked). Offered only when the customer is active and
 *     custentity_cdb_link's t payload names this customer at custentity_cdb_link_version
 *     (lib.cdbLinkMatches — the signature is not checked; the dashboard does that). Otherwise shown
 *     disabled with the reason (logged at debug). Needs the dashboard's part A (it fills the link).
 *   - The customer lookup the page already makes also reads custentity_cdb_link,
 *     custentity_cdb_link_version, isinactive and custentity_cdb_dashboard_contact; one contact lookup
 *     for the dashboard contact's email when it is set (only when the button is offered).
 *   - With the tick on, To may only be the customer's email, the dashboard contact (a "Dashboard
 *     contact" tick when that contact is not already on the opportunity) and opportunity contacts whose
 *     company is this customer. "Other addresses" is disabled on the page and refused on the server,
 *     as is any other company's contact (UPDBTN_COPY.refusal). CC me stays allowed. All rechecked on
 *     the server before the save token is claimed; a refusal re-renders with every entry restored.
 *   - The email gains one line (EMAIL_COPY.updateLine) and the GIVE US AN UPDATE button between the
 *     message and the sign-off: <stored link>&a=update&opp=<id>. Tick off → the email is byte-identical.
 *   - UpdateOppSL.Email's "from" line gains | {"updateButton":true,"opp":"<id>"} when ticked. The link
 *     is never logged. Objection context lines, the phone call and the redirect codes are unchanged.
 *
 * CHANGELOG v1.1.1 (Release 2.1 part A — no behaviour change):
 *   - The objection loop moved to the library as lib.createObjections (with OBJ and objectionNotes);
 *     same fields, same notes (D11/D21), same raised on (D10/D22), same audit lines. Needs lib 1.2.0.
 *
 * CHANGELOG v1.1.0 (optional call, bespoke email, save guard — in Production, 1 Oct 2026):
 *   - D15: "Log a phone call" switch (on). Off → section 1 collapses, its inputs are disabled (not
 *     posted, not validated), no Phone Call, no nsqc. custpage_call_on: 'T' on, 'F' off, missing = on.
 *   - D16–D20: "Send an email" switch (off; custpage_email_on, missing = off). Bespoke only: subject
 *     = headline (≤ 120, pre-filled "An update on <tranid>"), message (≤ 10,000, plain text), sent
 *     FROM the current user inside the library's email shell with the user's employee contact card.
 *     Recipients: contact ticks (IDs), Customer, other addresses, CC me — rebuilt on the server, 1–10.
 *   - D9 amended: phone call → email → objections → Opportunity fields LAST.
 *   - D21: objection notes always get a context line (call notes / "Email sent (…)" / "Logged via
 *     Update opportunity (…)"); the per-objection note stays optional.
 *   - D22: with the call off, raised on = the browser's today (custpage_today) if within [server
 *     today, server today + 1], else server today.
 *   - D23: Save needs a call, an email, an objection or a changed field (lib.pendingChanges).
 *   - D24: email failure → continue, amber banner (nsqe=fail). Never retried.
 *   - D25: one-time save token (N/cache, PRIVATE, 1 hour) — a resubmitted page saves nothing
 *     (nsq=dup). Freed when the call fails; never consumed by a validation failure.
 *   - New audit keys UpdateOppSL.Email and UpdateOppSL.Guard; the summary line gains email and call.
 *   - The D3 message now says "Set it in step 3" (the update section moved from 2 to 3).
 *   - Amendment 2 (D18a): a "From" select — Me, the Opportunity's sales rep (salesrep) or project
 *     engineer (custbody_pe), each only when set, with an email, and not a repeat. Posted as a code
 *     (custpage_email_from = me | rep | pe, missing = me); the server resolves the employee (one
 *     lookupFields with entity), and author, card and sign-off are that employee. As the PE, the
 *     card's email line and EMAIL button show design@nu-heat.co.uk (Send Design's rule). "CC me" is
 *     always the current user; the chosen sender gets no automatic copy.
 *
 * DECISIONS (see AI_AGENT_CONTEXT — do not reverse without Steve):
 *   - Never touches forecast flags (includeinforecast) and never writes custbody_opportunity_sub_status.
 *   - Validate everything BEFORE any write. If the phone call fails, stop: nothing is sent or written
 *     and the page re-renders ("Nothing was saved"). Email, objection and field failures do not stop
 *     later steps; they give an amber banner.
 *   - Save order: phone call → email → objections → Opportunity fields LAST (the 2.0.1 rule).
 *   - Next contact is required on EVERY save: the Opportunity must END UP with one — checked on the
 *     client and on the server against the record (lib.validateRequired), never against posted originals.
 *   - Lists and records are read at runtime by script ID — no internal IDs in code. Call Titles and
 *     Objection Types display in internal-ID order (types grouped by group internal ID).
 *   - Dates: the page takes "today" from the BROWSER (the server runs on NetSuite's own clock and can
 *     be a day behind a UK user in the morning); the server accepts up to its own today + 1 day.
 *   - No record or user data inside the <script>; user text never passes through a merge-tag pass.
 *   - Redirect parameters are codes only (nsqs=upd, nsq, nsqt, nsqf/nsqff, nsqc, nsqo, nsqof, nsqe, nsqen).
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/log',
    'N/redirect',
    'N/runtime',
    'N/format',
    'N/cache',
    './nuheat_opp_update_lib'
], function (serverWidget, search, record, log, redirect, runtime, format, cache, lib) {

    'use strict';

    var SCRIPT_VERSION = '1.3.1';

    /** Page rules for the shared update fields: Next contact must end up set. */
    var RULES = { required: ['next_contact'], logKey: 'UpdateOppSL.OppUpdate' };

    // ─── Account objects (script IDs only) ────────────────────────────────────────

    var CALL_TITLE_LIST = 'customlist_nh_call_title';

    var OBJECTION_TYPE_RECORD = 'customrecord_nh_objection_type';
    var OBJECTION_TYPE_GROUP  = 'custrecord_nhot_group';

    // v1.1.1: the Customer Objection fields (OBJ) moved to the library (lib.OBJECTION_FIELDS).

    /**
     * Phone Call — ⚠️ ASSUMED standard field IDs, assumed until Sandbox U3 confirms them (the call
     * must appear under the Opportunity's Communication › Activities with title, notes, date,
     * completed status, customer and the user as assigned).
     */
    var CALL = {
        title:       'title',
        message:     'message',
        startDate:   'startdate',
        status:      'status',
        completed:   'COMPLETE',
        company:     'company',
        transaction: 'transaction',
        assigned:    'assigned',
        contact:     'contact'
    };

    /** ⚠️ ASSUMED Phone Call title limit — enforced on the client and the server. */
    var CALL_TITLE_MAX = 99;
    var CALL_NOTES_MAX = 3900;
    var OBJ_NOTE_MAX   = 300;

    var escapeHtml = lib.escapeHtml;

    // ─── Email (v1.1.0) ───────────────────────────────────────────────────────────

    var EMAIL_SUBJECT_MAX = 120;
    var EMAIL_MESSAGE_MAX = 10000;

    /**
     * D19: the bespoke email's fixed copy. Steve may reword these — keep them in this one block.
     * v1.3.0: the v2 customer email design — the band's eyebrow per mode, one footer line, and no
     * separate sign-off (the sender card does that job).
     */
    var EMAIL_COPY = {
        eyebrow:       'An update from Nu-Heat',        // v1.3.0: "Write an email" (shown in capitals)
        eyebrowUpdate: 'Your project',                  // v1.3.0: "Request an update"
        subjectStart: 'An update on ',                  // + the Opportunity's tranid (D17)
        cardLabel:    'YOUR NU-HEAT CONTACT',
        footer:       'You’re receiving this because you have a project with Nu-Heat.',   // v1.3.0: inside the teal footer
        nameFallback: 'Nu-Heat',                        // only if the employee record has no name at all
        pageNote:     'Sent from you, with your contact details. Replies come to you.',
        // Amendment 2 (D18a): the note when sending as the sales rep / project engineer
        pageNoteOtherStart: 'Sent as ',                 // + the selected option's label
        pageNoteOtherEnd:   ', with their contact details. Replies go to them.',
        // The project engineer's card shows the design team's address, not the PE's own — Send Design's
        // rule (NS-Design-Email dsn_sl_send_design.js, senderEmailForBody). Replies still go to the PE.
        peCardEmail:  'design@nu-heat.co.uk',
        // v1.2.0: the "Give us an update" button — the line before it and its label
        // v1.2.2: used only when a "Request an update" email has no message — the button never stands alone
        updateLine:   'When you have a moment, let us know where your project is up to. It only takes a minute, and it helps us be ready when you need us.',
        // v1.2.2: the "Request an update" prefill (editable on the page; the server never adds these)
        updateSubjectStart: 'Could you give us a quick update on ',   // + the Opportunity's tranid
        updateSubjectEnd:   '?',
        updateHi:           'Hi',                                     // + ' <first name>' for a person, then ','
        updateBody:         'We’d love to know where your project is up to, so we can be ready when you need us. Just press the button below. It only takes a minute.',
        // v1.3.0: no "Thanks," — the sender card signs the email off
        updateButton: 'GIVE US AN UPDATE',
        // v1.3.1: the "Your project" box (both modes) and, for "Request an update", the line under it
        projectLabel:   'YOUR PROJECT',
        factProject:    'Project',
        factStage:      'Project stage',
        factStart:      'Expected start',
        updateCta:      'Has anything changed? Let us know with the button below.',
        updateCtaEmpty: 'Tell us where your project is up to with the button below.'   // no stage and no expected start
    };

    /** v1.3.1: the Opportunity columns the "Your project" box reads (current values, never posted ones). */
    var PROJECT_COLUMNS = ['tranid', 'title', 'custbody_opp_site_adress', 'custbody_build_stage', 'custbody_opp_del_date'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ─── "Give us an update" button (v1.2.0) ──────────────────────────────────────

    /**
     * The customer dashboard's fields (dashboard repo, "Request an update" part A). custentity_cdb_link
     * holds the customer's signed BASE link; this page appends &a=update&opp=<id>. No dashboard file is
     * required and the API Secret is never read: the link is used as stored.
     */
    var CDB = {
        link:    'custentity_cdb_link',
        version: 'custentity_cdb_link_version',
        contact: 'custentity_cdb_dashboard_contact'
    };
    var CDB_CUSTOMER_COLUMNS = [CDB.link, CDB.version, 'isinactive', CDB.contact, 'isperson', 'firstname'];   // v1.2.2: + isperson, firstname (the prefill's "Hi <first name>")

    /**
     * v1.2.1: who gets the choice (1.2.1: the tick box) — script parameter on the Update Opportunity deployment.
     * OFF (default; empty, unknown or unreadable too — fail closed), ADMIN (the Administrator role only),
     * ALL. The switch exists because the deployment is already Released to the sales roles.
     */
    var UPDBTN_MODE_PARAM = 'custscript_nuheat_updbtn_mode';
    var ADMIN_ROLE_ID     = 'administrator';   // the standard Administrator role's script ID (roleId)

    var requestAccess = null;   // updBtnAccess() for this request; reset in onRequest

    /**
     * v1.2.1: the mode, and whether the current user gets the button. Read once per request (a
     * refused POST re-renders the page in the same request — one read, one log line).
     * @returns {{ mode: string, allowed: boolean }} mode = 'OFF' | 'ADMIN' | 'ALL'
     */
    function updBtnAccess() {
        if (!requestAccess) requestAccess = readUpdBtnAccess();
        return requestAccess;
    }

    function readUpdBtnAccess() {
        var raw = '';
        try {
            raw = runtime.getCurrentScript().getParameter({ name: UPDBTN_MODE_PARAM });
        } catch (e) {
            log.debug('UpdateOppSL.UpdateButton', 'Mode parameter could not be read (' + e.message + '); OFF');
            return { mode: 'OFF', allowed: false };
        }
        var v = String(raw === null || raw === undefined ? '' : raw).trim().toUpperCase();
        if (v !== '' && v !== 'OFF' && v !== 'ADMIN' && v !== 'ALL') {
            log.debug('UpdateOppSL.UpdateButton', 'Unknown mode "' + String(raw).substring(0, 40) + '"; OFF');
            v = 'OFF';
        }
        var mode = v || 'OFF';
        if (mode === 'ALL') return { mode: mode, allowed: true };
        if (mode === 'ADMIN') {
            var role = '';
            try { role = String(runtime.getCurrentUser().roleId || ''); } catch (e) { role = ''; }
            return { mode: mode, allowed: role === ADMIN_ROLE_ID };
        }
        return { mode: mode, allowed: false };
    }

    /** The page's copy for the "Request an update" choice. Steve may reword these. */
    var UPDBTN_COPY = {
        write:      'Write an email',                // v1.2.2: the choice (replaces the 1.2.0 tick box)
        update:     'Request an update',
        kindLabel:  'What kind of email',
        hint:       'Sends the customer their personal link to update this project’s stage, timing and details. It can only go to the customer and their own contacts.',
        noLink:     'No dashboard link for this customer yet.',
        inactive:   'Customer is inactive.',
        stale:      'The customer’s link is out of date. Ask an administrator to run the link backfill.',
        notOwn:     'Not this customer’s contact',
        extraNote:  'Other addresses are off for an update request: its button opens the customer’s whole project page.',
        dashLabel:  'Dashboard contact',
        refusal:    'The update button opens the customer’s whole project page, so it can only go to the customer and their own contacts. Choose ‘Write an email’, or remove: '
    };

    /**
     * D18a: who the email can be from. The page posts only the code; the server resolves the employee.
     * `me` = the current user; `rep` / `pe` = the Opportunity's field (Employee).
     */
    var FROM_ROLES = {
        rep: { field: 'salesrep',    label: 'Sales rep' },
        pe:  { field: 'custbody_pe', label: 'Project engineer' }
    };

    // ─── Save guard (v1.1.0, D25) ─────────────────────────────────────────────────

    var GUARD_CACHE = 'nh_update_opp_save_guard';
    var GUARD_TTL   = 3600;   // seconds
    var TOKEN_RE    = /^[A-Za-z0-9_-]{8,80}$/;

    // ─── Entry point ──────────────────────────────────────────────────────────────

    function onRequest(context) {
        log.audit('UpdateOppSL.onRequest', 'Method: ' + context.request.method + ' | Version: ' + SCRIPT_VERSION);
        requestAccess = null;   // v1.2.1
        try {
            if (context.request.method === 'GET') {
                var opportunityId = context.request.parameters.opportunityId;
                if (!opportunityId) {
                    showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
                    return;
                }
                renderPage(context, opportunityId, null, null);
            } else {
                handleSave(context);
            }
        } catch (e) {
            log.error('UpdateOppSL.onRequest', 'Unhandled error: ' + e.message + '\n' + e.stack);
            showErrorPage(context, e.message);
        }
    }

    function showErrorPage(context, message) {
        lib.showErrorPage(context, message, 'Update opportunity — Error');
    }

    // ─── Lists read at runtime ────────────────────────────────────────────────────

    /** Active Call Titles in internal-ID order: [{ id, name }]. [] (logged) on failure. */
    function loadCallTitles() {
        var out = [];
        try {
            search.create({
                type:    CALL_TITLE_LIST,
                filters: [['isinactive', 'is', 'F']],
                columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC }), 'name']
            }).run().each(function (r) {
                out.push({ id: String(r.getValue({ name: 'internalid' })), name: r.getValue({ name: 'name' }) || '' });
                return true;
            });
        } catch (e) {
            log.error('UpdateOppSL.Lists', 'Call Title list could not be read: ' + e.message);
        }
        return out;
    }

    /**
     * Active Objection Types: [{ id, name, groupId, groupName }], sorted by group internal ID, then
     * type internal ID (D14). [] (logged) on failure.
     */
    function loadObjectionTypes() {
        var out = [];
        try {
            search.create({
                type:    OBJECTION_TYPE_RECORD,
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid', 'name', OBJECTION_TYPE_GROUP]
            }).run().each(function (r) {
                out.push({
                    id:        String(r.getValue({ name: 'internalid' })),
                    name:      r.getValue({ name: 'name' }) || '',
                    groupId:   String(r.getValue({ name: OBJECTION_TYPE_GROUP }) || ''),
                    groupName: r.getText({ name: OBJECTION_TYPE_GROUP }) || 'Other'
                });
                return true;
            });
        } catch (e) {
            log.error('UpdateOppSL.Lists', 'Objection Types could not be read: ' + e.message);
        }
        out.sort(function (a, b) {
            return (idNum(a.groupId) - idNum(b.groupId)) || (idNum(a.id) - idNum(b.id));
        });
        return out;
    }

    function idNum(v) {
        var n = parseInt(v, 10);
        return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    }

    /**
     * D2: every Estimate on the Opportunity (search columns only — no record loads), newest first:
     * [{ id, label }] where label = "tranid · description" (or title), cleaned.
     */
    function loadEstimates(opportunityId) {
        var out = [];
        try {
            search.create({
                type:    search.Type.ESTIMATE,
                filters: [
                    ['opportunity', 'anyof', opportunityId],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    'internalid', 'tranid', 'title', 'custbody_quote_description'
                ]
            }).run().each(function (r) {
                var tranId = r.getValue({ name: 'tranid' }) || '';
                var text = lib.cleanText(r.getValue({ name: 'custbody_quote_description' })) || lib.cleanText(r.getValue({ name: 'title' }));
                out.push({ id: String(r.getValue({ name: 'internalid' })), label: text ? tranId + ' · ' + text : tranId });
                return true;
            });
        } catch (e) {
            log.error('UpdateOppSL.Lists', 'Estimates could not be read for Opportunity ' + opportunityId + ': ' + e.message);
        }
        return out;
    }

    // ─── GET ──────────────────────────────────────────────────────────────────────

    function renderPage(context, opportunityId, restore, error) {
        // v1.1.0: customerEmail: true — the Customer recipient tick (one lookupFields)
        // v1.2.0: + the dashboard columns in the same customer lookup (the update button) —
        // v1.2.1: only when the mode gives this user the button; otherwise the 1.1.1 lookup
        var access = updBtnAccess();
        var page = lib.loadOppPageBase(opportunityId, access.allowed
            ? { logPrefix: 'UpdateOppSL', customerEmail: true, customerColumns: CDB_CUSTOMER_COLUMNS }
            : { logPrefix: 'UpdateOppSL', customerEmail: true });
        if (page.loadError) {
            showErrorPage(context, page.loadError);
            return;
        }
        page.oppUrl       = lib.resolveOppUrl(opportunityId, 'UpdateOppSL');
        page.updateFields = lib.prepareFields(page.oppRecord, opportunityId, RULES);
        page.callTitles   = loadCallTitles();
        page.types        = loadObjectionTypes();
        page.estimates    = loadEstimates(opportunityId);
        page.senders      = senderOptions(page.oppRecord);   // D18a
        // v1.2.0; v1.2.1: null (mode OFF, or ADMIN for a non-admin) = not rendered — the 1.1.1 email section
        page.updBtn       = access.allowed ? updateButtonState(page.customerId, page.customerFields) : null;
        if (page.updBtn && page.updBtn.ok) {
            page.updBtn.own = ownContacts(page.contacts, page.customerId, page.updBtn.dashContactId, dashContactEmail(page.updBtn.dashContactId));
        } else if (page.updBtn) {
            log.debug('UpdateOppSL.UpdateButton', 'Opportunity ' + opportunityId + ' — update button not offered: ' + page.updBtn.reason);
        }
        // D25: a re-rendered page keeps its token (a validation failure never consumes it)
        page.saveToken    = (restore && TOKEN_RE.test(restore.token || '')) ? restore.token : newSaveToken();

        var form = serverWidget.createForm({ title: 'Update opportunity' });
        var body = form.addField({ id: 'custpage_page', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        body.defaultValue = buildPageHTML(page, restore, error);
        context.response.writePage(form);
    }

    /** Today (server's calendar) as yyyy-mm-dd, from its own date parts. */
    function serverToday() {
        return lib.toIsoDate(new Date());
    }

    /** D25: unique, not secret — the user, the time and a random part. */
    function newSaveToken() {
        var user = String(runtime.getCurrentUser().id || '0').replace(/[^A-Za-z0-9_-]/g, '');
        return 'u' + user + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }

    /**
     * True if the employee is ACTIVE and has a usable email address (one lookupFields; false on any
     * error). Amendment 3: isinactive read in the same lookup — true, 'T' and 'true' all mean inactive.
     */
    function employeeHasEmail(employeeId) {
        try {
            var f = search.lookupFields({ type: search.Type.EMPLOYEE, id: employeeId, columns: ['email', 'isinactive'] }) || {};
            if (f.isinactive === true || f.isinactive === 'T' || f.isinactive === 'true') return false;
            return lib.EMAIL_RE.test(lib.lookupText(f.email).trim());
        } catch (e) {
            log.debug('UpdateOppSL.Email', 'Employee ' + employeeId + ' email check failed: ' + e.message);
            return false;
        }
    }

    /**
     * D18a: the "From" options — Me, then the sales rep and the project engineer when set on the
     * Opportunity, active, with an email address, and not the same person as an earlier option.
     * Names come from the Opportunity's field text (rep / PE) and the session user's name (me).
     * @returns {Array<{code: string, id: string, label: string}>}
     */
    function senderOptions(oppRecord) {
        var user = runtime.getCurrentUser();
        var opts = [{ code: 'me', id: String(user.id || ''), label: 'Me' + (user.name ? ' (' + user.name + ')' : '') }];
        ['rep', 'pe'].forEach(function (code) {
            var role = FROM_ROLES[code];
            var id = '', name = '';
            try {
                id   = String(oppRecord.getValue({ fieldId: role.field }) || '');
                name = oppRecord.getText({ fieldId: role.field }) || '';
            } catch (e) {
                log.debug('UpdateOppSL.Email', role.field + ' could not be read: ' + e.message);
            }
            if (!id || opts.some(function (o) { return o.id === id; })) return;
            if (!employeeHasEmail(id)) return;
            opts.push({ code: code, id: id, label: role.label + (name ? ' (' + name + ')' : '') });
        });
        return opts;
    }

    /** The page note for a From option (D18a). */
    function senderNote(opt) {
        return (!opt || opt.code === 'me') ? EMAIL_COPY.pageNote
            : EMAIL_COPY.pageNoteOtherStart + opt.label + EMAIL_COPY.pageNoteOtherEnd;
    }

    /**
     * v1.2.0: can the update button be offered? From the customer lookup (lib.loadOppPageBase's
     * customerFields, or the POST's own lookup) — never from anything the page posted.
     * @param {string} customerId
     * @param {Object} f - lookupFields result with CDB_CUSTOMER_COLUMNS
     * @returns {{ ok: boolean, reason: string, link: string, dashContactId: string }}
     */
    function updateButtonState(customerId, f) {
        f = f || {};
        var link = lib.lookupText(f[CDB.link]).trim();
        var c = f[CDB.contact];
        var dashContactId = String((Array.isArray(c) ? (c[0] && c[0].value) : c) || '');
        var out = { ok: false, reason: '', link: '', dashContactId: dashContactId };
        if (f.isinactive === true || f.isinactive === 'T' || f.isinactive === 'true') out.reason = UPDBTN_COPY.inactive;
        else if (!link) out.reason = UPDBTN_COPY.noLink;
        else if (!lib.cdbLinkMatches(link, customerId, lib.lookupText(f[CDB.version]))) out.reason = UPDBTN_COPY.stale;
        else { out.ok = true; out.link = link; }
        return out;
    }

    /** v1.2.2: "Could you give us a quick update on <tranid>?" */
    function updateSubject(page) {
        return EMAIL_COPY.updateSubjectStart + (page.tranId || '') + EMAIL_COPY.updateSubjectEnd;
    }

    /**
     * v1.2.2: the "Request an update" message prefill. "Hi <first name>," only when the customer is a
     * person with a first name (lookupFields isperson / firstname); a company → "Hi,".
     */
    function updateMessage(f) {
        f = f || {};
        var person = f.isperson === true || f.isperson === 'T' || f.isperson === 'true';
        var first = person ? lib.cleanText(lib.lookupText(f.firstname)).trim() : '';
        return EMAIL_COPY.updateHi + (first ? ' ' + first : '') + ',\n\n' + EMAIL_COPY.updateBody;   // v1.3.0: no "Thanks,"
    }

    /** v1.2.0: the dashboard contact's email ('' if none, or on any error — logged at debug). */
    function dashContactEmail(contactId) {
        if (!contactId) return '';
        try {
            var e = lib.lookupText(search.lookupFields({ type: search.Type.CONTACT, id: contactId, columns: ['email'] }).email).trim();
            return lib.EMAIL_RE.test(e) ? e : '';
        } catch (err) {
            log.debug('UpdateOppSL.UpdateButton', 'Dashboard contact ' + contactId + ' email lookup failed: ' + err.message);
            return '';
        }
    }

    /**
     * v1.2.0: the contacts the update button may go to — the opportunity's contacts whose company is
     * this customer, plus the dashboard contact. Returns their IDs and, when the dashboard contact is
     * not already on the opportunity, that contact as an extra { id, name, email, company }.
     */
    function ownContacts(contacts, customerId, dashId, dashEmail) {
        var ids = [], extra = null;
        (contacts || []).forEach(function (c) {
            if ((customerId && String(c.company || '') === String(customerId)) || (dashId && String(c.id) === dashId)) ids.push(String(c.id));
        });
        if (dashId && dashEmail && !(contacts || []).some(function (c) { return String(c.id) === dashId; })) {
            extra = { id: dashId, name: UPDBTN_COPY.dashLabel, email: dashEmail, company: String(customerId || '') };
            ids.push(dashId);
        }
        return { ids: ids, extra: extra };
    }

    /** D17: "An update on <tranid>". */
    function defaultSubject(page) {
        return EMAIL_COPY.subjectStart + (page.tranId || '');
    }

    /** A section header switch: the checkbox (not posted; its value goes in a hidden field) and "Off". */
    function switchHTML(id, label, on, offId) {
        return '<label class="nsq-switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + escapeHtml(label) + '</label>' +
            '<span class="nsq-off" id="' + offId + '"' + (on ? ' hidden' : '') + '>Off</span>';
    }

    function buildPageHTML(page, restore, error) {
        var r = restore || {};
        var callOn  = restore ? r.callOn !== false : true;    // D15: on by default
        var emailOn = restore ? r.emailOn === true : false;   // D16: off by default
        // A section that was OFF when posted had its inputs disabled, so nothing of it was posted:
        // render it exactly as a fresh GET would (defaults, nothing ticked). ON → restore as posted.
        var callFresh  = !restore || !callOn;
        var emailFresh = !restore || !emailOn;
        var rc = callFresh ? {} : r;
        var h = [];
        h.push(lib.baseCss() + PAGE_CSS);
        h.push('<div id="nsq-root" class="nsq" data-opp-url="' + escapeHtml(page.oppUrl) + '">');
        h.push('<div class="nsq-wrap">');
        h.push(lib.buildHeaderHTML(page, 'Update opportunity'));
        if (error) h.push(lib.buildErrorAlertHTML(error.lead, error.message));

        h.push('<input type="hidden" name="custpage_opportunity_id" value="' + escapeHtml(page.opportunityId) + '">');
        h.push('<input type="hidden" name="custpage_obj_sel" id="nsq-obj-sel" value="">');
        h.push('<input type="hidden" name="custpage_call_on" id="nsq-call-on-val" value="' + (callOn ? 'T' : 'F') + '">');
        h.push('<input type="hidden" name="custpage_email_on" id="nsq-email-on-val" value="' + (emailOn ? 'T' : 'F') + '">');
        h.push('<input type="hidden" name="custpage_today" id="nsq-today" value="' + escapeHtml(serverToday()) + '">');
        h.push('<input type="hidden" name="custpage_save_token" value="' + escapeHtml(page.saveToken) + '">');

        // ── 1 Log the call ──
        var today = serverToday();
        var dateValue = callFresh ? today : (r.date || '');
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">1</span>Log the call' +
            switchHTML('nsq-call-on', 'Log a phone call', callOn, 'nsq-call-off') + '</h2>');
        h.push('<div id="nsq-call-body"' + (callOn ? '' : ' hidden') + '>');
        h.push('<div class="nsq-call-grid">');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-std-title">Standard title</label>' +
            '<select id="nsq-std-title" name="custpage_call_std" class="nsq-input"><option value=""></option>' +
            page.callTitles.map(function (t) {
                return '<option value="' + escapeHtml(t.name) + '"' + (rc.std === t.name ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>';
            }).join('') + '</select></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-title">Title <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<input type="text" class="nsq-input" id="nsq-call-title" name="custpage_call_title" maxlength="' + CALL_TITLE_MAX +
            '" autocomplete="off" value="' + escapeHtml(rc.title || '') + '"></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-date">Call date <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<input type="date" class="nsq-input" id="nsq-call-date" name="custpage_call_date" value="' + escapeHtml(dateValue) +
            '" max="' + escapeHtml(today) + '"' + (callFresh ? ' data-default="1"' : '') + '></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-contact">Contact</label>' +
            '<select id="nsq-call-contact" name="custpage_call_contact" class="nsq-input"><option value="">No contact</option>' +
            page.contacts.map(function (c) {
                return '<option value="' + escapeHtml(String(c.id)) + '"' + (String(rc.contact || '') === String(c.id) ? ' selected' : '') + '>' +
                    escapeHtml(c.name) + '</option>';
            }).join('') + '</select></div>');
        h.push('</div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-notes">What was discussed <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<textarea class="nsq-input nsq-textarea" id="nsq-call-notes" name="custpage_call_notes" rows="5" maxlength="' + CALL_NOTES_MAX + '">' +
            escapeHtml(rc.notes || '') + '</textarea></div>');
        h.push('</div></section>');

        // ── 2 Send an email (v1.1.0) ──
        var subject = emailFresh ? defaultSubject(page) : (r.subject || '');
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">2</span>Send an email' +
            switchHTML('nsq-email-on', 'Send an email', emailOn, 'nsq-email-off') + '</h2>');
        h.push('<div id="nsq-email-body"' + (emailOn ? '' : ' hidden') + '>');
        // v1.2.2: "Write an email" / "Request an update" — only when the mode allows it (else the 1.1.1 section)
        var ub = page.updBtn;
        if (ub) {
            var kindUpd = ub.ok && !emailFresh && r.kind === 'update';
            h.push('<div class="nsq-field nsq-kind"><div class="nsq-seg-row" role="radiogroup" aria-label="' + escapeHtml(UPDBTN_COPY.kindLabel) + '">' +
                '<label class="nsq-seg"><input type="radio" name="custpage_email_kind" id="nsq-kind-write" value="write"' + (kindUpd ? '' : ' checked') + '><span>' +
                escapeHtml(UPDBTN_COPY.write) + '</span></label>' +
                '<label class="nsq-seg"><input type="radio" name="custpage_email_kind" id="nsq-kind-update" value="update"' +
                (ub.ok ? (kindUpd ? ' checked' : '') + ' data-subject="' + escapeHtml(updateSubject(page)) + '" data-message="' + escapeHtml(updateMessage(page.customerFields)) +
                    '" data-write-subject="' + escapeHtml(defaultSubject(page)) + '"' : ' disabled data-blocked="1"') +
                '><span>' + escapeHtml(UPDBTN_COPY.update) + '</span></label></div>' +
                '<p class="nsq-help nsq-kind-hint">' + escapeHtml(UPDBTN_COPY.hint) + '</p>' +
                (ub.ok ? '' : '<p class="nsq-help nsq-updbtn-why" id="nsq-updbtn-why">' + escapeHtml(ub.reason) + '</p>') + '</div>');
        }
        // D18a: From — posted as a code only; the posted code is restored if still offered, else 'me'
        var fromCode = (!emailFresh && page.senders.some(function (o) { return o.code === r.from; })) ? r.from : 'me';
        var fromOpt = page.senders.filter(function (o) { return o.code === fromCode; })[0];
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-from">From</label>' +
            '<select id="nsq-email-from" name="custpage_email_from" class="nsq-input">' +
            page.senders.map(function (o) {
                return '<option value="' + o.code + '"' + (o.code === fromCode ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
            }).join('') + '</select></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-subject">Subject and headline <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<input type="text" class="nsq-input" id="nsq-email-subject" name="custpage_email_subject" maxlength="' + EMAIL_SUBJECT_MAX +
            '" autocomplete="off" value="' + escapeHtml(subject) + '"></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-message">Message <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<textarea class="nsq-input nsq-textarea" id="nsq-email-message" name="custpage_email_message" rows="8" maxlength="' + EMAIL_MESSAGE_MAX + '">' +
            escapeHtml(emailFresh ? '' : (r.message || '')) + '</textarea></div>');
        h.push(lib.buildRecipientsHTML(page.contacts, page.customerEmail, emailFresh ? null : r.rcpt, (ub && ub.ok) ? {
            ownIds:        ub.own.ids,
            extraContacts: ub.own.extra ? [{ id: ub.own.extra.id, label: UPDBTN_COPY.dashLabel, email: ub.own.extra.email }] : [],
            notOwnNote:    UPDBTN_COPY.notOwn,
            extraNote:     UPDBTN_COPY.extraNote
        } : null));
        h.push('<p class="nsq-help nsq-email-note" id="nsq-email-note" data-note-me="' + escapeHtml(EMAIL_COPY.pageNote) +
            '" data-note-pre="' + escapeHtml(EMAIL_COPY.pageNoteOtherStart) + '" data-note-post="' + escapeHtml(EMAIL_COPY.pageNoteOtherEnd) + '">' +
            escapeHtml(senderNote(fromOpt)) + '</p>');
        h.push('</div></section>');

        // ── 3 Update the opportunity ──
        h.push(lib.buildUpdateSectionHTML(page.updateFields, restore ? { upd: r.upd || {} } : null, 3));

        // ── 4 Log any objections ──
        var ticked = r.objSel || [];
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">4</span>Log any objections <span class="nsq-opt">(optional)</span></h2>');
        h.push('<p class="nsq-help">Optional. Add a note to any objection if it helps.</p>');
        if (!page.types.length) {
            h.push('<p class="nsq-help">Objection types could not be loaded.</p>');
        }
        var lastGroup = null;
        page.types.forEach(function (t) {
            if (t.groupId !== lastGroup) {
                if (lastGroup !== null) h.push('</div>');
                h.push('<h3 class="nsq-h3">' + escapeHtml(lib.cleanText(t.groupName)) + '</h3><div class="nsq-chips">');
                lastGroup = t.groupId;
            }
            var on = ticked.indexOf(t.id) !== -1;
            h.push('<button type="button" class="nsq-chip" data-type-id="' + escapeHtml(t.id) + '" data-group="' + escapeHtml(t.groupId) +
                '" aria-pressed="' + (on ? 'true' : 'false') + '">' + escapeHtml(lib.cleanText(t.name)) + '</button>');
        });
        if (lastGroup !== null) h.push('</div>');
        h.push('<div class="nsq-obj-notes">');
        page.types.forEach(function (t) {
            var on = ticked.indexOf(t.id) !== -1;
            var nid = 'custpage_obj_note_' + t.id;
            h.push('<div class="nsq-field nsq-obj-note" id="nsq-obj-note-' + escapeHtml(t.id) + '"' + (on ? '' : ' hidden') + '>' +
                '<label class="nsq-label" for="' + escapeHtml(nid) + '">Note on “' + escapeHtml(lib.cleanText(t.name)) + '” (optional)</label>' +
                '<input type="text" class="nsq-input" id="' + escapeHtml(nid) + '" name="' + escapeHtml(nid) + '" maxlength="' + OBJ_NOTE_MAX +
                '" autocomplete="off" value="' + escapeHtml((r.objNotes || {})[t.id] || '') + '"></div>');
        });
        h.push('</div>');
        h.push('<div class="nsq-field nsq-about"><label class="nsq-label" for="nsq-obj-quote">About quote</label>' +
            '<select id="nsq-obj-quote" name="custpage_obj_quote" class="nsq-input"><option value="">No particular quote</option>' +
            page.estimates.map(function (e) {
                return '<option value="' + escapeHtml(e.id) + '"' + (String(r.quote || '') === e.id ? ' selected' : '') + '>' + escapeHtml(e.label) + '</option>';
            }).join('') + '</select></div>');
        h.push('</section>');

        h.push('</div>'); // .nsq-wrap

        // ── Sticky footer ──
        h.push('<div class="nsq-footer"><div class="nsq-footer-in">');
        h.push('<div class="nsq-sum"><div class="nsq-sum-main" id="nsq-sum-line"></div><div class="nsq-sum-sub" id="nsq-sum-changes"></div></div>');
        h.push('<div class="nsq-actions"><span class="nsq-reason" id="nsq-reason"></span>' +
            '<a class="nsq-btn nsq-btn-link" href="' + escapeHtml(page.oppUrl) + '">Cancel</a>' +
            '<button type="button" class="nsq-btn nsq-btn-primary" id="nsq-send" disabled>Save</button></div>');
        h.push('</div></div>');

        h.push('</div>'); // #nsq-root
        h.push('<script>' + lib.pageScript(lib.RECIPIENTS_SCRIPT + PAGE_PART) + '</script>');
        return h.join('');
    }

    var PAGE_CSS = '<style>' +
        '.nsq-call-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;}' +
        '.nsq-textarea{min-height:120px;resize:vertical;font-family:inherit;}' +
        '.nsq-req{color:#a4262c;}' +
        '.nsq-opt{font-weight:400;color:' + lib.PAGE_COLORS.muted + ';font-size:14px;}' +
        '.nsq-help{color:' + lib.PAGE_COLORS.muted + ';font-size:14px;margin:0 0 8px;}' +
        '.nsq-chips{display:flex;flex-wrap:wrap;gap:8px;}' +
        '.nsq-chip{min-height:44px;padding:0 14px;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:999px;background:#fff;color:' + lib.PAGE_COLORS.text + ';font-size:14px;cursor:pointer;}' +
        '.nsq-chip[aria-pressed="true"]{background:' + lib.PAGE_COLORS.accent + ';border-color:' + lib.PAGE_COLORS.accent + ';color:#fff;font-weight:600;}' +
        '.nsq-obj-notes{margin-top:16px;}' +
        '.nsq-about{margin-top:12px;max-width:560px;}' +
        // v1.1.0: section switches and the recipients
        '.nsq-switch{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:400;cursor:pointer;}' +
        '.nsq-switch input{width:18px;height:18px;}' +
        '.nsq-off{font-size:13px;font-weight:600;color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-tick{display:flex;align-items:center;gap:8px;min-height:36px;font-size:14px;cursor:pointer;}' +
        '.nsq-tick input{width:18px;height:18px;}' +
        '.nsq-tick-addr{color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-email-note{margin-top:12px;}' +
        // v1.2.2: the "Write an email" / "Request an update" choice (a segmented control over two radios)
        '.nsq-seg-row{display:inline-flex;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:8px;overflow:hidden;margin-bottom:6px;}' +
        '.nsq-seg{position:relative;cursor:pointer;}' +
        '.nsq-seg input{position:absolute;opacity:0;width:1px;height:1px;}' +
        '.nsq-seg span{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;font-size:14px;background:#fff;color:' + lib.PAGE_COLORS.text + ';}' +
        '.nsq-seg + .nsq-seg span{border-left:1px solid ' + lib.PAGE_COLORS.border + ';}' +
        '.nsq-seg input:checked + span{background:' + lib.PAGE_COLORS.accent + ';color:#fff;font-weight:600;}' +
        '.nsq-seg input:focus-visible + span{outline:2px solid ' + lib.PAGE_COLORS.accent + ';outline-offset:-4px;}' +
        '.nsq-seg input:disabled + span{opacity:.5;cursor:not-allowed;}' +
        '.nsq-tick[hidden]{display:none;}' +   // v1.2.2: .nsq-tick's display:flex beat [hidden] — the Dashboard contact row showed in write mode
        '.nsq-updbtn-why{color:#a4262c;}' +
        '.nsq-rcpt-not{font-size:13px;color:' + lib.PAGE_COLORS.muted + ';font-style:italic;}' +
        '</style>';

    /**
     * v1.2.0–1.2.2: the update request's part of the page script — STATIC, nothing interpolated (the
     * prefill sits in data- attributes on the radio). While "Request an update" is chosen (and the email
     * is on): contacts that aren't this customer's (data-own="0") are unticked, disabled and labelled; the
     * Dashboard contact tick shows; Other addresses is emptied (kept aside, put back on Write), disabled
     * and explained; the Message "*" is hidden. switchKind() fills the subject / message prefill and, going
     * back, clears only what wasn't edited. A blocked option (data-blocked) stays disabled even after the
     * email switch re-enables its section. The server rechecks all of it and adds the button itself.
     */
    var UPDBTN_PART = [
        '  // updbtn:start',
        '  var updStash = null, kindPrev = null;',
        '  function kindIsUpdate() { var u = $("nsq-kind-update"); return !!(u && u.checked && !u.disabled); }',
        '  function switchKind() {',
        '    var u = $("nsq-kind-update"), subj = $("nsq-email-subject"), msg = $("nsq-email-message");',
        '    if (!u || u.disabled) return;',
        '    var ps = u.getAttribute("data-subject"), pm = u.getAttribute("data-message"), ws = u.getAttribute("data-write-subject");',
        '    if (u.checked) {',
        '      kindPrev = { s: subj.value, m: msg.value };',
        '      if (!subj.value.trim() || subj.value === ws) subj.value = ps;',
        '      if (!msg.value.trim()) msg.value = pm;',
        '    } else {',
        '      if (subj.value === ps) subj.value = kindPrev ? kindPrev.s : ws;',
        '      if (msg.value === pm) msg.value = kindPrev ? kindPrev.m : "";',
        '      kindPrev = null;',
        '    }',
        '  }',
        '  function applyUpdBtn() {',
        '    var u = $("nsq-kind-update"), w = $("nsq-kind-write"), em = $("nsq-email-on").checked;',
        '    if (!u) return;',
        '    if (u.getAttribute("data-blocked") === "1") { u.disabled = true; u.checked = false; if (w) w.checked = true; }',
        '    var on = em && kindIsUpdate();',
        '    var req = root.querySelector("label[for=nsq-email-message] .nsq-req");',   // the message is optional for an update request
        '    if (req) req.hidden = on;',
        '    each(root.querySelectorAll(".nsq-rcpt[data-own]"), function (c) {',
        '      var dash = c.className.indexOf("nsq-rcpt-dash") !== -1;',
        '      var off = dash ? !on : (on && c.getAttribute("data-own") !== "1");',
        '      if (off) c.checked = false;',
        '      c.disabled = off || !em;',
        '      if (dash) c.parentNode.hidden = !on;',
        '      var n = c.parentNode.querySelector(".nsq-rcpt-not");',
        '      if (n) n.hidden = !(on && !dash && c.getAttribute("data-own") !== "1");',
        '    });',
        '    var x = $("nsq-rcpt-extra"), note = $("nsq-rcpt-extra-note");',
        '    if (x) {',
        '      if (on && updStash === null) { updStash = x.value; x.value = ""; }',
        '      else if (!on && updStash !== null) { x.value = updStash; updStash = null; }',
        '      x.disabled = on || !em;',
        '    }',
        '    if (note) note.hidden = !on;',
        '  }',
        '  // updbtn:end'
    ].join('\n');

    /**
     * This page's part of the inline script (hook contract: lib header), after the library's
     * RECIPIENTS_SCRIPT. STATIC — reads maxlength, data-type-id, data-default and data-email from the
     * page; nothing is interpolated.
     */
    var PAGE_PART = [
        '  function pad(n) { return (n < 10 ? "0" : "") + n; }',
        '  function ticked() {',
        '    var ids = [];',
        '    each(root.querySelectorAll(".nsq-chip"), function (c) { if (c.getAttribute("aria-pressed") === "true") ids.push(c.getAttribute("data-type-id")); });',
        '    return ids;',
        '  }',
        '  function showNote(id, on) { var n = $("nsq-obj-note-" + id); if (n) n.hidden = !on; }',
        '  function callOn() { return $("nsq-call-on").checked; }',
        '  function emailOn() { return $("nsq-email-on").checked; }',
        '  function setSection(sw, bodyId, offId, valId) {',
        '    var on = sw.checked, body = $(bodyId);',
        '    body.hidden = !on;',
        '    each(body.querySelectorAll("input, select, textarea"), function (el) { el.disabled = !on; });',
        '    $(offId).hidden = on;',
        '    $(valId).value = on ? "T" : "F";',
        '  }',
        '  function pageInit() {',
        '    var std = $("nsq-std-title"), title = $("nsq-call-title"), lastStd = std.value;',
        '    std.addEventListener("change", function () {',
        '      if (title.value.trim() === "" || title.value === lastStd) title.value = std.value;',
        '      lastStd = std.value;',
        '      update();',
        '    });',
        '    $("nsq-call-notes").addEventListener("input", update);',
        '    $("nsq-call-contact").addEventListener("change", update);',
        '    var date = $("nsq-call-date"), t = new Date();',
        '    var today = t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());',
        '    date.max = today;',
        '    if (date.getAttribute("data-default") === "1") date.value = today;',
        '    date.addEventListener("change", update);',
        '    $("nsq-today").value = today;',
        '    each(root.querySelectorAll(".nsq-chip"), function (chip) {',
        '      chip.addEventListener("click", function () {',
        '        var on = chip.getAttribute("aria-pressed") !== "true";',
        '        chip.setAttribute("aria-pressed", on ? "true" : "false");',
        '        showNote(chip.getAttribute("data-type-id"), on);',
        '        update();',
        '      });',
        '    });',
        '    $("nsq-email-message").addEventListener("input", update);',
        '    var from = $("nsq-email-from"), note = $("nsq-email-note");',
        '    function setNote() {',
        '      var o = from.options[from.selectedIndex];',
        '      note.textContent = (!o || o.value === "me") ? note.getAttribute("data-note-me") : note.getAttribute("data-note-pre") + o.text + note.getAttribute("data-note-post");',
        '    }',
        '    from.addEventListener("change", setNote);',
        '    setNote();',
        '    recipientsInit();',
        '    [["nsq-call-on", "nsq-call-body", "nsq-call-off", "nsq-call-on-val"],',
        '     ["nsq-email-on", "nsq-email-body", "nsq-email-off", "nsq-email-on-val"]].forEach(function (s) {',
        '      var sw = $(s[0]);',
        '      setSection(sw, s[1], s[2], s[3]);',
        '      sw.addEventListener("change", function () { setSection(sw, s[1], s[2], s[3]); update(); });',
        '    });',
        '    each(root.querySelectorAll("input[name=custpage_email_kind]"), function (k) { k.addEventListener("change", function () { switchKind(); applyUpdBtn(); update(); }); });',   // v1.2.2: none when the mode is off
        '    $("nsq-email-on").addEventListener("change", applyUpdBtn);',   // after setSection (registered first)
        '    applyUpdBtn();',
        '    $("nsq-send").addEventListener("click", function () { submitForm("Saving…"); });',
        '  }',
        '  function problem() {',
        '    if (callOn()) {',
        '      var title = $("nsq-call-title"), notes = $("nsq-call-notes"), date = $("nsq-call-date");',
        '      if (!title.value.trim()) return "Enter a call title.";',
        '      if (title.value.trim().length > title.maxLength) return "The call title is too long.";',
        '      if (!notes.value.trim()) return "Enter what was discussed.";',
        '      if (notes.value.trim().length > notes.maxLength) return "The call notes are too long.";',
        '      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date.value)) return "Choose the call date.";',
        '      if (date.max && date.value > date.max) return "The call date can’t be in the future.";',
        '    }',
        '    if (emailOn()) {',
        '      var subj = $("nsq-email-subject"), msg = $("nsq-email-message");',
        '      if (!subj.value.trim()) return "Enter a subject.";',
        '      if (subj.value.trim().length > subj.maxLength) return "The subject is too long.";',
        '      if (!msg.value.trim() && !kindIsUpdate()) return "Write the message.";',   // v1.2.2: optional for an update request
        '      if (msg.value.trim().length > msg.maxLength) return "The message is too long.";',
        '      var rp = recipientsProblem();',
        '      if (rp) return rp;',
        '    }',
        '    if (!callOn() && !emailOn() && !ticked().length && !updChanges().length) return "Log a call, send an email, tick an objection or change a field.";',
        '    return "";',
        '  }',
        '  function summary() {',
        '    var parts = [], k = ticked().length;',
        '    if (callOn()) parts.push("Call: " + ($("nsq-call-title").value.trim() || "(no title yet)"));',
        '    if (emailOn()) parts.push("Email to " + recipients().to.length);',
        '    parts.push(k + " objection" + (k === 1 ? "" : "s"));',
        '    return parts.join(" · ");',
        '  }',
        '  function beforeSubmit() {',
        '    $("nsq-obj-sel").value = JSON.stringify(ticked());',
        '    if (emailOn()) recipientsBeforeSubmit();',
        '  }'
    ].join('\n') + '\n' + UPDBTN_PART;

    // ─── POST ─────────────────────────────────────────────────────────────────────

    /** The page state as posted — restored into the page after a failed save. */
    function readRestore(params) {
        var sel = parseObjSel(params.custpage_obj_sel);
        var objNotes = {};
        (sel.ids || []).forEach(function (id) {
            objNotes[id] = String(params['custpage_obj_note_' + id] || '');
        });
        return {
            callOn:   params.custpage_call_on !== 'F',
            emailOn:  params.custpage_email_on === 'T',
            std:      String(params.custpage_call_std || ''),
            title:    String(params.custpage_call_title || ''),
            date:     String(params.custpage_call_date || ''),
            contact:  String(params.custpage_call_contact || ''),
            notes:    String(params.custpage_call_notes || ''),
            from:     String(params.custpage_email_from || ''),
            subject:  String(params.custpage_email_subject || ''),
            message:  String(params.custpage_email_message || ''),
            kind:     params.custpage_email_kind === 'update' ? 'update' : 'write',   // v1.2.2
            rcpt:     lib.readPostedRecipients(params),
            objSel:   sel.ids,
            objNotes: objNotes,
            quote:    String(params.custpage_obj_quote || ''),
            upd:      lib.readPostedUpdateValues(params),
            token:    String(params.custpage_save_token || '')
        };
    }

    /** custpage_obj_sel: a JSON array of type IDs (strings). */
    function parseObjSel(json) {
        if (!json) return { ids: [], invalid: false };
        try {
            var arr = JSON.parse(json);
            if (!Array.isArray(arr)) return { ids: [], invalid: true };
            var ids = arr.map(function (v) { return String(v); });
            return { ids: ids, invalid: ids.some(function (v) { return !/^\d{1,12}$/.test(v); }) };
        } catch (e) {
            return { ids: [], invalid: true };
        }
    }

    // v1.1.1: objectionNotes (D11 / D21) moved to the library (lib.objectionNotes).

    /**
     * D21: the context line, in priority order — the call, an email that was actually sent, or a
     * plain "logged via" line. Never "Email sent" for a failed email.
     */
    function objectionContextLine(callOn, callDateText, callNotes, emailSent, todayText, subject) {
        if (callOn) return 'Call notes (' + callDateText + '): ' + callNotes;
        if (emailSent) return 'Email sent (' + todayText + '): ' + subject;
        return 'Logged via Update opportunity (' + todayText + ')';
    }

    /**
     * D22: "today" for a save without a call — the browser's date (custpage_today, yyyy-mm-dd from
     * local date parts) if it is a real date within [server today, server today + 1]; else the
     * server's today. The server clock runs behind the UK (pitfall 26).
     */
    function requestToday(params) {
        var now = new Date();
        var serverDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var latest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        var posted = lib.parseIsoDate(String(params.custpage_today || '').trim());
        return (posted && posted >= serverDay && posted <= latest) ? posted : serverDay;
    }

    // ─── Bespoke email (D17–D19) ──────────────────────────────────────────────────

    /** User/record text for the email: escaped, and "{{" neutralised (no merge pass runs anyway). */
    function emailText(s) {
        return escapeHtml(s).replace(/\{\{/g, '&#123;&#123;');
    }

    /**
     * Plain-text message → paragraphs: a blank line starts a new paragraph, a single newline is <br>.
     * v1.3.0: in the v2 body style (lib.emailParagraphV2).
     */
    function messageParagraphs(message) {
        return String(message || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n\s*/)
            .map(function (p) { return p.replace(/^\n+|\n+$/g, ''); })
            .filter(function (p) { return p.trim(); })
            .map(function (p) { return lib.emailParagraphV2(p.split('\n').map(emailText).join('<br>')); })
            .join('');
    }

    // ─── "Your project" box (v1.3.1) ──────────────────────────────────────────────

    /**
     * The dashboard's stageLabel (cdb_lib_render.js): a leading "<digits> - " (or "–", spaces optional)
     * removed — "7 - Roof, Doors, Windows" → "Roof, Doors, Windows"; the stored text when stripping
     * would leave nothing.
     */
    function stageLabel(text) {
        var raw = String(text === null || text === undefined ? '' : text);
        var stripped = raw.replace(/^\s*\d+\s*[-\u2013]\s*/, '');
        return stripped !== raw && stripped.replace(/\s+/g, '') !== '' ? stripped : raw;
    }

    /** A Date (or a lookupFields date string) as "Mar 2027"; '' when empty or not a date. Past dates too. */
    function monthYear(v) {
        if (v === null || v === undefined || v === '') return '';
        var d = v instanceof Date ? v : null;
        if (!d) {
            try { d = format.parse({ value: String(v), type: format.Type.DATE }); } catch (e) { d = null; }
        }
        if (!(d instanceof Date) || isNaN(d.getTime())) return '';
        return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    }

    /** The site address (Long Text) on one line: each line trimmed, blank lines dropped, joined with ", ". */
    function siteLine(v) {
        return String(v || '').split(/\r\n?|\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
            .filter(function (l) { return l; }).join(', ');
    }

    /**
     * The box's facts from the Opportunity's CURRENT values (one lookupFields, 1 unit). Read before the
     * save writes the fields (they are written last), so a value changed in this save shows as it was.
     * A failed lookup → null (no box; logged), never an email failure.
     */
    function loadProjectFacts(opportunityId) {
        try {
            var f = search.lookupFields({ type: search.Type.OPPORTUNITY, id: opportunityId, columns: PROJECT_COLUMNS }) || {};
            return {
                tranId: lib.lookupText(f.tranid).trim(),
                title:  lib.lookupText(f.title).replace(/\s+/g, ' ').trim(),
                site:   siteLine(lib.lookupText(f.custbody_opp_site_adress)),
                stage:  stageLabel(lib.lookupText(f.custbody_build_stage)).trim(),
                start:  monthYear(Array.isArray(f.custbody_opp_del_date) ? lib.lookupText(f.custbody_opp_del_date) : f.custbody_opp_del_date)
            };
        } catch (e) {
            log.error('UpdateOppSL.Email', 'Opportunity ' + opportunityId + ' — project lookup failed; no "Your project" box: ' + e.message);
            return null;
        }
    }

    /**
     * The "Your project" box, then — for "Request an update" — the call-to-action line. Title: the
     * Opportunity title, else the site address, else the QR number. Project: "QR · site", the site left
     * out when it is the title, and the row left out when it would only repeat the title.
     */
    function projectBoxHtml(facts, isUpdate) {
        if (!facts) return '';
        var title = facts.title || facts.site || facts.tranId;
        var project = [facts.tranId, facts.site && facts.site !== title ? facts.site : ''].filter(function (x) { return x; }).join(' · ');
        var box = lib.emailFactBoxV2(EMAIL_COPY.projectLabel, title, [
            [EMAIL_COPY.factProject, project !== title ? project : ''],
            [EMAIL_COPY.factStage, facts.stage],
            [EMAIL_COPY.factStart, facts.start]
        ]);
        if (!box) return '';
        return '<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="left" valign="top" style="padding:0 0 24px 0;">\n' +
            box + '</td></tr></table>\n' +
            (isUpdate ? lib.emailParagraphV2(emailText(facts.stage || facts.start ? EMAIL_COPY.updateCta : EMAIL_COPY.updateCtaEmpty)) : '');
    }

    /**
     * The bespoke email — v1.3.0: the v2 customer email design (lib.emailShellV2, as the dashboard's
     * "Book your delivery" email): preheader · logo · purple band (eyebrow, the subject as headline) ·
     * hero · the message · for "Request an update" the GIVE US AN UPDATE button · the SENDER's card
     * (D18: employee record only — no Opportunity overrides) · teal footer. No separate sign-off: the
     * card does that job. No merge-tag substitution runs over any of it (pitfall 28).
     *
     * @param {string} subject - the subject, also the headline
     * @param {string} message - plain text as typed
     * @param {Object} sender - lib.loadSender() — the chosen sender (D18a: me, the sales rep or the PE)
     * @param {string} cardEmail - the card's email line and EMAIL button: the sender's own address, or
     *                             EMAIL_COPY.peCardEmail when sending as the project engineer
     * @param {string} [updateLink] - v1.2.0: the "Give us an update" URL (unescaped); omitted → "Write an
     *                             email" (no button, eyebrow EMAIL_COPY.eyebrow)
     * @param {Object} [project] - v1.3.1: loadProjectFacts(); null/omitted → no "Your project" box
     */
    function buildBespokeEmail(subject, message, sender, cardEmail, updateLink, project) {
        var preheader = String(message || '').replace(/\s+/g, ' ').trim().substring(0, 90);
        if (updateLink && !preheader) preheader = EMAIL_COPY.updateLine.substring(0, 90);   // v1.2.2: an update request with no message

        var card = lib.emailSenderCardV2({
            fullName:  sender.fullName || EMAIL_COPY.nameFallback,
            firstName: sender.firstName,
            phone:     sender.phone,
            photoUrl:  sender.photoUrl
        }, cardEmail, EMAIL_COPY.cardLabel);

        return lib.emailShellV2({
            preheader:  emailText(preheader),
            eyebrow:    emailText(updateLink ? EMAIL_COPY.eyebrowUpdate : EMAIL_COPY.eyebrow),
            headline:   emailText(subject),
            heroUrl:    lib.EMAIL_HERO_V2,
            bodyHtml:   projectBoxHtml(project, !!updateLink) +   // v1.3.1: before the message
                        messageParagraphs(message) +
                        (updateLink ? updateButtonHtml(updateLink, !String(message || '').trim()) : ''),
            senderCard: card,
            footerLine: emailText(EMAIL_COPY.footer)
        });
    }

    /**
     * The button after the message. v1.2.2: the fixed line only when there is no message (the "Request
     * an update" prefill carries that wording), so the button never stands alone. v1.3.0: v2 styles.
     */
    function updateButtonHtml(link, withLine) {
        return (withLine ? lib.emailParagraphV2(emailText(EMAIL_COPY.updateLine)) : '') +
            '<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="top" style="padding:8px 0 16px 0;">\n' +
            lib.emailButtonV2(link, EMAIL_COPY.updateButton) +
            '</td></tr></table>\n';
    }

    // ─── Save guard (D25) ─────────────────────────────────────────────────────────

    /**
     * Claims the page's one-time token. { dup: true } if it was already used (nothing may be
     * written); { key } when claimed; { key: null } when there is no usable token or no cache (an
     * in-flight 1.0 page, or N/cache unavailable) — the save goes ahead without the guard, logged.
     */
    function claimToken(token, opportunityId) {
        if (!TOKEN_RE.test(token)) {
            log.audit('UpdateOppSL.Guard', 'Opportunity ' + opportunityId + ' — no save token (a page from before 1.1.0?); saved without the guard');
            return { dup: false, key: null };
        }
        try {
            var c = cache.getCache({ name: GUARD_CACHE, scope: cache.Scope.PRIVATE });
            if (c.get({ key: token })) {
                log.audit('UpdateOppSL.Guard', 'Opportunity ' + opportunityId + ' — duplicate save (token already used); nothing written');
                return { dup: true, key: null };
            }
            c.put({ key: token, value: String(opportunityId), ttl: GUARD_TTL });
            return { dup: false, key: token };
        } catch (e) {
            log.error('UpdateOppSL.Guard', 'Opportunity ' + opportunityId + ' — cache unavailable (' + e.message + '); saved without the guard');
            return { dup: false, key: null };
        }
    }

    /** Frees a claimed token (the call failed and nothing was saved — the rep may retry). */
    function releaseToken(key, opportunityId) {
        if (!key) return;
        try {
            cache.getCache({ name: GUARD_CACHE, scope: cache.Scope.PRIVATE }).remove({ key: key });
            log.audit('UpdateOppSL.Guard', 'Opportunity ' + opportunityId + ' — token released (nothing was saved)');
        } catch (e) {
            log.error('UpdateOppSL.Guard', 'Opportunity ' + opportunityId + ' — token could not be released: ' + e.message);
        }
    }

    /**
     * Validates everything (no writes), claims the save token, then: phone call → email →
     * objections → Opportunity fields LAST → redirect to the Opportunity with code-only parameters.
     */
    function handleSave(context) {
        var params = context.request.parameters || {};
        var opportunityId = params.custpage_opportunity_id;
        if (!opportunityId) {
            showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
            return;
        }
        var restore = readRestore(params);
        function fail(lead, message) {
            renderPage(context, opportunityId, restore, { lead: lead, message: message });
        }
        function invalid(message) {
            log.audit('UpdateOppSL.Validation', 'Opportunity ' + opportunityId + ' — rejected: ' + message);
            fail('Not saved.', message);
        }

        var callOn  = params.custpage_call_on !== 'F';    // D15: missing = on (a 1.0 page)
        var emailOn = params.custpage_email_on === 'T';   // D16: missing = off

        // Read once, on demand
        var contacts = null;
        function opportunityContacts() {
            if (!contacts) contacts = lib.loadContacts(opportunityId, 'UpdateOppSL');
            return contacts;
        }
        // One lookupFields for the customer and (D18a) the sales rep and project engineer
        var oppFields = null;
        function opportunityFields() {
            if (oppFields) return oppFields;
            oppFields = { entity: '', rep: '', pe: '' };
            var first = function (v) { return (Array.isArray(v) && v[0]) ? String(v[0].value || '') : ''; };
            try {
                var opp = search.lookupFields({ type: search.Type.OPPORTUNITY, id: opportunityId, columns: ['entity', 'salesrep', 'custbody_pe'] });
                oppFields = { entity: first(opp.entity), rep: first(opp.salesrep), pe: first(opp.custbody_pe) };
            } catch (e) {
                log.error('UpdateOppSL.Call', 'Opportunity ' + opportunityId + ' — customer lookup failed: ' + e.message);
            }
            return oppFields;
        }
        function opportunityCustomer() { return opportunityFields().entity; }

        // ── Validation — nothing is written until all of this passes ─────────────
        var title = '', notes = '', callDate = null;
        if (callOn) {
            title = String(params.custpage_call_title || '').trim();
            if (!title) return invalid('Enter a call title.');
            if (title.length > CALL_TITLE_MAX) return invalid('The call title is longer than ' + CALL_TITLE_MAX + ' characters.');

            notes = String(params.custpage_call_notes || '').trim();
            if (!notes) return invalid('Enter what was discussed.');
            if (notes.length > CALL_NOTES_MAX) return invalid('The call notes are longer than ' + CALL_NOTES_MAX + ' characters.');

            callDate = lib.parseIsoDate(String(params.custpage_call_date || '').trim());
            if (!callDate) return invalid('Choose a valid call date.');
            var latest = new Date();
            latest = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + 1);   // server today + 1 (time zones)
            if (callDate > latest) return invalid('The call date can’t be in the future.');
        }

        var subject = '', message = '', rcpt = null, sender = null, fromCode = '', ccMeEmail = '';
        // v1.2.2: "Request an update" (custpage_email_kind = update; missing or anything else = write)
        var updBtnOn = emailOn && params.custpage_email_kind === 'update';
        if (updBtnOn) {   // v1.2.1: the same rule as the page — excluded → treated as write
            var access = updBtnAccess();
            if (!access.allowed) {
                log.audit('UpdateOppSL.UpdateButton', 'Opportunity ' + opportunityId + ' — ignored: mode ' + access.mode);
                updBtnOn = false;
            }
        }
        var updateLink = '';                                              // v1.2.0: never logged
        if (emailOn) {
            subject = String(params.custpage_email_subject || '').trim();
            if (!subject) return invalid('Enter a subject for the email.');
            if (subject.length > EMAIL_SUBJECT_MAX) return invalid('The subject is longer than ' + EMAIL_SUBJECT_MAX + ' characters.');

            message = String(params.custpage_email_message || '').trim();
            if (!message && !updBtnOn) return invalid('Write the email message.');   // v1.2.2: optional for an update request
            if (message.length > EMAIL_MESSAGE_MAX) return invalid('The message is longer than ' + EMAIL_MESSAGE_MAX + ' characters.');

            var customerEmail = '';
            var rcptContacts = opportunityContacts();
            if (updBtnOn) {
                // v1.2.0: recheck everything on the server — one customer lookup (email + the
                // dashboard columns); nothing the page posted is trusted.
                var custF = null;
                if (opportunityCustomer()) {
                    try {
                        custF = search.lookupFields({ type: search.Type.CUSTOMER, id: opportunityCustomer(), columns: ['email'].concat(CDB_CUSTOMER_COLUMNS) });
                    } catch (e) {
                        log.error('UpdateOppSL.Email', 'Opportunity ' + opportunityId + ' — customer lookup failed: ' + e.message);
                    }
                }
                if (!custF) return invalid(UPDBTN_COPY.noLink);
                var ubs = updateButtonState(opportunityCustomer(), custF);
                if (!ubs.ok) return invalid(ubs.reason);
                if (params.custpage_rcpt_customer === 'T') customerEmail = lib.lookupText(custF.email);
                var own = ownContacts(rcptContacts, opportunityCustomer(), ubs.dashContactId, dashContactEmail(ubs.dashContactId));
                if (own.extra) rcptContacts = rcptContacts.concat([own.extra]);
                // Only the customer's own people: no typed address at all, no other company's contact
                var postedR = lib.readPostedRecipients(params);
                var refused = postedR.extra.split(/[,;]/).map(function (a) { return a.trim(); }).filter(function (a) { return a; });
                postedR.contacts.forEach(function (id) {
                    if (own.ids.indexOf(id) !== -1) return;
                    var c = rcptContacts.filter(function (x) { return String(x.id) === id; })[0];
                    if (c) refused.push(String(c.email || '').trim() || c.name);
                });
                if (refused.length) return invalid(UPDBTN_COPY.refusal + refused.join(', '));
                updateLink = ubs.link + '&a=update&opp=' + encodeURIComponent(opportunityId);
            } else if (params.custpage_rcpt_customer === 'T' && opportunityCustomer()) {
                try {
                    customerEmail = String(search.lookupFields({ type: search.Type.CUSTOMER, id: opportunityCustomer(), columns: ['email'] }).email || '');
                } catch (e) {
                    log.error('UpdateOppSL.Email', 'Opportunity ' + opportunityId + ' — customer email lookup failed: ' + e.message);
                }
            }
            rcpt = lib.resolveRecipients(params, rcptContacts, customerEmail);
            if (rcpt.error) return invalid(rcpt.error);

            // D18a: who it is from — a whitelisted code; the server finds the employee itself
            fromCode = params.custpage_email_from === undefined || params.custpage_email_from === '' ? 'me' : String(params.custpage_email_from);
            if (fromCode !== 'me' && !FROM_ROLES.hasOwnProperty(fromCode)) return invalid('Choose who the email is from.');
            if (fromCode === 'me') {
                sender = lib.loadSender('UpdateOppSL.Email');
                if (sender.error) return invalid('Your employee record could not be read, so the email can’t be sent from you.');
                if (!sender.email || !lib.EMAIL_RE.test(sender.email)) {
                    return invalid('Your employee record has no email address, so the email can’t be sent from you.');
                }
            } else {
                var role = FROM_ROLES[fromCode];
                var noEmail = role.label + ' has no email address on their employee record, so the email can’t be sent from them.';
                var empId = opportunityFields()[fromCode];
                if (!empId) return invalid(noEmail);
                sender = lib.loadSender('UpdateOppSL.Email', empId);
                if (sender.error) return invalid(role.label + '’s employee record could not be read, so the email can’t be sent from them.');
                if (sender.inactive) return invalid(role.label + ' is no longer active, so the email can’t be sent from them.');   // amendment 3
                if (!sender.email || !lib.EMAIL_RE.test(sender.email)) return invalid(noEmail);
            }
            // "CC me" is always the CURRENT user, whoever the email is from
            if (rcpt.ccMe) {
                if (fromCode === 'me') {
                    ccMeEmail = sender.email;
                } else {
                    try {
                        ccMeEmail = lib.lookupText(search.lookupFields({ type: search.Type.EMPLOYEE, id: runtime.getCurrentUser().id, columns: ['email'] }).email).trim();
                    } catch (e) {
                        ccMeEmail = '';
                    }
                    if (!lib.EMAIL_RE.test(ccMeEmail)) return invalid('Your employee record has no email address, so you can’t be copied in. Untick CC me.');
                }
            }
        }

        var sel = parseObjSel(params.custpage_obj_sel);
        if (sel.invalid) return invalid('The objection selection could not be read. Please try again.');

        // D23: something to save
        if (!callOn && !emailOn && !sel.ids.length && !lib.pendingChanges(params).changed.length) {
            return invalid('Log a call, send an email, tick an objection or change a field.');
        }

        // D3: on every save
        var req = lib.validateRequired(opportunityId, params, RULES);
        if (!req.ok) {
            return invalid(req.missing.join(', ') + ' is required — the opportunity has none. Set it in step 3.');
        }

        var typeById = {};
        if (sel.ids.length) {
            loadObjectionTypes().forEach(function (t) { typeById[t.id] = t; });
            var seen = {};
            for (var i = 0; i < sel.ids.length; i++) {
                var tid = sel.ids[i];
                if (!typeById[tid]) return invalid('An objection type is not recognised. Please reload the page and try again.');
                if (seen[tid]) return invalid('An objection type was ticked twice. Please reload the page and try again.');
                seen[tid] = true;
                if (String(params['custpage_obj_note_' + tid] || '').trim().length > OBJ_NOTE_MAX) {
                    return invalid('The note on “' + lib.cleanText(typeById[tid].name) + '” is longer than ' + OBJ_NOTE_MAX + ' characters.');
                }
            }
        }

        var quoteId = String(params.custpage_obj_quote || '').trim();
        if (quoteId && !loadEstimates(opportunityId).some(function (e) { return e.id === quoteId; })) {
            return invalid('The chosen quote is not on this opportunity.');
        }

        var contactId = callOn ? String(params.custpage_call_contact || '').trim() : '';
        if (contactId && !opportunityContacts().some(function (c) { return String(c.id) === contactId; })) {
            return invalid('The chosen contact is not on this opportunity.');
        }

        var today = requestToday(params);   // D22
        var custId = opportunityCustomer();
        var userId = runtime.getCurrentUser().id;

        // ── Save guard (D25) — before the first write ─────────────────────────────
        var guard = claimToken(restore.token, opportunityId);
        if (guard.dup) {
            var dp = { nsqs: 'upd', nsq: 'dup', nsqt: String(Math.floor(Date.now() / 1000)) };
            log.audit('UpdateOppSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(dp));
            redirect.toRecord({ type: record.Type.OPPORTUNITY, id: opportunityId, isEditMode: false, parameters: dp });
            return;
        }

        // ── 1. Phone call — if this fails, nothing else is sent or written ──────
        var callId = '';
        if (callOn) {
            try {
                var call = record.create({ type: record.Type.PHONE_CALL });
                call.setValue({ fieldId: CALL.title, value: title });
                call.setValue({ fieldId: CALL.message, value: notes });
                call.setValue({ fieldId: CALL.startDate, value: callDate });
                call.setValue({ fieldId: CALL.status, value: CALL.completed });
                if (custId) call.setValue({ fieldId: CALL.company, value: custId });
                call.setValue({ fieldId: CALL.transaction, value: opportunityId });
                call.setValue({ fieldId: CALL.assigned, value: userId });
                if (contactId) call.setValue({ fieldId: CALL.contact, value: contactId });
                callId = String(call.save());
                log.audit('UpdateOppSL.Call', 'Opportunity ' + opportunityId + ' — phone call ' + callId + ' created: "' + title + '"');
            } catch (e) {
                log.error('UpdateOppSL.Call', 'Opportunity ' + opportunityId + ' — phone call FAILED: ' + e.message);
                log.audit('UpdateOppSL.Summary', 'Opportunity ' + opportunityId + ' — call failed; nothing saved');
                releaseToken(guard.key, opportunityId);
                fail('Nothing was saved:', e.message);
                return;
            }
        }

        // ── 2. Email — a failure does not stop the rest (D24); never retried ─────
        var emailState = 'off';
        var emailCount = 0;
        if (emailOn) {
            var cc = [];
            var me = ccMeEmail.toLowerCase();
            if (rcpt.ccMe && !rcpt.to.some(function (a) { return a.toLowerCase() === me; })) cc.push(ccMeEmail);
            log.audit('UpdateOppSL.Email', 'Opportunity ' + opportunityId + ' — from ' + fromCode + ' (employee ' + sender.id + ')' +
                (updBtnOn ? ' | ' + JSON.stringify({ updateButton: true, opp: String(opportunityId) }) : ''));   // v1.2.0 — never the link
            // Built in its own try: a failure here is an email failure (D24), never a stop.
            var body = null;
            try {
                body = buildBespokeEmail(subject, message, sender, fromCode === 'pe' ? EMAIL_COPY.peCardEmail : sender.email, updateLink,   // '' when off
                    loadProjectFacts(opportunityId));   // v1.3.1: the values before this save (fields are written last)
            } catch (e) {
                log.error('UpdateOppSL.Email', 'Opportunity ' + opportunityId + ' — email body could not be built; not sent: ' + ((e && e.message) || String(e)));
            }
            if (body === null) {
                emailState = 'fail';
            } else {
                var sent = lib.sendEmail({
                    author:     sender.id,   // D18a: the chosen sender — replies go to them
                    to:         rcpt.to,
                    cc:         cc,
                    subject:    subject,
                    body:       body,
                    customerId: custId,
                    oppId:      opportunityId,
                    logKey:     'UpdateOppSL.Email'
                });
                emailState = sent.ok ? 'sent' : 'fail';
            }
            emailCount = rcpt.to.length;   // To + CC excluding CC me (CC only ever holds the sender)
        }

        // ── 3. Objections — each in its own try/catch ────────────────────────────
        var callDateText = callOn ? format.format({ value: callDate, type: format.Type.DATE }) : '';
        var todayText = format.format({ value: today, type: format.Type.DATE });
        var contextLine = objectionContextLine(callOn, callDateText, notes, emailState === 'sent', todayText, subject);
        // v1.1.1: the loop lives in the library (lib.createObjections) — same fields, notes and logs
        var objNotes = {};
        sel.ids.forEach(function (typeId) { objNotes[typeId] = String(params['custpage_obj_note_' + typeId] || '').trim(); });
        var objResult = lib.createObjections({
            oppId:       opportunityId,
            typeIds:     sel.ids,
            notes:       objNotes,
            contextLine: contextLine,
            raisedBy:    userId,
            raisedOn:    callOn ? callDate : today,   // D10 / D22
            quoteId:     quoteId,
            logKey:      'UpdateOppSL.Objection'
        });
        var created = objResult.created;
        var failedTypes = objResult.failed;

        // ── 4. Opportunity fields — LAST ─────────────────────────────────────────
        var oppUpdate = lib.updateFields(opportunityId, params, RULES);

        // ── 5. Back to the Opportunity with codes only ───────────────────────────
        var p = lib.fieldRedirectParams(oppUpdate);
        p.nsqs = 'upd';
        if (callId) p.nsqc = callId;
        p.nsqo = String(created.length);
        if (failedTypes.length) {
            p.nsq = 'warn';
            p.nsqof = failedTypes.join(',');
        }
        if (emailState === 'sent') {
            p.nsqe = 'sent';
            p.nsqen = String(emailCount);
        } else if (emailState === 'fail') {
            p.nsqe = 'fail';
            p.nsq = 'warn';
        }
        log.audit('UpdateOppSL.Summary', 'Opportunity ' + opportunityId + ' — call ' + (callId || 'off') + '; objections created ' + created.length +
            ', failed ' + (failedTypes.join(',') || 'none') + '; fields changed ' +
            ((oppUpdate.error ? '' : oppUpdate.changed.map(function (c) { return c.key; }).join(',')) || 'none') +
            ', failed ' + ((oppUpdate.error ? oppUpdate.changed.map(function (c) { return c.key; }).join(',') : '') || 'none') +
            '; email ' + emailState + (emailOn ? ' (' + emailCount + ' recipient' + (emailCount === 1 ? '' : 's') + ')' : ''));
        log.audit('UpdateOppSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(p));

        redirect.toRecord({
            type:       record.Type.OPPORTUNITY,
            id:         opportunityId,
            isEditMode: false,
            parameters: p
        });
    }

    return {
        onRequest: onRequest
    };

});
