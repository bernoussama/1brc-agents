#!/usr/bin/env python3
"""Report the sandbox's effective CPU and memory resources.

The container may expose the host's logical CPU topology while Docker limits
the amount of CPU time available through cgroups.  This command reports both
facts and makes the cgroup quota the authoritative value for tuning worker
counts.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable


CGROUP_ROOT = Path("/sys/fs/cgroup")
SIZE_RE = re.compile(r"^([0-9]+(?:\.[0-9]+)?)([kmgtpe]?)$", re.IGNORECASE)


def read_text(path: Path) -> str | None:
    try:
        return path.read_text().strip()
    except OSError:
        return None


def parse_size(value: str | None) -> int | None:
    """Parse the Docker-style byte suffixes used by the harness."""

    if not value:
        return None
    match = SIZE_RE.fullmatch(value.strip())
    if not match:
        return None
    number = float(match.group(1))
    suffix = match.group(2).lower()
    multiplier = 1024 ** ("kmgtpe".find(suffix) + 1) if suffix else 1
    return int(number * multiplier)


def parse_cpu(value: str | None) -> float | None:
    if not value:
        return None
    try:
        result = float(value)
    except ValueError:
        return None
    return result if result > 0 else None


def candidate_paths(name: str) -> Iterable[Path]:
    """Yield common v1/v2 paths without assuming a particular Docker layout."""

    direct = CGROUP_ROOT / name
    if direct.exists():
        yield direct
    try:
        for path in CGROUP_ROOT.glob(f"**/{name}"):
            if path != direct:
                yield path
    except OSError:
        return


def cpu_limit() -> tuple[float | None, int | None, str]:
    for path in candidate_paths("cpu.max"):
        raw = read_text(path)
        if raw is None:
            continue
        fields = raw.split()
        if len(fields) >= 2:
            quota, period = fields[0], fields[1]
            if quota == "max":
                return None, int(period), "cgroup-v2"
            try:
                return float(quota) / float(period), int(period), "cgroup-v2"
            except (ValueError, ZeroDivisionError):
                pass

    quota_path = next(iter(candidate_paths("cpu.cfs_quota_us")), None)
    period_path = next(iter(candidate_paths("cpu.cfs_period_us")), None)
    quota = read_text(quota_path) if quota_path else None
    period = read_text(period_path) if period_path else None
    if quota is not None and period is not None:
        try:
            if int(quota) < 0:
                return None, int(period), "cgroup-v1"
            return float(quota) / float(period), int(period), "cgroup-v1"
        except (ValueError, ZeroDivisionError):
            pass
    return None, None, "unknown"


def memory_limit() -> tuple[int | None, str]:
    for path in candidate_paths("memory.max"):
        raw = read_text(path)
        if raw is None:
            continue
        if raw == "max":
            return None, "cgroup-v2"
        try:
            return int(raw), "cgroup-v2"
        except ValueError:
            pass

    for name in ("memory.limit_in_bytes", "memory.limit"):
        path = next(iter(candidate_paths(name)), None)
        raw = read_text(path) if path else None
        if raw is None:
            continue
        try:
            value = int(raw)
            # v1 uses a very large sentinel for an unlimited hierarchy.
            return (None if value >= 1 << 60 else value), "cgroup-v1"
        except ValueError:
            pass
    return None, "unknown"


def cpu_topology(allowed: set[int]) -> tuple[int, int]:
    logical = len(allowed)
    pairs: set[tuple[str, str]] = set()
    processor: int | None = None
    physical = "0"
    core = "0"
    for line in Path("/proc/cpuinfo").read_text(errors="replace").splitlines() + [""]:
        if line.startswith("processor"):
            try:
                processor = int(line.split(":", 1)[1].strip())
            except (IndexError, ValueError):
                processor = None
        elif line.startswith("physical id"):
            physical = line.split(":", 1)[1].strip()
        elif line.startswith("core id"):
            core = line.split(":", 1)[1].strip()
        elif not line.strip():
            if processor in allowed:
                pairs.add((physical, core))
            processor = None
            physical = "0"
            core = "0"
    return logical, (len(pairs) or logical)


def main() -> int:
    try:
        affinity = set(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        affinity = set(range(os.cpu_count() or 1))

    quota_cpus, period_us, cgroup_version = cpu_limit()
    memory_bytes, memory_cgroup_version = memory_limit()
    if cgroup_version == "unknown":
        cgroup_version = memory_cgroup_version

    visible_logical, visible_physical = cpu_topology(affinity)
    requested_cpu = parse_cpu(os.environ.get("ONEBRC_CPU_QUOTA"))
    requested_memory = parse_size(os.environ.get("ONEBRC_MEMORY_LIMIT"))
    effective_cpu = quota_cpus if quota_cpus is not None else float(len(affinity))

    result = {
        "affinity_cpus": len(affinity),
        "cgroup_version": cgroup_version,
        "cpu_period_us": period_us,
        "cpu_quota_cpus": round(quota_cpus, 3) if quota_cpus is not None else None,
        "effective_cpu_cpus": round(effective_cpu, 3),
        "memory_limit_bytes": memory_bytes,
        "memory_limit": f"{memory_bytes / (1024 ** 3):.2f} GiB" if memory_bytes is not None else "unlimited",
        "requested_cpu_quota": requested_cpu,
        "requested_memory_limit_bytes": requested_memory,
        "requested_memory_limit": os.environ.get("ONEBRC_MEMORY_LIMIT"),
        "visible_logical_cpus": visible_logical,
        "visible_physical_cores": visible_physical,
    }
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
