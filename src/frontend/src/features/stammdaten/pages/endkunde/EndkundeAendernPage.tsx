import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { EndkundeAendernFormular } from '../../components/endkunde';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId/aendern` (Feature-Pass B). */
export function EndkundeAendernPage(): ReactNode {
  const { endkundeId } = useParams<{ endkundeId: string }>();

  useBrotkrumen(
    endkundeId !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.bearbeiten')),
        ]
      : [],
  );
  useDocumentTitle(t('stammdaten.endkunde.aendernPage.title'));

  if (endkundeId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return (
    <section aria-labelledby="endkunde-aendern-heading">
      <h1 id="endkunde-aendern-heading">{t('stammdaten.endkunde.aendernPage.title')}</h1>
      <EndkundeAendernFormular endkundeId={endkundeId} />
    </section>
  );
}

export default EndkundeAendernPage;
