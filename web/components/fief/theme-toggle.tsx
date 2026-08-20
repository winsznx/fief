'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/**
 * Theme toggle (D7 — dark default, full light theme also ships).
 *
 * Which icon is shown is decided by CSS via the `dark:` variant, not by React
 * state. That avoids both the hydration mismatch (the server cannot know the
 * resolved theme) and the mounted-flag effect, which the React Compiler rules
 * in Next 16 flag as a cascading render. It also renders correctly before
 * hydration.
 *
 * `resolvedTheme` is read inside the click handler only — never during render.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </Button>
  );
}
