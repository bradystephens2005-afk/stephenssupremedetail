#!/usr/bin/env python3
"""Draw the placeholder illustrations in /images.

These stand in until real product photos are taken. To use a real photo,
drop it in /images and point the matching IMAGES entry in build.py at it.
Running this script overwrites the .svg placeholders only.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "images"

INK = "#1F2D33"
SLATE = "#34444B"
STEEL = "#4A5A61"
CUP = "#A9BCC5"
FLEECE = "#EFE5D3"
FLEECE_DK = "#E0D0B6"
HONEY = "#E9B04F"
MESH = "#9DB0B9"


def svg(w, h, body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
        f"<defs>{defs}</defs>{body}</svg>\n"
    )


SKY_DEFS = """
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#C9D9E3"/><stop offset=".62" stop-color="#E6EEF2"/><stop offset="1" stop-color="#F5EEDF"/>
</linearGradient>
<radialGradient id="sun" cx=".74" cy=".18" r=".5">
  <stop offset="0" stop-color="#F7DB9C" stop-opacity=".95"/><stop offset=".45" stop-color="#F7DB9C" stop-opacity=".35"/>
  <stop offset="1" stop-color="#F7DB9C" stop-opacity="0"/>
</radialGradient>
"""


def outdoors(w, h):
    """Sky, sun, soft hills and a leafy branch seen through glass."""
    return f"""
<rect width="{w}" height="{h}" fill="url(#sky)"/>
<rect width="{w}" height="{h}" fill="url(#sun)"/>
<circle cx="{w*.74:.0f}" cy="{h*.18:.0f}" r="{w*.08:.0f}" fill="#FAE7B8"/>
<path d="M0 {h*.68:.0f} C{w*.2:.0f} {h*.62:.0f} {w*.38:.0f} {h*.67:.0f} {w*.55:.0f} {h*.63:.0f} C{w*.72:.0f} {h*.59:.0f} {w*.86:.0f} {h*.64:.0f} {w} {h*.61:.0f} V{h} H0Z" fill="#C4D4DC"/>
<path d="M0 {h*.75:.0f} C{w*.24:.0f} {h*.71:.0f} {w*.46:.0f} {h*.75:.0f} {w*.68:.0f} {h*.72:.0f} C{w*.82:.0f} {h*.70:.0f} {w*.93:.0f} {h*.72:.0f} {w} {h*.71:.0f} V{h} H0Z" fill="#B5C7D0"/>
<g fill="#A9BDB2" opacity=".9">
  <path d="M-10 {h*.08:.0f} C{w*.12:.0f} {h*.1:.0f} {w*.22:.0f} {h*.14:.0f} {w*.32:.0f} {h*.2:.0f}" stroke="#94A99D" stroke-width="7" fill="none" stroke-linecap="round"/>
  <ellipse cx="{w*.08:.0f}" cy="{h*.07:.0f}" rx="34" ry="15" transform="rotate(-20 {w*.08:.0f} {h*.07:.0f})"/>
  <ellipse cx="{w*.15:.0f}" cy="{h*.135:.0f}" rx="30" ry="13" transform="rotate(35 {w*.15:.0f} {h*.135:.0f})"/>
  <ellipse cx="{w*.21:.0f}" cy="{h*.11:.0f}" rx="28" ry="12" transform="rotate(-30 {w*.21:.0f} {h*.11:.0f})"/>
  <ellipse cx="{w*.27:.0f}" cy="{h*.19:.0f}" rx="26" ry="11" transform="rotate(40 {w*.27:.0f} {h*.19:.0f})"/>
  <ellipse cx="{w*.31:.0f}" cy="{h*.155:.0f}" rx="22" ry="10" transform="rotate(-25 {w*.31:.0f} {h*.155:.0f})"/>
</g>
<g stroke="#FFFFFF" stroke-opacity=".28" stroke-width="22">
  <path d="M{w*.1:.0f} {h} L{w*.5:.0f} 0"/><path d="M{w*.22:.0f} {h} L{w*.62:.0f} 0" stroke-width="9"/>
