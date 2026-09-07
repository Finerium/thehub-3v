#!/usr/bin/env bash
# The banned-pattern catalogue of blueprint 7.3 as a check (AC-VIS-01), with the stylesheet audit of 7.2
# (AC-VIS-02), the imagery and provenance rules of 7.4 (AC-VIS-03) and the mock-pattern sweep of 10.3
# (AC-VIS-04). Every item of the catalogue is one named check with its own failure message, so a red run says
# which design rule broke and where, not that "the audit failed".
#
#   bash scripts/audits/banned-patterns.sh          (also run by `pnpm audit`, which globs scripts/audits/*.sh)
#   BANNED_PATTERNS_ROOT=/some/copy bash scripts/audits/banned-patterns.sh
#
# What it reads, and why each surface is read the way it is:
#
#   the five authored stylesheets   src/app/globals.css, src/components/system.css, src/components/drafts.css,
#                                   src/app/login/login.module.css, deck/src/deck.css. The colour, typeface and
#                                   motion rules are read here rather than in the built CSS because the built
#                                   sheet also carries the framework's own generated declarations (next/font
#                                   emits `local(Arial)` metric overrides, Tailwind emits a default font chain),
#                                   which are not design decisions and would be false hits. What the framework
#                                   actually paints is read the other way round, from computed styles, in
#                                   tests/e2e/visual.spec.ts.
#   the built export                deliverables/TheHub_prototype.html, a rendered copy of every read-only
#                                   surface of 6.2 in one file. The markup half of the catalogue is read per
#                                   section, so the run ends with one {artifact, pass, findings[]} record per
#                                   screen, which is the shape AC-VIS-01 asks for. Base64 `data:` payloads are
#                                   stripped before any text scan: the page render is a webp, and its base64
#                                   body contains every three-letter word by accident.
#                                   A checkout that has not built the export (Tier A's `checks` job, a fresh
#                                   clone) cannot read those six checks at all: they are reported as NOT
#                                   AUDITED, by name and with the command that builds the artefact, and the
#                                   closing line says how many of the catalogue's checks the run could not
#                                   reach. A run that names them is never a full pass, and the six still fail
#                                   hard wherever the export exists.
#   the sources                     src/ and deck/src/ for the mock-pattern sweep, plus package.json.
#   the provenance record           bundle/documents.json. Blueprint 7.4 asks for the provenance of every render
#                                   "in the provenance file the hygiene gate checks" and AC-VIS-03 names it
#                                   `provenance.json`; no file of that name exists in either repository. The
#                                   bundle's document manifest is that record and it is the one already bound to
#                                   the corpus: it carries id, sha256, page_count and source_path for all 98
#                                   documents. Check `provenance-binds` reads the DOM attributes back against it,
#                                   which is the reading the hygiene gate was for. A `provenance.json` generated
#                                   here from the DOM would only restate the DOM and could not fail.
#
# What it cannot see, and where that lives instead: everything geometric or computed. A row of exactly three
# equal cards, a centered hero with its button pair, a badge floating over the H1, containers nested three deep,
# blur stacked past two layers, a hover state that does nothing, a rendered colour: all of those are in
# tests/e2e/visual.spec.ts, which measures the same export in a browser.
#
# ponytail: the per-screen split cuts the export at each `data-x-route` marker rather than parsing the tree, so a
# screen's slice ends where the next one starts. That is exact for the text and attribute rules read here; the
# structural rules that need a real tree are the browser spec's.
set -uo pipefail
ROOT="${BANNED_PATTERNS_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || { echo "banned-patterns: $ROOT is not a directory"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "banned-patterns: python3 is not on PATH (it is the scanner)"; exit 1; }

exec python3 - <<'PY'
"""The scanner. One class per catalogue group, one check per catalogue item."""

from __future__ import annotations

import colorsys
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path.cwd()

