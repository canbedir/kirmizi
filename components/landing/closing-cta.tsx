import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";
import { RecordButton } from "@/components/record-button";

export function ClosingCta() {
  return (
    <section className="px-6 py-24 sm:py-32">
      <Reveal className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/40 px-5 py-16 text-center sm:px-10 sm:py-20">
          {/* Soft red glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-16 mx-auto h-64 max-w-lg rounded-full opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, var(--glow), transparent 70%)",
            }}
          />

          <Image
            src="/kirmizi-logo.png"
            alt=""
            width={510}
            height={570}
            aria-hidden
            className="relative mx-auto h-11 w-auto"
          />

          <h2 className="relative mt-6 font-bold text-4xl tracking-tight text-balance sm:text-5xl">
            Ready when you are.
          </h2>
          <p className="relative mt-4 text-lg text-muted-foreground">
            Record your screen — nothing leaves your browser.
          </p>

          <div className="relative mt-9 flex justify-center">
            <RecordButton size="lg">Start recording — it&apos;s free</RecordButton>
          </div>

          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>No signup</span>
            <span aria-hidden className="text-red">·</span>
            <span>No upload</span>
            <span aria-hidden className="text-red">·</span>
            <span>No watermark</span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
