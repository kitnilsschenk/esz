import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { MesskanalDetailAnsicht } from '../../components/messkanal';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/messkanaele/:messkanalId` (ADR-0008 §23 / D11 Pass 1). */
export function MesskanalDetailPage(): ReactNode {
  const { messkanalId } = useParams<{ messkanalId: string }>();

  useBrotkrumen(messkanalId !== undefined ? [brotkrume.zaehlerListe(), brotkrume.aktuell(kurzId(messkanalId))] : []);

  if (messkanalId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <MesskanalDetailAnsicht messkanalId={messkanalId} />;
}

export default MesskanalDetailPage;
