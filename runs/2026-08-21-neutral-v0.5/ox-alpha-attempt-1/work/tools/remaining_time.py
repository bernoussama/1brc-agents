#!/usr/bin/env python3
"""Report the authoritative remaining benchmark-session budget.

The harness bind-mounts the budget file read-only at runtime. The agent must
use this wall-clock deadline instead of estimating time from tool calls.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_BUDGET_FILE = Path("/run/1brc-budget/budget.json")


def main() -> int:
    budget_path = Path(os.environ.get("ONEBRC_BUDGET_FILE", DEFAULT_BUDGET_FILE))
    try:
        budget = json.loads(budget_path.read_text())
        started_epoch = float(budget["started_epoch"])
        deadline_epoch = float(budget["deadline_epoch"])
        budget_seconds = float(budget["budget_seconds"])
        wrapup_seconds = float(budget["wrapup_seconds"])
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"remaining-time: cannot read authoritative budget: {exc}", file=sys.stderr)
        return 2

    now_epoch = time.time()
    remaining_seconds = max(0.0, deadline_epoch - now_epoch)
    elapsed_seconds = max(0.0, now_epoch - started_epoch)
    expired = remaining_seconds <= 0.0
    phase = "expired" if expired else "wrap-up" if remaining_seconds <= wrapup_seconds else "optimize"

    result = {
        "budget_seconds": round(budget_seconds, 3),
        "elapsed_seconds": round(elapsed_seconds, 3),
        "remaining_seconds": round(remaining_seconds, 3),
        "remaining_minutes": round(remaining_seconds / 60.0, 3),
        "deadline_utc": datetime.fromtimestamp(deadline_epoch, timezone.utc).isoformat(),
        "wrapup_seconds": round(wrapup_seconds, 3),
        "phase": phase,
        "expired": expired,
    }
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
