# Field Reference — Nu-Heat Quote System

All custom NetSuite fields used by this solution, organised by record type and purpose.

---

## Analytics Fields

### Estimate (Transaction Body)

| Field ID | Type | Purpose |
|---|---|---|
| custbodycustbody_quote_last_viewed | DateTime | Timestamp of most recent customer quote view — note: double-prefix due to creation error |
| custbodycustbody_quote_view_count | Integer | Running total of customer quote views — note: double-prefix due to creation error |

### Opportunity (Transaction Body)

| Field ID | Type | Purpose |
|---|---|---|
| custbody_opp_quote_last_viewed | DateTime | Timestamp of most recent proposal view |
| custbody_opp_view_count | Integer | Running total of proposal views |
| custbody_opp_site_adress | Text | Site address — displayed in the Customer Information section of **both** the Master Proposal and (from Quote Suitelet v4.6.0) the quote page (note: field ID has single 'd' in "adress") |
| custbody_master_proposal_url | URL/Text *(type assumed)* | **Written** by `nuheat_master_proposal.js` `updateOpportunityWithProposalUrl()` on every send (Generate & Send / Send proposal), before the email. ID confirmed (live code) |
| custbody_last_proposal_sent_date | Date *(type assumed)* | **Written** alongside the proposal URL. ID confirmed (live code). Was once read-only in NetSuite, which blocked the write — see `AI_AGENT_CONTEXT.md` |
| entitystatus | List (standard) — confirmed | Status. Read by the Send Quote SL; **written** by Send Quote SL v1.8.0 when the user changes it on send |
| custbody_next_contact | Date — **assumed** | Next contact. **Written** by Send Quote SL v1.8.0 when changed on send. ID confirmed by Steve |
| custbody_opp_del_date | Date — **assumed** | Est. delivery date. **Written** by Send Quote SL v1.8.0 when changed on send. Changes sync to linked sales orders' ship dates (separate repo) — wanted. ID confirmed by Steve |
| custbody_build_stage | List/Record — **assumed** | Build stage. **Written** by Send Quote SL v1.8.0 when changed on send. ID confirmed by Steve |
| expectedclosedate | Date (standard) | Expected close. **Written** by Send Quote SL v2.0.2 when changed on send (native date picker; never cleared). Type checked at runtime like the other dates; the reported type is logged as `SendQuoteSL.OppUpdate … reported field types` |
| custbody_opportunity_sub_status | List | ⚠️ **Never written by this repository.** Some values create Design Instruction rows. Listed only so nobody adds it to the Send Quote update |

> **Assumed types.** The Send Quote SL checks each update field's type as NetSuite reports it
> (`record.getField().type`) and does not show a field whose type is not the one assumed. The reported
> types are logged at audit under `SendQuoteSL.OppUpdate` ("reported field types: …") on every form
> load — read them there to confirm or correct this table.

> ⚠️ **`custbody_opp_site_adress` is an OPPORTUNITY field, not an Estimate field.** The `opp_` prefix
> is the clue. Reading it off an Estimate returns empty every time — which is exactly what the Quote
> Suitelet did before v4.6.0, so its "Site address" row never rendered despite the markup being
> present and correctly placed.
>
> All three consumers now load the Opportunity and read it from there, each inside a try/catch so a
> missing or unreadable Opportunity can never break the page:
>
> | Script | Where |
> |---|---|
> | `nuheat_master_proposal.js` | `loadOppData()` ~:463 |
> | `nuheat_send_quote_sl.js` | ~:461 |
> | `nuheat_quote_suitelet.js` | `loadQuoteData()` — **new in v4.6.0**, logged as `SITE_ADDRESS` |
>
> The Quote Suitelet keeps its two Estimate-level fallbacks after the Opportunity value
> (`custbody_opp_site_adress`, then `custbody_project_address` on the Estimate) in case some
> Estimates carry their own value. Order matters: **Opportunity first.**
>
> ⚠️ **Do not "correct" the spelling.** `adress` with one `d` is the real field ID in NetSuite.
>
> If `SITE_ADDRESS` logs an empty string against a valid `oppId`, the field is genuinely empty on
> that Opportunity — a data issue, not a code one.

---

## Send Quote SL 2.0.0 — forecast flag and redirect parameters

### Estimate (standard field)

