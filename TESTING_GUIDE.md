# Testing Guide

**Last Updated:** 6 October 2026
**Environment:** Sandbox (472052_SB1)

---

## Create order, part 1 (Create Order SL 1.2.1 / order library 1.2.1 / Opportunity UE 1.5.2 / CS 1.3.0)

> **Status: 🔶 not yet tested in Sandbox.** Upload `nuheat_order_lib.js`, then `nuheat_create_order_sl.js`,
> then the CS, then the UE (DEPLOYMENT_CHECKLIST 2f-3). **No script parameters:** add the `ORDER_*` rows to
> Customer Dashboard Settings (`customrecord_cdb_setting`). Set `ORDER_MODE` to **ADMIN** first, then **ALL** for
> the NH Account Manager run (O12). The button follows `ORDER_MODE` within 5 minutes (cached); the page at once.
> Use a test opportunity whose customer and contacts are our own addresses.

### Automated (before uploading)

```bash
node test/create-order.js            # must end "406 passed, 0 failed" (C1–C64; C52 re-runs the three suites below)
node test/update-opp.js              # 684 passed — unchanged
node test/send-quote-opp-update.js   # 400 passed — assertions unchanged (amendment 1 adds only an N/cache stub)
node test/opp-lib-customer.js        # 72 passed — unchanged
for f in nuheat_order_lib.js nuheat_create_order_sl.js nuheat_opportunity_ue.js nuheat_opportunity_cs.js; do node --check "$f"; done
```

### Sandbox checks (assumptions the code could not verify — confirm each first)

| # | Check | How |
|---|---|---|
| S1 | **What the transform carries.** `opportunity`, `custbody_quote_type`, `salesrep`, `department`, `terms`, units, deposit | One order, then read `CreateOrderSL.Convert` "carried: … \| blank: …". Blank opportunity / quote type are copied (logged "(copied)") |
| S2 | **The transformed SO's `total` is readable before save** in standard mode | If every order fails with "total differs from the quote (unreadable vs £…)", it isn't: report it, don't work around it |
| S3 | **Does NH Sales Order (2026) have mandatory fields** the transform doesn't fill? | The save fails with NetSuite's "Please enter value(s) for: …"; the page says "Nothing was created: <quote number>: …" |
| S4 | **Does creating the SO change the opportunity's status by itself?** (a workflow or NetSuite's own Won-on-order) | Note the status before and after with `ORDER_OPP_STATUS` **empty** |
| S5 | `netamountnotax` and `duedate` are valid Estimate search columns | ex VAT shows on each row; an expired quote shows "Expired". If the extras search fails, `CreateOrderSL.List` logs it (rows still listed) |
| S6 | `custbody_partner_commission` takes 5 for 5% | Enter 5 %, open the SO: it reads 5.0% (not 500% or 0.05%) |
| S7 | `lookupFields` returns the saved SO's `total` | No "using a search" debug line under `CreateOrderSL.Convert`; if it appears, the fallback search handled it (10 units) |
| S8 | The order log saves with its three mandatory fields and sources the rest | Open the order log: customer, revenue, margin, quote type, department filled by NetSuite |
| S9 | `getSelectOptions` returns the sub-status and value proposition options on the Opportunity | Both selects are populated |
| S10 | `record.transform` accepts `customform` in `defaultValues` (the form is set first) | The SO opens on NH Sales Order (2026). If the transform throws on `customform`, report it |
| S11 | `NEEDINFO_SUBSTATUS`'s **first** id is Awaiting Design Info (the dashboard's row is shared) | The sub-status select opens on Awaiting Design Info. If it opens on another, reorder the row's ids — the dashboard reads the list as a set |
| S12 | `render.mergeEmail` works with each `ORDER_EMAIL_TEMPLATES` template. Legacy CRMSDK templates can't be merged, only FreeMarker ones | One order per template. A failure logs "template … could not be merged (… must be FreeMarker)" under `CreateOrderSL.Email`; that order's email isn't sent and the banner names it |
| S13 | The merged fields (customer name, SO number, totals) come from the **new** Sales Order | Read the received email against the SO |
| S14 | Multipart posting doesn't break the save guard token, the dates or the ticked-quote list | Submit with and without an attachment: next contact / delivery date saved as chosen, the right quotes converted, Back + resubmit → "Already created". (A local Chromium run posted every field and the two files as multipart, 6 Oct) |
| S15 | The settings search: `name` `contains` filters on `customrecord_cdb_setting` (was S12 in amendment 1) | `CreateOrderSL.Settings` lists every key you added as found |
| S16 | `request.files` carries the hidden `custpage_att_<n>` inputs, and the uploaded files attach without being saved | Two attachments → both on each email; nothing new in the File Cabinet |
| S17 | Governance: `render.mergeEmail` and `email.send` cost (counted 20 + 20) | `CreateOrderSL.Summary`'s "usage left" after 3 orders with emails |
| S18 | `taxtotal` (and `total`) are readable on the transformed SO before save — including a 0% VAT heat pump quote (taxtotal 0, not blank) | A % commission on a heat pump quote saves, and `CreateOrderSL.Convert` logs "commission: 5% → £… (base £…)" with base = the quote's ex VAT |
| S19 | **The mandatory Partner Comm (£) accepts 0** (the 6 Oct failure) | An order with no commission: saves → fine. "Please enter value(s) for: Partner Comm (£)" again → NetSuite treats 0 as empty: Steve decides on the form (DEPLOYMENT_CHECKLIST 2f-3); don't work around it |

### Scenarios

