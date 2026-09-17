import type { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '../ui/button';
import { useTheme } from './useTheme';
import { t } from '../i18n/t';

/**
 * Dark-/Light-Mode-Umschalter (Topbar, Phase 4c-Feinschliff, Design-System
 * „Icons": Lucide, `h-4 w-4`). Zeigt das Icon des AKTUELL aktiven Modus
 * (`Sun` = hell, `Moon` = dunkel); `aria-label` benennt die Wechsel-Aktion
 * (das jeweils ANDERE Schema) — analog einem Play/Pause-Umschalter ändert
 * sich der zugängliche Name mit dem Zustand, das ist hier beabsichtigt.
 */
export function ThemeToggle(): ReactNode {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? t('app.theme.zuHell') : t('app.theme.zuDunkel');

  return (
    <Button type="button" variant="ghost" size="icon" onClick={toggleTheme} aria-label={label}>
      {theme === 'dark' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </Button>
  );
}
