import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { BerechnungslaufDetailAnsicht } from '../../components/berechnung';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId/berechnungen/:laufId` (ADR-0006 Betriebs-UI). */
export function BerechnungslaufDetailPage(): ReactNode {
  const { endkundeId, laufId } = useParams<{ endkundeId: string; laufId: string }>();

  useBrotkrumen(
    endkundeId !== undefined && laufId !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          { label: t('stammdaten.common.brotkrume.berechnungen'), to: `/stammdaten/endkunden/${endkundeId}/berechnungen` },
          brotkrume.aktuell(kurzId(laufId)),
        ]
      : [],
  );

  if (endkundeId === undefined || laufId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <BerechnungslaufDetailAnsicht endkundeId={endkundeId} laufId={laufId} />;
}

export default BerechnungslaufDetailPage;