</g>"""


def cup(x, y, r=24):
    return (
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFFFFF" fill-opacity=".55" stroke="{CUP}" stroke-width="4"/>'
        f'<circle cx="{x}" cy="{y}" r="{r*.42:.1f}" fill="{CUP}"/>'
    )


def perch(cx, top, scale=1.0, cat=True):
    """A cordless perch seen from inside the room, optionally with a loafing cat."""
    s = scale
    g = [f'<g transform="translate({cx} {top}) scale({s})">']
    # upper cups and arms (behind the bed)
    g.append(f'<path d="M-180 10 L-200 -50 M180 10 L200 -50" stroke="{STEEL}" stroke-width="7" stroke-linecap="round"/>')
    g.append(cup(-200, -62) + cup(200, -62))
    # lower cups and arms
    g.append(f'<path d="M-215 70 L-160 160 M215 70 L160 160" stroke="{STEEL}" stroke-width="7" stroke-linecap="round"/>')
    g.append(cup(-160, 172) + cup(160, 172))
    # the bed: top surface, then front lip
    g.append(f'<path d="M-185 0 H185 L225 58 H-225 Z" fill="{FLEECE}"/>')
    g.append(f'<path d="M-185 0 H185" stroke="{FLEECE_DK}" stroke-width="3"/>')
    g.append(f'<rect x="-228" y="56" width="456" height="34" rx="12" fill="{FLEECE_DK}"/>')
    g.append(f'<rect x="-228" y="56" width="456" height="34" rx="12" fill="none" stroke="{STEEL}" stroke-width="6"/>')
    g.append(f'<path d="M-200 73 H200" stroke="{HONEY}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="7 7"/>')
    if cat:
        g.append(f"""
<g fill="{SLATE}">
  <path d="M-10 48 C-40 70 -110 76 -150 60" stroke="{SLATE}" stroke-width="20" stroke-linecap="round" fill="none"/>
  <path d="M-150 60 C-178 70 -186 100 -170 128" stroke="{SLATE}" stroke-width="20" stroke-linecap="round" fill="none"/>
  <ellipse cx="0" cy="8" rx="128" ry="62"/>
  <circle cx="108" cy="-46" r="50"/>
  <path d="M78 -82 L84 -132 L112 -92 Z"/><path d="M118 -92 L146 -128 L150 -76 Z"/>
  <ellipse cx="96" cy="50" rx="30" ry="14"/>
</g>
<path d="M-108 -30 C-60 -60 30 -62 70 -40" stroke="{HONEY}" stroke-opacity=".35" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M126 -50 q8 -5 16 0 q-8 6 -16 0 Z" fill="{HONEY}"/>""")
    g.append("</g>")
    return "".join(g)


def hero():
    w, h = 800, 1000
    body = outdoors(w, h) + perch(400, 600, 1.1) + f'<rect y="{h-70}" width="{w}" height="70" fill="#F2F5F7"/><rect y="{h-70}" width="{w}" height="6" fill="#DCE5EA"/>'
    return svg(w, h, body, SKY_DEFS)


def perch_window():
    w = h = 1000
    body = (
        f'<rect width="{w}" height="{h}" fill="#EDF2F5"/>'
        f'<g transform="translate(130 70)"><svg width="740" height="780" viewBox="0 0 740 780">{outdoors(740, 780)}</svg></g>'
        f'<rect x="130" y="70" width="740" height="780" fill="none" stroke="#FBFCFD" stroke-width="26"/>'
        f'<rect x="117" y="57" width="766" height="806" fill="none" stroke="#D7E1E7" stroke-width="2"/>'
        f'<rect x="130" y="402" width="740" height="16" fill="#FBFCFD"/>'
        f'<rect x="90" y="850" width="820" height="40" rx="6" fill="#FBFCFD"/><rect x="90" y="886" width="820" height="10" fill="#D7E1E7"/>'
        + perch(500, 600, 1.02)
    )
    return svg(w, h, body, SKY_DEFS)