| # | Test | Expected |
|---|---|---|
| O1 | `ORDER_MODE` row absent, then `OFF` | No Create order button (allow 5 minutes after a change); the Suitelet URL says "Create order is switched off." |
| O1b | Make the `ORDER_SO_FORM` row inactive | The page says "Create order can’t run: ORDER_SO_FORM is not set in Customer Dashboard Settings." |
| O2 | ADMIN as Administrator / as a rep | Button and page for the Administrator only |
| O3 | Opportunity with 3 open quotes (one past its expiry) and one already converted | 3 rows, newest first; the expired one tagged **Expired**; the converted one absent |
| O4 | Up-front customer (terms 9) vs a trade customer | Deposit on the rows and in the totals ("2 orders · £… inc VAT · Deposit £…") for the first; none for the second |
| O5 | Tick a UFH quote, then a heat pump quote | Project type: UFH Only, then UFH & Renewables; tick an unmapped quote → blank. Choose one yourself → ticking no longer changes it |
| O6 | One quote, units 4, commission 5 %, email off | The row shows "= £…" under the commission. One SO: form NH Sales Order (2026), Record Status Awaiting Design Info, the project type, 5% **and** Partner Comm (£) = 5% of the ex VAT total. One order log (SO, parent opp, 4 units, authority, rep). Opportunity: sub-status Awaiting Design Info, value proposition as chosen. Banner "Order created · Created SO…". No email |
| O7 | Two quotes, £ commission on one, email on to yourself, a different template on each, one PDF attached | Two SOs, the same project type on both; **two emails**, each from its own template, each with the PDF, each under its SO's Communication › Messages; banner "Orders created … Confirmation email sent for 2 orders" |
| O7b | Many quotes on one opportunity | Each row one line (~56px) on desktop; the totals line and the footer follow the ticks; on a phone the inputs sit on a second line |
| O7c | An opportunity whose sales rep isn't ticked Sales Rep | That rep is offered first and pre-selected; the order log gets them |
| O8 | Browser Back and submit again | "Already created"; no second SO |
| O9 | Units 0 / commission 150 % / no value proposition | The button stays disabled with the reason; forced through, the page re-renders "Not created." with everything kept |
| O10 | Convert a quote, then open Create order in a second tab opened earlier and submit that quote | Refused: not open / "already converted to SO…"; nothing created → no email, no opportunity change |
| O11 | Make one quote's SO fail (e.g. a mandatory field blank on the form) with two ticked | The other SO and its log are created; amber banner "Not created: <quote number>"; only the created order is emailed |
| O12 | **As NH Account Manager (not Administrator)**: O6 again | The button shows, lists populated, SO and order log created. No button and "its settings can’t be read" = the role lacks **View** on Customer Dashboard Settings (`ORDER_SETTINGS_UNAVAILABLE` in the log). Any other Permission Violation → DEPLOYMENT_CHECKLIST › Roles and permissions |
| O13 | Send Quote and Update opportunity after the release | Both buttons present and unchanged |

### Execution Log greps

| Key | Expect |
|---|---|
| `CreateOrderSL.Summary` | One line per submission: `created SO… from <quote> (log …)`, failures with reasons, warnings, fields, email, usage left |
| `CreateOrderSL.Convert` | The carried / blank report per quote; `TOTAL MISMATCH` lines (both figures); order log created or failed |
| `CreateOrderSL.Validation` | Why a submission was rejected before any write |
| `CreateOrderSL.Settings` | Once per request: which settings keys were found and which are missing (never the values) |
| `ORDER_SETTINGS_UNAVAILABLE` / `ORDER_SETTING_DUPLICATE` | The settings search failed / two active rows for one key (row IDs named) |
| `CreateOrderSL.Config` | A malformed setting value (treated as empty) |
| `CreateOrderSL.Redirect` | e.g. `{"nsq":"ok","nsqt":"…","nsqf":"sub_status","nsqs":"ord","nsqso":"…"}` |

---

## "Give us an update" button (Update Opportunity SL 1.2.1 / library 1.3.0) — "Request an update" part B

> Needs the dashboard's part A deployed (its customer UE fills `custentity_cdb_link` when a customer is
> saved). **1.2.1:** the deployment stays Released; the button is controlled by the script parameter
> `custscript_nuheat_updbtn_mode` — set it to **ADMIN** to test as Administrator, leave it empty (OFF) for
> reps until the dashboard goes live, ALL at go-live.

### Automated (before uploading)

```
node test/update-opp.js              # must end "523 passed, 0 failed" — T1–T51 as before (+ the T41 nsqt flake fix), T52–T62 (1.2.0), T63–T67 (1.2.1 mode), T68–T73 (1.2.2 write / update)
node test/send-quote-opp-update.js   # must end "400 passed, 0 failed" — unedited
node test/opp-lib-customer.js        # must end "72 passed, 0 failed" — version and the update-opp count updated
```

- **G0** *(1.2.1)* Parameter empty: as Administrator and as a sales role, Send an email looks exactly as
  in 1.1.1 (no choice). Set **ADMIN**: Administrator sees "Write an email / Request an update", a sales
  role (e.g. NH Account Manager) still doesn't. Set **ALL**: both do. Set it back to empty afterwards.

### Sandbox / Testing (library first, then the Suitelet)

- **G1** *(1.2.2)* A customer with a link (save the customer once so the UE writes it): switch the email
  on — "Write an email" is selected. Choose **Request an update**: the subject becomes "Could you give us a
  quick update on QR…?", the message "Hi <first name>, …" (a company: "Hi,"). Send to the customer and
  CC me → the email has the message, **GIVE US AN UPDATE**, then the sign-off and card; the button opens
  the dashboard's update page for this opportunity.
- **G1a** Request an update with the message cleared → it sends; the email has the fixed "When you have a
  moment…" line above the button.
- **G2** A customer with no link / inactive / with `custentity_cdb_link_version` bumped by hand without a
  save: "Request an update" is greyed out with the matching reason; "Write an email" stays selected.
- **G3** Request an update: Other addresses greys out with its note; an architect contact on the
  opportunity is unticked and greyed "Not this customer's contact"; back to Write an email → typed
  addresses come back.
- **G3a** Switch to Request an update and straight back: the subject is "An update on QR…" again and the
  message is empty. Edit the prefilled message, then switch back: your text stays.
- **G4** Request an update, with the dashboard contact not on the opportunity: a "Dashboard contact" tick appears.
- **G5** Write an email: the email is exactly as before (compare with a 1.1.1 email); the message is required.
- **G6** Execution Log: `UpdateOppSL.Email` shows `{"updateButton":true,"opp":"<id>"}` and no URL.

---

## Customer-safe library functions (library 1.2.0 / Update Opportunity SL 1.1.1) — Release 2.1 part A

