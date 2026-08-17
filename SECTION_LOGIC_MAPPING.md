# Section Logic Mapping — BUS Grant

**Last Updated:** 17 August 2026

How the BUS (Boiler Upgrade Scheme) grant is resolved, what each derived figure means, and where
each one is rendered.

> Referenced from `README.md` as `docs/SECTION_LOGIC_MAPPING.md`. All project files live at the
> repository root — there is no `docs/` directory.

---

## 1. Resolution

`nuheat_bus_grant.js` → `resolveBusGrant(lineItems)` is the single source of truth. It is called:

| Caller | Where | Stored as |
|---|---|---|
| `nuheat_quote_suitelet.js` | `loadQuoteData()`, once per quote | `quoteData.bus` |
| `nuheat_send_quote_sl.js` | `searchRelatedQuotes()`, once per estimate | `quote.busAmount` / `quote.busRate` |

**Resolved once, never per section.** Every render function reads the same stored value.

The resolver must see **all** estimate lines. `extractLineItems()` in the Suitelet and
`extractItemNames()` in the Send Quote SL are both deliberately unfiltered — the Suppak lines that
drive the rate sit in the Commissioning category (product type Labour, ID 41) and would be lost to
`filterForRender()` / `EXCLUDED_PRODUCT_CATEGORIES`.

See `FIELD_REFERENCE.md` for the item-name → rate table and precedence rules.

---

## 2. The critical invariant — deduct exactly once

The grant is a **line on the NetSuite Estimate**. The standard `subtotal` field is therefore
**already net of the grant**.

```
grossSubtotal = header.subtotal + busAmount     ← add the grant BACK
balanceAfterBus = grossSubtotal - busAmount     ← deduct exactly once
                = header.subtotal               ← (algebraically identical)
```

There has never been a hard-coded `7500` subtraction in code; the only `7500` occurrences were
display copy. **Never subtract `busAmount` from `header.subtotal`** — that double-counts the grant.

The Master Proposal's `getQuoteBalance()` returns `subtotal` unchanged for exactly this reason.

---

## 3. Derived figures

Computed once in `loadQuoteData()` and hung off `quoteData.bus`:

| Figure | Formula | Can be negative? |
|---|---|---|
| `amount` | from `resolveBusGrant()` — 0, 7500 or 9000 | no |
| `grossSubtotal` | `header.subtotal + amount` | no (in practice) |
| `commissioningTotal` | `categoryTotals['Commissioning'].total` | no |
| `hpGross` | `grossSubtotal - commissioningTotal` | no |
| `hpDisplayPrice` | `Math.max(0, hpGross - amount)` | **no — clamped** |
| `residualGrant` | `Math.max(0, amount - hpGross)` | no |
| `commissioningDisplay` | cascade ? `max(0, commissioningTotal - residualGrant)` : `commissioningTotal` | no |
| `balanceAfterBus` | `grossSubtotal - amount` | **YES** |
| `creditDue` | `Math.max(0, -balanceAfterBus)` | no |

When `amount === 0` every figure collapses to pre-v4.4.0 behaviour: `hpDisplayPrice === hpGross`,
`balanceAfterBus === header.subtotal`, `creditDue === 0`.

---

## 4. Where each figure is rendered

### Quote page (`nuheat_quote_suitelet.js`)

| Figure | Function | Element | Conditional |
|---|---|---|---|
| `hpDisplayPrice` | `renderHeatPumpTreeSection()` | `.hp-price-amount` | always (HP quotes) |
| `amount` | `renderHeatPumpTreeSection()` | `.hp-grant-banner` `<strong>` | `amount > 0` |
| `creditDue` | `renderHeatPumpTreeSection()` | `.hp-grant-banner-refund` | `creditDue > 0` |
| `commissioningDisplay` | `renderCategorySection()` (commissioning) | `.category-cost-value` | always |
| `grossSubtotal` | `renderTotalSection()` + `renderTopTotalSection()` | "System price" line | `amount > 0` |
| `amount` | `renderTotalSection()` + `renderTopTotalSection()` | "BUS grant applied" line | `amount > 0` |
| `balanceAfterBus` | `renderTotalSection()` + `renderTopTotalSection()` | `.total-amount` headline + "Balance after BUS grant" line | `amount > 0` |
| `grossSubtotal` | solar section | `.category-cost-value` | solar present |

**There are two total bars** — `renderTopTotalSection()` at the top of the page and
`renderTotalSection()` near the bottom. Both show the same figures and must be kept in step.

### Master Proposal (`nuheat_master_proposal.js`)

| Figure | Function | Element | Conditional |
|---|---|---|---|
| balance (`getQuoteBalance`) | `generateQuoteCard()` | `.system-card-price` | HP quote with `busAmount > 0` |
| `busAmount` | `generateQuoteCard()` | `.system-card-price-detail` — "Includes £7,500 BUS grant" | HP quote with grant |
| credit | `generateQuoteCard()` | `.system-card-price-detail` — "£694.40 refundable to you" | balance negative |
| highest `busAmount` | `generateBUSGrantBanner(amount)` | `.grant-highlight` | main section, ≥1 HP quote with grant |
| aggregate balance | `generateTotalPriceBar()` | `.top-total-amount` | always |
| `busTotal` | `generateTotalPriceBar()` | "BUS grant applied" line | `busTotal > 0` |

---

## 5. Negative-value formatting

Every figure that can go negative renders through `formatSignedCurrency()`, which puts the minus
sign **before** the symbol: `-£694.40`, never `£-694.40`.

The sign is taken from the value **as displayed** (rounded to 2dp), not the raw float, because
`grossSubtotal` is a sum of NetSuite line amounts — a balance that should be exactly zero can arrive
as `-0.000000001` and would otherwise render `-£0.00`.

---

## 6. `CASCADE_GRANT_TO_COMMISSIONING`

Constant in `nuheat_quote_suitelet.js`. Default `false`.

- **`false`** — commissioning always shows its own price. Simple, but when the grant exceeds the
  heat pump value the visible component prices no longer sum to the balance in the total section.
- **`true`** — leftover grant reduces commissioning too, so the page adds up, but commissioning
  appears free.

One-line change either way.
