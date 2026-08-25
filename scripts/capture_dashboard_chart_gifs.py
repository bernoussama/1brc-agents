#!/usr/bin/env python3
"""Capture dither-kit bar entrance animations from /charts/cloud-agent/ as GIFs."""

from __future__ import annotations

import asyncio
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium", file=sys.stderr)
    raise

OUT = Path("/workspace/artifacts/chart-gifs")
FRAMES = OUT / "frames"
PAGE_URL = "http://localhost:4321/charts/cloud-agent/?capture=1"
# One rAF per frame; 2s animation + settle tail at 60 Hz.
MAX_FRAMES = 200
OUTPUT_FPS = 15
HOLD_FINAL_FRAMES = 8

PANELS: list[tuple[str, str]] = [
    ("median-run-time", "Median run time"),
    ("agent-wall-time", "Agent wall time"),
    ("estimated-cost", "Estimated cost"),
]

NEXT_RAF = "() => new Promise((resolve) => requestAnimationFrame(resolve))"


async def wait_for_animation_start(page) -> None:
    """Wait until the panel canvas has begun drawing bars."""
    await page.wait_for_function(
        """(title) => {
          const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent === title);
          if (!heading) return false;
          const panel = heading.closest('div.flex-col');
          const canvas = panel?.querySelector('canvas');
          if (!canvas || canvas.width === 0) return false;
          const ctx = canvas.getContext('2d');
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 40) sum += data[i];
          return sum > 0;
        }""",
        arg=PANELS[0][1],
        timeout=15_000,
    )


async def capture_panel(page, slug: str, title: str) -> list[Path]:
    """Reload the page and capture one panel's mount animation, synced to rAF."""
    panel_dir = FRAMES / slug
    if panel_dir.exists():
        shutil.rmtree(panel_dir)
    panel_dir.mkdir(parents=True, exist_ok=True)

    await page.goto(PAGE_URL, wait_until="commit")
    await page.wait_for_selector("canvas", state="attached", timeout=15_000)
    await wait_for_animation_start(page)

    locator = page.locator("h2", has_text=title).locator(
        "xpath=ancestor::div[contains(@class,'flex-col')][1]"
    )
    chart = locator.locator(".border-foreground.bg-card.h-96")

    saved: list[Path] = []
    prev_hash = ""
    stable_count = 0

    for i in range(MAX_FRAMES):
        await page.evaluate(NEXT_RAF)
        path = panel_dir / f"frame_{len(saved):03d}.png"
        await chart.screenshot(path=str(path))

        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != prev_hash:
            saved.append(path)
            prev_hash = digest
            stable_count = 0
        else:
            path.unlink(missing_ok=True)
            stable_count += 1
            if saved and stable_count <= HOLD_FINAL_FRAMES:
                hold = panel_dir / f"frame_{len(saved):03d}.png"
                shutil.copy2(saved[-1], hold)
                saved.append(hold)
            if stable_count >= HOLD_FINAL_FRAMES and len(saved) > 24:
                break

    return saved


def encode_gif(slug: str, frame_paths: list[Path]) -> Path:
    gif_path = OUT / f"{slug}.gif"
    if not frame_paths:
        raise RuntimeError(f"No frames captured for {slug}")

    # ffmpeg expects contiguous frame_%03d numbering.
    panel_dir = FRAMES / slug
    for idx, src in enumerate(frame_paths):
        dst = panel_dir / f"encode_{idx:03d}.png"
        if src != dst:
            shutil.copy2(src, dst)

    input_pattern = panel_dir / "encode_%03d.png"
    palette = OUT / f"{slug}-palette.png"

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(OUTPUT_FPS),
            "-i",
            str(input_pattern),
            "-vf",
            "palettegen=max_colors=256:stats_mode=full",
            str(palette),
        ],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(OUTPUT_FPS),
            "-i",
            str(input_pattern),
            "-i",
            str(palette),
            "-lavfi",
            "paletteuse=dither=bayer:bayer_scale=2",
            "-loop",
            "0",
            str(gif_path),
        ],
        check=True,
        capture_output=True,
    )

    palette.unlink(missing_ok=True)
    for f in panel_dir.glob("encode_*.png"):
        f.unlink()
    return gif_path


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
            color_scheme="dark",
            reduced_motion="no-preference",
        )
        page = await context.new_page()
        await page.add_init_script(
            "() => { document.documentElement.classList.add('dark'); "
            "try { localStorage.setItem('colorTheme', 'dark'); } catch {} }"
        )

        panel_frames: dict[str, list[Path]] = {}
        for slug, title in PANELS:
            frames = await capture_panel(page, slug, title)
            panel_frames[slug] = frames
            print(f"{slug}: {len(frames)} unique frames")

        await browser.close()

    for slug in panel_frames:
        path = encode_gif(slug, panel_frames[slug])
        print(path)


if __name__ == "__main__":
    asyncio.run(main())
