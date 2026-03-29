# Version History

## Master Proposal (`nuheat_master_proposal.js`)

### v1.6.3 — 29 March 2026 (email URL fix)

- FIXED: Email "VIEW YOUR QUOTES HERE" button broken on all clients (desktop: invalid URL redirect error, mobile: silent no-op)
- FIXED: `file.url` relative path now converted to absolute `https://` URL before storage and email injection
- ADDED: `getAccountHostname()` helper using `N/runtime.accountId` — dynamically derives correct subdomain for both Sandbox and Production
- ADDED: `N/runtime` module import

### v1.6.3 — 28 March 2026 (folder ID fix)

#### Fixed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Resolves "Invalid folder reference key 21719365" error when generating Master Proposals
  in the Production account

---

## Quote Suitelet (`nuheat_quote_suitelet.js`)

### v4.3.54 — 29 March 2026 (thermostat options fix)

- FIXED: Thermostat options always showing static fallback — `custitem_*` fields invalid as `search.Type.ITEM` columns, causing `SSS_INVALID_SRCH_COL`. Refactored to two-step search + `record.load()` pattern.
- FIXED: Feature bullet points empty — fab field internal IDs are double-prefixed (`custitemcustitem_quote_fab_1` through `_6`). Updated all six field reads to use correct internal IDs.
- FIXED: neoHub+ Recommended banner not rendering — changed `RECOMMENDED_ITEM_ID` comparison to case-insensitive.

### v4.3.54 — 28 March 2026 (design package detection)

#### Added
- `DESIGN_PACKAGE_ITEMS` constant mapping item internal IDs for MPDP-C (Standard UFH Design, ID: 480)
  and MPDPCD-C (UFH Design+ Upgrade, ID: 5488)
- `hasDesignPackageItem(lineItems, targetItemId)` helper function — detects design package presence
  by matching item internal ID, not product type
- Three new flags on `quoteData` object:
  - `hasDesignPackage` — true if either design package is present
  - `hasDesignPackageStandard` — true if MPDP-C is present
  - `hasDesignPackageUpgrade` — true if MPDPCD-C is present
- Audit log entry in `loadQuoteData()` confirming design package detection result per quote

#### Notes
- No changes to rendered quote page output — this is detection/data only
- Flags are available to all render functions via the `quoteData` object, ready for a future
  design package rendering feature
