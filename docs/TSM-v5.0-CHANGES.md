# TSM v5.0: reviews on purchase, support to sellers, TSM featured listings, favorite sellers and dynamic fees

This drop answers your list of 8 issues. One zip, four folders:

| Folder | What | Version |
|---|---|---|
| `backend/` | The API. Reviews open right after a purchase and belong to the seller; support about an order goes to that order's seller (TSM keeps access and can take over); TSM's own featured listings; favorite sellers; fee rates with no preset ceiling and per-sale rate snapshots; yearly sales; accept / counter / decline on sell-to-us tickets; a newest / oldest sort on every admin list. No new packages. | 1.4 → **1.5** |
| `admin/` | The website. Staff: **TSM featured listings**, seller search on Support and Orders, a **Take over / Hand back** button on support requests, accept / counter / decline on **Seller offers**, Sort on every list. Seller portal: **Customer support**, **Yearly** sales, a 1 to 25 drop-down, Sort on every list. No new packages. | 1.1 → **1.2** |
| `db/` | Schema v1.4: `migrations/004_support_routing_featured_favorites.sql` upgrades the database you already have (your data is kept). | 1.3 → **1.4** |
| `mobile/` | iPhone app overlay: **16 files only** (15 changed, 1 new: `Shared/FavoriteSellersStore.swift`). Copy them over your project. | 2.4 → **2.5** |

## Your 8 issues, one by one

| # | You asked for | What changed and where |
|---|---|---|
| 1 | After the buyer purchases the item they can add a review to the purchase | **App and backend.** Open an order in **Orders**: every item has **Review *seller name* for this purchase** as soon as the order is placed (you no longer wait for shipping). One review per item, 1 to 5 stars plus an optional comment, and it cannot be changed afterwards. A cancelled order has nothing to review. |
| 2 | A buyer's support message goes to the individual seller's dashboard; admin keeps access; a seller search so admin can override a poor job; the same seller search on the Orders list | **Backend, app, website.** In the app, **Orders → an order → Report a Problem** now sends the message to *that order's seller*; the screen says so and that TSM can read it too. The seller sees it in **Customer support** in the seller portal (buyer username only, never name or email) and answers there. Staff see every request in **Support**, with who is handling it, and can **Take over** (the seller can no longer reply) and later **Hand back**. **Support** and **Orders** (staff) both have a type-ahead **Seller** search, TSM's own store included. Messages that are not about an order (account, payment, a guest's question) and orders from TSM's own store stay with TSM. |
| 3 | Admin posts its own product, featured at the top of any listing, same flow as a seller, always on top even when not the cheapest, purple border | **Website, backend, app.** Staff → **TSM featured listings** → *+ New listing*: the same form a seller uses (finished catalog products only, price, stock, source, distributor, loose or case with box numbers). In the app that offer is **always first** on the product page, headed **TSM Featured Offer**, with a **purple border**, a purple price and a **TSM FEATURED** tag, even if a seller is cheaper. TSM ships these orders itself (Staff → Orders → Ship), no TSM fee is charged on its own sales and no payout row is made. On the website the featured rows are purple too. |
| 4a | Admin clicks a seller's offer and negotiates: accept, decline, send a counter offer | **Website.** Staff → **Seller offers** (the sell-to-us tickets, renamed). Every row opens the offer with the whole negotiation. Buttons: **Accept their price** (the seller's asking total), **Send counter offer**, **Decline**; and, once the seller counters, **Accept** their counter. The app shows the seller each step. |
| 4b | A sort by soonest / oldest in all the filters, for sellers and admins | **Website and backend.** Every list has a **Sort** menu: *Newest first* / *Oldest first* (the product catalog, sellers and seller listings also offer *Name*). "Oldest first" is always the exact mirror of "Newest first". Staff: seller applications, sellers, users, product catalog, seller listings and featured listings, orders, seller offers, support, payouts, earnings, activity log. Seller portal: sold items, my listings, earnings, reviews, customer support. |
| 5 | A seller's reviews on a product show only on *their* listing | **App and backend.** The product page no longer has one "Reviews" row for the whole product. Each seller's offer has its own line, **On this product: 4.9 · 3 reviews**, that opens only what buyers said about *that seller on that product*. The seller's overall rating (all products) still opens their full review list. |
| 6 | A way to favorite a seller | **App and backend.** A heart next to the seller's name on every offer (not on your own). **Favorites** now has two tabs, **Products** and **Sellers**; the list is saved on the TSM server so it follows your account. You can favorite TSM's own store too. Tapping a favorite seller opens their reviews. |
| 7 | Remove the limits on TSM's fees; a sale keeps the fee it was sold at (5% and 10%) even if the rate rises | **Backend and website.** Staff → **Fees**: no preset ceiling on either rate any more. The one rule kept is that the two together cannot be more than 100% of a sale (otherwise the seller's share would be negative). Every sale remembers the rates it was made at. Checked: a $100 sale at 5% + 10% stays "$5 TSM, $10 Apple, $85 to the seller" after the rates are raised to 7% + 15%, and a later $50 sale uses 7% + 15%. Both staff and the seller see each order's exact split. The buyer never sees fees. |
| 8 | Sellers see yearly sales; the numbers a drop-down from 1 to 25, not increments | **Seller portal.** **Sales rates** has **Daily / Weekly / Monthly / Yearly** tabs. The "show the last…" control is now a drop-down running 1 to 25 (it was a stepper). Yearly defaults to the last 5 years. The server also refuses more than 25. |

