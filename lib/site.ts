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

  /**
   * Where a shared clip goes — the only address in this app that receives a
   * recording, and only ever because somebody asked it to. It's a Worker in
   * front of R2; kirmizi.app's own server has no endpoint that takes video.
   *
   * Empty turns sharing off entirely, which is what a fork gets until it
   * points this at something of its own.
   */
  shareApi:
    process.env.NEXT_PUBLIC_SHARE_API ??
    "https://kirmizi-share.canbedir.workers.dev",

  /**
   * Cloudflare Turnstile's public half. It identifies the widget, not the
   * account, and is meant to be read by anyone — the secret that verifies a
   * token lives on the Worker.
   *
   * Empty means this build can't produce a token. That isn't a way around the
   * check: the Worker is the one that decides, and a deployed Worker with no
   * secret refuses everything.
   */
  turnstileSiteKey:
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAEODV7iN8WfzvscX",
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