def perch_cups():
    w = h = 1000
    defs = SKY_DEFS + '<radialGradient id="cupg" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".9"/><stop offset="1" stop-color="#C8D6DD" stop-opacity=".55"/></radialGradient>'
    body = (
        outdoors(w, h)
        + '<rect width="1000" height="1000" fill="#FFFFFF" fill-opacity=".18"/>'
        + f'<path d="M520 520 L1040 1040" stroke="{STEEL}" stroke-width="46" stroke-linecap="round"/>'
        + f'<path d="M520 520 L1040 1040" stroke="#6E8089" stroke-width="10" stroke-linecap="round" transform="translate(-12 6)"/>'
        + '<circle cx="470" cy="470" r="250" fill="url(#cupg)" stroke="#A9BCC5" stroke-width="10"/>'
        + '<circle cx="470" cy="470" r="185" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="6"/>'
        + f'<circle cx="470" cy="470" r="92" fill="{CUP}"/><circle cx="470" cy="470" r="52" fill="#8EA3AD"/>'
        + '<path d="M300 330 C340 290 400 268 450 266" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" fill="none" stroke-opacity=".85"/>'
        + f'<path d="M230 640 q-30 30 -10 70 l60 -8 q-6 -40 -50 -62 Z" fill="{CUP}"/>'
        + f'<path d="M760 820 L1000 820 L1000 1000 L640 1000 Z" fill="{FLEECE}"/><path d="M760 820 L1000 820" stroke="{FLEECE_DK}" stroke-width="8"/>'
    )
    return svg(w, h, body, defs)


def perch_cover():
    w = h = 1000
    defs = f"""
<pattern id="fleece" width="36" height="36" patternUnits="userSpaceOnUse">
  <rect width="36" height="36" fill="{FLEECE}"/>
  <path d="M4 10 q5 -6 10 0 M20 26 q5 -6 10 0" stroke="{FLEECE_DK}" stroke-width="3" fill="none" stroke-linecap="round"/>
</pattern>
<pattern id="mesh" width="18" height="18" patternUnits="userSpaceOnUse">
  <rect width="18" height="18" fill="#C7D4DA"/>
  <path d="M0 0 H18 M0 0 V18" stroke="{MESH}" stroke-width="3"/>
</pattern>
<clipPath id="pad"><rect x="140" y="230" width="720" height="540" rx="56"/></clipPath>"""
    body = (
        '<rect width="1000" height="1000" fill="#EEF3F6"/>'
        '<ellipse cx="500" cy="800" rx="390" ry="34" fill="#1F2D33" fill-opacity=".07"/>'
        '<g clip-path="url(#pad)"><rect x="140" y="230" width="720" height="540" fill="url(#fleece)"/>'
        '<path d="M620 230 L860 230 L860 770 L380 770 Z" fill="url(#mesh)"/></g>'
        f'<path d="M620 230 L380 770" stroke="{STEEL}" stroke-width="5" stroke-dasharray="14 8"/>'
        f'<rect x="140" y="230" width="720" height="540" rx="56" fill="none" stroke="{STEEL}" stroke-width="10"/>'
        f'<rect x="162" y="252" width="676" height="496" rx="40" fill="none" stroke="{STEEL}" stroke-opacity=".45" stroke-width="3" stroke-dasharray="10 9"/>'
        f'<g transform="translate(824 300) rotate(15)"><rect x="-14" y="0" width="28" height="64" rx="10" fill="{HONEY}"/><circle cy="14" r="6" fill="#FFFFFF"/></g>'
    )
    return svg(w, h, body, defs)


def perch_folded():
    w = h = 1000
    body = (
        '<rect width="1000" height="1000" fill="#EEF3F6"/>'
        '<rect y="700" width="1000" height="300" fill="#E2EAEE"/>'
        '<ellipse cx="500" cy="760" rx="380" ry="30" fill="#1F2D33" fill-opacity=".09"/>'
        f'<g transform="translate(500 600) skewX(-18)">'
        f'<rect x="-330" y="80" width="660" height="70" rx="22" fill="{FLEECE_DK}" stroke="{STEEL}" stroke-width="8"/>'
        f'<rect x="-330" y="80" width="660" height="22" rx="10" fill="{FLEECE}"/>'
        f'<path d="M-300 150 L-250 150 M300 150 L250 150" stroke="{STEEL}" stroke-width="8"/>'
        "</g>"
        + "".join(cup(x, 778, 20) for x in (230, 380, 620, 770))
        + f'<path d="M880 640 V770" stroke="{HONEY}" stroke-width="5"/><path d="M866 640 H894 M866 770 H894" stroke="{HONEY}" stroke-width="5"/>'
        + '<g transform="translate(500 290)">' + perch(0, 0, 0.42, cat=False) + "</g>"
        + f'<path d="M500 430 V530" stroke="{STEEL}" stroke-width="5" stroke-dasharray="10 10"/><path d="M480 512 L500 540 L520 512" fill="none" stroke="{STEEL}" stroke-width="5"/>'
    )
    return svg(w, h, body)


