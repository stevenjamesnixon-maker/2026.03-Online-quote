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
| custbody_opp_site_adress | Text | Site address — displayed in Customer Information section of Master Proposal (note: field ID has single 'd' in "adress") |

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

**Last Updated:** 18 August 2026
