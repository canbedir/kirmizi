import type { Metadata } from "next";
import { SiteNav } from "@/components/landing/site-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { ClosingCta } from "@/components/landing/closing-cta";
import { StudioHero } from "@/components/studio/studio-hero";
import { StudioShowcase } from "@/components/studio/studio-showcase";
import { EditorShot } from "@/components/studio/editor-shot";
import { FinishSection } from "@/components/studio/finish-section";
import { StudioFeatures } from "@/components/studio/studio-features";
import { CompanionNote } from "@/components/studio/companion-note";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Zooms placed from your clicks, dead air cut on two signals, a measured sound level and vertical or square exports — all rendered on your own machine.",
  alternates: { canonical: `${siteConfig.url}/studio` },
  openGraph: {
    title: "Kırmızı Studio — it zooms where you clicked",
    description:
      "Zooms placed from your clicks, dead air cut on two signals, a measured sound level and vertical or square exports — all rendered on your own machine.",
    url: `${siteConfig.url}/studio`,
  },
};

export default function StudioPage() {
  return (
    <>
      <SiteNav />
      <main id="main-content" className="flex-1">
        <StudioHero />
        <StudioShowcase />
        <EditorShot />
        <FinishSection />
        <StudioFeatures />
        <CompanionNote />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
