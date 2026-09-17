import type { ReactNode } from 'react';
import { NutzungsverhaeltnisseTabelle } from '../../components/nutzungsverhaeltnis';
import { PageHeader } from '../../components/shared';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { Tooltip } from '../../../../shared/ui/tooltip';
import { t } from '../../../../shared/i18n/t';

/**
 * Route-Container `/stammdaten/nutzungsverhaeltnisse` (ADR-0008 §23 / D11
 * Pass 1). Der „Anlegen"-Link ist für Rollen ohne `betrieb` ausgeblendet
 * (rein kosmetisch, `useKannStammdatenAnlegen` — Phase 4c-Feinschliff:
 * Gating jetzt auf ALLEN Listen-Seiten konsistent).
 *
 * Trägt seit dem Nav-Umbau (Betriebs-UI-Konzept Punkt 2/5) ZUSÄTZLICH die
 * Begriffserklärungen zu „Nutzungsverhältnis" UND „Anschlussnutzer" — der
 * bisherige eigene Anschlussnutzer-Nav-Eintrag ist im neuen Nav in
 * „Anschlussnutzer & Verträge" aufgegangen (EIN Link, s. `AppNav.tsx`-
 * Klassen-Dok), diese Seite bleibt der verbleibende Haupt-Zugang für BEIDE
 * Begriffe.
 */
export function NutzungsverhaeltnisseListePage(): ReactNode {
  const kannAnlegen = useKannStammdatenAnlegen();

  return (
    <section aria-labelledby="nutzungsverhaeltnisse-liste-heading">
      <PageHeader
        headingId="nutzungsverhaeltnisse-liste-heading"
        title={t('stammdaten.nutzungsverhaeltnis.listPage.title')}
        {...(kannAnlegen
          ? {
              createAction: {
                to: '/stammdaten/nutzungsverhaeltnisse/neu',
                label: t('stammdaten.nutzungsverhaeltnis.listPage.createAction'),
              },
            }
          : {})}
      />
      <div className="mb-6 flex flex-wrap gap-6">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          {t('stammdaten.nutzungsverhaeltnis.begriffe.nutzungsverhaeltnisLabel')}
          <Tooltip
            text={t('stammdaten.nutzungsverhaeltnis.begriffe.nutzungsverhaeltnisTooltip')}
            label={`${t('nav.tooltipLabelPraefix')} ${t('stammdaten.nutzungsverhaeltnis.begriffe.nutzungsverhaeltnisLabel')}`}
          />
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          {t('stammdaten.nutzungsverhaeltnis.begriffe.anschlussnutzerLabel')}
          <Tooltip
            text={t('stammdaten.nutzungsverhaeltnis.begriffe.anschlussnutzerTooltip')}
            label={`${t('nav.tooltipLabelPraefix')} ${t('stammdaten.nutzungsverhaeltnis.begriffe.anschlussnutzerLabel')}`}
          />
        </span>
      </div>
      <NutzungsverhaeltnisseTabelle />
    </section>
  );
}

export default NutzungsverhaeltnisseListePage;