STYLESHEETS = [
    "src/app/globals.css",
    "src/components/system.css",
    "src/components/drafts.css",
    "src/app/login/login.module.css",
    "deck/src/deck.css",
]
EXPORT = Path("deliverables/TheHub_prototype.html")
DOCUMENTS = Path("bundle/documents.json")
SOURCE_ROOTS = ["src", "deck/src"]

# name -> the sentence a red run prints, in the words of the blueprint item it enforces.
MESSAGE: dict[str, str] = {
    # 7.3 colour and theme
    "banned-hue": "7.3 bans the purple-violet wash and the default teal accent family; the accent is cobalt ink",
    "pure-text-colour": "7.1 and 7.3: text is never pure white and never pure black, it is the ink tokens",
    "card-accent-wash": "7.3 bans every card tinted with its own accent wash",
    "card-left-rule": "7.3 bans thin coloured left rules on every card (a state rule on one component is content)",
    "dark-mode": "7.1: dark mode is not built, and 7.3 bans an unrequested permanent dark mode",
    # 7.3 badges and eyebrows
    "glow-shadow": "7.3 bans glowing card borders and glowing status dots",
    "infinite-animation": "7.3 bans pulsing status dots and decorative motion that carries no meaning",
    "slop-pill": "7.3 bans monospace uppercase letter-spaced pill chips as decoration (a tag in mono is content)",
    # 7.3 typography
    "banned-typeface": "7.3 bans Inter, Roboto, Arial, Poppins, Montserrat and system defaults as the design",
    "serif-headline": "7.3 bans the oversized serif headline with one italic accent word",
    "type-pairing": "7.3 bans one typeface doing every job; 7.1 names three families with one job each",
    # 7.2 motion, the stylesheet half
    "animated-layout-property": "7.2, hard rule: transform and opacity only, never animate a layout property",
    "snap-transition": "7.3 bans snap transitions with no easing",
    "reduced-motion-fallback": "7.2: prefers-reduced-motion is honoured with a complete static experience",
    # 7.3 layout and decoration, the markup half
    "canned-skeleton": "7.3 bans the canned skeleton: the Get Started and Learn More hero, a pricing or FAQ row, a logo strip",
    "decorative-class": "7.3 bans pastel blobs, gradient orbs, floating 3D shapes and bento grids without a reason",
    # 7.4 imagery and provenance, AC-VIS-03
    "external-image-url": "7.4: imagery is corpus-derived and native only, so an external image URL is a stock image",
    "image-provenance": "7.4: every render carries its provenance in the DOM (document, page or set, SHA-256)",
    "provenance-binds": "7.4: the provenance the DOM states must resolve in the provenance record (bundle/documents.json)",
    "slot-marker": "9.12 and AC-VIS-03: zero unresolved slot markers in a deliverable",
    # 10.3 real-data integrity, AC-VIS-04
    "math-random": "10.3 and AC-VIS-04: no Math.random in a display path, a placeholder number is never the answer",
    "mock-library": "AC-VIS-04: no faker remnant, no lorem metric, no stock-image host",
    "hardcoded-series": "AC-VIS-04: no hardcoded numeric array feeding a display; every figure binds to the fixture",
}

ORDER: list[str] = []
FINDINGS: dict[str, list[str]] = {}
SCOPE: dict[str, str] = {}
# A check whose subject is not in this checkout: named in the report, never counted as clean.
UNREACHED: dict[str, str] = {}


def register(name: str, scope: str) -> None:
    ORDER.append(name)
    FINDINGS[name] = []
    SCOPE[name] = scope


def hit(name: str, where: str, what: str) -> None:
    FINDINGS[name].append(f"{where}: {what}")


def read(path: Path | str) -> str:
    return Path(path).read_text(encoding="utf8", errors="replace")


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


# ------------------------------------------------------------------------------------------------------------
# Colour. Hue bands are the two families 7.3 names, with the palette's own hues measured well clear of both:
# the cobalt accent is 227, the verified green 145, the caveat amber 34, the defect red 4.
# ------------------------------------------------------------------------------------------------------------
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)")
TEAL = (160, 210)
VIOLET = (250, 335)


