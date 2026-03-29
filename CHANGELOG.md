## v1.6.3 — Master Proposal: Fix broken email button URL
**Date:** 29 March 2026
**Component:** Master Proposal (`src/nuheat_master_proposal.js`)

### Bug Fixed
The "VIEW YOUR QUOTES HERE" button in the customer proposal email was broken for all recipients:
- **Desktop:** Google "Redirect Notice — The page you were on is trying to send you to an invalid URL (`http:///core/media/media.nl?id=...`)"
- **Mobile:** Button tap did nothing (mail clients silently drop malformed hrefs)

### Root Cause
`file.load().url` in NetSuite returns a **relative path** (e.g. `/core/media/media.nl?id=43237660&c=472052&h=...`). This was being stored directly as `proposalUrl` and injected into the email `href` attribute. Email clients have no NetSuite base URL to resolve it against, producing `http:///` (protocol with no hostname).

### Fix
- Added `getAccountHostname()` helper using `N/runtime.accountId` to dynamically derive the fully-qualified account URL (e.g. `https://472052-sb1.app.netsuite.com`). Handles both Sandbox (`_SB1` → `-sb1`) and Production automatically.
- `saveProposalToFileCabinet()` now prepends the hostname to produce an absolute `https://` URL.
- Added `N/runtime` to module imports.

### Files Changed
- `src/nuheat_master_proposal.js` — v1.6.2 → v1.6.3

### Testing
- [ ] Generate and send a proposal from the Send Quote UI
- [ ] Click "VIEW YOUR QUOTES HERE" in the received email on desktop — should open proposal page
- [ ] Click the button on mobile — should open proposal page
- [ ] Check Script Execution Log — verify "Absolute URL" log entry shows a valid `https://` URL
- [ ] Confirm "View Master Proposal" link on the NetSuite success page also works
- [ ] Repeat test from Sandbox to verify subdomain format is correct (`472052-sb1.app.netsuite.com`)

---

## [1.6.3] Master Proposal — 28 March 2026

### Fixed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Resolves "Invalid folder reference key 21719365" error when generating Master Proposals
  in the Production account

---

## [4.3.54] Quote Suitelet — 28 March 2026

### Added
- `DESIGN_PACKAGE_ITEMS` constant mapping item internal IDs for MPDP-C (Standard UFH Design, ID: 480)
  and MPDPCD-C (UFH Design+ Upgrade, ID: 5488)
- `hasDesignPackageItem(lineItems, targetItemId)` helper function — detects design package presence
  by matching item internal ID, not product type
- Three new flags on `quoteData` object:
  - `hasDesignPackage` — true if either design package is present
  - `hasDesignPackageStandard` — true if MPDP-C is present
  - `hasDesignPackageUpgrade` — true if MPDPCD-C is present
- Audit log entry in `loadQuoteData()` confirming design package detection result per quote

### Fixed
- Removed duplicate `DESIGN_PACKAGE_ITEMS` declaration that caused SyntaxError on script load
  (constant already existed in the file prior to v4.3.54)

### Notes
- No changes to rendered quote page output — this is detection/data only
- Flags are available to all render functions via the `quoteData` object, ready for a future
  design package rendering feature

---

## [Config] File Cabinet Folder ID — 28 March 2026

### Changed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Functional change in: `src/nuheat_quote_viewer_sl.js`, `src/nuheat_quote_suitelet.js`
- Comment/doc updates in: `src/nuheat_quote_ue.js`, `src/nuheat_quote_generator_ss.js`, `README.md`, `docs/AI_AGENT_CONTEXT.md`

### Notes
- Sandbox folder ID `21719365` preserved in `docs/AI_AGENT_CONTEXT.md` for reference
- If reverting to Sandbox, update `QUOTE_HTML_FOLDER_ID` in the two functional files above
