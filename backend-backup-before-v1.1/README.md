# TSM backend (v0.1)

Node + Express + MySQL API for The Sealed Market. This version covers: health check, the shop catalog, accounts (sign up, sign in, password change and reset, data export, account deletion) and admin-staff sign-in. Seller applications, orders and the rest arrive in later steps.

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
| `GET /api/me/export` | user | downloads all of the user's data as JSON |
| `DELETE /api/me` | user | `{password}`. Anonymises the account and takes a seller's offers off the shop |
| `POST /api/staff/login` | none | `{email, password}` returns a staff token (separate from user tokens) |
| `GET /api/staff/me` | staff | who am I |

Password rule (from the spec): 8+ characters with an uppercase letter, a lowercase letter, a number and a symbol.

Sold-out rule: a seller whose stock is 0 drops off a product's offers. The product only shows `isFullySoldOut: true` once every seller is out.

## Known limits (on purpose, for now)

- Sign-in tokens last 7 days and are not stored server-side, so "sign out" means the app discards its token. A deleted or suspended account is rejected immediately, but a password change does not sign out other devices yet.
- Reset emails only print to the terminal. A real email provider comes with the notifications step.
- Deleting an account blanks personal details and removes the records of uploaded seller documents, but does not yet delete the files themselves (file storage isn't built). What to keep for legal or tax reasons is a business decision to make before launch.
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
