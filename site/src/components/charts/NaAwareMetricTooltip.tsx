"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useChartPart } from "@/components/dither-kit/chart-context";
import { useCommonChart } from "@/components/dither-kit/common-context";
import { cn } from "@/components/dither-kit/lib";
import { rgb } from "@/components/dither-kit/palette";

/** Hover tooltip that renders N/A when a row opts out via `metricsAvailable`. */
export function NaAwareMetricTooltip({
  labelKey,
  valueKey,
  valueFormatter,
  availableKey = "metricsAvailable",
}: {
  labelKey?: string;
  valueKey: string;
  valueFormatter?: (value: number) => string;
  availableKey?: string;
}) {
  const chart = useCommonChart();
  const ctx = useChartPart("NaAwareMetricTooltip", "bar");
  const show = chart.ready && chart.hoverIndex != null;

  const [lastIndex, setLastIndex] = useState(0);
  if (chart.hoverIndex != null && chart.hoverIndex !== lastIndex) {
    setLastIndex(chart.hoverIndex);
  }
  const index = chart.hoverIndex ?? lastIndex;
  const row = ctx.data[index] ?? {};
  const available = row[availableKey] !== false;
  const heading = chart.heading(index, labelKey);
  const items = chart.itemsAt(index);
  const item = items[0];

  const formattedValue = (() => {
    if (!available) return "N/A";
    const raw = row[valueKey];
    const numeric = typeof raw === "number" ? raw : 0;
    return valueFormatter ? valueFormatter(numeric) : numeric.toLocaleString();
  })();

  return (
    <AnimatePresence>
      {show && item && (
        <motion.div
          key="dither-tooltip"
          initial={{
            opacity: 0,
            x: "-50%",
            y: "-115%",
            top: chart.tooltipTop,
            left: chart.tooltipLeft,
          }}
          animate={{
            opacity: 1,
            x: "-50%",
            y: "-115%",
            top: chart.tooltipTop,
            left: chart.tooltipLeft,
          }}
          exit={{ opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 38,
            mass: 0.6,
          }}
          className={cn(
            "pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 shadow-sm"
          )}
        >
          {heading && (
            <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">{heading}</div>
          )}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-popover-foreground tabular-nums">
            <span
              className="size-2 rounded-[1px]"
              style={{ backgroundColor: rgb(item.seed.fill) }}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="ml-auto pl-2 text-foreground">{formattedValue}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

NaAwareMetricTooltip.chartLayer = "dom" as const;
