import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { ProductPeek } from "@/components/landing/product-peek";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { StudioTeaser } from "@/components/landing/studio-teaser";
import { ClosingCta } from "@/components/landing/closing-cta";
import { SiteFooter } from "@/components/landing/site-footer";

// The home page needs its own title: the layout's default is the bare name,
// which says nothing to anyone searching, and "kırmızı" on its own is an
// ordinary Turkish word competing with the whole language.
//
// What it doesn't need is the list of selling points it used to carry. "free"
// and "no signup" are true and are said on the page itself; in a tab they are
// past the truncation, and in a result they read as keywords rather than as a
// title. "Screen recorder" stays because it is the phrase people actually
// type — dropping it would give up the one thing the long version bought.
export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  alternates: { canonical: siteConfig.url },
};

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main id="main-content" className="flex-1">
        <Hero />
        <ProductPeek />
        <HowItWorks />
        <Features />
        <StudioTeaser />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
