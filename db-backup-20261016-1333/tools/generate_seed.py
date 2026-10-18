#!/usr/bin/env python3
"""
Generates sql/02_seed.sql from the same rules the iOS app uses for its mock
catalog (Models.swift + SampleCatalog.swift), so the database starts out
identical to what the app already shows.

  pip install bcrypt
  python3 tools/generate_seed.py            # rewrites sql/02_seed.sql

IDs are uuid5 of a stable name, so re-running keeps the same IDs. Password
hashes use fresh salts each run (so the file changes, the passwords do not).
"""
import math
import sys
import uuid
from pathlib import Path

import bcrypt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sql" / "02_seed.sql"

NS = uuid.UUID("5e1a1ed0-0000-4000-8000-0000000007a5")  # fixed namespace for TSM seed ids
NOW = "2026-09-24 12:00:00.000"

DEMO_PASSWORD = "Password1!"     # meets the app rule: 8+, upper, lower, number, symbol
ADMIN_PASSWORD = "AdminPass1!"   # DEV ONLY


def uid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:{key}"))


def q(value) -> str:
    """SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    s = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{s}'"


def money(x: float) -> str:
    return f"{x:.2f}"


def swift_round(x: float) -> float:
    """Swift's .rounded() is round-half-away-from-zero (all values here are positive)."""
    return math.floor(x + 0.5)


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def slug(name: str) -> str:
    return name.lower().replace(" ", "_")


# --------------------------------------------------------------------------
# Source data (copied from the Swift files)
# --------------------------------------------------------------------------

BRANDS = ["Pokémon", "Magic", "One Piece", "Lorcana", "Star Wars", "Rift Bound",
          "Union Arena", "Naruto", "Dragon Ball", "Panini", "Topps", "Upper Deck"]

PRODUCT_TYPES = ["Sealed Cases", "Booster Boxes", "Blisters", "Single Packs",
                 "Illustration Boxes", "Other"]

# (key, username, email, display_name, rating, sales_count)
STORE_SELLERS = [
    ("toptier",   "toptier",         "toptier@tsm.test",   "TopTier Collectibles", 4.9, 1248),
    ("elite",     "elite_supply",    "elite@tsm.test",     "Elite Supply Co.",     4.9, 192),
    ("prime",     "prime_source",    "prime@tsm.test",     "Prime Source",         4.8, 567),
    ("hub",       "collector_hub",   "hub@tsm.test",       "Collector Hub",        4.7, 88),
    ("alpha",     "alpha_inventory", "alpha@tsm.test",     "Alpha Inventory Co.",  4.6, 340),
]
YOU = ("you", "seller_demo", "seller@tsm.test", "Demo Seller", 4.9, 12)  # the app's "You"

SELLER_BY_NAME = {s[3]: s for s in STORE_SELLERS}

# Hand-written products (SampleData.sampleProducts). listing = (seller_name, price, source, box, qty)
HAND_PRODUCTS = [
    ("Pokémon", "Collector Set Alpha", "Booster Boxes",
     ["collector_set_alpha_1", "collector_set_alpha_2"],
     [("TopTier Collectibles", 124.99, "From Case", "Box 4 of 12", 5),
      ("Elite Supply Co.",     129.99, "From Case", "Box 9 of 12", 5),
      ("Prime Source",         134.99, "Loose Product", None, 5),
      ("Demo Seller",          127.99, "From Case", "Box 2 of 12", 5)]),
    ("Magic", "Elite Series", "Sealed Cases",
     ["elite_series_1"],
     [("Collector Hub", 1049.99, "From Case", None, 0)]),            # sold out on purpose
    ("One Piece", "Standard Pack", "Single Packs",
     ["standard_pack_1"],
     [("Alpha Inventory Co.", 4.99, "Loose Product", None, 5)]),
]

