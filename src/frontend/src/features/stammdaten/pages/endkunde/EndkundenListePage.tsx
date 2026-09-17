import type { ReactNode } from 'react';
import { EndkundenTabelle } from '../../components/endkunde';
import { PageHeader } from '../../components/shared';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/stammdaten/endkunden` (Referenz-Muster ADR-0008 §23 /
 * D11). Route-Container bleiben dünn: nur Überschrift + Navigation +
 * Einbettung der Feature-Komponente, keine eigene Datenlogik. Der
 * „Anlegen"-Link ist für Rollen ohne `betrieb` ausgeblendet (rein
 * kosmetisch — der Server lehnt schreibende Aktionen ohnehin mit 403 ab,
 * `useKannStammdatenAnlegen`; Phase 4c-Feinschliff: Gating jetzt auf ALLEN
 * Listen-Seiten konsistent, vorher nur bei Anschlussnutzer/Messkonzept).
 */
export function EndkundenListePage(): ReactNode {
  const kannAnlegen = useKannStammdatenAnlegen();

  return (
    <section aria-labelledby="endkunden-liste-heading">
      <PageHeader
        headingId="endkunden-liste-heading"
        title={t('stammdaten.endkunde.listPage.title')}
        {...(kannAnlegen
          ? { createAction: { to: '/stammdaten/endkunden/neu', label: t('stammdaten.endkunde.listPage.createAction') } }
          : {})}
      />
      <EndkundenTabelle />
    </section>
  );
}

// `React.lazy` (Route-Split, `.claude/rules/frontend-react.md`) braucht einen
// Default-Export je Seiten-Modul.
export default EndkundenListePage;
