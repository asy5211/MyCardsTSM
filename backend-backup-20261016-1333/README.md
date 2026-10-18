# TSM backend (v1.1)

Node + Express + MySQL API for The Sealed Market. This version covers: health check, the shop catalog, accounts (sign up, sign in, password change and reset, data export, account deletion), a saved shipping address, seller applications with document upload, staff review of those applications, and admin-staff sign-in. Orders and the rest arrive in later steps.

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
npm test                                         # should end with: pass 39, fail 0
npm run dev                                      # starts http://localhost:4000
```

MySQL must be running, and `.env` must point at it. The default `DATABASE_URL` matches the `tsm_app` account with password `rootroot` from the `db` setup. Open `backend/.env` if you used something else.

`npm test` rebuilds the **`tsm_test`** database from `db/sql` each run. It refuses to touch any database whose name doesn't end in `_test`, so your real `tsm` data is safe.

## Upgrading from v1.0 to v1.1

1. Stop the server (Ctrl+C), then from `~/School`: `unzip -o ~/Downloads/TSM-backend-v1.1.zip` (it keeps your `.env`).
2. `cd backend && npm install` (adds the file-upload library).
3. Add the new table to your real database, once: open `~/School/db/sql/migrations/001_user_addresses.sql` in MySQL Workbench and run it (lightning bolt). Your data is kept.
4. `npm run dev`. Optional check: `npm test` (it rebuilds the separate `tsm_test` database, never `tsm`).

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
| `PUT /api/me/address` | user | `{fullName, line1, line2?, city, region, postalCode, country?}` (US needs a 5-digit ZIP). Replaces the saved address |
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

Password rule (from the spec): 8+ characters with an uppercase letter, a lowercase letter, a number and a symbol.

Sold-out rule: a seller whose stock is 0 drops off a product's offers. The product only shows `isFullySoldOut: true` once every seller is out.

## Reviewing seller applications (until the admin website exists)

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

## If something goes wrong

| You see | Likely cause |
|---|---|
| `ER_ACCESS_DENIED_ERROR` on start | the user or password in `DATABASE_URL` is wrong |
| `ECONNREFUSED` | the MySQL server isn't running |
| `JWT_SECRET_USER ... placeholder` | run `npm run init-env` |
| `EADDRINUSE` | another copy is already on port 4000. Stop it with Ctrl+C or change `PORT` in `.env` |
| `Cannot read .../db/sql/01_schema.sql` | the `db` folder isn't next to `backend` (or run with `SQL_DIR=/path/to/sql`) |
| `Refusing to run tests ... _test` | `TEST_DATABASE_URL` in `.env` must name a database ending in `_test` |
