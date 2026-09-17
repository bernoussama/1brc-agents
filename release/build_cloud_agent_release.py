#!/usr/bin/env python3
"""Build publication-safe cloud-agent Union Alpha bundles from .sessions/."""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SPEC_PATH = HERE / "cloud-agent-2026-09-16-spec.json"

sys.path.insert(0, str(HERE))
from build_release import (  # noqa: E402
    copy_and_scan,
    parse_manifest,
    require_complete_bundle,
    sha256,
)


def profile_hash(entry: dict) -> str:
    if entry.get("profile_sha256"):
        return entry["profile_sha256"]
    path = ROOT / entry["profile"]
    if not path.is_file():
        raise ValueError(f"missing profile for hash: {path}")
    return sha256(path)


def result_row(entry: dict, score: dict, manifest: dict[str, str], omitted: list[dict]) -> dict:
    timings = score["runs_ms"]
    return {
        "label": entry["label"],
        "reasoning": entry["reasoning"],
        "n_agent_sessions": 1,
        "adapter_route": entry["adapter_route"],
        "profile": entry["profile"],
        "profile_sha256": profile_hash(entry),
        "source_run_dir": entry["run_dir"],
        "published_artifacts": entry["slug"],
        "correct": True,
        "median_ms": score["median_ms"],
        "runs_ms": timings,
        "min_ms": min(timings),
        "max_ms": max(timings),
        "agent_elapsed_seconds": int(manifest["agent_elapsed_seconds"]),
        "stop_reason": manifest["stop_reason"],
        "harness_git_commit": manifest["harness_git_commit"],
        "dataset_sha256": manifest["scored_dataset_sha256"],
        "generator_source_sha256": manifest["generator_source_sha256"],
        "image_sha256": manifest["image"],
        "omitted_generated_files": omitted,
    }


def build() -> None:
    spec = json.loads(SPEC_PATH.read_text())
    release = spec["release"]
    batch_dir = ROOT / spec["batch_dir"]
    prompt_hash = sha256(ROOT / "task/program.md")
    if prompt_hash != release["prompt_sha256"]:
        raise ValueError("current prompt does not match the notebook prompt")

    if batch_dir.exists():
        raise ValueError(f"refusing to overwrite existing batch: {batch_dir}")
    batch_dir.mkdir(parents=True)

    results = []
    common_dataset = None
    common_image = None
    for entry in spec["successful_runs"]:
        run_dir = ROOT / entry["run_dir"]
        score, manifest = require_complete_bundle(run_dir)
        if sha256(run_dir / "work/program.md") != prompt_hash:
            raise ValueError(f"run prompt does not match: {run_dir}")
        dataset_hash = manifest["scored_dataset_sha256"]
        image_hash = manifest["image"]
        common_dataset = common_dataset or dataset_hash
        common_image = common_image or image_hash
        if dataset_hash != common_dataset or image_hash != common_image:
            raise ValueError(f"run is outside the common dataset/image cohort: {run_dir}")
        omitted = copy_and_scan(run_dir, batch_dir / entry["slug"])
        results.append(result_row(entry, score, manifest, omitted))

    results.sort(key=lambda item: item["median_ms"])
    for rank, result in enumerate(results, 1):
        result["rank"] = rank

    failures = []
    for entry in spec["failed_attempts"]:
        run_dir = ROOT / entry["run_dir"]
        manifest = parse_manifest(run_dir / "manifest.yaml")
        score_path = run_dir / "score.json"
        if not (score_path.is_file() and score_path.stat().st_size == 0):
            raise ValueError(f"expected an empty failed score file: {score_path}")
        if manifest.get("score_exit_status") == "0":
            raise ValueError(f"failed attempt has successful score status: {run_dir}")
        copy_and_scan(run_dir, batch_dir / entry["slug"])
        failures.append({
            "label": entry["label"],
            "profile": entry["profile"],
            "profile_sha256": profile_hash(entry),
            "reason": entry["reason"],
            "run_dir": entry["run_dir"],
            "score_exit_status": int(manifest["score_exit_status"]),
            "agent_elapsed_seconds": int(manifest["agent_elapsed_seconds"]),
            "harness_git_commit": manifest["harness_git_commit"],
            "published_artifacts": entry["slug"],
        })

    other = []
    for entry in spec["other_attempts"]:
        run_dir = ROOT / entry["run_dir"]
        score, manifest = require_complete_bundle(run_dir)
        if manifest["scored_dataset_sha256"] != common_dataset:
            raise ValueError(f"other attempt dataset mismatch: {run_dir}")
        if manifest["image"] != common_image:
            raise ValueError(f"other attempt image mismatch: {run_dir}")
        omitted = copy_and_scan(run_dir, batch_dir / entry["slug"])
        row = result_row(entry, score, manifest, omitted)
        row["reason"] = entry["reason"]
        other.append(row)

    first = ROOT / spec["successful_runs"][0]["run_dir"]
    first_manifest = parse_manifest(first / "manifest.yaml")
    canonical = {
        "release": {
            **release,
            "judge_sha256": first_manifest["judge_sha256"],
            "judge_runner_sha256": first_manifest["judge_runner_sha256"],
            "runner_sha256": first_manifest["runner_sha256"],
            "dataset_sha256": common_dataset,
            "generator_source_sha256": first_manifest["generator_source_sha256"],
            "image_sha256": common_image,
            "proxy_image_sha256": first_manifest["proxy_image"],
            "scope": (
                "cloud-agent VM traces for OpenRouter stealth/union-alpha max thinking; "
                "not the full cloud-agent chart; not comparable to laptop v0.5"
            ),
        },
        "interpretation": {
            "sample_size": "n=1 autonomous agent session per configuration",
            "round_b_run": False,
            "charted_rows": [item["published_artifacts"] for item in results],
            "missing_from_this_vm": (
                "Earlier cloud-agent chart rows (Sol, Luna, Grok, MiniMax, ox-alpha, "
                "Muse Spark, GPT-6 Astra, DeepSeek V4.1 Flash) are not in this batch."
            ),
        },
        "results": results,
        "failed_first_attempts": failures,
        "other_attempts": other,
    }
    (batch_dir / "results.json").write_text(
        json.dumps(canonical, indent=2, sort_keys=True) + "\n"
    )
    (batch_dir / "README.md").write_text(render_markdown(canonical))


