import type { ReactNode } from 'react';
import { useNutzerinfoKachelView } from '../hooks/useNutzerinfoKachelView';
import { DashboardKachel } from './DashboardKachel';
import { t } from '../../../shared/i18n/t';

/**
 * Kachel „Monatliche Nutzerinformation" (TB-06).
 *
 * **Warum sie kritisch wird, wenn NICHTS erzeugt wurde.** Der stille Fehler
 * dieser Auflage ist nicht die falsche Zahl, sondern der vergessene Monat:
 * „mindestens monatlich" verlangt jemanden, der daran denkt. Eine Kachel, die
 * bei null Informationen freundlich grau bliebe, waere genau die Erinnerung,
 * die nicht erinnert.
 *
 * Offene Zustellungen sind ebenfalls kritisch — erzeugen ist nicht
 * informieren. Gruen wird die Kachel erst, wenn der Monat wirklich durch ist.
 */
export function NutzerinfoKachel(): ReactNode {
  const view = useNutzerinfoKachelView();
  const istKritisch = view.nichtsErzeugt || view.anzahlOffen > 0;

  return (
    <DashboardKachel
      headingId="dashboard-kachel-nutzerinfo-heading"
      titel={`${t('dashboard.kachel.nutzerinfo.titel')}${view.monatLabel === '' ? '' : ` · ${view.monatLabel}`}`}
      isPending={view.isPending}
      isError={view.isError}
      ton={istKritisch ? 'kritisch' : 'ok'}
      wert={view.nichtsErzeugt ? '—' : String(view.anzahlOffen)}
      beschreibung={view.beschreibung}
      ctaLabel={t('dashboard.kachel.nutzerinfo.ctaLabel')}
      ctaTo="/nutzerinfo/laeufe"
    />
  );
}
