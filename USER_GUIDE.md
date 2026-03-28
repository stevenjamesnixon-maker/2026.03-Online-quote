# Nu-Heat Online Quote System — User Guide

**Version:** 1.0.0  
**Last Updated:** 28 March 2026  
**Audience:** Nu-Heat staff, account managers, administrators

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Generating a Quote](#3-generating-a-quote)
4. [Viewing & Sharing Quotes](#4-viewing--sharing-quotes)
5. [Regenerating a Quote](#5-regenerating-a-quote)
6. [Creating a Master Proposal](#6-creating-a-master-proposal)
7. [Understanding Quote URLs](#7-understanding-quote-urls)
8. [What Customers See](#8-what-customers-see)
9. [FAQ](#9-faq)
10. [Support & Contact](#10-support--contact)

---

## 1. Introduction

### What is the Online Quote System?

The Nu-Heat Online Quote System automatically generates professional, branded quote pages from your NetSuite Estimates. These pages can be shared with customers via a simple URL — **no NetSuite login required**.

### Key Benefits

- ✅ **Automatic generation** — Quotes are generated every time you save an Estimate
- ✅ **Professional design** — Branded pages matching Nu-Heat brand guidelines
- ✅ **Mobile-friendly** — Works on phones, tablets, and desktops
- ✅ **Print-to-PDF** — Customers can download their quote as a PDF
- ✅ **Stable URLs** — Links never break, even when quotes are updated
- ✅ **Always fresh** — Customers always see the latest version
- ✅ **Master Proposals** — Combine multiple quotes into one proposal

---

## 2. Getting Started

### Prerequisites

- A valid NetSuite account with access to Estimates
- The Online Quote scripts are deployed (your administrator will have set this up)

### What You Need to Know

- Every Estimate in NetSuite can have an online quote page
- The quote URL is stored in the **`Online Quote URL`** field (`custbody_test_new_quote`) on the Estimate
- Quotes are generated automatically when you save, and can be regenerated manually

---

## 3. Generating a Quote

### Automatic Generation (Default)

Every time you **create** or **edit** an Estimate and click **Save**, the system automatically:

1. Generates a branded HTML quote page
2. Saves it to the NetSuite File Cabinet
3. Stores the URL in the `Online Quote URL` field on the Estimate

**You don't need to do anything extra** — just save your Estimate as normal.

### Manual Generation ("Regen quote" Button)

If you need to force-regenerate a quote:

1. Open the Estimate record in NetSuite
2. Click the **"Regen quote"** button in the toolbar
3. A loading message will appear: "Saving & Generating Quote..."
4. Once complete, a success dialog shows the generated URL
5. Click the URL to preview the quote page

> **Note:** The "Regen quote" button automatically saves your record first, ensuring all your latest changes are included in the generated quote.

---

## 4. Viewing & Sharing Quotes

### Viewing a Quote

To view the online quote for an Estimate:

1. Open the Estimate in NetSuite
2. Find the **`Online Quote URL`** field (`custbody_test_new_quote`)
3. Click the URL to open the quote page in a new tab

### Sharing with Customers

You can share the quote URL with customers in several ways:

- **Copy the URL** from the `Online Quote URL` field and paste it into an email
- **Use the Master Proposal** feature to send a combined proposal with multiple quotes
- The URL works without any login — customers can access it directly

### What Customers Can Do

When a customer opens their quote URL, they can:

- View all product details, pricing, and specifications
- See their account manager's contact information
- Download the quote as a PDF using the **"Print quote"** button
- View the quote on any device (responsive design)

---

## 5. Regenerating a Quote

### When to Regenerate

You should regenerate a quote when:

- You've changed pricing, discounts, or line items
- You've updated customer information
- You want to ensure the quote reflects the absolute latest data

### How to Regenerate

1. Open the Estimate and make your changes
2. Click the **"Regen quote"** button
3. Wait for the success message
4. The quote URL **stays the same** — customers will see the updated content

> **Important:** Because the system uses stable proxy URLs, regenerating a quote does NOT change the URL. Any links you've already shared will automatically show the updated content.

---

## 6. Creating a Master Proposal

A Master Proposal combines multiple quotes from a single Opportunity into one professional document.

### Step 1: Open the Opportunity

1. Navigate to the Opportunity record in NetSuite
2. Click the **"Send Quote"** button in the toolbar

### Step 2: Select Quotes

The Send Quote page shows all Estimates linked to this Opportunity, grouped by type:

- **Underfloor Heating** quotes
- **Heat Pump** quotes
- **Solar Thermal** quotes
- **Other** quotes

For each quote:
1. Tick the checkbox to include it
2. Choose whether it's a **Main** or **Alternative** quote
3. Main quotes appear in the primary section; Alternative quotes appear separately

### Step 3: Enter Email Recipients (Optional)

If you want to email the proposal:
1. Enter recipient email addresses in the **To**, **CC**, and/or **BCC** fields
2. Multiple addresses can be separated by commas or semicolons

### Step 4: Generate or Preview

- Click **"Preview"** to see the proposal without saving
- Click **"Generate & Send"** to create the proposal, save it, and optionally email it

### Step 5: Review

The generated Master Proposal includes:

- Customer greeting with account manager details
- Total system price across all selected quotes
- Individual quote cards with pricing and "View Full Quote" buttons
- Value proposition section
- Call-to-action banner with contact details

---

## 7. Understanding Quote URLs

### How URLs Work

The system generates **proxy URLs** that look like:

```
https://472052-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=3286&deploy=1&quote=15393991&opp=13859229
```

Key points:
- This URL **never changes** for a given quote, even when regenerated
- It always shows the **latest version** of the quote
- It works **without any login** — safe to share with customers
- Each visit fetches fresh content (no caching)

### URL Stability

| Action | URL Changes? |
|--------|:----------:|
| Save Estimate | No |
| Regen quote | No |
| Change pricing/discount | No |
| Add/remove line items | No |
| First generation | URL is created |

---

## 8. What Customers See

### Quote Page Layout

The customer-facing quote page includes:

1. **Header** — Nu-Heat logo, phone number, email, "Print quote" button
2. **Greeting** — Personalised with customer first name
3. **Customer Information** — Name, system reference, quote date, expiry date
4. **Account Manager** — Name, email, phone
5. **Trust Badges** — Guaranteed Performance, Insurance Backed, Lifetime Tech Support, Rated Excellent
6. **Total System Price** — Prominent display with breakdown
7. **Product Sections** — Grouped by category (UFH, Heat Pump, Solar, etc.)
   - Product cards with images, features, and pricing
   - Component Breakdown (collapsible)
8. **Project Specification** — Room-by-room details (if available)
9. **Upgrades & Offers** — Thermostat options, training courses
10. **What Happens Next** — 4-step process guide
11. **Call-to-Action** — Contact banner with Call Now / Email buttons
12. **Footer** — Company details, address, social links

### Mobile Experience

On mobile devices (screen width under 768px):
- Navigation condensed (phone number only in header)
- Content stacks vertically
- Full-width product images
- Touch-friendly tap targets (44px minimum)
- CTA buttons span full width

---

## 9. FAQ

### General

**Q: Do customers need a NetSuite login to view quotes?**  
A: No. Quote URLs are public and work without any login.

**Q: What happens if I regenerate a quote after sharing the URL?**  
A: The URL stays the same, but the content updates. Customers will see the latest version.

**Q: Can I see previous versions of a quote?**  
A: The system keeps the last 5 versions in the File Cabinet, but the URL always shows the latest.

**Q: How do I know if a quote has been generated?**  
A: Check the `Online Quote URL` field on the Estimate. If it has a URL, the quote has been generated.

### Pricing

**Q: I changed the discount but the quote still shows the old price. What's wrong?**  
A: Click "Regen quote" — this saves the record first and passes fresh pricing. The new quote will show the correct values.

**Q: Why does the Master Proposal show different prices than individual quotes?**  
A: Ensure all individual quotes have been regenerated with the latest pricing before creating the Master Proposal.

### Troubleshooting

**Q: The "Regen quote" button is missing.**  
A: Contact your administrator to check that the User Event script is deployed correctly.

**Q: I get "You do not have privileges" when opening the quote URL.**  
A: The Quote Viewer deployment needs its permissions checked. Contact your administrator.

**Q: The quote URL field is empty.**  
A: Try clicking "Regen quote" manually. Check the Script Execution Log for any errors.

**Q: The customer says the quote page looks broken on their phone.**  
A: The system is responsive and tested on major browsers. Ask them to clear their browser cache. If the issue persists, contact support.

### Master Proposals

**Q: Can I include quotes from different Opportunities?**  
A: No, the Master Proposal only includes quotes linked to a single Opportunity.

**Q: What if a quote doesn't appear in the Send Quote selection?**  
A: Ensure the Estimate is linked to the Opportunity via the `opportunity` or `createdfrom` field.

---

## 10. Support & Contact

### Internal Support

- **NetSuite Administrator** — For deployment and configuration issues
- **Script Execution Log** — For debugging (Customization > Scripting > Script Execution Log)

### Nu-Heat Contact

- **General:** info@nu-heat.co.uk
- **Phone:** 01404 540650
- **Technical Documentation:** See `/docs` folder in the project repository

---

*End of User Guide*
