import { Reveal } from "@/components/landing/reveal";

export function Manifesto() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
      <Reveal>
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Why
        </p>
        <p className="text-3xl leading-snug tracking-tight sm:text-4xl">
          Every screen recorder wants your email, your upload, your patience.{" "}
          <span className="italic text-red">Kırmızı wants none of it.</span> Your
          screen is yours, so the recording should be too — made on your machine,
          saved to your machine, gone when you close the tab. No cloud, no catch,
          no red tape. Just red.
        </p>
      </Reveal>
    </section>
  );
}
