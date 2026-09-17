import type { ReactNode } from 'react';
import { BerechnungUebersichtAnsicht } from '../../components/berechnung';
import { PageHeader } from '../../components/shared';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/berechnung/laeufe` — globaler Einstiegspunkt in Baseline
 * und Einsparung. Dünne Seite: Überschrift + Feature-Komponente, analog
 * `StandortUebersichtPage`.
 */
export function BerechnungUebersichtPage(): ReactNode {
  useBrotkrumen([{ label: t('stammdaten.berechnung.uebersicht.pageTitle') }]);

  return (
    <section aria-labelledby="berechnung-uebersicht-heading">
      <PageHeader
        headingId="berechnung-uebersicht-heading"
        title={t('stammdaten.berechnung.uebersicht.pageTitle')}
      />
      <BerechnungUebersichtAnsicht />
    </section>
  );
}

export default BerechnungUebersichtPage;
