import { siteConfig } from "@/lib/site";

// What the page is, in the vocabulary search engines read.
//
// The markup already says it in prose, but prose has to be interpreted;
// this states it outright: a free web application called Kırmızı, also
// spelled Kirmizi — which is what anyone typing it into a search box will
// use, since the name is a Turkish word with two dotless i's.

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}/#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      alternateName: [siteConfig.nameAscii, `${siteConfig.nameAscii} app`],
      description: siteConfig.description,
      inLanguage: "en",
      publisher: { "@id": `${siteConfig.url}/#author` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteConfig.url}/#app`,
      name: siteConfig.name,
      alternateName: siteConfig.nameAscii,
      url: siteConfig.url,
      applicationCategory: "MultimediaApplication",
      applicationSubCategory: "Screen recorder",
      operatingSystem: "Any (runs in a web browser)",
      browserRequirements: "Requires a Chromium-based browser or Firefox",
      description: siteConfig.description,
      featureList: [
        "Records the screen entirely in the browser",
        "No account and nothing to install — the file is built on your machine",
        "Zooms placed automatically from where you clicked",
        "Dead air cut where the recording is both quiet and still",
        "Loudness measured and corrected to a standard level",
        "Vertical, square and cropped exports",
      ],
      // Free, and saying so is what puts the price in a result.
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      isAccessibleForFree: true,
      author: { "@id": `${siteConfig.url}/#author` },
      sameAs: [siteConfig.githubUrl],
    },
    {
      "@type": "Person",
      "@id": `${siteConfig.url}/#author`,
      name: siteConfig.author,
      url: siteConfig.githubUrl,
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // The content is our own constant, not anything a user supplied.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
