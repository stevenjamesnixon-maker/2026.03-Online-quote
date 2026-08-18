# Section Logic Mapping — BUS Grant & VAT

**Last Updated:** 18 August 2026
**Applies to:** Quote Suitelet v4.5.1, Master Proposal v1.8.1, Send Quote SL v1.7.0,
BUS Module v1.0.0, VAT Module v1.0.0

How the BUS (Boiler Upgrade Scheme) grant is resolved, and exactly where each derived figure is
rendered. This document exists because the pre-v4.4.0 implementation subtracted the grant at six
independent render sites with inconsistent clamping — which is what produced the negative
heat-pump-price bug.

---

## 1. Resolution — once per quote

`nuheat_bus_grant.js` → `resolveBusGrant(lineItems)` returns:

```js
{ amount: 0 | 7500 | 9000, rate: 'none' | 'standard' | 'enhanced',
  matchedItem: String|null, suppressedBy: String|null }
```

driven entirely by the **Suppak line item** (see `FIELD_REFERENCE.md` for the item names and the
matching rules). The grant is **no longer** keyed off `quoteData.hasHeatPump` or
`quote.quoteType === 'Heat Pump'`.

Every resolution writes a `BUS_RESOLVE` audit entry. An unrecognised `Suppak…` line writes
`BUS_UNMATCHED` with the raw and normalised `itemName`.

---

## 2. Derived figures — one calculation block

Computed once in `loadQuoteData()` immediately after `categoryTotals`, stored on `quoteData.bus`,
and logged as `BUS_FIGURES`. **No render function re-derives any of these.**

| Figure | Formula | Can be negative? |
|---|---|---|
| `amount` | resolved BUS grant | no |
| `hpGross` | `header.subtotal - commissioningTotal` | no |
| `hpDisplayPrice` | `Math.max(0, hpGross - amount)` | **no — clamped** |
| `residualGrant` | `Math.max(0, amount - hpGross)` | no |
| `commissioningDisplay` | cascade ? `Math.max(0, commissioningTotal - residualGrant)` : `commissioningTotal` | no |
| `balanceAfterBus` | `header.subtotal - amount` | **YES** |
| `totalIncVatAfterBus` | `header.total - amount` | **YES** |
| `creditDue` | `Math.max(0, -balanceAfterBus)` | no |
| `hasGrant` | `amount > 0` | — |

`header.subtotal` is **gross** — there is no negative grant line on the Estimate, so Phase 2 owns
the entire deduction and there is no double-deduct risk.

**VAT.** The grant is deducted from the ex-VAT subtotal; NetSuite's `taxTotal` is left untouched.
VAT is 0% on renewables, so grant-vs-VAT ordering is moot in practice.

### The clamping rule, stated once

> The **component price** is clamped and can never go negative.
> The **balance after BUS** is not clamped and carries the negative value.

Pre-v4.4.0 this was exactly inverted: both total sections clamped (showing £0.00 instead of
−£694.40) while the heat pump price card did not (showing −£1,870.33).

---

## 3. Where each figure renders — Quote page (`nuheat_quote_suitelet.js`)

| Section | Function | Reads | Notes |
|---|---|---|---|
| Heat pump price card | `renderHeatPumpTreeSection()` | `bus.hpDisplayPrice` | Clamped. **Never negative.** |
| Grant card `.hp-grant-banner` | `renderHeatPumpTreeSection()` | `bus.hasGrant`, `bus.amount`, `bus.creditDue` | Whole card hidden when `!hasGrant`. Amount is dynamic (£7,500 / £9,000). Refund line only when `creditDue > 0`. |
| Commissioning price card | `renderProductSections()` → `renderCategorySection()` | `bus.commissioningDisplay` | Passed as a totals override, mirroring the Solar override pattern. |
| Top total section | `renderTopTotalSection()` | `bus.balanceAfterBus`, `bus.totalIncVatAfterBus`, `bus.amount` | **Un-clamped.** Uses `formatSignedCurrency()`. |
| Lower total section | `renderTotalSection()` | same | **Un-clamped.** ⚠️ This function currently has **no call site** in the render pipeline — only `renderTopTotalSection()` is used. Updated for consistency. |

### Total section output (worked example)

```
Your total system price                     -£694.40
    System price: £6,805.60
    BUS grant applied: -£7,500.00
    VAT: £0.00
    Total inc VAT: -£694.40
```

The "System price" and "BUS grant applied" lines render **only when `bus.hasGrant`**. With
`busAmount === 0` every figure collapses to pre-grant behaviour and the section renders exactly as
it did before v4.4.0 — no regression for UFH-only or solar-only quotes.

