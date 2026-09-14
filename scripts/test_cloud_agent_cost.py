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

    def test_gpt_6_astra_codex_list_rates(self) -> None:
        pricing = json.loads((ROOT / "scripts" / "model_pricing.json").read_text())
        rates = resolve_rates(pricing, "openai-codex/gpt-6-astra")
        self.assertEqual(rates.input, 10.0)
        self.assertEqual(rates.output, 50.0)
        self.assertEqual(rates.cacheRead, 1.0)
        self.assertEqual(rates.cacheWrite, 0.0)


class SessionIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        sessions_root = ROOT / ".sessions"
        if not sessions_root.is_dir():
            raise unittest.SkipTest(".sessions directory is not available in this environment")
        config = json.loads((ROOT / "scripts" / "cloud_agent_sessions.json").read_text())
        missing = [
            run["sessionDir"]
            for run in config["runs"]
            if not (sessions_root / run["sessionDir"] / "events.jsonl").is_file()
        ]
        if missing:
            raise unittest.SkipTest(f"incomplete .sessions coverage: {missing[0]} (+{len(missing) - 1} more)")
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

    def test_gpt_6_astra_high_uses_list_rates(self) -> None:
        run = next(r for r in self.summary["runs"] if r["model"] == "gpt-6-astra high")
        self.assertEqual(run["tokens"], 10_446_655)
        self.assertAlmostEqual(run["costUsd"], 19.0846, places=3)

    def test_gpt_6_astra_medium_uses_list_rates(self) -> None:
        run = next(r for r in self.summary["runs"] if r["model"] == "gpt-6-astra medium")
        self.assertEqual(run["tokens"], 4_356_243)
        self.assertAlmostEqual(run["costUsd"], 7.4128, places=3)


class AstraLocalSessionTests(unittest.TestCase):
    def test_aggregate_astra_high_events(self) -> None:
        events = ROOT / ".sessions/gpt-6-astra-high-20260913T233817/events.jsonl"
        if not events.is_file():
            raise unittest.SkipTest("gpt-6-astra high session is not available")
        pricing = json.loads((ROOT / "scripts" / "model_pricing.json").read_text())
        usage, event_cost = aggregate_session(events)
        self.assertEqual(usage.total_tokens, 10_446_655)
        self.assertEqual(event_cost, 0.0)
        rates = resolve_rates(pricing, "openai-codex/gpt-6-astra")
        self.assertAlmostEqual(rates.cost_usd(usage), 19.0846, places=3)

    def test_aggregate_astra_medium_events(self) -> None:
        events = ROOT / ".sessions/gpt-6-astra-medium-20260913T212937/events.jsonl"
        if not events.is_file():
            raise unittest.SkipTest("gpt-6-astra medium session is not available")
        pricing = json.loads((ROOT / "scripts" / "model_pricing.json").read_text())
        usage, event_cost = aggregate_session(events)
        self.assertEqual(usage.total_tokens, 4_356_243)
        self.assertEqual(event_cost, 0.0)
        rates = resolve_rates(pricing, "openai-codex/gpt-6-astra")
        self.assertAlmostEqual(rates.cost_usd(usage), 7.4128, places=3)


if __name__ == "__main__":
    unittest.main()
