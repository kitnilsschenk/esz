import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { EinreichungDetailAnsicht } from '../components';
import { kurzId } from '../../stammdaten/components/shared';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/einreichungen/:einreichungId`. */
export function EinreichungDetailPage(): ReactNode {
  const { einreichungId } = useParams<{ einreichungId: string }>();

  useBrotkrumen(
    einreichungId !== undefined
      ? [
          { label: t('nachweis.brotkrume.einsparlaeufe'), to: '/nachweis/einsparlaeufe' },
          { label: t('nachweis.brotkrume.einreichung') },
          { label: kurzId(einreichungId) },
        ]
      : [],
  );

  if (einreichungId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <EinreichungDetailAnsicht einreichungId={einreichungId} />;
}

export default EinreichungDetailPage;
