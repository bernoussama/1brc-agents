#!/usr/bin/env python3
"""Verify the published neutral-v0.5 result without access to ignored raw runs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_manifest(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        if ": " in line:
            key, value = line.split(": ", 1)
            values[key] = value.strip('"')
    return values


def verify_checksums(bundle: Path) -> None:
    checksum_file = bundle / "SHA256SUMS"
    if not checksum_file.is_file():
        raise ValueError(f"missing checksum inventory: {bundle}")
    for line in checksum_file.read_text().splitlines():
        expected, relative = line.split("  ", 1)
        path = (bundle / relative).resolve()
        if bundle.resolve() not in path.parents:
            raise ValueError(f"checksum path escapes bundle: {relative}")
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"checksum mismatch: {path}")


def main() -> None:
    canonical = json.loads((HERE / "results.json").read_text())
    release = canonical["release"]
    if len(release["harness_git_commit"]) != 40:
        raise ValueError("release does not record a full harness Git commit")
    if len(canonical["results"]) != 8:
        raise ValueError("expected eight successful configurations")
    if len(canonical["failed_first_attempts"]) != 2:
        raise ValueError("expected two retained failed first attempts")

    for result in canonical["results"]:
        if result["n_agent_sessions"] != 1 or len(result["runs_ms"]) != 5:
            raise ValueError(f"invalid sample labeling: {result['label']}")
        bundle = HERE / result["published_artifacts"]
        verify_checksums(bundle)
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

    for failure in canonical["failed_first_attempts"]:
        bundle = HERE / failure["published_artifacts"]
        verify_checksums(bundle)
        if (bundle / "score.json").stat().st_size != 0:
            raise ValueError(f"failed attempt score should be empty: {bundle}")
        manifest = parse_manifest(bundle / "manifest.yaml")
        if manifest.get("score_exit_status") == "0":
            raise ValueError(f"failed attempt reports successful scoring: {bundle}")

    first, second = canonical["results"][:2]
    if {first["label"], second["label"]} != {
        "Cursor Grok 4.6 Medium",
        "GLM 5.3",
    }:
        raise ValueError("near-tie configurations are not the first two results")
    print("neutral-v0.5 release verification: ok")


if __name__ == "__main__":
    main()
