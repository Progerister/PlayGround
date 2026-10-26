#!/usr/bin/env python3
"""Generates the launcher / PWA icons for the AION 2 GS app (no external assets)."""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# hexagon + up-chevron, expressed in the same 24-unit grid as the in-app SVG mark
HEX = [(12, 2.6), (20, 7.3), (20, 16.7), (12, 21.4), (4, 16.7), (4, 7.3)]
CHEV = [(8.4, 14.2), (12, 10.4), (15.6, 14.2)]
STEM = [(12, 10.4), (12, 16.6)]

SS = 4  # supersampling factor


def glyph_layer(size, box_frac, stroke_units, color=(255, 255, 255, 255)):
    """Transparent RGBA layer with the mark, supersampled for smooth edges."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    scale = (s * box_frac) / 18.8  # mark bbox: x 4..20 (16u), y 2.6..21.4 (18.8u)
    ox = (s - 16.0 * scale) / 2.0 - 4.0 * scale
    oy = (s - 18.8 * scale) / 2.0 - 2.6 * scale

    def pt(p):
        return (ox + p[0] * scale, oy + p[1] * scale)

    width = max(2, int(round(stroke_units * scale)))
    for path in (HEX + [HEX[0]], CHEV, STEM):
        d.line([pt(p) for p in path], fill=color, width=width, joint="curve")
    for p in (HEX + CHEV + STEM):
        cx, cy = pt(p)
        r = width / 2.0
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    return img.resize((size, size), Image.LANCZOS)


def gradient(size, radius_frac=0.22, rounded=True, maskable=False, top=(11, 63, 61), bottom=(20, 150, 145)):
    s = size * SS
    base = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    for y in range(s):
        t = y / max(1, s - 1)
        t = t ** 0.85
        col = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (s, y)], fill=col)
    if not maskable and rounded:
        r = int(s * radius_frac)
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=255)
        base.putalpha(mask)
    elif maskable:
        # maskable icons must fill the whole safe circle: keep a full-bleed square
        mask = Image.new("L", (s, s), 255)
        base.putalpha(mask)
    return base.resize((size, size), Image.LANCZOS)


def compose(size, box_frac, stroke, radius_frac=0.22, rounded=True, maskable=False):
    bg = gradient(size, radius_frac, rounded, maskable)
    fg = glyph_layer(size, box_frac, stroke)
    bg.alpha_composite(fg)
    return bg


def save(img, rel):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print("  ->", rel, img.size)


def main():
    print("icons:")
    # adaptive foreground (transparent, glyph inside the 66% safe zone)
    save(glyph_layer(432, 0.60, 1.65), "app/src/main/res/drawable-nodpi/ic_launcher_foreground.png")

    for dpi, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        save(compose(px, 0.54, 1.7), "app/src/main/res/mipmap-%s/ic_launcher.png" % dpi)

    save(compose(192, 0.54, 1.7), "app/src/main/assets/icons/icon-192.png")
    save(compose(512, 0.54, 1.7), "app/src/main/assets/icons/icon-512.png")
    save(compose(512, 0.42, 1.7, maskable=True), "app/src/main/assets/icons/icon-maskable-512.png")
    save(compose(180, 0.54, 1.7), "app/src/main/assets/icons/apple-touch-icon.png")


if __name__ == "__main__":
    main()
