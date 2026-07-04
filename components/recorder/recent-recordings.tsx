"use client";

import { Download, Film, History, Trash2 } from "lucide-react";
import type { RecordingMeta } from "@/lib/recordings-store";
import { formatBytes, formatDuration } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentRecordingsDialog({
  items,
  onOpen,
  onDownload,
  onDelete,
}: {
  items: RecordingMeta[];
  onOpen: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <History className="size-4" />
        Recent recordings
        <span className="rounded-full bg-red/10 px-1.5 py-0.5 font-mono text-xs text-red">
          {items.length}
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recent recordings</DialogTitle>
          <DialogDescription>
            Kept on this device only — never uploaded.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 pr-2"
            >
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg p-2 text-left transition-colors hover:bg-red/5"
              >
                {item.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.cover}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-20 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
                    <Film className="size-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {formatWhen(item.createdAt)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(item.durationMs)} · {formatBytes(item.size)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDownload(item.id)}
                aria-label="Download"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <Download className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label="Delete"
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-red"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