def hsl_of(literal: str) -> tuple[float, float, float] | None:
    """Hue in degrees, saturation and lightness in 0..1, or None when the literal is not a plain colour."""
    text = literal.strip().lower()
    if text.startswith("#"):
        digits = text[1:]
        if len(digits) in (3, 4):
            digits = "".join(c * 2 for c in digits)
        if len(digits) not in (6, 8):
            return None
        try:
            r, g, b = (int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4))
        except ValueError:
            return None
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        return h * 360, s, l
    numbers = re.findall(r"-?\d*\.?\d+", text)
    if text.startswith("hsl") and len(numbers) >= 3:
        return float(numbers[0]) % 360, float(numbers[2 - 1]) / 100, float(numbers[2]) / 100
    if text.startswith("rgb") and len(numbers) >= 3:
        r, g, b = (min(255.0, float(n)) / 255 for n in numbers[:3])
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        return h * 360, s, l
    return None


def in_band(hue: float, band: tuple[int, int]) -> bool:
    return band[0] <= hue <= band[1]


# ------------------------------------------------------------------------------------------------------------
# A very small CSS reader: rules as (selector, body, offset), declarations as (property, value, offset).
# Nested at-rules are handled by the fact that the innermost braces are the ones that match.
# ------------------------------------------------------------------------------------------------------------
RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
DECL = re.compile(r"(?:^|;)\s*(-{0,2}[a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([^;]+)")
LAYOUT_PROPERTIES = re.compile(
    r"\b(width|height|top|left|right|bottom|margin|padding|inset|font-size|line-height|flex|gap|"
    r"border-width|border-radius|grid-template|order|position|float|min-width|min-height|max-width|max-height)\b"
)
BARE_CARD = re.compile(r"^\.(card|panel|tile|surface|glass|box)$")
MONO_FAMILY = re.compile(r"(?i)mono")
BANNED_FAMILIES = re.compile(r"(?i)\b(Inter|Roboto|Arial|Poppins|Montserrat|Helvetica)\b|^\s*(system-ui|-apple-system)")
SERIF_FAMILY = re.compile(r"(?i)(?<!sans-)(?<!ui-)\bserif\b|\b(Georgia|Times|Playfair|Merriweather|Lora)\b")


def keyframe_blocks(css: str):
    """Every @keyframes block as (name, body), found by matching braces from the at-rule."""
    for m in re.finditer(r"@keyframes\s+([\w-]+)\s*\{", css):
        depth, i = 1, m.end()
        while i < len(css) and depth:
            if css[i] == "{":
                depth += 1
            elif css[i] == "}":
                depth -= 1
            i += 1
        yield m.group(1), css[m.end() : i - 1], m.start()


