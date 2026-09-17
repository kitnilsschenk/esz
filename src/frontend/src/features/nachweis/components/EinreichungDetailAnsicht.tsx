import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../../stammdaten/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useEinreichungDetailView } from '../hooks';
import { EinreichungDifferenzenTabelle } from './EinreichungDifferenzenTabelle';
import { t } from '../../../shared/i18n/t';

export interface EinreichungDetailAnsichtProps {
  readonly einreichungId: string;
}

/**
 * Einreichungs-Detail — der Abschluss der Nachweis-Kette.
 *
 * Ganz oben steht, was dieser Eintrag ist und was er NICHT ist: ein Vermerk
 * über eine erklärte Übermittlung, kein Empfangsnachweis. Diesen Satz hier
 * stehen zu lassen kostet zwei Zeilen und verhindert, dass jemand den Eintrag
 * später für eine Bestätigung der Behörde hält.
 *
 * Der Differenz-Report erscheint nur bei einer Korrektur — bei einer
 * Erst-Einreichung gäbe es nichts zu vergleichen.
 */
export function EinreichungDetailAnsicht({ einreichungId }: EinreichungDetailAnsichtProps): ReactNode {
  const view = useEinreichungDetailView(einreichungId);

  return (
    <DetailView
      headingId="einreichung-detail-heading"
      title={t('nachweis.einreichung.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <p className="text-sm text-muted-foreground">{t('nachweis.einreichung.detail.ehrlichkeitsHinweis')}</p>

      {view.istKorrektur && (
        <section aria-labelledby="einreichung-detail-differenzen-heading">
          <Card>
            <CardHeader>
              <CardTitle id="einreichung-detail-differenzen-heading" as="h2">
                {t('nachweis.einreichung.detail.differenzSectionTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('nachweis.einreichung.detail.differenzSectionHinweis')}</p>
              <EinreichungDifferenzenTabelle einreichungId={einreichungId} />
            </CardContent>
          </Card>
        </section>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        {view.ersetztEinreichungId != null && (
          <Link
            to={`/nachweis/einreichungen/${view.ersetztEinreichungId}`}
            className="text-link underline-offset-4 hover:underline"
          >
            {t('nachweis.einreichung.detail.vorgaengerAnzeigen')}
          </Link>
        )}
        {view.exportId !== undefined && (
          <Link to={`/nachweis/exporte/${view.exportId}`} className="text-link underline-offset-4 hover:underline">
            {t('nachweis.einreichung.detailPage.backAction')}
          </Link>
        )}
      </div>
    </DetailView>
  );
}
