import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StandortBaumAnsicht } from '../../components/standort';
import { PageHeader } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { useBrotkrumen } from '../../../../shared/routing/useBrotkrumen';
import { brotkrume } from '../../components/shared';

/** Route-Container `/stammdaten/endkunden/:endkundeId/standorte` (ADR-0010). */
export function StandortBaumPage(): ReactNode {
  const { endkundeId } = useParams<{ endkundeId: string }>();

  useBrotkrumen(
    endkundeId !== undefined
      ? [
          brotkrume.endkundenListe(),
          brotkrume.endkunde(endkundeId),
          brotkrume.aktuell(t('stammdaten.common.brotkrume.gebaeudeUndRaeume')),
        ]
      : [],
  );

  if (endkundeId === undefined) {
    return <p role="alert">{t('stammdaten.common.fehler')}</p>;
  }

  return (
    <section aria-labelledby="standort-baum-heading">
      <PageHeader headingId="standort-baum-heading" title={t('stammdaten.standort.baum.pageTitle')} />
      <StandortBaumAnsicht endkundeId={endkundeId} />
      <p className="mt-6">
        <Link to={`/stammdaten/endkunden/${endkundeId}`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.standort.baum.backAction')}
        </Link>
      </p>
    </section>
  );
}

export default StandortBaumPage;
