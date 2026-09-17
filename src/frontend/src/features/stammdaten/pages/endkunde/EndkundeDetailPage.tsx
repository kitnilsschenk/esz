import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { EndkundeDetailAnsicht } from '../../components/endkunde';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId` (Referenz-Muster ADR-0008 §23 / D11). */
export function EndkundeDetailPage(): ReactNode {
  const { endkundeId } = useParams<{ endkundeId: string }>();

  useBrotkrumen(endkundeId !== undefined ? [brotkrume.endkundenListe(), brotkrume.aktuell(kurzId(endkundeId))] : []);

  if (endkundeId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <EndkundeDetailAnsicht endkundeId={endkundeId} />;
}

export default EndkundeDetailPage;
