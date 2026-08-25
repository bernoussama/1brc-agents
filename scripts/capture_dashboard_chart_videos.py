#!/usr/bin/env python3
"""Record dither-kit bar entrance animations from /charts/cloud-agent/ as MP4 videos."""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium", file=sys.stderr)
    raise

OUT = Path("/workspace/artifacts/chart-videos")
RAW = OUT / "raw"
BASE_URL = "http://localhost:4321/charts/cloud-agent/"
# Default 900ms entrance animation + ~1s hold on the finished chart.
RECORD_MS = 3500
# 1920×1080 recording — matches a full-HD browser window.
VIEWPORT = {"width": 1920, "height": 1080}

PANELS: list[tuple[str, str]] = [
    ("median-run-time", "Median run time"),
    ("agent-wall-time", "Agent wall time"),
    ("estimated-cost", "Estimated cost"),
]

INIT_SCRIPT = (
    "() => { document.documentElement.classList.add('dark'); "
    "try { localStorage.setItem('colorTheme', 'dark'); } catch {} }"
)


def to_mp4(webm_path: Path, mp4_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(webm_path),
            "-c:v",
            "libx264",
            "-crf",
            "17",
            "-preset",
            "slow",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(mp4_path),
        ],
        check=True,
        capture_output=True,
    )


async def capture_panel(browser, slug: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    mp4_path = OUT / f"{slug}.mp4"

    context = await browser.new_context(
        viewport=VIEWPORT,
        device_scale_factor=1,
        color_scheme="dark",
        reduced_motion="no-preference",
        record_video_dir=str(RAW),
        record_video_size=VIEWPORT,
    )
    page = await context.new_page()
    await page.add_init_script(INIT_SCRIPT)

    url = f"{BASE_URL}?capture=1&panel={slug}"
    await page.goto(url, wait_until="commit")
    await page.wait_for_selector("canvas", state="attached", timeout=15_000)
    await page.wait_for_timeout(RECORD_MS)

    video = page.video
    if video is None:
        raise RuntimeError(f"Playwright did not record video for {slug}")

    await page.close()
    webm_path = Path(await video.path())
    await context.close()

    to_mp4(webm_path, mp4_path)
    webm_path.unlink(missing_ok=True)
    return mp4_path


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for slug, title in PANELS:
            path = await capture_panel(browser, slug)
            print(f"{title}: {path}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
