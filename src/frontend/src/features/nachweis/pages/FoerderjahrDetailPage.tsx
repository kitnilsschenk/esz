import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { FoerderjahrDetailAnsicht } from '../components';
import { kurzId } from '../../stammdaten/components/shared';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/foerderjahre/:foerderjahrId`. */
export function FoerderjahrDetailPage(): ReactNode {
  const { foerderjahrId } = useParams<{ foerderjahrId: string }>();

  useBrotkrumen(
    foerderjahrId !== undefined
      ? [
          { label: t('nachweis.brotkrume.foerderjahre'), to: '/nachweis/foerderjahre' },
          { label: kurzId(foerderjahrId) },
        ]
      : [],
  );

  if (foerderjahrId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <FoerderjahrDetailAnsicht foerderjahrId={foerderjahrId} />;
}

export default FoerderjahrDetailPage;
