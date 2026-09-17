import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useZaehlerStandortView } from '../../hooks/zaehler';
import { EntityForm, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerStandortBlockProps {
  readonly zaehlerId: string;
}

const ZUORDNEN_FELDER: readonly EntityFormFieldConfig[] = [
  { name: 'standortId', label: t('stammdaten.zaehler.standort.form.standortId'), kind: 'text' },
  { name: 'gueltigVon', label: t('stammdaten.standort.zaehler.form.gueltigVon'), kind: 'date' },
];

/**
 * Standort-Breadcrumb-Block der Zähler-Detailseite (Betriebs-UI-Konzept
 * Punkt 3, „direkt unter dem Kopf") — beantwortet „Wo hängt dieser Zähler?".
 * Struktur (`id`/`typ`/`ebene`, PII-frei) und Labels (Bezeichnung, D5 Linie 2)
 * kommen aus GETRENNTEN Queries (`useZaehlerStandortView`); ohne
 * `read:standort_pii` zeigt jeder Pfad-Knoten einen Platzhalter statt einer
 * Fehlermeldung (identisch zum Standort-Baum-Verhalten).
 *
 * **Empty-State** (unverortet, `verortet=false` — 200, kein Fehler): Hinweis
 * + inline „Standort zuordnen"-Formular (öffnet dieselbe `POST
 * .../verortung`-Mutation wie der Standort-Baum, gespiegelter
 * Formular-Kontext).
 *
 * **Deep-Link-Einschränkung (Abweichung, dokumentiert):** Die
 * Standort-Baum-Seiten (`StandortBaumPage`/`StandortUebersichtPage`) kennen
 * in v1 keinen Knoten-genauen URL-Parameter — der Link am Ende der
 * Breadcrumb öffnet daher den GESAMTEN Baum des Endkunden (vorausgewählter
 * Knoten fehlt), nicht direkt den Ziel-Knoten. Ein Knoten-Deep-Link wäre eine
 * separate, größere Änderung an beiden Baum-Seiten (offener Punkt).
 */
export function ZaehlerStandortBlock({ zaehlerId }: ZaehlerStandortBlockProps): ReactNode {
  const view = useZaehlerStandortView(zaehlerId);

  return (
    <section aria-labelledby="zaehler-detail-standort-heading">
      <Card>
        <CardHeader>
          <CardTitle id="zaehler-detail-standort-heading" as="h2">
            {t('stammdaten.zaehler.detail.standortSectionTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {view.isPending && (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {t('stammdaten.common.laedt')}
            </p>
          )}
          {view.isError && (
            <p role="alert" className="text-sm font-medium text-destructive-text">
              {t('stammdaten.common.fehler')}
            </p>
          )}
          {!view.isPending && !view.isError && view.verortet && (
            <nav aria-label={t('stammdaten.zaehler.detail.standortBreadcrumbAriaLabel')}>
              <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                {view.breadcrumb.map((eintrag, index) => (
                  <Fragment key={eintrag.id}>
                    {index > 0 && (
                      <li aria-hidden="true" className="text-muted-foreground">
                        ›
                      </li>
                    )}
                    <li>
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eintrag.typLabel}</span>{' '}
                      <span className={eintrag.istPlatzhalter ? 'italic text-muted-foreground' : 'text-foreground'}>
                        {eintrag.anzeigeName}
                      </span>
                    </li>
                  </Fragment>
                ))}
              </ol>
              {view.endkundeId !== undefined && (
                <p className="mt-2">
                  <Link
                    to={`/stammdaten/endkunden/${view.endkundeId}/standorte`}
                    className="text-sm text-link underline-offset-4 hover:underline"
                  >
                    {t('stammdaten.zaehler.detail.standortOeffnenAction')}
                  </Link>
                </p>
              )}
            </nav>
          )}
          {!view.isPending && !view.isError && !view.verortet && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('stammdaten.zaehler.detail.standortLeer')}</p>
              <EntityForm<{ standortId: string; gueltigVon: string }>
                schema={view.zuordnenSchema}
                fields={ZUORDNEN_FELDER}
                defaultValues={view.zuordnenDefaultValues}
                submitLabel={t('stammdaten.zaehler.detail.standortZuordnenAction')}
                isSubmitting={view.zuordnenIsSubmitting}
                {...(view.zuordnenSubmitErrorMessage !== undefined ? { submitErrorMessage: view.zuordnenSubmitErrorMessage } : {})}
                onValidSubmit={view.zuordnenSubmit}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
