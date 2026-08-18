# Section Logic Mapping — BUS Grant

**Last Updated:** 18 August 2026
**Applies to:** Quote Suitelet v4.4.0, Master Proposal v1.7.0, Send Quote SL v1.6.0, BUS Module v1.0.0

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
