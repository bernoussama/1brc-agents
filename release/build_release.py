#!/usr/bin/env python3
"""Build the canonical neutral-v0.5 result and publication-safe artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SPEC_PATH = HERE / "release-spec.json"
BATCH_DIR = ROOT / "runs" / "2026-08-21-neutral-v0.5"
MAX_WORK_FILE_BYTES = 5 * 1024 * 1024
ROOT_ARTIFACTS = (
    "events.jsonl",
    "score.json",
    "score.log",
    "manifest.yaml",
    "cleanup.log",
    "pi.err",
    "control/budget.json",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_manifest(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if ": " not in line:
            continue
        key, value = line.split(": ", 1)
        values[key] = value.strip('"')
    return values


def require_complete_bundle(run_dir: Path) -> tuple[dict, dict[str, str]]:
    for name in ("score.json", "manifest.yaml", "cleanup.log"):
        path = run_dir / name
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"incomplete successful bundle: {path}")
    score = json.loads((run_dir / "score.json").read_text())
    manifest = parse_manifest(run_dir / "manifest.yaml")
    cleanup = (run_dir / "cleanup.log").read_text()
    if score.get("correct") is not True:
        raise ValueError(f"score is not correct: {run_dir}")
    if score.get("expected_sha256") != score.get("actual_sha256"):
        raise ValueError(f"output hashes differ: {run_dir}")
    if manifest.get("score_exit_status") != "0":
        raise ValueError(f"manifest score status is not zero: {run_dir}")
    if manifest.get("score_execution") != "same_agent_container":
        raise ValueError(f"unexpected scoring boundary: {run_dir}")
    if manifest.get("score_network") != "disconnected":
        raise ValueError(f"scoring network was not disconnected: {run_dir}")
    if "finished_utc=" not in cleanup:
        raise ValueError(f"cleanup did not finish: {run_dir}")
    if len(score.get("runs_ms", [])) != 5:
        raise ValueError(f"expected five timed runs: {run_dir}")
    return score, manifest


def secret_scan(path: Path) -> None:
    data = path.read_bytes()
    if b"\0" in data[:8192]:
        return
    text = data.decode("utf-8", errors="replace")
    forbidden = (
        "-----BEGIN PRIVATE KEY-----",
        "-----BEGIN RSA PRIVATE KEY-----",
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "gho_",
        "ghp_",
        "ghs_",
        "ghu_",
    )
    for marker in forbidden:
        if marker in text:
            raise ValueError(f"possible secret marker {marker!r} in {path}")
    if path.name == "events.jsonl":
        for line_number, line in enumerate(text.splitlines(), 1):
            event = json.loads(line)
            scan_json_strings(event, path, line_number)


def scan_json_strings(value: object, path: Path, line_number: int, key: str = "") -> None:
    if isinstance(value, dict):
        for child_key, child in value.items():
            scan_json_strings(child, path, line_number, child_key)
    elif isinstance(value, list):
        for child in value:
            scan_json_strings(child, path, line_number, key)
    elif isinstance(value, str) and key != "thinkingSignature":
        markers = (
            "CURSOR_AUTH_TOKEN=",
            "OPENROUTER_API_KEY=",
            "ZAI_API_KEY=",
            "CLIPROXY_API_KEY=",
            '"accessToken":',
        )
        if any(marker in value for marker in markers):
            raise ValueError(f"possible credential in {path}:{line_number}")
        if re.search(r"sk-[A-Za-z0-9_-]{20,255}(?![A-Za-z0-9_-])", value):
            raise ValueError(f"possible API key in {path}:{line_number}")


def copy_publication_bundle(run_dir: Path, destination: Path) -> list[dict]:
    destination.mkdir(parents=True)
    omitted: list[dict] = []
    copied: list[Path] = []

    for relative in ROOT_ARTIFACTS:
        source = run_dir / relative
        if not source.exists():
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied.append(target)

    work = run_dir / "work"
    if work.is_dir():
        for source in sorted(work.rglob("*")):
            if source.is_symlink():
                raise ValueError(f"publication work tree contains a symlink: {source}")
            if not source.is_file():
                continue
            relative = source.relative_to(run_dir)
            if "__pycache__" in relative.parts or source.suffix == ".pyc":
                continue
            if source.stat().st_size > MAX_WORK_FILE_BYTES:
                omitted.append({
                    "path": str(relative),
                    "bytes": source.stat().st_size,
                    "reason": "generated development dataset exceeds 5 MiB publication limit",
                })
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied.append(target)

    for path in copied:
        secret_scan(path)

    (destination / "omitted-files.json").write_text(
        json.dumps(omitted, indent=2, sort_keys=True) + "\n"
    )
    copied.append(destination / "omitted-files.json")
    checksum_lines = []
    for path in sorted(copied):
        relative = path.relative_to(destination)
        checksum_lines.append(f"{sha256(path)}  {relative}")
    (destination / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n")
    return omitted


def build(harness_commit: str) -> None:
    spec = json.loads(SPEC_PATH.read_text())
    release = spec["release"]
    prompt_hash = sha256(ROOT / "task/program.md")
    if prompt_hash != release["prompt_sha256"]:
        raise ValueError("current prompt does not match the neutral release prompt")

    if BATCH_DIR.exists():
        shutil.rmtree(BATCH_DIR)
    BATCH_DIR.mkdir(parents=True)

    results = []
    common_dataset = None
    common_image = None
    for entry in spec["successful_runs"]:
        run_dir = ROOT / entry["run_dir"]
        score, manifest = require_complete_bundle(run_dir)
        if sha256(run_dir / "work/program.md") != prompt_hash:
            raise ValueError(f"run prompt does not match release prompt: {run_dir}")
        dataset_hash = manifest["scored_dataset_sha256"]
        image_hash = manifest["image"]
        common_dataset = common_dataset or dataset_hash
        common_image = common_image or image_hash
        if dataset_hash != common_dataset or image_hash != common_image:
            raise ValueError(f"run is outside the common dataset/image cohort: {run_dir}")

        artifact_id = entry["slug"]
        omitted = copy_publication_bundle(run_dir, BATCH_DIR / artifact_id)
        timings = score["runs_ms"]
        results.append({
            "rank": 0,
            "label": entry["label"],
            "reasoning": entry["reasoning"],
            "n_agent_sessions": 1,
            "adapter_route": entry["adapter_route"],
            "profile": entry["profile"],
            "profile_sha256": sha256(ROOT / entry["profile"]),
            "source_run_dir": entry["run_dir"],
            "published_artifacts": artifact_id,
            "correct": True,
            "median_ms": score["median_ms"],
            "runs_ms": timings,
            "min_ms": min(timings),
            "max_ms": max(timings),
            "agent_elapsed_seconds": int(manifest["agent_elapsed_seconds"]),
            "stop_reason": manifest["stop_reason"],
            "dataset_sha256": dataset_hash,
            "generator_source_sha256": manifest["generator_source_sha256"],
            "image_sha256": image_hash,
            "omitted_generated_files": omitted,
        })

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
        artifact_id = entry["slug"]
        copy_publication_bundle(run_dir, BATCH_DIR / artifact_id)
        failures.append({
            **{k: v for k, v in entry.items() if k != "slug"},
            "score_exit_status": int(manifest["score_exit_status"]),
            "agent_elapsed_seconds": int(manifest["agent_elapsed_seconds"]),
            "published_artifacts": artifact_id,
        })

    canonical = {
        "release": {
            **release,
            "harness_git_commit": harness_commit,
            "judge_sha256": sha256(ROOT / "judge/score.py"),
            "judge_runner_sha256": sha256(ROOT / "judge/score_run.py"),
            "runner_sha256": sha256(ROOT / "harness/run_session.sh"),
            "dataset_sha256": common_dataset,
            "generator_source_sha256": parse_manifest(
                ROOT / spec["successful_runs"][0]["run_dir"] / "manifest.yaml"
            )["generator_source_sha256"],
            "image_sha256": common_image,
            "proxy_image_sha256": parse_manifest(
                ROOT / spec["successful_runs"][0]["run_dir"] / "manifest.yaml"
            )["proxy_image"],
            "scope": "single-box single-session unofficial Round A results",
        },
        "interpretation": {
            "sample_size": "n=1 autonomous agent session per configuration",
            "top_result": "Cursor Grok 4.6 Medium and GLM 5.3 are a near-tie",
            "top_median_difference_ms": round(
                results[1]["median_ms"] - results[0]["median_ms"], 1
            ),
            "top_median_difference_percent": round(
                (results[1]["median_ms"] / results[0]["median_ms"] - 1) * 100, 1
            ),
            "round_b_run": False,
        },
        "results": results,
        "failed_first_attempts": failures,
    }
    (BATCH_DIR / "results.json").write_text(
        json.dumps(canonical, indent=2, sort_keys=True) + "\n"
    )
    (BATCH_DIR / "README.md").write_text(render_markdown(canonical))


def render_markdown(canonical: dict) -> str:
    release = canonical["release"]
    lines = [
        "# Neutral-prompt v0.5 results",
        "",
        "These are **single-box, single-session, unofficial Round A results**.",
        "Every row is `n=1`; this is a comparison of the named agent",
        "configurations and adapter routes, not a definitive model ranking.",
        "",
        "## Results",
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
        "Cursor Grok 4.6 Medium and GLM 5.3 are a **near-tie**: their medians",
        f'differ by only {canonical["interpretation"]["top_median_difference_ms"]:.1f} ms '
        f'({canonical["interpretation"]["top_median_difference_percent"]:.1f}%), and their timed ranges overlap.',
        "The data does not support declaring either configuration categorically superior.",
        "",
        "All successful submissions produced byte-exact output on the same held-out",
        "1B-row dataset. Scoring used the same container image, a disconnected",
        "network, 6 CPU-equivalents, 16 GiB, one untimed warmup, and five timed runs.",
        "",
        "## Failed first attempts",
        "",
    ])
    for failure in canonical["failed_first_attempts"]:
        lines.append(
            f'- [{failure["label"]}]({failure["published_artifacts"]}/): '
            f'{failure["reason"]} The manifest records score exit status '
            f'{failure["score_exit_status"]}.'
        )
    lines.extend([
        "",
        "These attempts are excluded from the result table, but retained so the",
        "serial batch history is not rewritten as an all-success run.",
        "",
        "## Provenance",
        "",
        f'- Release tag: `{release["tag"]}`',
        f'- Exact harness commit: `{release["harness_git_commit"]}`',
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
        "Verify the published bundles with `python3 release/verify_release.py`.",
        "Each artifact directory contains `SHA256SUMS` and an `omitted-files.json`",
        "inventory. Only generated development files larger than 5 MiB and Python",
        "bytecode caches are omitted; the full event trace and scoring evidence are retained.",
        "",
        "## Limits",
        "",
        "- One agent session per configuration; no session-level variance estimate.",
        "- Reasoning settings and provider/adapter routes differ and are reported explicitly.",
        "- Only classic 1BRC Round A was run; the anti-retrieval Round B was not run.",
        "- The five-pass median measures the generated program after an untimed warmup;",
        "  it does not measure cold-cache storage performance.",
        "- Cross-provider token and cost totals are omitted because event accounting is",
        "  not normalized across adapters.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness-commit", required=True)
    args = parser.parse_args()
    build(args.harness_commit)


if __name__ == "__main__":
    main()
