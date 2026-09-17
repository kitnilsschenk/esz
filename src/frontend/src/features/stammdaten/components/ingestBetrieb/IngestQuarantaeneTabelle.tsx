import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { IngestQuarantaeneGrund } from '@edms/shared';
import { DataList, type DataListColumn } from '../shared';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import {
  quarantaeneGrundLabel,
  useIngestQuarantaeneFilterView,
  useIngestQuarantaeneListeView,
  type IngestQuarantaeneZeileView,
} from '../../hooks/ingestBetrieb';
import { t } from '../../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge des Filters, gespiegelt aus dem DB-CHECK. */
const GRUND_WERTE: readonly IngestQuarantaeneGrund[] = [
  'devEUI_unbekannt',
  'unbekannter_geraetetyp',
  'decode_fehler',
  'kanal_unbekannt',
  'einheit_inkonsistent',
  'unplausibel_monotonie_verletzt',
  'zeitstempel_fehlt',
  'herkunft_widerspruechlich',
  'skalensprung_verdacht',
  'envelope_parse_fehler',
];

/**
 * Der Arbeitsvorrat: jede Nachricht, die nicht geschrieben werden konnte,
 * mit ihrem Grund UND dem nächsten Handgriff.
 *
 * Der Hinweistext je Zeile ist der eigentliche Zweck dieser Ansicht. „devEUI
 * unbekannt" ist für jemanden, der einen Zähler anschließt, keine Auskunft;
 * „Das Gerät sendet, ist aber keinem Zähler angebunden" ist eine.
 *
 * Wo der Zähler aufgelöst werden konnte, führt ein Link direkt zu ihm. Beim
 * häufigsten Grund ist er es gerade nicht — ein unbekanntes Gerät hat keinen
 * Zähler. Er hilft bei den Gründen, die AM Zähler hängen: fehlender Kanal,
 * falsche Einheit, unbekannter Gerätetyp.
 */
export function IngestQuarantaeneTabelle(): ReactNode {
  const filter = useIngestQuarantaeneFilterView();
  const view = useIngestQuarantaeneListeView(filter.aktiverGrund);
  const filterId = useId();

  const columns: readonly DataListColumn<IngestQuarantaeneZeileView>[] = [
    {
      key: 'grund',
      header: t('stammdaten.ingestBetrieb.tabelle.grund'),
      render: (zeile) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground">{zeile.grundLabel}</p>
          <p className="max-w-prose text-xs text-muted-foreground">{zeile.grundHinweis}</p>
          {/*
            Bei `kanal_unbekannt` die eine Angabe, die die Ursache zeigt: Der
            Lookup vergleicht die Messgroesse EXAKT. Ohne diese Liste blieb
            nur, die Nutzlast von Hand zu dekodieren und gegen die Stammdaten
            zu halten — eine abweichende Schreibweise legt sonst die Aufnahme
            eines Zaehlers still, ohne dass irgendwo steht, woran es liegt.
          */}
          {zeile.zaehlerMessgroessen.length > 0 && (
            <p className="max-w-prose text-xs text-muted-foreground">
              {t('stammdaten.ingestBetrieb.tabelle.vorhandeneMessgroessen')}{' '}
              <code className="font-mono text-foreground">{zeile.zaehlerMessgroessen}</code>
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'zaehlerId',
      header: t('stammdaten.ingestBetrieb.tabelle.zaehlerId'),
      render: (zeile) =>
        zeile.zaehlerId !== undefined ? (
          <Link
            to={`/stammdaten/zaehler/${zeile.zaehlerId}`}
            aria-label={`${t('stammdaten.ingestBetrieb.tabelle.zaehlerOeffnen')} ${zeile.zaehlerIdLabel}`}
            className="text-link underline-offset-4 hover:underline"
          >
            {zeile.zaehlerIdLabel}
          </Link>
        ) : (
          zeile.zaehlerIdLabel
        ),
    },
    { key: 'quelle', header: t('stammdaten.ingestBetrieb.tabelle.quelle'), render: (zeile) => zeile.quelleLabel },
    {
      key: 'application',
      header: t('stammdaten.ingestBetrieb.tabelle.application'),
      render: (zeile) => zeile.applicationLabel,
    },
    { key: 'fPort', header: t('stammdaten.ingestBetrieb.tabelle.fPort'), render: (zeile) => zeile.fPortLabel },
    {
      key: 'topic',
      header: t('stammdaten.ingestBetrieb.tabelle.topic'),
      render: (zeile) => <code className="break-all font-mono text-xs text-muted-foreground">{zeile.topicRedacted}</code>,
    },
    {
      key: 'empfangenAt',
      header: t('stammdaten.ingestBetrieb.tabelle.empfangenAt'),
      render: (zeile) => zeile.empfangenAtLabel,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor={filterId}>{t('stammdaten.ingestBetrieb.tabelle.filterGrund')}</Label>
            <Select
              id={filterId}
              value={filter.grund}
              onChange={(event) => {
                filter.setzeGrund(event.target.value);
              }}
            >
              <option value="">{t('stammdaten.ingestBetrieb.tabelle.filterAlle')}</option>
              {GRUND_WERTE.map((wert) => (
                <option key={wert} value={wert}>
                  {quarantaeneGrundLabel(wert)}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <DataList<IngestQuarantaeneZeileView>
        caption={t('stammdaten.ingestBetrieb.tabelle.caption')}
        columns={columns}
        items={view.items}
        getRowKey={(zeile) => zeile.id}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={
          filter.aktiverGrund !== undefined
            ? t('stammdaten.ingestBetrieb.tabelle.leerGefiltert')
            : t('stammdaten.ingestBetrieb.tabelle.leer')
        }
        pagination={{
          hasNextPage: view.hasNextPage,
          isFetchingNextPage: view.isFetchingNextPage,
          onLoadMore: view.loadMore,
          loadMoreLabel: t('stammdaten.common.weitereLaden'),
        }}
      />
    </div>
  );
}
