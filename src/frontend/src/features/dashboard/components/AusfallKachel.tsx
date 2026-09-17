import type { ReactNode } from 'react';
import { useAusfallKachelView } from '../hooks';
import { DashboardKachel } from './DashboardKachel';
import { t } from '../../../shared/i18n/t';

/**
 * Kachel 1 „Zähler mit Datenausfall" (Betriebs-UI-Konzept Punkt 1, Priorität
 * 1 — TB-04, sanktionsbewehrt, zeitkritisch). Rot (`ton='kritisch'`), sobald
 * mindestens ein Zähler betroffen ist — bewusst NICHT die strukturelle
 * DE-02-Vollständigkeit (Kachel 2), die ist weniger zeitkritisch.
 */
export function AusfallKachel(): ReactNode {
  const view = useAusfallKachelView();
  const wert = `${String(view.anzahlZaehler)}${view.hatWeitere ? '+' : ''}`;

  return (
    <DashboardKachel
      headingId="dashboard-kachel-ausfall-heading"
      titel={t('dashboard.kachel.ausfall.titel')}
      isPending={view.isPending}
      isError={view.isError}
      ton={view.hatAusfall ? 'kritisch' : 'ok'}
      wert={wert}
      beschreibung={t('dashboard.kachel.ausfall.beschreibung')}
      ctaLabel={t('dashboard.kachel.ausfall.ctaLabel')}
      ctaTo="/monitoring/vollstaendigkeit"
    />
  );
}
