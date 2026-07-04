import Link from "next/link";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <Wordmark />
      <p className="mt-4 font-mono text-sm text-red">404</p>
      <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">
        This page went off-device.
      </h1>
      <p className="max-w-sm text-muted-foreground">
        The page you&apos;re after doesn&apos;t exist — like your recordings, it
        never left the browser.
      </p>
      <Link href="/" className={cn(buttonVariants(), "mt-2")}>
        Back to home
      </Link>
    </main>
  );
}
