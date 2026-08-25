#!/usr/bin/env python3
"""Capture dither-kit bar entrance animations from /charts/cloud-agent/ as GIFs."""

from __future__ import annotations

import asyncio
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
FPS = 24
DURATION_S = 1.35
FRAME_COUNT = int(FPS * DURATION_S)
INTERVAL_MS = 1000 / FPS

PANELS: list[tuple[str, str]] = [
    ("median-run-time", "Median run time"),
    ("agent-wall-time", "Agent wall time"),
    ("estimated-cost", "Estimated cost"),
]


async def capture_frames() -> None:
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    for slug, _ in PANELS:
        (FRAMES / slug).mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
            color_scheme="dark",
        )
        page = await context.new_page()
        await page.add_init_script(
            "() => { document.documentElement.classList.add('dark'); "
            "try { localStorage.setItem('colorTheme', 'dark'); } catch {} }"
        )

        await page.goto("http://localhost:4321/charts/cloud-agent/", wait_until="networkidle")
        await page.wait_for_selector("canvas", state="attached", timeout=10_000)
        await page.wait_for_function("() => typeof window.__replayDashboardCharts === 'function'")

        locators = [
            page.locator("h2", has_text=title).locator("xpath=ancestor::div[contains(@class,'flex-col')][1]")
            for _, title in PANELS
        ]

        await page.evaluate("window.__replayDashboardCharts()")
        await page.wait_for_timeout(16)

        for i in range(FRAME_COUNT):
            for (slug, _), locator in zip(PANELS, locators, strict=True):
                chart = locator.locator(".border-foreground.bg-card.h-96")
                await chart.screenshot(path=str(FRAMES / slug / f"frame_{i:03d}.png"))
            if i + 1 < FRAME_COUNT:
                await page.wait_for_timeout(int(INTERVAL_MS))

        await browser.close()


def encode_gif(slug: str) -> Path:
    input_pattern = FRAMES / slug / "frame_%03d.png"
    palette = OUT / f"{slug}-palette.png"
    gif_path = OUT / f"{slug}.gif"

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            str(input_pattern),
            "-vf",
            "palettegen=max_colors=128:stats_mode=diff",
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
            str(FPS),
            "-i",
            str(input_pattern),
            "-i",
            str(palette),
            "-lavfi",
            "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
            "-loop",
            "0",
            str(gif_path),
        ],
        check=True,
        capture_output=True,
    )
    palette.unlink(missing_ok=True)
    return gif_path


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    await capture_frames()
    for slug, _ in PANELS:
        path = encode_gif(slug)
        print(path)


if __name__ == "__main__":
    asyncio.run(main())
