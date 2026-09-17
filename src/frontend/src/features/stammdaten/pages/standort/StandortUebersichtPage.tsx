import type { ReactNode } from 'react';
import { StandortUebersichtAnsicht } from '../../components/standort';
import { PageHeader } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/stammdaten/standorte` (globaler Einstiegspunkt, ADR-0010
 * Auffindbarkeits-Nachtrag). Dünne Seite: nur Überschrift + Einbettung der
 * Feature-Komponente, analog `StandortBaumPage` (Sub-Ressourcen-Variante,
 * bleibt unverändert bestehen).
 */
export function StandortUebersichtPage(): ReactNode {
  return (
    <section aria-labelledby="standort-uebersicht-heading">
      <PageHeader headingId="standort-uebersicht-heading" title={t('stammdaten.standort.uebersicht.pageTitle')} />
      <StandortUebersichtAnsicht />
    </section>
  );
}

export default StandortUebersichtPage;