### Automated (before uploading)

```
node test/opp-lib-customer.js        # must end "72 passed, 0 failed" — C1–C12 from the brief, C13–C15 extra
node test/update-opp.js              # must end "293 passed, 0 failed" — unedited; proves the objection path is unchanged
node test/send-quote-opp-update.js   # must end "400 passed, 0 failed" — unedited
```

### Sandbox (after upload, library first)

- **L1** Update Opportunity regression: save with two objections (one with a note), call on and off —
  records, notes and raised on as before; `UpdateOppSL.Objection` lines unchanged.
- **L2** From a test script: `fieldOptions('build_stage')` and `fieldOptions('entitystatus')` with and
  without an `oppId` match the internal page's dropdowns (confirms a new in-memory Opportunity offers the
  same status list as a loaded one).
- **L3** `writeOppUpdate` with a build stage outside `allowed` → `OPPLIB_VALUE_NOT_ALLOWED`, the
  opportunity's System Notes show no change.

---

## Update Opportunity (Update Opportunity SL 1.0.0 / library 1.0.0 / Send Quote SL 2.1.0 / Opportunity UE 1.3.0 / Opportunity CS 1.2.0)

> **Before testing:**
> - Create the script record `customscript_nuheat_update_opp_sl` and deployment
>   `customdeploy_nuheat_update_opp_sl`: **execute as the current role**, audience the sales roles,
>   **Log Level Audit**, status **Released** (Testing runs only for its owner). The roles need the permissions in
>   DEPLOYMENT_CHECKLIST › Roles and permissions.
> - Upload **`nuheat_opp_update_lib.js` first**, then `nuheat_send_quote_sl.js`, `nuheat_update_opp_sl.js`,
>   `nuheat_opportunity_ue.js` and `nuheat_opportunity_cs.js` to `SuiteScripts/NuHeat/2026 Quote/`.
> - Read back every version header: library 1.0.0, Send Quote SL 2.1.0, Update Opportunity SL 1.0.0,
>   UE 1.3.0, CS 1.2.0.
> - **Run as an account-manager role**, not Administrator.

### Automated (before uploading)

```bash
node test/send-quote-opp-update.js   # must end "400 passed, 0 failed" — includes G1, Send Quote byte-identical to 2.0.4, and H1
node test/update-opp.js              # must end "293 passed, 0 failed"
for f in nuheat_opp_update_lib.js nuheat_send_quote_sl.js nuheat_update_opp_sl.js nuheat_opportunity_ue.js nuheat_opportunity_cs.js; do node --check "$f"; done
```

### Sandbox scenarios — ✅ U1–U10 passed (29 Sep 2026)

| # | Test | Expected |
|---|---|---|
| U1 | The opportunity in view | Two buttons, **Send Quote** then **Update opportunity**; Update opens in the same tab ✅ Passed (29 Sep 2026) |
| U2 | Pick a standard title → Title; type over it; change the standard title again | Typing is never overwritten ✅ Passed (29 Sep 2026) |
| U3 | Save a call only (no objections), with Next contact set | The call appears under the opportunity's **Communication › Activities**: title, notes, date, completed, customer, you as assigned. **Confirms the phone-call field IDs** (`title`, `message`, `startdate`, `status`, `company`, `transaction`, `assigned`, `contact`) — confirmed. The 99-character title limit is our deliberate cap (`CALL_TITLE_MAX`), not a proven NetSuite limit ✅ Passed (29 Sep 2026) |
| U4 | Next contact empty on the record and left blank | Save blocked (client), with the reason shown ✅ Passed (29 Sep 2026) |
| U5 | Two objections, one with a note, plus an About quote | Two objection records on the Communication subtab: correct type and group, the quote, notes per the format (note, blank line, "Call notes (<date>): …"), raised on = the call date ✅ Passed (29 Sep 2026) |
| U6 | Status + Next contact changed | Opportunity updated; Probability follows; banner "Opportunity updated · Call logged: … · 2 objections logged · Status → …" ✅ Passed (29 Sep 2026) |
| U7 | Check the opportunity's **system notes** after U6 | Status and Next contact written once each and **not reverted** (the write-back check) ✅ Passed (29 Sep 2026) |
| U8 | Send Quote after the refactor | Unchanged — run **R3** and **R16** again ✅ Passed (29 Sep 2026) |
| U9 | A role without create rights on Customer Objection | The call and fields save; amber banner names the objections not saved ✅ Passed (29 Sep 2026) |
| U10 | Refresh 6 minutes later | No banner ✅ Passed (29 Sep 2026) |

## Update Opportunity 1.1 (Update Opportunity SL 1.1.0 / library 1.1.0 / Send Quote SL 2.3.1 / Opportunity UE 1.4.0) — optional call, bespoke email, save guard

> **Status: ✅ U11–U23 passed in Production (1 Oct 2026); U24 passed (29 Sep 2026).**
>
> **Before testing — as an NH Account Manager role, not Administrator:**
> - Upload **`nuheat_opp_update_lib.js` first**, then `nuheat_send_quote_sl.js` and `nuheat_update_opp_sl.js`,
>   then `nuheat_opportunity_ue.js`. Read back every version header: library 1.1.0, Send Quote SL 2.3.1,
>   Update Opportunity SL 1.1.0, Opportunity UE 1.4.0 (Opportunity CS stays 1.2.0).
> - No new script parameters or records are needed.
> - **Where to test:** the objection configuration was built directly in **Production**, so Sandbox needs a
>   **refresh** before any Sandbox testing. 1.1 was tested in Production (1 Oct 2026) on a test opportunity
>   whose contacts were our own addresses.
>   Sandbox may also redirect outgoing email, which hides real-recipient bugs.
> - **Account checks first:** no workflow or user event script runs on **Message** records; every rep's
>   employee record has an email address and a phone number.

### Automated (before uploading)

```bash
node test/send-quote-opp-update.js   # must end "400 passed, 0 failed" — includes H1, the proposal email byte-identical to 2.3.0
node test/update-opp.js              # must end "293 passed, 0 failed"
for f in nuheat_opp_update_lib.js nuheat_send_quote_sl.js nuheat_update_opp_sl.js nuheat_opportunity_ue.js; do node --check "$f"; done
```

