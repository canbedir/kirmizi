import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { ProductPeek } from "@/components/landing/product-peek";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { ClosingCta } from "@/components/landing/closing-cta";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main id="main-content" className="flex-1">
        <Hero />
        <ProductPeek />
        <HowItWorks />
        <Features />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
