import type { ReactNode } from 'react';
import { useLueckenKachelView } from '../hooks';
import { DashboardKachel } from './DashboardKachel';
import { t } from '../../../shared/i18n/t';

/**
 * Kachel 2 „Endkunden mit Stammdaten-Lücken" (Betriebs-UI-Konzept Punkt 1,
 * Priorität 2 — DE-02, bestehender Rollup). `warnung` (Amber) statt
 * `kritisch` (Rot) — strukturelle Lücken sind weniger zeitkritisch als der
 * TB-04-Datenausfall der ersten Kachel (visuelle Rangfolge spiegelt die
 * fachliche Priorisierung).
 */
export function LueckenKachel(): ReactNode {
  const view = useLueckenKachelView();
  const wert = `${String(view.anzahlEndkunden)}${view.hatWeitere ? '+' : ''}`;

  return (
    <DashboardKachel
      headingId="dashboard-kachel-luecken-heading"
      titel={t('dashboard.kachel.luecken.titel')}
      isPending={view.isPending}
      isError={view.isError}
      ton={view.hatLuecken ? 'warnung' : 'ok'}
      wert={wert}
      beschreibung={t('dashboard.kachel.luecken.beschreibung')}
      ctaLabel={t('dashboard.kachel.luecken.ctaLabel')}
      ctaTo="/monitoring/vollstaendigkeit"
    />
  );
}