### Scenarios

| # | Test | Expected |
|---|---|---|
| U11 | Call off, Next contact changed only | Saves; no phone call under Activities; banner without a call line ✅ Passed (1 Oct 2026) |
| U12 | Email only (call off), to yourself as a contact, plus CC me | You receive it from the rep: subject/headline `An update on QR…`, your message, sign-off, contact block with the sender's photo and number, the friendly footer. It appears under the opportunity's **Communication › Messages**. Banner: **Email sent** ✅ Passed (1 Oct 2026) |
| U13 | Reply to the email | The reply goes to the sender ✅ Passed (1 Oct 2026) |
| U14 | Open the logged message in NetSuite (pitfall 25 view) | No duplicated buttons; readable with styles stripped ✅ Passed (1 Oct 2026) |
| U15 | Call + email + 2 objections (one with a note) + Status change | All saved in order. The objection notes show the call line. Banner lists call, email, objections and status ✅ Passed (1 Oct 2026) |
| U16 | Call off, email on, 1 objection, no note | The objection note reads `Email sent (<today>): <subject>`; raised on = today ✅ Passed (1 Oct 2026) |
| U17 | Press Save, then browser Back and Save again | The second save shows **Already saved**; no second call or email ✅ Passed (1 Oct 2026) |
| U18 | Outlook desktop and a phone mail app | The card renders as Send Quote's does ✅ Passed (1 Oct 2026) |
| U19 | Send Quote after the update | Unchanged: send one proposal (as R3) and compare the email ✅ Passed (1 Oct 2026) |
| U20 | *(amendment 2)* Send as the sales rep (not yourself), to yourself as the recipient | It arrives from the rep, with the rep's card and sign-off. Reply → it goes to the rep. The rep gets no copy. Logged under Communication › Messages ✅ Passed (1 Oct 2026) |
| U21 | Send as the PE | It arrives from the PE: the PE's name and phone, but the email line and button say design@nu-heat.co.uk. Reply → it goes to the PE ✅ Passed (1 Oct 2026) |
| U22 | An opportunity with no PE | No PE option ✅ Passed (1 Oct 2026) |
| U23 | You are the sales rep | Only "Me" appears ✅ Passed (1 Oct 2026) |
| U24 | **As a non-admin sales role** (e.g. NH Account Manager — not Administrator): open Update opportunity, pick a title, tick objections, save | The page opens (deployment **Released**); the **Call Title dropdown is populated**; the **objection types are listed**; the save works — call, fields and objections all saved, green banner. An empty dropdown or picker means a missing role permission: see DEPLOYMENT_CHECKLIST › Roles and permissions and look for Permission Violation in the Execution Log ✅ Passed (29 Sep 2026) |