def scan_stylesheets() -> None:
    for name in (
        "banned-hue",
        "pure-text-colour",
        "card-accent-wash",
        "card-left-rule",
        "dark-mode",
        "glow-shadow",
        "infinite-animation",
        "slop-pill",
        "banned-typeface",
        "serif-headline",
        "type-pairing",
        "animated-layout-property",
        "snap-transition",
        "reduced-motion-fallback",
    ):
        register(name, "the authored stylesheets")

    present = [s for s in STYLESHEETS if Path(s).exists()]
    if not present:
        hit("banned-hue", "src", "no authored stylesheet was found, so nothing was audited")
        return

    families: set[str] = set()
    reduced_motion_ok = False

    for path in present:
        css = read(path)
        where = lambda off: f"{path}:{line_of(css, off)}"  # noqa: E731

        # Colour literals, wherever they sit. Near-white and near-black are the paper and ink tokens; the bands
        # are only meaningful on a colour with enough saturation and lightness to be an accent.
        for m in COLOUR.finditer(css):
            hsl = hsl_of(m.group(0))
            if hsl is None:
                continue
            hue, sat, light = hsl
            if sat < 0.25 or light < 0.15 or light > 0.92:
                continue
            if in_band(hue, TEAL):
                hit("banned-hue", where(m.start()), f"{m.group(0)} is teal or cyan (hue {hue:.0f})")
            elif in_band(hue, VIOLET):
                hit("banned-hue", where(m.start()), f"{m.group(0)} is violet or purple (hue {hue:.0f})")

        if re.search(r"prefers-color-scheme\s*:\s*dark|\[data-theme=[\"']?dark|\.dark\b", css):
            m = re.search(r"prefers-color-scheme\s*:\s*dark|\[data-theme=[\"']?dark|\.dark\b", css)
            hit("dark-mode", where(m.start()), "a dark theme is declared")

        start = re.search(r"prefers-reduced-motion\s*:\s*reduce\s*\)?\s*\{", css)
        if start:
            block = css[start.end() : start.end() + 900]
            if "animation-duration: 0s" in block and "transition-duration: 0s" in block:
                reduced_motion_ok = True

        for name, body, off in keyframe_blocks(css):
            for prop, _value, _o in ((d.group(1), d.group(2), d.start()) for d in DECL.finditer(body)):
                if LAYOUT_PROPERTIES.search(prop):
                    hit("animated-layout-property", where(off), f"@keyframes {name} animates {prop}")

        for rule in RULE.finditer(css):
            selector = " ".join(rule.group(1).split())
            body = rule.group(2)
            parts = [p.strip() for p in selector.split(",")]
            decls = {d.group(1): d.group(2).strip() for d in DECL.finditer(body)}
            at = where(rule.start())

            for prop, value in decls.items():
                if prop == "color" and re.search(r"(?i)^\s*(#fff{1,3}|#ffffff|white|#000|#000000|black|rgb\(\s*0\s*,\s*0\s*,\s*0|rgb\(\s*255\s*,\s*255\s*,\s*255)", value):
                    hit("pure-text-colour", at, f"{selector} sets color: {value}")
                if prop.startswith("font-family"):
                    families.add(re.sub(r"\s+", " ", value.split(",")[0].strip().strip("\"'")))
                    if BANNED_FAMILIES.search(value):
                        hit("banned-typeface", at, f"{selector} sets font-family: {value}")
                    if SERIF_FAMILY.search(value):
                        hit("serif-headline", at, f"{selector} sets a serif font-family: {value}")
                if prop == "box-shadow":
                    for shadow in re.split(r",(?![^(]*\))", value):
                        colour = COLOUR.search(shadow)
                        lengths = [float(n) for n in re.findall(r"(-?\d*\.?\d+)px", shadow)]
                        hsl = hsl_of(colour.group(0)) if colour else None
                        if hsl and hsl[1] >= 0.4 and 0.2 <= hsl[2] <= 0.85 and any(l >= 8 for l in lengths):
                            hit("glow-shadow", at, f"{selector} glows: box-shadow {shadow.strip()}")
                if prop.startswith("animation") and re.search(r"\binfinite\b", value):
                    hit("infinite-animation", at, f"{selector} animates for ever: {prop}: {value}")
                if prop.startswith(("transition", "animation")):
                    if re.search(r"\blinear\b|\bsteps\(", value):
                        hit("snap-transition", at, f"{selector} has no easing: {prop}: {value}")
                if prop in ("transition", "transition-property"):
                    # The value of the shorthand is a property name, a duration and an easing; only the first
                    # token of each comma-separated part is the property.
                    for part in re.split(r",(?![^(]*\))", value):
                        token = part.strip().split(" ")[0]
                        if LAYOUT_PROPERTIES.fullmatch(token) or (token != "all" and LAYOUT_PROPERTIES.fullmatch(token or "")):
                            hit("animated-layout-property", at, f"{selector} transitions {token}")
                        if token == "all":
                            hit("animated-layout-property", at, f"{selector} transitions all, which includes layout")

            if any(BARE_CARD.match(p) for p in parts):
                background = decls.get("background") or decls.get("background-color")
                if background:
                    colour = COLOUR.search(background)
                    hsl = hsl_of(colour.group(0)) if colour else None
                    if hsl and hsl[1] >= 0.25 and 0.15 <= hsl[2] <= 0.92:
                        hit("card-accent-wash", at, f"{selector} is tinted: background {background}")
                if any(p.startswith("border-left") for p in decls):
                    hit("card-left-rule", at, f"{selector} carries a left rule on every instance")

            family = decls.get("font-family", "")
            radius = decls.get("border-radius", "")
            pill = bool(re.search(r"\b(999|9999)px|50%", radius))
            if MONO_FAMILY.search(family) and "uppercase" in decls.get("text-transform", "") and "letter-spacing" in decls and pill:
                hit("slop-pill", at, f"{selector} is a decorative mono uppercase pill")

    if len({f for f in families if f and f != "inherit"}) < 3:
        hit("type-pairing", "the authored stylesheets", f"only {sorted(families)} are used; 7.1 names three families")
    if not reduced_motion_ok:
        hit(
            "reduced-motion-fallback",
            "src/app/globals.css",
            "no prefers-reduced-motion block zeroes animation-duration and transition-duration",
        )

    for name in ("banned-hue", "animated-layout-property"):
        SCOPE[name] = f"{len(present)} authored stylesheets"


