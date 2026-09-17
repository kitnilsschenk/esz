import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { EinsparlaufDetailAnsicht } from '../components';
import { kurzId } from '../../stammdaten/components/shared';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/einsparlaeufe/:einsparlaufId`. */
export function EinsparlaufDetailPage(): ReactNode {
  const { einsparlaufId } = useParams<{ einsparlaufId: string }>();

  useBrotkrumen(
    einsparlaufId !== undefined
      ? [
          { label: t('nachweis.brotkrume.einsparlaeufe'), to: '/nachweis/einsparlaeufe' },
          { label: kurzId(einsparlaufId) },
        ]
      : [],
  );

  if (einsparlaufId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <EinsparlaufDetailAnsicht einsparlaufId={einsparlaufId} />;
}

export default EinsparlaufDetailPage;
