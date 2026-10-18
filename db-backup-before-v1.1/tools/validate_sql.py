#!/usr/bin/env python3
"""
Offline checks for the SQL files (no MySQL server needed):
  1. every statement parses with sqlglot's MySQL dialect
  2. seed rows satisfy the schema's foreign keys and unique keys
  3. the app's sell-out rules hold on the seeded data

  pip install sqlglot
  python3 -I tools/validate_sql.py
"""
import logging
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import sqlglot
from sqlglot import exp

logging.getLogger("sqlglot").setLevel(logging.ERROR)  # CREATE USER / GRANT fall back to plain commands; that's fine

SQL = Path(__file__).resolve().parent.parent / "sql"
problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)
    print("FAIL:", msg)


def ok(msg: str) -> None:
    print("ok  :", msg)


# --- 1. parse everything -------------------------------------------------
parsed: dict[str, list[exp.Expression]] = {}
for f in sorted(SQL.glob("*.sql")):
    text = f.read_text(encoding="utf-8")
    # sqlglot can't parse `SHOW GRANTS FOR 'user'@'host'` (valid MySQL); drop that one statement.
    text = re.sub(r"(?im)^SHOW GRANTS FOR [^;]*;", "", text)
    try:
        stmts = [s for s in sqlglot.parse(text, read="mysql") if s is not None]
    except Exception as e:  # sqlglot.errors.ParseError
        fail(f"{f.name}: {e}")
        continue
    parsed[f.name] = stmts
    ok(f"{f.name}: {len(stmts)} statements parse (mysql dialect)")

if problems:
    sys.exit(1)

# --- 2. load seed rows ---------------------------------------------------
tables: dict[str, list[dict]] = defaultdict(list)
for stmt in parsed["02_seed.sql"]:
    if not isinstance(stmt, exp.Insert):
        continue
    table = stmt.this.this.name
    cols = [c.name for c in stmt.this.expressions]
    for tup in stmt.expression.expressions:
        vals = []
        for v in tup.expressions:
            if isinstance(v, exp.Null):
                vals.append(None)
            elif isinstance(v, exp.Literal):
                vals.append(v.name if v.is_string else (float(v.name) if "." in v.name else int(v.name)))
            else:
                vals.append(v.sql())  # e.g. JSON_OBJECT(...)
        tables[table].append(dict(zip(cols, vals)))

expected = {"users": 8, "admin_staff": 1, "seller_profiles": 6, "brands": 12, "product_types": 6,
            "products": 29, "product_images": 30, "listings": 91, "seller_applications": 2,
            "seller_application_documents": 2, "audit_logs": 1}
for t, n in expected.items():
    got = len(tables[t])
    (ok if got == n else fail)(f"{t}: {got} rows (expected {n})")


def ids(t, col="id"):
    return {r[col] for r in tables[t]}


def check_fk(child, col, parent, pcol="id", nullable=False):
    valid = ids(parent, pcol)
    bad = [r[col] for r in tables[child] if r.get(col) is not None and r[col] not in valid]
    missing = [r for r in tables[child] if r.get(col) is None] if not nullable else []
    (ok if not bad and not missing else fail)(f"FK {child}.{col} -> {parent}.{pcol} ({len(bad)} orphan, {len(missing)} null)")


check_fk("products", "brand_id", "brands")
check_fk("products", "product_type_id", "product_types")
check_fk("product_images", "product_id", "products")
check_fk("listings", "product_id", "products")
check_fk("listings", "seller_id", "seller_profiles", "user_id")
check_fk("seller_profiles", "user_id", "users")
check_fk("seller_profiles", "approved_by_staff_id", "admin_staff", nullable=True)
check_fk("seller_applications", "user_id", "users")
check_fk("seller_applications", "reviewed_by_staff_id", "admin_staff", nullable=True)
check_fk("seller_application_documents", "application_id", "seller_applications")
check_fk("password_reset_tokens", "user_id", "users") if tables["password_reset_tokens"] else None


def check_unique(t, *cols, ci=False):
    def norm(v):
        return v.lower() if ci and isinstance(v, str) else v
    keys = [tuple(norm(r[c]) for c in cols) for r in tables[t]]
    dups = [k for k, n in Counter(keys).items() if n > 1]
    (ok if not dups else fail)(f"UNIQUE {t}({', '.join(cols)}): {len(dups)} duplicates")


for t in ("users", "admin_staff", "seller_profiles", "brands", "product_types", "products",
          "product_images", "listings", "seller_applications", "seller_application_documents"):
    check_unique(t, "user_id" if t == "seller_profiles" else "id")
check_unique("users", "username", ci=True)
check_unique("users", "email", ci=True)
check_unique("admin_staff", "email", ci=True)
check_unique("seller_profiles", "display_name", ci=True)
check_unique("brands", "name", ci=True)
check_unique("product_types", "name", ci=True)
check_unique("products", "brand_id", "name", ci=True)
check_unique("product_images", "product_id", "slot")

# open-application uniqueness (mirrors uq_one_open_application)
open_apps = [r["user_id"] for r in tables["seller_applications"] if r["status"] in ("submitted", "under_review")]
(ok if len(open_apps) == len(set(open_apps)) else fail)("at most one open seller application per user")

# CHECK constraints
(ok if all(r["price"] > 0 for r in tables["listings"]) else fail)("listings.price > 0")
(ok if all(1 <= r["slot"] <= 3 for r in tables["product_images"]) else fail)("product_images.slot in 1..3")
(ok if all(0 <= r["rating_avg"] <= 5 for r in tables["seller_profiles"]) else fail)("seller rating in 0..5")

# column-length sanity (CHAR(36) ids, varchar limits we know of)
(ok if all(len(r["id"]) == 36 for t in tables for r in tables[t] if "id" in r and isinstance(r["id"], str))
 else fail)("all ids are 36-char UUID strings")
(ok if all(r["password_hash"].startswith("$2") and len(r["password_hash"]) == 60
           for t in ("users", "admin_staff") for r in tables[t]) else fail)("password hashes are 60-char bcrypt")
(ok if all(len(r["username"]) <= 30 for r in tables["users"]) else fail)("usernames <= 30 chars")

# --- 3. app rules on the seeded data ------------------------------------
prod_name = {r["id"]: r["name"] for r in tables["products"]}
by_prod: dict[str, list[dict]] = defaultdict(list)
for r in tables["listings"]:
    by_prod[r["product_id"]].append(r)

fully_sold_out = sorted(prod_name[p] for p, ls in by_prod.items()
                        if ls and all(l["quantity_available"] == 0 for l in ls))
(ok if fully_sold_out == ["Elite Series"] else fail)(f"fully sold-out products: {fully_sold_out} (expected ['Elite Series'])")
(ok if all(p in by_prod for p in prod_name) else fail)("every product has at least one listing")

me = next(r["user_id"] for r in tables["seller_profiles"] if r["display_name"] == "Demo Seller")
mine = [l for l in tables["listings"] if l["seller_id"] == me]
(ok if len(mine) == 7 else fail)(f"Demo Seller has {len(mine)} listings (expected 7: 1 hand-written + 6 generated)")

alpha = [l for l in by_prod[next(i for i, n in prod_name.items() if n == "Collector Set Alpha")]]
(ok if len(alpha) == 4 and sorted(l["price"] for l in alpha) == [124.99, 127.99, 129.99, 134.99] else fail)(
    "Collector Set Alpha has 4 offers: 124.99 / 127.99 / 129.99 / 134.99")

print()
if problems:
    print(f"{len(problems)} problem(s)")
    sys.exit(1)
print("All checks passed.")
