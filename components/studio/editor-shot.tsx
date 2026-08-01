import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";

// The actual editor, captured from the running app rather than mocked up:
// four zooms it placed itself, one of them selected and being aimed.
const notes = [
  {
    k: "Four zooms, placed",
    v: "One per click burst, each framed on what was clicked. 3.0× where the target was small, 1.6× where it was spread out.",
  },
  {
    k: "Selected, and yours",
    v: "Pick any of them to retime it, change how far it pushes in, drag the dot to re-aim, or delete it outright.",
  },
  {
    k: "Everything else still there",
    v: "Trim, split, mute, speed — plus the frame and the click marks, all applied when you export.",
  },
];

export function EditorShot() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-16">
        <Reveal>
          <div className="overflow-hidden rounded-xl border border-border shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
            <Image
              src="/studio-editor.png"
              alt="The Kırmızı editor: a recording with four automatically placed zoom regions on the timeline, one selected at 1.8×, with the frame and click panels below."
              width={1568}
              height={1806}
              className="w-full"
            />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            The editor
          </p>
          <h2 className="font-bold text-3xl leading-tight tracking-tight sm:text-4xl">
            Opened, not built.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            This is what a take looks like the moment recording stops — no
            setup, no panels to go hunting for.
          </p>

          <dl className="mt-8 space-y-5">
            {notes.map((note) => (
              <div key={note.k}>
                <dt className="font-bold text-sm">{note.k}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {note.v}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