> Also worth a look: (a) with the call off and nothing else, Save stays disabled with "Log a call, send an
> email, tick an objection or change a field."; (b) the subject's tranid — confirmed 1 Oct: the pre-fill
> reads "An update on QR…" (the opportunity's `tranid`).


Also worth a look: an objection type or quote with HTML in its name shows clean text; a call date of
today works first thing in the morning (UK); the Execution Log shows `UpdateOppSL.Summary` for each save.

### Execution Log greps

| Key | Expect |
|---|---|
| `UpdateOppSL.Summary` | One line per save: `call <id>; objections created n, failed …; fields changed …, failed …` |
| `UpdateOppSL.Call` | The call ID and title — or the error that stopped the save |
| `UpdateOppSL.Objection` | One line per objection created, or its failure |
| `UpdateOppSL.OppUpdate` | `reported field types: …` on page load; `required check: ok / missing Next contact`; the fields written |
| `UpdateOppSL.Validation` | Why a save was rejected before any write |
| `UpdateOppSL.Redirect` | The code parameters, e.g. `{"nsq":"ok","nsqt":"…","nsqf":"entitystatus,next_contact","nsqs":"upd","nsqc":"…","nsqo":"2"}` |

---

## Send proposal redesign, return to the opportunity, forecast flags (Send Quote SL v2.0.1 / Opportunity UE v1.2.0 / Opportunity CS v1.1.0)

> 2.0.0 in Sandbox (28 Sep): send and banner OK; **Status reverted** → 2.0.1 reorders the writes (R13). Dates now use a picker (R14).
> 2.0.1 in Sandbox (28 Sep): **the reorder fixed the revert.** 2.0.2 adds Expected close (R15 ✅ passed 28 Sep).
> 2.0.3 fixes the quote card text (R16). Forecast flags (R4) ✅ **closed** 29 Sep 2026 in Production.

> **Upload** `nuheat_send_quote_sl.js`, `nuheat_opportunity_ue.js` and `nuheat_opportunity_cs.js` to
> `SuiteScripts/NuHeat/2026 Quote/`. `nuheat_send_quote_cs.js` is detached and needs no upload.
>
> **Set the Send Quote SL deployment's Log Level to Audit or Debug** — `SendQuoteSL.OppUpdate`,
> `SendQuoteSL.Forecast` and `SendQuoteSL.Redirect` are audit-level (the 1.8.0 S2 log line did not
> appear at the previous setting).
>
> **Run as an account-manager role**, not Administrator.

### Automated (before uploading)

```bash
node test/send-quote-opp-update.js      # must end "207 passed, 0 failed" (or more)
for f in nuheat_send_quote_sl.js nuheat_opportunity_ue.js nuheat_opportunity_cs.js; do node --check "$f"; done
```

### Sandbox scenarios

| # | Scenario | Expected |
|---|---|---|
| R1 | From the Opportunity (view), click **Send Quote** | Opens in the **same tab**; the page matches the design (screen 1) inside NetSuite's header and menu |
| R2 | Segmented control, To tags (add, remove, invalid shows red), contact picker, + Add CC / BCC, "Changed · was …" markers, live total | Behave as designed. Send stays disabled with a reason until there is a Main quote and a valid To |
| R3 | Send with one Main, one Additional, one Leave out; change Status and Next contact | Lands on the Opportunity with a green banner: "Opportunity updated: Status → … · Next contact → …" and "Forecast: 1 quote included, 2 excluded", plus "View proposal" |
| R4 | The Opportunity's Estimates subtab | **Include in Forecast** ticked only on the Main quote. (This also confirms the assumed `includeinforecast` ID — if nothing changed, read `SendQuoteSL.Forecast` in the log) ✅ Closed (29 Sep 2026, Production): Main → `includeinforecast` true, the others false |
| R5 | **Probability** after R3 | Follows the new Status |
| R6 | Refresh the Opportunity 6 minutes later | No banner |
| R7 | Make one field read-only for the role, then send | Amber banner naming the field; proposal sent |
| R8 | Break the email (e.g. an address the server rejects) | Stays on the page with the error panel; selections, addresses and fields kept; no field or forecast writes. ⚠️ The proposal file, URL and sent date **are** written — the Master Proposal does that before the email (unchanged behaviour) |
| R9 | Preview | Opens in a new tab; nothing written; prices match the sent proposal |
| R10 | An Estimate after a forecast write | Online quote **not** regenerated; margin fields unchanged (checks the legacy SS1 margin script on XEDIT) |
| R11 | Read the Execution Log | `SendQuoteSL.Forecast`, `SendQuoteSL.OppUpdate` and `SendQuoteSL.Redirect` lines present |
| R12 | Upload check | Version header read back off every uploaded file: SL **2.0.3**, UE **1.2.1**, Opportunity CS 1.1.0 (2.0.2 until amendment 5) |
| R13 | **2.0.1:** change Status in a send where **at least one forecast flag also changes** (e.g. make a different quote Main) | Status sticks; Probability follows it. **Read the Opportunity's system notes** for the send: the order and source of the Status changes is the evidence for §9 pitfall 20 (and whether `enableSourcing` is involved). Also try a Status change with **no** forecast change — if that reverts too, the Estimate re-sync is not the cause ✅ Passed (Sandbox, Sep 2026) |
| R14 | **2.0.1:** pick Next contact and Est. delivery date with the picker | The saved dates match what was picked, no day shift. Note the picker's display order (it follows the browser's language, not NetSuite's date preference) ✅ Passed (Sandbox, Sep 2026) |
| R15 | **2.0.2:** change **Expected close** with the picker (the section now shows Status, Build stage, Expected close, Next contact, Est. delivery date) | Saves with no day shift; the green banner shows "Expected close → <date>"; the "Changed · was …" marker and the footer summary include it ✅ Passed (Sandbox, Sep 2026) |
| R16 | **2.0.3:** look at the quote cards | Card shows ref · description, then Created / type / BUS facts; no raw `&lt;`. Line 1 wraps to two lines at most, full text on hover ✅ Passed (Sandbox, Sep 2026) |
| R19 | **2.3.0 faster send, forecast tags.** (1) **Before uploading:** on 2.2.0 — or 2.2.1, the timing-only commit, which adds `SendQuoteSL.Timing` lines with no other change — send once on a **multi-quote** opportunity (leave some quotes out) and once on a **single-quote** one; note the send time and screenshot the Execution Log. (2) Upload 2.3.0 (read back **2.3.0**), repeat both sends, compare the `SendQuoteSL.Timing` lines. (3) Check the forecast ticks on the Estimates subtab after the send, against the card tags before it. (4) Compare the proposal's prices, VAT and BUS with the 2.2.0 send | (2) POST `rebuild` drops roughly in proportion to the quotes left out; `quotes= selected= forecastWrites=` match the send; one `SendQuoteSL.BUS` line per **selected** quote only. (3) Main quotes ticked, all others unticked; each card's tag said "→ will be included / excluded" exactly where the tick changed. (4) Identical figures ✅ Passed (Sandbox, Sep 2026) |
| R18 | **2.2.0 email redesign.** Upload `nuheat_send_quote_sl.js` and read back **2.2.0** from the header, then send proposals to yourself (reference renders: `docs/samples/send-quote-email-2.2.0.html` and `-stripped.html`). **E1** NetSuite message view · **E2** Outlook desktop · **E3** Gmail web and phone · **E4** an account manager with no photo (or clear `custentity_employee_photo_link` temporarily) · **E5** click CALL / EMAIL, VIEW YOUR QUOTE, T&C and the social links · **E6** a long project name | **E1** centred, one of each button, photo shown · **E2** centred, buttons styled, one of each · **E3** 2 × 2 grid on the web, stacked on the phone; buttons full width on the phone · **E4** card without a photo, no broken image; Execution Log `SendQuoteSL.RepPhoto` says "photo skipped — …" · **E5** dials, opens mail, opens the proposal; links work · **E6** the name wraps neatly, "· OPP…" stays together on its line. Note the `SendQuoteSL.RepPhoto` line for E1 — it confirms the photo field's type/URL form ✅ Passed (Sandbox, Sep 2026) |
| R17 | **2.1.1:** send a proposal to yourself; open it in the **NetSuite message view** (the opportunity's Communication › Messages), **Outlook** and **Gmail**. (A reference render is in `docs/samples/send-quote-email-2.1.1.html`.) | CLICK TO CALL, SEND AN EMAIL and VIEW YOUR QUOTE(S) HERE each appear **once**, and the email is **centred** (header, images and button in a 600 px column), in all three ✅ Passed (Sandbox, Sep 2026) |

Also worth a look: the banner's "View proposal" link renders as a link (not as literal HTML), and a
single-quote Opportunity starts with that quote at **Main**.

### Execution Log greps

| Key | Expect |
|---|---|
| `SendQuoteSL.Forecast` | One line per Estimate changed (`false → true`), then a summary. `… reported as "…", expected "checkbox"; no forecast writes` means the `includeinforecast` assumption is wrong — report it |
| `SendQuoteSL.Redirect` | The code parameters sent back, e.g. `{"nsq":"ok","nsqt":"…","nsqf":"entitystatus,next_contact","nsqfi":"1","nsqfx":"2"}` |
| `SendQuoteSL.Selection` | Only when a request named a quote not on the Opportunity — should never appear in normal use |
| `OpportunityUE.banner` | Which banner was shown |

---

## Send Quote — update opportunity on send (Send Quote SL v1.8.0 / Opportunity UE v1.1.0)

> ✅ Passed in Sandbox 28 Sep 2026 (S1–S4, S6–S9). S5 found Probability stale — fixed in 2.0.0 (R5).
> Superseded by 2.0.0 before release; the field rules below still apply.

> **Upload:** `nuheat_send_quote_sl.js` and `nuheat_opportunity_ue.js` only. The client script
> (`nuheat_send_quote_cs.js`) is unchanged and needs no re-upload. Read the version header back off
> each uploaded file.
>
> **Run these as a non-admin account-manager role.** The deployment runs as the current role.

### Automated (before uploading)

```bash
node test/send-quote-opp-update.js      # must end "N passed, 0 failed"
node --check nuheat_send_quote_sl.js && node --check nuheat_opportunity_ue.js
```

### Sandbox scenarios

| # | Scenario | Expected |
|---|---|---|
| S1 | Send Quote button in view mode / edit mode | Present / absent |
| S2 | Form layout | "Update opportunity" section with current values; Status list matches the record's own dropdown; Build stage list correct with a blank first entry. Note where the section renders relative to "Select Contact" |
| S3 | Send with no changes | Proposal sent; panel "No opportunity fields changed."; system notes show only the proposal URL / sent-date write |
| S4 | Send with all four changed | All four updated on the Opportunity; system notes show the Suitelet write; panel lists the new values as display text |
| S5 | After S4, check **Probability** | Record whether it followed the new status (`enableSourcing: false` may leave it stale). **Report; do not fix in 1.8.0** |
| S6 | Change Est. delivery date on an Opportunity that has a sales order | The order's ship date updates via the sync, as for a UI edit |
| S7 | Change status on an Opportunity at Design Required | No new Design Instruction row; sub-status unchanged |
| S8 | A role without edit rights on one field (or the field made read-only) | Proposal still sent; yellow warning naming the fields to set |
| S9 | Preview with changed values | Nothing written |
| S10 | Upload check | Version header read back off every uploaded file: SL 1.8.0, UE 1.1.0 |

Also: clear Est. delivery date and send — the date must **not** be cleared on the Opportunity.

### Execution Log greps

| Key | Expect |
|---|---|
| `SendQuoteSL.OppUpdate` | On every form load: `reported field types: entitystatus=select, custbody_next_contact=date, custbody_opp_del_date=date, custbody_build_stage=select`. **Anything else means the assumed type was wrong** — report it; the field will have been hidden. On send: `no changes` or `updated <field>: old → new; …` |

---

## BUS Grant Rates & Post-Grant Balance (v4.4.0 / v1.7.0 / v1.6.0 / v1.0.0)

> ⚠️ **Before testing:** upload **`nuheat_bus_grant.js` AND `nuheat_vat_rates.js`** to
> `SuiteScripts/NuHeat/2026 Quote` **first**, then the Quote Suitelet and Send Quote SL. Both consumers fail at
> load time if either module is missing. See `DEPLOYMENT_CHECKLIST.md`.

Check **both** the quote page and the Master Proposal for every scenario.

### Scenario matrix

| # | Scenario | Suppak line | Expected HP price | Expected commissioning | Expected balance | Grant card |
|---|---|---|---|---|---|---|
| 1 | **The reported bug** — standard, grant exceeds quote | `Suppak N1(R)HP` | **£0.00** | **£0.00** (cascade) | **−£694.40** | £7,500 + refund line showing **£694.40** |
| 2 | Standard, normal | `Suppak N1(NB)HP` | positive | full price | positive | £7,500, no refund line |
| 3 | Standard via BUS item | `Suppak BUS` | positive | full price | positive | £7,500 |
| 4 | **Enhanced** | `Suppak BUS - Uplift` | HP gross − £9,000 | full price | positive | **£9,000**, no refund line |
| 5 | Enhanced, grant exceeds quote | `Suppak BUS - Uplift` | £0.00 | £0.00 | negative | £9,000 + refund line |
| 6 | Non-qualifying Suppak | e.g. `Suppak N2` | full, no deduction | full price | = subtotal | **card hidden** + `BUS_UNMATCHED` in log |
| 7 | No Suppak line | none | full, no deduction | full price | = subtotal | **card hidden** |
| 8 | Exactly at grant value | `Suppak BUS` | £0.00 | see note | **£0.00** (not −£0.00) | £7,500, **no** refund line |
| 9 | UFH-only quote | n/a | n/a | n/a | unchanged | not rendered |
| 10 | Multi-system (UFH + HP) | `Suppak N1(R)HP` | UFH price unaffected | — | correct | £7,500 |

> **Note on scenario 8.** With `CASCADE_GRANT_TO_COMMISSIONING = true` (the default), a subtotal
> exactly equal to the grant leaves a residual that cascades, so commissioning shows **£0.00**, not
> its full price — the components then sum to the £0.00 balance, which is the point of the cascade.
> Commissioning shows its full price here only with the flag set to `false`. The assertions that
> matter in this scenario are **£0.00 and not −£0.00**, and **no refund line**.

### Standard regression checklist

- [ ] Manual "Regen quote" on ≥2 Estimates
- [ ] Auto-generation on Estimate save
- [ ] Incognito / public access without a NetSuite login
- [ ] Mobile at 768px
- [ ] Print / PDF output
- [ ] Script Execution Log clean (no errors)
- [ ] File Cabinet file written correctly, stable proxy URL still resolves

### Specific things to eyeball

- [ ] **No `£-` anywhere.** Negatives must render `-£694.40`, never `£-694.40`.
- [ ] Scenario 8 must not produce `-£0.00`.
- [ ] Scenario 1: the discount lines must still read `Discount: -£x`, **not** `-£-x`.
      (`header.discountTotal` is `Math.abs()`'d and those two call sites hand-roll their own sign —
      they deliberately do not use `formatSignedCurrency()`.)
- [ ] Master Proposal card totals and the headline total bar agree.
- [ ] Master Proposal **preview** and the saved/emailed proposal show the same grant. (From Send
      Quote SL 2.0.0 both are rebuilt on the server by `toProposalQuote()`, so a mismatch is a
      Suitelet defect; before 2.0.0 it meant the client script was not redeployed.)
- [ ] Grant card is hidden entirely on scenarios 6, 7 and 9 — not rendered with a £0 amount.
- [ ] UFH-only and solar-only quotes render **exactly** as before v4.4.0.

### Execution Log greps

Run on every scenario:

| Tag | Written by | What to check |
|---|---|---|
| `BUS_RESOLVE` | `nuheat_bus_grant.js` | rate and amount match the scenario |
| `BUS_UNMATCHED` | `nuheat_bus_grant.js` | **expected only in scenario 6.** If it appears anywhere else, the Suppak item names in `BUS_STANDARD_ITEMS` / `BUS_ENHANCED_ITEMS` do not match what NetSuite actually returns — correct them to the raw `itemName` the log reports |
| `BUS_FIGURES` | `nuheat_quote_suitelet.js` | every derived figure for the quote, as JSON |
| `SendQuoteSL.BUS` | `nuheat_send_quote_sl.js` | per-Estimate rate, amount and matched item |

> **The item-name caveat.** The exact string NetSuite returns for a Suppak line could not be
> confirmed from the repository — there were zero occurrences of "Suppak" in the code, docs or git
> history. `BUS_UNMATCHED` is the safety net. If scenarios 1–5 pay no grant, check that log first:
> the resolution logic is fine, the item strings just need correcting in one place
> (`nuheat_bus_grant.js`).

### Toggling the cascade

`CASCADE_GRANT_TO_COMMISSIONING` in `nuheat_quote_suitelet.js` (default `true`). Worth rendering
scenario 1 both ways before deciding:

| | `true` (default) | `false` |
|---|---|---|
| Heat pump | £0.00 | £0.00 |
| Commissioning | £0.00 — **appears free** | £1,175.93 |
| Total | −£694.40 | −£694.40 |
| Components sum to the total? | ✅ | ❌ |

---

## VAT by Technology (v4.5.0 / v1.8.0 / v1.7.0 / VAT Module v1.0.0)

> ✅ **The tax codes were corrected in Production on 20 August 2026.** Derived VAT and NetSuite's
> `taxtotal` should now **agree**, so `VAT_MISMATCH` is a pass/fail signal again rather than a
> work-list to collect.
>
> **A `VAT_MISMATCH` entry is now a test failure to investigate**, not an expected finding — it
> means either a quote type whose rate the module gets wrong, or an Estimate created with the wrong
> tax code after the correction. Scenario V3 below is the exception: it deliberately constructs the
> mismatch.

### Scenario matrix

| # | Scenario | Expected |
|---|---|---|
| V1 | HP-only quote page | `VAT at 0%: £0.00`; Total inc VAT = ex-VAT total; **no** "plus VAT" on the HP price card |
| V2 | UFH-only quote page | `VAT at 20%: £x`; VAT = 20% of (subtotal − discount) |
| V3 | HP quote whose Estimate has 20% tax codes (construct one deliberately — no longer occurs naturally) | Page shows £0.00; `VAT_MISMATCH` logged with both figures |
| V4 | UFH quote with a discount | VAT calculated on subtotal **minus** discount, not gross |
| V5 | Proposal, HP + UFH | Blended VAT = 0 + (UFH × 20%); **note line shown** |
| V6 | Proposal, HP only | Correct VAT; **note line hidden** (stricter gate — see below) |
| V7 | Proposal, UFH only | Correct VAT; note line hidden |
| V8 | Preview vs emailed proposal | Identical VAT figures on both |
| V9 | Unknown/blank `custbody_quote_type` | Falls back to 20%; `VAT_RATE_UNMATCHED` logged |
| V10 | Solar quote | 0% VAT — ⚠️ **confirm this is correct before sign-off** |
| V11 | Re-run BUS scenarios 1–10 above | **No BUS regression** — grant figures unchanged |
| V12 | Intro copy | New sentence on main quotes; "alternative options" line unchanged |

> **Note on V6.** The note line is gated on **a heat pump quote AND at least one 20%-rated quote**,
> deliberately stricter than "the proposal includes a heat pump" — on a heat-pump-only proposal the
> sentence would describe blending with underfloor heating that isn't there. If you want it shown on
> heat-pump-only proposals too, it is a one-line change in `generateTotalPriceBar()`.

### Also worth checking

- [ ] **Heat pump quotes of every sub-type** — `Heat Pump (ASHP)`, `(GSHP)`, `(EAHP)` — all show 0%.
      These raw list values differ from the display name `Heat Pump`; if any shows 20%, quote-type
      normalisation is not working.
- [ ] **"plus VAT" appears only in the total system price header** on the quote page — not on the
      heat pump price card and not on the Solar/Commissioning cost cards. It **should** still appear
      on the Design+ upgrade price in the UFH upgrade banner (that is not a section price card).
- [ ] **Total inc VAT is internally consistent** — it must equal (subtotal − discount + displayed
      VAT), and on a BUS quote, minus the grant. If VAT changed but the total didn't, the corrected
      total is not being used.
- [ ] Quote pages where `record.load()` fails in the Send Quote SL still show their NetSuite
      fallback amount rather than £0.00.

### Execution Log greps

| Tag | Written by | What to check |
|---|---|---|
| `VAT_MISMATCH` | VAT module | **expected only in V3.** Tax codes were fixed 20 Aug 2026, so an entry anywhere else is a regression at source — investigate it |
| `VAT_RATE_UNMATCHED` | VAT module | expected only in V9; anywhere else means a quote type is missing from `QUOTE_TYPE_ALIASES` |
| `VAT_QUOTE_TYPE` | Quote Suitelet | which route resolved the type — "inferred from grouped items" means `custbody_quote_type` was unreadable |
| `VAT_FIGURES` | Quote Suitelet | all derived VAT figures as JSON |
| `SendQuoteSL.VAT` | Send Quote SL | per-Estimate rate, net, derived VAT, NetSuite tax total |
| `BUS_RESOLVE` / `BUS_UNMATCHED` | BUS module | unchanged from v4.4.0 — confirm no regression |

---

## Refund & VAT presentation (v4.5.1 / v1.8.1)

**Presentation only.** No calculation logic changed, so every figure from the BUS and VAT scenarios
above must be identical — D14 exists to confirm that.

> No new File Cabinet upload ordering concerns: only `nuheat_quote_suitelet.js` and
> `nuheat_master_proposal.js` changed. The two shared modules are untouched.

| # | Scenario | Expected |
|---|---|---|
| D1 | Proposal card, HP with negative balance | `-£2,351.88 Refundable to you on completion` on the price line; detail line reads only `Total inc. VAT: -£2,351.88`; **no** "Includes £7,500.00 BUS grant" |
| D2 | Proposal card, HP with positive balance | No refund label; detail line unchanged |
| D3 | Proposal card, UFH quote | Completely unchanged from today |
| D4 | Proposal card with a discount | Discount clause still present in the detail line |
| D5 | Proposal total header, HP + UFH | `plus VAT £1,057.71` — see the note below on the arithmetic |
| D6 | Proposal total header, UFH only | `plus VAT £x` where x = 20% of net |
| D7 | Proposal total header, HP only | `plus VAT £0.00` |
| D8 | Quote page, HP negative balance | `Refundable amount: £2,351.88` (positive) below the VAT line, in **both** total sections |
| D9 | Quote page, HP positive balance | No refundable line anywhere |
| D10 | Quote page, balance exactly £0.00 | No refundable line, and no `-£0.00` |
| D11 | Quote page, UFH only | Unchanged |
| D12 | Mobile 768px | Refund label wraps below the price rather than squashing it |
| D13 | Print / PDF | Both total sections render correctly |
| D14 | Re-run BUS + VAT scenarios from above | **No regression in any figure** |

> **D5 — on the `plus VAT` arithmetic.** With no discount, `plus VAT` equals
> `Total inc. VAT − subtotal` (£3,994.38 − £2,936.67 = £1,057.71). **With a discount it does not**,
> and that is correct, not a defect: the headline subtotal is gross of discount and the discount is
> shown as its own breakdown line, so the relationship is
> `subtotal − discount + VAT = Total inc. VAT`. Check that identity rather than the simple
> subtraction on any discounted proposal.

### Specific things to eyeball

- [ ] **Both** quote-page total sections show the refundable line — top and bottom. If only one does,
      the page will look broken to anyone scrolling.
- [ ] Refundable amount is **positive** — `£2,351.88`, never `-£2,351.88`.
- [ ] No `Refundable amount: £0.00` row at a zero balance, and no `-£0.00` anywhere.
- [ ] The `Total inc VAT` line and its top border are unchanged.
- [ ] Proposal cards no longer say "Includes £7,500.00 BUS grant" — but the `.grant-highlight` banner
      below the cards still does.
- [ ] The refund label reads as a label, not a second figure — smaller and lighter than the price.

---

## Proposal "plus VAT" on its own line (v1.8.2)

One CSS rule in `nuheat_master_proposal.js`. No logic, no HTML, no other file — everything else in
this PR is unaffected.

| # | Scenario | Expected |
|---|---|---|
| E1 | Proposal, HP + UFH, desktop | `plus VAT £1,057.71` on its own line, right-aligned under the price, never split |
| E2 | Proposal, large VAT figure (e.g. £12,345.67) | Still one unbroken line |
| E3 | Proposal, HP only | `plus VAT £0.00` on its own line |
| E4 | Mobile 768px | VAT line centred under the price, consistent with the rest of the block |
| E5 | Print / PDF | Renders on its own line, no clipping |
| E6 | Spacing | Clean gap above the `Total inc. VAT` border — not cramped, not floating |
| E7 | Quote page total sections | **Unchanged** — confirm no regression |

> **E7 — why the quote page is excluded.** `nuheat_quote_suitelet.js` has a `.top-total-plus-vat`
> class of its own, but it renders the bare words "plus VAT" with no amount appended, so it is far
> too short to wrap. It was deliberately left alone; if it looks any different from before, something
> unintended has changed.

---

## Site address, section rename, VAT copy (v4.6.0 / v1.8.3)

Only `nuheat_quote_suitelet.js` and `nuheat_master_proposal.js` changed — the shared modules and the
Send Quote scripts are untouched, so no new upload ordering concerns.

| # | Scenario | Expected |
|---|---|---|
| F1 | Quote from an Opportunity **with** a site address | `Site address:` row renders between Customer name and System reference |
| F2 | Quote from an Opportunity **without** a site address | Row hidden entirely — no empty label |
| F3 | Quote with **no** linked Opportunity | Page renders normally, row hidden, no error |
| F4 | Opportunity load fails / no permission | Page still renders; `log.debug` entry present; no crash |
| F5 | Label wording | Reads `Site address:`, matching the Master Proposal |
| F6 | Execution Log | `SITE_ADDRESS` audit entry present with oppId and resolved value |
| F7 | Section header | Reads `Your solutions and costs` |
| F8 | Collapse toggle | Section still expands/collapses — IDs unbroken |
| F9 | Master Proposal VAT note | New wording; still only on HP + 20%-rated proposals |
| F10 | Master Proposal, HP only | VAT note still hidden |
| F11 | Mobile 768px | Address row wraps cleanly in the info block |
| F12 | Print / PDF | Address row and renamed header both render |
| F13 | Re-run Phases 2–5 scenarios | No regression in any BUS, VAT or layout figure |

### Specific things to eyeball

- [ ] **F8 is the one that matters most.** The section ID stayed `recommendations` while only the
      visible `<h2>` text changed, so the toggle should be unaffected — but click it and confirm the
      section still expands and collapses, and the ▼/▶ arrow still flips.
- [ ] **F6 diagnoses F2 vs a real bug.** If the row is missing, check `SITE_ADDRESS` in the log:
      an empty value against a *valid* `oppId` means the field is empty on that Opportunity — a data
      issue, not a code one. `oppId=none` means the Estimate has no linked Opportunity (F3).
- [ ] No empty `Site address:` label with a blank value — a whitespace-only field must hide the row.
- [ ] The Master Proposal's own site address row is unchanged.
