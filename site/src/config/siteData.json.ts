import { type SiteDataProps } from "./types/configDataTypes";

// Site metadata for the 1BRC-Agents project site.
const siteData = {
  name: "1BRC-Agents",
  title: "1BRC-Agents — measuring autonomous coding agents",
  description:
    "A pinned-sandbox benchmark where coding agents compete on the One Billion Row Challenge — fully autonomously, with frozen judges and public traces.",

  author: {
    name: "1BRC-Agents",
    email: "",
    twitter: "",
  },

  defaultImage: {
    src: "/og.jpg",
    alt: "1BRC-Agents",
  },

  sameAs: ["https://github.com/bernoussama/1brc-agents"],
} satisfies SiteDataProps;

export default siteData;
