#!/usr/bin/env python3
"""Aggregate cloud-agent session tokens and estimate USD cost from model pricing."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PRICING_PATH = ROOT / "scripts" / "model_pricing.json"
SESSIONS_PATH = ROOT / "scripts" / "cloud_agent_sessions.json"


@dataclass(frozen=True)
class TokenUsage:
    input: int = 0
    output: int = 0
    cacheRead: int = 0
    cacheWrite: int = 0
    reasoning: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input + self.output + self.cacheRead + self.cacheWrite

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass(frozen=True)
class RatesPerMillion:
    input: float
    output: float
    cacheRead: float
    cacheWrite: float = 0.0

    def cost_usd(self, usage: TokenUsage) -> float:
        million = 1_000_000.0
        return (
            usage.input * self.input / million
            + usage.output * self.output / million
            + usage.cacheRead * self.cacheRead / million
            + usage.cacheWrite * self.cacheWrite / million
        )


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def resolve_rates(pricing: dict[str, Any], pricing_id: str) -> RatesPerMillion:
    models = pricing["models"]
    if pricing_id not in models:
        raise KeyError(f"Unknown pricing id: {pricing_id}")
    entry = models[pricing_id]
    while entry.get("estimateFrom"):
        entry = models[entry["estimateFrom"]]
    return RatesPerMillion(
        input=float(entry["input"]),
        output=float(entry["output"]),
        cacheRead=float(entry["cacheRead"]),
        cacheWrite=float(entry.get("cacheWrite", 0.0)),
    )


def aggregate_session(events_path: Path) -> tuple[TokenUsage, float]:
    usage = TokenUsage()
    event_cost_total = 0.0
    if not events_path.is_file():
        raise FileNotFoundError(events_path)

    with events_path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            event = json.loads(line)
            if event.get("type") != "message_end":
                continue
            message = event.get("message") or {}
            if message.get("role") != "assistant":
                continue
            row = message.get("usage") or {}
            usage = TokenUsage(
                input=usage.input + int(row.get("input") or 0),
                output=usage.output + int(row.get("output") or 0),
                cacheRead=usage.cacheRead + int(row.get("cacheRead") or 0),
                cacheWrite=usage.cacheWrite + int(row.get("cacheWrite") or 0),
                reasoning=usage.reasoning + int(row.get("reasoning") or 0),
            )
            event_cost_total += float((row.get("cost") or {}).get("total") or 0.0)

    return usage, event_cost_total


def summarize_run(
    *,
    chart_label: str,
    session_dir: str,
    pricing_id: str | None,
    metrics_available: bool,
    sessions_root: Path,
    pricing: dict[str, Any],
    verify_event_cost: bool = False,
    estimate_from_list_rates: bool = False,
) -> dict[str, Any]:
    events_path = sessions_root / session_dir / "events.jsonl"
    usage, event_cost_total = aggregate_session(events_path)

    result: dict[str, Any] = {
        "model": chart_label,
        "sessionDir": session_dir,
        "metricsAvailable": metrics_available,
        "tokens": usage.total_tokens if metrics_available else None,
        "tokenBreakdown": usage.to_dict() if metrics_available else None,
        "costUsd": None,
        "eventCostUsd": round(event_cost_total, 6) if metrics_available else None,
        "pricingId": pricing_id,
    }

    if not metrics_available:
        return result

    if pricing_id is None:
        raise ValueError(f"{chart_label} is metrics-available but missing pricingId")

    estimate_rates = resolve_rates(pricing, pricing_id)
    result["costUsd"] = round(estimate_rates.cost_usd(usage), 4)
    billed_entry = pricing["models"][pricing_id]
    result["costUsdBilled"] = round(
        RatesPerMillion(
            input=float(billed_entry.get("input", 0)),
            output=float(billed_entry.get("output", 0)),
            cacheRead=float(billed_entry.get("cacheRead", 0)),
            cacheWrite=float(billed_entry.get("cacheWrite", 0)),
        ).cost_usd(usage),
        4,
    )

    if verify_event_cost and event_cost_total > 0:
        result["eventCostDeltaUsd"] = round(result["costUsd"] - event_cost_total, 6)

    return result


def summarize_all(
    *,
    repo_root: Path | None = None,
    pricing_path: Path = PRICING_PATH,
    sessions_path: Path = SESSIONS_PATH,
) -> dict[str, Any]:
    root = repo_root or ROOT
    pricing = load_json(pricing_path)
    config = load_json(sessions_path)
    sessions_root = root / config["sessionsRoot"]

    runs = [
        summarize_run(
            chart_label=run["chartLabel"],
            session_dir=run["sessionDir"],
            pricing_id=run.get("pricingId"),
            metrics_available=bool(run.get("metricsAvailable", True)),
            sessions_root=sessions_root,
            pricing=pricing,
            verify_event_cost=bool(run.get("verifyEventCost")),
            estimate_from_list_rates=bool(run.get("estimateFromListRates")),
        )
        for run in config["runs"]
    ]

    return {
        "currency": pricing["currency"],
        "runs": runs,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=ROOT,
        help="Repository root containing .sessions/",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write JSON summary",
    )
    args = parser.parse_args(argv)

    summary = summarize_all(repo_root=args.repo_root)
    payload = json.dumps(summary, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
