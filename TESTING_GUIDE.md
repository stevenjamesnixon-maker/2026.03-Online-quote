# Testing Guide

**Last Updated:** 18 August 2026
**Environment:** Sandbox (472052_SB1)

---

## BUS Grant Rates & Post-Grant Balance (v4.4.0 / v1.7.0 / v1.6.0 / v1.0.0)

> ⚠️ **Before testing:** upload `nuheat_bus_grant.js` to `SuiteScripts/NuHeat` **first**, then the
> Quote Suitelet and Send Quote SL. Both consumers fail at load time if the module is not already
> present. See `DEPLOYMENT_CHECKLIST.md`.

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
- [ ] Master Proposal **preview** and the saved/emailed proposal show the same grant. (Preview reads
      the grant from the client-script payload — a mismatch means `nuheat_send_quote_cs (1).js` was
      not redeployed.)
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
