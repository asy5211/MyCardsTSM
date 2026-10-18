# TSM backend (v1.5)

Node + Express + MySQL API for The Sealed Market. This version covers: health check, the shop catalog (now with product photos), accounts (sign up, sign in, password change and reset, data export, account deletion), a saved shipping address, seller applications with document upload, staff review of those applications, admin-staff sign-in, **the admin website's API** (catalog and photo management, sellers, users, offers, payouts, dashboard, audit log) and **the seller portal API** (approved sellers list products from the admin-made catalog with price, stock, source, distributor and box/case details, and see their earnings). **New in v1.4:** real orders (a case offer hands out the next box number on every purchase), buyer reviews with seller replies, order chat and tracking, sell-to-us tickets with price offers (accept / decline / counter), contact support (guests too), a flat TSM fee plus an admin-editable payment (Apple) fee, seller payout methods and sales rates, revoking selling without suspending the account, and a time-range audit export. Card payment itself is not collected yet: an order is recorded as `placed`, and the fee split is written to the earnings ledger. **New in v1.5:** reviews open right after a purchase, reviews belong to the seller and show only on that seller's offer, buyer support requests about an order go to that order's seller (TSM staff keep access and can take over), TSM's own featured listings (always on top, shipped by TSM, no fee, no payout), favorite sellers, no preset ceiling on the fee rates (a sale keeps the rates it was made at), yearly sales with a 1 to 25 count, "accept the seller's asking price" on sell-to-us tickets, and a newest / oldest sort on every admin list.

**Folder layout this expects** (it reads the SQL files from the `db` folder next to it):
```
~/School/
├── backend/   <- this folder
├── db/sql/    <- 01_schema.sql, 02_seed.sql ...
└── mobile/
```

## Set up (macOS Terminal)

```bash
cd ~/School
unzip -o ~/Downloads/TSM-backend-v1.zip          # creates/updates ~/School/backend
cd backend
npm install                                      # about a minute; no compiling needed
npm run init-env                                 # creates .env with fresh random secrets
npm test                                         # should end with: pass 363, fail 0
npm run dev                                      # starts http://localhost:4000
```

MySQL must be running, and `.env` must point at it. The default `DATABASE_URL` matches the `tsm_app` account with password `rootroot` from the `db` setup. Open `backend/.env` if you used something else.

`npm test` rebuilds the **`tsm_test`** database from `db/sql` each run. It refuses to touch any database whose name doesn't end in `_test`, so your real `tsm` data is safe.

## Upgrading from v1.0 to v1.1

1. Stop the server (Ctrl+C), then from `~/School`: `unzip -o ~/Downloads/TSM-backend-v1.1.zip` (it keeps your `.env`).
2. `cd backend && npm install` (adds the file-upload library).
3. Add the new table to your real database, once: open `~/School/db/sql/migrations/001_user_addresses.sql` in MySQL Workbench and run it (lightning bolt). Your data is kept.
4. `npm run dev`. Optional check: `npm test` (it rebuilds the separate `tsm_test` database, never `tsm`).

## Upgrading from v1.2 to v1.3 (the admin build)

1. Stop the server (Ctrl+C). Copy the new backend files over `~/School/backend` (see the delivery notes; your `.env` and `node_modules` are kept) and the new `db` folder over `~/School/db`.
2. Upgrade your real database once. This keeps all your data:
   ```bash
   mysql -u tsm_app -p tsm < ~/School/db/sql/migrations/002_marketplace_admin.sql     # password: rootroot
   ```
3. Optional, **development only**: fill the demo offers with distributor / source / box numbers, add demo payouts, then give the catalog pictures and descriptions:
   ```bash
   mysql -u tsm_app -p tsm < ~/School/db/sql/02b_seed_marketplace.sql
   cd ~/School/backend && npm run demo:content
   ```
4. `npm run dev`. Optional check: `npm test` (rebuilds the separate `tsm_test` database, never `tsm`).

New setting (optional, in `.env`): `COMMISSION_BPS=300` is TSM's cut of each sale in hundredths of a percent (300 = 3.00%).

## Upgrading from v1.3 to v1.4 (the "everything" build)

1. Stop the server (Ctrl+C). Copy the new backend files over `~/School/backend` (your `.env` and `node_modules` are kept) and the new `db` folder over `~/School/db`.
2. Upgrade your real database once. This keeps all your data and is safe to run twice:
   ```bash
   mysql -u tsm_app -p tsm < ~/School/db/sql/migrations/003_orders_reviews_tickets.sql     # password: rootroot
   ```
