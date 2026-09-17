import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BerechnungslaufAnlegenFormular } from '../../components/berechnung';
import { PageHeader, brotkrume } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';

/** Route-Container `/stammdaten/endkunden/:endkundeId/berechnungen/neu`. */
export function BerechnungslaufAnlegenPage(): ReactNode {
  const { endkundeId } = useParams<{ endkundeId: string }>();

  useBrotkrumen(
    endkundeId !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.berechnungAnlegen')),
        ]
      : [],
  );

  if (endkundeId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return (
    <section aria-labelledby="berechnungslauf-anlegen-heading">
      <PageHeader
        headingId="berechnungslauf-anlegen-heading"
        title={t('stammdaten.berechnung.anlegenPage.title')}
      />
      <BerechnungslaufAnlegenFormular endkundeId={endkundeId} />
      <p className="mt-6">
        <Link
          to={`/stammdaten/endkunden/${endkundeId}/berechnungen`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.berechnung.anlegenPage.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default BerechnungslaufAnlegenPage;
