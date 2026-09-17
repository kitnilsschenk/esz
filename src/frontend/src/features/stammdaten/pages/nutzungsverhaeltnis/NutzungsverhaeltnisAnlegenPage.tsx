import type { ReactNode } from 'react';
import { NutzungsverhaeltnisAnlegenFormular } from '../../components/nutzungsverhaeltnis';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/nutzungsverhaeltnisse/neu` (ADR-0008 §23 / D11 Pass 1). */
export function NutzungsverhaeltnisAnlegenPage(): ReactNode {
  useDocumentTitle(t('stammdaten.nutzungsverhaeltnis.createPage.title'));
  useBrotkrumen([brotkrume.nutzungsverhaeltnisseListe(), brotkrume.aktuell(t('stammdaten.common.brotkrume.neu'))]);

  return (
    <section aria-labelledby="nutzungsverhaeltnis-anlegen-heading">
      <h1 id="nutzungsverhaeltnis-anlegen-heading">{t('stammdaten.nutzungsverhaeltnis.createPage.title')}</h1>
      <NutzungsverhaeltnisAnlegenFormular />
    </section>
  );
}

export default NutzungsverhaeltnisAnlegenPage;
