# TSM v3.0: the admin build

This drop adds the missing admin side and wires it through the backend to the phone. One zip, four folders:

| Folder | What | Version |
|---|---|---|
| `admin/` | **New.** The admin website (React). Two views behind one sign-in page: **Staff console** (TSM staff) and **Seller portal** (approved sellers). | 1.0 |
| `backend/` | The API. Adds everything the admin site needs, plus product photos in the shop API. No new packages. | 1.2 → **1.3** |
| `db/` | Schema v1.2 (`migrations/002_marketplace_admin.sql` upgrades a database you already have), optional demo data, 30 placeholder product photos. | 1.1 → **1.2** |
| `mobile/` | iPhone app overlay: real product photos, the admin-written description, and the seller's source / distributor / stock / box details on every offer. 7 files. | 2.2 → **2.3** |

## How your four requirements are met

**1. Two views.** Open the admin site and pick **Staff** or **Seller** on the sign-in page. Each has its own login, its own token, and its own routes on the server (`/api/staff/*`, `/api/seller/*`). A seller's token cannot open a staff route, and the reverse.

- **Staff console** (monitor and record everything): dashboard with platform-wide numbers, applications review, sellers, users, catalog (brands, products, photos), every offer in the marketplace, payouts, the sales ledger, and an **activity log** that records every change made through the admin site or the apps (who, what, which record, when, from which address) and exports to CSV.
- **Seller portal**: dashboard, **My listings** (list, edit, pause / resume), **Earnings & payouts**.

**2. Images and data go admin → backend → phone.** Staff upload up to 3 photos per product (the browser shrinks them to 1200 px first; the server accepts only real JPEG, PNG or WebP files), the backend stores them under `backend/storage/products/` and serves them at `/media/...`. The shop API now sends each photo's address and the product description, and the phone draws them. Edit a product in the admin site, reopen it on the phone, and the change is there.

**3. Sellers can list only if approved, and only from the staff-made catalog.**
- The seller portal refuses anyone without an approved seller application (`403 not_a_seller`) and anyone suspended (`403 seller_suspended`). Staff approve applications in the console; suspending a seller hides all of their offers from the shop immediately.
- The seller's product picker lists only products that staff have finished: **active, a description of at least 10 characters, and a main photo**. Sellers cannot create products or change photos or descriptions.

**4. Transparency on every offer.** The seller sets: **price**, **how many are in stock**, **where it is sourced from** (authorized distributor / retail store / direct from manufacturer / other), **who the distributor is**, and **how it is packed**: loose, or **Box N of M from a case**. A live "What shoppers will see" preview sits beside the form. The phone shows all of it on each offer. A seller can list the same product more than once (for example box 3 and box 7 of the same case).

## Install (Terminal)

Stop the backend first (Ctrl+C in its tab). Then:

```bash
SRC=~/Downloads/TSM-v3.0-admin          # the folder macOS made when you double-clicked the zip
ls "$SRC"                               # expect: TSM-v3.0-CHANGES.md  admin  backend  db  mobile

# Safety copies
STAMP=$(date +%Y%m%d-%H%M)
rsync -a --exclude node_modules --exclude storage ~/School/backend/ ~/School/backend-backup-$STAMP/
cp -R ~/School/db ~/School/db-backup-$STAMP
cp -R ~/School/mobile ~/School/mobile-backup-$STAMP

# Copy in the new code (your .env and node_modules are not touched)
cp -R "$SRC/backend/." ~/School/backend/
cp -R "$SRC/db/." ~/School/db/
mkdir -p ~/School/admin && cp -R "$SRC/admin/." ~/School/admin/
cp -R "$SRC/mobile/MyCards440W/." ~/School/mobile/MyCards440W/
cp "$SRC/TSM-v3.0-CHANGES.md" ~/School/docs/

# Upgrade the real database once (keeps your data; safe to run twice; password rootroot)
MYSQL=$(command -v mysql || echo /usr/local/mysql/bin/mysql)
$MYSQL -u tsm_app -p tsm < ~/School/db/sql/migrations/002_marketplace_admin.sql

# Optional, development only: demo distributors/box numbers/payouts, then photos + descriptions
$MYSQL -u tsm_app -p tsm < ~/School/db/sql/02b_seed_marketplace.sql
cd ~/School/backend && npm run demo:content

# Start the backend (leave it running)
npm run dev
```

In a **second Terminal tab**, start the admin site:

