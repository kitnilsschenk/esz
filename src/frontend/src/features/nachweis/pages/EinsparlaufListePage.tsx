import type { ReactNode } from 'react';
import { EinsparlaufFilterLeiste, EinsparlaufTabelle } from '../components';
import { PageHeader } from '../../stammdaten/components/shared';
import { useEinsparlaufFilterView } from '../hooks';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/**
 * Route-Container `/nachweis/einsparlaeufe` — die portfolioweite Liste aller
 * Einspar-Läufe.
 *
 * Es gibt hier bewusst KEINE „Einspar-Lauf starten"-Aktion: Ein Lauf entsteht
 * immer aus einer bestimmten Vollständigkeitsprüfung, deren Ergebnis
 * bestimmt, was zulässig ist. Der Weg dorthin führt über das Förderjahr.
 */
export function EinsparlaufListePage(): ReactNode {
  const filterView = useEinsparlaufFilterView();

  useBrotkrumen([{ label: t('nachweis.brotkrume.einsparlaeufe') }]);

  return (
    <section aria-labelledby="einsparlauf-liste-heading">
      <PageHeader headingId="einsparlauf-liste-heading" title={t('nachweis.einsparlauf.listPage.title')} />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('nachweis.einsparlauf.listPage.einfuehrung')}</p>
        <EinsparlaufFilterLeiste filterView={filterView} />
        <EinsparlaufTabelle filter={filterView.filter} />
      </div>
    </section>
  );
}

export default EinsparlaufListePage;
