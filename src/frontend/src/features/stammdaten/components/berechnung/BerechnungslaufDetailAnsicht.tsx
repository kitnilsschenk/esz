import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataList, DetailView, type DataListColumn } from '../shared';
import { Badge } from '../../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { useBerechnungslaufDetailView, type BerechnungslaufMonatsZeileView } from '../../hooks/berechnung';
import { BerechnungslaufMonatsBalkendiagramm } from './BerechnungslaufMonatsBalkendiagramm';
import { BerechnungslaufNeuBerechnenAktion } from './BerechnungslaufNeuBerechnenAktion';
import { t } from '../../../../shared/i18n/t';

export interface BerechnungslaufDetailAnsichtProps {
  readonly endkundeId: string;
  readonly laufId: string;
}

const MONATS_COLUMNS: readonly DataListColumn<BerechnungslaufMonatsZeileView>[] = [
  { key: 'monat', header: t('stammdaten.berechnung.monatstabelle.monat'), render: (zeile) => zeile.monatLabel },
  { key: 'referenz', header: t('stammdaten.berechnung.monatstabelle.referenz'), render: (zeile) => zeile.referenzKwhLabel },
  { key: 'ist', header: t('stammdaten.berechnung.monatstabelle.ist'), render: (zeile) => zeile.istKwhLabel },
  {
    // Die Zahl, wegen der jemand auf diese Seite kommt. Sie liess sich bisher
    // nur aus zwei Spalten im Kopf ausrechnen — zwoelfmal.
    key: 'einsparung',
    header: t('stammdaten.berechnung.monatstabelle.einsparung'),
    render: (zeile) => (
      <span className={zeile.istMehrverbrauch ? 'text-destructive-text' : undefined}>{zeile.einsparungKwhLabel}</span>
    ),
  },
  { key: 'abdeckung', header: t('stammdaten.berechnung.monatstabelle.abdeckung'), render: (zeile) => zeile.abdeckungPctLabel },
  {
    key: 'qualitaet',
    header: t('stammdaten.berechnung.monatstabelle.qualitaet'),
    render: (zeile) => <Badge variant={zeile.qualitaetsStufeBadgeVariante}>{zeile.qualitaetsStufeLabel}</Badge>,
  },
];

/**
 * Berechnungslauf-Detail (`GET /berechnung/laeufe/{laufId}`,
 * `read:berechnungslauf`, PII-frei): Kopf-Felder (Verfahren, Baseline,
 * Grundlastanteil, GTZ_base/GTZ_norm, Datenqualität) über `DetailView`s
 * generisches `fields`-Array, Monatsergebnisse in EINER eigenen Card-Sektion
 * (`CardTitle as="h2"`, axe `heading-order`) — Balkendiagramm (Referenz `R_m`
 * vs. Ist je Monat) UND Tabelle direkt darunter, dieselben aufbereiteten
 * Werte (`useBerechnungslaufDetailView`): die Tabelle ist damit zugleich die
 * vollständige Textalternative des Diagramms (kein Datenverlust ohne Grafik).
 */
export function BerechnungslaufDetailAnsicht({ endkundeId, laufId }: BerechnungslaufDetailAnsichtProps): ReactNode {
  const view = useBerechnungslaufDetailView(laufId);

  return (
    <DetailView
      headingId="berechnungslauf-detail-heading"
      title={t('stammdaten.berechnung.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <section aria-labelledby="berechnungslauf-detail-monatswerte-heading">
        <Card>
          <CardHeader>
            <CardTitle id="berechnungslauf-detail-monatswerte-heading" as="h2">
              {t('stammdaten.berechnung.detail.monatswerteSectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {view.bilanz !== undefined && (
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('stammdaten.berechnung.bilanz.sectionTitle')}
                </h3>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('stammdaten.berechnung.bilanz.referenz')}
                    </dt>
                    <dd className="font-medium text-foreground">{view.bilanz.referenzKwhLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('stammdaten.berechnung.bilanz.ist')}
                    </dt>
                    <dd className="font-medium text-foreground">{view.bilanz.istKwhLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('stammdaten.berechnung.bilanz.einsparung')}
                    </dt>
                    <dd
                      className={
                        view.bilanz.istMehrverbrauch
                          ? 'text-lg font-semibold text-destructive-text'
                          : 'text-lg font-semibold text-foreground'
                      }
                    >
                      {view.bilanz.einsparungKwhLabel}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 max-w-prose text-xs text-muted-foreground">
                  {t('stammdaten.berechnung.bilanz.erlaeuterung')}
                </p>
                {view.bilanz.istMehrverbrauch && (
                  <p className="mt-1 max-w-prose text-xs text-destructive-text">
                    {t('stammdaten.berechnung.bilanz.mehrverbrauchHinweis')}
                  </p>
                )}
              </div>
            )}
            {view.monatsZeilen.length > 0 && (
              <BerechnungslaufMonatsBalkendiagramm titel={t('stammdaten.berechnung.diagramm.titel')} zeilen={view.monatsZeilen} />
            )}
            <DataList<BerechnungslaufMonatsZeileView>
              caption={t('stammdaten.berechnung.monatstabelle.caption')}
              columns={MONATS_COLUMNS}
              items={view.monatsZeilen}
              getRowKey={(zeile) => zeile.monat}
              isPending={false}
              isError={false}
              loadingMessage={t('stammdaten.common.laedt')}
              errorMessage={t('stammdaten.common.fehler')}
              emptyMessage={t('stammdaten.berechnung.monatstabelle.leer')}
            />
          </CardContent>
        </Card>
      </section>
      <BerechnungslaufNeuBerechnenAktion
        endkundeId={endkundeId}
        laufId={laufId}
        istErsetzt={view.istErsetzt}
      />
      <p>
        <Link to={`/stammdaten/endkunden/${endkundeId}/berechnungen`} className="text-link underline-offset-4 hover:underline">
          {t('stammdaten.berechnung.detail.backAction')}
        </Link>
      </p>
    </DetailView>
  );
}
