export const siteConfig = {
  name: "Kırmızı",
  /** Without the diacritics, which is how people type it into a search box. */
  nameAscii: "Kirmizi",
  url: "https://kirmizi.app",
  tagline: "Record your screen. Nothing leaves your browser.",
  description:
    "A privacy-first, no-signup screen recorder that runs entirely in your browser. No account, no upload, no watermark — every frame stays on your machine.",
  author: "hix",
  githubUrl: "https://github.com/canbedir/kirmizi",
  /**
   * The companion extension's store listing. Empty falls back to the source
   * on GitHub, so nothing points at a dead end if the listing ever goes.
   *
   * The slug is decorative — the store resolves the item by the id alone, and
   * rewrites whatever slug it was given — so this spells it readably rather
   * than percent-encoding the Turkish name.
   */
  chromeStoreUrl:
    "https://chromewebstore.google.com/detail/kirmizi-companion/dffcgjfcmhcianhbahkmajigonlmbdaj",
} as const;

/** Where to send someone who wants the companion extension. */
export const companionUrl =
  siteConfig.chromeStoreUrl || `${siteConfig.githubUrl}/tree/main/extension`;

/** True once it can be installed in one click rather than side-loaded. */
export const companionInStore = !!siteConfig.chromeStoreUrl;

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