# ------------------------------------------------------------------------------------------------------------
# The built export: the markup half of the catalogue, per screen.
# ------------------------------------------------------------------------------------------------------------
DATA_URI = re.compile(r"data:[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+")
IMG = re.compile(r"<img\b[^>]*>", re.I)
SVG = re.compile(r"<svg\b[^>]*>", re.I)
ATTR = re.compile(r'([a-zA-Z0-9-]+)\s*=\s*"([^"]*)"')
SLOT_MARKERS = [
    (re.compile(r"TBD_"), "TBD_ marker"),
    (re.compile(r"\{\{\s*[\w.]+\s*\}\}"), "an unresolved {{ }} slot"),
    (re.compile(r"\bTODO\b"), "a TODO"),
    (re.compile(r"\bFIXME\b"), "a FIXME"),
    (re.compile(r"(?i)lorem ipsum"), "lorem ipsum"),
    (re.compile(r"<slot\b"), "a <slot> element"),
]
SKELETON = [
    (re.compile(r"(?i)get started"), "the Get Started call to action"),
    (re.compile(r"(?i)learn more"), "the Learn More call to action"),
    (re.compile(r"(?i)<h[1-6][^>]*>[^<]{0,40}(pricing|frequently asked|faq)"), "a pricing or FAQ heading"),
    (re.compile(r'(?i)class="[^"]*\blogo-?strip\b'), "a logo strip"),
]
DECORATION = re.compile(r'(?i)class="[^"]*\b(bento|blob|orb|gradient-wash|glow|sparkle|aurora)\b')
EXTERNAL_IMAGE = re.compile(r'(?i)(?:src|srcset|poster)\s*=\s*"https?://|url\(\s*[\'"]?https?://')


def screens_of(html: str) -> list[tuple[str, str]]:
    """(slug, markup) per read-only surface, cut at the section markers the export build wrote."""
    marks = [(m.group(1), html.rfind("<", 0, m.start())) for m in re.finditer(r'data-x-route="([^"]+)"', html)]
    out = []
    for i, (slug, start) in enumerate(marks):
        end = marks[i + 1][1] if i + 1 < len(marks) else len(html)
        out.append((slug, html[start:end]))
    return out


EXPORT_CHECKS = ("canned-skeleton", "decorative-class", "external-image-url", "image-provenance", "provenance-binds", "slot-marker")


