import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
      </main>
      <SiteFooter />
    </>
  );
}