def fur_lifter_shape():
    return f"""
<g>
  <rect x="-60" y="-10" width="120" height="380" rx="56" fill="{SLATE}"/>
  <rect x="-34" y="40" width="68" height="250" rx="34" fill="#46575E"/>
  <rect x="-190" y="-230" width="380" height="240" rx="70" fill="#9DB0B9"/>
  <rect x="-190" y="-230" width="380" height="110" rx="55" fill="#B6C6CD"/>
  <rect x="-210" y="-120" width="420" height="120" rx="60" fill="#D9B46E"/>
  <path d="M-180 -90 H180 M-180 -60 H180 M-180 -30 H180" stroke="#C49C55" stroke-width="5" stroke-linecap="round"/>
  <rect x="-40" y="-205" width="80" height="22" rx="11" fill="{HONEY}"/>
</g>"""


def fur_lifter():
    w = h = 1000
    body = (
        '<rect width="1000" height="1000" fill="#EEF3F6"/>'
        '<circle cx="500" cy="470" r="330" fill="#E2EAEF"/>'
        '<ellipse cx="500" cy="880" rx="260" ry="26" fill="#1F2D33" fill-opacity=".08"/>'
        '<g transform="translate(500 470) rotate(-18)">' + fur_lifter_shape() + "</g>"
    )
    return svg(w, h, body)


def fur_lifter_couch():
    w = h = 1000
    tufts = "".join(
        f'<path d="M{x} {y} q8 -14 18 -2" stroke="#8A7E70" stroke-width="4" fill="none" stroke-linecap="round" opacity=".75"/>'
        for x, y in [(120, 560), (170, 610), (230, 575), (140, 680), (210, 700), (280, 650), (110, 760), (190, 790),
                     (260, 760), (320, 720), (300, 820), (150, 860), (350, 600), (240, 880)]
    )
    body = (
        '<rect width="1000" height="1000" fill="#DDE6EB"/>'
        '<rect x="40" y="420" width="920" height="560" rx="70" fill="#B9C9D1"/>'
        '<rect x="40" y="420" width="920" height="70" rx="35" fill="#C8D6DC"/>'
        '<path d="M500 450 V980" stroke="#A7B9C2" stroke-width="6"/>'
        + tufts
        + '<g transform="translate(560 560) rotate(62) scale(.82)">' + fur_lifter_shape() + "</g>"
        + f'<path d="M640 760 h170 M660 800 h120" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="8" stroke-linecap="round"/>'
    )
    return svg(w, h, body)


def box(x, y, w, h, lid=True):
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="#D8C4A2"/>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="none" stroke="#C2AB86" stroke-width="5"/>'
        + (f'<rect x="{x + w/2 - 30}" y="{y}" width="60" height="{h}" fill="{HONEY}"/>' if lid else "")
    )


def paw(x, y, s=1.0, color="#FBFCFD"):
    return (
        f'<g transform="translate({x} {y}) scale({s})" fill="{color}">'
        '<ellipse cx="0" cy="18" rx="26" ry="21"/><circle cx="-26" cy="-12" r="10"/><circle cx="-9" cy="-26" r="10"/>'
        '<circle cx="9" cy="-26" r="10"/><circle cx="26" cy="-12" r="10"/></g>'
    )


