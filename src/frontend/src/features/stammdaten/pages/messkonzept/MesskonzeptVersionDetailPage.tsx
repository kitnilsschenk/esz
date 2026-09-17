import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { MesskonzeptVersionDetailAnsicht } from '../../components/messkonzept';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId/messkonzept/versionen/:versionNr` (ADR-0008 §23 / D11 Phase 4c Pass 2). */
export function MesskonzeptVersionDetailPage(): ReactNode {
  const { endkundeId, versionNr } = useParams<{ endkundeId: string; versionNr: string }>();
  const versionNrZahl = versionNr !== undefined ? Number(versionNr) : Number.NaN;

  useBrotkrumen(
    endkundeId !== undefined && versionNr !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.messkonzept')),
          brotkrume.aktuell(`${t('stammdaten.common.brotkrume.versionPraefix')} ${versionNr}`),
        ]
      : [],
  );

  if (endkundeId === undefined || versionNr === undefined || Number.isNaN(versionNrZahl)) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <MesskonzeptVersionDetailAnsicht endkundeId={endkundeId} versionNr={versionNrZahl} />;
}

export default MesskonzeptVersionDetailPage;
