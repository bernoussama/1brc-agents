#!/usr/bin/env python3
"""Load bench.yml and print shell assignments for the session runner.

Usage:
  eval "$(python3 harness/lib/load_bench.py [path/to/bench.yml])"
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml


def shell_quote(value: object) -> str:
    text = "" if value is None else str(value)
    return "'" + text.replace("'", "'\"'\"'") + "'"


def docker_memory(value: object) -> str:
    text = str(value).strip()
    match = re.fullmatch(r"(?i)(\d+)\s*(gi?b?|mi?b?|ki?b?|g|m|k)?", text)
    if not match:
        raise ValueError(f"unsupported memory value: {value!r}")
    amount, unit = match.group(1), (match.group(2) or "b").lower()
    if unit in ("g", "gb", "gi", "gib"):
        return f"{amount}g"
    if unit in ("m", "mb", "mi", "mib"):
        return f"{amount}m"
    if unit in ("k", "kb", "ki", "kib"):
        return f"{amount}k"
    raise ValueError(f"unsupported memory unit in {value!r}")


def require(mapping: dict, *keys: str) -> object:
    cursor: object = mapping
    path: list[str] = []
    for key in keys:
        path.append(key)
        if not isinstance(cursor, dict) or key not in cursor:
            raise ValueError(f"bench.yml missing {'.'.join(path)}")
        cursor = cursor[key]
    return cursor


def load(path: Path) -> dict[str, str]:
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("bench.yml must be a mapping")
    if data.get("version") != 1:
        raise ValueError("bench.yml version must be 1")

    resources = require(data, "environment", "resources")
    if not isinstance(resources, dict):
        raise ValueError("environment.resources must be a mapping")

    agent = require(data, "agent")
    dataset = require(data, "dataset")
    judge = require(data, "judge")
    environment = require(data, "environment")
    if not all(isinstance(item, dict) for item in (agent, dataset, judge, environment)):
        raise ValueError("agent, dataset, judge, and environment must be mappings")

    cpus = resources.get("cpus")
    if not isinstance(cpus, int) or cpus <= 0:
        raise ValueError("environment.resources.cpus must be a positive integer")

    timed_runs = judge.get("timed_runs")
    warmup_runs = judge.get("warmup_runs")
    if not isinstance(timed_runs, int) or timed_runs <= 0:
        raise ValueError("judge.timed_runs must be a positive integer")
    if not isinstance(warmup_runs, int) or warmup_runs <= 0:
        raise ValueError("judge.warmup_runs must be a positive integer")
    if warmup_runs != 1:
        raise ValueError("judge.warmup_runs must be 1 until score.py accepts a warmup count")

    budget = agent.get("budget_minutes")
    wrapup = agent.get("wrapup_seconds", 300)
    experiment_max = agent.get("experiment_max_seconds", 300)
    for label, value in (
        ("agent.budget_minutes", budget),
        ("agent.wrapup_seconds", wrapup),
        ("agent.experiment_max_seconds", experiment_max),
    ):
        if not isinstance(value, int) or value < 0:
            raise ValueError(f"{label} must be a non-negative integer")
    if not isinstance(experiment_max, int) or experiment_max <= 0:
        raise ValueError("agent.experiment_max_seconds must be a positive integer")

    rows = dataset.get("rows")
    if not isinstance(rows, int) or rows <= 0:
        raise ValueError("dataset.rows must be a positive integer")

    round_name = str(judge.get("round", "A"))
    if round_name not in ("A", "B"):
        raise ValueError("judge.round must be A or B")

    report = str(judge.get("report", "median"))
    if report != "median":
        raise ValueError("judge.report must be median")

    return {
        "BENCH_VERSION": "1",
        "BENCH_IMAGE": str(environment.get("image", "1brc-agents-sandbox:latest")),
        "BENCH_IMAGE_DIGEST": str(environment.get("image_digest") or ""),
        "BENCH_PROXY_IMAGE": str(environment.get("proxy_image", "1brc-allowlist-proxy")),
        "BENCH_PROXY_IMAGE_DIGEST": str(environment.get("proxy_image_digest") or ""),
        "BENCH_NCPUS": str(cpus),
        "BENCH_MEM": docker_memory(resources.get("memory")),
        "BENCH_NETWORK_MODE": str(environment.get("network", {}).get("mode", "allowlist")),
        "BENCH_BUDGET_MIN": str(budget),
        "BENCH_WRAPUP_SEC": str(wrapup),
        "BENCH_EXPERIMENT_MAX_SEC": str(experiment_max),
        "BENCH_SCORED_ROWS": str(rows),
        "BENCH_SCORED_DATASET_VOLUME": str(dataset.get("volume", "1brc-agents-scored-1b-v1")),
        "BENCH_DATASET_SHA256": str(dataset.get("sha256") or ""),
        "BENCH_GENERATOR_SHA256": str(dataset.get("generator_sha256") or ""),
        "BENCH_ROUND": round_name,
        "BENCH_WARMUP_RUNS": str(warmup_runs),
        "BENCH_TIMED_RUNS": str(timed_runs),
        "BENCH_PROMPT_SHA256": str(judge.get("prompt_sha256") or ""),
        "BENCH_AGENT_NAME": str(agent.get("name", "pi")),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        default=str(Path(__file__).resolve().parents[2] / "bench.yml"),
    )
    args = parser.parse_args()
    values = load(Path(args.path))
    for key in sorted(values):
        print(f"{key}={shell_quote(values[key])}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - surface as a shell-friendly error
        print(f"load_bench: {exc}", file=sys.stderr)
        sys.exit(2)
