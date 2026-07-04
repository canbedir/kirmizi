import type { Metadata } from "next";
import { RecorderShell } from "@/components/recorder/recorder-shell";

export const metadata: Metadata = {
  title: "Record",
  description:
    "Record your screen entirely in the browser. Pick a surface, hit record, download — nothing leaves your machine.",
};

export default function RecordPage() {
  return <RecorderShell />;
}
