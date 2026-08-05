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
export const metadata: Metadata = {
  title: `${siteConfig.name} — free browser screen recorder, no signup`,
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