3. Optional, **development only**: re-run the marketplace demo data (it also clamps demo stock so case offers have room for new purchases), then add sample orders, reviews, a sell-to-us ticket and a support request through the API (the server must be running):
   ```bash
   mysql -u tsm_app -p tsm < ~/School/db/sql/02b_seed_marketplace.sql
   cd ~/School/backend && npm run demo:sales
   ```
4. Optional `.env` additions: `DATA_ENCRYPTION_KEY` (64 hex characters; encrypts seller payout details. `npm run init-env` makes one for a new `.env`. Without it a key is derived from `JWT_SECRET_USER`, which works for development but means changing that secret would make saved payout details unreadable) and `SELLER_PORTAL_URL` (where the app's "Seller dashboard" link points; by default it is built from the address the app used to reach this server, with port 5173).
5. `npm run dev`. Optional check: `npm test` (rebuilds the separate `tsm_test` database, never `tsm`).

`COMMISSION_BPS` is now only the starting value of TSM's fee (default 500 = 5.00%). The live rate and the payment (Apple) fee are edited by an admin in the admin site under **Fees**; each sale remembers the rates it was made at.

## Upgrading from v1.4 to v1.5

1. Stop the server (Ctrl+C). Copy the new backend files over `~/School/backend` (your `.env` and `node_modules` are kept) and the new `db` folder over `~/School/db`.
2. Upgrade your real database once. This keeps all your data and is safe to run twice:
   ```bash
   mysql -u tsm_app -p tsm < ~/School/db/sql/migrations/004_support_routing_featured_favorites.sql     # password: rootroot
   ```
3. `npm run dev`. Optional check: `npm test` (rebuilds the separate `tsm_test` database, never `tsm`).

No new `.env` settings. TSM's own storefront ("TSM", the account behind featured listings) is created automatically the first time an admin opens **Featured listings**; it cannot sign in and is never listed as a seller, a user or a payout.

## Try it (leave `npm run dev` running; use a second Terminal tab)

```bash
curl localhost:4000/health
curl "localhost:4000/api/products?brand=pokemon&sort=price_asc"
curl -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
     -d '{"login":"buyer@tsm.test","password":"Password1!"}'
```
Or just open <http://localhost:4000/api/products> in a browser. Prices are in **cents** (`12499` = $124.99).

## Demo logins (from the seed data; development only)

| Who | Login | Password |
|---|---|---|
| Buyer | `buyer@tsm.test` | `Password1!` |
| Approved seller (the app's "You" listings) | `seller@tsm.test` | `Password1!` |
| Applicant with a pending application | `applicant@tsm.test` | `Password1!` |
| Admin staff | `admin@tsm.test` | `AdminPass1!` |

Make your own admin login: `npm run create-staff -- you@example.com "Your Name" super_admin` (the password is typed at a hidden prompt).

## Endpoints

Errors always look like `{"error":{"code":"...","message":"...","details":[{"field":"...","message":"..."}]}}`.
Send the token as `Authorization: Bearer <token>`.

| Method and path | Auth | What it does |
|---|---|---|
| `GET /health` | none | server and database status |
| `GET /api/brands` | none | the 12 brand tiles, in grid order |
| `GET /api/product-types` | none | filter chips (Sealed Cases, Booster Boxes, ...) |
| `GET /api/products` | none | shop list. Query: `brand`, `type`, `q` (search), `sort` = `name`/`price_asc`/`price_desc`/`sellers`, `limit` (max 100), `offset`. Returns `{items, total, limit, offset}` |
| `GET /api/products/:id` | optional | detail with images and offers, cheapest first. When signed in, your own offer comes first with `isMine: true` |
| `POST /api/auth/register` | none | `{username, email, password, confirmPassword, acceptedTerms}` returns `{token, user}` |
| `POST /api/auth/login` | none | `{login, password}` where `login` is the email or the username |
| `POST /api/auth/forgot-password` | none | `{email}`. Always replies the same. In development the `tsm://reset-password?token=...` link prints in the `npm run dev` terminal |
| `POST /api/auth/reset-password` | none | `{token, newPassword, confirmPassword}` (single use, expires in 60 minutes) |
| `GET /api/me` | user | profile, `isApprovedSeller`, seller profile, latest seller application status |
| `PATCH /api/me` | user | change `username` and/or `phone` |
| `POST /api/me/change-password` | user | `{currentPassword, newPassword, confirmPassword}` |
| `GET /api/me/address` | user | `{address}`: the saved shipping address, or `null` |
| `PUT /api/me/address` | user | `{fullName, line1, line2?, city, region, postalCode, country?}` (US needs a 5-digit ZIP and a 2-letter state code such as `OH`; the full name "Ohio" is refused). Replaces the saved address |
| `DELETE /api/me/address` | user | removes the saved address |
| `GET /api/me/seller-application` | user | `{application}`: the latest application with its document list, or `null` |
| `POST /api/me/seller-application` | user | multipart form: `businessName, businessAddress, contactEmail, phoneNumber?, sourceType, distributorList?, documentTypes?` plus up to 5 files in `documents` (PDF/JPEG/PNG/HEIC, 10 MB each). One open application per person. `sourceType` is `distributor`, `retail_store`, `manufacturer_direct`, `other` or `test` (test needs `ALLOW_TEST_SELLER_AUTOAPPROVE=true` and approves itself, no files needed) |
| `GET /api/me/export` | user | downloads all of the user's data as JSON |
| `DELETE /api/me` | user | `{password}`. Anonymises the account and takes a seller's offers off the shop |
| `POST /api/staff/login` | none | `{email, password}` returns a staff token (separate from user tokens) |
| `GET /api/staff/me` | staff | who am I |
| `GET /api/staff/seller-applications` | staff | review queue. Query: `status` (comma list; default `submitted,under_review`), `limit`, `offset` |
| `GET /api/staff/seller-applications/:id` | staff | one application with applicant, documents and (if approved) the seller profile |
| `GET /api/staff/seller-applications/:id/documents/:docId` | staff | the uploaded file (each view is written to the audit log) |
| `POST /api/staff/seller-applications/:id/start-review` | admin | marks it under review |
| `POST /api/staff/seller-applications/:id/approve` | admin | `{displayName?, note?}` creates the seller profile |
| `POST /api/staff/seller-applications/:id/decline` | admin | `{note}` (required; the applicant sees it) |

**Shop additions (v1.3).** Products now carry `thumbnailUrl` and each image has a `url` (a path like `/media/products/<id>/<file>.jpg`; put your server address in front). Each offer adds `distributor`, `sourceType`, `sourceLabel` ("Authorized distributor"), `boxNumber`, `boxesInCase`, `boxPosition` ("Box 4 of 12") and `quantityAvailable`. The shop only shows offers that are active, not on admin hold, from a seller who isn't suspended, and in stock. `GET /media/products/*` serves the product photos (public, cached); seller documents are never served.

**Admin website API** (staff token; reading is open to every staff role, changing needs `admin` or `super_admin`):

| Method and path | What it does |
|---|---|
| `GET /api/staff/dashboard` | counts for people, sellers, applications, catalog (`ready` = has description and main photo), offers, money, plus the latest activity |
| `GET/POST/PATCH /api/staff/brands` | brand tiles. `{name, sortOrder?, isActive?}` |
| `GET /api/staff/product-types` | the filter chips |
| `GET /api/staff/products` | `?q, brandId, typeId, status=all/active/inactive/needs_content, limit, offset` |
| `POST /api/staff/products` | `{brandId, productTypeId, name, description, isActive?}` |
| `GET/PATCH /api/staff/products/:id` | one product with its photos; edit name, description, brand, type, `isActive` |
| `POST /api/staff/products/:id/images` | multipart: `image` (JPEG/PNG/WebP, up to 5 MB) and `slot` 1-3. Slot 1 is the main photo and the shop thumbnail. Replaces what was in the slot |
| `DELETE /api/staff/products/:id/images/:slot` | removes a photo (and its file) |
| `GET /api/staff/sellers`, `GET /api/staff/sellers/:id` | sellers with offer counts and balances; detail adds application, offers, earnings, activity |
| `POST /api/staff/sellers/:id/suspend` `{reason}` / `.../reinstate` | a suspended seller is locked out at once and their offers leave the shop |
| `GET /api/staff/users`, `GET /api/staff/users/:id` | accounts (opening one is written to the audit log) |
| `POST /api/staff/users/:id/suspend` `{reason}` / `.../reinstate` | blocks or restores an account immediately |
| `GET /api/staff/listings` | every seller's offers. `?q, sellerId, productId, status=live/paused/on_hold/sold_out/seller_suspended` |
| `POST /api/staff/listings/:id/hold` `{reason}` / `.../release` | pulls an offer off the shop; the seller can't resume it |
| `GET /api/staff/payouts/overview` | per-seller available / in payout / paid balances |
| `GET /api/staff/payouts`, `GET /api/staff/payouts/:id` | payouts (`?status=pending/paid/cancelled, sellerId`) and the sales each covers |
| `POST /api/staff/payouts` `{sellerId, note?}` | bundles all of a seller's available sales into a pending payout (safe if two staff click at once) |
| `POST /api/staff/payouts/:id/mark-paid` `{reference, note?}` | record that the money was sent. `.../cancel` `{reason}` frees the sales again |
| `GET /api/staff/earnings` | the sales ledger. `?sellerId, status` |
| `GET /api/staff/audit`, `GET /api/staff/audit/filters` | the activity record: `?q, actorType, action, entityType, from, to, limit, offset` |

**Seller portal API** (a signed-in user whose application was approved and who isn't suspended; anyone else gets 403 `not_a_seller` / `seller_suspended`):

| Method and path | What it does |
|---|---|
| `GET /api/seller/me` | profile, the distributors named on their application, TSM's commission |
| `GET /api/seller/dashboard` | offer counts, units in stock, inventory value, balances, latest sales |
| `GET /api/seller/catalog` | the products staff created **and finished** (description + main photo). `?q, brandId, typeId` |
| `GET /api/seller/listings` | my offers. `?status=live/paused/on_hold/sold_out` |
| `POST /api/seller/listings` | `{productId, priceCents, quantityAvailable, sourceType, distributor, packaging: "case"/"loose", boxNumber?, boxesInCase?}`. A box from a case must say which box (`boxNumber`) out of how many (`boxesInCase`). Unfinished products are refused |
| `PATCH /api/seller/listings/:id` | change any of those fields, or `isActive` to pause / resume. Can't resume an offer TSM put on hold |
| `GET /api/seller/earnings`, `GET /api/seller/payouts` | my sales ledger and the payouts TSM made |

`sourceType` is `distributor`, `retail_store`, `manufacturer_direct` or `other`. Every change a seller or staff member makes to an offer is written to the audit log with before/after values.

**v1.4 additions: buyers and the app** (user token unless noted):

| Method and path | What it does |
|---|---|
| `GET /api/app-config` | none. `{sellerPortalUrl, sellerPortalIsConfigured}`: where approved sellers manage their business |
| `PATCH /api/me` | `phone` is now stored as `+1 (555) - 123 - 4567` whatever way it is typed (10 US digits, blank clears it); seller applications do the same. `GET /api/me` adds `sellerProfile.status` (`active` / `suspended` / `revoked`) and `statusNote` |
| `POST /api/orders` | `{items:[{listingId, quantity}]}`; needs a saved shipping address. One order per seller. Returns `{orders}`. Buying *q* from a case offer at box *N* of *M* gives boxes *N* to *N+q-1* ("Boxes 4–5 of 12") and moves the offer on to the next box |
| `GET /api/orders`, `GET /api/orders/:id` | my purchases (items carry `boxLabel`, tracking, shipping address, my review) |
| `POST /api/orders/:id/delivered` | "I received it" (only after the seller shipped) |
| `GET/POST /api/orders/:id/messages` | chat with the seller about this order |
| `POST /api/orders/:id/items/:itemId/review` | `{rating 1-5, comment?}`, once per item, any time after you bought it (v1.5; not on a cancelled order) |
| `GET /api/sellers/:id/reviews`, `GET /api/products/:id/reviews?sellerId=` | public: `{summary{count, average, distribution}, items, total}`. A product's reviews are always for ONE seller (`sellerId` is required since v1.5) |
| `GET/POST /api/sell-tickets`, `GET /api/sell-tickets/:id` | approved sellers send TSM a list to buy. The detail carries the chat |
| `POST /api/sell-tickets/:id/messages` / `accept` / `counter {amountCents, message?}` / `decline {note?}` | answer TSM's price (accept and counter only while a price is waiting) |
| `POST /api/support` | contact support. Signed in: `{topic, subject, message, orderId?}` (with `orderId`, one of my orders, the request goes to that order's seller; v1.5). A guest also sends `name` and `email`. `GET /api/support`, `GET /api/support/:id`, `POST /api/support/:id/messages` follow the conversation (signed in) |
| `GET /api/me/export` | now includes orders, reviews, tickets and support requests |

**v1.4 additions: seller portal API** (approved, **active** seller; a suspended or revoked seller gets 403):

| Method and path | What it does |
|---|---|
| `GET /api/seller/orders`, `GET /api/seller/orders/:id` | items sold: who bought, where to ship, box numbers. `?status=placed/shipped/delivered, q` |
| `POST /api/seller/orders/:id/ship` | `{carrier, trackingNumber}`; sending it again corrects the tracking number. The buyer gets a tracking link |
| `GET/POST /api/seller/orders/:id/messages` | message the buyer |
| `GET /api/seller/reviews`, `POST /api/seller/reviews/:id/respond` | read reviews (`?productId, stars`) and answer them |
| `GET /api/seller/stats?period=day/week/month/year&count=` | sales, TSM fee, payment fee, what you receive, orders and payouts per day / week / month / year, with averages. `count` is 1 to 25 for every period (v1.5) |
| `GET/PUT/DELETE /api/seller/payout-method` | where TSM pays this seller (bank transfer, PayPal, Zelle or check; details are encrypted, only a masked label comes back) |
| `GET /api/seller/listings` | now also filters by `brandId` and `typeId` |

**v1.5 additions** (buyers, seller portal and admin site):

| Method and path | What it does |
|---|---|
| `GET /api/products/:id` | each offer now has `isFeatured` (TSM's own offers come first whatever they cost), `seller.isTsm`, `seller.isFavorite` (for the signed-in person) and `seller.productReviews {count, average}` (that seller's reviews of THIS product only) |
| `GET /api/me/favorite-sellers`, `PUT/DELETE /api/me/favorite-sellers/:sellerId` | the sellers I hearted (not your own store; suspended sellers drop out of the list) |
| `GET /api/seller/support`, `GET /api/seller/support/:id`, `POST .../messages {body}`, `POST .../status {status}` | the seller's support inbox: requests about their own orders. The seller sees the buyer's username only. After TSM takes a request over the seller can read but not reply. `GET /api/seller/dashboard` has `supportToAnswer` |
| `GET /api/staff/support?sellerId=&handler=all/seller/tsm&sort=` | the staff inbox can be filtered by seller (and by who is handling it). Requests carry `seller`, `orderNumber`, `handler` |
| `POST /api/staff/support/:id/take-over`, `.../hand-back` | TSM takes a seller's request over (the seller can no longer reply) or gives it back. Staff can always read and answer |
| `GET /api/staff/seller-search?q=` | a few matching sellers (TSM's own store included, `isTsm`) for the seller picker on the Support, Orders and Offers pages |
| `GET /api/staff/orders?sellerId=` | filter orders by seller (this already existed; the admin site now has a search box for it). Orders carry `fees` (the rates and cents taken from THAT sale) for staff and sellers |
| `GET /api/staff/featured`, `GET .../featured/catalog`, `GET/POST .../featured/listings`, `GET/PATCH .../featured/listings/:id` | TSM's own featured listings: the same fields and checks as a seller's offers. They sit at the top of the product, take no fee and write no payout. Admin only to change |
| `POST /api/staff/orders/:id/ship {carrier, trackingNumber}`, `POST .../orders/:id/messages {body}` | TSM ships and answers for orders its own store sold (409 for a real seller's order) |
| `POST /api/staff/tickets/:id/accept-ask` | accept the seller's asking price as it stands (while the ticket is pending or in review). A counter offer is `.../offer`, a refusal `.../decline` |
| `?sort=newest\|oldest` | on staff orders, users, products (also `name`), sellers (also `name`), offers (also `name`), tickets, support, payouts, earnings and the activity log, and on the seller portal's orders, offers (also `name`), earnings, reviews and support |

**v1.4 additions: admin website API** (staff token; reading is open to every staff role, changing needs `admin` or `super_admin`):

| Method and path | What it does |
|---|---|
| `POST /api/staff/brands` / `PUT /api/staff/brands/order {ids}` | a new brand is added at the bottom; the drag-and-drop order is saved as a whole list |
| `POST /api/staff/sellers/:id/revoke {reason}` / `.../reinstate` | take selling away without suspending the account (the person can still sign in, shop and contact support); offers leave the shop; `reinstate` restores selling |
| `GET /api/staff/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD` | CSV of the activity log for a time range (required; at most 366 days). Also accepts the log's filters |
| `GET /api/staff/settings`, `PUT /api/staff/settings/fees {tsmFeeBps?, processingFeeBps?}` | TSM's fee (default 500 = 5%) and the payment / Apple fee (default 0 until set); sellers see both |
| `GET /api/staff/orders`, `GET /api/staff/orders/:id`, `.../messages` | every order, read-only |
| `GET /api/staff/tickets`, `GET /api/staff/tickets/:id` | sell-to-us tickets (`?status, q`) |
| `POST /api/staff/tickets/:id/start-review` / `offer {amountCents, message?}` / `accept-counter` / `decline {note?}` / `complete` / `messages` / `items/:itemId` | review, send a price, answer a counter-offer, mark paid-and-done (payment itself happens outside the app), chat, remove an item |
| `GET /api/staff/support`, `GET /api/staff/support/:id`, `POST .../messages`, `POST .../status` | the support inbox |
| `GET /api/staff/sellers/:id/payout-method` | a seller's full payout details (admin only; the view is written to the audit log) |

Password rule (from the spec): 8+ characters with an uppercase letter, a lowercase letter, a number and a symbol.

Sold-out rule: a seller whose stock is 0 drops off a product's offers. The product only shows `isFullySoldOut: true` once every seller is out.

## Reviewing seller applications (the admin website does this now; the command line still works)

With the server running (`npm run dev`), in a second Terminal tab:

```
npm run review -- list                              # who is waiting
npm run review -- approve 6e837edc "Welcome aboard"  # first 8 characters of the id; the note is optional
npm run review -- decline 6e837edc "The permit has expired."   # the reason is required; the applicant sees it
```

It signs in as the demo admin (`admin@tsm.test`). For another staff login set `STAFF_EMAIL` and `STAFF_PASSWORD`. It calls the same staff API the admin website will use.

## Known limits (on purpose, for now)

- Sign-in tokens last 7 days and are not stored server-side, so "sign out" means the app discards its token. A deleted or suspended account is rejected immediately, but a password change does not sign out other devices yet.
- Reset emails only print to the terminal. A real email provider comes with the notifications step.
- Uploaded seller documents are saved on this computer in `backend/storage/` (git-ignored, never served to the public; only staff can open them). Moving them to cloud storage (for example S3) is a later step. Deleting an account deletes that person's files too. What to keep for legal or tax reasons is a business decision to make before launch.
- The demo applicant's two seeded documents are database records only, so opening them as staff answers "file missing". Real uploads work.
- Approving or declining does not email or notify the applicant yet (arrives with the notifications step); the app sees the new status the next time it refreshes.
- Sign-in rate limiting is in memory and resets when the server restarts.
- Product photos are saved on this computer in `backend/storage/products/` and served at `/media/products/...`. Cloud storage (and a CDN) is a later step.
- Payouts are **recorded** here, not sent: TSM transfers the money outside the system (bank, or Shopify later) and enters the reference in the admin site. Sales reach the earnings ledger once checkout exists (it will call `recordSaleEarning`); until then the ledger holds only the demo data from `02b_seed_marketplace.sql`.
- TSM's fee is a flat percentage (5% by default) of the item price, the same for every seller, and the payment (Apple) fee is whatever an admin enters under Fees (0% until then). There is **no preset ceiling** on either rate (they are dynamic); the only rule is that the two together can't be more than 100% of a sale. A sale keeps the rates it was made at. Whether Apple's fee applies to physical goods is still an open business question, so check Apple's current guidelines before setting it.
- TSM's own featured listings take no fee and are not paid out, so they appear in the order list but not in the earnings ledger or the payout overview.
- Card payment is not collected yet. Checkout records the order as `placed` and writes the fee split to the earnings ledger; paying the buyer's card and paying out sellers happen outside the app for now.
- A suspended or revoked seller cannot open the seller portal, so cannot ship orders they already sold; staff handle those through support.
- The first real review replaces the demo star averages on seeded sellers.
- Sell-to-us payment is outside the app: staff mark a ticket completed once they have paid.
- Staff accounts are created with `npm run create-staff`; there is no staff-management screen yet.
- Approving an application, holding an offer or suspending someone does not email them yet (notifications step).

## If something goes wrong

| You see | Likely cause |
|---|---|
| `ER_ACCESS_DENIED_ERROR` on start | the user or password in `DATABASE_URL` is wrong |
| `ECONNREFUSED` | the MySQL server isn't running |
| `JWT_SECRET_USER ... placeholder` | run `npm run init-env` |
| `EADDRINUSE` | another copy is already on port 4000. Stop it with Ctrl+C or change `PORT` in `.env` |
| `Cannot read .../db/sql/01_schema.sql` | the `db` folder isn't next to `backend` (or run with `SQL_DIR=/path/to/sql`) |
| `Refusing to run tests ... _test` | `TEST_DATABASE_URL` in `.env` must name a database ending in `_test` |
