import { SiteNav } from "@/components/landing/site-nav";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-32 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Kırmızı · work in progress
          </p>
          <h1 className="font-serif text-6xl leading-[1.02] tracking-tight sm:text-8xl">
            Record your screen.
            <br />
            Nothing <span className="italic text-red">leaves</span>.
          </h1>
          <p className="max-w-md text-muted-foreground">
            The base layout, theme and tokens are in place. The hero lands next.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
