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
ARTIFACTS = Path("/opt/cursor/artifacts/chart-videos")
RAW = OUT / "raw"
BASE_URL = "http://127.0.0.1:4321/charts/cloud-agent/"
# Default 900ms entrance + hold on the finished chart.
RECORD_MS = 4000
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

# Capture-only layout for 1080p — keep full model labels in frame.
ENLARGE_TEXT_JS = """() => {
  const bump = (el, size) => el && el.style.setProperty('font-size', size, 'important');
  bump(document.querySelector('h2'), '44px');
  bump(document.querySelector('h2 + p'), '20px');
  document.querySelectorAll('svg text, svg tspan').forEach((el) => {
    el.style.setProperty('font-size', '16px', 'important');
  });
  const root = document.querySelector('.not-prose');
  if (root) {
    root.style.setProperty('width', '100%', 'important');
    root.style.setProperty('max-width', '100%', 'important');
    root.style.setProperty('padding', '1.5rem 2.5rem', 'important');
    root.style.setProperty('zoom', '1.25', 'important');
  }
  const wrap = document.querySelector('.not-prose > div');
  if (wrap) {
    wrap.style.setProperty('max-width', '88rem', 'important');
    wrap.style.setProperty('width', '100%', 'important');
  }
  const panel = document.querySelector('.border-foreground.bg-card');
  if (panel) {
    panel.style.setProperty('height', '42rem', 'important');
  }
}"""


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


async def capture_panel(browser, slug: str, title: str) -> Path:
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
    await page.wait_for_selector("h2", state="visible", timeout=15_000)

    # Confirm horizontal before recording continues (models on left).
    await page.wait_for_function(
        """() => {
          const t = [...document.querySelectorAll('svg text')]
            .find((el) => (el.getAttribute('text-anchor') === 'end') && (el.textContent || '').includes('gpt'));
          return !!t;
        }""",
        timeout=10_000,
    )
    await page.evaluate(ENLARGE_TEXT_JS)
    await page.wait_for_timeout(RECORD_MS // 2)
    await page.evaluate(ENLARGE_TEXT_JS)
    await page.wait_for_timeout(RECORD_MS // 2)

    video = page.video
    if video is None:
        raise RuntimeError(f"Playwright did not record video for {slug}")

    await page.close()
    webm_path = Path(await video.path())
    await context.close()

    to_mp4(webm_path, mp4_path)
    webm_path.unlink(missing_ok=True)

    # Also write a distinctly named copy so stale downloads aren't confused.
    named = OUT / f"{slug}-horizontal.mp4"
    named.write_bytes(mp4_path.read_bytes())
    print(f"{title}: horizontal confirmed → {mp4_path}")
    return mp4_path


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for slug, title in PANELS:
            await capture_panel(browser, slug, title)
        await browser.close()

    for path in OUT.glob("*.mp4"):
        dest = ARTIFACTS / path.name
        dest.write_bytes(path.read_bytes())
        print(f"copied {dest}")


if __name__ == "__main__":
    asyncio.run(main())
