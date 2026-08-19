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
> | `nuheat_send_quote_sl.js` | ~:415 |
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

### ⚠️ The tax codes are the root cause

The scripts do not read the Estimate's tax codes — they derive the rate that *should* apply. Heat
pump quotes were showing 20% because **the tax codes on those Estimate lines are wrong in NetSuite**.
Where derived and NetSuite figures differ by more than 1p, `VAT_MISMATCH` is logged with the Estimate
ID and both amounts. **Those entries are the work-list for fixing the source data** — until they are
worked through, the quote page and the Estimate will disagree.

---

**Last Updated:** 18 August 2026
