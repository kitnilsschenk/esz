import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { NutzungsverhaeltnisDetailAnsicht } from '../../components/nutzungsverhaeltnis';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/nutzungsverhaeltnisse/:nutzungsverhaeltnisId` (ADR-0008 §23 / D11 Pass 1). */
export function NutzungsverhaeltnisDetailPage(): ReactNode {
  const { nutzungsverhaeltnisId } = useParams<{ nutzungsverhaeltnisId: string }>();

  useBrotkrumen(
    nutzungsverhaeltnisId !== undefined
      ? [
          brotkrume.nutzungsverhaeltnisseListe(),
          brotkrume.aktuell(kurzId(nutzungsverhaeltnisId)),
        ]
      : [],
  );

  if (nutzungsverhaeltnisId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <NutzungsverhaeltnisDetailAnsicht nutzungsverhaeltnisId={nutzungsverhaeltnisId} />;
}

export default NutzungsverhaeltnisDetailPage;
