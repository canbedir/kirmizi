import type { Metadata } from "next";
import { SiteNav } from "@/components/landing/site-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Kırmızı does with your data: recordings stay on your device unless you ask for a link.",
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
            Your recording stays here.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Recording and editing happen entirely in your browser. One thing
            can send a copy elsewhere — a share link — and it only ever happens
            because you asked for it. This page says exactly what that means.
          </p>

          <div className="mt-14">
            <Section title="Recordings">
              <p>
                Screen, microphone, and webcam capture all happen in your
                browser. The file is assembled on your machine and saved
                straight to it. Nothing is uploaded while you record or edit —
                there is no endpoint on this site that could receive a frame.
              </p>
              <p>
                Recent recordings are kept in your browser&apos;s own storage
                (IndexedDB) so you can reopen them, along with the edits you
                made. They never leave it, and clearing your site data removes
                them.
              </p>
            </Section>

            <Section title="Share links">
              <p>
                Asking for a link is the one action that sends anything
                anywhere. When you do, a copy of the finished clip — rendered
                smaller than the download — is uploaded to storage we run on
                Cloudflare R2. The original recording stays on your machine
                either way.
              </p>
              <p>
                <strong className="text-foreground">
                  A link is unlisted, not private.
                </strong>{" "}
                The address is long and random, so nobody will guess it and it
                is asked not to be indexed — but anyone you give it to can watch
                the clip, and so can anyone they pass it on to.
              </p>
              <p>
                Every shared clip is deleted automatically 24 hours after it was
                made, and you can delete it sooner from the browser that created
                it.
              </p>
              <p>
                One number is kept about a shared clip:{" "}
                <strong className="text-foreground">how many watched it</strong>,
                shown on its page and counted when the clip starts playing. That
                is the whole of it — a number, deleted with the clip. There is no
                list of views, no addresses, no referrers, and nothing that says
                who any viewer was.
              </p>
              <p>
                Counting once per person rather than once per page load needs
                some way to recognise a repeat, so a marker is written for a
                couple of hours: the clip&apos;s id and a salted hash of the
                address — the same kind of hash the limits below use. It cannot
                be turned back into an address, it is not joined to anything,
                and the same cron that deletes clips deletes it.
              </p>
              <p>
                To keep the service free and to stop it being used as free file
                hosting, the upload endpoint counts how much has been uploaded
                each day, and how much from one address. It does that against a
                salted hash rather than the address itself, so the counters
                cannot be turned back into a record of who was there. Cloudflare
                Turnstile checks that there is a person present before an upload
                is accepted.
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
                The site is served by a hosting provider which — like every web
                host — processes basic request data such as IP addresses to
                deliver the page. Shared clips are served from Cloudflare, which
                does the same. That is the full extent of what a visit involves.
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
