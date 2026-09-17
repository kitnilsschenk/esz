import type { ReactNode } from 'react';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { Badge } from '../../../../shared/ui/badge';
import { useEinschraenkungFristenView, type EinschraenkungFristZeile } from '../../hooks/monitoring';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

/**
 * Wiedervorlage der BEFRISTETEN Art.-18-Einschränkungen (ADR-0007 A11.11).
 *
 * Zeigt bewusst ALLE offenen befristeten Vorgänge, nicht nur die
 * überfälligen: eine Liste, die erst beim Überschreiten der Schwelle etwas
 * anzeigt, lässt die Sachbearbeitung nie erkennen, was demnächst fällig wird.
 * Das Abzeichen markiert, die Sortierung (älteste zuerst, serverseitig)
 * ordnet.
 *
 * PII-frei: nur Pseudonym-Surrogate (`kurzId`), der geschlossene Grund-Code
 * als Klartext-Bezeichnung und Zeitangaben.
 *
 * Der Grund steht hier ausgeschrieben, weil die Liste ohne ihn unbrauchbar
 * wäre — ob ein Vorgang „Richtigkeit bestritten" oder „Widerspruch" ist,
 * bestimmt, wer ihn wie weiterbearbeitet. Das ist dieselbe Sichtbarkeit wie
 * im Detail (A11.4) und bleibt auf `betrieb`/`compliance-auditor` beschränkt.
 */
export function EinschraenkungFristenTabelle({ schwelleTage }: { readonly schwelleTage?: number }): ReactNode {
  const view = useEinschraenkungFristenView(schwelleTage);

  const columns: readonly DataListColumn<EinschraenkungFristZeile>[] = [
    {
      key: 'subjekt',
      header: t('stammdaten.monitoring.einschraenkungFristen.tabelle.subjekt'),
      render: (zeile) => `${zeile.subjektLabel} ${kurzId(zeile.item.subjektId)}`,
    },
    {
      key: 'endkundeId',
      header: t('stammdaten.monitoring.einschraenkungFristen.tabelle.endkundeId'),
      render: (zeile) => kurzId(zeile.item.endkundeId),
    },
    {
      key: 'grund',
      header: t('stammdaten.monitoring.einschraenkungFristen.tabelle.grund'),
      render: (zeile) => zeile.grundLabel,
    },
    {
      key: 'gesperrtSeit',
      header: t('stammdaten.monitoring.einschraenkungFristen.tabelle.gesperrtSeit'),
      render: (zeile) => formatiereZeitpunkt(zeile.item.gesperrtSeit),
    },
    {
      key: 'tageOffen',
      header: t('stammdaten.monitoring.einschraenkungFristen.tabelle.tageOffen'),
      render: (zeile) =>
        zeile.item.ueberfaellig ? (
          <Badge variant="warning">
            {t('stammdaten.monitoring.einschraenkungFristen.tabelle.ueberfaelligSeit')} {String(zeile.item.tageOffen)}
          </Badge>
        ) : (
          String(zeile.item.tageOffen)
        ),
    },
  ];

  return (
    <DataList<EinschraenkungFristZeile>
      caption={t('stammdaten.monitoring.einschraenkungFristen.tabelle.caption')}
      columns={columns}
      items={view.zeilen}
      getRowKey={(zeile) => `${zeile.item.subjektTyp}:${zeile.item.subjektId}`}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={t('stammdaten.monitoring.einschraenkungFristen.tabelle.leer')}
    />
  );
}
