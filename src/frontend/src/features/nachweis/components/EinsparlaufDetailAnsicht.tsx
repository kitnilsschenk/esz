import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../../stammdaten/components/shared';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useEinsparlaufDetailView, useKannNachweisFuehren } from '../hooks';
import { EinsparlaufErgebnisseTabelle } from './EinsparlaufErgebnisseTabelle';
import { EinsparlaufBindungenTabelle } from './EinsparlaufBindungenTabelle';
import { NachweisExportErzeugenFormular } from './NachweisExportErzeugenFormular';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufDetailAnsichtProps {
  readonly einsparlaufId: string;
}

/**
 * Einspar-Lauf-Detail: Kopfdaten, Jahressumme, Ergebniszeilen, auf Wunsch die
 * Monatsbindungen — und der nächste Schritt der Kette, der Export.
 *
 * Die Monatsbindungen sind EINGEKLAPPT. Sie sind die Belegkette und gehören
 * zur Seite, aber es sind Paare × Monate Zeilen; ausgeklappt drängten sie das
 * Jahresergebnis von der Seite. Geladen werden sie erst beim Aufklappen.
 *
 * Beim Export-Abschnitt wird ausgesprochen, was ein Zwischenstand ist: eine
 * Rechnung für den eigenen Gebrauch. Exportieren lässt er sich, einreichen
 * nicht — das steht dort, wo jemand den Export erzeugt, nicht erst hinter
 * einer Fehlermeldung zwei Schritte später.
 */
export function EinsparlaufDetailAnsicht({ einsparlaufId }: EinsparlaufDetailAnsichtProps): ReactNode {
  const view = useEinsparlaufDetailView(einsparlaufId);
  const kannExportieren = useKannNachweisFuehren();
  const [zeigeBindungen, setzeZeigeBindungen] = useState(false);

  return (
    <DetailView
      headingId="einsparlauf-detail-heading"
      title={t('nachweis.einsparlauf.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <section aria-labelledby="einsparlauf-detail-summe-heading">
        <Card>
          <CardHeader>
            <CardTitle id="einsparlauf-detail-summe-heading" as="h2">
              {t('nachweis.einsparlauf.detail.summeSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              {view.summeFields.map((feld) => (
                <div key={feld.key} className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{feld.label}</dt>
                  <dd className="text-sm text-foreground">{feld.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="einsparlauf-detail-ergebnis-heading">
        <Card>
          <CardHeader>
            <CardTitle id="einsparlauf-detail-ergebnis-heading" as="h2">
              {t('nachweis.einsparlauf.detail.ergebnisSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('nachweis.einsparlauf.detail.ergebnisSectionHinweis')}</p>
            <EinsparlaufErgebnisseTabelle einsparlaufId={einsparlaufId} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="einsparlauf-detail-bindungen-heading">
        <Card>
          <CardHeader>
            <CardTitle id="einsparlauf-detail-bindungen-heading" as="h2">
              {t('nachweis.einsparlauf.detail.bindungSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('nachweis.einsparlauf.detail.bindungSectionHinweis')}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={zeigeBindungen}
              onClick={() => {
                setzeZeigeBindungen((vorher) => !vorher);
              }}
            >
              {zeigeBindungen
                ? t('nachweis.einsparlauf.detail.bindungenAusblenden')
                : t('nachweis.einsparlauf.detail.bindungenEinblenden')}
            </Button>
            {zeigeBindungen && <EinsparlaufBindungenTabelle einsparlaufId={einsparlaufId} />}
          </CardContent>
        </Card>
      </section>

      {kannExportieren && (
        <section aria-labelledby="einsparlauf-detail-export-heading">
          <Card>
            <CardHeader>
              <CardTitle id="einsparlauf-detail-export-heading" as="h2">
                {t('nachweis.export.erzeugen.sectionTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('nachweis.export.erzeugen.hinweis')}</p>
              {view.art === 'zwischenstand' && (
                <p className="text-sm text-muted-foreground">{t('nachweis.export.erzeugen.hinweisZwischenstand')}</p>
              )}
              <NachweisExportErzeugenFormular einsparlaufId={einsparlaufId} />
            </CardContent>
          </Card>
        </section>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        {view.foerderjahrId !== undefined && (
          <Link to={`/nachweis/foerderjahre/${view.foerderjahrId}`} className="text-link underline-offset-4 hover:underline">
            {t('nachweis.einsparlauf.detail.foerderjahrAnzeigen')}
          </Link>
        )}
        {view.preflightId !== undefined && (
          <Link to={`/nachweis/preflights/${view.preflightId}`} className="text-link underline-offset-4 hover:underline">
            {t('nachweis.einsparlauf.detail.preflightAnzeigen')}
          </Link>
        )}
        {view.ersetztEinsparlaufId != null && (
          <Link
            to={`/nachweis/einsparlaeufe/${view.ersetztEinsparlaufId}`}
            className="text-link underline-offset-4 hover:underline"
          >
            {t('nachweis.einsparlauf.detail.vorgaengerAnzeigen')}
          </Link>
        )}
        <Link to="/nachweis/einsparlaeufe" className="text-link underline-offset-4 hover:underline">
          {t('nachweis.einsparlauf.detailPage.backAction')}
        </Link>
      </div>
    </DetailView>
  );
}
