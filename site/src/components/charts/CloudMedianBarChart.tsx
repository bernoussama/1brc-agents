import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";

/** Short labels for the cloud-agent Round A median table (lower is faster). */
const data = [
  { model: "sol-h", median: 1311.4 },
  { model: "m3-free", median: 3061.3 },
  { model: "sol-m", median: 3174.4 },
  { model: "grok-h", median: 3953.1 },
  { model: "ox-h", median: 3954.6 },
  { model: "luna", median: 4610.3 },
  { model: "grok-m", median: 5746.5 },
  { model: "muse", median: 6500.8 },
  { model: "m2.7", median: 6562.3 },
  { model: "ox-max", median: 7256.5 },
  { model: "m3-max", median: 12225.6 },
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
      <div className="border-foreground bg-card h-72 w-full border-2 border-solid p-2 sm:h-80">
        <BarChart data={data} config={config} bloom="aura" animate>
          <XAxis dataKey="model" maxTicks={11} tickMargin={10} />
          <YAxis tickFormatter={(v) => String(Math.round(v))} />
          <Legend />
          <Tooltip labelKey="model" />
          <Bar dataKey="median" variant="gradient" />
        </BarChart>
      </div>
      <figcaption className="font-mono text-muted-foreground text-xs leading-relaxed">
        Cloud-agent Round A — median of five timed runs (ms). Lower is faster. Same host class; not
        comparable to the laptop v0.5 batch. Labels: sol-h/m = gpt-5.6-sol high/medium; m3-free =
        MiniMax M3 :free; grok-h/m = Grok 4.6; ox-h/max = ox-alpha; muse = Muse Spark free xhigh
        (r2).
      </figcaption>
    </figure>
  );
}
