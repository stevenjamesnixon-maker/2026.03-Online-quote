# 2026.03-Online-quote

# Nu-Heat Online Quote System

> A NetSuite SuiteScript 2.1 solution that generates branded, customer-facing HTML quote pages and master proposals for Nu-Heat — accessible via stable public URLs without login.

![Nu-Heat Brand](https://img.shields.io/badge/Brand-Nu--Heat-00857D)
![SuiteScript](https://img.shields.io/badge/SuiteScript-2.1-blue)
![Status](https://img.shields.io/badge/Status-Production%20Ready-green)
![Version](https://img.shields.io/badge/Suitelet-v4.3.53-brightgreen)

---

## Overview

This solution replaces legacy hard-coded HTML approaches with a modern, maintainable system that:

- 🎯 **Generates branded quote pages** matching Nu-Heat brand guidelines
- 🔗 **Stable public URLs** — customers access quotes without NetSuite login; URLs never change
- 📱 **Responsive design** — desktop, tablet, and mobile (768px breakpoint)
- 🖨️ **Print-to-PDF** — built-in download button
- 🔄 **Auto-generation** — quotes generated on every Estimate save
- 📄 **Master Proposals** — combine multiple quotes from one Opportunity into a single proposal
- ⚡ **Always fresh** — proxy URLs serve the latest content with no-cache headers
- 🔒 **Version control** — keeps last 5 file versions per quote

---

## System Architecture

```
Customer Browser ──── Proxy URL ──▶ Quote Viewer SL ──▶ File Cabinet (latest HTML)
                                         ▲
                                         │
                  ┌── Auto (UE afterSubmit) ──┐
Estimate Save ────┤                           ├──▶ Quote Suitelet ──▶ HTML File
                  └── Manual (Regen button) ──┘        │
                                                       └──▶ custbody_test_new_quote = proxy URL

Opportunity ──▶ Send Quote SL ──▶ Master Proposal ──▶ HTML File + Email
```

### Data Flow

1. **Trigger** — Estimate saved or "Regen quote" clicked
2. **Load** — Quote data extracted from Estimate record
3. **Render** — Self-contained HTML generated with embedded CSS and base64 logo
4. **Save** — HTML file stored in File Cabinet (folder 26895192)
5. **URL** — Stable proxy URL stored on Estimate record

---

## Project Structure

```
nuheat_netsuite_suitelet/
├── src/
│   ├── nuheat_quote_suitelet.js       # Core quote HTML generation engine (v4.3.53)
│   ├── nuheat_quote_ue.js             # User Event — auto-gen + "Regen quote" button (v4.0.9)
│   ├── nuheat_quote_cs.js             # Client Script — button handler (v4.0.6)
│   ├── nuheat_quote_viewer_sl.js      # Proxy Suitelet for stable URLs (v1.1.0)
│   ├── nuheat_quote_generator_ss.js   # Scheduled Script fallback (v1.0.0)
│   ├── nuheat_master_proposal.js      # Master Proposal generator (v1.6.2)
│   ├── nuheat_send_quote_sl.js        # Quote selection Suitelet (v1.4.9)
│   ├── nuheat_send_quote_cs.js        # Send Quote form handler (v1.1.1)
│   ├── nuheat_opportunity_ue.js       # Opportunity "Send Quote" button (v1.0.0)
│   └── nuheat_opportunity_cs.js       # Opportunity button handler (v1.0.0)
├── docs/
│   ├── TECHNICAL_DOCUMENTATION.md     # Full technical reference
│   ├── USER_GUIDE.md                  # End-user guide
│   ├── AI_AGENT_CONTEXT.md            # Context document for AI development sessions
│   ├── DEPLOYMENT_CHECKLIST.md        # Production deployment checklist
│   ├── VERSION_HISTORY.md             # Detailed version history
│   ├── CONFIGURATION_CHECKLIST.md     # Required custom fields
│   ├── TESTING_GUIDE.md               # Test scenarios & checklist
│   ├── EMAIL_TEMPLATE.md              # Email template for quotes
│   ├── SETUP_INSTRUCTIONS.md          # Setup guide
│   ├── DEBUG_GUIDE.md                 # Debug mode reference
│   └── ... (additional guides)
├── assets/                            # Logo images (source + cropped)
├── mockups/                           # HTML mockups for design review
├── CHANGELOG.md                       # Detailed changelog
├── ARCHITECTURE.md                    # Architecture deep-dive
├── DEVELOPER_GUIDE.md                 # Developer reference
├── FIELD_REFERENCE.md                 # NetSuite field reference
└── README.md                          # This file
```

---

## Features

### Individual Quote Pages
- Personalised greeting with customer first name
- Customer information and account manager details
- Trust badges (Insurance Backed, Guaranteed Performance, Lifetime Tech Support, Trustpilot)
- Product sections grouped by category (UFH, Heat Pump, Solar, Commissioning)
- Product cards with images, features grid, and "View more details" links
- Component Breakdown (collapsible table)
- Project Specification with room-by-room details
- Thermostat options with product comparison tiles
- Upgrades & Offers section
- "What Happens Next" 4-step process
- CTA banner with Call Now / Email buttons
- Responsive design with mobile-optimised layout

### Master Proposals
- Aggregates multiple quotes from one Opportunity
- Quote cards with benefits, pricing, and "View Full Quote" links
- Main vs Alternative quote categorisation
- BUS Grant banner for Heat Pump quotes
- Value proposition section
- Email sending capability

### Stable URLs
- Proxy URLs via Quote Viewer Suitelet — **never change** when quotes are regenerated
- No-cache headers ensure customers always see the latest content
- Master Proposal links to individual quotes remain valid

---

## Quick Start

### 1. Deploy Scripts

Upload all scripts from `src/` to **File Cabinet > SuiteScripts > NuHeat**.

### 2. Create Script Records

For each script, create a Script Record and Deployment:

| Script | Type | Deployment ID | Key Settings |
|--------|------|---------------|-------------|
| Quote Suitelet | Suitelet | `customdeploy1` | Available Without Login ✅ |
| Quote UE | User Event | `customdeploy_nuheat_quote_ue` | Applies To: Estimate |
| Quote CS | Client Script | `customdeploy_nuheat_quote_cs` | Applies To: Estimate |
| Quote Viewer | Suitelet | `customdeploy_nuheat_quote_viewer` | Available Without Login ✅, All Roles |
| Send Quote SL | Suitelet | `customdeploy_nuheat_send_quote_sl` | — |
| Opportunity UE | User Event | `customdeploy_nuheat_opportunity_ue` | Applies To: Opportunity |
| Opportunity CS | Client Script | `customdeploy_nuheat_opportunity_cs` | Applies To: Opportunity |

### 3. Configure Custom Fields

Ensure these fields exist on the Estimate record:
- `custbody_test_new_quote` (URL) — stores the generated quote URL
- `custbody_project_name`, `custbody_project_address`, `custbody_project_id`
- `custbody_rooms_html` (Rich Text) — room specifications

See [Configuration Checklist](docs/CONFIGURATION_CHECKLIST.md) for the full list.

### 4. Test

1. Open an Estimate and click **"Regen quote"**
2. Click the URL in the success dialog
3. Verify the quote page displays correctly
4. Test in an incognito/private window (verifies public access)

---

## Configuration

### Key Settings

| Setting | Value |
|---------|-------|
| File Cabinet Folder ID | `26895192` |
| Folder Path | `SuiteScripts > NuHeat > Quote HTML Files` |
| Quote URL Field | `custbody_test_new_quote` |
| Viewer Script ID | `3286` / `customscript_nuheat_quote_viewer` |
| Max File Versions | `5` (per quote) |
| Mobile Breakpoint | `768px` |

### Brand Colours

| Colour | Hex | Usage |
|--------|-----|-------|
| Primary Teal | `#00857D` | Headers, buttons, accents |
| Dark Blue | `#074F71` | Header gradient |
| CTA Magenta | `#9B1B7E` | Call-to-action banners |
| Text Grey | `#53565A` | Body text |

### Typography

- **Font:** Poppins (Google Fonts)
- **Weights:** 300, 400, 500, 600, 700

---

## Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [Technical Documentation](docs/TECHNICAL_DOCUMENTATION.md) | Architecture, configuration, API reference | Developers, Administrators |
| [User Guide](docs/USER_GUIDE.md) | How to use the system | Account managers, Staff |
| [AI Agent Context](docs/AI_AGENT_CONTEXT.md) | Context for AI development sessions | AI Agents (Claude, etc.) |
| [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) | Step-by-step deployment | Administrators |
| [Version History](docs/VERSION_HISTORY.md) | Detailed change log | All |
| [Developer Guide](DEVELOPER_GUIDE.md) | Code structure, making changes | Developers |
| [Field Reference](FIELD_REFERENCE.md) | All NetSuite fields used | Developers, Administrators |
| [Testing Guide](docs/TESTING_GUIDE.md) | Test scenarios | QA, Developers |

---

## Version History

| Component | Current Version | Last Updated |
|-----------|----------------|--------------|
| Quote Suitelet | v4.3.53 | 28 Mar 2026 |
| Quote UE Script | v4.0.9 | 28 Mar 2026 |
| Quote Client Script | v4.0.6 | 28 Mar 2026 |
| Quote Viewer | v1.1.0 | 28 Mar 2026 |
| Master Proposal | v1.6.2 | 28 Mar 2026 |
| Send Quote Suitelet | v1.4.9 | 28 Mar 2026 |
| Send Quote CS | v1.1.1 | 28 Mar 2026 |
| Opportunity UE | v1.0.0 | 28 Mar 2026 |
| Opportunity CS | v1.0.0 | 28 Mar 2026 |
| Scheduled Script | v1.0.0 | Mar 2026 |

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

---

## Contributing

1. Create a feature branch from `master`
2. Make changes and test in NetSuite Sandbox
3. Update version numbers in script headers
4. Update `CHANGELOG.md` with changes
5. Submit for code review

---

## License

© 2026 Nu-Heat UK Ltd. All rights reserved.

This software is proprietary and confidential. Unauthorised copying, distribution, or use is strictly prohibited.

---

## Support

- **Internal:** NetSuite Administrator
- **Documentation:** `/docs` folder
- **Nu-Heat:** info@nu-heat.co.uk | 01404 540650
