#!/usr/bin/env python3
"""Load bench.yml and print shell assignments for the session runner.

Usage:
  eval "$(python3 harness/lib/load_bench.py [path/to/bench.yml])"

Host selection:
  BENCH_HOST=<preset>   force a hosts.* preset
  host: auto            (default) pick the first preset whose match fits
  host: <preset>        pin a preset in the yaml itself
"""

from __future__ import annotations

import argparse
import os
import re
import socket
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


def detect_cpu_model() -> str:
    cpuinfo = Path("/proc/cpuinfo")
    if not cpuinfo.is_file():
        return ""
    for line in cpuinfo.read_text().splitlines():
        if line.startswith("model name"):
            return line.split(":", 1)[1].strip()
    return ""


def detect_hostname() -> str:
    return socket.gethostname()


def match_host(rules: object, *, cpu_model: str, hostname: str) -> bool:
    if rules is None:
        return False
    if not isinstance(rules, dict):
        raise ValueError("hosts.*.match must be a mapping")
    if not rules:
        return False
    cpu_contains = rules.get("cpu_contains")
    if cpu_contains is not None:
        if str(cpu_contains) not in cpu_model:
            return False
    hostname_equals = rules.get("hostname_equals")
    if hostname_equals is not None:
        if hostname != str(hostname_equals):
            return False
    hostname_contains = rules.get("hostname_contains")
    if hostname_contains is not None:
        if str(hostname_contains) not in hostname:
            return False
    unknown = set(rules) - {"cpu_contains", "hostname_equals", "hostname_contains"}
    if unknown:
        raise ValueError(f"unknown host match keys: {sorted(unknown)}")
    return True


def resolve_host(data: dict, *, host_override: str | None = None) -> tuple[str, dict]:
    hosts = data.get("hosts")
    if not isinstance(hosts, dict) or not hosts:
        raise ValueError("bench.yml missing hosts presets")

    requested = host_override or os.environ.get("BENCH_HOST") or data.get("host") or "auto"
    requested = str(requested).strip()
    if not requested:
        requested = "auto"

    if requested != "auto":
        preset = hosts.get(requested)
        if not isinstance(preset, dict):
            known = ", ".join(sorted(hosts))
            raise ValueError(f"unknown host preset {requested!r}; known: {known}")
        return requested, preset

    cpu_model = detect_cpu_model()
    hostname = detect_hostname()
    matches: list[str] = []
    for name, preset in hosts.items():
        if not isinstance(preset, dict):
            raise ValueError(f"hosts.{name} must be a mapping")
        if match_host(preset.get("match"), cpu_model=cpu_model, hostname=hostname):
            matches.append(name)
    if len(matches) == 1:
        name = matches[0]
        preset = hosts[name]
        assert isinstance(preset, dict)
        return name, preset
    if not matches:
        known = ", ".join(sorted(hosts))
        raise ValueError(
            "no host preset matched this machine "
            f"(cpu={cpu_model!r}, hostname={hostname!r}); "
            f"set BENCH_HOST to one of: {known}"
        )
    raise ValueError(
        "multiple host presets matched this machine: "
        + ", ".join(matches)
        + "; set BENCH_HOST explicitly"
    )


def parse_resources(resources: object, *, label: str) -> tuple[int, str]:
    if not isinstance(resources, dict):
        raise ValueError(f"{label} must be a mapping")
    cpus = resources.get("cpus")
    if not isinstance(cpus, int) or cpus <= 0:
        raise ValueError(f"{label}.cpus must be a positive integer")
    return cpus, docker_memory(resources.get("memory"))


def parse_hardware(hardware: object, *, label: str) -> dict[str, str]:
    if not isinstance(hardware, dict):
        raise ValueError(f"{label} must be a mapping")
    required = ("cpu", "physical_cores", "logical_cpus", "storage")
    for key in required:
        if key not in hardware:
            raise ValueError(f"{label} missing {key}")
    physical = hardware["physical_cores"]
    logical = hardware["logical_cpus"]
    if not isinstance(physical, int) or physical <= 0:
        raise ValueError(f"{label}.physical_cores must be a positive integer")
    if not isinstance(logical, int) or logical <= 0:
        raise ValueError(f"{label}.logical_cpus must be a positive integer")
    return {
        "cpu": str(hardware["cpu"]),
        "physical_cores": str(physical),
        "logical_cpus": str(logical),
        "storage": str(hardware["storage"]),
    }


def load(path: Path, *, host_override: str | None = None) -> dict[str, str]:
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("bench.yml must be a mapping")
    if data.get("version") != 1:
        raise ValueError("bench.yml version must be 1")

    host_name, host_preset = resolve_host(data, host_override=host_override)
    cpus, memory = parse_resources(
        host_preset.get("resources"),
        label=f"hosts.{host_name}.resources",
    )
    hardware = parse_hardware(
        host_preset.get("hardware"),
        label=f"hosts.{host_name}.hardware",
    )

    agent = require(data, "agent")
    dataset = require(data, "dataset")
    judge = require(data, "judge")
    environment = require(data, "environment")
    if not all(isinstance(item, dict) for item in (agent, dataset, judge, environment)):
        raise ValueError("agent, dataset, judge, and environment must be mappings")
    if "resources" in environment:
        raise ValueError(
            "environment.resources moved under hosts.<name>.resources; "
            f"use hosts.{host_name}.resources"
        )

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
        "BENCH_HOST": host_name,
        "BENCH_IMAGE": str(environment.get("image", "1brc-agents-sandbox:latest")),
        "BENCH_IMAGE_DIGEST": str(environment.get("image_digest") or ""),
        "BENCH_PROXY_IMAGE": str(environment.get("proxy_image", "1brc-allowlist-proxy")),
        "BENCH_PROXY_IMAGE_DIGEST": str(environment.get("proxy_image_digest") or ""),
        "BENCH_NCPUS": str(cpus),
        "BENCH_MEM": memory,
        "BENCH_NETWORK_MODE": str(environment.get("network", {}).get("mode", "allowlist")),
        "BENCH_HARDWARE_CPU": hardware["cpu"],
        "BENCH_HARDWARE_PHYSICAL_CORES": hardware["physical_cores"],
        "BENCH_HARDWARE_LOGICAL_CPUS": hardware["logical_cpus"],
        "BENCH_HARDWARE_STORAGE": hardware["storage"],
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
    parser.add_argument(
        "--host",
        default=None,
        help="force a hosts.* preset (overrides BENCH_HOST and bench.yml host:)",
    )
    args = parser.parse_args()
    values = load(Path(args.path), host_override=args.host)
    for key in sorted(values):
        print(f"{key}={shell_quote(values[key])}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - surface as a shell-friendly error
        print(f"load_bench: {exc}", file=sys.stderr)
        sys.exit(2)
