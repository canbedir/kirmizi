import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import { RecorderShell } from "@/components/recorder/recorder-shell";

export const metadata: Metadata = {
  title: "Record your screen",
  description:
    "Record your screen in the browser, then cut it, frame it and share it. Nothing to install, no account.",
  alternates: { canonical: `${siteConfig.url}/record` },
};

export default function RecordPage() {
  return <RecorderShell />;
}
