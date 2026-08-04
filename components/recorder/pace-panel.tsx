"use client";

import { Scissors } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { DeadAirReport } from "@/lib/dead-air";
import { Button } from "@/components/ui/button";

// Which signals the answer rests on is worth saying out loud: it's the
// difference between a cut you trust and one you have to check.

function basis(used: DeadAirReport["used"]): string {
  if (used.sound && used.pointer) return "quiet, and the pointer parked";
  if (used.sound) return "quiet — no pointer data to go on";
  return "the pointer parked — nothing was recorded to listen to";
}

export function PacePanel({
  report,
  measuring,
  onTighten,
}: {
  report: DeadAirReport;
  measuring: boolean;
  onTighten: () => void;
}) {
  const count = report.ranges.length;
  const note = measuring
    ? "listening through the recording…"
    : count === 0
      ? "Nothing sitting still long enough to be worth cutting."
      : `${count === 1 ? "One stretch" : `${count} stretches`} ${basis(report.used)}.`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Pace
        </span>

        <Button
          size="sm"
          variant="outline"
          onClick={onTighten}
          disabled={measuring || count === 0}
          className="gap-1.5"
          title="Cut the stretches where nothing is happening"
        >
          <Scissors className="size-3.5" />
          Tighten
          {count > 0 && (
            <span className="font-mono text-[11px] text-red">
              −{formatDuration(report.removed * 1000)}
            </span>
          )}
        </Button>

        <span className="ml-auto font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {note}
        </span>
      </div>
    </div>
  );
}
