import type { Metadata } from "next";
import { SiteNav } from "@/components/landing/site-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { ClosingCta } from "@/components/landing/closing-cta";
import { StudioHero } from "@/components/studio/studio-hero";
import { StudioShowcase } from "@/components/studio/studio-showcase";
import { EditorShot } from "@/components/studio/editor-shot";
import { StudioFeatures } from "@/components/studio/studio-features";
import { CompanionNote } from "@/components/studio/companion-note";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Automatic zooms placed from your clicks, click effects, styled frames and an editable webcam bubble — all rendered on your own machine.",
  alternates: { canonical: `${siteConfig.url}/studio` },
  openGraph: {
    title: "Kırmızı Studio — it zooms where you clicked",
    description:
      "Automatic zooms placed from your clicks, click effects, styled frames and an editable webcam bubble — all rendered on your own machine.",
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
        <StudioFeatures />
        <CompanionNote />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
