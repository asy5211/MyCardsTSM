# TSM v4.0: orders, reviews, seller dashboard, fees and support

This drop answers your list of 18 issues. One zip, four folders:

| Folder | What | Version |
|---|---|---|
| `backend/` | The API. Real orders (with box numbers that move on), reviews, order chat and tracking, sell-to-us tickets with price offers, contact support, fees, payout methods, sales rates, revoke selling, time-range audit export. No new packages. | 1.3 → **1.4** |
| `admin/` | The website. Staff console gets Orders, Sell-to-us tickets, Support, Fees, drag-and-drop Brands, Remove selling, and a dated CSV export. The Seller portal gets Sales rates, Sold items & shipping, Reviews and Payout method. No new packages. | 1.0 → **1.1** |
| `db/` | Schema v1.3: `migrations/003_orders_reviews_tickets.sql` upgrades the database you already have (your data is kept). | 1.2 → **1.3** |
| `mobile/` | iPhone app overlay: **31 files only** (22 changed, 9 new). Copy them over your project. | 2.3 → **2.4** |

## Your 18 issues, one by one

| # | You asked for | What changed and where |
|---|---|---|
| 1 | Case offers: every purchase moves to the next box number | **Backend.** Buying *q* from a case offer at box *N* of *M* gives you boxes *N* to *N+q-1* ("Boxes 4–5 of 12") and the offer moves on to box *N+q* with *q* fewer in stock. Checked on the real server: first purchase got "Box 2 of 12", the next purchase of 2 got "Boxes 3–4 of 12". The app shows the box label on checkout confirmation, order list and order detail; the seller sees it on the sold item. |
| 2 | Seller application "Check status" goes to the Account page | **App.** After submitting, **Check Status** closes the form and opens Account → Seller application. The Sell tab's gate for someone who already applied says **Check Status** too and goes to the same place. |
| 3 | Pull-to-refresh on Account, Orders, Sell, Home | **App.** Pull down on any of them (also Shop, a product page and the seller application page). Each refreshes your account standing and then reloads its own list. |
| 4 | Application default label "Pending", not "Under review" | **App and admin.** A new application reads **Pending**. "Under review" only appears after TSM staff press *Start review*. |
| 5 | Phones format as `+1 (xxx) - xxx - xxxx` | **App and backend.** Typing `5551234567`, `(555) 123-4567`, `+1 555 123 4567`… all become `+1 (555) - 123 - 4567`, on the seller application and in Edit Profile. The server stores that exact format whatever the app sends, and refuses anything that is not 10 US digits (blank is allowed and clears it). |
| 6 | After approval, the app refreshes all pages | **App.** While your application is pending the app checks every 20 seconds, and also when you return to the app or pull down. The moment TSM approves (or suspends or removes selling) every screen reloads: Account, Sell, Home, Shop. |
| 7 | "Contact support" in Account, for guests and signed-in people | **App, backend and admin.** Account → Help → **Contact Support**. A guest gives a name and email; a signed-in person just writes. Signed-in people follow the conversation under **My Requests**. Staff answer in the new **Support** page. "Report a problem" on an order opens the same form with the order filled in. |
| 8 | New brand goes to the bottom; drag-and-drop order, saved after every move | **Admin and backend.** *Add brand* puts it last. Drag a brand by its ⠿ handle (or use the arrows) and the whole order is saved straight away, in sequence if you move quickly. Checked in a real browser: drag, reload, order kept. The app's Home grid follows this order. |
| 9 | Admin handles sellers' offers: see the offer and negotiation, change status, send price offers, accept / decline / counter | **Sell-to-us tickets (the option you chose).** App: an approved seller sends TSM a list of items (Sell tab). Admin: **Sell-to-us tickets** shows the items and the whole negotiation; *Start review*, *Send a price*, *Accept* the seller's counter, *Decline*, remove an item, or *Complete* once you have paid. App: the seller sees "TSM offered $X · tap to answer" and can **Accept**, **Counter** or **Decline**, and chat. Payment happens outside the app, as you said. |
| 10 | Seller payout method | **Seller portal and backend.** *Payout method*: bank transfer, PayPal, Zelle or check. Details are encrypted before they are stored; the seller only gets back a masked label; staff (admin role) can open the full details and each view is logged. |
| 11 | Seller sees items sold, manages tracking numbers, messages buyers | **Seller portal.** *Sold items & shipping*: who bought, where to ship, box numbers; add carrier and tracking number (and correct it later); message the buyer. **App (buyer side):** Orders tab shows the order, a tracking link, **I Received It**, a chat with the seller, and the stars. |
| 12 | Audit CSV export must be a time range | **Admin and backend.** *Export CSV…* asks for a start and end date (at most 366 days). The server refuses an export with no range. The file is named `tsm-activity-<from>_to_<to>.csv`. |
| 13 | Admin can revoke selling without suspending the account | **Admin, backend, app.** Seller page → **Remove selling** (with a reason). Their offers leave the shop and the seller portal is closed to them, but the person can still sign in, shop, track orders and contact support. **Restore selling** undoes it. The app tells them ("Selling removed") and links to support. *Suspend seller* still exists and locks the person out of selling entirely. |
| 14 | App users read seller reviews and stars; sellers respond and read by product | **App.** On a product page tap a seller's rating ("4.8 · 23 reviews") for that seller's reviews, or **Reviews** under the product for everyone's. After an order ships you can rate each item. **Seller portal → Reviews:** read by product or by stars and write a reply under any review (the reply shows in the app). |
| 15 | Flat 5% TSM fee; sellers see 5% and Apple fees taken before a payout | **Backend and admin.** TSM's fee is a flat **5%** (admin → **Fees** can change it). The payment (Apple) fee is a second admin-editable rate, **0% until you enter it**. The seller dashboard has "What is taken before you are paid" with both rates and a worked example, and the sales table has a *Fees taken* column. Every sale remembers the rates it was made at, so changing a rate later never rewrites history. |
| 16 | Seller dashboard with monthly / weekly / daily sales rates and payouts | **Seller portal.** *Sales rates*: Daily / Weekly / Monthly tabs with sales, TSM fee, payment fee, what you receive, orders, averages per period, a chart, and what TSM has paid out. |
| 17 | App link to the seller dashboard (web) for approved sellers | **App.** Approved sellers get **Seller dashboard** in Account and a card on the Sell tab. It opens the website's seller sign-in in Safari. The address comes from the server (`/api/app-config`) and can be overridden in Account → Demo tools. |
| 18 | Seller product filters (brand, type, status) | **Seller portal.** *My listings* now filters by brand, product type and status, plus search. |

