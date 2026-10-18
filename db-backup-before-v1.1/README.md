# TSM database package: MySQL Workbench on macOS

Database schema v1 plus seed data that mirrors the iOS app's mock catalog, with a step-by-step guide for **MySQL Community Server + MySQL Workbench Community on macOS 26.7.0**.

```
tsm-db/
├── README.md
├── backend.env.example              copy to backend/.env later
├── sql/
│   ├── 00_create_database_and_user.sql   run once, as root
│   ├── 01_schema.sql                     tables + view (re-runnable; wipes data)
│   ├── 02_seed.sql                       brands, 29 products, 91 listings, demo accounts
│   └── 03_verify.sql                     read-only checks with expected results
└── tools/
    ├── generate_seed.py                  regenerates 02_seed.sql (needs `pip install bcrypt`)
    └── validate_sql.py                   offline syntax + key checks (needs `pip install sqlglot`)
```

> **Honesty note.** These scripts were written and checked without a live MySQL server: every statement parses with a MySQL-dialect parser, and the seed's foreign keys, unique keys and sell-out rules were verified offline. Your Mac is the first real run. If Workbench shows an error on any script, copy the red error text and the line it points at; that is all that is needed to fix it.

---

## 1. Install the server

1. Download **MySQL Community Server** for macOS (the `.dmg`, picking ARM64 for Apple silicon or x86-64 for Intel) from <https://dev.mysql.com/downloads/mysql/>.
2. Pick the **8.4 LTS** line unless you have a reason to follow the newer Innovation releases. The scripts use only MySQL 8.0.16+ features, so either works.
3. Run the installer (it asks for your Mac admin password). Set a **root password** when prompted and keep it somewhere safe.
4. Confirm it is running. Open **Terminal**:
   ```bash
   /usr/local/mysql/bin/mysql -u root -p -e "SELECT VERSION();"
   ```
   You should see a version number.

*Homebrew alternative:* `brew install mysql && brew services start mysql`, then `mysql_secure_installation` to set the root password.

## 2. Install Workbench

1. Download **MySQL Workbench** (Community) from <https://dev.mysql.com/downloads/workbench/>, open the `.dmg`, and drag it into Applications.
2. If macOS blocks the first launch, right-click the app, choose **Open**, then confirm.

**Known issue on macOS 26 (Tahoe).** MySQL bug **#120897**, "Workbench crashes on MacOS Tahoe", reports a crash when connecting to a local server. It is marked Open. MySQL's verification team could not reproduce it with Workbench 8.0.47 on macOS 26.5.1. I could not confirm anything for 26.7.0 either way. If Workbench crashes when you connect:

- Run the four scripts from Terminal instead (section 5). They are plain SQL and need no GUI.
- Or use another client such as **DBeaver** or **TablePlus**. The scripts run unchanged.

## 3. Create the connection

1. Open Workbench, then click the **+** next to *MySQL Connections*.
2. Connection Name `TSM local`, Hostname `127.0.0.1`, Port `3306`, Username `root`.
3. Click **Test Connection**, enter the root password, then **OK**.
4. Double-click the new tile to open it.

## 4. Run the scripts (in order)

For each file: **File → Open SQL Script…**, choose the file, then click the **first lightning-bolt icon** (*Execute the selected portion of the script or everything, if there is no selection*). The bolt with the text cursor only runs one statement, which is not what you want here.

| Order | File | Run as | Result |
|---|---|---|---|
| 1 | `00_create_database_and_user.sql` | root | creates `tsm`, `tsm_test`, and user `tsm_app` |
| 2 | `01_schema.sql` | root (or `tsm_app`) | 12 tables + 1 view |
| 3 | `02_seed.sql` | root (or `tsm_app`) | demo data |
| 4 | `03_verify.sql` | either | checks, one result tab per query |

Then press the **refresh** icon in the Schemas panel (left) and expand `tsm → Tables`.

**What `03_verify.sql` should show**

| Check | Expected |
|---|---|
| Row counts | users 8 · admin_staff 1 · seller_profiles 6 · brands 12 · product_types 6 · products 29 · product_images 30 · listings 91 · seller_applications 2 · seller_application_documents 2 · audit_logs 1 |
| Products per brand | 12 rows: Pokémon 4, Magic 4, One Piece 3, and the other nine brands 2 each (29 total) |
| `v_product_summary` | exactly one `is_fully_sold_out = 1`: **Elite Series** |
| Collector Set Alpha offers | 4 rows: 124.99, 127.99 (Demo Seller), 129.99, 134.99 |
| Brand `'Pokemon'` (no accent) | 4 products, because the collation ignores accents like the app does |
| Pending applications | 1: Lone Star Cards LLC with 2 documents |

