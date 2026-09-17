import type { ReactNode } from 'react';
import { AnschlussnutzerAnlegenFormular } from '../../components/anschlussnutzer';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/anschlussnutzer/neu` (Muster = `EndkundeAnlegenPage`). */
export function AnschlussnutzerAnlegenPage(): ReactNode {
  useDocumentTitle(t('stammdaten.anschlussnutzer.createPage.title'));
  useBrotkrumen([brotkrume.anschlussnutzerListe(), brotkrume.aktuell(t('stammdaten.common.brotkrume.neu'))]);

  return (
    <section aria-labelledby="anschlussnutzer-anlegen-heading">
      <h1 id="anschlussnutzer-anlegen-heading">{t('stammdaten.anschlussnutzer.createPage.title')}</h1>
      <AnschlussnutzerAnlegenFormular />
    </section>
  );
}

export default AnschlussnutzerAnlegenPage;