## Install (Terminal)

Stop the backend first (Ctrl+C in its tab). Double-click the zip so macOS makes the folder, then:

```bash
SRC=~/Downloads/TSM-v4.0
ls "$SRC"
```

Expect: `TSM-v4.0-CHANGES.md  admin  backend  db  mobile`. Then the safety copies and the new code (your `.env`, `node_modules` and photos are not touched):

```bash
STAMP=$(date +%Y%m%d-%H%M)
rsync -a --exclude node_modules --exclude storage ~/School/backend/ ~/School/backend-backup-$STAMP/
rsync -a --exclude node_modules ~/School/admin/ ~/School/admin-backup-$STAMP/
cp -R ~/School/db ~/School/db-backup-$STAMP
cp -R ~/School/mobile ~/School/mobile-backup-$STAMP
cp -R "$SRC/backend/." ~/School/backend/
cp -R "$SRC/db/." ~/School/db/
cp -R "$SRC/admin/." ~/School/admin/
cp -R "$SRC/mobile/MyCards440W/." ~/School/mobile/MyCards440W/
cp "$SRC/TSM-v4.0-CHANGES.md" ~/School/docs/
```

Upgrade the real database once (keeps your data, safe to run twice, password `rootroot`). The second line refreshes the demo marketplace data; the third is a read-only check:

```bash
MYSQL=$(command -v mysql || echo /usr/local/mysql/bin/mysql)
$MYSQL -u tsm_app -p tsm < ~/School/db/sql/migrations/003_orders_reviews_tickets.sql
$MYSQL -u tsm_app -p tsm < ~/School/db/sql/02b_seed_marketplace.sql
$MYSQL -u tsm_app -p tsm -t < ~/School/db/sql/03_verify.sql
```

Near the bottom of the check you should see `tables_found 24, views_found 1`, then `processing_fee_bps 0` and `tsm_fee_bps 500`.

Give the backend a key for encrypting payout details (once; this adds one line to your `.env` only if it is missing), then start it:

```bash
grep -q '^DATA_ENCRYPTION_KEY=' ~/School/backend/.env || printf '\nDATA_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> ~/School/backend/.env
cd ~/School/backend
npm install
npm run dev
```

In a **second Terminal tab**, start the website:

```bash
cd ~/School/admin
npm install
npm run dev
```

Open <http://localhost:5173>. In a **third tab** (optional, development only) add sample orders, a review, a sell-to-us ticket and a support request so every screen has something to show:

```bash
cd ~/School/backend
npm run demo:sales
```

In **Xcode**: Cmd+B, then Cmd+R. The nine new Swift files are picked up by the project's synced folder by themselves. In the app, set Data source to **Live server** in Account → Demo tools (the orders, tickets, support and reviews all live on the server).

Optional check: `cd ~/School/backend && npm test` should end with `pass 288, fail 0`.

## A ten-minute tour

