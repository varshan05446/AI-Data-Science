"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/dropdown-menu";

/** Light / dark / system theme switcher. */
export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          {mounted ? (
            <>
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </>
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      }
    >
      <DropdownItem onClick={() => setTheme("light")}>
        <Sun className="h-4 w-4" /> Light
      </DropdownItem>
      <DropdownItem onClick={() => setTheme("dark")}>
        <Moon className="h-4 w-4" /> Dark
      </DropdownItem>
      <DropdownItem onClick={() => setTheme("system")}>
        <Monitor className="h-4 w-4" /> System
      </DropdownItem>
    </DropdownMenu>
  );
}
