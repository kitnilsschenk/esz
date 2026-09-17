import type { ReactNode } from 'react';
import { EndkundeAnlegenFormular } from '../../components/endkunde';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/neu` (Referenz-Muster ADR-0008 §23 / D11). */
export function EndkundeAnlegenPage(): ReactNode {
  useDocumentTitle(t('stammdaten.endkunde.createPage.title'));
  useBrotkrumen([brotkrume.endkundenListe(), brotkrume.aktuell(t('stammdaten.common.brotkrume.neu'))]);

  return (
    <section aria-labelledby="endkunde-anlegen-heading">
      <h1 id="endkunde-anlegen-heading">{t('stammdaten.endkunde.createPage.title')}</h1>
      <EndkundeAnlegenFormular />
    </section>
  );
}

export default EndkundeAnlegenPage;
