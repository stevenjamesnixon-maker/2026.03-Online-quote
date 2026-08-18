# Testing Guide

**Last Updated:** 18 August 2026
**Environment:** Sandbox (472052_SB1)

---

## BUS Grant Rates & Post-Grant Balance (v4.4.0 / v1.7.0 / v1.6.0 / v1.0.0)

> ⚠️ **Before testing:** upload **`nuheat_bus_grant.js` AND `nuheat_vat_rates.js`** to
> `SuiteScripts/NuHeat` **first**, then the Quote Suitelet and Send Quote SL. Both consumers fail at
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

---

## VAT by Technology (v4.5.0 / v1.8.0 / v1.7.0 / VAT Module v1.0.0)

> ⚠️ **The display fix is a stopgap.** The scripts now derive the VAT rate that *should* apply and
> show that. NetSuite still invoices from its own tax codes, which are wrong on heat pump Estimates.
> **Every `VAT_MISMATCH` in the Execution Log is an Estimate whose tax codes need correcting.**
> Treat that log as the deliverable of this test pass, not just a pass/fail signal.

### Scenario matrix

| # | Scenario | Expected |
|---|---|---|
| V1 | HP-only quote page | `VAT at 0%: £0.00`; Total inc VAT = ex-VAT total; **no** "plus VAT" on the HP price card |
| V2 | UFH-only quote page | `VAT at 20%: £x`; VAT = 20% of (subtotal − discount) |
| V3 | HP quote whose Estimate has 20% tax codes | Page shows £0.00; `VAT_MISMATCH` logged with both figures |
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
| `VAT_MISMATCH` | VAT module | **the work-list.** Each entry names an Estimate whose tax codes are wrong |
| `VAT_RATE_UNMATCHED` | VAT module | expected only in V9; anywhere else means a quote type is missing from `QUOTE_TYPE_ALIASES` |
| `VAT_QUOTE_TYPE` | Quote Suitelet | which route resolved the type — "inferred from grouped items" means `custbody_quote_type` was unreadable |
| `VAT_FIGURES` | Quote Suitelet | all derived VAT figures as JSON |
| `SendQuoteSL.VAT` | Send Quote SL | per-Estimate rate, net, derived VAT, NetSuite tax total |
| `BUS_RESOLVE` / `BUS_UNMATCHED` | BUS module | unchanged from v4.4.0 — confirm no regression |