## Install (Terminal)

Stop the backend first (Ctrl+C in its tab). Double-click the zip so macOS makes the folder, then:

```bash
SRC=~/Downloads/TSM-v5.0
ls "$SRC"
```

Expect: `TSM-v5.0-CHANGES.md  admin  backend  db  mobile`. Then the safety copies and the new code (your `.env`, `node_modules` and photos are not touched):

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
mkdir -p ~/School/docs
cp "$SRC/TSM-v5.0-CHANGES.md" ~/School/docs/
```

Upgrade the real database once (keeps your data, safe to run twice). The second line is a read-only check:

```bash
MYSQL=$(command -v mysql || echo /usr/local/mysql/bin/mysql)
MYSQL_PWD=rootroot $MYSQL -u tsm_app tsm < ~/School/db/sql/migrations/004_support_routing_featured_favorites.sql
MYSQL_PWD=rootroot $MYSQL -u tsm_app tsm -t < ~/School/db/sql/03_verify.sql
```

Near the bottom of the check you should see `tables_found 25, views_found 1`, and the last table `sales_with_wrong_split 0, commission_not_at_its_own_rate 0`.

Start the backend:

```bash
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

Open <http://localhost:5173>. In a **third tab** (optional, development only) add sample orders, two reviews, a support request about an order, a favorite seller and a TSM featured listing, so every screen has something to show:

```bash
cd ~/School/backend
npm run demo:content
npm run demo:sales
```

In **Xcode**: Cmd+B, then Cmd+R. The one new Swift file is picked up by the project's synced folder by itself. In the app, keep Data source on **Live server** (Account → Demo tools); reviews, support and favorite sellers live on the server.

Optional check: `cd ~/School/backend && npm test` should end with `pass 365, fail 0`.

## A ten-minute tour

