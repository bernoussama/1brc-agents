#!/usr/bin/env python3
"""Tests for scripts/cloud_agent_cost.py"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from cloud_agent_cost import (  # noqa: E402
    RatesPerMillion,
    TokenUsage,
    aggregate_session,
    resolve_rates,
    summarize_all,
)


class CostFormulaTests(unittest.TestCase):
    def test_cost_formula_matches_manual_example(self) -> None:
        usage = TokenUsage(input=1_000_000, output=500_000, cacheRead=2_000_000)
        rates = RatesPerMillion(input=5.0, output=30.0, cacheRead=0.5)
        self.assertAlmostEqual(rates.cost_usd(usage), 5.0 + 15.0 + 1.0)

    def test_free_tier_estimate_uses_paid_list_rates(self) -> None:
        pricing = json.loads((ROOT / "scripts" / "model_pricing.json").read_text())
        rates = resolve_rates(pricing, "openrouter/minimax/minimax-m3:free")
        self.assertEqual(rates.input, 0.3)
        self.assertEqual(rates.output, 1.2)


class SessionIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        sessions_root = ROOT / ".sessions"
        if not sessions_root.is_dir():
            raise unittest.SkipTest(".sessions directory is not available in this environment")
        cls.summary = summarize_all(repo_root=ROOT)

    def test_grok_runs_are_marked_unavailable(self) -> None:
        grok = [run for run in self.summary["runs"] if "Grok" in run["model"]]
        self.assertEqual(len(grok), 2)
        for run in grok:
            self.assertFalse(run["metricsAvailable"])
            self.assertIsNone(run["tokens"])
            self.assertIsNone(run["costUsd"])

    def test_gpt_5_6_sol_high_matches_event_cost(self) -> None:
        run = next(r for r in self.summary["runs"] if r["model"] == "gpt-5.6-sol high")
        self.assertAlmostEqual(run["costUsd"], run["eventCostUsd"], places=4)
        self.assertAlmostEqual(run["costUsd"], 27.9813, places=3)
        self.assertEqual(run["tokens"], 43_389_638)

    def test_gpt_5_6_sol_medium_matches_event_cost(self) -> None:
        run = next(r for r in self.summary["runs"] if r["model"] == "gpt-5.6-sol medium")
        self.assertAlmostEqual(run["costUsd"], run["eventCostUsd"], places=4)

    def test_minimax_m3_free_estimate_is_nonzero(self) -> None:
        run = next(r for r in self.summary["runs"] if r["model"] == "MiniMax M3 :free max")
        self.assertGreater(run["costUsd"], 0)
        self.assertEqual(run["eventCostUsd"], 0.0)

    def test_ox_alpha_preview_estimate_is_zero(self) -> None:
        run = next(r for r in self.summary["runs"] if r["model"] == "ox-alpha high")
        self.assertEqual(run["costUsd"], 0.0)
        self.assertGreater(run["tokens"], 0)

    def test_aggregate_session_reads_events(self) -> None:
        events = ROOT / ".sessions/gpt-5.6-sol-high-20260824T153119/events.jsonl"
        usage, event_cost = aggregate_session(events)
        self.assertGreater(usage.total_tokens, 0)
        self.assertGreater(event_cost, 0)


if __name__ == "__main__":
    unittest.main()
