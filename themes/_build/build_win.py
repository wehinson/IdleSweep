"""Build the round 3 IdleSweep window themes from one shared template plus a palette each."""
import pathlib
import urllib.parse

HERE = pathlib.Path(__file__).parent
THEMES = HERE.parent
TEMPLATE = (HERE / "win-template.css").read_text(encoding="utf-8")


def svg_url(svg):
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" =:/'(),") + '")'


def caption_buttons(face, light, hilite, shadow, dark, glyph):
    def button(x, kind):
        g = {
            "min": f"<rect x='{x+4}' y='9' width='6' height='2' fill='{glyph}'/>",
            "max": f"<rect x='{x+3}' y='3' width='9' height='8' fill='none' stroke='{glyph}' stroke-width='1'/><rect x='{x+3}' y='3' width='9' height='2' fill='{glyph}'/>",
            "close": f"<path d='M{x+4} 4l7 7M{x+11} 4l-7 7' stroke='{glyph}' stroke-width='1.6'/>",
        }[kind]
        return (
            f"<rect x='{x}' y='0' width='16' height='14' fill='{dark}'/>"
            f"<rect x='{x}' y='0' width='15' height='13' fill='{light}'/>"
            f"<rect x='{x+1}' y='1' width='14' height='12' fill='{shadow}'/>"
            f"<rect x='{x+1}' y='1' width='13' height='11' fill='{hilite}'/>"
            f"<rect x='{x+2}' y='2' width='12' height='10' fill='{face}'/>" + g
        )

    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='52' height='14' viewBox='0 0 52 14'>"
        + button(0, "min") + button(16, "max") + button(36, "close") + "</svg>"
    )
    return svg_url(svg)


def smiley(face, stroke):
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'>"
        f"<circle cx='15' cy='15' r='13' fill='{face}' stroke='{stroke}' stroke-width='2'/>"
        f"<rect x='9' y='9' width='3' height='4' fill='{stroke}'/><rect x='18' y='9' width='3' height='4' fill='{stroke}'/>"
        f"<path d='M8 17q7 8 14 0' fill='none' stroke='{stroke}' stroke-width='2'/></svg>"
    )
    return svg_url(svg)


def grain(r, g, b, alpha, size, freq):
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}'>"
        f"<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='{freq}' numOctaves='2' stitchTiles='stitch'/>"
        f"<feColorMatrix values='0 0 0 0 {r} 0 0 0 0 {g} 0 0 0 0 {b} 0 0 0 {alpha} 0'/></filter>"
        "<rect width='100%' height='100%' filter='url(#n)'/></svg>"
    )
    return svg_url(svg)


def build(theme_id, header, palette, extras="", font_url=None):
    lines = [f'html[data-theme="{theme_id}"] {{']
    for key, value in palette.items():
        lines.append(f"  --w-{key}: {value};")
    lines.append("}")
    css = header.strip() + "\n\n" + "\n".join(lines) + "\n\n" + TEMPLATE.replace("@ID@", theme_id)
    if extras:
        css += "\n" + extras.strip().replace("@ID@", theme_id) + "\n"
    (THEMES / theme_id / "theme.css").write_text(css, encoding="utf-8")
    print("wrote", theme_id, len(css))


FONT = 'Tahoma, Verdana, "Segoe UI", sans-serif'

# ---------- Classic 95 ----------
c = dict(face="#c0c0c0", light="#ffffff", hilite="#dfdfdf", shadow="#808080", dark="#000000")
build(
    "classic-95",
    """/* Classic 95 (Claude)
   Reference: the Company Desktop design refined. Windows 95/98 chrome, a teal desktop, the
   classic Minesweeper board in the middle, and list views that read like a ledger.
   Changes from Company Desktop: the board is the centre column with windows on both sides,
   every window has a title bar with caption buttons, text is 14px, store lines are list rows
   with the navy selection highlight, and figures are tabular and right-aligned. */""",
    {
        "scheme": "light", "desktop": "#008080",
        **c, "ink": "#000000", "muted": "#3c3c3c",
        "title-bg": "linear-gradient(90deg, #000080, #1084d0)", "title-ink": "#ffffff",
        "field": "#ffffff", "field-ink": "#000000", "field-muted": "#505050", "field-rule": "#e4e4e4", "field-disabled": "#8c8c8c",
        "select": "#000080", "select-ink": "#ffffff",
        "tooltip-bg": "#ffffe1", "tooltip-ink": "#000000",
        "led-bg": "#000000", "led-ink": "#ff0000",
        "button": "#c0c0c0", "button-hover": "#c0c0c0", "disabled-ink": "#808080", "disabled-shadow": "#ffffff",
        "tile": "#c0c0c0", "tile-hover": "#c8c8c8", "tile-light": "#ffffff", "tile-dark": "#808080", "tile-open": "#c0c0c0", "tile-grid": "#808080",
        "n1": "#0000ff", "n2": "#008000", "n3": "#ff0000", "n4": "#000080", "n5": "#800000", "n6": "#008080", "n7": "#000000", "n8": "#808080",
        "gold": "#ffff00", "gold-edge": "#808000", "gold-ink": "#000000",
        "silver": "#e4e4e4", "silver-edge": "#808080", "silver-ink": "#000000",
        "bronze": "#e0b080", "bronze-edge": "#806040", "bronze-ink": "#000000",
        "mine": "#ff0000", "mine-ink": "#000000", "flag": "#e00000",
        "radius": "0px", "window-shadow": "0 0 0 transparent",
        "font": FONT, "font-num": FONT, "font-led": '"Share Tech Mono", "Courier New", monospace',
        "caption-buttons": caption_buttons(**c, glyph="#000000"),
        "smiley": smiley("#ffff00", "#000000"),
    },
)

