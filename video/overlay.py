"""The presentation layer of the video, drawn over each captured frame after the capture.

    python3 video/overlay.py video/frames/b2/frames.json [...]

record.ts writes, beside every beat's raw screenshots, a frames.json naming for each frame the pointer position, the
click ripple and the outline it wants drawn, in CSS pixels of the page that was filmed and the device scale it was
filmed at. This script draws them onto a copy of each raw frame, so the raw screenshots stay clean product frames and
the drawn layer can never be under a modal dialog's top layer or shift with a dialog's containing block, which is
what an in-page overlay did. Everything is drawn at four times the frame resolution and scaled down, so every edge
is anti-aliased.
"""

import json
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ACCENT = (30, 63, 184)
SS = 4  # supersampling factor

# The pointer: a classic arrow, tip at (3, 2) of a 24 by 34 CSS-pixel box.
ARROW = [(3, 2), (3, 26), (9, 20.5), (13.4, 30.5), (17.6, 28.6), (13.3, 18.8), (21.2, 18.8)]


@lru_cache(maxsize=8)
def pointer(scale: float) -> Image.Image:
    """The pointer sprite at one device scale: dark fill, white rim, a soft shadow below it."""
    k = scale * SS
    w, h = int(26 * k), int(37 * k)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([(x * k, (y + 1.6) * k) for x, y in ARROW], fill=(0, 0, 0, 105))
    shadow = shadow.filter(ImageFilter.GaussianBlur(2.0 * k))
    body = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    pts = [(x * k, y * k) for x, y in ARROW]
    d.polygon(pts, fill=(20, 20, 20, 255), outline=(255, 255, 255, 255), width=max(1, round(1.8 * k)))
    sprite = Image.alpha_composite(shadow, body)
    return sprite.resize((max(1, round(w / SS)), max(1, round(h / SS))), Image.LANCZOS)


def ring(scale: float, radius: float) -> Image.Image:
    """The click ripple: a ring that fades as it widens."""
    k = scale * SS
    size = int((radius * 2 + 8) * k)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    alpha = int(255 * max(0.15, 1 - radius / 26))
    c = size / 2
    r = radius * k
    ImageDraw.Draw(img).ellipse([c - r, c - r, c + r, c + r], outline=ACCENT + (alpha,), width=max(1, round(2.5 * k)))
    return img.resize((max(1, round(size / SS)), max(1, round(size / SS))), Image.LANCZOS)


def outline(scale: float, w: float, h: float) -> Image.Image:
    """The outline around what the caption is about: an accent rim with a pale halo, 7 CSS pixels outside the node."""
    k = scale * SS
    pad, halo = 7, 5
    W, H = int((w + 2 * (pad + halo)) * k), int((h + 2 * (pad + halo)) * k)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    o = halo * k
    d.rounded_rectangle([o - halo * k / 2, o - halo * k / 2, W - o + halo * k / 2, H - o + halo * k / 2], radius=(10 + halo / 2) * k, outline=ACCENT + (36,), width=round(halo * k))
    d.rounded_rectangle([o, o, W - o, H - o], radius=10 * k, outline=ACCENT + (255,), width=max(1, round(2.5 * k)))
    return img.resize((max(1, round(W / SS)), max(1, round(H / SS))), Image.LANCZOS)


def place(img: Image.Image, layer: Image.Image, x: int, y: int) -> None:
    """Composite a layer at (x, y), cropping whatever falls outside the frame."""
    left, top = max(0, -x), max(0, -y)
    right, bottom = min(layer.width, img.width - x), min(layer.height, img.height - y)
    if right <= left or bottom <= top:
        return
    img.alpha_composite(layer.crop((left, top, right, bottom)), (x + left, y + top))


def paint(frame: dict, root: Path) -> None:
    img = Image.open(root / frame["raw"]).convert("RGBA")
    s = float(frame["scale"])
    box = frame.get("box")
    if box:
        layer = outline(s, box["width"], box["height"])
        off = (7 + 5) * s
        place(img, layer, round(box["x"] * s - off), round(box["y"] * s - off))
    cursor = frame.get("cursor")
    if cursor and frame.get("ripple"):
        rp = ring(s, float(frame["ripple"]))
        place(img, rp, round(cursor["x"] * s - rp.width / 2), round(cursor["y"] * s - rp.height / 2))
    if cursor:
        sprite = pointer(s)
        place(img, sprite, round((cursor["x"] - 3) * s), round((cursor["y"] - 2) * s))
    img.convert("RGB").save(root / frame["out"], optimize=False, compress_level=3)


def main() -> None:
    for arg in sys.argv[1:]:
        path = Path(arg)
        frames = json.loads(path.read_text())
        for frame in frames:
            paint(frame, path.parent)
        print(f"overlay: {len(frames)} frames drawn in {path.parent}")


if __name__ == "__main__":
    main()
