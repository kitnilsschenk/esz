import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useKannStammdatenAnlegen } from '../../stammdaten/hooks/shared/useKannStammdatenAnlegen';
import { buttonVariants } from '../../../shared/ui/button';
import { t } from '../../../shared/i18n/t';

/**
 * Schnellzugriffe (Betriebs-UI-Konzept Punkt 1, Priorität 4) — Buttons statt
 * Untermenü, rollen-gated über `useKannStammdatenAnlegen` (rein kosmetisch,
 * die Backend-Guards bleiben die alleinige Durchsetzungsinstanz). Rendert
 * als echte `react-router-dom`-`Link`s eingefärbt über `buttonVariants()`
 * (kein `Button asChild`, s. `PageHeader.tsx`-Klassen-Dok).
 */
export function Schnellzugriffe(): ReactNode {
  const kannAnlegen = useKannStammdatenAnlegen();

  if (!kannAnlegen) {
    return null;
  }

  return (
    <section aria-labelledby="dashboard-schnellzugriffe-heading">
      <h2 id="dashboard-schnellzugriffe-heading" className="mb-3 text-base font-bold text-foreground">
        {t('dashboard.schnellzugriffe.titel')}
      </h2>
      <div className="flex flex-wrap gap-3">
        <Link to="/stammdaten/endkunden/neu" className={buttonVariants({ variant: 'outline' })}>
          {t('dashboard.schnellzugriffe.neuerEndkunde')}
        </Link>
        <Link to="/stammdaten/zaehler/neu" className={buttonVariants({ variant: 'outline' })}>
          {t('dashboard.schnellzugriffe.neuerZaehler')}
        </Link>
        <Link to="/stammdaten/standorte" className={buttonVariants({ variant: 'outline' })}>
          {t('dashboard.schnellzugriffe.zaehlerVerorten')}
        </Link>
      </div>
    </section>
  );
}
