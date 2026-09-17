import type { ReactNode } from 'react';
import { ZaehlerTabelle } from '../../components/zaehler';
import { PageHeader } from '../../components/shared';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/stammdaten/zaehler` (ADR-0008 §23 / D11 Pass 1). Der
 * „Anlegen"-Link ist für Rollen ohne `betrieb` ausgeblendet (rein
 * kosmetisch, `useKannStammdatenAnlegen` — Phase 4c-Feinschliff: Gating
 * jetzt auf ALLEN Listen-Seiten konsistent).
 */
export function ZaehlerListePage(): ReactNode {
  const kannAnlegen = useKannStammdatenAnlegen();

  return (
    <section aria-labelledby="zaehler-liste-heading">
      <PageHeader
        headingId="zaehler-liste-heading"
        title={t('stammdaten.zaehler.listPage.title')}
        {...(kannAnlegen
          ? { createAction: { to: '/stammdaten/zaehler/neu', label: t('stammdaten.zaehler.listPage.createAction') } }
          : {})}
      />
      <ZaehlerTabelle />
    </section>
  );
}

export default ZaehlerListePage;
