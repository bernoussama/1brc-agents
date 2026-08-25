# Cloud-agent cost accounting

Scripts to aggregate token usage from `.sessions/*/events.jsonl` and estimate
USD cost using published input, output, and cache-read rates.

## Files

| File | Purpose |
|---|---|
| `model_pricing.json` | Per-model rates ($/1M tokens) and source links |
| `cloud_agent_sessions.json` | Maps chart labels → session dirs and pricing ids |
| `cloud_agent_cost.py` | Aggregates tokens and computes estimated USD |
| `test_cloud_agent_cost.py` | Unit + integration tests (requires `.sessions/`) |
| `cloud_agent_cost.generated.json` | Last generated summary (optional snapshot) |

## Usage

```bash
# Print JSON summary
python3 scripts/cloud_agent_cost.py

# Write snapshot
python3 scripts/cloud_agent_cost.py --output scripts/cloud_agent_cost.generated.json

# Run tests
python3 scripts/test_cloud_agent_cost.py -v
```

## Verification

- **Codex (gpt-5.6-sol)** — computed cost matches summed `usage.cost.total` from
  session events (within floating-point tolerance). Tests enforce this for sol
  high and sol medium.
- **Free preview routes** — ox-alpha and OpenCode/M3 `:free` bill $0; the chart
  uses list rates from `estimateFrom` pricing entries where applicable.
- **Cursor Grok** — marked `metricsAvailable: false`; token and cost charts show
  `N/A` (proxy does not expose reliable totals).

After changing pricing or adding sessions, re-run the script and update
`site/src/components/charts/cloud-agent-runs.ts` with the new `tokens` and
`costUsd` values.

## Dashboard chart GIFs

Capture the dither-kit bar entrance animations from `/charts/cloud-agent/`:

```bash
# Start the site dev server first (port 4321)
cd site && npm run dev -- --host 127.0.0.1 --port 4321

# Requires: pip install playwright && playwright install chromium, ffmpeg
python3 scripts/capture_dashboard_chart_gifs.py
```

Output: `artifacts/chart-gifs/{median-run-time,agent-wall-time,estimated-cost}.gif`.

The script loads `/charts/cloud-agent/?capture=1` (3s entrance animation), reloads
once per panel, and captures frames synced to `requestAnimationFrame` so the bar
grow wave is sampled smoothly. Value labels stay hidden until the entrance
finishes, matching the live chart.
