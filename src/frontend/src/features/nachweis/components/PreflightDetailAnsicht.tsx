import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../../stammdaten/components/shared';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { buttonVariants } from '../../../shared/ui/button';
import { useKannNachweisFuehren, usePreflightDetailView } from '../hooks';
import { PreflightBefundeTabelle } from './PreflightBefundeTabelle';
import { t } from '../../../shared/i18n/t';

export interface PreflightDetailAnsichtProps {
  readonly preflightId: string;
}

/**
 * Ergebnis einer Vollständigkeitsprüfung — die Weiche der Nachweis-Kette.
 *
 * Ganz oben steht die Ampel samt einem Satz, der sagt, was sie für die
 * weitere Arbeit bedeutet. Darunter der Weiterweg: Bei bestandener Prüfung
 * führt er zum Förderjahr-Nachweis, bei nicht bestandener ausdrücklich nur
 * zum Zwischenstand. Beide Wege sind begehbar — der Unterschied wird benannt,
 * nicht versteckt: Wer einen Zwischenstand rechnen will, um zu sehen, wo er
 * steht, soll das können.
 */
export function PreflightDetailAnsicht({ preflightId }: PreflightDetailAnsichtProps): ReactNode {
  const view = usePreflightDetailView(preflightId);
  const kannRechnen = useKannNachweisFuehren();

  return (
    <DetailView
      headingId="preflight-detail-heading"
      title={t('nachweis.preflight.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
    >
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={view.ergebnisBadgeVariante}>{view.ergebnisLabel}</Badge>
            <p className="text-base font-semibold text-foreground">
              {view.istGruen ? t('nachweis.preflight.detail.ampelGruen') : t('nachweis.preflight.detail.ampelRot')}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {view.istGruen ? t('nachweis.preflight.detail.gruenHinweis') : t('nachweis.preflight.detail.rotHinweis')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {view.fields.map((feld) => (
              <div key={feld.key} className="space-y-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{feld.label}</dt>
                <dd className="text-sm text-foreground">{feld.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {kannRechnen && (
        <section aria-labelledby="preflight-detail-weiterweg-heading">
          <Card>
            <CardHeader>
              <CardTitle id="preflight-detail-weiterweg-heading" as="h2">
                {t('nachweis.preflight.detail.einsparlaufSectionTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {view.istGruen
                  ? t('nachweis.preflight.detail.einsparlaufHinweisGruen')
                  : t('nachweis.preflight.detail.einsparlaufHinweisRot')}
              </p>
              <Link
                to={`/nachweis/preflights/${preflightId}/einsparlauf-neu`}
                className={buttonVariants({ variant: 'default' })}
              >
                {t('nachweis.preflight.detail.einsparlaufAction')}
              </Link>
            </CardContent>
          </Card>
        </section>
      )}

      <section aria-labelledby="preflight-detail-befunde-heading">
        <Card>
          <CardHeader>
            <CardTitle id="preflight-detail-befunde-heading" as="h2">
              {t('nachweis.preflight.detail.befundeSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PreflightBefundeTabelle preflightId={preflightId} />
          </CardContent>
        </Card>
      </section>

      {view.foerderjahrId !== undefined && (
        <p>
          <Link
            to={`/nachweis/foerderjahre/${view.foerderjahrId}`}
            className="text-link underline-offset-4 hover:underline"
          >
            {t('nachweis.preflight.detailPage.backAction')}
          </Link>
        </p>
      )}
    </DetailView>
  );
}