```bash
cd ~/School/admin && npm install && npm run dev      # then open http://localhost:5173
```

In **Xcode**: Cmd+B, then Cmd+R. (`ProductPhoto.swift` is a new file; the project's synced folder picks it up by itself.)

Optional check: `cd ~/School/backend && npm test` should end with `pass 147, fail 0`.

## A ten-minute tour

| Do this | Expect |
|---|---|
| Admin site, **Staff**: `admin@tsm.test` / `AdminPass1!` | Dashboard with counts, inventory value, recent activity |
| **Product catalog**: open any product, change the description, replace the main photo | Saved. The "Ready for sellers" badge shows what is missing if anything |
| Sign out, pick **Seller**: `seller@tsm.test` / `Password1!` | Seller dashboard |
| **My listings > + List a product**: pick a product, set price, stock, source, distributor, "Box 3 of 12" | Preview on the right shows exactly what shoppers will see |
| Phone (Live server mode): open that product | New photo, your description, and the offer showing "Sourced from", "Distributor", "Only N left" and "Box 3 of 12" |
| Seller portal: **Pause** the offer, reopen the product on the phone | The offer is gone from the product page |
| Staff: **Seller offers**, press **Hold** on someone's offer (a reason is required) | Disappears from the shop; the seller sees it marked **On hold** with TSM's reason |
| Staff: **Payouts** > Overview > **Create payout** for a seller > **Mark as paid…** with a transfer reference | Seller's **Earnings & payouts** page moves the money from Available to Paid; the activity log records both steps |

Other logins: `applicant@tsm.test` / `Password1!` (has a pending application, approve it in **Seller applications**), `buyer@tsm.test` / `Password1!` (cannot enter the seller portal).

Your own staff login: `cd ~/School/backend && npm run create-staff -- you@example.com "Your Name" super_admin` (password typed at a hidden prompt). Roles: `support` is read-only; `admin` and `super_admin` can change things.

## Things to know

- **Your 29 existing products** have no photos or descriptions yet, so they do not appear in the seller picker (not "ready") and show the box placeholder on the phone. `npm run demo:content` fills all of them with labelled demo photos and a short description in one go; real photos replace them one product at a time in the admin site.
- **Money.** TSM keeps `COMMISSION_BPS` of each sale (default `300` = 3.00%, rounded to the cent; change it in `backend/.env`). Each sale is stored with the rate it was sold at, so changing the rate later does not rewrite history.
- **Payouts are recorded, not sent.** Staff bundle everything a seller has earned into a payout, send the money outside the system (bank or, later, Shopify), then mark it paid with the transfer reference. Cancelling a pending payout frees the sales to be bundled again. Two staff clicking at once cannot pay the same sale twice (stress-tested with 20 simultaneous requests).
- **Earnings are demo data until checkout exists.** Orders and checkout are still on the phone only. When the checkout API is built it calls `recordSaleEarning()` (already in `backend/src/lib/earnings.js`) for each order line and the seller and staff screens fill themselves. The 6 demo sales come from `02b_seed_marketplace.sql`.
- **Photos are stored on the backend's disk** (`backend/storage/`, not in git). Before real hosting this should move to a bucket (S3 or similar) and be backed up.
- **Admin in production.** `npm run build` makes a static site in `admin/dist/`; set `VITE_API_BASE` to the API's address when building. Put the admin on its own address, never inside the app.

## Not in this version

Selling-to-us tickets and the staff replies to negotiation messages (still local on the phone), cart / orders / checkout API, Shopify payments, email and push notifications, a screen for creating staff accounts (use `npm run create-staff`), and the open business question of whether any Apple fee applies to physical goods (as far as I know the Apple commission is for digital goods, so please check Apple's current guidelines before the payout math is final).

## How it was checked

147 automated backend tests pass (new suites for catalog, seller portal, marketplace and payouts, including the payout race). The database upgrade was run on a copy of your v1.1 database: data kept, safe to run twice, result identical to a fresh install. The admin site was driven end to end in a real browser against the live backend (31 steps, desktop and phone width), including an offer created in the seller portal arriving in the shop API the phone reads, with price, "Box 3 of 12", distributor, source and stock. The phone's data models were checked against the server's real JSON. **The Swift changes could not be compiled here** (no Xcode in my environment): they passed a syntax check, but Cmd+B on your Mac is the first real compile. If Xcode shows any red error, send me the text and line.
