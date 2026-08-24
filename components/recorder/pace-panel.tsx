"use client";

import { Scissors } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { DeadAirReport } from "@/lib/dead-air";
import { Button } from "@/components/ui/button";

// Tightening is a cut, not a setting, so it sits with the other cutting —
// which leaves it a button on the toolbar rather than a panel of its own.
//
// Which signals the answer rests on is worth saying out loud: it's the
// difference between a cut you trust and one you have to check. There's no
// room for that on a toolbar, so it goes in the button's own tooltip, where
// somebody wondering whether to trust the number can find it.

function basis(used: DeadAirReport["used"]): string {
  if (used.sound && used.pointer) return "quiet, and the pointer parked";
  if (used.sound) return "quiet — no pointer data to go on";
  return "the pointer parked — nothing was recorded to listen to";
}

export function TightenButton({
  report,
  measuring,
  onTighten,
}: {
  report: DeadAirReport;
  measuring: boolean;
  onTighten: () => void;
}) {
  const count = report.ranges.length;
  const title = measuring
    ? "Listening through the recording…"
    : count === 0
      ? "Nothing sitting still long enough to be worth cutting."
      : `${count === 1 ? "One stretch" : `${count} stretches`} ${basis(report.used)}.`;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onTighten}
      disabled={measuring || count === 0}
      className="gap-1.5"
      title={title}
    >
      <Scissors className="size-3.5" />
      Tighten
      {count > 0 && (
        <span className="font-mono text-[11px] text-red">
          −{formatDuration(report.removed * 1000)}
        </span>
      )}
    </Button>
  );
}
