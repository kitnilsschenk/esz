import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { NachweisExportDetailAnsicht } from '../components';
import { kurzId } from '../../stammdaten/components/shared';
import { useBrotkrumen } from '../../../shared/routing/useBrotkrumen';
import { t } from '../../../shared/i18n/t';

/** Route-Container `/nachweis/exporte/:exportId`. */
export function NachweisExportDetailPage(): ReactNode {
  const { exportId } = useParams<{ exportId: string }>();

  useBrotkrumen(
    exportId !== undefined
      ? [
          { label: t('nachweis.brotkrume.einsparlaeufe'), to: '/nachweis/einsparlaeufe' },
          { label: t('nachweis.brotkrume.export') },
          { label: kurzId(exportId) },
        ]
      : [],
  );

  if (exportId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <NachweisExportDetailAnsicht exportId={exportId} />;
}

export default NachweisExportDetailPage;