# SampleCatalog.catalogSpecs
CATALOG_SPECS = [
    ("Pokémon", "Crimson Storm Booster Box", "Booster Boxes", 139.99),
    ("Pokémon", "Mega Evolution Blister", "Blisters", 14.99),
    ("Pokémon", "Prism Illustration Box", "Illustration Boxes", 89.99),
    ("Magic", "Draft Booster Box", "Booster Boxes", 119.99),
    ("Magic", "Commander Deck Case", "Sealed Cases", 449.99),
    ("Magic", "Bundle Gift Edition", "Other", 59.99),
    ("One Piece", "Romance Dawn Booster Box", "Booster Boxes", 94.99),
    ("One Piece", "Starter Deck Case", "Sealed Cases", 219.99),
    ("Lorcana", "First Chapter Booster Box", "Booster Boxes", 129.99),
    ("Lorcana", "Illumineer Trove", "Illustration Boxes", 59.99),
    ("Star Wars", "Unlimited Booster Box", "Booster Boxes", 109.99),
    ("Star Wars", "Spark Pack", "Single Packs", 4.99),
    ("Rift Bound", "Origins Booster Box", "Booster Boxes", 99.99),
    ("Rift Bound", "Rift Blister", "Blisters", 12.99),
    ("Union Arena", "Starter Deck Set", "Other", 29.99),
    ("Union Arena", "Union Booster Box", "Booster Boxes", 79.99),
    ("Naruto", "Ninja Legacy Booster Box", "Booster Boxes", 84.99),
    ("Naruto", "Hidden Leaf Pack", "Single Packs", 3.99),
    ("Dragon Ball", "Fusion World Booster Box", "Booster Boxes", 74.99),
    ("Dragon Ball", "Awakened Case", "Sealed Cases", 349.99),
    ("Panini", "Prizm Hobby Box", "Booster Boxes", 299.99),
    ("Panini", "Donruss Blaster", "Blisters", 34.99),
    ("Topps", "Chrome Hobby Box", "Booster Boxes", 249.99),
    ("Topps", "Series 1 Hanger", "Blisters", 19.99),
    ("Upper Deck", "Series 1 Hobby Box", "Booster Boxes", 189.99),
    ("Upper Deck", "Young Guns Case", "Sealed Cases", 1899.99),
]


def make_listings(base: float, seed: int, includes_you: bool):
    """Port of SampleData.makeListings."""
    count = 2 + seed % 3
    out = []
    for i in range(count):
        seller = STORE_SELLERS[(seed + i) % len(STORE_SELLERS)]
        price = swift_round(base * (1.0 + i * 0.04) * 100) / 100
        from_case = i % 2 == 0
        out.append((seller[3], price,
                    "From Case" if from_case else "Loose Product",
                    f"Box {1 + (seed + i) % 12} of 12" if from_case else None,
                    2 + (seed + i) % 4))
    if includes_you:
        out.append((YOU[3], swift_round(base * 1.02 * 100) / 100, "From Case", "Box 2 of 12", 3))
    return out