def render_markdown(canonical: dict) -> str:
    release = canonical["release"]
    lines = [
        "# Cloud-agent Union Alpha traces",
        "",
        "These are **single-box, single-session, unofficial Round A results**",
        "from a Cursor cloud-agent VM (Xeon, 4 CPU / 16 GiB, 120-minute budgets).",
        "Every row is `n=1`. They are **not comparable** to the laptop",
        "[neutral-prompt v0.5](../2026-08-21-neutral-v0.5/) batch.",
        "",
        "This batch is the Union Alpha session from this host. Other cloud-agent",
        "chart rows are not published here. GPT-6 Astra and DeepSeek V4.1 Flash",
        "traces live in a separate 2026-09-13 cloud-agent batch when that tree is",
        "present.",
        "",
        "## Canonical rows",
        "",
        "| Rank | Configuration | Reasoning | Median | Five timed runs (ms) | Agent time | Adapter/provider route |",
        "|---:|---|---|---:|---|---:|---|",
    ]
    for result in canonical["results"]:
        timings = ", ".join(f"{value:.1f}" for value in result["runs_ms"])
        minutes = result["agent_elapsed_seconds"] / 60
        lines.append(
            f'| {result["rank"]} | [{result["label"]}]'
            f'({result["published_artifacts"]}/) | {result["reasoning"]} | '
            f'{result["median_ms"]:.1f} ms | {timings} | {minutes:.1f} min | '
            f'{result["adapter_route"]} |'
        )
    lines.extend([
        "",
        "The canonical submission produced byte-exact output on the held-out",
        "1B-row dataset. Scoring used the same container image, a disconnected",
        "network, 4 CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs.",
        "",
        "## Provenance",
        "",
        f'- Published on: `{release["published_on"]}`',
        f'- Agent harness: `{release["agent_version"]}`',
        f'- Prompt SHA-256: `{release["prompt_sha256"]}`',
        f'- Judge SHA-256: `{release["judge_sha256"]}`',
        f'- In-container judge runner SHA-256: `{release["judge_runner_sha256"]}`',
        f'- Session runner SHA-256: `{release["runner_sha256"]}`',
        f'- Sandbox image: `{release["image_sha256"]}`',
        f'- Proxy image: `{release["proxy_image_sha256"]}`',
        f'- Dataset SHA-256: `{release["dataset_sha256"]}`',
        f'- Generator source SHA-256: `{release["generator_source_sha256"]}`',
        f'- Hardware: {release["hardware"]["cpu"]}, '
        f'{release["hardware"]["physical_cores"]} physical cores / '
        f'{release["hardware"]["logical_cpus"]} logical CPUs, '
        f'{release["hardware"]["storage"]}',
        f'- Warm-cache policy: {release["warm_cache_policy"]}',
        "",
        "The complete machine-readable record is [results.json](results.json).",
        "Verify the published bundles with `python3 release/verify_cloud_agent_release.py`.",
        "Each bundle directory contains `SHA256SUMS` and an `omitted-files.json`",
        "inventory. Published bundles retain the agent trace (`events.jsonl`, `pi.err`),",
        "scoring evidence, and the final submission (`run.sh`, binary, and source).",
        "Intermediate experiments and scratch files are omitted.",
        "",
        "## Limits",
        "",
        "- One agent session per configuration; no session-level variance estimate.",
        "- Not the full cloud-agent chart; only Union Alpha traces from this VM.",
        "- Only classic 1BRC Round A was run; Round B was not run.",
        "- Cloud-agent medians are not comparable to laptop v0.5 medians.",
        "- Dataset and sandbox image hashes differ from the 2026-09-13 Astra/DeepSeek",
        "  cohort, so these rows are a separate published batch.",
        "",
    ])
    return "\n".join(lines)


if __name__ == "__main__":
    build()