| Field ID | Type | Purpose |
|---|---|---|
| `includeinforecast` | Checkbox — ✅ **confirmed** (R4 closed 29 Sep 2026, Production: Main → true, the others false) | "Include in Forecast". **Written** by Send Quote SL 2.0.0 after a successful send: `true` on quotes sent as Main, `false` on Additional / Leave out — only quotes shown on the page, only where the value differs. The SL reads the type off each Estimate it loads and writes nothing (audit log `SendQuoteSL.Forecast`) unless NetSuite reports `checkbox`. Confirm the ID in Sandbox (R4/R11) |

### Redirect parameters (Send Quote SL / Update Opportunity SL → Opportunity, read by Opportunity UE)

After a successful send (or save) the Suitelet redirects to the Opportunity in VIEW with these parameters.
**Codes only — never text, addresses or error messages.** The banner builds every word from the
record; unknown values are dropped.

| Param | Value | Meaning |
|---|---|---|
| `nsq` | `ok` \| `warn` \| `dup` | Banner type: green confirmation, or amber "wasn't fully updated". *(UE 1.4.0, upd only)* `dup` → "Already saved" (a resubmitted page that saved nothing). Anything else → no banner |
| `nsqt` | epoch seconds | When the send finished. Missing, non-numeric or older than **300 s** → no banner (a refresh or shared link cannot replay it) |
| `nsqf` | comma list of keys | Opportunity fields changed: `entitystatus`, `next_contact`, `del_date`, `build_stage`, `close_date` (v2.0.2). Values are read from the record |
| `nsqff` | comma list of keys | Opportunity fields the write failed on — "Please set … on this record." |
| `nsqfi` / `nsqfx` | counts | Quotes now included / excluded from the forecast (target states of the quotes on the page). Sent only when at least one flag changed |
| `nsqqf` | comma list of Estimate IDs | Forecast writes that failed. Shown by `tranid`, and only for Estimates linked to this Opportunity |
| `nsqs` | `send` \| `upd` | *(UE 1.3.0)* Which page sent the user back. Missing or anything else → `send` (old redirects keep working). `upd` uses the "Opportunity updated" titles and never shows "View proposal" |
| `nsqc` | Phone Call ID | *(upd)* The call just logged — shown as "Call logged: <title from the call>" **only if** the call's `transaction` is this Opportunity. *(1.1.0)* Absent when the call was switched off |
| `nsqo` | count | *(upd)* Customer Objections created — "<n> objection(s) logged" |
| `nsqof` | comma list of Objection Type IDs | *(upd)* Objections that failed to save — named from the Objection Type records; IDs that are not Objection Types are dropped |
| `nsqe` | `sent` \| `fail` | *(upd, UE 1.4.0)* The bespoke email: "Email sent to N recipient(s)" / warning "The email was not sent." Anything else ignored. If the email was the only action, the title is "Email sent" / "Email not sent" |
| `nsqen` | count | *(upd, UE 1.4.0)* To + CC addresses, excluding CC me (only with `nsqe=sent`) |
| `nsqs` = `ord` | — | *(UE 1.5.0, Create order SL 1.0.0)* "Order created" / "Orders created" / "Orders created — but not everything saved"; `nsq=dup` → "Already created" |
| `nsqso` | comma list of SO IDs | *(ord)* Orders created: "Created SO239950, SO239951", **only** SOs whose `opportunity` is this one (one search). None verified → no banner |
| `nsqqf` | comma list of Estimate IDs | *(ord)* Quotes not converted: "Not created: EST…" (this Opportunity's Estimates only; reasons are in the log, never the URL) |
| `nsqlf` / `nsqtm` | comma list of SO IDs | *(ord)* Order log not created / total after save differs from the quote (verified SOs only) |
| `nsqe` *(ord, UE 1.5.3)* | `sent` \| `fail` | The one confirmation email: "Confirmation email sent" / warning "The confirmation email was not sent." (1.5.2's `nsqen` count and `nsqef` are dropped for ord) |
| `nsqf` / `nsqff` keys `sub_status`, `value_prop` | — | *(UE 1.5.0)* Sub-status (`custbody_opportunity_sub_status`) and Value proposition (`custbody_value_proposition`), read from the record. |
| `nsqf` / `nsqff` key `bus_elig` | — | *(UE 1.5.4)* BUS eligibility (`custbody_bus_eligibility`), read from the record |

## Create order (Create Order SL 1.4.0 / order library 1.3.0) — 6 Oct 2026

### Estimate (read: two searches, no loads)

| Field ID | Purpose |
|---|---|
| `status` (filter `Estimate:A`) | Only **open** quotes are listed and orderable. Converted quotes are no longer open — and saving one SO makes NetSuite mark the opportunity's **other** open quotes Processed too (7 Oct), so every quote is re-checked before the first save (amendment 6) |
| `opportunity` | Must be this opportunity (listing, POST validation, and `prepareOrder`'s own re-check — phase 1, before any save) |
| `tranid`, `title`, `custbody_quote_description`, `datecreated` | The row's number (links to the quote), description and date created |
| `custbody_quote_type` | The row's quote type; the project-type inference key; copied to the SO if the transform leaves it blank |
| `total` | Total inc VAT (NetSuite's figure); the SO's total must match it within 1p |
| `duedate` | Before today → the **Expired** tag (still orderable) |
| `custbody_qdt_number_of_units` | *(extras search)* Units prefill; the rep edits it; written to the order log, **not** back to the Estimate |
| `custbody_deposit` | *(extras search)* Inc VAT; shown and emailed only for customers who pay up front, and only when > 0 |
| `netamountnotax` | *(extras search)* Ex VAT (shown only). ⚠️ Sandbox check: the column name |

### Quote Type (`customrecord16`, read only — amendment 7)

| Field ID | Purpose |
|---|---|
| `custrecord_qt_requires_installer_certs` | Ticked = a heat pump type: a ticked quote of this type makes the BUS voucher apply (display only). One search per page load / POST for the listed types. ⚠️ S22: not referenced elsewhere in code |

### Sales Order (set by `prepareOrder`, saved by `saveOrder`)

| Field ID | Value |
|---|---|
| `customform` | `ORDER_SO_FORM` ("NH Sales Order (2026)"), set first through the transform's `defaultValues` |
| `custbody_finance_status` (Record Status) | `ORDER_RECORD_STATUS` (Awaiting Design Info) |
| `custbody_bund_proj_type` | The project type (list `customlist_bund_proj_type`). The same value on every SO of one submission |
| `custbody_partner_commission_amount` (£, **mandatory on the form**) | *(1.2.1)* **Always**, a number: the £ entered; for a %, `round(% × (total − taxtotal) / 100, 2)` from the transformed SO; blank → `0`. A % with no readable base → not saved |
| `custbody_partner_commission` (%) | *(1.2.1)* Only when the rep chose %: the % entered (0–100, 2 dp) |
| `opportunity`, `custbody_quote_type` | Only when the transform left them blank (copied from the Estimate) |

### Order log (`customrecord_order_log`, form "NH Order Log Administration")

| Field ID | Value |
|---|---|
| `custrecord_order_so` | The SO |
| `custrecord_parent_opp` (mandatory) | The value of the opportunity field named by `ORDER_PARENT_OPP_FIELD`, when set and filled; else this opportunity |
| `custrecord_order_units` (mandatory) | The units entered (whole number ≥ 1) |
| `custrecord_order_auth` (mandatory) | List `customlist_order_auth` (Email confirmation, System order form, Deposit, Purchase Order, Online acceptance, Verbal), read at run time |
| `custrecord_order_rep` | The sales rep taking the order (an active sales-rep employee; default the opportunity's `salesrep`) |
| everything else (customer, revenue, margin, quote type, department…) | **Sourced by NetSuite. Never set** |

### Opportunity (written last)

| Field ID | Rule |
|---|---|
| `custbody_opp_del_date`, `custbody_next_contact`, `custbody_build_stage` | `lib.updateFields` (next contact required, D3) |
| `custbody_opportunity_sub_status` | **Create order only** (CO1): the rep's choice (default: the first id of `NEEDINFO_SUBSTATUS`), one of the offered options; written only when changed |
| `custbody_value_proposition` | Required; list `customlist_value_proposition` (UFH Design / UFH Design + / HP Design); options from the field; written only when changed |
| `custbody_bus_eligibility` *(1.4.0)* | Optional; list `customlist_bus_eligibility` (1 Standard BUS (£7500) / 2 Enhanced BUS (£9000) / 3 Ineligible for BUS — read at run time); options from the field + "Not set"; written in the final write only when changed (banner key `bus_elig`). **Display only otherwise:** the voucher (`ORDER_BUS_AMOUNTS`) is never written to any transaction |
| `entitystatus` | `ORDER_OPP_STATUS`, only when set (and an option); `enableSourcing` on |

### Confirmation email (1.3.0) — one NetSuite template email per submission, filed on the opportunity

| Item | Rule |
|---|---|
| Email templates | `emailtemplate` search: `internalid` anyof `ORDER_EMAIL_TEMPLATES`, columns `name`, `isinactive`. Offered in the setting's order; inactive / missing ones left out and logged |
| `custpage_email_tpl` | *(1.3.0)* The one template chosen in the email section (required while the email is on; must be an offered one). 1.2.0's per-row `custpage_tpl_<id>` is gone |
| `custpage_att_1` … `custpage_att_5` | The attachments (`request.files`), at most 5 files and 10 MB in total, each non-empty. Passed to `email.send` as they are — not saved |
| `render.mergeEmail` | `templateId`, `entity` and `recipient` = `{ type: 'customer', id }`, `transactionId` = **the opportunity** → `{ subject, body }`. Once per submission, only when at least one order was created |
| `email.send` | `author` = the chosen sender, `recipients` / `cc` = the recipients component, the merged subject and body, `attachments`, `relatedRecords: { transactionId: <opportunity>, entityId: <customer> }` (the opportunity's Communication tab) |

### Customer / Employee

| Record · field | Purpose |
|---|---|
| Customer `terms` | Pays up front = in `PREPAY_TERMS` (or blank: the dashboard's rule) |
| Customer `email` | The default To |
| Employee search `salesrep` (T), `isinactive` (F) | The rep select (1.2.0: `salesrep` is the search filter; `issalesrep` is invalid there). The opportunity's `salesrep` is always offered. The POST rebuilds the list |

### Settings (amendment 1: rows of `customrecord_cdb_setting` — no script parameters)

Customer Dashboard Settings (`customrecord_cdb_setting`): Name = the key (trimmed before matching),
`custrecord_cdb_setting_value` = the value. Read by one search per request (the Suitelet) and, for `ORDER_MODE`
only, by the Opportunity UE (cached 300 s). Blank = missing; two active rows for a key = missing (logged);
a failed search = every key missing (the page refuses, no button).

| Key (row Name) | Value | Empty, missing, duplicate or invalid means |
|---|---|---|
| `ORDER_MODE` | `OFF` / `ADMIN` / `ALL` (case-insensitive). **ADMIN** for Sandbox testing, **ALL** at go-live | OFF: no button, and the page refuses |
| `ORDER_SO_FORM` | id: **NH Sales Order (2026)** (Customization › Forms › Transaction Forms) | the page refuses: "ORDER_SO_FORM is not set in Customer Dashboard Settings." |
| `ORDER_RECORD_STATUS` | id: **Awaiting Design Info** in the Record Status (`custbody_finance_status`) list | the page refuses, naming the key |
| `NEEDINFO_SUBSTATUS` | **existing dashboard row** (idlist) — its **first** id is the default sub-status (expected: Awaiting Design Info) | the opportunity's current sub-status is pre-selected |
| `ORDER_SUBSTATUS_OPTIONS` | idlist: the sub-statuses reps may choose, in display order (Steve to choose) | every option of the field |
| `ORDER_OPP_STATUS` | id: the Won status, **if** Steve decides the page sets it | the status isn't written |
| `ORDER_PROJTYPE_MAP` | JSON `{"<quote type id>":"<project type id>"}`, one entry per `custbody_quote_type` value | no inference; the rep chooses |
| `ORDER_PROJTYPE_MIXED` | id: **UFH & Renewables** in `customlist_bund_proj_type` | no "mixed" inference |
| `PREPAY_TERMS` | **existing dashboard row** (idlist; `9`) — the same value the dashboard uses | no deposit shown |
| `ORDER_PARENT_OPP_FIELD` | field ID of the opportunity field holding a parent opportunity, if there is one | the order log's parent is this opportunity |
| `ORDER_EMAIL_TEMPLATES` | idlist: the email template internal IDs offered for the confirmation, in display order (Steve: `3198,4186,3182,4185,3185`). **FreeMarker templates only** — a legacy CRMSDK template can't be merged | the email switch is shown disabled: "No confirmation templates are set up (ORDER_EMAIL_TEMPLATES)." |

A malformed value (not an ID, bad JSON, not a field ID) is logged under `CreateOrderSL.Config` and treated as empty.

## Send Quote SL 2.2.0 — proposal email: account manager card

### Employee (read with one `search.lookupFields` on the Opportunity's `salesrep`)

| Field ID | Type | Purpose |
|---|---|---|
| `firstname` | Text (standard) | The first name on the CALL / EMAIL buttons. Empty → first word of the rep's name → CLICK TO CALL / SEND AN EMAIL |
| `custentity_employee_photo_link` | ⚠️ **Field type still unconfirmed** (not yet read from the field definition) | The account manager's photo in the email card. ✅ **Works with an absolute `https://` URL** — shown in the NetSuite message view (R18 E1). Used only if, trimmed, it is an absolute `https://` URL; anything else (empty, `http://`, relative, a file reference) → no photo. Audit log `SendQuoteSL.RepPhoto` says which and why |

### Email merge tags (`buildEmailBody()`)

| Tag | Value |
|---|---|
| `{{QUOTE_EMAIL_REF}}` | `custbody_quote_email_ref`, else the Opportunity title |
| `{{TRAN_ID}}` | Opportunity `tranid` |
| `{{SALES_REP_NAME}}` / `{{SALES_REP_EMAIL}}` / `{{SALES_REP_PHONE}}` | From `loadOpportunityData()` (unchanged): `salesrep` employee; phone prefers `custbody_sales_rep_phone`; fallbacks Your Account Manager / info@nu-heat.co.uk / 01404 540604 |
| `{{SALES_REP_FIRST_NAME}}` | *(2.2.0)* the first name above, **upper-cased** for the buttons |
| `{{SALES_REP_PHOTO_URL}}` | *(2.2.0)* the photo URL above; the photo row is omitted when there is none |
| `{{PROPOSAL_URL}}` | The generated Master Proposal URL |

All values are HTML-escaped; tags are substituted in one pass.

⚠️ Known cosmetic issue (not fixed): with **no sales rep** on the Opportunity, the card shows the label YOUR ACCOUNT MANAGER above the fallback name "Your Account Manager" — the label repeats.

## Update Opportunity SL 1.0.0 / 1.1.0 — phone call, email, customer objections, lists

### Lists and records (read at runtime by script ID — no internal IDs in code)

| Object | Script ID | Notes |
|---|---|---|
| Call Title list | `customlist_nh_call_title` | 10 standard titles; the page copies the chosen one into an editable Title. Shown in internal-ID order. Only the final text is stored (on the Phone Call) |
| Objection Group list | `customlist_nh_objection_group` | 7 groups; chips are grouped in group internal-ID order |
| Objection Type record | `customrecord_nh_objection_type` | Name = the objection; `custrecord_nhot_group` → Objection Group. 25 records |

### Customer Objection (`customrecord_nh_objection`) — one record per ticked type

| Field ID | Set to | Notes |
|---|---|---|
| `custrecord_nhobj_opportunity` | the Opportunity | parent (Communication subtab), mandatory |
| `custrecord_nhobj_type` | the ticked Objection Type | mandatory; validated against the Objection Type search |
| `custrecord_nhobj_quote` | the "About quote" Estimate, if chosen | validated: must be an Estimate on this Opportunity |
| `custrecord_nhobj_notes` | `<per-objection note>` + blank line + a context line (no note → just the context line). Context line *(1.1.0, D21)*: call on → `Call notes (<call date>): <call notes>`; call off and the email sent → `Email sent (<today>): <subject>`; otherwise `Logged via Update opportunity (<today>)` | mandatory — never empty; the only notes field — the context is duplicated deliberately so each objection stands alone |
| `custrecord_nhobj_raised_by` | the current user | |
| `custrecord_nhobj_raised_on` | **the call date**; *(1.1.0)* with the call off, today — the browser's date if within [server today, +1], else the server's | mandatory |
| `custrecord_nhobj_group` | — | ⚠️ **never set** — NetSuite sources it from the Type |
| `custrecord_nhobj_customer` | — | ⚠️ **never set** — NetSuite sources it from the Opportunity |

### Phone Call (standard) — ✅ field IDs confirmed (Sandbox U3, Sep 2026)

| Field ID | Set to |
|---|---|
| `title` | the Title box (max 99 — a deliberate cap, `CALL_TITLE_MAX`; our choice, not a proven NetSuite limit) |
| `message` | "What was discussed" (max 3,900) |
| `startdate` | the call date (a Date) |
| `status` | `COMPLETE` |
| `company` | the Opportunity's customer (`entity`) |
| `transaction` | the Opportunity — shows the call under the Opportunity's Communication › Activities (U3) |
| `assigned` | the current user |
| `contact` | the chosen contact, if any |

*(1.1.0)* No Phone Call is created when "Log a phone call" is switched off.

### Email (Update Opportunity SL 1.1.0) — sent with `email.send`, no new fields

| Item | Source |
|---|---|
| `author` | *(amendment 2)* the chosen sender: `me` → the current user; `rep` → the Opportunity's `salesrep`; `pe` → the Opportunity's `custbody_pe` (Employee). Read by the server with one `search.lookupFields` on the Opportunity (`entity`, `salesrep`, `custbody_pe`) |
| To | ticked contacts (their `email` from the opportunity's contact search), the customer's `email` (`search.lookupFields` on the customer), other addresses as typed — 1 to 10, de-duplicated |
| CC | the **current user**, if "CC me" (whoever the email is from; dropped if already in To). The chosen sender gets no automatic copy |
| `relatedRecords` | `entityId` = the opportunity's customer, `transactionId` = the opportunity (Communication › Messages) |
| Subject / headline | the "Subject and headline" box (default `An update on <tranid>`, max 120) |
| Sender card | **Employee** (one `search.lookupFields` on the chosen sender): `firstname`, `lastname`, `entityid` (name if both are empty), `email` (required), **`phone`** (the card phone for every sender — the same field Send Quote's card reads for the rep, Steve 1 Oct; no fallback, no switchboard), `isinactive` (rep / PE inactive → blocked), `custentity_employee_photo_link` (https only). No opportunity override — `custbody_sales_rep_phone` is **not** read. As the PE, the card's email line and EMAIL button show `design@nu-heat.co.uk` (Send Design's rule). ⚠️ **Send Design reads `officephone`** for the PE — a known difference, left as is |
| "From" options (GET) | per offered rep / PE, one `search.lookupFields` on the Employee: `email`, `isinactive` — offered only if active (`isinactive` true / `'T'` / `'true'` = inactive) and with an email |

### "Give us an update" button (Update Opportunity SL 1.2.0 / library 1.3.0) — no new fields here

Fields owned by the customer dashboard (`NS-Customer-Dashboard`, "Request an update" part A). Read only.

| Field | Record | Use |
|---|---|---|
| `custentity_cdb_link` | Customer | the customer's signed BASE dashboard link (written by the dashboard's customer UE / backfill). The email's button = this + `&a=update&opp=<opportunity ID>`. Its `t` payload `c<customerId>.v<version>` must name this customer at this version (`lib.cdbLinkMatches`, signature not checked) |
| `custentity_cdb_link_version` | Customer | the link version; empty = 0. A link of another version is "out of date" |
| `isinactive` | Customer | inactive → not offered (true / `'T'` / `'true'`) |
| `custentity_cdb_dashboard_contact` | Customer | the dashboard contact (Contact): an allowed recipient for an update request; its `email` read with one `search.lookupFields` on the contact |
| `isperson`, `firstname` | Customer | *(1.2.2)* the "Request an update" prefill: "Hi <firstname>," only when `isperson`; a company → "Hi," |
| `company` | Contact (join from the Opportunity's contact search, `lib.loadContacts`) | an opportunity contact is "the customer's own" only when its company is the opportunity's customer |

These customer columns ride on the page's existing customer `lookupFields` (with `email`) — *(1.2.1)* only
when `custscript_nuheat_updbtn_mode` gives the user the button (OFF → `email` only, as 1.1.1); the POST
repeats the lookup only for an allowed update request.

*(1.2.1)* Script parameter `custscript_nuheat_updbtn_mode` (Free-Form Text): `OFF` (empty / unknown / unreadable) · `ADMIN` (`roleId` `administrator`) · `ALL`. Posted *(1.2.2)*: `custpage_email_kind` = `write` | `update` (missing or anything else = `write`).

### Page fields posted (1.1.0)

| Field | Meaning |
|---|---|
| `custpage_call_on` | `T` / `F` — missing = on (a 1.0 page) |
| `custpage_email_on` | `T` / `F` — missing = off |
| `custpage_email_from` | *(amendment 2)* `me` \| `rep` \| `pe` — a code, never an employee ID; missing = `me`; anything else blocks the save |
| `custpage_email_subject`, `custpage_email_message` | the email (posted only while the section is on) |
| `custpage_rcpt_contacts` | comma list of contact IDs |
| `custpage_rcpt_customer`, `custpage_rcpt_ccme` | `T` / `F` |
| `custpage_rcpt_extra` | other addresses, as typed |
| `custpage_email_kind` | *(1.2.2; replaces 1.2.0's `custpage_email_updbtn`)* `write` \| `update` — missing or anything else = `write`. `update` = the "Request an update" email (button added by the server; message optional). Rechecked on the server |
| `custpage_today` | the browser's date, `yyyy-mm-dd` |
| `custpage_save_token` | the one-time save token (`N/cache`, PRIVATE, cache `nh_update_opp_save_guard`, 1 hour) |

## Doubled and misspelled field IDs — correct as written

NetSuite applies the `custbody_` / `custitem_` prefix a second time when a field is *created* with
a name that already begins with it. The doubled form is the real internal ID and must be used
verbatim in `getValue()` / `setValue()`. A separate case, `custbody_opp_site_adress`, is simply
misspelled in NetSuite.

**None of these are typos in the code. Do not "correct" them.** They do not throw when wrong —
`getValue()` returns empty and the dependent row renders blank, so the mistake is silent.

| Internal ID (correct) | Looks like it should be | Record | Used by |
|---|---|---|---|
| `custitemcustitem_quote_fab_1` … `_6` | `custitem_quote_fab_1`…`_6` | Item | `nuheat_quote_suitelet.js` — `loadItemCustomFields()` (~:863), `loadThermostatOptionItems()` |
| `custbodycustbody_quote_last_viewed` | `custbody_quote_last_viewed` | Estimate | `nuheat_analytics_sl.js` |
| `custbodycustbody_quote_view_count` | `custbody_quote_view_count` | Estimate | `nuheat_analytics_sl.js` |
| `custbody_opp_site_adress` | `custbody_opp_site_address` | **Opportunity** | quote page, Master Proposal, Send Quote SL |

> **How this was found the hard way.** v4.3.54 and v4.3.55 were both fixes for the same root cause:
> the fab fields were being read under their single-prefix names, so `getValue()` returned empty and
> **every main product card feature bullet was silently blank** across UFH, Heat Pump, Solar and
> Commissioning. Nothing errored. Always verify an internal ID at
> **Customization → Lists, Records & Fields → Item Fields**, and use the ID column, not the name.

> ⚠️ Related but distinct: these custom item fields are also **invalid as search columns** — they
> throw `SSS_INVALID_SRCH_COL` and abort the whole search. Use the two-step pattern: search with
> standard columns to get internal IDs, then `record.load()` per item to read the custom fields.

---

## BUS Grant — Suppak Line Items (v4.4.0)

The BUS (Boiler Upgrade Scheme) grant is **not** a NetSuite field. It is resolved at render time
from the **Suppak line item** on the Estimate by `nuheat_bus_grant.js`. Suppak is authoritative —
the grant is no longer keyed off "does this quote contain a Heat Pump line".

| Suppak line item (`itemName`) | Tier | Grant |
|---|---|---|
| `Suppak N1(R)HP` | standard | £7,500 |
| `Suppak N1(NB)HP` | standard | £7,500 |
| `Suppak BUS` | standard | £7,500 |
| `Suppak BUS - Uplift` | enhanced | **£9,000** |
| any other line beginning `Suppak…` | none | £0 — grant suppressed, logged as `BUS_UNMATCHED` |
| no Suppak line at all | none | £0 |

**Matching rules**

- The raw `itemName` is normalised first: last colon-delimited segment (so NetSuite's
  `"Parent : Child"` sub-item form works), whitespace collapsed, lowercased.
- Comparison is **exact array membership, never substring**. `'suppak bus - uplift'` therefore
  cannot be caught by the `'suppak bus'` entry, and no longest-match ordering is required.
  Do not change this to `startsWith` / `indexOf` — a future SKU could then silently match the
  wrong tier.
- Precedence: enhanced → standard → none. A non-qualifying Suppak line suppresses the grant **only**
  when no qualifying line is present; it never overrides one.

**Verifying the item names in Sandbox**

The exact string NetSuite returns for a Suppak line could not be confirmed from the repository —
there were zero occurrences of "Suppak" in the code, docs or git history when this was written.
Any Suppak line that matches no tier writes a `BUS_UNMATCHED` audit entry to the Script Execution
Log containing both the raw and normalised `itemName`. **Grep the log for `BUS_UNMATCHED` during
Sandbox testing** — if it appears, correct `BUS_STANDARD_ITEMS` / `BUS_ENHANCED_ITEMS` in
`nuheat_bus_grant.js` to the strings it reports.

**Where the resolved values travel**

| Consumer | Mechanism |
|---|---|
| Quote page | `nuheat_quote_suitelet.js` resolves once in `loadQuoteData()` → `quoteData.bus` |
| Master Proposal | `nuheat_send_quote_sl.js` resolves per Estimate → `busAmount` / `busRate` on the quote entry, via hidden sublist fields `custpage_bus_amount` / `custpage_bus_rate` |

---

## VAT — `custbody_quote_type` and its rate mapping (v4.5.0)

### Estimate (Transaction Body)

| Field ID | Type | Purpose |
|---|---|---|
| custbody_quote_type | List | Quote technology. Drives the VAT rate via `nuheat_vat_rates.js`, and the section grouping in the Master Proposal via `QUOTE_TYPE_MAPPING` in `nuheat_send_quote_sl.js`. |

> ⚠️ `getText()` on this list field is unreliable (a standing project rule). The Quote Suitelet reads
> it inside a try/catch and falls back to inferring the technology from the grouped line items,
> logging which route was used as `VAT_QUOTE_TYPE`.

### Raw list values → display name → VAT rate

`VAT_RATES` in `nuheat_vat_rates.js` is keyed on the **display name**, but callers hold the **raw**
list value. `normaliseQuoteType()` bridges the two, so either form resolves correctly.

| Raw `custbody_quote_type` value | Display name | VAT |
|---|---|---|
| `Heat Pump`, `Heat Pump (ASHP)`, `Heat Pump (GSHP)`, `Heat Pump (EAHP)` | Heat Pump | **0%** |
| `Solar` | Solar | **0%** ⚠️ assumed |
| `Heat Emitter`, `Full System`, `Full System (DFD)`, `Full System (DFD/DFP)`, `Multizone (DZM)`, `Extension (DXD)`, `UFH for Heat Pump (DFHD)` | Underfloor Heating | **20%** |
| anything unrecognised | *(unchanged)* | **20%** default + `VAT_RATE_UNMATCHED` logged |

**Why 0% / 20%.** UK VAT on heat pump installations is 0% under energy-saving materials relief;
underfloor heating is standard-rated at 20%.

> ⚠️ **Solar is an assumption.** It is set to 0% on the basis that solar thermal qualifies for the
> same relief as heat pumps. Only HP and UFH were specified. One-line change in `VAT_RATES` if wrong.

> ⚠️ **Unknown types default to 20%** — never under-charging — and write `VAT_RATE_UNMATCHED` to the
> Execution Log. If a new quote type is added to the NetSuite list, add it to **both**
> `QUOTE_TYPE_ALIASES` in `nuheat_vat_rates.js` and `QUOTE_TYPE_MAPPING` in `nuheat_send_quote_sl.js`.

### ✅ The tax codes were the root cause — corrected 20 August 2026

The scripts do not read the Estimate's tax codes — they derive the rate that *should* apply. Heat
pump quotes were showing 20% because **the tax codes on those Estimate lines were wrong in
NetSuite**. Those tax codes have since been corrected in Production, so the derived figure and
NetSuite's `taxtotal` now agree.

Where the two still differ by more than 1p, `VAT_MISMATCH` is logged with the Estimate ID and both
amounts. With the source data correct, **a new entry means something has regressed at source** —
investigate it as a live defect rather than treating it as a backlog item.

---

**Last Updated:** 20 August 2026
