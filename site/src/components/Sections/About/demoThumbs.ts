// Shared placeholder thumbnails for the About card grids (Project Log + Achievements). Six demo
// images with fixed alts, defined ONCE so the image↔alt pairing can't drift between the two grids.
// The shape matches ContentCardProps (`image` + `imageAlt`), so a card spreads a thumb directly:
// `{ ...demoThumbs.retroChat, title: … }`. Plain Vite image imports (no Sharp), like the home demo
// imagery — swap these for real per-card art when the projects/achievements have their own.
import cssGrid from "@images/demo/post-css-grid.jpg";
import floppyDisk from "@images/demo/post-floppy-disk.jpg";
import retroDeploy from "@images/demo/post-retro-deploy.jpg";
import cliQuest from "@images/demo/project-cli-quest.png";
import pixelArt from "@images/demo/project-pixel-art.png";
import retroChat from "@images/demo/project-retro-chat.png";

export interface DemoThumb {
  image: ImageMetadata;
  imageAlt: string;
}

export const demoThumbs = {
  retroChat: {
    image: retroChat,
    imageAlt: "A pixel-art chat application interface labelled Chatting App v1.0",
  },
  retroDeploy: {
    image: retroDeploy,
    imageAlt: "An isometric illustration of a green-lit server room",
  },
  cliQuest: {
    image: cliQuest,
    imageAlt: "A retro terminal running a text adventure on a CRT monitor",
  },
  pixelArt: {
    image: pixelArt,
    imageAlt: "A pixel-art sprite editor with a colour palette and canvas grid",
  },
  cssGrid: { image: cssGrid, imageAlt: "A glowing sword rising from a pedestal in a crystal cave" },
  floppyDisk: { image: floppyDisk, imageAlt: "A retro CRT monitor showing a pixel-art game menu" },
} satisfies Record<string, DemoThumb>;
