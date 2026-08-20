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
