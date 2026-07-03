import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { ProductPeek } from "@/components/landing/product-peek";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <ProductPeek />
      </main>
      <SiteFooter />
    </>
  );
}
