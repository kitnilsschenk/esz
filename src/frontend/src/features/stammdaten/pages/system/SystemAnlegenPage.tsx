import type { ReactNode } from 'react';
import { SystemAnlegenFormular } from '../../components/system';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/systeme/neu` (ADR-0008 §23 / D11 Pass 1). */
export function SystemAnlegenPage(): ReactNode {
  useDocumentTitle(t('stammdaten.system.createPage.title'));
  useBrotkrumen([brotkrume.systemeListe(), brotkrume.aktuell(t('stammdaten.common.brotkrume.neu'))]);

  return (
    <section aria-labelledby="system-anlegen-heading">
      <h1 id="system-anlegen-heading">{t('stammdaten.system.createPage.title')}</h1>
      <SystemAnlegenFormular />
    </section>
  );
}

export default SystemAnlegenPage;