# ---------- Night Shift ----------
n = dict(face="#2e3137", light="#5a5f69", hilite="#42464e", shadow="#1b1d21", dark="#0b0c0e")
build(
    "night-shift",
    """/* Night Shift (Claude)
   Reference: the same classic Windows window system, set for a night shift in the mine
   office: charcoal faces with the full two-step bevel, a deep teal title bar, red LED
   counters, and a dark board whose figures keep the classic colour order, lifted for contrast.
   Text is #e8e8e8 on #2e3137 and #1d1f23 (above 11:1); muted text is above 6:1. */""",
    {
        "scheme": "dark", "desktop": "#14161a",
        "desktop-image": "radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.05) 1px, transparent 1.5px) 0 0 / 16px 16px",
        **n, "ink": "#e8e8e8", "muted": "#aab0b8",
        "title-bg": "linear-gradient(90deg, #0b3a4a, #17708a)", "title-ink": "#ffffff",
        "field": "#1d1f23", "field-ink": "#e8e8e8", "field-muted": "#a7acb4", "field-rule": "#2c2f35", "field-disabled": "#6d727a",
        "select": "#1f6f8b", "select-ink": "#ffffff",
        "tooltip-bg": "#3a3d44", "tooltip-ink": "#f2f2f2",
        "led-bg": "#070707", "led-ink": "#ff3b30",
        "button": "#34373e", "button-hover": "#3b3f47", "disabled-ink": "#71767e", "disabled-shadow": "transparent",
        "tile": "#3a3e45", "tile-hover": "#434852", "tile-light": "#5d626c", "tile-dark": "#1a1c20", "tile-open": "#23262b", "tile-grid": "#33363c",
        "n1": "#6aa8ff", "n2": "#5ccf6a", "n3": "#ff6b6b", "n4": "#b49cff", "n5": "#ff9e57", "n6": "#4fd3d3", "n7": "#e8e8e8", "n8": "#9aa0a8",
        "gold": "#d4b43a", "gold-edge": "#8a7420", "gold-ink": "#1a1400",
        "silver": "#a3a9b1", "silver-edge": "#5f646c", "silver-ink": "#111316",
        "bronze": "#b8814f", "bronze-edge": "#6e4a2a", "bronze-ink": "#160b02",
        "mine": "#c62828", "mine-ink": "#ffffff", "flag": "#ff5a4f",
        "radius": "0px", "window-shadow": "0 10px 28px rgba(0, 0, 0, 0.45)",
        "font": FONT, "font-num": FONT, "font-led": '"Share Tech Mono", "Courier New", monospace',
        "caption-buttons": caption_buttons(**n, glyph="#e8e8e8"),
        "smiley": smiley("#f2c94c", "#14161a"),
    },
)

# ---------- Desert ----------
d = dict(face="#d5ccbb", light="#f6f1e7", hilite="#e7e0d2", shadow="#9c907a", dark="#3f382c")
build(
    "desert-95",
    """/* Desert (Claude)
   Reference: the Windows 95 "Desert" colour scheme: tan window faces, warm bevels, and a
   terracotta title bar. Opened tiles are sand: a fine, fixed-size grain drawn with an SVG
   noise filter, so the texture stays even at every board size (unlike the Cabinet '82 dots).
   The desktop is a dune of the same grain at a coarser scale. */""",
    {
        "scheme": "light", "desktop": "#c6aa7c",
        "desktop-image": grain(0.42, 0.30, 0.14, 0.30, 220, 0.55),
        **d, "ink": "#1f1a12", "muted": "#5b5143",
        "title-bg": "linear-gradient(90deg, #7a4320, #b06d36)", "title-ink": "#fff8ee",
        "field": "#fbf8f1", "field-ink": "#1f1a12", "field-muted": "#665b4a", "field-rule": "#ebe3d3", "field-disabled": "#a2977f",
        "select": "#8a4a22", "select-ink": "#ffffff",
        "tooltip-bg": "#fff6dc", "tooltip-ink": "#1f1a12",
        "led-bg": "#1f1a12", "led-ink": "#ff6a2a",
        "button": "#d5ccbb", "button-hover": "#ddd5c6", "disabled-ink": "#9c907a", "disabled-shadow": "#f6f1e7",
        "tile": "#d5ccbb", "tile-hover": "#ddd5c6", "tile-light": "#f6f1e7", "tile-dark": "#9c907a",
        "tile-open": "#e6d4ab", "tile-open-image": grain(0.45, 0.32, 0.14, 0.42, 120, 0.95), "tile-grid": "#c0a983",
        "n1": "#1c48b8", "n2": "#2a7a2a", "n3": "#c3261b", "n4": "#262a7e", "n5": "#7e1e1e", "n6": "#1a6e6e", "n7": "#1f1a12", "n8": "#6b604f",
        "gold": "#f2cf4a", "gold-edge": "#9a7a10", "gold-ink": "#2a2000",
        "silver": "#e6e2da", "silver-edge": "#9c907a", "silver-ink": "#1f1a12",
        "bronze": "#d8a06a", "bronze-edge": "#8a5a2a", "bronze-ink": "#2a1406",
        "mine": "#d0281e", "mine-ink": "#ffffff", "flag": "#c3261b",
        "radius": "0px", "window-shadow": "2px 2px 0 rgba(63, 56, 44, 0.25)",
        "font": FONT, "font-num": FONT, "font-led": '"Share Tech Mono", "Courier New", monospace',
        "caption-buttons": caption_buttons(**d, glyph="#1f1a12"),
        "smiley": smiley("#ffd23f", "#1f1a12"),
    },
)