def main() -> int:
    lines: list[str] = []
    add = lines.append

    add("-- ============================================================================")
    add("-- TSM (The Sealed Market) - 02_seed.sql")
    add("-- GENERATED by tools/generate_seed.py - edit the generator, not this file.")
    add("--")
    add("-- Mirrors the iOS mock data: 12 brands, 29 products, per-seller listings, plus")
    add("-- demo accounts. Run 01_schema.sql first.")
    add("--")
    add("-- DEV-ONLY demo logins (never use these anywhere real):")
    add(f"--   app users   (all of them) password: {DEMO_PASSWORD}")
    add("--     buyer@tsm.test      plain buyer")
    add("--     seller@tsm.test     approved seller - the app's \"You\" listings")
    add("--     applicant@tsm.test  has a pending seller application")
    add(f"--   admin staff admin@tsm.test password: {ADMIN_PASSWORD}")
    add("-- ============================================================================")
    add("")
    add("USE tsm;")
    add("SET NAMES utf8mb4;")
    add("SET time_zone = '+00:00';")
    add("SET FOREIGN_KEY_CHECKS = 0;")
    add("TRUNCATE TABLE audit_logs;")
    add("TRUNCATE TABLE seller_application_documents;")
    add("TRUNCATE TABLE seller_applications;")
    add("TRUNCATE TABLE listings;")
    add("TRUNCATE TABLE seller_profiles;")
    add("TRUNCATE TABLE product_images;")
    add("TRUNCATE TABLE products;")
    add("TRUNCATE TABLE product_types;")
    add("TRUNCATE TABLE brands;")
    add("TRUNCATE TABLE password_reset_tokens;")
    add("TRUNCATE TABLE admin_staff;")
    add("TRUNCATE TABLE users;")
    add("SET FOREIGN_KEY_CHECKS = 1;")
    add("")

    # ---- admin staff
    admin_id = uid("staff", "admin@tsm.test")
    add("-- Admin staff (separate login population from app users)")
    add("INSERT INTO admin_staff (id, email, name, password_hash, role, status, created_at) VALUES")
    add(f"  ({q(admin_id)}, 'admin@tsm.test', 'TSM Admin', {q(hash_pw(ADMIN_PASSWORD))}, 'super_admin', 'active', {q(NOW)});")
    add("")

    # ---- users
    users = [
        ("buyer",     "buyer_demo",     "buyer@tsm.test"),
        ("applicant", "applicant_demo", "applicant@tsm.test"),
        (YOU[0],      YOU[1],           YOU[2]),
    ] + [(s[0], s[1], s[2]) for s in STORE_SELLERS]

    add("-- App users")
    add("INSERT INTO users (id, username, email, password_hash, status, terms_accepted_at, terms_version, email_verified_at, created_at) VALUES")
    rows = []
    for key, username, email in users:
        rows.append(f"  ({q(uid('user', key))}, {q(username)}, {q(email)}, {q(hash_pw(DEMO_PASSWORD))}, "
                    f"'active', {q(NOW)}, '1.0', {q(NOW)}, {q(NOW)})")
    add(",\n".join(rows) + ";")
    add("")

    # ---- seller profiles (approved sellers only)
    add("-- Seller profiles: one per APPROVED seller")
    add("INSERT INTO seller_profiles (user_id, display_name, status, rating_avg, rating_count, sales_count, approved_at, approved_by_staff_id) VALUES")
    rows = []
    for key, _u, _e, display, rating, sales in STORE_SELLERS + [YOU]:
        rows.append(f"  ({q(uid('user', key))}, {q(display)}, 'active', {money(rating)}, 0, {sales}, {q(NOW)}, {q(admin_id)})")
    add(",\n".join(rows) + ";")
    add("")

    # ---- brands & product types
    add("-- Brands (shop-by-brand grid order)")
    add("INSERT INTO brands (id, name, sort_order) VALUES")
    add(",\n".join(f"  ({q(uid('brand', b))}, {q(b)}, {i})" for i, b in enumerate(BRANDS)) + ";")
    add("")
    add("-- Product types (the shop filter chips, minus the app's local 'All')")
    add("INSERT INTO product_types (id, name, sort_order) VALUES")
    add(",\n".join(f"  ({q(uid('ptype', t))}, {q(t)}, {i})" for i, t in enumerate(PRODUCT_TYPES)) + ";")
    add("")

    # ---- products, images, listings
    products = []   # (brand, name, type, images, listings)
    for brand, name, ptype, images, listings in HAND_PRODUCTS:
        products.append((brand, name, ptype, images, listings))
    for index, (brand, name, ptype, base) in enumerate(CATALOG_SPECS):
        products.append((brand, name, ptype, [f"{slug(name)}_1"],
                         make_listings(base, index + 1, index % 5 == 0)))

    add(f"-- Products ({len(products)} = 3 hand-written + {len(CATALOG_SPECS)} generated)")
    add("INSERT INTO products (id, brand_id, product_type_id, name, thumbnail_key, created_at) VALUES")
    rows = []
    for brand, name, ptype, images, _l in products:
        rows.append(f"  ({q(uid('product', f'{brand}/{name}'))}, {q(uid('brand', brand))}, {q(uid('ptype', ptype))}, "
                    f"{q(name)}, {q(images[0])}, {q(NOW)})")
    add(",\n".join(rows) + ";")
    add("")

    add("-- Product detail images (placeholder asset names from the app)")
    add("INSERT INTO product_images (id, product_id, slot, image_key) VALUES")
    rows = []
    n_images = 0
    for brand, name, _t, images, _l in products:
        pid = uid("product", f"{brand}/{name}")
        for slot, key in enumerate(images, start=1):
            rows.append(f"  ({q(uid('pimg', f'{pid}/{slot}'))}, {q(pid)}, {slot}, {q(key)})")
            n_images += 1
    add(",\n".join(rows) + ";")
    add("")

    add("-- Listings: one row per seller offer (quantity 0 = that seller is sold out)")
    add("INSERT INTO listings (id, product_id, seller_id, price, source, box_position, condition_label, quantity_available, created_at) VALUES")
    rows = []
    n_listings = 0
    you_listings = 0
    for brand, name, _t, _i, listings in products:
        pid = uid("product", f"{brand}/{name}")
        for seller_name, price, source, box, qty in listings:
            seller = SELLER_BY_NAME.get(seller_name) or YOU
            if seller is YOU:
                you_listings += 1
            lid = uid("listing", f"{pid}/{seller[0]}")
            rows.append(f"  ({q(lid)}, {q(pid)}, {q(uid('user', seller[0]))}, {money(price)}, "
                        f"{q(source)}, {q(box)}, 'Factory Sealed', {qty}, {q(NOW)})")
            n_listings += 1
    add(",\n".join(rows) + ";")
    add("")

    # ---- seller applications (one approved, one pending) + documents
    app_done = uid("sellerapp", "seller@tsm.test")
    app_open = uid("sellerapp", "applicant@tsm.test")
    add("-- Seller applications: Demo Seller (approved via the 'test' shortcut) and a pending one to review in the admin")
    add("INSERT INTO seller_applications (id, user_id, business_name, business_address, contact_email, phone_number, source_type, distributor_list, status, is_test, decision_note, reviewed_by_staff_id, reviewed_at, submitted_at) VALUES")
    add(f"  ({q(app_done)}, {q(uid('user', 'you'))}, 'Demo Seller Trading Co. (test)', '1 Test Street, Austin, TX 78701', "
        f"'seller@tsm.test', '555-0100', 'test', 'Test Distributor, Local Game Store', 'approved', 1, "
        f"'Auto-approved test application', {q(admin_id)}, {q(NOW)}, {q(NOW)}),")
    add(f"  ({q(app_open)}, {q(uid('user', 'applicant'))}, 'Lone Star Cards LLC', '200 Congress Ave, Austin, TX 78701', "
        f"'applicant@tsm.test', '555-0142', 'distributor', 'Southeast Card Distribution, Pacific Hobby Wholesale', "
        f"'submitted', 0, NULL, NULL, NULL, {q(NOW)});")
    add("")
    add("INSERT INTO seller_application_documents (id, application_id, doc_type, original_filename, storage_key, mime_type, size_bytes) VALUES")
    add(f"  ({q(uid('sellerdoc', 'permit'))}, {q(app_open)}, 'city_permit', 'city_selling_permit.pdf', "
        f"'seller-docs/{app_open}/city_selling_permit.pdf', 'application/pdf', 182400),")
    add(f"  ({q(uid('sellerdoc', 'tax'))}, {q(app_open)}, 'tax_permit', 'tx_sales_tax_permit.jpg', "
        f"'seller-docs/{app_open}/tx_sales_tax_permit.jpg', 'image/jpeg', 640512);")
    add("")

    add("INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, details, created_at) VALUES")
    add(f"  ('staff', {q(admin_id)}, 'seller_application.approved', 'seller_application', {q(app_done)}, "
        f"JSON_OBJECT('note', 'seed data'), {q(NOW)});")
    add("")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Expected counts for 03_verify.sql / README
    print(f"wrote {OUT}")
    print(f"users={len(users)} seller_profiles={len(STORE_SELLERS) + 1} brands={len(BRANDS)} "
          f"product_types={len(PRODUCT_TYPES)} products={len(products)} product_images={n_images} "
          f"listings={n_listings} you_listings={you_listings}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
