import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../../stammdaten/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useKannNachweisFuehren, useNachweisExportDetailView, useExportEinreichbarkeitView } from '../hooks';
import { NachweisExportDateienTabelle } from './NachweisExportDateienTabelle';
import { EinreichungVermerkenFormular } from './EinreichungVermerkenFormular';
import { t } from '../../../shared/i18n/t';

export interface NachweisExportDetailAnsichtProps {
  readonly exportId: string;
}

/**
 * Export-Detail: Kopfdaten samt Prüfsummen, die Dateiliste mit Abruf je
 * Datei — und der letzte Schritt der Kette, der Einreichungs-Vermerk.
 *
 * Diese Ansicht ist dem Betriebs-Team vorbehalten; für die Auditor-Rolle
 * antwortet der Server hier mit einer Ablehnung. Die Oberfläche sagt das
 * vorab, statt eine Fehlerseite zu zeigen.
 *
 * Der Einreichungs-Abschnitt zeigt entweder das Formular oder den Grund,
 * warum kein Vermerk möglich ist. Ein Formular, das beim Absenden sicher
 * scheitert, wäre schlechter als eine klare Auskunft davor.
 */
export function NachweisExportDetailAnsicht({ exportId }: NachweisExportDetailAnsichtProps): ReactNode {
  const kannLesen = useKannNachweisFuehren();
  const view = useNachweisExportDetailView(exportId);
  const einreichbarkeit = useExportEinreichbarkeitView(view.einsparlaufId);
  // Einmal je Seitenaufruf bestimmt — sonst wanderte die Vorbelegung des
  // Übermittlungs-Zeitpunkts bei jedem Render weiter.
  const jetztIso = useMemo(() => new Date().toISOString(), []);

  if (!kannLesen) {
    return <p role="alert">{t('nachweis.gemeinsam.zugriffVerweigert')}</p>;
  }

  return (
    <DetailView
      headingId="nachweis-export-detail-heading"
      title={t('nachweis.export.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <section aria-labelledby="nachweis-export-detail-dateien-heading">
        <Card>
          <CardHeader>
            <CardTitle id="nachweis-export-detail-dateien-heading" as="h2">
              {t('nachweis.export.detail.dateienSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NachweisExportDateienTabelle exportId={exportId} dateien={view.dateien} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="nachweis-export-detail-einreichung-heading">
        <Card>
          <CardHeader>
            <CardTitle id="nachweis-export-detail-einreichung-heading" as="h2">
              {t('nachweis.einreichung.vermerken.sectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {einreichbarkeit.sperrGrund !== undefined ? (
              <p className="text-sm text-muted-foreground">{einreichbarkeit.sperrGrund}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('nachweis.einreichung.vermerken.hinweis')}</p>
                {einreichbarkeit.istEinreichbar && (
                  <EinreichungVermerkenFormular exportId={exportId} jetztIso={jetztIso} />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {view.einsparlaufId !== undefined && (
        <p>
          <Link
            to={`/nachweis/einsparlaeufe/${view.einsparlaufId}`}
            className="text-link underline-offset-4 hover:underline"
          >
            {t('nachweis.export.detailPage.backAction')}
          </Link>
        </p>
      )}
    </DetailView>
  );
}
