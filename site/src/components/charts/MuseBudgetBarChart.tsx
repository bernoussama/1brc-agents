import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { YAxis } from "@/components/dither-kit/y-axis";
import { BarValueLabels } from "./BarValueLabels";
import { formatMs } from "./format-ms";
import { WrappedXAxis } from "./WrappedXAxis";

/** Muse Spark free xhigh — early exit vs full budget on the same host class. */
const data = [
  { run: "Muse Spark free xhigh — run 1 (~37 min)", median: 8940.2 },
  { run: "Muse Spark free xhigh — run 2 (~120 min)", median: 6500.8 },
];

const config = {
  median: { label: "median_ms", color: "green" as const },
};

/** Mount with `client:load` from MDX/Astro. */
export default function MuseBudgetBarChart() {
  return (
    <figure className="not-prose my-6 flex flex-col gap-3">
      <div className="border-foreground bg-card h-72 w-full border-2 border-solid p-2 sm:h-80">
        <BarChart
          data={data}
          config={config}
          bloom="low"
          animate
          margins={{ top: 36, bottom: 64 }}
        >
          <WrappedXAxis dataKey="run" maxTicks={2} tickMargin={6} />
          <YAxis tickFormatter={(v) => String(Math.round(v))} />
          <Legend />
          <Tooltip labelKey="run" valueFormatter={formatMs} />
          <Bar dataKey="median" variant="hatched" />
          <BarValueLabels dataKey="median" valueFormatter={formatMs} />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        Same model and thinking (`xhigh`): spending the full budget improved the median from 8940.2
        ms to 6500.8 ms.
      </figcaption>
    </figure>
  );
}
