import { Reveal } from "@/components/landing/reveal";
import { EditorDemo } from "@/components/studio/editor-demo";

// What a take looks like the moment recording stops — and, because a still
// can't show it, that the zooms it placed are ordinary regions you can pick
// up and move.
const notes = [
  {
    k: "Placed, with the scale to match",
    v: "One per burst of clicks, framed on what was clicked. Closer where the target was small, wider where it was spread out.",
  },
  {
    k: "Then yours",
    v: "Pick any of them up to retime it, change how far it pushes in, drag to re-aim it, or delete it outright.",
  },
  {
    k: "Everything else still there",
    v: "Trim, split, mute, speed — plus the frame, the level and the click marks, all applied when you export.",
  },
];

export function EditorShot() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
        <Reveal className="min-w-0">
          <EditorDemo />
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            The editor
          </p>
          <h2 className="font-bold text-3xl leading-tight tracking-tight sm:text-4xl">
            Opened, not built.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground text-pretty">
            This is what a take looks like the moment recording stops — no
            setup, no panels to go hunting for, and nothing to accept before you
            can change it.
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
