import type { Metadata } from "next";
import { SiteNav } from "@/components/landing/site-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Kırmızı and its companion extension do with your data: nothing leaves your device.",
  alternates: { canonical: `${siteConfig.url}/privacy` },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-8 first:border-t-0 first:pt-0">
      <h2 className="mb-3 font-bold text-2xl tracking-tight">{title}</h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-20 sm:py-28">
          <p className="mb-3 font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Privacy
          </p>
          <h1 className="font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
            Nothing leaves your device.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Not as a promise we ask you to trust — as a consequence of how the
            thing is built. There is no server to send recordings to.
          </p>

          <div className="mt-14">
            <Section title="Recordings">
              <p>
                Screen, microphone, and webcam capture all happen in your
                browser. The file is assembled on your machine and saved
                straight to it. No recording, frame, or audio sample is ever
                uploaded, because the application has no media backend to
                upload it to.
              </p>
              <p>
                Recent recordings are kept in your browser&apos;s own storage
                (IndexedDB) so you can reopen them. They never leave it, and
                clearing your site data removes them.
              </p>
            </Section>

            <Section title="Accounts and tracking">
              <p>
                There are no accounts, no cookies for tracking, no analytics,
                and no advertising. Nothing you record or edit is associated
                with an identity, because there is no identity to associate it
                with.
              </p>
            </Section>

            <Section title="The companion extension">
              <p>
                The optional Kırmızı Companion extension exists for one reason:
                a web page cannot observe the mouse on surfaces it does not
                own, so a recording alone has no idea where you clicked. The
                extension supplies that, and only that.
              </p>
              <p>
                While a recording is running it collects pointer positions and
                click times, immediately converted to fractions of the screen or
                viewport. It reads nothing else — not the address of any page,
                not its content, not what you type, not what any element is.
              </p>
              <p>
                Those positions are held in memory and handed to the Kırmızı
                tab when the recording stops, then discarded. They are never
                written to disk by the extension and never sent over the
                network. The extension requests no network access at all.
              </p>
            </Section>

            <Section title="Hosting">
              <p>
                The site itself is static and served by a hosting provider,
                which — like every web host — processes basic request data such
                as IP addresses to deliver the page. That is the full extent of
                what a visit involves.
              </p>
            </Section>

            <Section title="Seeing for yourself">
              <p>
                Kırmızı is open source. If any of the above matters to you, you
                can read the code rather than take our word for it, including
                every line of the extension.
              </p>
              <p>
                <a
                  href={siteConfig.githubUrl}
                  className="text-red underline underline-offset-4 hover:text-red-hover"
                >
                  github.com/canbedir/kirmizi
                </a>
              </p>
            </Section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
