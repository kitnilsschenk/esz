import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ZaehlerDetailAnsicht } from '../../components/zaehler';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/zaehler/:zaehlerId` (ADR-0008 §23 / D11 Pass 1). */
export function ZaehlerDetailPage(): ReactNode {
  const { zaehlerId } = useParams<{ zaehlerId: string }>();

  useBrotkrumen(zaehlerId !== undefined ? [brotkrume.zaehlerListe(), brotkrume.aktuell(kurzId(zaehlerId))] : []);

  if (zaehlerId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <ZaehlerDetailAnsicht zaehlerId={zaehlerId} />;
}

export default ZaehlerDetailPage;
