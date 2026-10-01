## [Update Opportunity SL v1.1.0, library v1.1.0, Send Quote SL v2.3.1, Opportunity UE v1.4.0] — 1 October 2026
**Status:** ⏳ Pending test (U11–U19; U1–U10 still apply)
**Components:** `nuheat_opp_update_lib.js`, `nuheat_send_quote_sl.js` (extraction only),
`nuheat_update_opp_sl.js`, `nuheat_opportunity_ue.js`, `test/update-opp.js`, `test/send-quote-opp-update.js`

**Why:** a rep often updates an opportunity without a phone call (an email, or just a date), and wants to
send a short personal email from the same page. 1.0.0 forced a call on every save.

### Changed — the email layout moves to the library (Send Quote 2.3.1, no behaviour change)
- `lib.emailShell(slots)`, `lib.emailRepCard(rep, label)`, `lib.emailButton()`, the photo / first-name
  helpers, the email constants, `EMAIL_RE`, `parseEmails` (comma-only) and `invalidEmails` move unchanged
  from Send Quote to the library. Send Quote keeps its copy, subject, author (the opportunity's sales
  rep), phone sourcing (`custbody_sales_rep_phone` first), rep lookup, page and page script.
- The proposal email is **byte-identical** to 2.3.0: test H1 compares four SHA-256 fixtures captured at
  `9742aed` before the move, and the committed `docs/samples/send-quote-email-2.2.0.html`.
- The library gains `N/email` and `N/runtime` (not `N/render`), `sendEmail()` (never throws) and
  `pendingChanges()` — the pure half of `updateFields()`, which now uses it.

### Added — Update Opportunity 1.1.0
- **"Log a phone call" switch** (on). Off: no phone call, the call fields are disabled, not posted and not
  validated, and the banner has no call line.
- **"Send an email" section** (switch, off): subject = headline (`An update on <tranid>`, max 120), a
  plain-text message (max 10,000), recipients (contact ticks, Customer, other addresses, CC me; 1–10 To
  addresses, rebuilt on the server). Sent **from you**, logged on the customer and the opportunity
  (Communication › Messages), in the branded layout with your own contact card: photo, name, phone,
  email, CALL / EMAIL buttons, the sign-off "Best wishes," and the footer "Any questions at all, just
  reply to this email – it comes straight to me." No attachments; no templates yet (1.2).
- Save order: call → **email** → objections → opportunity fields last. A failed call still stops
  everything; a failed email does not (amber banner "The email was not sent.").
- **Objection notes** are always optional; the saved note always ends with a context line —
  `Call notes (…): …`, `Email sent (<today>): <subject>`, or `Logged via Update opportunity (<today>)`.
  With the call off, "raised on" is today in the UK (the browser's date, checked by the server).
- **Something to save:** Save stays disabled until there is a call, an email, an objection or a changed
  field. Next contact is still required on every save.
- **Save guard:** pressing Save again on a resubmitted page (browser Back, refresh) saves nothing and
  shows **Already saved**.
- Section numbers: 1 Log the call · 2 Send an email · 3 Update the opportunity · 4 Log any objections.
  The objections help text is now "Optional. Add a note to any objection if it helps."

### Added — Opportunity UE 1.4.0 banner
- "Email sent to N recipient(s)" / "The email was not sent."; titles **Email sent** / **Email not sent**
  when the email was the only thing done; **Already saved** for a duplicate save. Fixed words only — never
  the subject or an address. Send Quote banners are unchanged.

### Tests
- `test/send-quote-opp-update.js`: H1 (6 assertions) — 400 in total, every earlier assertion unchanged.
- `test/update-opp.js`: `N/email` and `N/cache` stubs, `post()` defaults for the new fields; T1 and T3
  adjusted for the new section numbers; T18–T51 added — 293 in total.

### Fixed — amendment 1 (review of 1 Oct; still 1.1.0)
- **A1:** a section that was switched off when the page was posted (its inputs disabled, so not posted)
  now re-renders after a validation failure exactly as a fresh page: the call date is filled with today
  again (`data-default`), the other call inputs blank; the email subject is `An update on <tranid>`, the
  message blank and no recipient ticked. A section that was on is restored as posted (T36).
- **A2:** the email body is built inside its own try/catch. If building it throws, the email counts as
  failed (`UpdateOppSL.Email` at error level, `nsqe=fail`, `nsq=warn`, no `email.send`) and the
  objections and fields are still written — previously the error escaped after the phone call was
  saved (T37).

### Changed — amendment 2 (Steve, after U11–U19 passed; still 1.1.0)
- **"From"** is the first field in "Send an email": **Me**, the opportunity's **Sales rep** or its
  **Project engineer** (`custbody_pe`). Rep and PE appear only when set, with an email address, and not the
  same person as an earlier option; the default is Me. The page posts only `me` / `rep` / `pe`; the server
  finds the employee itself (one lookup with the customer) and blocks the save if that person is gone or
  has no email address.
- The email's **author**, card, sign-off and footer name are the chosen person, so replies go to them. As
  the project engineer, the card's email line and EMAIL button show **design@nu-heat.co.uk** (Send Design's
  rule); no PE phone → no CALL button. **CC me** is always you; the chosen sender gets no automatic copy.
- The page note follows the choice: "Sent as Sales rep (…), with their contact details. Replies go to them."
- Library: `loadSender(logKey, [employeeId])`. Tests T38–T46; T28's "no opportunity phone override"
  check now allows the opportunity lookup to read `salesrep` / `custbody_pe`.

### Changed — amendment 3 (Steve, 1 Oct; still 1.1.0)
- **Card phone confirmed: the employee `phone` field** for every sender — Me, the sales rep and the project
  engineer — the same field Send Quote's card reads for the rep (`loadSalesRepData`). No code change; no
  fallback, no switchboard number; a blank `phone` means no CALL button and an email-only line. The
  opportunity override `custbody_sales_rep_phone` (read first by Send Quote) is **not** read here — sender
  details come from the employee record only. Send Design reads `officephone` for the PE — a known
  difference, left as is. (An earlier push of this amendment switched to `officephone`; that is reverted.)
- **Inactive rep or PE:** not offered in "From" (`isinactive` read in the same email check at GET), and
  blocked on save: "<Sales rep / Project engineer> is no longer active, so the email can't be sent from
  them." Nothing written; the save token is kept. Me is never blocked for this.
- Tests T47–T51; three lookup-column assertions now include `isinactive` (T22, T28, T38). Governance
  unchanged: 222 units worst case, 53 at page load.

### Deployment
- Upload **`nuheat_opp_update_lib.js` first**, then `nuheat_send_quote_sl.js` and `nuheat_update_opp_sl.js`,
  then `nuheat_opportunity_ue.js`. No new script parameters or records.

---

## [Send Quote SL v2.3.0 (and v2.2.1)] — 29 September 2026
**Status:** ⏳ Pending Sandbox testing (R19)
**Components:** `nuheat_send_quote_sl.js`, `test/send-quote-opp-update.js`

**Why:** sending was noticeably slower on opportunities with several quotes. Send re-ran
`searchRelatedQuotes()`, which does a full `record.load` (pricing plus the BUS line loop) of **every**
Estimate on the opportunity, including the ones left out. The forecast writes were already change-only.

### Added — `SendQuoteSL.Timing` (2.2.1, its own commit, no behaviour change)
- One audit line per page load: `GET Opportunity <id> — ms: opportunity= quotes= render= total= | quotes=N | rendered`.
- One per send: `POST … — ms: rebuild= proposal= email= forecast= oppUpdate= total= | quotes= selected= forecastWrites= | sent`.
  A failed send logs the phases it reached, then `rerender=`, and `failed: <phase>`.

### Changed — Send loads only the selected quotes (2.3.0)
- The search runs alone first (same filters and columns, no record loads). The posted selection is
  validated against it — a quote not on the opportunity is rejected before anything is loaded.
- Only the Main and Additional quotes are then fully loaded, by the same code as before. The quote
  objects handed to the Master Proposal are identical to 2.2.0 (tested against a 2.2.0 capture).
- Left-out quotes: their current Include in Forecast comes from one `search.lookupFields` each
  (1 unit). Missing or empty → false; a failed lookup leaves it unknown, so it is not written.
- Forecast targets, the write-only-on-difference rule and the order (Estimates, then the opportunity,
  sub-status never) are unchanged. Page load, preview and the re-render after a failed send still
  load every quote.
- Governance for 6 quotes, 1 Main + 1 Additional: Estimate loads 6 → 2 (60 → 20 units), plus 4 lookups.

### Added — "In forecast" tag on each quote card (2.3.0)
- Under the price: **In forecast** or **Not in forecast** (muted), from the value the page already
  loads. When the chosen role would change it: **"Not in forecast → will be included"** /
  **"In forecast → will be excluded"** (Main → included, anything else → excluded), updated live.
- No tag when the forecast field fails the F6 type check.

### Tests
- S1–S7 (394 assertions in total). G1's snapshot now removes exactly the tag additions before hashing,
  so it still proves the rest of the page is byte-identical to 2.0.4.

---

## [Send Quote SL v2.2.0] — 29 September 2026
**Status:** ⏳ Pending Sandbox testing (R18, E1–E6)
**Components:** `nuheat_send_quote_sl.js` (`buildEmailBody()` rewritten, `loadRepCardData()` new, one line in
`sendProposalEmail()`), `test/send-quote-opp-update.js`, `docs/samples/send-quote-email-2.2.0.html` and
`-stripped.html` (new reference renders)

The proposal email is redesigned ("Send Quote redesign" artboards 5 and 6) and rebuilt so it stays
centred and single-column in viewers that strip every `style` attribute **and** every `<style>` block
(NetSuite's message view).

### Changed — layout
- One centred 600 px column: logo · purple header · hero · Your quote · Why choose Nu-Heat? (2 × 2 on
  desktop, stacked on phones) · What's next? with an Account Manager card · footer.
- Layout, width, alignment and colour are carried by HTML attributes (`width`, `align="center"` on every
  `td`, `bgcolor`, `valign`, `<font color>`); CSS only adds polish and the phone stacking. No floats,
  no percentage-width side-by-side "col" tables; two-up content is one row of two `td width="50%"`.
- Every button is a bulletproof table with exactly one `[if !mso]` / `[if mso]` pair. No `display:none`
  wrapper anywhere except the preheader span.
- The footer's logo, social icons and links are unchanged; its markup is rebuilt the same way (one row
  of five 42 px cells instead of percentage spacer cells).

