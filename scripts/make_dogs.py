"""Original flat-style dog sprites, one SVG per breed, drawn from shared parts. Writes public/dogs/<breed>.svg.

Side view, facing right, 120x110 viewBox. The collar sits at (74, 46): the scene hangs the leash end there.
Run: python scripts/make_dogs.py
"""

from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "dogs"
INK = "#1a1d28"  # outline colour = board colour, so the dogs read on the dark floor
SW = 3  # outline width


def el(tag: str, **attrs: object) -> str:
    parts = []
    for k, v in attrs.items():
        k = k.rstrip("_").replace("_", "-")
        parts.append(f'{k}="{v}"')
    return f"<{tag} {' '.join(parts)}/>"


def legs(fill: str, cuff: str | None = None) -> list[str]:
    out = []
    for x in (34, 46, 64, 76):
        out.append(el("rect", x=x, y=68, width=11, height=30, rx=5, fill=fill, stroke=INK, stroke_width=SW))
        if cuff:
            out.append(el("circle", cx=x + 5.5, cy=92, r=8, fill=cuff, stroke=INK, stroke_width=SW))
        out.append(el("ellipse", cx=x + 6, cy=97, rx=7, ry=3.5, fill=INK))
    return out


def body(fill: str, ry: int = 20) -> str:
    return el("ellipse", cx=56, cy=60, rx=32, ry=ry, fill=fill, stroke=INK, stroke_width=SW)


def head(fill: str, r: int = 20) -> str:
    return el("circle", cx=88, cy=42, r=r, fill=fill, stroke=INK, stroke_width=SW)


def snout(fill: str, nose: str = INK) -> list[str]:
    return [
        el("ellipse", cx=104, cy=48, rx=12, ry=8.5, fill=fill, stroke=INK, stroke_width=SW),
        el("circle", cx=113, cy=45, r=4.2, fill=nose),
        el("path", d="M104 52 q4 4 8 0", fill="none", stroke=INK, stroke_width=2, stroke_linecap="round"),
    ]


def eye(cx: int = 93, cy: int = 38, r: float = 3.2, iris: str = INK) -> list[str]:
    return [
        el("circle", cx=cx, cy=cy, r=r + 1.6, fill="#ffffff", stroke=INK, stroke_width=1.5),
        el("circle", cx=cx + 0.6, cy=cy, r=r, fill=iris),
        el("circle", cx=cx + 1.6, cy=cy - 1.2, r=1.1, fill="#ffffff"),
    ]


def collar(color: str = "#ff5a5f") -> list[str]:
    return [
        el("path", d="M70 36 q10 14 4 22", fill="none", stroke=INK, stroke_width=SW + 5, stroke_linecap="round"),
        el("path", d="M70 36 q10 14 4 22", fill="none", stroke=color, stroke_width=SW + 1, stroke_linecap="round"),
        el("circle", cx=74, cy=46, r=4, fill="#ffd166", stroke=INK, stroke_width=2),
    ]


def floppy_ear(fill: str) -> str:
    return el("path", d="M76 28 q-8 14 2 30 q10 2 10 -12 q-2 -14 -12 -18z", fill=fill, stroke=INK, stroke_width=SW,
              stroke_linejoin="round")


def pointed_ears(fill: str, inner: str) -> list[str]:
    return [
        el("path", d="M78 30 l-4 -22 l16 12z", fill=fill, stroke=INK, stroke_width=SW, stroke_linejoin="round"),
        el("path", d="M90 26 l4 -22 l10 16z", fill=fill, stroke=INK, stroke_width=SW, stroke_linejoin="round"),
        el("path", d="M79 27 l-2 -13 l9 8z", fill=inner),
        el("path", d="M91 23 l3 -13 l6 10z", fill=inner),
    ]


def tongue() -> str:
    return el("path", d="M103 55 q3 8 7 1 z", fill="#ff6ad5", stroke=INK, stroke_width=1.5)


def tail_wag(fill: str) -> str:
    return el("path", d="M26 54 q-14 -10 -10 -28", fill="none", stroke=INK, stroke_width=SW + 6, stroke_linecap="round") + el(
        "path", d="M26 54 q-14 -10 -10 -28", fill="none", stroke=fill, stroke_width=SW + 2, stroke_linecap="round"
    )


def tail_curl(fill: str) -> list[str]:
    return [
        el("circle", cx=28, cy=42, r=9, fill="none", stroke=INK, stroke_width=SW + 6),
        el("circle", cx=28, cy=42, r=9, fill="none", stroke=fill, stroke_width=SW + 2),
    ]


def tail_bushy(fill: str, light: str) -> list[str]:
    return [
        el("path", d="M26 54 q-18 -6 -12 -30 q6 -8 14 0 q2 14 6 24z", fill=fill, stroke=INK, stroke_width=SW,
           stroke_linejoin="round"),
        el("path", d="M20 48 q-6 -10 2 -22 q4 6 4 18z", fill=light),
    ]


def svg(parts: list[str]) -> str:
    inner = "\n  ".join(parts)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 110" width="120" height="110">\n  {inner}\n</svg>\n'