def bundle():
    w = h = 1000
    body = (
        '<rect width="1000" height="1000" fill="#EEF3F6"/>'
        + box(90, 120, 500, 360)
        + paw(340, 300, 1.4)
        + f'<g transform="translate(130 560)"><rect width="460" height="300" rx="40" fill="{FLEECE}" stroke="{STEEL}" stroke-width="8"/>'
        f'<rect x="20" y="20" width="420" height="260" rx="28" fill="none" stroke="{FLEECE_DK}" stroke-width="5" stroke-dasharray="12 10"/></g>'
        + f'<g transform="translate(640 140)"><rect width="270" height="340" rx="36" fill="{FLEECE}"/>'
        f'<path d="M30 60 q20 -14 40 0 M120 160 q20 -14 40 0 M60 250 q20 -14 40 0 M180 90 q20 -14 40 0" stroke="{FLEECE_DK}" stroke-width="6" fill="none" stroke-linecap="round"/></g>'
        + '<g transform="translate(780 700) rotate(28) scale(.62)">' + fur_lifter_shape() + "</g>"
    )
    return svg(w, h, body)


def gift_box():
    w = h = 1000
    body = (
        '<rect width="1000" height="1000" fill="#EEF3F6"/>'
        '<ellipse cx="500" cy="820" rx="330" ry="30" fill="#1F2D33" fill-opacity=".08"/>'
        + box(200, 360, 600, 450, lid=False)
        + '<rect x="180" y="300" width="640" height="110" rx="16" fill="#E2D0B0" stroke="#C2AB86" stroke-width="5"/>'
        + f'<rect x="470" y="300" width="60" height="510" fill="{HONEY}"/>'
        + f'<path d="M500 300 C430 220 360 240 380 290 C395 320 470 310 500 300 C530 310 605 320 620 290 C640 240 570 220 500 300 Z" fill="{HONEY}"/>'
        + f'<g transform="translate(640 560) rotate(-8)"><rect x="-70" y="-50" width="140" height="100" rx="12" fill="#FBFCFD"/></g>'
        + paw(640, 560, 0.9, SLATE)
    )
    return svg(w, h, body)


def about_tools():
    w = h = 1000
    body = (
        '<rect width="1000" height="1000" fill="#E9EFF2"/>'
        '<rect y="560" width="1000" height="440" fill="#D8C8AE"/>'
        '<path d="M0 640 H1000 M0 760 H1000 M0 880 H1000" stroke="#C9B795" stroke-width="4"/>'
        '<rect x="560" y="80" width="360" height="420" fill="#FBFCFD"/>'
        '<rect x="584" y="104" width="312" height="372" fill="#D2E0E7"/>'
        '<circle cx="820" cy="190" r="46" fill="#F6E0AC"/>'
        '<rect x="730" y="104" width="12" height="372" fill="#FBFCFD"/>'
        # tape measure
        f'<g transform="translate(260 690)"><rect x="-130" y="-120" width="260" height="240" rx="70" fill="{HONEY}"/>'
        f'<circle r="62" fill="#F3CC80"/><circle r="22" fill="{SLATE}"/>'
        f'<rect x="120" y="70" width="330" height="44" fill="#F6E6BE"/>'
        + "".join(f'<path d="M{140 + i*26} 70 v{18 if i % 2 else 28}" stroke="{SLATE}" stroke-width="4"/>' for i in range(12))
        + "</g>"
        # level
        f'<g transform="translate(640 860) rotate(-4)"><rect x="-260" y="-36" width="520" height="72" rx="10" fill="{SLATE}"/>'
        '<rect x="-60" y="-20" width="120" height="40" rx="20" fill="#CFE3C9"/><ellipse cx="0" cy="0" rx="18" ry="11" fill="#FFFFFF" fill-opacity=".8"/></g>'
        # pencil
        f'<g transform="translate(140 900) rotate(-12)"><rect width="300" height="26" fill="{HONEY}"/>'
        f'<path d="M300 0 L340 13 L300 26 Z" fill="#E9D6B2"/><path d="M328 9 L340 13 L328 17 Z" fill="{INK}"/></g>'
    )
    return svg(w, h, body)


DRAWINGS = {
    "hero-window.svg": hero,
    "perch-window.svg": perch_window,
    "perch-cups.svg": perch_cups,
    "perch-cover.svg": perch_cover,
    "perch-folded.svg": perch_folded,
    "fur-lifter.svg": fur_lifter,
    "fur-lifter-couch.svg": fur_lifter_couch,
    "bundle.svg": bundle,
    "gift-box.svg": gift_box,
    "about-tools.svg": about_tools,
}

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, fn in DRAWINGS.items():
        (OUT / name).write_text(fn(), encoding="utf-8")
        print("drew", name)