### Changed — copy
- New header label **YOUR QUOTE IS READY**; the project line is now one line,
  **Project: {ref} · {tranid}**, with "· {tranid}" in a no-wrap span.
- "You can view your tailored quote(s) below. This is provided subject to our Terms and Conditions." →
  **"Open your quote online to see your system, prices and options. It's provided subject to our Terms
  and Conditions."** (same T&C link).
- Button **VIEW YOUR QUOTE(S) HERE** → **VIEW YOUR QUOTE**.
- "To discuss your quote or place your order please contact your Account Manager below." →
  **"To discuss your quote or place your order, get in touch with your Account Manager."**
- New Account Manager card: photo (if any), **YOUR ACCOUNT MANAGER**, name, phone · email, and buttons
  **CALL {FIRST NAME}** / **EMAIL {FIRST NAME}** (were CLICK TO CALL / SEND AN EMAIL, which remain the
  fallback when there is no first name).
- New footer line: **"You're receiving this because you requested a quote from Nu-Heat."**
- **Removed:** the "Nu-Heat team" image and the closing line "If you have any questions, you can contact
  your Account Manager, …".
- Unchanged: the preheader, the four Why choose Nu-Heat? tiles (icons, titles, texts), the Calibri font
  link, the T&C, social and image URLs, sender, subject, recipients and `relatedRecords`.

### Added — account manager first name and photo
- `loadRepCardData()`: one `search.lookupFields` on the Opportunity's `salesrep` (the same employee
  whose name, email and phone the email already shows) for `firstname` and
  `custentity_employee_photo_link`. No sales rep → no lookup. A lookup failure costs the photo and the
  first name only, never the send.
- First name: `firstname`, else the first word of the rep's name, else CLICK TO CALL / SEND AN EMAIL.
- Photo: used only if, trimmed, it starts with `https://` (and has no spaces, quotes or angle brackets);
  otherwise the photo row is left out. Audit log `SendQuoteSL.RepPhoto` once per send: used, or skipped
  and why.
- `tel:` links now carry digits and `+` only (were the escaped phone text, spaces included). A phone
  with no digits gets no CALL button. Merge tags are now substituted in one pass (a value can no longer
  inject another tag, and `$&` in a value is literal).

### Tests
- N1–N9 in `test/send-quote-opp-update.js` (345 assertions in total): fully stripped view, Outlook view,
  agreed copy, merge tags, first name, photo, escaping, a 120-character project name, no `display:none`.
- Changed M-series assertions (old design): M1/M2 button texts; M4 one container instead of two.

---

## [Send Quote SL v2.1.1] — 29 September 2026
**Status:** ⏳ Pending Sandbox testing (R17)
**Components:** `nuheat_send_quote_sl.js` (`buildEmailBody()` only), `test/send-quote-opp-update.js`,
`docs/samples/send-quote-email-2.1.1.html` (new reference render)

⚠️ **Long-standing, not caused by the 2.x work:** `buildEmailBody()` was byte-identical from `539edc5`
(before any 28 Sep work) through 2.1.0. No copy, colour, image, link or merge tag changed.

