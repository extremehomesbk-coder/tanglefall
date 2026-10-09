"""Record a muted 9:16 clip of the demo bot playing (for TikTok / Reels / Shorts).

Usage (from the repo root, with a server running, e.g. `npx vite preview --port 4173`):
    python scripts/record_clip.py [url] [seconds] [seed]
Writes clips/tanglefall_<seed>.mp4 (1080x1920, no audio). Needs the Python Playwright package with
Chromium installed; the mp4 conversion uses the ffmpeg that Playwright ships.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "clips"


def find_ffmpeg() -> str | None:
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    base = Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright"
    for d in sorted(base.glob("ffmpeg-*"), reverse=True):
        for exe in d.glob("ffmpeg*"):
            return str(exe)
    return None


def main() -> None:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/?auto=1&seed=11"
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 9.0
    seed = sys.argv[3] if len(sys.argv) > 3 else "11"
    if "seed=" not in url:
        url += ("&" if "?" in url else "?") + f"seed={seed}"
    if "hd=" not in url:
        url += "&hd=2"  # 2x canvas so the 1080x1920 frame is crisp
    if "canvas=" not in url:
        url += "&canvas=1"  # software-friendly renderer; WebGL in headless Chromium runs at a few fps
    headed = os.environ.get("CLIP_HEADED") == "1"
    CLIPS.mkdir(exist_ok=True)
    lead_in = 1.6  # seconds of page load + "UNTANGLE!" splash to trim away

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
        page.on("console", lambda msg: print(msg.text) if msg.text.startswith("[demo]") else None)
        page.goto(url, wait_until="load")
        page.wait_for_timeout(int((lead_in + seconds + 0.5) * 1000))
        video = page.video
        ctx.close()
        webm = Path(video.path()) if video else None
        browser.close()

    if not webm or not webm.exists():
        print("no video produced")
        sys.exit(1)
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        final = CLIPS / f"tanglefall_{seed}.webm"
        webm.replace(final)
        print("ffmpeg not found; kept", final)
        return
    # Playwright's own ffmpeg only carries VP8; a system ffmpeg with libx264 gives a TikTok-friendlier mp4.
    encoders = subprocess.run([ffmpeg, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    h264 = "libx264" in encoders
    out = CLIPS / (f"tanglefall_{seed}.mp4" if h264 else f"tanglefall_{seed}.webm")
    codec = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart"] if h264 else ["-c:v", "libvpx", "-b:v", "5M", "-deadline", "good", "-cpu-used", "1"]
    cmd = [
        ffmpeg, "-y", "-ss", f"{lead_in:.2f}", "-i", str(webm), "-t", f"{seconds:.2f}",
        "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p", *codec, "-r", "30", "-an", str(out),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    webm.unlink(missing_ok=True)
    print("wrote", out, f"{out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
