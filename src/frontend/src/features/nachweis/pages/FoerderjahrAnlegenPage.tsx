import type { ReactNode } from 'react';
import { FoerderjahrAnlegenFormular } from '../components';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/foerderjahre/neu`. */
export function FoerderjahrAnlegenPage(): ReactNode {
  useDocumentTitle(t('nachweis.foerderjahr.createPage.title'));
  useBrotkrumen([
    { label: t('nachweis.brotkrume.foerderjahre'), to: '/nachweis/foerderjahre' },
    { label: t('nachweis.brotkrume.neu') },
  ]);

  return (
    <section aria-labelledby="foerderjahr-anlegen-heading">
      <h1 id="foerderjahr-anlegen-heading" className="mb-6 text-xl font-bold text-foreground">
        {t('nachweis.foerderjahr.createPage.title')}
      </h1>
      <FoerderjahrAnlegenFormular />
    </section>
  );
}

export default FoerderjahrAnlegenPage;
