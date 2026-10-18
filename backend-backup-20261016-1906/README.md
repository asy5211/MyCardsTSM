# TSM backend (v1.3)

Node + Express + MySQL API for The Sealed Market. This version covers: health check, the shop catalog (now with product photos), accounts (sign up, sign in, password change and reset, data export, account deletion), a saved shipping address, seller applications with document upload, staff review of those applications, admin-staff sign-in, **the admin website's API** (catalog and photo management, sellers, users, offers, payouts, dashboard, audit log) and **the seller portal API** (approved sellers list products from the admin-made catalog with price, stock, source, distributor and box/case details, and see their earnings). Orders and the rest arrive in later steps.

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
npm test                                         # should end with: pass 147, fail 0
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
- TSM's commission is a flat percentage (3% by default) of the item price, applied to every seller. Whether Apple's fee applies to physical goods is still an open business question.
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
