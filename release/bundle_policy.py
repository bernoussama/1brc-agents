"""Which files belong in a published run bundle."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

TRACE_FILES = ("events.jsonl", "pi.err")
SCORE_FILES = (
    "score.json",
    "score.log",
    "manifest.yaml",
    "cleanup.log",
    "control/budget.json",
)
INVENTORY_FILES = ("SHA256SUMS", "omitted-files.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_work_relative(path: str) -> str | None:
    path = path.strip().strip("'\"")
    if path.startswith("/work/submission/"):
        return "work/submission/" + path.removeprefix("/work/submission/")
    if path.startswith("/work/"):
        return "work/" + path.removeprefix("/work/")
    if path.startswith("work/"):
        return path
    return None


def _source_from_events(run_dir: Path) -> str | None:
    events = run_dir / "events.jsonl"
    if not events.is_file():
        return None
    for line in reversed(events.read_text().splitlines()):
        if "-o solution " not in line or "-o solution-" in line:
            continue
        match = re.search(r"-o solution ([\w./_-]+\.c)", line)
        if match:
            return f"work/submission/{Path(match.group(1)).name}"
    return None


def collect_solution_files(run_dir: Path) -> list[str]:
    """Return bundle-relative paths for the final submission and its sources."""
    run_sh = run_dir / "work/submission/run.sh"
    if not run_sh.is_file():
        return []

    text = run_sh.read_text()
    rel_paths: set[str] = {"work/submission/run.sh"}

    for match in re.finditer(r"/work/(?:submission/)?[\w./_-]+", text):
        normalized = _normalize_work_relative(match.group(0))
        if normalized:
            rel_paths.add(normalized)

    for match in re.finditer(r'\$DIR/([\w./_-]+)', text):
        rel_paths.add(f"work/submission/{match.group(1)}")

    for match in re.finditer(r'\$\(dirname\s+"?\$0"?\)/([\w./_-]+)', text):
        rel_paths.add(f"work/submission/{match.group(1)}")

    resolved: set[str] = set()
    for relative in rel_paths:
        path = run_dir / relative
        if path.is_file():
            resolved.add(relative)
            if path.suffix == "" and not path.name.startswith("."):
                source = path.with_suffix(".c")
                if source.is_file():
                    resolved.add(str(source.relative_to(run_dir)))
            if path.suffix == ".c":
                binary = path.with_suffix("")
                if binary.is_file():
                    resolved.add(str(binary.relative_to(run_dir)))

    event_source = _source_from_events(run_dir)
    if event_source:
        source_path = run_dir / event_source
        if source_path.is_file():
            resolved.add(event_source)

    return sorted(resolved)


def allowed_relative_paths(run_dir: Path) -> set[str]:
    allowed = set(TRACE_FILES + SCORE_FILES + INVENTORY_FILES)
    allowed.update(collect_solution_files(run_dir))
    return allowed


def prune_bundle(bundle_dir: Path) -> list[dict]:
    """Drop everything except traces, scoring evidence, and the final submission."""
    allowed = allowed_relative_paths(bundle_dir)
    omitted: list[dict] = []

    for path in sorted(bundle_dir.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        if not path.is_file():
            continue
        relative = str(path.relative_to(bundle_dir))
        if relative in allowed:
            continue
        omitted.append({
            "path": relative,
            "bytes": path.stat().st_size,
            "reason": "outside published bundle policy (trace + final submission only)",
        })
        path.unlink()

    for path in sorted(bundle_dir.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()

    return omitted


def finalize_bundle(bundle_dir: Path, omitted: list[dict]) -> None:
    (bundle_dir / "omitted-files.json").write_text(
        json.dumps(omitted, indent=2, sort_keys=True) + "\n"
    )
    rewrite_checksums(bundle_dir)


def rewrite_checksums(bundle_dir: Path, allowed: set[str] | None = None) -> None:
    if allowed is None:
        allowed = allowed_relative_paths(bundle_dir)

    copied: list[Path] = []
    for relative in sorted(allowed):
        if relative in INVENTORY_FILES:
            continue
        path = bundle_dir / relative
        if path.is_file():
            copied.append(path)

    omitted_path = bundle_dir / "omitted-files.json"
    if omitted_path.is_file():
        copied.append(omitted_path)

    checksum_lines = []
    for path in sorted(copied, key=lambda item: str(item.relative_to(bundle_dir))):
        relative = path.relative_to(bundle_dir)
        checksum_lines.append(f"{sha256(path)}  {relative}")
    (bundle_dir / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n")


def copy_publication_bundle(run_dir: Path, destination: Path) -> list[dict]:
    destination.mkdir(parents=True, exist_ok=True)
    omitted: list[dict] = []

    for relative in TRACE_FILES + SCORE_FILES:
        source = run_dir / relative
        if not source.exists():
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    for relative in collect_solution_files(run_dir):
        source = run_dir / relative
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    omitted.extend(prune_bundle(destination))
    finalize_bundle(destination, omitted)
    return omitted
