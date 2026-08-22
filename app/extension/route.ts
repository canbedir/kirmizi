import { companionUrl } from "@/lib/site";

// A short address for the companion extension, and nothing else.
//
// The store's own URL is long, unreadable and impossible to say out loud, so
// this stands in for it wherever the extension is mentioned away from the
// site — a post, a comment, a slide. Nothing here links to it and it isn't in
// the sitemap: the site already points at the store where it matters, and a
// second door into the same room is only worth having if somebody typed it.
//
// It follows siteConfig rather than repeating the address, so the store link
// is still in one place — including the fallback to the source on GitHub,
// which means this can't dead-end even if the listing goes away.
//
// Temporary rather than permanent on purpose: a 308 is cached by the browser
// more or less forever, and what it points at is a URL somebody else owns.

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(null, {
    status: 307,
    headers: {
      location: companionUrl,
      // There's no page here to index, and it isn't meant to be found by
      // searching — only by being given.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
