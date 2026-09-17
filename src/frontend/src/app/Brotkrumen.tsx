import { useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { abonniereBrotkrumen, leseBrotkrumen } from '../shared/routing/brotkrumenStore';
import { t } from '../shared/i18n/t';

/**
 * Rendert den Brotkrumenpfad der aktuellen Seite (WCAG 2.2 AA 2.4.8
 * „Location", ARIA-APG-Muster „Breadcrumb"): `<nav aria-label>` + `<ol>`,
 * letztes Glied als `aria-current="page"` und NICHT verlinkt.
 *
 * Lebt als Dauerkomponente in `AppShell.tsx` (innerhalb `<main>`, aber
 * außerhalb der `<Routes>`-Kinder, analog `RouteAnnouncer`) — sie wird also
 * nicht bei jedem Routenwechsel neu gemountet.
 *
 * Zeigt nur an, was zur AKTUELLEN Route gehört: Der Store hält das Paar
 * (Pfad, Krumen), und ein nicht passender Eintrag wird verworfen statt
 * angezeigt (s. `brotkrumenStore.ts`). Seiten ohne gemeldeten Pfad — die
 * Startseite und die Listen-Seiten, deren Ort die Navigation bereits
 * markiert — rendern hier gar nichts.
 *
 * Die Trenner sind `aria-hidden`: Ein Screenreader liest die `<ol>`-Struktur
 * ohnehin als geordnete Liste vor; vorgelesene „Größer-als"-Zeichen wären
 * reines Rauschen.
 */
export function Brotkrumen(): ReactNode {
  const { pathname } = useLocation();
  const zustand = useSyncExternalStore(abonniereBrotkrumen, leseBrotkrumen, leseBrotkrumen);

  if (zustand.pfad !== pathname || zustand.krumen.length === 0) {
    return null;
  }

  return (
    <nav aria-label={t('app.brotkrumen.ariaLabel')} className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {zustand.krumen.map((krume, index) => {
          const istLetzte = index === zustand.krumen.length - 1;
          return (
            <li key={`${krume.to ?? 'aktuell'}-${krume.label}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />}
              {krume.to !== undefined && !istLetzte ? (
                <Link to={krume.to} className="rounded-sm text-link underline-offset-4 hover:underline">
                  {krume.label}
                </Link>
              ) : (
                <span {...(istLetzte ? { 'aria-current': 'page' as const } : {})} className="text-foreground">
                  {krume.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
