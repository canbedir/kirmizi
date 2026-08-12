"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { SHARE_MAX_SECONDS } from "@/lib/export-profile";
import {
  createShare,
  deleteShare,
  forgetShare,
  keepShare,
  shareUrl,
  type Share,
} from "@/lib/share";
import { siteConfig } from "@/lib/site";
import { verify } from "@/lib/turnstile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The one place in kirmizi where something leaves the machine.
//
// So it is a door rather than a button: it says what will be sent, where it
// goes, how long it stays and who can see it, and none of that happens until
// the person reading it says go.

export interface ShareClip {
  blob: Blob;
  seconds: number;
  width: number;
  height: number;
}

type Stage =
  | { at: "asking" }
  | { at: "working"; step: string; progress: number }
  | { at: "done"; share: Share }
  | { at: "failed"; reason: string };

function hoursLeft(expiresAt: number): string {
  const hours = Math.max(0, Math.round((expiresAt - Date.now()) / 3600000));
  return hours <= 1 ? "under an hour" : `${hours} hours`;
}

export function ShareDialog({
  open,
  onOpenChange,
  seconds,
  makeClip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Length of the edited clip, for refusing before anything is encoded. */
  seconds: number;
  /** Renders the clip at share size. Called only once the person agrees. */
  makeClip: (onProgress: (fraction: number) => void) => Promise<ShareClip>;
}) {
  const [stage, setStage] = useState<Stage>({ at: "asking" });
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState<string | null>(null);
  /** Bumped to build a fresh widget after one fails. */
  const [attempt, setAttempt] = useState(0);
  const widgetRef = useRef<{ dispose: () => void } | null>(null);

  const tooLong = seconds > SHARE_MAX_SECONDS;
  /** Whether this build can produce a token at all. */
  const mustVerify = !!siteConfig.turnstileSiteKey;

  // Opening starts over. Adjusted on the transition rather than in an effect,
  // so the first paint is already the fresh dialog and not the last one's
  // ending corrected a frame later.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStage({ at: "asking" });
      setCopied(false);
      setToken(null);
      setCheckFailed(null);
    }
  }

  /**
   * Build the widget when its container arrives, not when the dialog opens.
   *
   * The dialog's contents live in a portal, and on the render that opens it
   * the container isn't in the document yet — an effect reading a ref then
   * finds nothing, gives up silently, and leaves no widget and no token. A
   * callback ref runs when the element actually attaches, whenever that is.
   */
  const mountWidget = useCallback((node: HTMLDivElement | null) => {
    widgetRef.current?.dispose();
    widgetRef.current = null;
    if (!node || !siteConfig.turnstileSiteKey) return;
    const widget = verify(node);
    widgetRef.current = widget;
    widget.token.then(
      (value) => setToken(value),
      (error: Error) => setCheckFailed(error.message),
    );
  }, []);

  async function go() {
    if (mustVerify && !token) return;
    setStage({ at: "working", step: "Rendering the clip", progress: 0 });
    try {
      const clip = await makeClip((progress) =>
        setStage({ at: "working", step: "Rendering the clip", progress }),
      );

      setStage({ at: "working", step: "Uploading", progress: 1 });
      const share = await createShare({
        blob: clip.blob,
        seconds: clip.seconds,
        width: clip.width,
        height: clip.height,
        token: token ?? "",
      });
      keepShare(share);
      setStage({ at: "done", share });
    } catch (error) {
      setStage({
        at: "failed",
        reason: error instanceof Error ? error.message : "That didn't work.",
      });
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the link and copy it.");
    }
  }

  async function remove(share: Share) {
    const gone = await deleteShare(share.id, share.deleteToken);
    if (!gone) {
      toast.error("Couldn't delete that link.");
      return;
    }
    forgetShare(share.id);
    toast.success("Link deleted");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share a link</DialogTitle>
          <DialogDescription>
            {stage.at === "done"
              ? "Anyone with the link can watch it."
              : "This is the one thing kirmizi sends anywhere."}
          </DialogDescription>
        </DialogHeader>

        {tooLong ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Links are for clips up to {SHARE_MAX_SECONDS / 60} minutes, and this
            one is {Math.ceil(seconds / 60)}. Cut it down, or download it
            instead — a download has no limit and never leaves your machine.
          </p>
        ) : stage.at === "asking" ? (
          <>
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
              <li>
                A copy is uploaded, rendered smaller than the download —{" "}
                <span className="text-foreground">the recording itself stays here.</span>
              </li>
              <li>
                The link is random and unlisted, but it isn&apos;t a password:{" "}
                <span className="text-foreground">anyone you give it to can watch.</span>
              </li>
              <li>
                It&apos;s <span className="text-foreground">deleted after 24 hours</span>,
                and you can delete it sooner.
              </li>
            </ul>
            {mustVerify && !checkFailed && (
              <div key={attempt} ref={mountWidget} className="min-h-16" />
            )}
            {checkFailed ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {checkFailed}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCheckFailed(null);
                    setToken(null);
                    setAttempt((n) => n + 1);
                  }}
                  className="w-full"
                >
                  Try again
                </Button>
              </div>
            ) : (
              <Button
                onClick={go}
                disabled={mustVerify && !token}
                className="w-full"
              >
                {mustVerify && !token
                  ? "Checking you are a person…"
                  : "Upload and get a link"}
              </Button>
            )}
          </>
        ) : stage.at === "working" ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-red" />
              {stage.step}…
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-red transition-[width] duration-200"
                style={{ width: `${Math.round(stage.progress * 100)}%` }}
              />
            </div>
          </div>
        ) : stage.at === "failed" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted-foreground">{stage.reason}</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl(stage.share.id)}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none"
              />
              <Button size="sm" onClick={() => copy(shareUrl(stage.share.id))} className="gap-1.5">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Deletes itself in {hoursLeft(stage.share.expiresAt)}.
            </p>
            <div className="flex items-center gap-2">
              <a
                href={shareUrl(stage.share.id)}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs",
                  "transition-colors hover:border-foreground/40",
                )}
              >
                <ExternalLink className="size-3.5" />
                Open it
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(stage.share)}
                className="gap-1.5 text-muted-foreground hover:text-red"
              >
                <Trash2 className="size-3.5" />
                Delete now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
