import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { YAxis } from "@/components/dither-kit/y-axis";
import { BarValueLabels } from "./BarValueLabels";
import { formatMs } from "./format-ms";
import { WrappedXAxis } from "./WrappedXAxis";

/** Cloud-agent Round A medians (lower is faster). */
const data = [
  { model: "gpt-5.6-sol high", median: 1311.4 },
  { model: "MiniMax M3 :free max", median: 3061.3 },
  { model: "gpt-5.6-sol medium", median: 3174.4 },
  { model: "Grok 4.6 high", median: 3953.1 },
  { model: "ox-alpha high", median: 3954.6 },
  { model: "gpt-5.6-luna max", median: 4610.3 },
  { model: "Grok 4.6 medium", median: 5746.5 },
  { model: "Muse Spark free xhigh (r2)", median: 6500.8 },
  { model: "MiniMax M2.7 max", median: 6562.3 },
  { model: "ox-alpha max", median: 7256.5 },
  { model: "MiniMax M3 max", median: 12225.6 },
];

const config = {
  median: { label: "median_ms", color: "blue" as const },
};

/**
 * Dithered bar chart of cloud-agent Round A medians.
 * Mount with `client:load` from MDX/Astro.
 */
export default function CloudMedianBarChart() {
  return (
    <figure className="not-prose my-6 flex flex-col gap-3">
      <div className="border-foreground bg-card h-96 w-full border-2 border-solid p-2 sm:h-[28rem]">
        <BarChart
          data={data}
          config={config}
          bloom="aura"
          animate
          margins={{ top: 18, bottom: 88 }}
        >
          <WrappedXAxis dataKey="model" maxTicks={11} tickMargin={6} />
          <YAxis tickFormatter={(v) => String(Math.round(v))} />
          <Legend />
          <Tooltip labelKey="model" valueFormatter={formatMs} />
          <Bar dataKey="median" variant="gradient" />
          <BarValueLabels dataKey="median" valueFormatter={formatMs} />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        Cloud-agent Round A — median of five timed runs (ms). Lower is faster. Same host class; not
        comparable to the laptop v0.5 batch.
      </figcaption>
    </figure>
  );
}
