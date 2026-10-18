#!/usr/bin/env python3
"""
Makes simple placeholder pictures for the demo products so the app and the admin site
have something to show before real photography exists. One JPEG per image key used in
sql/02_seed.sql (e.g. collector_set_alpha_1.jpg), written to demo-images/.

  pip install pillow
  python3 tools/generate_demo_images.py

The pictures say "DEMO IMAGE" on purpose. Replace them from the admin site (Catalog > product > photos).
"""
import colorsys
import hashlib
import re
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SEED = (ROOT / "sql" / "02_seed.sql").read_text(encoding="utf-8")
OUT = ROOT / "demo-images"
OUT.mkdir(exist_ok=True)

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SIZE = 800


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def slug(name):
    return name.lower().replace(" ", "_")


# brands: INSERT INTO brands ... ('uuid', 'Name', ...)
brands = dict(re.findall(r"\('([0-9a-f-]{36})', '([^']+)', \d+", SEED.split("INSERT INTO brands", 1)[1].split(";", 1)[0]))
# product types
types_block = SEED.split("INSERT INTO product_types", 1)[1].split(";", 1)[0]
types = dict(re.findall(r"\('([0-9a-f-]{36})', '([^']+)'", types_block))
# products: (id, brand_id, type_id, name, thumbnail_key, ...)
prod_block = SEED.split("INSERT INTO products", 1)[1].split(";", 1)[0]
products = re.findall(r"\('([0-9a-f-]{36})', '([0-9a-f-]{36})', '([0-9a-f-]{36})', '((?:[^']|'')+)', '([^']+)'", prod_block)
img_block = SEED.split("INSERT INTO product_images", 1)[1].split(";", 1)[0]
image_rows = re.findall(r"\('[0-9a-f-]{36}', '([0-9a-f-]{36})', (\d), '([^']+)'\)", img_block)
by_id = {pid: (bid, tid, name.replace("''", "'")) for pid, bid, tid, name, _t in products}

made = 0
for product_id, slot, key in image_rows:
    brand_id, type_id, name = by_id[product_id]
    brand, ptype = brands[brand_id], types[type_id]
    hue = int(hashlib.sha256(brand.encode()).hexdigest()[:6], 16) % 360 / 360.0
    top = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.55, 0.42))
    bottom = tuple(int(c * 255) for c in colorsys.hsv_to_rgb((hue + 0.04) % 1, 0.65, 0.14))
    accent = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.35, 0.98))

    img = Image.new("RGB", (SIZE, SIZE))
    px = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        px.line([(0, y), (SIZE, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))

    d = ImageDraw.Draw(img, "RGBA")
    # a sealed-box silhouette
    d.rounded_rectangle([170, 150, 630, 560], radius=26, fill=(255, 255, 255, 30), outline=accent + (255,), width=5)
    d.rounded_rectangle([172, 152, 628, 215], radius=24, fill=accent + (70,), corners=(True, True, False, False))
    d.line([(400, 150), (400, 215)], fill=accent + (160,), width=3)
    f_brand, f_name, f_tag, f_small = font(BOLD, 30), font(BOLD, 52), font(REG, 28), font(REG, 20)
    d.text((400, 100), brand.upper(), font=f_brand, fill=accent + (255,), anchor="mm")
    lines = textwrap.wrap(name, width=14)[:3]
    y = 330 - (len(lines) - 1) * 32
    for line in lines:
        d.text((400, y), line, font=f_name, fill=(255, 255, 255, 255), anchor="mm")
        y += 64
    d.text((400, 520), "FACTORY SEALED", font=f_small, fill=(255, 255, 255, 190), anchor="mm")
    chip = ptype.upper()
    w = d.textlength(chip, font=f_tag) + 44
    d.rounded_rectangle([400 - w / 2, 628, 400 + w / 2, 678], radius=25, fill=accent + (255,))
    d.text((400, 653), chip, font=f_tag, fill=(15, 15, 20, 255), anchor="mm")
    d.text((400, 755), f"DEMO IMAGE  -  photo {slot}", font=f_small, fill=(255, 255, 255, 120), anchor="mm")

    img.save(OUT / f"{key}.jpg", "JPEG", quality=84, optimize=True)
    made += 1

print(f"wrote {made} pictures to {OUT}")
