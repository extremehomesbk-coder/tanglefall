"""Placeholder app icon: two leashes crossing on the board colour. Writes public/icon-{180,192,512}.png."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
BG = (26, 29, 40)
EDGE = (42, 46, 63)
CORAL = (255, 90, 95)
SKY = (60, 200, 255)


def draw_icon(size: int) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(s * 0.22)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=r, fill=BG, outline=EDGE, width=max(2, s // 64))
    w = int(s * 0.13)
    m = int(s * 0.2)
    # under strand: sky, top-right to bottom-left
    d.line((s - m, m, m, s - m), fill=SKY, width=w)
    # over strand: coral with a light edge, top-left to bottom-right
    d.line((m, m, s - m, s - m), fill=(255, 255, 255), width=w + int(s * 0.05))
    d.line((m, m, s - m, s - m), fill=BG, width=w + int(s * 0.025))
    d.line((m, m, s - m, s - m), fill=CORAL, width=w)
    for x, y in ((m, m), (s - m, s - m)):
        d.ellipse((x - w // 2, y - w // 2, x + w // 2, y + w // 2), fill=CORAL)
    for x, y in ((s - m, m), (m, s - m)):
        d.ellipse((x - w // 2, y - w // 2, x + w // 2, y + w // 2), fill=SKY)
    return img


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        draw_icon(size).save(OUT / f"icon-{size}.png")
        print("wrote", OUT / f"icon-{size}.png")
