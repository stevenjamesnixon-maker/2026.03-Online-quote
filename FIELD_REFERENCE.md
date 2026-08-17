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

## BUS (Boiler Upgrade Scheme) Grant Items

The BUS deduction applied to a heat pump quote is **not** a NetSuite field — it is resolved from the
**Suppak line item** present on the Estimate. Names are matched by exact equality after
normalisation (last colon-delimited segment, whitespace collapsed, lowercased), so
`Suppak BUS - Uplift` can never be matched by the `Suppak BUS` entry.

Defined in `nuheat_bus_grant.js`. Change the rates or the item lists there and both the quote page
and the Master Proposal follow.

### Item name → rate

| Suppak item name | Normalised match | BUS rate | `busRate` |
|---|---|---|---|
| `Suppak N1(R)HP` | `suppak n1(r)hp` | £7,500 | `standard` |
| `Suppak N1(NB)HP` | `suppak n1(nb)hp` | £7,500 | `standard` |
| `Suppak BUS` | `suppak bus` | £7,500 | `standard` |
| `Suppak BUS - Uplift` | `suppak bus - uplift` | £9,000 | `enhanced` |
| Any other `Suppak …` line | prefix `suppak` only | none | `none` |
| No Suppak line at all | — | none | `none` |

### Precedence

1. **Enhanced beats standard** — if both are somehow present, £9,000 applies.
2. A **non-qualifying** Suppak line suppresses the grant **only** when no qualifying Suppak line is
   present. It never overrides a qualifying one.
3. **No Suppak line** means no BUS deduction, and the grant card is hidden entirely.

### Where the grant amount lives on the Estimate

The grant itself is a **line on the Estimate**, so NetSuite's standard `subtotal` field is
**already net of it**. Code must add it back to recover the pre-grant value
(`grossSubtotal = subtotal + busAmount`) and deduct exactly once. Never subtract `busAmount` from
`subtotal` — that double-counts the grant.

### Sublist fields (Send Quote Suitelet form)

| Field ID | Type | Purpose |
|---|---|---|
| custpage_bus_amount | Text (hidden) | Resolved BUS amount (`0` / `7500` / `9000`) carried through the form POST round-trip to the Master Proposal |
| custpage_bus_rate | Text (hidden) | Resolved rate (`none` / `standard` / `enhanced`) |