def scan_export() -> list[dict[str, object]]:
    for name in EXPORT_CHECKS:
        register(name, "the built export")

    if not EXPORT.exists():
        note = f"{EXPORT} is not built in this checkout; `pnpm export:demo` writes it"
        for name in EXPORT_CHECKS:
            UNREACHED[name] = note
        return []

    html = DATA_URI.sub("data:base64-stripped", read(EXPORT))
    documents = {}
    if DOCUMENTS.exists():
        documents = {d["id"]: d for d in json.loads(read(DOCUMENTS))}
    else:
        hit("provenance-binds", str(DOCUMENTS), "the provenance record is absent, so no render could be resolved")

    screens = screens_of(html)
    records: list[dict[str, object]] = []
    for slug, markup in screens:
        findings: list[dict[str, str]] = []

        def flag(check_name: str, what: str) -> None:
            hit(check_name, f"{EXPORT}#{slug}", what)
            findings.append({"severity": "blocker", "what": f"{check_name}: {what} ({MESSAGE[check_name]})"})

        for pattern, what in SLOT_MARKERS:
            if pattern.search(markup):
                flag("slot-marker", what)
        for pattern, what in SKELETON:
            if pattern.search(markup):
                flag("canned-skeleton", what)
        m = DECORATION.search(markup)
        if m:
            flag("decorative-class", f"a decorative class ({m.group(1)})")
        if EXTERNAL_IMAGE.search(markup):
            flag("external-image-url", "an image is loaded from an external address")

        for tag in IMG.finditer(markup):
            attrs = dict(ATTR.findall(tag.group(0)))
            missing = [a for a in ("data-document", "data-sha256") if not attrs.get(a)]
            if not (attrs.get("data-page") or attrs.get("data-set")):
                missing.append("data-page or data-set")
            if missing:
                flag("image-provenance", f"a render carries no {', '.join(missing)}")
                continue
            if documents:
                document = documents.get(attrs["data-document"])
                if document is None:
                    flag("provenance-binds", f"{attrs['data-document']} is not a document of the corpus")
                elif document.get("sha256") != attrs["data-sha256"]:
                    flag("provenance-binds", f"{attrs['data-document']} states a SHA-256 the record does not carry")
                elif attrs.get("data-page") and not (1 <= int(attrs["data-page"]) <= int(document.get("page_count", 0))):
                    flag("provenance-binds", f"{attrs['data-document']} page {attrs['data-page']} is outside the document")
        for tag in SVG.finditer(markup):
            attrs = dict(ATTR.findall(tag.group(0)))
            decorative = "aria-hidden" in tag.group(0)
            if not decorative and not any(a.startswith("data-") for a in attrs):
                flag("image-provenance", "a figure carries no provenance attribute")

        records.append({"artifact": f"{EXPORT}#{slug}", "pass": not findings, "findings": findings})

    for name in ("canned-skeleton", "decorative-class", "external-image-url", "image-provenance", "slot-marker"):
        SCOPE[name] = f"{len(screens)} screens of the built export"
    SCOPE["provenance-binds"] = f"{len(screens)} screens against {len(documents)} documents of {DOCUMENTS}"
    return records


# ------------------------------------------------------------------------------------------------------------
# The sources: the mock-pattern sweep of AC-VIS-04.
# ------------------------------------------------------------------------------------------------------------
MOCK = re.compile(r"(?i)\bfaker\b|lorem ipsum|placeholder\.com|dummyjson|picsum\.photos|unsplash\.com|via\.placeholder")
SERIES = re.compile(r"=\s*\[\s*(?:-?\d+(?:\.\d+)?\s*,\s*){2,}-?\d+(?:\.\d+)?\s*,?\s*\]")


FIXTURES = Path("bundle/fixtures.json")


def is_index_run(numbers: list[float]) -> bool:
    """[1,2,3,4,5,6] and [0,1,2] are index lists, not a series; anything else is data typed into a display."""
    if not all(n.is_integer() for n in numbers) or numbers[0] not in (0.0, 1.0):
        return False
    return all(b - a == 1 for a, b in zip(numbers, numbers[1:]))


