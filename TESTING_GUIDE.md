# Testing Guide

**Last Updated:** 17 August 2026

> Referenced from `README.md` as `docs/TESTING_GUIDE.md`. All project files live at the repository
> root — there is no `docs/` directory.

---

## BUS Grant Rates & Post-Grant Balance (v4.4.0 / v1.7.0 / v1.6.0)

Build these estimates in Sandbox (**472052_SB1**) and check **both** the quote page and the Master
Proposal for each.

| # | Scenario | Suppak line | HP value ex VAT | Expected HP price | Expected balance | Grant card |
|---|---|---|---|---|---|---|
| 1 | Standard, grant exceeds quote (**the reported bug**) | `Suppak N1(R)HP` | £6,805.60 total, £1,175.93 comm. | £0.00 | −£694.40 | £7,500 + refund line showing £694.40 |
| 2 | Standard, normal | `Suppak N1(NB)HP` | £18,000 | £18,000 − comm − £7,500 | positive | £7,500, no refund line |
| 3 | Standard via BUS item | `Suppak BUS` | any | as #2 | positive | £7,500 |
| 4 | Enhanced | `Suppak BUS - Uplift` | £15,000 | £15,000 − comm − £9,000 | positive | **£9,000**, no refund line |
| 5 | Enhanced, grant exceeds quote | `Suppak BUS - Uplift` | £8,000 | £0.00 | negative | £9,000 + refund line |
| 6 | Non-qualifying Suppak | e.g. `Suppak N2` | any | full value, no deduction | = subtotal | **card hidden** |
| 7 | No Suppak line | none | any | full value | = subtotal | **card hidden** |
| 8 | Exactly at grant value | `Suppak BUS` | HP gross exactly £7,500 | £0.00 | see note below | £7,500, **no** refund line |
| 9 | Non-heat-pump quote (UFH only) | n/a | n/a | n/a | unchanged | not rendered |
| 10 | Multi-system quote (UFH + HP) | `Suppak N1(R)HP` | mixed | check UFH price unaffected | balance correct | £7,500 |

### Note on scenario 8

The balance is £0.00 **only when commissioning is zero**. With commissioning billed, the balance
correctly retains the commissioning value (e.g. £1,175.93) — the grant zeroes the *heat pump*
component, not the whole quote.

To test the `-£0.00` guard specifically, build a quote whose **whole ex-VAT value** equals the grant
(£7,500 with no commissioning). The headline must read `£0.00`, never `-£0.00`.

### Specific things to eyeball

- **No `£-` anywhere.** Negatives must render as `-£694.40`. Check both total bars, the Master
  Proposal cards and the Master Proposal total bar.
- Scenario 8 must not produce `-£0.00`.
- Master Proposal card total and headline total bar must agree.
- Scenarios 6, 7 and 9 must be byte-identical to v4.3.69 output — no regression for quotes without a
  grant.
- The quote page has **two** total bars (top and bottom). Both must show the same figures.
- Scenario 1: heat pump price £0.00 and commissioning £1,175.93 will **not** sum to the −£694.40
  total. That is expected with `CASCADE_GRANT_TO_COMMISSIONING = false` — see the open point in
  `CHANGELOG.md`.

---

## Standard release checklist

Run for every release, in addition to the scenario table above:

- [ ] Manual "Regen quote" button on **≥2** estimates
- [ ] Auto-generation on save (User Event script)
- [ ] Incognito / public URL access (no NetSuite login)
- [ ] Mobile layout at **768px**
- [ ] Download PDF renders correctly
- [ ] Script Execution Log clean — no errors, and `BUS_RESOLVE` / `BUS_FIGURES` audit lines present
      and correct
- [ ] File Cabinet file written correctly
- [ ] Master Proposal **preview** and **sent** proposal show the same grant (they take different code
      paths — preview goes via the client script payload, send via the sublist POST round-trip)

---

## Offline verification

Three Node suites exercise the shipped source directly (no NetSuite required) — arithmetic and
resolver, Master Proposal pricing helpers, and emitted HTML. They cover all 10 scenarios above plus
name normalisation, precedence, negative and `-£0.00` formatting, and float-residue edge cases.

These are a fast regression check, **not** a substitute for Sandbox verification: they cannot
exercise NetSuite record loading, governance limits, or actual rendering.
