import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { PreflightDetailAnsicht } from '../components';
import { kurzId } from '../../stammdaten/components/shared';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/preflights/:preflightId`. */
export function PreflightDetailPage(): ReactNode {
  const { preflightId } = useParams<{ preflightId: string }>();

  useBrotkrumen(
    preflightId !== undefined
      ? [
          { label: t('nachweis.brotkrume.foerderjahre'), to: '/nachweis/foerderjahre' },
          { label: t('nachweis.brotkrume.preflight') },
          { label: kurzId(preflightId) },
        ]
      : [],
  );

  if (preflightId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <PreflightDetailAnsicht preflightId={preflightId} />;
}

export default PreflightDetailPage;