def mutt() -> list[str]:
    brown, cream = "#b8824f", "#f3e3c6"
    return [
        tail_wag(brown),
        *legs(brown),
        body(brown),
        el("ellipse", cx=66, cy=66, rx=14, ry=10, fill=cream),  # chest patch
        head(brown),
        el("circle", cx=95, cy=38, r=9, fill="#6b4a2b"),  # eye patch
        *snout(cream),
        tongue(),
        *eye(),
        *collar("#3cc8ff"),
        floppy_ear(brown),
    ]


def poodle() -> list[str]:
    cream, shade = "#f6efe4", "#e2d3bd"
    pom = lambda cx, cy, r: el("circle", cx=cx, cy=cy, r=r, fill=cream, stroke=INK, stroke_width=SW)  # noqa: E731
    return [
        el("path", d="M26 54 q-10 -8 -8 -22", fill="none", stroke=INK, stroke_width=SW + 4, stroke_linecap="round"),
        el("path", d="M26 54 q-10 -8 -8 -22", fill="none", stroke=shade, stroke_width=SW, stroke_linecap="round"),
        pom(18, 30, 9),
        *legs(shade, cuff=cream),
        body(cream, ry=18),
        head(cream, r=18),
        pom(76, 26, 9),
        pom(86, 20, 10),
        pom(97, 25, 8),
        *snout(cream),
        *eye(cx=94, cy=40, r=3),
        *collar("#ff6ad5"),
        el("path", d="M74 32 q-10 16 -2 30 q8 4 10 -10 q0 -12 -8 -20z", fill=cream, stroke=INK, stroke_width=SW),
    ]


def guide_dog() -> list[str]:
    yellow, light = "#e3c285", "#f4e2b8"
    return [
        tail_wag(yellow),
        *legs(yellow),
        body(yellow),
        el("ellipse", cx=66, cy=68, rx=14, ry=9, fill=light),
        # harness: chest band + rigid handle up over the back
        el("path", d="M42 44 q14 -10 30 -2", fill="none", stroke="#555b70", stroke_width=5, stroke_linecap="round"),
        el("path", d="M46 44 q-2 -22 18 -24 q16 0 16 20", fill="none", stroke=INK, stroke_width=8, stroke_linecap="round"),
        el("path", d="M46 44 q-2 -22 18 -24 q16 0 16 20", fill="none", stroke="#8d93a8", stroke_width=4, stroke_linecap="round"),
        el("rect", x=40, y=44, width=36, height=10, rx=4, fill="#555b70", stroke=INK, stroke_width=2),
        el("rect", x=50, y=44, width=16, height=10, fill="#ffd166"),
        head(yellow),
        *snout(light),
        *eye(),
        *collar("#7ee04f"),
        floppy_ear("#cfae72"),
    ]


def service_dog() -> list[str]:
    black, grey = "#3a3c48", "#5a5d6e"
    return [
        tail_wag(black),
        *legs(black),
        body(black),
        # red vest with a white band
        el("path", d="M30 52 q26 -22 56 -4 l-2 18 q-26 -10 -52 2z", fill="#e23b3b", stroke=INK, stroke_width=SW,
           stroke_linejoin="round"),
        el("rect", x=48, y=46, width=14, height=20, fill="#ffffff", transform="rotate(-8 55 56)"),
        head(black),
        *snout(grey, nose="#0d0e14"),
        *eye(iris="#6b3f1e"),
        *collar("#ffb42e"),
        floppy_ear(black),
    ]


def pug() -> list[str]:
    fawn, mask = "#d8b47a", "#2a2630"
    return [
        *tail_curl(fawn),
        *legs(fawn),
        body(fawn, ry=22),
        el("circle", cx=86, cy=44, r=22, fill=fawn, stroke=INK, stroke_width=SW),
        el("circle", cx=96, cy=48, r=13, fill=mask),  # black mask
        el("ellipse", cx=103, cy=50, rx=9, ry=6.5, fill=mask, stroke=INK, stroke_width=2),
        el("circle", cx=110, cy=47, r=3.6, fill="#0d0e14"),
        el("path", d="M78 30 q6 -4 12 0 M80 25 q6 -4 12 0", fill="none", stroke="#9a7a46", stroke_width=2,
           stroke_linecap="round"),  # forehead wrinkles
        *eye(cx=92, cy=40, r=4.2),
        tongue(),
        *collar("#b06cff"),
        el("path", d="M76 26 q-8 10 -2 20 q7 0 8 -9 q0 -8 -6 -11z", fill=mask, stroke=INK, stroke_width=SW),
    ]


def husky() -> list[str]:
    grey, white = "#8e97a8", "#f0f3f8"
    return [
        *tail_bushy(grey, white),
        *legs(white),
        body(grey),
        el("ellipse", cx=62, cy=70, rx=22, ry=10, fill=white),
        head(grey),
        el("path", d="M80 42 q8 -14 16 0 q8 18 -2 22 q-14 2 -14 -22z", fill=white),  # face mask
        *pointed_ears(grey, "#f5c9c2"),
        *snout(white),
        *eye(iris="#5ec8ff"),
        *collar("#ff5a5f"),
    ]


BREEDS = {
    "mutt": mutt,
    "poodle": poodle,
    "guide": guide_dog,
    "service": service_dog,
    "pug": pug,
    "husky": husky,
}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in BREEDS.items():
        (OUT / f"{name}.svg").write_text(svg(fn()), encoding="utf-8")
        print("wrote", OUT / f"{name}.svg")
