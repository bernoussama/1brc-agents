#!/usr/bin/env python3
"""Prune published bundles to traces + final submission only."""

from __future__ import annotations

import json
from pathlib import Path

from bundle_policy import finalize_bundle, prune_bundle


BATCH = Path(__file__).resolve().parent.parent / "runs" / "2026-08-21-neutral-v0.5"


def main() -> None:
    total_omitted = 0
    for bundle in sorted(path for path in BATCH.iterdir() if path.is_dir()):
        omitted = prune_bundle(bundle)
        finalize_bundle(bundle, omitted)
        total_omitted += len(omitted)
        kept = sum(1 for _ in bundle.rglob("*") if _.is_file())
        print(f"{bundle.name}: kept {kept} files, omitted {len(omitted)}")
    print(f"total omitted: {total_omitted}")


if __name__ == "__main__":
    main()