| Do this | Expect |
|---|---|
| Terminal: `npm run demo:sales` | A list of "ok" lines; 3 orders, 1 review, 1 ticket, 1 support request added |
| Phone (live): sign in as `buyer@tsm.test` / `Password1!` → **Orders** | Real orders with box labels (the case purchases say "Box 2 of 12" then "Boxes 3–4 of 12"); pull down to refresh |
| Open the shipped order | Tracking number with a link, the 5-star review and the seller's reply, a chat with the seller |
| Phone: **Account → Contact Support** | Works signed out too (name and email asked); signed in, **My Requests** shows the thread |
| Site, **Seller** side: `seller@tsm.test` / `Password1!` → **Dashboard**, **Sales rates** | "What is taken before you are paid: 5%", daily / weekly / monthly tabs |
| **Sold items & shipping** → the waiting order | Ship-to address, "Boxes 3–4 of 12", add carrier + tracking, message the buyer |
| **Reviews**, **Payout method** | Read by product or stars and reply; save a payout method |
| Site, **Staff** side: `admin@tsm.test` / `AdminPass1!` → **Fees** | Change the Apple fee to 2.9%; the seller's dashboard shows it for new sales |
| **Sell-to-us tickets** → the open one | Items, the negotiation, accept the seller's counter or send a different price |
| **Brands** | Drag one brand to a new place; reload the page; the order is kept |
| **Sellers** → a seller → **Remove selling** | Banner "Selling removed"; their offers leave the shop; the person can still sign in as a customer |
| **Activity log** → **Export CSV…** | Needs a start and end date |
| Phone, signed in as the seller who applied: Sell tab / Account | **Seller dashboard** link (approved sellers), pull to refresh everywhere |

Other logins: `applicant@tsm.test` / `Password1!` (pending application; approve in **Seller applications** and watch the app update within about 20 seconds), `hub@tsm.test` / `Password1!` (another approved seller).

**The Seller dashboard link on a real phone.** The app opens `http://<your Mac's address>:5173/login?as=seller`, built from the same address the app already uses for the server. The website's dev server already listens on your network (the Terminal shows it as "Network"), and the phone must be on the same Wi-Fi as the Mac. If your Mac's address ever differs from what the app guesses, put the right address in Account → Demo tools → *Seller dashboard address* (or set `SELLER_PORTAL_URL` in `backend/.env`).

## Things to know (honest list)

- **The Swift changes could not be compiled here** (no Xcode in my environment). They pass a syntax check and the app's data models were checked against the server's real JSON for 17 payloads (orders, tickets, reviews, chat, support, app config), but **Cmd+B on your Mac is the first real compile**. If Xcode shows any red error, send me the text and the file and line.
- **Card payment is not collected yet.** Checkout records the order as `placed` and writes the fee split to the earnings ledger; charging the buyer and paying sellers still happens outside the app. Sell-to-us payment is outside the app too: staff press *Complete* after paying.
- **Apple's fee.** I do not know the rate, and as far as I know Apple's commission applies to digital goods, so please check Apple's current guidelines for physical goods. It is **0% until you enter it** under Fees; sellers see whatever you set.
- **Item 9 is the sell-to-us flow** (seller offers items to TSM, TSM names a price, the seller accepts / declines / counters), as you chose. It is not a bidding system on a seller's marketplace listings.
- **Item 13 adds a new state, "revoked"**, separate from "suspended". Someone whose selling was removed (or suspended) cannot open the seller portal, so they cannot ship orders they already sold; staff handle those through support.
- **Reviews.** The first real review replaces the made-up star averages on the seeded demo sellers.
- **After the upgrade** re-run `02b_seed_marketplace.sql` (it is in the commands above). It also trims the demo case offers' stock so box numbers can advance. Demo sales that already existed keep the older 3% rate they were made at; new sales use 5%.
- **Phone-number fields** accept US numbers only (10 digits).
- The sell-to-us form's "Source" dropdown still uses the sample list on the phone.
- Staff **Orders** are read-only (no cancel or refund button yet).
- In **demo** mode (not Live server) the app keeps its old local behaviour; orders, support, reviews and tickets need Live server.
- A key to encrypt payout details is created by the command above. Keep it: if it is lost, saved payout details cannot be read (sellers would simply re-enter them).

## How it was checked

- **Backend: 288 automated tests pass on a real MySQL 8.0 server**, including new suites for orders and box numbers, after-sale shipping / tracking / chat / reviews, sell-to-us tickets, support, fees, brand order, revoke selling, the time-range export, phone formatting and the data export.
- **Database:** `003` was run twice on a copy of your older database (all rows kept) and the result has exactly the same columns, indexes and constraints as a fresh install. `01 → 02 → 02b → 03_verify` was run on an empty database too.
- **Website:** every staff and seller page was opened in a real browser against the real server with sample data (no page errors, no failed requests); brand add and drag-and-drop, fee save, audit export with a date range, and Remove selling were driven in the browser. One display flaw found on the way ("$0.00" for a ticket item with no minimum price) is fixed.
- **Not checked here:** running the app (Swift cannot be built in my environment) and Apple's fee rules. Pages were looked at on a desktop-width browser; phone-width was checked on the earlier build.
