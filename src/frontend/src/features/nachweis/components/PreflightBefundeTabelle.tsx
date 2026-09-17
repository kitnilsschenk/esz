import type { ReactNode } from 'react';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { Badge } from '../../../shared/ui/badge';
import { usePreflightBefundeListeView, type PreflightBefundZeileView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface PreflightBefundeTabelleProps {
  readonly preflightId: string;
}

/**
 * Befundliste einer Vollständigkeitsprüfung.
 *
 * Zwei Dinge macht diese Tabelle bewusst sichtbar:
 *
 * 1. **Den Klartext der Prüfregel** statt nur ihres Codes. „FJ-05" sagt einer
 *    bedienenden Person nichts; „Widersprüchliche Rechenhistorie" sagt ihr,
 *    wonach sie suchen muss.
 * 2. **Blocker, die nur ein Paar betreffen.** Sie tragen dieselbe Schwere wie
 *    ein echter Förderjahr-Blocker, halten den Nachweis aber nicht auf. Ohne
 *    die Kennzeichnung stünden rote Zeilen unter einer grünen Ampel und die
 *    Ansicht widerspräche sich selbst.
 * 3. **Blocker, die aus dem Systemzustand entstehen.** Sie verschwinden durch
 *    keine Datenpflege. Unmarkiert lesen sie sich wie eine lösbare Aufgabe,
 *    und wer sie annimmt, sucht in den Stammdaten nach einer Ursache, die dort
 *    nicht liegt.
 *
 * Befunde sind PII- und wertfrei: Der Endkunde erscheint als Pseudonym, das
 * Merkmal als Klasse — nie als Energiemenge.
 */
export function PreflightBefundeTabelle({ preflightId }: PreflightBefundeTabelleProps): ReactNode {
  const view = usePreflightBefundeListeView(preflightId);

  const columns: readonly DataListColumn<PreflightBefundZeileView>[] = [
    { key: 'lfd', header: t('nachweis.preflight.tabelle.lfd'), render: (zeile) => zeile.lfdLabel },
    {
      key: 'regelCode',
      header: t('nachweis.preflight.tabelle.regelCode'),
      render: (zeile) => (
        <span>
          <span className="font-medium text-foreground">{zeile.regelCodeLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground">{zeile.regelCode}</span>
        </span>
      ),
    },
    {
      key: 'schwere',
      header: t('nachweis.preflight.tabelle.schwere'),
      render: (zeile) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={zeile.schwereBadgeVariante}>{zeile.schwereLabel}</Badge>
          {zeile.nurPaarBezogen && <Badge variant="outline">{t('nachweis.preflight.tabelle.paarBezogenBadge')}</Badge>}
          {zeile.systembedingt && <Badge variant="outline">{t('nachweis.preflight.tabelle.systembedingtBadge')}</Badge>}
        </span>
      ),
    },
    { key: 'endkundeId', header: t('nachweis.preflight.tabelle.endkundeId'), render: (zeile) => zeile.endkundeIdLabel },
    {
      key: 'energietraeger',
      header: t('nachweis.preflight.tabelle.energietraeger'),
      render: (zeile) => zeile.energietraegerLabel,
    },
    { key: 'monat', header: t('nachweis.preflight.tabelle.monat'), render: (zeile) => zeile.monatLabel },
    {
      key: 'kennzahlKlasse',
      header: t('nachweis.preflight.tabelle.kennzahlKlasse'),
      render: (zeile) => zeile.kennzahlKlasseLabel,
    },
  ];

  return (
    <div className="space-y-4">
      {view.zeigePaarHinweis && (
        <p className="text-sm text-muted-foreground">{t('nachweis.preflight.detail.paarBezogenHinweis')}</p>
      )}
      {view.zeigeSystemHinweis && (
        <p className="text-sm text-muted-foreground">{t('nachweis.preflight.detail.systembedingtHinweis')}</p>
      )}
      <DataList<PreflightBefundZeileView>
        caption={t('nachweis.preflight.tabelle.caption')}
        columns={columns}
        items={view.items}
        getRowKey={(zeile) => zeile.key}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('nachweis.preflight.tabelle.leer')}
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
