import type { ReactNode } from 'react';
import { ZaehlerAnlegenFormular } from '../../components/zaehler';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/zaehler/neu` (ADR-0008 §23 / D11 Pass 1). */
export function ZaehlerAnlegenPage(): ReactNode {
  useDocumentTitle(t('stammdaten.zaehler.createPage.title'));
  useBrotkrumen([brotkrume.zaehlerListe(), brotkrume.aktuell(t('stammdaten.common.brotkrume.neu'))]);

  return (
    <section aria-labelledby="zaehler-anlegen-heading">
      <h1 id="zaehler-anlegen-heading">{t('stammdaten.zaehler.createPage.title')}</h1>
      <ZaehlerAnlegenFormular />
    </section>
  );
}

export default ZaehlerAnlegenPage;
