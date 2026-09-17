import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../shared';
import { useNutzungsverhaeltnisDetailView } from '../../hooks/nutzungsverhaeltnis';
import { NutzungsverhaeltnisBeendenFormular } from './NutzungsverhaeltnisBeendenFormular';
import { t } from '../../../../shared/i18n/t';

export interface NutzungsverhaeltnisDetailAnsichtProps {
  readonly nutzungsverhaeltnisId: string;
}

/**
 * Nutzungsverhältnis-Detail (`ADR-0008 §23 / D11 Pass 1`): NICHT-PII (nur
 * Beziehungs-Attribute) — alle Felder über `DetailView`s generisches
 * `fields`-Array. Enthält das „Beenden"-Formular nur, solange das
 * Verhältnis noch AKTUELL ist (`gueltigBis === null`); KEIN „Ändern" —
 * das Backend bietet dafür keinen Endpunkt (nur `beenden`).
 */
export function NutzungsverhaeltnisDetailAnsicht({ nutzungsverhaeltnisId }: NutzungsverhaeltnisDetailAnsichtProps): ReactNode {
  const view = useNutzungsverhaeltnisDetailView(nutzungsverhaeltnisId);

  return (
    <DetailView
      headingId="nutzungsverhaeltnis-detail-heading"
      title={t('stammdaten.nutzungsverhaeltnis.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      {view.istBeendet ? (
        <p className="text-sm text-muted-foreground">
          {t('stammdaten.nutzungsverhaeltnis.beendenSection.bereitsBeendetHinweis')}
        </p>
      ) : (
        <NutzungsverhaeltnisBeendenFormular nutzungsverhaeltnisId={nutzungsverhaeltnisId} />
      )}
      <p>
        <Link to="/stammdaten/nutzungsverhaeltnisse" className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.nutzungsverhaeltnis.detailPage.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
