#!/usr/bin/env python3
"""Verify the published 2026-09-16 cloud-agent Union Alpha batch."""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BATCH = ROOT / "runs" / "2026-09-16-cloud-agent"

sys.path.insert(0, str(HERE))
from bundle_policy import (  # noqa: E402
    INVENTORY_FILES,
    SCORE_FILES,
    TRACE_FILES,
    collect_solution_files,
)
from verify_release import parse_manifest, verify_checksums  # noqa: E402


def verify_bundle_policy(bundle: Path) -> None:
    allowed = {
        *TRACE_FILES,
        *SCORE_FILES,
        *INVENTORY_FILES,
        *collect_solution_files(bundle),
    }
    for path in bundle.rglob("*"):
        if not path.is_file():
            continue
        relative = str(path.relative_to(bundle))
        if relative not in allowed:
            raise ValueError(f"unexpected published file: {bundle / relative}")


def main() -> None:
    canonical = json.loads((BATCH / "results.json").read_text())
    if len(canonical["results"]) != 1:
        raise ValueError("expected one canonical configuration")
    if canonical["failed_first_attempts"]:
        raise ValueError("did not expect retained failed first attempts")
    if canonical["other_attempts"]:
        raise ValueError("did not expect retained other scored attempts")

    expected_slugs = {"union-alpha-max"}
    if {item["published_artifacts"] for item in canonical["results"]} != expected_slugs:
        raise ValueError("canonical artifact ids do not match the notebook spec")

    for result in canonical["results"]:
        if result["n_agent_sessions"] != 1 or len(result["runs_ms"]) != 5:
            raise ValueError(f"invalid sample labeling: {result['label']}")
        bundle = BATCH / result["published_artifacts"]
        verify_checksums(bundle)
        verify_bundle_policy(bundle)
        score = json.loads((bundle / "score.json").read_text())
        manifest = parse_manifest(bundle / "manifest.yaml")
        if not score.get("correct"):
            raise ValueError(f"published score is not correct: {bundle}")
        if score["expected_sha256"] != score["actual_sha256"]:
            raise ValueError(f"published output hashes differ: {bundle}")
        if score["runs_ms"] != result["runs_ms"]:
            raise ValueError(f"canonical timings differ from bundle: {bundle}")
        if manifest.get("score_exit_status") != "0":
            raise ValueError(f"published manifest has failed scoring: {bundle}")
        if "finished_utc=" not in (bundle / "cleanup.log").read_text():
            raise ValueError(f"published cleanup is incomplete: {bundle}")
        if not (bundle / "work/submission/read-v1").is_file():
            raise ValueError(f"published submission binary is missing: {bundle}")

    print("cloud-agent 2026-09-16 Union Alpha release verification: ok")


if __name__ == "__main__":
    main()