| Do this | Expect |
|---|---|
| Terminal: `npm run demo:content` then `npm run demo:sales` | A list of "ok" lines (the featured listing needs the first command, or a finished product) |
| Phone (live): `buyer@tsm.test` / `Password1!` → open the product named on the "Boxes … of 12" order | The **purple-bordered "TSM Featured Offer"** first, with a higher price than the seller's offer below it |
| On the seller's offer | **On this product: 5.0 · 1 review** (taps through to that seller's reviews on this product only); the heart next to their name |
| Tap the heart → **Home → Favorites → Sellers** | The seller is listed; the heart on that row removes them |
| **Orders** → an order that has no review yet (not shipped is fine) | **Review *seller* for this purchase** → stars → Submit |
| Same order → **Report a Problem** | "This goes to *seller*… TSM support can read it too"; send it |
| Site, **Seller** side: `seller@tsm.test` / `Password1!` → **Customer support** | The request, with the order number and the buyer's username only; reply to it |
| Site, **Staff** side: `admin@tsm.test` / `AdminPass1!` → **Support** | Same request, "with *seller*"; use **Seller** search, open it, **Take over** (the seller's reply box locks), then **Hand back** |
| **Orders** (staff) | Type a seller's name in **Seller** to see only theirs; try **Sort** Newest / Oldest |
| **TSM featured listings** | The purple listing; *+ New listing* uses the seller form |
| **Seller offers** → the open one | **Accept their price**, **Send counter offer**, **Decline** |
| **Fees** | Set TSM 5% and Apple 10%, place an order, then set 7% and 15%: the first order's split does not change |
| Seller side → **Sales rates** → **Yearly** | The drop-down runs 1 to 25 |

## Things to know (honest list)

- **The Swift changes could not be compiled here** (no Xcode in my environment). All 58 Swift files pass a syntax check, and the app's data models were checked against 13 real JSON payloads from the real server (product page with a featured offer, favorite flags and per-product reviews; favorite sellers; support with an order; orders), but **Cmd+B on your Mac is the first real compile**. If Xcode shows a red error, send me the text and the file and line.
- **Update the backend and the app together.** The product reviews endpoint now needs a seller (`/api/products/:id/reviews?sellerId=…`) because a review belongs to the seller. The old app's "Reviews" row would show an error against the new backend.
- **"Seller offers" means the sell-to-us tickets**, as in v4.0 (sellers offer items to TSM and TSM negotiates the price). It is not a bidding system on marketplace listings.
- **"Soonest / oldest"** is shown as **Newest first / Oldest first** (most recent first is the useful reading for past records).
- **Reviews open at purchase**, before shipping, as you asked. The review is of the seller; the one-per-item rule and "no editing" are unchanged.
- **Only messages about an order go to a seller.** Account, payment, guest and "other" messages, and orders from TSM's own store, stay with TSM. A seller never sees a buyer's name or email.
- **The bottom "Buy Now" bar on a product page still buys the cheapest offer** that is not your own, even when the purple featured offer above it costs more. The featured offer has its own Add to Cart / Buy Now buttons.
- **Fees have no preset ceiling**, only the 100% total rule. The Apple fee is still **0% until you enter it** and I still do not know Apple's rate for physical goods; please check Apple's current guidelines.
- **TSM's own store** is a hidden account created the first time someone opens **TSM featured listings**. It cannot sign in, is not listed under Sellers or Users, and has no payouts.
- **Card payment is not collected yet.** An order is recorded as `placed`; charging the buyer and paying sellers still happen outside the app.
- Favorite sellers and the Report-a-Problem routing need the **Live server**. In demo mode the heart works in memory only.
- The product catalog "Name" order is brand first, then product name. The seeded demo products were all created in the same instant, so there "Oldest first" simply shows that order reversed.

## How it was checked

- **Backend: 365 automated tests pass on a real MySQL 8.0 server** (288 in v4.0). New suites cover reviews at purchase, per-seller product reviews, support routing and take-over, what a seller can and cannot see about a buyer, TSM featured listings (top placement, no fee, no payout), favorite sellers, fee snapshots across rate changes, yearly sales and the 1 to 25 limit, accept / counter / decline on tickets, and newest / oldest on every list (including rows saved in the same instant).
- **Database:** migration `004` was run twice on a copy of your older database (all rows kept, same result as a fresh install); a fresh `01 → 02 → 02b → 03_verify` gives `tables_found 25, views_found 1`. `npm run demo:content` and `npm run demo:sales` were run on that fresh database end to end.
- **Website:** built (no lint errors) and driven in a real browser against the real server: 18 click-through checks passed (featured listing create and purple rows, seller search on Support and Orders, take over / hand back, counter-offer dialog, fee change, yearly drop-down 1 to 25, sort menus) with no page errors, plus the new catalog sort.
- **Not checked here:** running the app (Swift cannot be built in my environment) and Apple's fee rules.