### Fixed — "CLICK TO CALL" and "SEND AN EMAIL" appeared twice
- Their Outlook fallbacks were wrapped in `<div style="display:none; mso-hide: none;">`. Viewers that
  strip inline styles (NetSuite's message view, some webmail) showed both copies. They now use
  `<!--[if mso]> … <![endif]-->`, as the VIEW YOUR QUOTE(S) button has since v1.4.1. No other such
  wrapper remains; the hidden preheader span is unchanged.

### Fixed — the email sat against the left edge
- Both `main-container` tables were `width="100%" style="max-width:600px;"`. Once a viewer strips
  styles (inline **and** `<style>` blocks — with only inline styles gone, the head rule `.width600
  { width: 600px }` still held them), they stretched full width and the 600 px content sat at the left.
  Now `width="600" style="width:100%;max-width:600px;"`: styled clients unchanged, unstyled ones centre a
  600 px column. The mobile rules (`.width600` / `.main-container { width: 100% !important; }` under
  599 px) still force full width.

### Tests
- M1–M4 (228 assertions): each button exactly once in a stripped non-Outlook view and in an Outlook view;
  no `display:none` + `mso-hide` wrapper; both containers `width="600"`. M1, M3 and M4 fail on `main`
  (2 × each contact button; containers `100%`) and pass on this branch.

---

## [Update Opportunity SL v1.0.0 / Opportunity Update Library v1.0.0 / Send Quote SL v2.1.0 / Opportunity UE v1.3.0 / Opportunity CS v1.2.0] — 29 September 2026
**Status:** ⏳ Pending Sandbox testing (U1–U10)
**Components:** `nuheat_opp_update_lib.js` (NEW), `nuheat_update_opp_sl.js` (NEW), `nuheat_send_quote_sl.js`,
`nuheat_opportunity_ue.js`, `nuheat_opportunity_cs.js`, `test/update-opp.js` (NEW), `test/send-quote-opp-update.js`

⚠️ **Upload `nuheat_opp_update_lib.js` FIRST** — both Suitelets import it and fail at load time without it.
New script record: `customscript_nuheat_update_opp_sl` / `customdeploy_nuheat_update_opp_sl` (execute as
the current role, Log Level Audit).

### Added — Update Opportunity (SL 1.0.0)
- A second VIEW-only button, **Update opportunity**, opens a page in the Send Quote style:
  **1 Log the call** (standard title from `customlist_nh_call_title` copied into an editable Title, call
  date, optional contact, notes) → **2 Update the opportunity** (the shared fields; **Next contact
  required**) → **3 Log any objections** (chips by group from `customrecord_nh_objection_type`, optional
  note each, optional About quote).
- **Save** validates everything first, then writes **phone call → one Customer Objection per tick →
  Opportunity fields last**, and returns to the Opportunity with a banner. A failed phone call stops the
  save ("Nothing was saved", entries kept); a failed objection or field update gives an amber banner.
- Next contact is checked **against the record** (`search.lookupFields`), not the posted originals.
- Objection notes: `<note>` + blank line + `Call notes (<call date>): <call notes>`; raised on = the call
  date. `custrecord_nhobj_group` / `_customer` are never set (NetSuite sources them).
- Phone Call field IDs and the 99-character title limit are ⚠️ **assumed** until Sandbox U3.
- Never writes forecast flags or `custbody_opportunity_sub_status`.

### Added — Opportunity Update Library (1.0.0)
- Shared by both Suitelets: field definitions and display order, `prepareFields` / `updateFields`
  (unchanged logic, per-page rules and log key), `validateRequired`, `readPostedUpdateValues`,
  `fieldRedirectParams`, the date and text helpers, the page CSS, header, update section and error page,
  `loadOppPageBase` (with contacts), and `PAGE_SCRIPT_CORE` / `pageScript()` with a documented hook contract.

### Changed — Send Quote SL 2.1.0 (no behaviour change)
- The code above moved to the library. **Byte-identical HTML to 2.0.4** across eight page states (hashed
  in the test, script block included); call sequence, logs, writes and redirects also compared equal.
- Send Quote keeps its own page script — its copy of the changed-marker logic is a known duplication
  (`PAGE_SCRIPT_CORE` is canonical); migrating it is a separate change with its own browser test.

### Changed — Opportunity UE 1.3.0 / CS 1.2.0
- Second button; banner source `nsqs` (`send` | `upd`, default `send` — Send Quote banners unchanged, compared
  against the real 1.2.1); for `upd`: "Call logged: <title>" (only the call linked to this opportunity),
  "<n> objections logged", "Objections not saved: <names>", no proposal link.
- CS: `openUpdateOppSuitelet()`, same tab.

### Governance
- Update Opportunity page load **50** units; a save with 25 objections **206** units in the test ledger
  (validation 31: type, estimate and contact searches 10 each + customer lookup 1 [+1 for the Next contact
  lookup when it is left blank]; call 15; 6 per objection = 150; Opportunity write 10). A failed save's
  re-render adds a page load (50). Well inside the 1,000 limit.

### Tests
- `test/update-opp.js` (new): 93 assertions — T1–T17.
- `test/send-quote-opp-update.js`: 217 assertions. Changed only where agreed: the library loader line, B3
  retargeted at the library, and A13 / B14 / B17 for the second button; new F1 (header decode) and G1
  (byte-identical render).

---

## [Send Quote SL v2.0.4] — 29 September 2026
**Status:** ⏳ Pending Sandbox testing (first commit of the Update Opportunity PR)
**Components:** `nuheat_send_quote_sl.js`, `test/send-quote-opp-update.js`

### Fixed — header title decode
- The page header's opportunity title went through `stripTags()` without decoding, so an entity-encoded
  title (`&lt;b&gt;`) showed raw entities — the same defect 2.0.3 fixed on the quote cards. It now goes
  through `cleanCardText()` (decode → strip → collapse) and `escapeHtml()` once.
- `TESTING_GUIDE.md` R12 named SL 2.0.2 after 2.0.3 shipped; corrected.

---

## [Send Quote SL v2.0.3] — 28 September 2026
**Status:** ⏳ Pending Sandbox testing (amendment 5 to PR #28)
**Components:** `nuheat_send_quote_sl.js`, `test/send-quote-opp-update.js`

Sandbox (28 Sep): R15 (Expected close) **passed**. Forecast flags are "not quite working as expected" —
⚠️ **open, parked**; no forecast code changed here.

### Changed — quote card text
- **Line 1** (bold): `tranid · description` — the title is **no longer shown** on the card (it repeated
  the description). Empty description → the cleaned title; both empty → `tranid` alone (the search's
  `'(Untitled)'` placeholder is not used on the card). Wraps to two lines at most, full text on hover.
- **Line 2** (muted, one line): `Created <date>` · quote type (the raw value, e.g. `Full System (DFD)`) ·
  `BUS grant £7,500 applied` — each only when present. The date is NetSuite's `datecreated` text with the
  time removed, so it is already in the user's own date format; no parsing, no new lookups.

### Fixed — double encoding
- Titles and descriptions can arrive entity-encoded (`&lt;b&gt;Ground Floor&lt;/b&gt;`). `stripTags()`
  found no tags and `escapeHtml()` encoded them again, so the card showed `&lt;b&gt;`. Card text is now
  `decodeEntities()` → `stripTags()` → collapse whitespace → `escapeHtml()` once. Decode before strip,
  never after.

### Unchanged
- The quote objects sent to the Master Proposal (raw `title` / `description`; the 1.8.0 shape fixture
  still matches). Forecast logic, write order, `enableSourcing`.

### Tests
- 207 assertions (E1–E8). B2 changed: it asserted the title on the card.

---

## [Send Quote SL v2.0.2 / Opportunity UE v1.2.1] — 28 September 2026
**Status:** ⏳ Pending Sandbox testing (amendment 4 to PR #28)
**Components:** `nuheat_send_quote_sl.js`, `nuheat_opportunity_ue.js`, `test/send-quote-opp-update.js`

Sandbox (28 Sep): the 2.0.1 reorder (forecast flags first, Opportunity last) **fixed the Status revert**.

### Added — Expected close date
- Fifth update field: **Expected close** — standard Opportunity field `expectedclosedate` (Date), key
  `close_date`. Same rules as the other dates: runtime type check (hidden and audit-logged if not a
  date), native picker posting `yyyy-mm-dd` pre-filled from the date's own parts, written only when
  changed and never when blank, in the single Opportunity `submitFields` that is still the last write.
- Section order: **Status, Build stage, Expected close, Next contact, Est. delivery date**
  (`OPP_UPDATE_DISPLAY_ORDER`). `OPP_UPDATE_FIELDS` keeps its processing order with the new field
  appended, so posted key lists and redirect parameters only gain `close_date`.
- Layout: grid columns of at least 200 px — five in a row at the page's 1120 px (≈203 px each),
  wrapping onto a second row when narrower.
- **Opportunity UE v1.2.1:** `close_date` → "Expected close" added to `BANNER_FIELDS`; without it the
  banner would silently drop the change.

### Unchanged
- Forecast logic, the write order and `enableSourcing`.

### Tests
- 190 assertions (D1–D7): pre-fill, display order, type mismatch, round trip in three time zones,
  bad / unchanged / blank dates, same single `submitFields` still last, banner text from the record.

---

## [Send Quote SL v2.0.1] — 28 September 2026
**Status:** ⏳ Pending Sandbox testing (amendment 3 to PR #28)
**Components:** `nuheat_send_quote_sl.js`, `test/send-quote-opp-update.js`

### Fixed — a Status change did not stick (suspected cause)
- **Sandbox, 2.0.0:** from Quoted, choosing "In Negotiation – Warm" left the Opportunity at Quoted; from
  Def Order, choosing Quoted left Def Order. 1.8.0 had worked (S4).
- **Suspected cause:** 2.0.0 added forecast writes (`submitFields` on each Estimate whose
  `includeinforecast` changes) and ran them **after** the Opportunity update. An Estimate carries its own
  Status, and saving an Estimate linked to an Opportunity can push that (old) Status back onto the
  Opportunity.
- **Change:** `updateForecastFlags()` now runs **before** `updateOpportunityFields()`, so the Opportunity
  update is the last record write. Both still run only after a successful email and stay independent.
- **Not changed:** `enableSourcing` (the second suspect). Steve's system-notes check decides.
- ⚠️ The reorder only matters in sends where at least one forecast flag changes. If Status still reverts
  in a send where **no** Estimate was written, the cause is elsewhere (see R13).

### Changed — date pickers
- Next contact and Est. delivery date are `<input type="date">` (the browser's native picker). They post
  `yyyy-mm-dd`, validated as a real calendar date and written as `new Date(y, m - 1, d)`; anything else
  is skipped and audit-logged. Pre-fill and hidden originals are `yyyy-mm-dd` built from the record Date's
  own parts (never `toISOString()`); the `format.format` text is kept for "Changed · was …".
- The user-format `format.parse` path is **removed** — nothing posts the user's format any more (a page
  restored after an error re-renders the posted `yyyy-mm-dd`).
- Note: the picker's display order follows the browser's UI language, not NetSuite's date preference.

### Tests
- 160 assertions. Order now generate → email → forecast → field update → redirect; the Opportunity write
  is asserted to be the last record write; dates round-trip with no day shift under Los Angeles,
  Auckland and UTC; `2026-02-30`, `abc` and user-format dates are rejected; unchanged and blank dates are
  not written.

---

## [Send Quote SL v2.0.0 / Opportunity UE v1.2.0 / Opportunity CS v1.1.0] — 28 September 2026
**Status:** ⏳ Pending Sandbox testing (amendment 2 to PR #28; supersedes the unreleased 1.8.0 / 1.1.0)
**Components:** `nuheat_send_quote_sl.js`, `nuheat_opportunity_ue.js`, `nuheat_opportunity_cs.js`,
`nuheat_send_quote_cs.js` (header note only — detached), `test/send-quote-opp-update.js`

No changes to `nuheat_master_proposal.js` — its inputs keep their exact shape.

### Changed — the Send proposal page (SL 2.0.0)
- **Redesigned** as one inline-HTML body inside the serverWidget form (NetSuite chrome kept): header
  with back link and status, **1 Choose quotes** (Leave out / Main / Additional per quote; tag-stripped,
  escaped titles; one-line description; inc- and ex-VAT prices; "View" link), **2 Send to** (To tags,
  contact picker, CC/BCC), **3 Update the opportunity** (the four 1.8.0 fields with "Changed · was …"
  markers) and a sticky footer (live summary, Cancel, Preview, Send proposal).
- **Every quote starts at Leave out** unless there is exactly one, which starts at Main.
- No native buttons, sublists or client script. A static inline script reads `data-` attributes and
  submits NetSuite's `main_form`. `nuheat_send_quote_cs.js` is **detached**, kept for reference.

### Security
- **The page posts only `{ estimateId: role }`.** The Suitelet rebuilds every quote from
  `searchRelatedQuotes()` for both send and preview; client-supplied prices are gone. An ID that is not
  one of the Opportunity's quotes rejects the request. `toProposalQuote()` reproduces the pre-2.0
  sublist round trip exactly (fixture captured from 1.8.0 in the test suite).

### Added
- **`updateForecastFlags()`** — after a successful email, sets Estimate `includeinforecast` (⚠️ assumed
  ID, type-checked at runtime) true for Main and false otherwise, on the quotes the page showed, only
  where it differs; one `submitFields` per Estimate, failures isolated and reported.
- **Back to the Opportunity** — `redirect.toRecord` (VIEW, same tab) with code-only parameters.
  **Opportunity UE v1.2.0** shows a green "Proposal sent" or amber "wasn't fully updated" banner built
  from the record; expires after 300 s; fails closed.
- **Opportunity CS v1.1.0** opens the Suitelet in the same tab.

### Fixed
- **Probability now follows Status**: `enableSourcing: true` on the Opportunity write only when Status
  changed (1.8.0 Sandbox S5 found it stale with sourcing off).

### Changed — failure handling
- Validation, generation and email failures **re-render the page** with an error panel and the user's
  selections, addresses and field values restored; nothing further is written. ⚠️ If the email fails,
  the Master Proposal has already saved the file and written the proposal URL / sent date (before the
  email, as since v1.6) — the panel says so.

### Removed
- `showSuccessPage()` and its panel, the sublists, `buildTwoColumnTopHTML()`, `buildInstructionsHTML()`,
  `buildFormCSS()`, all `clientScriptModulePath` assignments.

### Governance (Suitelet, 1,000 units)
Standard unit costs: transaction load / submitFields 10, entity load 5, search page 10, file save 20,
file load 10, email send 10.
- **Per send (POST):** quote rebuild 10 + 10 × quotes on the Opportunity; Master Proposal 60 (Opportunity
  10, customer 5, employee 5, file save 20, file load 10, proposal-URL write 10); email 30 (a second
  `loadOpportunityData()` 20 + send 10); Opportunity field write 10 when anything changed; 10 per forecast
  flag that changes. **≈ 110 + 10 × quotes + 10 × flags changed** — five quotes, all flags changing: ≈ 210.
- **Per preview:** quote rebuild 10 + 10 × quotes, plus `generatePreviewHTML()`'s `loadOpportunityData()` 20.
  **≈ 30 + 10 × quotes** — five quotes: ≈ 80 (was ≈ 20 before 2.0.0, when the browser supplied the prices).
- **Page load (GET):** unchanged from 1.8.0. A failed send's re-render reuses the POST's quotes (≈ 21 more).

### Tests
- `node test/send-quote-opp-update.js` — 133 assertions: 1.8.0 field rules carried forward (A1–A13)
  and the 2.0.0 brief's B1–B19.

---

## [Send Quote SL v1.8.0 / Opportunity UE v1.1.0] — 28 September 2026
**Status:** ⏳ Pending Sandbox testing
**Components:** `nuheat_send_quote_sl.js`, `nuheat_opportunity_ue.js`, `nuheat_send_quote_cs.js` (rename only),
`test/send-quote-opp-update.js` (new)

No changes to `nuheat_master_proposal.js` — the existing proposal-URL write
(`updateOpportunityWithProposalUrl()`) stays where it is, before the email.

### Added — update the opportunity when a proposal is sent
- **"Update opportunity" field group** on the Send Quote form (only when quotes exist) with four
  optional native fields, pre-populated from the Opportunity:

  | Form field | Opportunity field | Type |
  |---|---|---|
  | `custpage_upd_entitystatus` | `entitystatus` (Status) | SELECT |
  | `custpage_upd_next_contact` | `custbody_next_contact` (Next contact) | DATE |
  | `custpage_upd_del_date` | `custbody_opp_del_date` (Est. delivery date) | DATE |
  | `custpage_upd_build_stage` | `custbody_build_stage` (Build stage) | SELECT, blank first option |

- SELECT options are read **from the Opportunity itself** (`getField().getSelectOptions()` on a
  dynamic load), so no list or internal IDs are in code. A field is **not shown** (audit-logged under
  `SendQuoteSL.OppUpdate`) if its options cannot be read, if NetSuite reports a type other than the
  one assumed, or — for Status, which has no blank option — if the current value is not among the
  options (the dropdown would otherwise default to its first entry and an untouched submit would
  change the status).
- **`updateOpportunityFields()`** runs after `generateMasterProposal()` **and a successful
  `email.send`**. Only changed, non-blank values are written, in one `record.submitFields`
  (`enableSourcing: false`, `ignoreMandatoryFields: true`), dates as `Date` objects. Nothing changed
  → no write. It never throws: a failure shows a warning on the success page naming the fields to set
  by hand. If the email failed, nothing is written.
- **Success page** reports the outcome in a new "Opportunity update" panel.

### Changed
- The unconditional "The Opportunity record has been updated with the proposal URL" is now
  "Proposal link saved to the opportunity." — always true by the time the page renders, because a
  failed proposal-link write goes to the error page.
- The existing Opportunity `record.load` in `showQuoteSelectionForm()` is now `isDynamic: true`
  (required for `getSelectOptions()`). Same 10-unit cost; the values it reads are unchanged.
- **Opportunity UE v1.1.0:** the "Send Quote" button is added in **VIEW mode only**. With the record
  open in EDIT, the Suitelet's write followed by the user's save would fail with "record has been
  changed" or silently overwrite the Suitelet's values.
- **Client script renamed** `nuheat_send_quote_cs (1).js` → `nuheat_send_quote_cs.js` to match the
  File Cabinet file and `clientScriptModulePath`. Content unchanged; stays v1.4.0; **no re-upload**.

### Deliberate
- `custbody_opportunity_sub_status` is **never** written — some values create Design Instruction rows.
- Write after the email, never before, never blocking it. A blank never clears a field.
- All status options the record offers are shown, closed ones included; the role's own permissions
  (the deployment runs as the current role) govern what can be set.

### Tests
- `node test/send-quote-opp-update.js` — first committed test in the repository. Loads the real
  Suitelet and Opportunity UE under stubbed `N/*` modules; 14 scenarios.

### Governance (per Generate & Send)
- GET: unchanged (the dynamic load replaces the standard one).
- POST: + one Opportunity `submitFields` (10 units) only when something changed, + one
  `search.lookupFields` (1 unit) for display text when a SELECT changed.

---

## [Quote Suitelet v4.6.0 / Master Proposal v1.8.3] — 18 August 2026
**Status:** ✅ Live in Production — deployed 20 August 2026
**Components:** `nuheat_quote_suitelet.js`, `nuheat_master_proposal.js`

No changes to `nuheat_bus_grant.js`, `nuheat_vat_rates.js`, `nuheat_send_quote_sl.js` or
`nuheat_send_quote_cs (1).js` — Phases 2–5 are untouched, and there are no new File Cabinet upload
ordering concerns beyond those already documented.

### Fixed — site address never rendered on the quote page
The "Site address" row **already existed** in `renderHeader()`, already conditionally rendered, and
already in the right place between "Customer name" and "System reference". It was invisible because
the value was read from the wrong record:

```js
// pre-v4.6.0 — custbody_opp_site_adress is an OPPORTUNITY field
const projectAddress = estimate.getValue({ fieldId: 'custbody_opp_site_adress' }) || …
```

`custbody_opp_site_adress` lives on the **Opportunity** — the `opp_` prefix is the clue, and
`FIELD_REFERENCE.md` documents it as such. Reading it off the Estimate returned empty every time, so
the row was permanently suppressed.

`loadQuoteData()` now loads the Opportunity (whose ID it already extracts for file naming) and reads
the field from there, mirroring `nuheat_master_proposal.js:463-467` and
`nuheat_send_quote_sl.js:415-419`:

- Wrapped in try/catch — **a missing or unreadable Opportunity can never break the page**; the row
  simply stays hidden.
- The two Estimate-level fallbacks are **kept**, after the Opportunity value, in case some Estimates
  carry their own. Order matters: Opportunity first.
- Value is `.trim()`ed, so a whitespace-only field still hides the row rather than rendering an
  empty label.
- Logged as `SITE_ADDRESS` with the Opportunity ID and resolved value.
- ⚠️ The field ID is misspelled in NetSuite — **`adress`, one `d`**. That is the real ID; not a typo
  to fix.

### Changed — label and section header
- **`Project address:` → `Site address:`** on the quote page, matching the Master Proposal
  (`nuheat_master_proposal.js:729`). The two documents should agree.
- **`Recommended Solutions and Costs` → `Your solutions and costs`** in
  `renderRecommendationsHeader()`. **Visible text only** — the section ID stays `recommendations`,
  as do `toggleSection('recommendations')`, the `recommendations-content` / `recommendations-icon`
  element IDs and the `.recommendations-header` CSS class. Renaming those would break the collapse
  toggle for no benefit.

### Changed — Master Proposal VAT note copy
Gating condition and `.top-total-vat-note` CSS unchanged — copy only:

> VAT is charged at 0% on your heat pump and 20% on your underfloor heating. The total amount shown
> combines the two — see more detail in the quote breakdowns below.

Still shown only when the proposal contains both a heat pump quote and at least one 20%-rated quote.

### Governance
One extra `record.load()` per quote generation (~10 units). Negligible in context —
`loadItemCustomFields()` already performs a `record.load()` per line item. Nothing was restructured
to save it.

### Open question for review
The surrounding section headers are Title Case — "Project Specification", "Upgrades & Offers", and
the outgoing "Recommended Solutions and Costs". The new header is sentence case as specified. See the
PR comment.

### Testing notes
F1–F13 in `TESTING_GUIDE.md`, including a re-run of the Phase 2–5 BUS, VAT and layout scenarios.
Grep the Execution Log for `SITE_ADDRESS`.

---

## [Master Proposal v1.8.2] — 18 August 2026
**Status:** ✅ Live in Production — deployed 20 August 2026
**Component:** `nuheat_master_proposal.js`

**One CSS rule.** No JavaScript, no HTML restructuring, no other file. Everything else in this PR has
passed Sandbox testing and is untouched.

### Fixed
Appending the blended VAT amount in v1.8.1 made `.top-total-plus-vat` long enough to wrap, and
because it was an inline span it broke mid-phrase — orphaning "plus" beside the price:

```
£10,603.12 plus            →    £10,603.12
VAT £1,057.71                   plus VAT £1,057.71
─────────────────────           ─────────────────────
Total inc. VAT: £11,660.83      Total inc. VAT: £11,660.83
```

```diff
- '.top-total-plus-vat { font-size: 20px; font-weight: 400; vertical-align: middle; }',
+ '.top-total-plus-vat { display: block; font-size: 20px; font-weight: 400; margin-top: 6px; }',
```

- `display: block` puts the whole phrase on its own line, so it can never split mid-sentence however
  large the VAT figure gets.
- `vertical-align: middle` dropped — a no-op on a block element, meaningful only while inline.
- `margin-top: 6px` separates it from the 36px price without opening a gap that fights the
  `border-top` on `.top-total-inc-vat` below.

**No HTML change** — the markup was already correct; this is purely how the existing span displays.

**No mobile override added, and none needed.** There is no `.top-total-plus-vat` rule in the
`max-width: 768px` block, and `.top-total-right { text-align: center; }` already applies there, so
the block span centres under the price on mobile exactly as it right-aligns on desktop. Adding a rule
would be redundant and risk drift.

**Font size left at 20px.** Dropping to 18px would read as more clearly secondary now the line stands
alone, but only the line break was asked for and an unrequested size change is harder to spot in
review than to make. Rendering confirms it does not visibly compete with the 36px price.

### Deliberately not changed — the quote page
`nuheat_quote_suitelet.js` has its own `.top-total-plus-vat` class, but it renders the bare words
"plus VAT" with no amount appended, so it is far too short to wrap. Applying the same change there
would alter a layout that is already signed off, for no benefit. Left alone.

### Testing notes
E1–E7 in `TESTING_GUIDE.md`. Verified by rendering the shipped CSS in Chromium at 1280px and 420px:
the span computes to `display: block` at 23px tall (a wrapped span would be ~46px) and sits below the
price in every case, including a £12,345.67 VAT figure. The `@media print` block contains no
`top-total` rules, so print inherits the same behaviour.

---

## [Quote Suitelet v4.5.1 / Master Proposal v1.8.1] — 18 August 2026
**Status:** ✅ Live in Production — deployed 20 August 2026
**Components:** `nuheat_quote_suitelet.js`, `nuheat_master_proposal.js`

**Presentation only.** No calculation logic was touched. Every figure rendered here already existed
on `quoteData.bus`, `quoteData.vat` or the proposal's `totals`. Sandbox testing of v4.4.0/v4.5.0 has
passed and none of those figures change.

No changes to `nuheat_bus_grant.js`, `nuheat_vat_rates.js`, `nuheat_send_quote_sl.js` or
`nuheat_send_quote_cs (1).js` — and therefore **no new File Cabinet upload ordering concerns beyond
those already documented for v4.4.0/v4.5.0**.

### Changed — Master Proposal quote card pricing
Three middot-chained clauses were cluttered and hard to scan:

```
-£2,351.88
Includes £7,500.00 BUS grant · Total inc. VAT: -£2,351.88 · £2,351.88 refundable to you
```

now reads:

```
-£2,351.88  Refundable to you on completion
Total inc. VAT: -£2,351.88
```

- **REMOVED:** the `Includes £x BUS grant` clause. The grant is already announced by the
  `.grant-highlight` banner below the cards, so it was redundant.
- **REMOVED:** the `£x refundable to you` clause from the detail line.
- **ADDED:** a `Refundable to you on completion` label appended to the main price line, shown only
  when the balance is negative.
- The discount clause and the `Total inc. VAT:` clause are untouched.
- ⚠️ **Gated on `totalIncVat`, not `displaySubtotal`.** The refundable amount is what the customer
  actually receives, which is the VAT-inclusive balance. Identical today — the BUS grant only applies
  to heat pumps, which are 0%-rated — but correct rather than coincidentally correct, and it will not
  silently break if the VAT rules change.

### Changed — Master Proposal total header
`plus VAT` dangled with no figure, so the blended amount was invisible unless the reader subtracted:

```
£2,936.67 plus VAT                 →    £2,936.67 plus VAT £1,057.71
─────────────────────                   ─────────────────────
Total inc. VAT: £3,994.38               Total inc. VAT: £3,994.38
```

`calculateTotals()` already returns `totals.vat` — the sum of every selected quote's VAT, which is
exactly the blended figure (UFH at 20% + HP at 0%). No new calculation, no CSS change:
`.top-total-plus-vat` already styles the span.

### Added — Quote page refundable line
Both total sections now show a `Refundable amount` line between the VAT line and `Total inc VAT`,
when the balance after BUS is negative:

```
System price: £5,148.12
BUS grant applied: -£7,500.00
VAT at 0%: £0.00
Refundable amount: £2,351.88     ← new
─────────────────────
Total inc VAT: -£2,351.88
```

- Added to **both** `renderTopTotalSection()` and `renderTotalSection()` — they render the same
  figures at the top and bottom of the page and would look broken if only one changed.
- Shown as a **positive** figure — it is money coming back. `Math.max(0, -x)` also guarantees no
  `£0.00` row and no `-£0.00`.
- ⚠️ Derived from `bus.totalIncVatAfterBus`, **not** `bus.creditDue`. `creditDue` is ex-VAT; the
  refundable amount is VAT-inclusive. Identical today, correct in principle.
- The `Total inc VAT` line and its top border are unchanged.

### Added — CSS
- `.system-card-refund` — 13px, weight 500, primary colour, `margin-left: 8px`, `white-space: nowrap`.
  Smaller and lighter than the price so it reads as a label, not a second figure.
- Mobile (`max-width: 768px`) — `display: block` so it wraps onto its own line rather than squashing
  the price.

### Note on the Change B sanity check
The brief asked to verify `plus VAT` equals `Total inc. VAT − subtotal`, and to report a divergence
as a real defect rather than paper over it. **They have not diverged**, but the check only holds when
there is no discount. With one present, `totalIncVat − subtotal = vat − discount`, because the
headline subtotal is gross of discount and the discount is shown as its own breakdown line. The
displayed arithmetic is right in both cases — `subtotal − discount + VAT = Total inc. VAT` —
and `totals.vat` is the correct figure to render. Verified numerically both ways.

### Testing notes
- D1–D14 in `TESTING_GUIDE.md`, including a re-run of the Phase 2–3 BUS and VAT scenarios (D14).
- Check the refundable line appears in **both** total sections, never at £0.00 or −£0.00.
- Check the refund label wraps below the price at 768px rather than squashing it.

---

## [Quote Suitelet v4.5.0 / Master Proposal v1.8.0 / Send Quote SL v1.7.0 / VAT Module v1.0.0] — 18 August 2026
**Status:** ✅ Live in Production — deployed 20 August 2026
**Components:** `nuheat_vat_rates.js` (NEW), `nuheat_quote_suitelet.js`, `nuheat_master_proposal.js`, `nuheat_send_quote_sl.js`, `nuheat_send_quote_cs (1).js`

> ⚠️ **DEPLOYMENT ORDERING:** `nuheat_vat_rates.js` must be uploaded to `SuiteScripts/NuHeat`
> **before** the Quote Suitelet or the Send Quote SL is redeployed — same rule as
> `nuheat_bus_grant.js` in v4.4.0. Both are `define()`d by relative path and fail at load time if
> absent. Neither needs a script deployment record.

### Why this change exists — the tax codes were the root cause

> ✅ **Resolved 20 August 2026 — the tax codes have been corrected in Production.** The account of
> the problem below is the state at the time of this release, kept as the record of why the change
> was made. `VAT_MISMATCH` is now an early-warning signal rather than an outstanding task: with the
> source data correct, a new entry means something has regressed at source.

The scripts had never calculated VAT. There was no `0.2` multiplier anywhere in the pre-v4.5.0
codebase; both surfaces echoed NetSuite's `taxtotal` verbatim
(`nuheat_quote_suitelet.js:1875`, `nuheat_master_proposal.js:1635`). Heat pump quotes were
displaying 20% because **the tax codes on those Estimate lines were wrong in NetSuite** — the source
data said 20% where UK energy-saving materials relief makes it 0%.

v4.5.0 derives the rate that *should* apply and displays that. At the time of release it did not
fix NetSuite, so until the tax codes were corrected the quote page and the Estimate disagreed — a
quote showing £0.00 VAT against an Estimate that would invoice £1,200 is a commercial problem, not
a cosmetic one.

Every disagreement over 1p writes a **`VAT_MISMATCH`** audit entry naming the Estimate and both
figures. Those entries were the work-list for fixing the tax codes at source; that work is now
complete.

### Added
- **`nuheat_vat_rates.js` v1.0.0 (NEW)** — shared module, `@NModuleScope Public`, imported by the
  Quote Suitelet and the Send Quote SL.
  - `VAT_RATES` — Heat Pump 0%, Solar 0%, Underfloor Heating 20%, Other 20%.
  - `DEFAULT_VAT_RATE = 0.20` — an unknown type defaults to the standard rate, never under-charging,
    and logs `VAT_RATE_UNMATCHED`.
  - `resolveVatRate(quoteType)` → `{rate, percent, matched, quoteType}`.
  - `calculateVat(netAmount, rate)` — rounded to 2dp. `netAmount` is subtotal **minus discount**;
    VAT applies after discount.
  - `logVatMismatch(...)` — audit-level `VAT_MISMATCH` when derived and NetSuite figures differ by
    more than 1p.
  - `normaliseQuoteType(raw)` / `QUOTE_TYPE_ALIASES` — maps raw `custbody_quote_type` list values
    (`'Heat Pump (ASHP)'`, `'Heat Emitter'`, `'Full System (DFD)'`) onto the display names
    `VAT_RATES` is keyed by. **See "Fixed" below — without this, ASHP/GSHP/EAHP quotes would have
    been charged 20%.** Mirrors `QUOTE_TYPE_MAPPING` in `nuheat_send_quote_sl.js`; a new quote type
    must be added in both places.
- **Quote Suitelet** — `quoteData.vat`, a single derived figure set computed once in
  `loadQuoteData()` immediately **before** the BUS block (`rate`, `percent`, `amount`, `quoteType`,
  `rawQuoteType`, `netAmount`, `correctedTotalIncVat`, `netsuiteTaxTotal`), logged as `VAT_FIGURES`.
- **Quote Suitelet** — `headerData.quoteTypeText`, read from `custbody_quote_type` in
  `extractHeaderData()` inside a try/catch. `getText()` on a list field is unreliable, so
  `loadQuoteData()` falls back to inferring the type from the grouped items and logs which route was
  used as `VAT_QUOTE_TYPE`.
- **Send Quote SL** — hidden sublist fields `custpage_vat_rate` and `custpage_vat_percent`, same
  stringify-out / parse-back pattern as the BUS fields, mirrored into the preview path.
- **Send Quote CS** — collects both fields into the preview payload so preview and the emailed
  proposal show identical VAT.
- **Master Proposal** — `getVatRate(quote)` accessor, defaulting to 20% when absent.
- **Master Proposal** — blended-VAT note under the total price bar, plus the `.top-total-vat-note`
  CSS rule and its mobile centre-align override.

### Changed
- **Quote Suitelet — both total sections** now render `VAT at 0%: £0.00` / `VAT at 20%: £x` from
  `quoteData.vat` instead of `header.taxTotal`.
- **Quote Suitelet — Total inc VAT is recomputed.** NetSuite's `total` already contains the wrong
  VAT, so `correctedTotalIncVat = netAmount + derivedVat` replaces it for display, and the BUS
  block's `totalIncVatAfterBus` is built from the corrected figure. `balanceAfterBus` is ex-VAT and
  unchanged.
- **Quote Suitelet — "plus VAT" removed from the section price cards** (`.hp-price-amount` and
  `.category-cost-value`). VAT is now referenced only in the total system price header. The
  `.hp-price-vat` / `.category-cost-vat` CSS rules are left in place — harmless once unused, and the
  mobile overrides reference them. The "plus VAT" on the Design+ upgrade price in the UFH upgrade
  banner is **not** a section price card and is untouched.
- **Send Quote SL — `taxTotal` and `amount` passed to the Master Proposal are now DERIVED**, not raw
  NetSuite values. This is *not* a regression of the v1.4.9 fix: that fix was about reading
  `subtotal` / `discounttotal` / `taxtotal` reliably via `record.load()` instead of
  `search.lookupFields()`, and those reads are unchanged. What changed is that the tax figure is
  recalculated afterwards. **When `record.load()` fails, the NetSuite fallback values are still
  used** — deriving on that path would silently zero the quote's amount.
- **Master Proposal — `calculateTotals()` is unchanged.** It already sums each quote's own
  `taxTotal`, so once the Send Quote SL passes corrected per-quote figures the blend is right with
  no change to the summing logic. `parseCurrencyAmount()` strips `£` and commas, so the derived
  strings parse cleanly.
- **Master Proposal — main quotes intro copy** replaced: "…full component breakdown, tailored system
  details and benefits, and transparent pricing with no hidden extras." The "alternative options"
  intro for additional quotes is unchanged.

### Fixed
- **Raw quote-type values would have resolved to the wrong VAT rate.** `VAT_RATES` is keyed on
  display names, but both call sites hold the raw `custbody_quote_type` list value. Matching
  `'Heat Pump (ASHP)'` straight against `VAT_RATES` fails and falls through to the 20% default —
  charging a heat pump quote 20% VAT, the exact bug this release exists to fix, and silent because
  `'Heat Emitter'` also defaults to 20% and *looks* correct. Resolved by normalising inside the
  module so raw values and display names both work, and by passing `quoteTypeDisplay` (not
  `rawQuoteType`) at the Send Quote SL call site.

### Blended VAT note (Master Proposal)

> The VAT amount shown is blended between the underfloor heating at 20% and heat pump quote at 0%.
> Please see below for more information.

Gated on **a heat pump quote AND at least one 20%-rated quote** among the main quotes — deliberately
stricter than "the proposal includes a heat pump". On a heat-pump-only proposal the note would
otherwise describe blending with underfloor heating that is not in the proposal. Flags derive from
the passed-through `vatRate` / `busRate`, not `quoteType` string matching.

### Testing notes
- Twelve VAT scenarios (V1–V12) in `TESTING_GUIDE.md`, including a full re-run of the v4.4.0 BUS
  scenarios to confirm no regression.
- Grep the Execution Log for `VAT_MISMATCH`, `VAT_RATE_UNMATCHED`, `VAT_QUOTE_TYPE`, `VAT_FIGURES`,
  `BUS_RESOLVE` and `BUS_UNMATCHED`.
- ⚠️ **Solar is assumed to be 0%-rated** on the basis that solar thermal qualifies for the same
  energy-saving materials relief as heat pumps. Only HP and UFH were specified. One-line change in
  `VAT_RATES` if wrong.

---

## [Quote Suitelet v4.4.0 / Master Proposal v1.7.0 / Send Quote SL v1.6.0 / BUS Module v1.0.0] — 18 August 2026
**Status:** ✅ Live in Production — deployed 20 August 2026
**Components:** `nuheat_bus_grant.js` (NEW), `nuheat_quote_suitelet.js`, `nuheat_master_proposal.js`, `nuheat_send_quote_sl.js`, `nuheat_send_quote_cs (1).js`

> ⚠️ **DEPLOYMENT ORDERING:** `nuheat_bus_grant.js` must be uploaded to `SuiteScripts/NuHeat`
> **before** the Quote Suitelet or the Send Quote SL is redeployed. Both `define()` it as
> `'./nuheat_bus_grant'` and will fail at load time if it is not already in the File Cabinet.
> Custom modules need no script deployment record — a File Cabinet upload is sufficient.

### Why
Two related problems with the v4.3.70 blanket grant:
1. **Bug** — a heat pump quote worth less than the grant rendered a negative heat pump price
   (−£1,870.33) while the total clamped to £0.00. The clamps were in exactly the wrong places:
   both total sections clamped, the heat pump price card did not.
2. **Feature** — the £7,500 was hard-coded and applied to any quote containing a Heat Pump line,
   with no way to express the £9,000 enhanced rate or to withhold the grant.

### Added
- **`nuheat_bus_grant.js` v1.0.0 (NEW)** — shared module, `@NModuleScope Public`, defining the BUS
  rates and the Suppak matching rules so they cannot drift between the quote page and the Master
  Proposal. Exports `resolveBusGrant(lineItems)` returning `{amount, rate, matchedItem, suppressedBy}`.
  - `Suppak N1(R)HP` / `Suppak N1(NB)HP` / `Suppak BUS` → **£7,500** (standard)
  - `Suppak BUS - Uplift` → **£9,000** (enhanced)
  - any other `Suppak…` line, or no Suppak line → **no grant**
  - Matching is **exact array membership after normalisation**, never substring, so
    `'suppak bus - uplift'` can never be caught by the `'suppak bus'` entry.
  - `normaliseItemName()` takes the last colon-delimited segment (handles NetSuite's
    `"Parent : Child"` sub-item form), collapses whitespace and lowercases.
  - Logs `BUS_RESOLVE` on every resolution and `BUS_UNMATCHED` (with the raw `itemName`) whenever a
    Suppak line matches no tier — the exact string NetSuite returns for a Suppak line could not be
    confirmed from the repo, so a mismatch is visible rather than silently paying no grant.
- **Quote Suitelet** — `quoteData.bus`, a single resolved figure set computed once in
  `loadQuoteData()` (`amount`, `rate`, `hpGross`, `hpDisplayPrice`, `residualGrant`,
  `commissioningDisplay`, `balanceAfterBus`, `totalIncVatAfterBus`, `creditDue`, `hasGrant`),
  logged as `BUS_FIGURES`. All render sites read from it — no per-section re-resolution.
- **Quote Suitelet** — `CASCADE_GRANT_TO_COMMISSIONING` config constant (default `true`).
- **Quote Suitelet** — `formatSignedCurrency(value, symbol)` → `-£694.40` rather than `£-694.40`.
  `formatNumber()` is unchanged; the sign-ordering was always a caller problem.
- **Quote Suitelet** — `.hp-grant-banner-refund` CSS rule and a third grant-card line, shown only
  when the grant exceeds the quote value: *"Any grant funding in excess of your quote value
  (£694.40) will be refunded to you once the grant has been claimed."*
- **Quote Suitelet** — "System price" and "BUS grant applied" breakdown lines in both total
  sections, rendered only when a grant applies.
- **Master Proposal** — `formatSignedCurrency()`, `getBusAmount()`, `hasBusGrant()`.
- **Send Quote SL** — `formatSignedCurrency()`, plus hidden sublist fields `custpage_bus_amount`
  and `custpage_bus_rate` so the resolved values survive the `serverWidget` round trip.
- **Send Quote CS** — collects the two new fields into the preview payload, so preview and the
  saved/emailed proposal agree.

### Changed
- **Quote Suitelet — heat pump price card** now renders `quoteData.bus.hpDisplayPrice`, which is
  clamped at £0.00. **This is the −£1,870.33 fix.**
- **Quote Suitelet — commissioning card** receives a totals override built from
  `quoteData.bus.commissioningDisplay`, mirroring the existing Solar override pattern. Grant left
  over once the heat pump price reaches £0 cascades here so the page reconciles.
- **Quote Suitelet — `renderTopTotalSection()` and `renderTotalSection()`** drop their
  `Math.max(0, …)` clamps and use `formatSignedCurrency()`, so the balance after BUS shows its true
  negative value.
- **Quote Suitelet — grant card** is rendered only when a grant applies, with the resolved amount.
- **Master Proposal — `generateQuoteCard()`** shows the balance after BUS (may be negative), keyed
  off the resolved Suppak rate rather than `quote.quoteType === 'Heat Pump'`. The
  `if (subtotal > 0)` guard that suppressed a negative balance is fixed. Detail line gains
  *"Includes £7,500 BUS grant"* and, when negative, *"£694.40 refundable to you"*.
- **Master Proposal — `generateBUSGrantBanner(busAmount)`** takes the amount as an argument; the
  gate changed from `isMain && hasHeatPump` to "at least one main quote carries a grant", using the
  highest rate present. `SHOW_BUS_GRANT_BANNER` remains the master on/off switch.
- **Master Proposal — `calculateTotals()`** aggregates post-grant balances without clamping, so a
  negative per-quote balance reduces the headline total instead of being skipped.
- **Master Proposal — headline total bar** uses `formatSignedCurrency()`.
- **Send Quote SL — `searchRelatedQuotes()`** reads the item sublist off the Estimate it already
  loads and resolves the BUS grant there, passing `busAmount` / `busRate` through to the proposal,
  which has no line-item access of its own. Logs `SendQuoteSL.BUS` per Estimate.

### Removed
- **Both `HP_GRANT_AMOUNT = 7500` constants** (`nuheat_quote_suitelet.js`, `nuheat_master_proposal.js`).
- **Dead `.grant-banner` code** in the Quote Suitelet — the `showGrantBanner` parameter of
  `renderCategorySection()`, the `if (showGrantBanner) { … }` block containing the
  "may be eligible for a £7,500 Government grant" HTML, the `false` argument at both call sites, and
  the five `.grant-banner*` CSS rules. All were unreachable: both call sites passed `false`, and
  Heat Pump/UFH do not use `renderCategorySection`. **`.hp-grant-banner` is untouched** — it is the
  live card carrying the new copy.

### Fixed
- Drifted JSDoc `@version` headers: Quote Suitelet said `4.3.67` (constant `4.3.70`), Send Quote SL
  said `1.4.9` (constant `1.5.1`), Send Quote CS said `1.1.1` (constant `1.2.0`). Header and
  constant now agree in all three.

### Worked example (the reported case)
| Value | v4.3.70 | v4.4.0 |
|---|---|---|
| Quote subtotal, ex VAT, gross | £6,805.60 | £6,805.60 |
| Heat pump price displayed | **−£1,870.33** ❌ | **£0.00** ✅ |
| Commissioning displayed | £1,175.93 | **£0.00** (cascade) |
| Your total system price | **£0.00** ❌ | **−£694.40** ✅ |
| Refundable to customer | not shown | **£694.40** ✅ |

### Testing notes
- Ten scenarios in `TESTING_GUIDE.md` (standard/enhanced/non-qualifying/absent Suppak, grant
  exceeding quote value, exactly at grant value, UFH-only, multi-system).
- Grep the Script Execution Log for `BUS_RESOLVE`, `BUS_UNMATCHED` and `BUS_FIGURES` on every run.
- Check no `£-` appears anywhere; negatives must render `-£694.40`.
- Confirm the existing discount lines still read `Discount: -£x` and not `-£-x` — `header.discountTotal`
  is `Math.abs()`'d in `extractHeaderData()` and those two call sites hand-roll their own sign, so
  they deliberately still use `formatNumber()`.

---

## [Quote Suitelet v4.3.70] — 22 April 2026
**Status:** ✅ Released — superseded by v4.4.0
### Changed
- Heat pump display price now deducts £7,500 BUS grant (`HP_GRANT_AMOUNT` constant). `hpGrantedPrice = hpDisplayPrice - 7500` shown in the price card.
- `hp-grant-banner` text updated from "may be eligible for a £7,500 Government grant" to "£7,500 grant funding has been applied to this quote" with asterisk line "*Subject to scheme eligibility" in smaller italic text.
### Added
- `HP_GRANT_AMOUNT = 7500` constant — blanket deduction, intended to become conditional on a NetSuite field in future.
- `.hp-grant-banner-text .hp-grant-banner-asterisk` CSS class for the smaller italic asterisk line.
- `renderTopTotalSection()` — headline subtotal and Total inc VAT deduct `HP_GRANT_AMOUNT` for HP quotes (`taxTotal` line unchanged). Uses `quoteData.hasHeatPump` flag.
- `renderTotalSection()` — same grant deduction applied to the lower total section.

---

## [Master Proposal v1.6.7] — 22 April 2026
**Status:** ✅ Released — superseded by v1.7.0
### Changed
- Heat Pump quote cards now display subtotal minus £7,500 BUS grant (`HP_GRANT_AMOUNT` constant). Uses `Math.max(0, subtotal - HP_GRANT_AMOUNT)` to prevent negative prices.
- `generateBUSGrantBanner()` text updated to "£7,500 grant funding has been applied to this quote" with asterisk line "*Subject to scheme eligibility".
### Added
- `HP_GRANT_AMOUNT = 7500` constant alongside `SHOW_BUS_GRANT_BANNER`.
- `.grant-highlight-asterisk` CSS modifier class for the asterisk line.
- `calculateTotals()` — HP quotes deduct `HP_GRANT_AMOUNT` from both `subtotal` and `amount` (total inc VAT) before aggregating into the proposal total bar.
- `generateQuoteCard()` — Total inc VAT detail line also deducts `HP_GRANT_AMOUNT` for Heat Pump quotes, consistent with `displaySubtotal`.

---

## [Quote Suitelet v4.3.69] — 22 April 2026
**Status:** ✅ Merged to main
### Changed
- Design+ upgrade banner: price now renders above the mailto CTA button rather than replacing it — both price and button are visible together when `designUpgradePrice` is present
- Button label updated: "Ask your AM to include this" → "Email your AM to include this" (both the price-present and price-absent cases)
- Price display changed from pink `.upgrade-banner-cta` pill to plain `.upgrade-banner-pricing` div — button retains the pink styling
- `.upgrade-banner-cta` class and `href` unchanged (GTM click tracking preserved)
### Added
- `.upgrade-banner-pricing { margin-bottom: 10px; }` CSS rule in `generateCSS()`

---

## [Master Proposal v1.6.6] — 22 April 2026
**Status:** ✅ Merged to main
### Added
- Site address (`custbody_opp_site_adress`) read from Opportunity record in `loadOpportunityData()` using defensive try-catch pattern
- "Site address:" row rendered in Customer Information card between Customer name and System reference — conditionally hidden when field is empty

---

## [Master Proposal v1.6.5] — 22 April 2026
**Status:** ✅ Merged to main
### Changed
- UFH benefits: 'Room-by-room heat losses' replaced with 'Detailed installation pack'
- Step 2 "Bespoke design" description: removed reference to heat-loss calculations

---

## [Master Proposal v1.6.4] — April 2026
### Added
- GTM container GTM-5NJJSBMP injected into all generated proposal pages
- Data layer push fires nuheat_proposal_view event on page load with:
  customerId, opportunityId, pageType
- GTM noscript fallback added immediately after <body> tag
- Data layer populated before GTM snippet to ensure values available on load

---

## [Quote Suitelet v4.3.68] — April 2026
### Added
- GTM container GTM-5NJJSBMP injected into all generated quote pages
- Data layer push fires nuheat_quote_view event on page load with:
  customerId, opportunityId, quoteId (tranId), quoteInternalId, pageType
- GTM noscript fallback added immediately after <body> tag
- Data layer populated before GTM snippet to ensure values available on load

---

## [Analytics Suitelet v1.0.1] — April 2026
### Fixed
- DateTime fields now receive a JavaScript Date object instead of an ISO string
- NetSuite record.submitFields() rejects ISO 8601 strings for DateTime field types

---

## [Analytics Suitelet v1.0.0] — April 2026
### Added
- New script: nuheat_analytics_sl.js
- Receives POST from GTM on quote and proposal view events
- Quote views: writes last viewed date and view count to Estimate record
- Proposal views: writes last viewed date and view count to Opportunity record
- Customer ID logged to Script Execution Log for diagnostic purposes
- CORS headers included for browser fetch() compatibility
- Fire-and-forget pattern — never blocks customer page load
### Notes
- Estimate fields use double-prefix IDs (custbodycustbody_*) due to field creation error in NetSuite — correct in production before go-live

---

## v4.3.67 — Prepend £ symbol to Design+ upgrade price in UFH banner
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Merged to main

### Fixed
- **£ symbol on upgrade price** — The Design+ upgrade price in the UFH Standard Design banner
  now displays with a `£` prefix. Applied conditionally — if the value in
  `custbody_upgrades_itemprice` already begins with `£`, it is used as-is to prevent doubling.
  All styling from v4.3.66 is preserved unchanged.

### Files Changed
- `nuheat_quote_suitelet.js` — Price span updated with conditional `£` prefix; version bumped to v4.3.67

---

## v4.3.66 — Style Design+ upgrade price to match pink CTA button
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.67

### Fixed
- **Design+ upgrade price styling** — The price pill in the UFH Standard Design upgrade banner
  now uses the existing `.upgrade-banner-cta` class, giving it the same pink (`#AA0061`)
  background and white text as the "Ask your AM to include this" button it replaces. Font sizes
  brought in line with the button (15px bold for the price, 13px regular for "plus VAT").
  `cursor: default` prevents the pointer cursor since this is not a link. No new CSS required.

### Files Changed
- `nuheat_quote_suitelet.js` — Price display block in `renderDesignPackageCard()` updated;
  version bumped to v4.3.66

---

## v4.3.65 — Show Design+ upgrade price in UFH upgrade banner
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.66

### Added
- **Design+ upgrade price in UFH upgrade banner** — The "Ask your AM to include this" CTA button
  in the Standard UFH Design card's upgrade banner is now replaced by the actual Design+ upgrade
  price when available. Price is looked up by splitting `custbody_upgrades_optiontype` and
  `custbody_upgrades_itemprice` on `*`, finding the entry whose type equals "Design Charge Option"
  (case-insensitive), and displaying the corresponding price as e.g. "£450.00 plus VAT".
  Falls back to the original CTA button when no matching price is found, so quotes without these
  fields populated are unaffected.
- **New helper:** `getUpgradePrice(optionTypeStr, itemPriceStr, targetType)` — generic parallel
  delimited-list lookup, reusable for other upgrade option types.

### Files Changed
- `nuheat_quote_suitelet.js` — `getUpgradePrice()` helper added; `loadQuoteData()` reads
  `custbody_upgrades_optiontype` / `custbody_upgrades_itemprice` and stores result as
  `quoteData.designUpgradePrice`; upgrade banner in `renderDesignPackageCard()` updated;
  version bumped to v4.3.65

---

## v4.3.64 — Move external link icon to left of plant room guidance link text
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.65

### Fixed
- **External link icon position on plant room guidance link** — The `SVG_EXTERNAL_LINK` icon was
  appearing to the right of the link text. It now appears to the left, consistent with icon
  placement on "View more details" links throughout the product cards.

### Files Changed
- `nuheat_quote_suitelet.js` — Icon moved before link text in `renderHeatPumpTreeSection()`;
  version bumped to v4.3.64

---

## v4.3.63 — Add plant room layout guidance link to Heat Pump section
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.64

### Added
- **Plant room guidance link in Heat Pump section** — A second paragraph now appears directly
  below the existing Heat Pump intro copy, containing a link to the plant room layout and space
  requirements PDF. Styled using the existing `.view-datasheet` class (teal `#00857D`, external
  link icon) for visual consistency with "View more details" links on product cards. The link only
  appears on quotes that include Heat Pump line items, as it is rendered inside
  `renderHeatPumpTreeSection()`.

### Files Changed
- `nuheat_quote_suitelet.js` — Second intro paragraph added in `renderHeatPumpTreeSection()`;
  version bumped to v4.3.63

---

## v4.3.62 — Component Breakdown improvements
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.63

### Added
- **"View product info" link in Component Breakdown** — Items that have a value in
  `custitem_prod_info_link` (loaded as `item.dataSheetUrl`) now display a right-aligned
  "View product info" link in the Description column, consistent with the same link already
  shown on main product cards.

### Fixed
- **Internal items hidden from Component Breakdown** — "Hidden UFH Discount", "Hidden HP Discount",
  and "Hidden Subtotal" line items no longer appear in the customer-facing Component Breakdown table.
  A new `COMPONENT_BREAKDOWN_EXCLUDED_ITEMS` constant controls the exclusion list. These items remain
  in `quoteData.lineItems` for all other purposes (pricing, categorisation, design package detection).

### Files Changed
- `nuheat_quote_suitelet.js` — `COMPONENT_BREAKDOWN_EXCLUDED_ITEMS` constant added; Component
  Breakdown loop updated with exclusion check and conditional info link; version bumped to v4.3.62

---

## v4.3.61 — Fix swapped DESIGN_PACKAGE_ITEMS constants
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.62

### Fixed
- **Swapped design package item IDs** — `DESIGN_PACKAGE_ITEMS` had MPDPCD-C and MPDP-C mapped
  to the wrong keys. MPDPCD-C (internal ID 5488) is the Standard UFH Design package; MPDP-C
  (internal ID 480) is the UFH Design+ upgrade package. The swapped mapping caused the wrong
  hardcoded card to render for each item code, and the upgrade banner appeared on the wrong card.

### Files Changed
- `nuheat_quote_suitelet.js` — `DESIGN_PACKAGE_ITEMS` constant corrected; version bumped to v4.3.61

---

## v4.3.60 — Hide product card image placeholder when custitem_test_image is empty
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.61

### Fixed
- **Empty image placeholder box on product cards** — The image container (`product-image-column`
  and `product-image`) was always rendered even when `custitem_test_image` was blank, leaving a
  visible empty box on cards with no image. The entire image column is now conditionally omitted
  from the HTML when `item.productImage` is absent. Applies to all card types rendered via
  `renderProductCard()` (UFH, Heat Pump, Solar, Commissioning).
- **Mini card placeholder** — The thermostat mini card (`renderMiniProductCard()`) similarly
  rendered a placeholder SVG box when no image was set. The else branch has been removed so no
  image div is output when `item.imageUrl` is empty.

### Changed
- Removed `min-height: 150px` and `background: var(--color-bg)` from `.product-image` CSS rule —
  these properties had no effect on the card layout once the column is conditionally omitted, but
  removing them prevents any residual empty-box appearance if the element is rendered without an image.

### Files Changed
- `nuheat_quote_suitelet.js` — `renderProductCard()` and mini card conditional updated;
  `.product-image` CSS rule cleaned up; version bumped to v4.3.60

---

## Send Quote SL v1.5.1 — Fix contact sublist ID
**Date:** 31 March 2026
**Component:** Send Quote Suitelet (`nuheat_send_quote_sl.js`)
**Status:** ✅ Released — superseded by Send Quote SL v1.6.0

### Fixed
- **Contact selector showing no contacts** — `getLineCount()` and `getSublistValue()` were
  using sublist ID `'contact'`, which does not exist on Opportunity records. The correct
  internal ID is `'contactroles'`. The field ID within the sublist (`fieldId: 'contact'`)
  is unchanged.

### Files Changed
- `nuheat_send_quote_sl.js` — Sublist ID corrected to `'contactroles'`; version bumped to v1.5.1

> **Correction (Sep 2026):** the `'contactroles'` sublist did not work either. The code loads contacts
> with an Opportunity search joined to `contact` — see `AI_AGENT_CONTEXT.md` §9, pitfall 11.

---

## Send Quote SL v1.5.0 — Add contact selector dropdown to email field
**Date:** 30 March 2026
**Component:** Send Quote Suitelet (`nuheat_send_quote_sl.js`) + Client Script (`nuheat_send_quote_cs.js`)
**Status:** ✅ Released — superseded by Send Quote SL v1.5.1

### Added
- **Contact selector dropdown** — Users can now select a contact from the
  Opportunity's contact list to populate the To email address. Contacts without
  an email address are shown with a "(no email)" warning and do not overwrite
  the email field when selected. No contact is pre-selected by default.

### Files Changed
- `nuheat_send_quote_sl.js` — Contact sublist loading + `custpage_contact_selector` SELECT field added; version bumped to v1.5.0
- `nuheat_send_quote_cs.js` — `fieldChanged` handler added for contact selector; version bumped to v1.2.0

---

## v4.3.59 — Fix thermostat mini card image clipping
**Date:** 30 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.60

### Fixed
- **Thermostat mini card image clipping** — Images were being cropped at the top and
  bottom due to `object-fit: cover` scaling behaviour. Changed to `object-fit: contain`
  so the full image is always visible within the container regardless of aspect ratio.

### Files Changed
- `nuheat_quote_suitelet.js` — CSS updated for mini card image element;
  version bumped to v4.3.59

---

## v4.3.58 — Fix thermostat upgrade card images not rendering
**Date:** 30 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Released — superseded by v4.3.59

### Fixed
- **Thermostat upgrade card images** — Images were blank despite `custitem_test_image`
  being populated on item records. Root cause: `loadThermostatOptionItems()` was using
  `getFileUrl()` alone, which fails when the field contains a plain URL string rather
  than a NetSuite file ID. Fixed by aligning with the multi-approach resolution pattern
  already used in `loadItemCustomFields()` (direct URL → getFileUrl → getText fallback).
- **Product card image field** — Switched both `loadThermostatOptionItems()` and the
  main product card path from `custitem_quote_prod_visual_1` to `custitem_test_image`
  (production image field). No remaining references to the old field.

### Files Changed
- `nuheat_quote_suitelet.js` — Image resolution updated in `loadThermostatOptionItems()`;
  field switched to `custitem_test_image` in all three read locations; version bumped to v4.3.58

---

## v4.3.56 — Thermostat upgrade cards: prefix-based exclusion on fixed card set
**Date:** 29 March 2026
**Component:** Quote Suitelet (`src/nuheat_quote_suitelet.js`)
**Status:** ✅ Released

### Improvement
Thermostat upgrade cards now use prefix-based exclusion against the main quote
materials list, replacing the old exact item ID comparison. A card is hidden if
the main quote already contains any item whose ID begins with the corresponding
family prefix — meaning any variant of that thermostat suppresses the upgrade card.

### Performance note
An earlier approach (closed PR #1) attempted prefix-based catalogue searching using
`itemid STARTSWITH` filters. This caused 80+ second execution times and
ScriptNullObjectAdapter errors because it scanned the full item catalogue and called
`record.load()` for every match. The final implementation retains a fixed set of four
item IDs (maximum four `record.load()` calls) and moves prefix logic to the exclusion
check only — where it has no performance cost.

### Constants
- `THERMOSTAT_OPTION_ITEM_IDS` — fixed four card IDs (unchanged from original)
- `THERMOSTAT_EXCLUSION_PREFIXES` — new map of card ID → family prefix
- `RECOMMENDED_ITEM_ID` — unchanged

### Exclusion logic
| Card | Hidden when main quote contains item starting with |
|------|---------------------------------------------------|
| DSSB5-C | DSSB |
| neoHub+-C | NeoHub |
| Neostatwv2-C | Neostat |
| NeoAirwv3-C | NeoAir |

### Files Changed
- `src/nuheat_quote_suitelet.js` — v4.3.55 → v4.3.56

### Testing
- [ ] All four cards render on a UFH-only quote with no thermostat on the order
- [ ] Each card is correctly suppressed when its family prefix is on the quote
- [ ] neoHub+-C Recommended badge present, card appears first
- [ ] Execution time normal (under 5 seconds)
- [ ] No THERMOSTAT_OPTIONS_ERROR in Script Execution Log

---

## v4.3.55 — Fix double-prefixed fab field IDs in main product cards
**Date:** 29 March 2026
**Component:** Quote Suitelet (`src/nuheat_quote_suitelet.js`)

### Bug Fixed
Feature/benefit bullet points were empty on all main product cards (UFH, Heat Pump,
Solar, Commissioning sections). Root cause is identical to the thermostat section fix
in v4.3.54: the six fab fields have double-prefixed internal IDs
(`custitemcustitem_quote_fab_1` through `custitemcustitem_quote_fab_6`), but
`loadItemCustomFields()` was calling `getValue()` with the shorter name-based ID
(`custitem_quote_fab_1`), which silently returns empty in NetSuite without throwing
an error.

### Fix
Updated all `custitem_quote_fab_` field ID references in `loadItemCustomFields()`
(and any other non-thermostat, non-comment occurrences in the file) to use the
correct double-prefixed internal IDs (`custitemcustitem_quote_fab_`).

Note: Comments and log strings intentionally retain the shorter form for readability.

### Files Changed
- `src/nuheat_quote_suitelet.js` — v4.3.54 → v4.3.55

### Testing
- [ ] Regen a UFH quote — feature bullet points should be populated on all product cards
- [ ] Regen a Heat Pump quote — feature bullets populated on Heat Pump product cards
- [ ] Regen a Solar quote — feature bullets populated on Solar product cards
- [ ] Regen a Commissioning-only quote — feature bullets populated where configured
- [ ] Verify no regressions on thermostat cards (should still work from v4.3.54)
- [ ] Check Script Execution Log — no new errors

---

## v4.3.54 — Fix thermostat options section (search columns + field ID double-prefix)
**Date:** 29 March 2026
**Component:** Quote Suitelet (`src/nuheat_quote_suitelet.js`)

### Bugs Fixed

**Bug 1 — Thermostat cards never rendered (static fallback always showing)**
`loadThermostatOptionItems()` included `custitem_quote_fab_1` through `fab_6` as
`search.create()` columns. NetSuite throws `SSS_INVALID_SRCH_COL` for custom item
fields used as search columns on `search.Type.ITEM`, aborting the entire search and
returning zero results. The static fallback tiles rendered instead of live product cards.

Fix: Refactored to a two-step approach — Step 1 searches with standard columns only
(`itemid`, `displayname`, `description`); Step 2 calls `record.load()` per matched
item to read all `custitem_*` fields reliably.

**Bug 2 — Feature/benefit bullets always empty**
The six fab fields have double-prefixed internal IDs (`custitemcustitem_quote_fab_1`
through `custitemcustitem_quote_fab_6`) because the field names already begin with
`custitem_`. `record.load().getValue({ fieldId: 'custitem_quote_fab_1' })` silently
returned empty. All other custom item fields use standard IDs and are unaffected.

Fix: Updated all six fab field reads to use the correct internal IDs
(`custitemcustitem_quote_fab_1` through `custitemcustitem_quote_fab_6`).

**Bug 3 — Recommended banner not showing on neoHub+ card**
`isRecommended` used strict `===` comparison against `RECOMMENDED_ITEM_ID`. If
NetSuite returns `itemid` in different casing the comparison silently fails.

Fix: Changed to case-insensitive comparison using `.toLowerCase()` on both sides.

### Files Changed
- `src/nuheat_quote_suitelet.js` — `loadThermostatOptionItems()` rewritten
- `docs/AI_AGENT_CONTEXT.md` — Added two new NetSuite quirks (Section 9)
- `CHANGELOG.md` — This entry

### Testing
- [ ] Regen a UFH-only quote — thermostat options section should show live product cards (not static tiles)
- [ ] Verify neoHub+ card shows the "Recommended" banner
- [ ] Verify feature bullet points are populated on each card
- [ ] Verify product images load correctly
- [ ] Verify "View more details" links are present where configured
- [ ] Regen a Heat Pump or Solar quote — thermostat section should be hidden entirely
- [ ] Check Script Execution Log — no `THERMOSTAT_OPTIONS_ERROR` entries
- [ ] Check debug log — confirm `featuresCount > 0` and `isRecommended: true` for neoHub+

---

## v1.6.3 — Master Proposal: Fix broken email button URL
**Date:** 29 March 2026
**Component:** Master Proposal (`src/nuheat_master_proposal.js`)

### Bug Fixed
The "VIEW YOUR QUOTES HERE" button in the customer proposal email was broken for all recipients:
- **Desktop:** Google "Redirect Notice — The page you were on is trying to send you to an invalid URL (`http:///core/media/media.nl?id=...`)"
- **Mobile:** Button tap did nothing (mail clients silently drop malformed hrefs)

### Root Cause
`file.load().url` in NetSuite returns a **relative path** (e.g. `/core/media/media.nl?id=43237660&c=472052&h=...`). This was being stored directly as `proposalUrl` and injected into the email `href` attribute. Email clients have no NetSuite base URL to resolve it against, producing `http:///` (protocol with no hostname).

### Fix
- Added `getAccountHostname()` helper using `N/runtime.accountId` to dynamically derive the fully-qualified account URL (e.g. `https://472052-sb1.app.netsuite.com`). Handles both Sandbox (`_SB1` → `-sb1`) and Production automatically.
- `saveProposalToFileCabinet()` now prepends the hostname to produce an absolute `https://` URL.
- Added `N/runtime` to module imports.

### Files Changed
- `src/nuheat_master_proposal.js` — v1.6.2 → v1.6.3

### Testing
- [ ] Generate and send a proposal from the Send Quote UI
- [ ] Click "VIEW YOUR QUOTES HERE" in the received email on desktop — should open proposal page
- [ ] Click the button on mobile — should open proposal page
- [ ] Check Script Execution Log — verify "Absolute URL" log entry shows a valid `https://` URL
- [ ] Confirm "View Master Proposal" link on the NetSuite success page also works
- [ ] Repeat test from Sandbox to verify subdomain format is correct (`472052-sb1.app.netsuite.com`)

---

## [1.6.3] Master Proposal — 28 March 2026

### Fixed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Resolves "Invalid folder reference key 21719365" error when generating Master Proposals
  in the Production account

---

## [4.3.54] Quote Suitelet — 28 March 2026

### Added
- `DESIGN_PACKAGE_ITEMS` constant mapping item internal IDs for MPDP-C (Standard UFH Design, ID: 480)
  and MPDPCD-C (UFH Design+ Upgrade, ID: 5488)
- `hasDesignPackageItem(lineItems, targetItemId)` helper function — detects design package presence
  by matching item internal ID, not product type
- Three new flags on `quoteData` object:
  - `hasDesignPackage` — true if either design package is present
  - `hasDesignPackageStandard` — true if MPDP-C is present
  - `hasDesignPackageUpgrade` — true if MPDPCD-C is present
- Audit log entry in `loadQuoteData()` confirming design package detection result per quote

### Fixed
- Removed duplicate `DESIGN_PACKAGE_ITEMS` declaration that caused SyntaxError on script load
  (constant already existed in the file prior to v4.3.54)

### Notes
- No changes to rendered quote page output — this is detection/data only
- Flags are available to all render functions via the `quoteData` object, ready for a future
  design package rendering feature

---

## [Config] File Cabinet Folder ID — 28 March 2026

### Changed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Functional change in: `src/nuheat_quote_viewer_sl.js`, `src/nuheat_quote_suitelet.js`
- Comment/doc updates in: `src/nuheat_quote_ue.js`, `src/nuheat_quote_generator_ss.js`, `README.md`, `docs/AI_AGENT_CONTEXT.md`

### Notes
- Sandbox folder ID `21719365` preserved in `docs/AI_AGENT_CONTEXT.md` for reference
- If reverting to Sandbox, update `QUOTE_HTML_FOLDER_ID` in the two functional files above
