import { type PortfolioDataProps } from "./types/configDataTypes";

const portfolioData = {
  profile: {
    tagline: "Bench 01",
    heading: "1BRC-Agents",
    role: "Benchmark",
    years: "2026",
    bio: [
      "1BRC-Agents locks coding models in a pinned Docker sandbox, gives them Gunnar Morling's One Billion Row Challenge, and scores the binary they leave behind — no general network, frozen verifier, public traces.",
      "The gap between models is usually experimental discipline, not a new algorithm: compile, verify, measure, replace, check remaining time, repeat.",
    ],
    shortBio:
      "A CPU benchmark for autonomous coding agents: pinned sandbox, allowlisted model API, median-of-five scoring on a held-out billion-row file.",
    meta: {
      location: "Pinned sandbox",
      role: "Agent eval",
      favorite: "Byte-exact run.sh",
    },
    skills: [
      { label: "Harness", pct: 95 },
      { label: "Judge", pct: 90 },
    ],
  },

  stats: {
    home: ["Round: A", "Rows: 1B", "Warmup: 1×"],
    profile: ["Class: Agent Bench", "Host: Pinned", "Judge: Frozen", "Traces: Public"],
  },

  home: {
    tagline: "Player 1",
    heading: "Press Start to Benchmark",
    intro:
      "Lock the box. Pin the image, dataset, and judge. Let the agent work. Score the binary it left behind. The median is the claim — everything else is provenance.",
  },

  contact: {
    prompt: "Questions about the harness, a run artifact, or a new model profile?",
  },
} satisfies PortfolioDataProps;

export default portfolioData;
