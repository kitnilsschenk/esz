import type { ReactNode } from 'react';
import { FoerderjahrTabelle } from '../components';
import { PageHeader } from '../../stammdaten/components/shared';
import { useKannNachweisFuehren } from '../hooks';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/foerderjahre` — Einstieg in die Nachweis-Kette (ADR-0007). */
export function FoerderjahrListePage(): ReactNode {
  const kannAnlegen = useKannNachweisFuehren();

  useBrotkrumen([{ label: t('nachweis.brotkrume.foerderjahre') }]);

  return (
    <section aria-labelledby="foerderjahr-liste-heading">
      <PageHeader
        headingId="foerderjahr-liste-heading"
        title={t('nachweis.foerderjahr.listPage.title')}
        {...(kannAnlegen
          ? { createAction: { to: '/nachweis/foerderjahre/neu', label: t('nachweis.foerderjahr.listPage.createAction') } }
          : {})}
      />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('nachweis.foerderjahr.listPage.einfuehrung')}</p>
        <FoerderjahrTabelle />
      </div>
    </section>
  );
}

export default FoerderjahrListePage;
