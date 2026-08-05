import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { RecorderShell } from "@/components/recorder/recorder-shell";

export const metadata: Metadata = {
  title: "Record your screen",
  description:
    "Record your screen entirely in the browser. Pick a surface, hit record, download — nothing leaves your machine.",
  alternates: { canonical: `${siteConfig.url}/record` },
};

export default function RecordPage() {
  return <RecorderShell />;
}
