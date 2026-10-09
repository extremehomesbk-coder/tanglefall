"""Record muted 9:16 clips of the demo bot for TikTok / Reels / Shorts.

Usage (from the repo root, with a server running, e.g. `npx vite preview --port 4173`):
    python scripts/record_clip.py                       # all three variants
    python scripts/record_clip.py hook --seed 11        # one variant
    python scripts/record_clip.py chain --seconds 12 --walk 2-1 --url http://localhost:5173/
Variants (each is a URL recipe for the in-game demo bot, see CONFIG.demo and GameScene):
    hook   a text hook over the board for ~2 s, then a clean 1-1 run
    chain  the bot plays greedy for chain length on a busier walk, big combo callouts
    fail   the bot plays until two dogs short of the target, then stands still: amber clock, pulse, TIME'S UP
Writes clips/tanglefall_<variant>_<seed>.mp4 (1080x1920, 30 fps, no audio) when a system ffmpeg with libx264 is on
PATH (winget install Gyan.FFmpeg), else a VP8 .webm through the ffmpeg that Playwright ships.
"""

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "clips"
LEAD_IN = 1.6  # seconds of page load to trim away


@dataclass
class Variant:
    name: str
    params: dict[str, str]
    seconds: float
    seed: int


VARIANTS = {
    "hook": Variant("hook", {"hook": "6 dogs. 1 tangle.|Get 5 home in 45 s"}, 11.0, 11),
    "chain": Variant("chain", {"demo": "chain", "walk": "3-1"}, 11.0, 23),
    "fail": Variant("fail", {"demo": "fail", "walk": "3-1", "walksec": "14"}, 24.0, 5),
}


def find_ffmpeg() -> str | None:
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    # winget install Gyan.FFmpeg (the PATH of an already-open shell is stale, so look in the package folder too)
    for cand in [local / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe", *sorted((local / "Microsoft" / "WinGet" / "Packages").glob("Gyan.FFmpeg*/*/bin/ffmpeg.exe"), reverse=True)]:
        if cand.exists():
            return str(cand)
    base = local / "ms-playwright"
    for d in sorted(base.glob("ffmpeg-*"), reverse=True):
        for exe in d.glob("ffmpeg*"):
            return str(exe)
    return None


def build_url(base: str, v: Variant, seed: int, walk: str | None) -> str:
    params = {"auto": "1", "seed": str(seed), "hd": "2", "canvas": "1", **v.params}
    if walk:
        params["walk"] = walk
    return base.rstrip("/") + "/?" + urlencode(params)


def record(url: str, seconds: float, headed: bool) -> Path | None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed, args=["--disable-gpu-vsync", "--disable-frame-rate-limit"])
        # the video frame must equal the viewport, or Playwright pads the page into a grey corner
        ctx = browser.new_context(
            viewport={"width": 1080, "height": 1920},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
            record_video_dir=str(CLIPS),
            record_video_size={"width": 1080, "height": 1920},
        )
        page = ctx.new_page()
        page.on("console", lambda msg: print("   ", msg.text) if msg.text.startswith("[demo]") else None)
        page.goto(url, wait_until="load")
        page.wait_for_timeout(int((LEAD_IN + seconds + 0.5) * 1000))
        video = page.video
        ctx.close()
        webm = Path(video.path()) if video else None
        browser.close()
    return webm if webm and webm.exists() else None


def encode(webm: Path, out_stem: Path, seconds: float) -> Path:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        final = out_stem.with_suffix(".webm")
        webm.replace(final)
        print("ffmpeg not found; kept", final)
        return final
    encoders = subprocess.run([ffmpeg, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    h264 = "libx264" in encoders
    out = out_stem.with_suffix(".mp4" if h264 else ".webm")
    codec = (
        ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart"]
        if h264
        else ["-c:v", "libvpx", "-b:v", "5M", "-deadline", "good", "-cpu-used", "1"]
    )
    cmd = [
        ffmpeg, "-y", "-ss", f"{LEAD_IN:.2f}", "-i", str(webm), "-t", f"{seconds:.2f}",
        "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p", *codec, "-r", "30", "-an", str(out),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    webm.unlink(missing_ok=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("variants", nargs="*", choices=[*VARIANTS, "all"], default=["all"])
    ap.add_argument("--url", default="http://localhost:4173/", help="server root")
    ap.add_argument("--seed", type=int, help="override the variant's seed")
    ap.add_argument("--seconds", type=float, help="override the clip length")
    ap.add_argument("--walk", help="override the walk, e.g. 2-1")
    ap.add_argument("--headed", action="store_true", help="watch the browser (also CLIP_HEADED=1)")
    args = ap.parse_args()
    names = list(VARIANTS) if "all" in args.variants else args.variants
    CLIPS.mkdir(exist_ok=True)
    headed = args.headed or os.environ.get("CLIP_HEADED") == "1"
    for name in names:
        v = VARIANTS[name]
        seed = args.seed if args.seed is not None else v.seed
        seconds = args.seconds if args.seconds is not None else v.seconds
        url = build_url(args.url, v, seed, args.walk)
        print(f"[{name}] {url}")
        webm = record(url, seconds, headed)
        if not webm:
            print("no video produced")
            sys.exit(1)
        out = encode(webm, CLIPS / f"tanglefall_{name}_{seed}", seconds)
        print(f"[{name}] wrote {out} {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