If a count is off, re-run `01_schema.sql` then `02_seed.sql`. Both are safe to repeat on this dev database; they wipe and rebuild it.

## 5. Terminal alternative (no Workbench)

```bash
cd tsm-db
/usr/local/mysql/bin/mysql -u root -p < sql/00_create_database_and_user.sql
/usr/local/mysql/bin/mysql -u root -p --default-character-set=utf8mb4 < sql/01_schema.sql
/usr/local/mysql/bin/mysql -u root -p --default-character-set=utf8mb4 < sql/02_seed.sql
/usr/local/mysql/bin/mysql -u root -p --default-character-set=utf8mb4 -t < sql/03_verify.sql
```

## 6. Demo logins (development only)

| Who | Login | Password | Notes |
|---|---|---|---|
| App user | `buyer@tsm.test` | `Password1!` | plain buyer |
| Approved seller | `seller@tsm.test` | `Password1!` | owns the 7 "You" (gold) listings |
| Applicant | `applicant@tsm.test` | `Password1!` | has a pending seller application |
| Store sellers | `toptier@`, `elite@`, `prime@`, `hub@`, `alpha@tsm.test` | `Password1!` | the five mock stores |
| Admin staff | `admin@tsm.test` | `AdminPass1!` | `super_admin` |

Passwords are stored as bcrypt hashes. `.test` is a reserved domain, so no real mailbox can receive these emails.

## 7. Connecting the backend

Copy `backend.env.example` to `backend/.env`. The connection string for the app account is:

```
DATABASE_URL="mysql://tsm_app:rootroot@127.0.0.1:3306/tsm"
```

Use `127.0.0.1` rather than `localhost` so the driver connects over TCP and not a socket. Keep the server and connection in UTC: all `DATETIME(3)` columns hold UTC. Never commit `.env`.

---

## What the schema encodes

| Table | Purpose | Mirrors in the app |
|---|---|---|
| `users` | app accounts. Deleted accounts are anonymised, not removed. | `ProfileStore` |
| `admin_staff` | admin logins, kept separate from `users` so a customer token can never act as staff | web admin sign-in |
| `password_reset_tokens` | stores only a SHA-256 of the emailed token | `tsm://reset-password` |
| `brands`, `product_types` | shop-by-brand grid and filter chips | `SampleData.brands`, `ProductType` |
| `products`, `product_images` | catalog, 1x1 thumbnail + up to 3 detail images | `Product` |
| `seller_profiles` | one row per **approved** seller: store name, rating, sales | `Seller` |
| `listings` | one seller's offer on one product: price, source, box, condition, stock | `Listing` |
| `seller_applications`, `seller_application_documents` | apply → admin approval, permits/licences | `SellerApplication` |
| `audit_logs` | append-only admin action log | spec: audit logs |
| `v_product_summary` (view) | lowest price, seller count, fully-sold-out flag per product | `Product.lowestPrice` etc. |

Rules enforced by the database itself:

- **Sold-out rule.** A seller with `quantity_available = 0` drops off the product page. The product only grays out when every seller is out (`v_product_summary.is_fully_sold_out`).
- **Only approved sellers can list.** `listings.seller_id` is a foreign key to `seller_profiles`.
- **One open application per user.** A generated column plus a unique key (`uq_one_open_application`) blocks a second submitted/under-review application.
- **Emails, usernames, brand names are case- and accent-insensitive** (`utf8mb4_0900_ai_ci`).
- **Positive prices, ratings 0-5, image slots 1-3** are `CHECK` constraints.

Decisions you may want to change: sellers live in their own `seller_profiles` table rather than flags on `users`; money is `DECIMAL(10,2)` in the database and integer cents over the API; IDs are UUID strings generated by the API.

## Regenerating the seed

`02_seed.sql` is generated. To change demo data, edit `tools/generate_seed.py` and run:

```bash
pip install bcrypt sqlglot
python3 tools/generate_seed.py
python3 -I tools/validate_sql.py
```

## Not in this version yet

Carts, orders, sell-to-us tickets, reviews, notifications, support tickets, payouts and banners arrive with their own slices. One business question should be settled before payout math is built: whether Apple's commission applies to physical goods sold through Apple Pay or Shopify at all. As far as I know it applies to digital goods, so check Apple's current guidelines.
