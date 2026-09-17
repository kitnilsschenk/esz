import type { ReactNode } from 'react';
import type { MesswertHerkunft, MesswertQualitaet, MesswertRohPunkt } from '@edms/shared';
import { useMesskanalLastgangView } from '../../hooks/verbrauch';
import { DataList, EntityForm, kurzId, type DataListColumn, type EntityFormFieldConfig } from '../shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { t } from '../../../../shared/i18n/t';

export interface MesskanalLastgangPanelProps {
  readonly messkanalId: string;
  readonly zaehlerId: string;
  readonly onSchliessen: () => void;
}

const FELDER: readonly EntityFormFieldConfig[] = [
  { name: 'von', label: t('stammdaten.verbrauch.lastgang.form.von'), kind: 'date' },
  { name: 'bis', label: t('stammdaten.verbrauch.lastgang.form.bis'), kind: 'date' },
];

// Getrennte, typisierte Label-Funktionen statt EINER generischen mit
// `praefix: string` — ein generischer `string`-Parameter lässt sich vom
// Compiler NICHT auf die endliche `MessageKey`-Union prüfen (analog
// `energietraegerLabel`/`statusLabel` in `useZaehlerDetailView.ts`).
function qualitaetLabel(wert: MesswertQualitaet): string {
  return t(`stammdaten.common.enums.messwertQualitaet.${wert}`);
}

function herkunftLabel(wert: MesswertHerkunft): string {
  return t(`stammdaten.common.enums.messwertHerkunft.${wert}`);
}

/**
 * Inline-Panel des break-glass-CTAs „Lastgang ansehen" (Route B,
 * `read:verbrauch_detail`, Betriebs-UI-Konzept Punkt 3.4/4) — bewusst KEIN
 * Modal-Dialog, sondern ein togglebares Card-Panel (analog den übrigen
 * inline-Aktions-Panels dieses Auftrags, z. B.
 * `StandortKnotenAktionen`/`StandortKindAnlegenFormular`), damit hier keine
 * separate Dialog-Infrastruktur dupliziert werden muss.
 *
 * Zeigt VOR dem ersten Submit ausschließlich den Zeitraum-Formular +
 * Zweck-Hinweistext — **kein Diagramm/keine Werte**, bis der Zeitraum
 * (≤ `MAX_FENSTER_TAGE`) bestätigt wurde. Nach Erfolg erscheinen die rohen
 * Messwerte als Tabelle (`DataList`, PII-frei, KEINE Grafik — Rohwerte
 * inkl. Qualität/Herkunft sind hier fachlich gewollt, anders als die
 * aggregierte `VerbrauchAnsicht`).
 */
export function MesskanalLastgangPanel({ messkanalId, zaehlerId, onSchliessen }: MesskanalLastgangPanelProps): ReactNode {
  const view = useMesskanalLastgangView(messkanalId, zaehlerId);

  const columns: readonly DataListColumn<MesswertRohPunkt>[] = [
    { key: 'ts', header: t('stammdaten.verbrauch.lastgang.tabelle.ts'), render: (item) => item.ts },
    { key: 'wert', header: t('stammdaten.verbrauch.lastgang.tabelle.wert'), render: (item) => String(item.wert) },
    {
      key: 'qualitaet',
      header: t('stammdaten.verbrauch.lastgang.tabelle.qualitaet'),
      render: (item) => qualitaetLabel(item.qualitaet),
    },
    {
      key: 'herkunft',
      header: t('stammdaten.verbrauch.lastgang.tabelle.herkunft'),
      render: (item) => herkunftLabel(item.herkunft),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle as="h3">
          {t('stammdaten.verbrauch.lastgang.panelTitel')} ({kurzId(messkanalId)})
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={onSchliessen}>
          {t('stammdaten.common.schliessen')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('stammdaten.verbrauch.lastgang.zweckHinweis')}</p>
        <EntityForm<{ von: string; bis: string }>
          schema={view.schema}
          fields={FELDER}
          defaultValues={view.defaultValues}
          submitLabel={t('stammdaten.verbrauch.lastgang.form.submitAction')}
          isSubmitting={view.isSubmitting}
          {...(view.submitErrorMessage !== undefined ? { submitErrorMessage: view.submitErrorMessage } : {})}
          onValidSubmit={view.submit}
        />
        {view.hatErgebnis && view.istLeer && (
          <p className="text-sm text-muted-foreground">{t('stammdaten.verbrauch.leer')}</p>
        )}
        {view.hatErgebnis && !view.istLeer && (
          <DataList<MesswertRohPunkt>
            caption={t('stammdaten.verbrauch.lastgang.tabelle.caption')}
            columns={columns}
            items={view.zeilen}
            getRowKey={(item) => item.ts}
            isPending={false}
            isError={false}
            loadingMessage={t('stammdaten.common.laedt')}
            errorMessage={t('stammdaten.common.fehler')}
            emptyMessage={t('stammdaten.verbrauch.leer')}
          />
        )}
      </CardContent>
    </Card>
  );
}
