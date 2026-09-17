import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AnschlussnutzerDetailAnsicht } from '../../components/anschlussnutzer';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume, kurzId } from '../../components/shared';

/** Route-Container `/stammdaten/anschlussnutzer/:anschlussnutzerId` (Muster = `EndkundeDetailPage`). */
export function AnschlussnutzerDetailPage(): ReactNode {
  const { anschlussnutzerId } = useParams<{ anschlussnutzerId: string }>();

  useBrotkrumen(
    anschlussnutzerId !== undefined
      ? [
          brotkrume.anschlussnutzerListe(),
          brotkrume.aktuell(kurzId(anschlussnutzerId)),
        ]
      : [],
  );

  if (anschlussnutzerId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return <AnschlussnutzerDetailAnsicht anschlussnutzerId={anschlussnutzerId} />;
}

export default AnschlussnutzerDetailPage;
