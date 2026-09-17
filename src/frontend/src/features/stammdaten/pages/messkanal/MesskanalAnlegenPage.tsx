import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MesskanalAnlegenFormular } from '../../components/messkanal';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/zaehler/:zaehlerId/messkanaele/neu` (ADR-0008 §23 / D11 Pass 1). */
export function MesskanalAnlegenPage(): ReactNode {
  const { zaehlerId } = useParams<{ zaehlerId: string }>();

  useBrotkrumen(
    zaehlerId !== undefined
      ? [
          brotkrume.zaehlerListe(),
          brotkrume.zaehler(zaehlerId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.neuerMesskanal')),
        ]
      : [],
  );
  useDocumentTitle(t('stammdaten.messkanal.createPage.title'));

  if (zaehlerId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return (
    <section aria-labelledby="messkanal-anlegen-heading">
      <h1 id="messkanal-anlegen-heading">{t('stammdaten.messkanal.createPage.title')}</h1>
      <MesskanalAnlegenFormular zaehlerId={zaehlerId} />
      <p>
        <Link to={`/stammdaten/zaehler/${zaehlerId}`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.messkanal.createPage.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default MesskanalAnlegenPage;