def fixture_numbers() -> set[float]:
    """Every number bundle/fixtures.json carries, at any depth: the binding of 10.3 a series has to resolve to."""
    if not FIXTURES.exists():
        return set()
    out: set[float] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        elif isinstance(node, bool):
            return
        elif isinstance(node, (int, float)):
            out.add(float(node))
        elif isinstance(node, str) and re.fullmatch(r"-?\d+(?:\.\d+)?", node):
            out.add(float(node))

    walk(json.loads(read(FIXTURES)))
    return out


def scan_sources() -> None:
    for name in ("math-random", "mock-library", "hardcoded-series"):
        register(name, "src/ and deck/src/")

    files = 0
    bound = fixture_numbers()
    if not bound:
        hit("hardcoded-series", str(FIXTURES), "the fixture is absent, so no series could be resolved against it")
    for root in SOURCE_ROOTS:
        for base, dirs, names in os.walk(root):
            dirs[:] = [d for d in dirs if d not in {"node_modules", "generated", ".next", "dist"}]
            for name in names:
                if not name.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs")):
                    continue
                path = Path(base) / name
                if name.endswith((".test.ts", ".test.tsx", ".spec.ts")):
                    continue
                text = read(path)
                files += 1
                for m in re.finditer(r"\bMath\.random\s*\(", text):
                    hit("math-random", f"{path}:{line_of(text, m.start())}", "Math.random in a shipped path")
                for m in MOCK.finditer(text):
                    hit("mock-library", f"{path}:{line_of(text, m.start())}", f"a mock remnant: {m.group(0)}")
                for m in SERIES.finditer(text):
                    numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", m.group(0))]
                    where = f"{path}:{line_of(text, m.start())}"
                    literal = " ".join(m.group(0).split())[:60]
                    if is_index_run(numbers):
                        continue
                    if path.suffix in (".tsx", ".jsx"):
                        # A rendering file. A series typed here is a series the screen draws.
                        hit("hardcoded-series", where, f"a typed numeric series in a rendering path: {literal}")
                        continue
                    # A module. The frozen constants of the method live here, and each one is a number the
                    # fixture also carries; a number the fixture does not carry was typed by a person.
                    loose = [n for n in numbers if n not in bound]
                    if loose:
                        hit("hardcoded-series", where, f"{literal} states {loose[0]:g}, which {FIXTURES} does not carry")

    package = Path("package.json")
    if package.exists():
        for m in re.finditer(r'"(faker|@faker-js/faker|chance|casual|falso)"\s*:', read(package)):
            hit("mock-library", "package.json", f"a mock data dependency: {m.group(1)}")
    for name in ("math-random", "mock-library", "hardcoded-series"):
        SCOPE[name] = f"{files} source files"


# ------------------------------------------------------------------------------------------------------------
scan_stylesheets()
records = scan_export()
scan_sources()

failed = [name for name in ORDER if FINDINGS[name]]
for name in ORDER:
    if name in UNREACHED:
        print(f"NOT AUDITED: {name}: {UNREACHED[name]}")
        continue
    found = FINDINGS[name]
    if not found:
        print(f"ok:   {name} ({SCOPE[name]})")
        continue
    print(f"FAIL: {name}: {MESSAGE[name]}")
    for line in found[:6]:
        print(f"        {line}")
    if len(found) > 6:
        print(f"        and {len(found) - 6} more")

read = len(ORDER) - len(UNREACHED)
passed_screens = sum(1 for r in records if r["pass"])
summary = f"\nbanned-patterns: {read - len(failed)} of {read} checks clean"
if records:
    summary += f", {passed_screens} of {len(records)} screens with zero findings"
if UNREACHED:
    summary += f", {len(UNREACHED)} checks NOT AUDITED ({', '.join(sorted(UNREACHED))})"
print(summary)
print("-- per-screen records (AC-VIS-01, one JSON object per line) --")
for record in records:
    print(json.dumps(record, separators=(",", ":")))

sys.exit(1 if failed else 0)
PY
