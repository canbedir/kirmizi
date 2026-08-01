export const siteConfig = {
  name: "Kırmızı",
  url: "https://kirmizi.app",
  tagline: "Record your screen. Nothing leaves your browser.",
  description:
    "A privacy-first, no-signup screen recorder that runs entirely in your browser. No account, no upload, no watermark — every frame stays on your machine.",
  author: "hix",
  githubUrl: "https://github.com/canbedir/kirmizi",
} as const;

export const navLinks: {
  label: string;
  href: string;
  /** Marks the link with the record dot — something newly landed. */
  isNew?: boolean;
}[] = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Studio", href: "/studio", isNew: true },
];

// Social / source links for the hero row. `icon` maps to a component in the
// hero; add x / bluesky here once those handles exist.
export const socialLinks = [
  { label: "GitHub", href: siteConfig.githubUrl, icon: "github" },
] as const;
