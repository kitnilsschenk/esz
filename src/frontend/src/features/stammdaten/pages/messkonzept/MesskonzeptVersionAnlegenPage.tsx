import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MesskonzeptVersionAnlegenFormular } from '../../components/messkonzept';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId/messkonzept/versionen/neu` (ADR-0008 §23 / D11 Phase 4c Pass 2). */
export function MesskonzeptVersionAnlegenPage(): ReactNode {
  const { endkundeId } = useParams<{ endkundeId: string }>();

  useBrotkrumen(
    endkundeId !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.messkonzept')),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.neueVersion')),
        ]
      : [],
  );
  useDocumentTitle(t('stammdaten.messkonzept.createPage.title'));

  if (endkundeId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return (
    <section aria-labelledby="messkonzept-version-anlegen-heading">
      <h1 id="messkonzept-version-anlegen-heading">{t('stammdaten.messkonzept.createPage.title')}</h1>
      <MesskonzeptVersionAnlegenFormular endkundeId={endkundeId} />
      <p>
        <Link to={`/stammdaten/endkunden/${endkundeId}`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.messkonzept.createPage.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default MesskonzeptVersionAnlegenPage;
