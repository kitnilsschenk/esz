import type { ReactNode } from 'react';
import { SystemeTabelle } from '../../components/system';
import { PageHeader } from '../../components/shared';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/stammdaten/systeme` (ADR-0008 §23 / D11 Pass 1). Der
 * „Anlegen"-Link ist für Rollen ohne `betrieb` ausgeblendet (rein
 * kosmetisch, `useKannStammdatenAnlegen` — Phase 4c-Feinschliff: Gating
 * jetzt auf ALLEN Listen-Seiten konsistent).
 */
export function SystemeListePage(): ReactNode {
  const kannAnlegen = useKannStammdatenAnlegen();

  return (
    <section aria-labelledby="systeme-liste-heading">
      <PageHeader
        headingId="systeme-liste-heading"
        title={t('stammdaten.system.listPage.title')}
        {...(kannAnlegen
          ? { createAction: { to: '/stammdaten/systeme/neu', label: t('stammdaten.system.listPage.createAction') } }
          : {})}
      />
      <SystemeTabelle />
    </section>
  );
}

// `React.lazy` (Route-Split, `.claude/rules/frontend-react.md`) braucht einen
// Default-Export je Seiten-Modul.
export default SystemeListePage;