### The cascade

`CASCADE_GRANT_TO_COMMISSIONING` (default `true`). Grant left over once the heat pump price reaches
£0 also reduces the displayed commissioning price, so the visible components sum to the balance:

| | cascade `true` (default) | cascade `false` |
|---|---|---|
| Heat pump | £0.00 | £0.00 |
| Commissioning | **£0.00** | **£1,175.93** |
| Total | −£694.40 | −£694.40 |
| Page reconciles? | ✅ yes | ❌ no |
| Commissioning looks free? | ⚠️ yes | no |

One-line change either way.

---

## 4. Where each figure renders — Master Proposal (`nuheat_master_proposal.js`)

The Master Proposal **has no line-item access** — it never loads an Estimate. `nuheat_send_quote_sl.js`
resolves the grant per Estimate and passes `busAmount` / `busRate` through a `serverWidget` sublist
(as TEXT — stringified out, `parseFloat`'d back in).

| Element | Function | Behaviour |
|---|---|---|
| `.system-card-price` | `generateQuoteCard()` | `subtotal - busAmount` — the balance after BUS, **may be negative**. The `if (subtotal > 0)` guard that suppressed a negative balance is fixed. |
| `.system-card-price-detail` | `generateQuoteCard()` | Adds `Includes £7,500 BUS grant` (dynamic); adds `£694.40 refundable to you` when the balance is negative. `Total inc. VAT` follows the same post-grant figure. |
| `.grant-highlight` banner | `generateBUSGrantBanner(busAmount)` | Amount passed in. Shown when **at least one main quote carries a grant**, at the highest rate present. Gate changed from `isMain && hasHeatPump` to `isMain && maxBusAmount > 0`. `SHOW_BUS_GRANT_BANNER` remains the master on/off switch. |
| Headline total bar | `calculateTotals()` | Aggregates post-grant balances **without clamping**, so a negative per-quote balance reduces the total rather than being skipped. Card totals and the bar therefore agree. |

All figures that can go negative use `formatSignedCurrency()` → `-£694.40`, not `£-694.40`.

---

## 5. Negative currency formatting

`formatNumber()` already handles negatives correctly (`formatNumber(-1870.33)` → `"-1,870.33"`).
The `£-1,870.33` ordering was purely a **caller** problem — every call site did
`symbol + formatNumber(x)`. `formatNumber()` is therefore **unchanged**; a signed helper was added
instead, in each of the three files:

| File | Helper |
|---|---|
| `nuheat_quote_suitelet.js` | `formatSignedCurrency(value, symbol)` |
| `nuheat_master_proposal.js` | `formatSignedCurrency(amount)` |
| `nuheat_send_quote_sl.js` | `formatSignedCurrency(amount)` |

> ⚠️ **Do not use the signed helper for the discount lines.** `header.discountTotal` is
> `Math.abs()`'d in `extractHeaderData()`, and those call sites hand-roll their own `-` prefix.
> Swapping them produces `-£-…`. They deliberately still use `formatNumber()` / `formatCurrency()`.

A value of exactly zero renders `£0.00`, never `-£0.00`.

---

## 6. Removed in v4.4.0

- Both `HP_GRANT_AMOUNT = 7500` constants.
- The dead `.grant-banner` code in the Quote Suitelet: the `showGrantBanner` parameter of
  `renderCategorySection()`, the `if (showGrantBanner) { … }` block containing the "may be eligible
  for a £7,500 Government grant" HTML, the `false` argument at both call sites, and the five
  `.grant-banner*` CSS rules. All unreachable — both call sites passed `false`, and Heat Pump/UFH do
  not use `renderCategorySection` at all.

> ⚠️ `.grant-banner` (removed) and `.hp-grant-banner` (live) are different elements. Only the former
> was dead code.

---
---

# Part 2 — VAT (v4.5.0)

## 7. The problem, stated once

The scripts had **never** calculated VAT. There was no `0.2` multiplier anywhere in the pre-v4.5.0
codebase — both surfaces echoed NetSuite's `taxtotal` verbatim. Heat pump quotes displayed 20%
because **the tax codes on those Estimate lines are wrong in NetSuite**.

UK VAT on heat pump installations is **0%** (energy-saving materials relief); underfloor heating is
standard-rated at **20%**.

> ⚠️ **v4.5.0 corrects the display, not the data.** NetSuite still invoices from its own tax codes.
> A quote page showing £0.00 VAT against an Estimate that will invoice £1,200 is a commercial
> problem, not a cosmetic one. Every disagreement over 1p writes a **`VAT_MISMATCH`** audit entry
> naming the Estimate and both figures. **That log is the work-list for fixing the source data.**

## 8. Resolution — once per quote

`nuheat_vat_rates.js` → `resolveVatRate(quoteType)` returns:

```js
{ rate: 0 | 0.20, percent: '0%' | '20%', matched: Boolean, quoteType: String }
```

| Technology | Rate |
|---|---|
| Heat Pump | 0% |
| Solar | 0% ⚠️ assumed — see `FIELD_REFERENCE.md` |
| Underfloor Heating | 20% |
| Other / unrecognised | 20% (`DEFAULT_VAT_RATE`) + `VAT_RATE_UNMATCHED` logged |

**Every Estimate is single-technology**, so one rate applies to the whole quote page. The Master
Proposal is what groups technologies. No line-level tax capture is needed and `extractLineItems()`
deliberately does not read `taxcode` / `taxrate1`.

**Quote-type normalisation.** `VAT_RATES` is keyed on display names, but callers hold raw
`custbody_quote_type` values. `normaliseQuoteType()` maps raw → display inside the module.
Without it, `'Heat Pump (ASHP)'` would not match and would fall through to the 20% default —
charging a heat pump 20%, and silently, because UFH raw values default to 20% and look correct.

## 9. Derived figures — one calculation block

Computed once in `loadQuoteData()`, **immediately before** the BUS block so the corrected total can
feed it. Stored on `quoteData.vat`, logged as `VAT_FIGURES`.

| Figure | Formula |
|---|---|
| `netAmount` | `header.subtotal - header.discountTotal` — **VAT applies after discount** |
| `amount` | `round(netAmount × rate, 2)` |
| `correctedTotalIncVat` | `netAmount + amount` — replaces NetSuite's `total` for display |
| `percent` | `'0%'` / `'20%'` |

`header.discountTotal` is already `Math.abs()`'d, and the codebase's documented invariant is
`total = subtotal - discount + tax`, so `subtotal` is gross of discount and the subtraction is right.

### Total inc VAT must be recomputed — the easy thing to miss

NetSuite's `total` already contains the **wrong** VAT. Recomputing VAT without recomputing the total
leaves the two inconsistent, so the BUS block now reads:

```js
var totalIncVatAfterBus = correctedTotalIncVat - busAmount;   // was headerData.total - busAmount
```

`balanceAfterBus` is ex-VAT and **unchanged**. The BUS grant applies to the heat pump, which is
0%-rated, so deducting it from an inc-VAT total remains arithmetically sound.

### Quote-type source

`custbody_quote_type` is read in `extractHeaderData()` inside a try/catch — `getText()` on a list
field is unreliable. When it comes back empty, `loadQuoteData()` infers from the grouped items
(Heat Pump → Solar → Underfloor Heating) and logs the route as `VAT_QUOTE_TYPE`.

## 10. Where VAT renders — Quote page

| Section | Function | Behaviour |
|---|---|---|
| Top total section | `renderTopTotalSection()` | `VAT at 0%: £0.00` / `VAT at 20%: £x` from `quoteData.vat`; Total inc VAT from `bus.totalIncVatAfterBus` |
| Lower total section | `renderTotalSection()` | same (still no call site — updated for consistency) |
| Heat pump price card | `renderHeatPumpTreeSection()` | **"plus VAT" removed** |
| Category cost card (Solar / Commissioning) | `renderCategorySection()` | **"plus VAT" removed** |
| Total system price headline | `renderTopTotalSection()` | **"plus VAT" KEPT** — VAT is referenced only here |
| Design+ upgrade price (UFH upgrade banner) | `renderUFHTreeSection()` | **"plus VAT" KEPT** — not a section price card |

The `.hp-price-vat` / `.category-cost-vat` CSS rules are deliberately left in `generateCSS()` —
harmless once unused, and the mobile overrides reference them.

No blended-VAT note on the quote page: each Estimate is single-technology, so there is nothing to
blend.

## 11. Where VAT renders — Master Proposal

The proposal cannot resolve VAT itself. `nuheat_send_quote_sl.js` derives it per Estimate and passes
`vatRate` / `vatPercent` through hidden sublist fields (`custpage_vat_rate`, `custpage_vat_percent`),
and **overrides `taxTotal` and `amount`** with the derived figures.

> ⚠️ `taxTotal` and `amount` reaching the proposal are **derived, not raw NetSuite values.** This is
> not a regression of the v1.4.9 `record.load()` fix — those reads are unchanged; the tax figure is
> recalculated afterwards. On the fallback path (when `record.load()` fails) the NetSuite values are
> still used, since deriving there would silently zero the quote's amount.

| Element | Behaviour |
|---|---|
| Headline total bar | `calculateTotals()` sums each quote's own `taxTotal` — **unchanged logic**, correct blend once the per-quote figures are corrected |
| Blended-VAT note | Shown only when the main quotes contain **a heat pump quote AND at least one 20%-rated quote** |

### The blended-VAT note

> The VAT amount shown is blended between the underfloor heating at 20% and heat pump quote at 0%.
> Please see below for more information.

⚠️ **The gate is deliberately stricter than specified.** The brief asked for "if the proposal
includes a heat pump", but on a heat-pump-**only** proposal that sentence describes blending with
underfloor heating that is not in the proposal. Both flags derive from the passed-through
`vatRate` / `busRate`, not `quoteType` string matching:

- `hasHeatPumpQuote` — any main quote with `busRate !== 'none'` **or** `quoteType === 'Heat Pump'`
- `hasStandardRatedQuote` — any main quote with `vatRate > 0`

## 12. Audit log tags

| Tag | Written by | Meaning |
|---|---|---|
| `VAT_QUOTE_TYPE` | Quote Suitelet | which route resolved the quote type |
| `VAT_FIGURES` | Quote Suitelet | all derived VAT figures, as JSON |
| `VAT_RATE_UNMATCHED` | VAT module | quote type not in `VAT_RATES`; defaulted to 20% |
| `VAT_MISMATCH` | VAT module | **derived VAT disagrees with NetSuite — fix the tax codes on this Estimate** |
| `SendQuoteSL.VAT` | Send Quote SL | per-Estimate rate, net, derived VAT and NetSuite tax total |

---
---

# Part 3 — Refund presentation (v4.5.1)

Presentation only. Every figure below already existed on `quoteData.bus`, `quoteData.vat` or the
proposal's `totals` — v4.5.1 changed **where and how** they render, not what they are.

## 13. The refundable amount — one rule

> The refundable amount is **`Math.max(0, -totalIncVatAfterBus)`** — the VAT-INCLUSIVE balance,
> shown as a POSITIVE figure, and only when it is greater than zero.

⚠️ **Not `bus.creditDue`.** `creditDue` is ex-VAT; what the customer actually receives back is
VAT-inclusive. The two are identical today because the BUS grant only applies to heat pumps, which
are 0%-rated — but the inc-VAT figure is correct rather than coincidentally correct, and will not
silently break if the VAT rules change.

`Math.max(0, -x)` does three jobs at once: forces a positive display, suppresses the row entirely at
a zero or positive balance, and rules out `-£0.00`.

## 14. Where the refund renders

| Surface | Element | Gate | Shows |
|---|---|---|---|
| Quote page — top total | `renderTopTotalSection()`, `.top-total-breakdown-item` | `refundableAmount > 0` | `Refundable amount: £2,351.88` |
| Quote page — lower total | `renderTotalSection()`, `.total-breakdown-item` | same | same |
| Proposal — quote card | `generateQuoteCard()`, `.system-card-refund` | `totalIncVat < 0` | `Refundable to you on completion` (label, no figure) |

⚠️ **Both quote-page total sections must stay in step.** They render the same figures at the top and
bottom of the page and look broken if only one changes.

On the quote page the line sits **between** the VAT line and `Total inc VAT`. The `Total inc VAT`
line and its top border are unchanged.

The proposal card carries a **label with no figure** — the amount is already the price line it sits
beside and the `Total inc. VAT:` clause below it.

## 15. Proposal card detail line — what remains

`detailParts` now holds at most two clauses:

| Clause | When |
|---|---|
| `Discount: -£x` | `discountTotal !== 0` |
| `Total inc. VAT: £x` | `totalIncVat !== 0 \|\| quoteHasBus` |

**Removed in v4.5.1:** `Includes £x BUS grant` (redundant — the `.grant-highlight` banner below the
cards already announces it) and `£x refundable to you` (promoted to the price-line label).

## 16. Proposal total header — blended VAT

```
£2,936.67 plus VAT £1,057.71
─────────────────────
Total inc. VAT: £3,994.38
```

`totals.vat` from `calculateTotals()` is the sum of every selected quote's own VAT — already the
blended figure (UFH at 20% + HP at 0%). No new calculation.

> ⚠️ **`plus VAT` does not always equal `Total inc. VAT − subtotal`.** That identity holds only when
> there is no discount. With one, `totalIncVat − subtotal = vat − discount`, because the headline
> subtotal is gross of discount and the discount is shown as its own breakdown line. This is not a
> divergence between `totals.vat` and `totals.totalIncVat` — the displayed arithmetic is correct
> either way: `subtotal − discount + VAT = Total inc. VAT`.
