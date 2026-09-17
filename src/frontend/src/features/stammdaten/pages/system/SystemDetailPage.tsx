import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { SystemDetailAnsicht } from '../../components/system';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/systeme/:systemId` (ADR-0008 §23 / D11 Pass 1). */
export function SystemDetailPage(): ReactNode {
  const { systemId } = useParams<{ systemId: string }>();

  useBrotkrumen(systemId !== undefined ? [brotkrume.systemeListe(), brotkrume.aktuell(kurzId(systemId))] : []);

  if (systemId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <SystemDetailAnsicht systemId={systemId} />;
}

export default SystemDetailPage;
