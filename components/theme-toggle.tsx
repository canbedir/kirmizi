"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Both icons are always rendered; the `.dark` class decides which one shows,
  // so there is no hydration mismatch and no mount guard needed.
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden size-[1.15rem] dark:block" />
      <Moon className="size-[1.15rem] dark:hidden" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
