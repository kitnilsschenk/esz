import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BerechnungslaufTabelle } from '../../components/berechnung';
import { PageHeader } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId/berechnungen` (ADR-0006 Betriebs-UI). */
export function BerechnungslaufListePage(): ReactNode {
  const { endkundeId } = useParams<{ endkundeId: string }>();
  // Rein kosmetisch — die Durchsetzung liegt beim `@Roles('betrieb')`-Guard
  // des Servers (dieselbe Linie wie bei „Neu rechnen").
  const kannRechnen = useKannStammdatenAnlegen();

  useBrotkrumen(
    endkundeId !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.berechnungen')),
        ]
      : [],
  );

  if (endkundeId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return (
    <section aria-labelledby="berechnungslauf-liste-heading">
      {/*
        Der Einstieg zum ERSTEN Lauf. Er fehlte bis zuletzt vollstaendig:
        Laeufe entstanden nur serverseitig, und damit brach die Kundenkette
        an ihrer zweiten Stelle ab.
      */}
      <PageHeader
        headingId="berechnungslauf-liste-heading"
        title={t('stammdaten.berechnung.listPage.title')}
        {...(kannRechnen
          ? {
              createAction: {
                to: `/stammdaten/endkunden/${endkundeId}/berechnungen/neu`,
                label: t('stammdaten.berechnung.listPage.anlegenAction'),
              },
            }
          : {})}
      />
      <BerechnungslaufTabelle endkundeId={endkundeId} />
      <p className="mt-6">
        <Link to={`/stammdaten/endkunden/${endkundeId}`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.berechnung.listPage.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default BerechnungslaufListePage;
