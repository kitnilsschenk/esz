import type { ReactNode } from 'react';
import { AnschlussnutzerTabelle } from '../../components/anschlussnutzer';
import { PageHeader } from '../../components/shared';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/stammdaten/anschlussnutzer` (Muster = `EndkundenListePage`,
 * ADR-0008 §23 / D11 Phase 4c Pass 2). Der „Anlegen"-Link ist für Rollen ohne
 * `betrieb` ausgeblendet (rein kosmetisch — der Server lehnt schreibende
 * Aktionen ohnehin mit 403 ab, `useKannStammdatenAnlegen`).
 */
export function AnschlussnutzerListePage(): ReactNode {
  const kannAnlegen = useKannStammdatenAnlegen();

  return (
    <section aria-labelledby="anschlussnutzer-liste-heading">
      <PageHeader
        headingId="anschlussnutzer-liste-heading"
        title={t('stammdaten.anschlussnutzer.listPage.title')}
        {...(kannAnlegen
          ? {
              createAction: {
                to: '/stammdaten/anschlussnutzer/neu',
                label: t('stammdaten.anschlussnutzer.listPage.createAction'),
              },
            }
          : {})}
      />
      <AnschlussnutzerTabelle />
    </section>
  );
}

export default AnschlussnutzerListePage;
