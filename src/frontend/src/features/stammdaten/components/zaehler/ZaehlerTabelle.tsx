import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useZaehlerListeView, type ZaehlerZeileView } from '../../hooks/zaehler';
import { Badge } from '../../../../shared/ui/badge';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

/**
 * Zähler-Liste (`ADR-0008 §23 / D11 Pass 1`): Pseudonym-`id` (gekürzt),
 * `systemId` (gekürzt), `energietraeger`, `status` (deutsche Enum-Labels),
 * `createdAt`. Cursor-Pagination via `DataList`s „Weitere laden" (analog
 * `SystemeTabelle`).
 */
export interface ZaehlerTabelleProps {
  /**
   * Schränkt die Liste serverseitig auf EINEN übergeordneten Datensatz ein
   * (Einbettung in dessen Detailseite). Die dann redundante
   * `systemId`-Spalte entfällt automatisch — sie stünde in jeder Zeile
   * gleich und würde nur Breite kosten.
   */
  readonly systemId?: string;
}

export function ZaehlerTabelle({ systemId }: ZaehlerTabelleProps = {}): ReactNode {
  const view = useZaehlerListeView(systemId !== undefined ? { systemId: systemId } : {});

  const eingebettet = systemId !== undefined;

  const alleSpalten: readonly DataListColumn<ZaehlerZeileView>[] = [
    { key: 'id', header: t('stammdaten.zaehler.tabelle.id'), render: (item) => kurzId(item.id) },
    {
      // Name zuerst, Kennung darunter: „System 77a6c17f" zwingt zum
      // Nachschlagen, „Verwaltungsgebäude A1" nicht. Die Kennung bleibt
      // sichtbar — sie ist es, mit der man in Protokollen sucht.
      key: 'systemId',
      header: t('stammdaten.zaehler.tabelle.systemId'),
      render: (item) => (
        <span className="flex flex-col">
          <span className="text-foreground">{item.systemBezeichnung}</span>
          <span className="font-mono text-xs text-muted-foreground">{kurzId(item.systemId)}</span>
        </span>
      ),
    },
    {
      key: 'energietraeger',
      header: t('stammdaten.zaehler.tabelle.energietraeger'),
      render: (item) => t(`stammdaten.common.enums.energietraeger.${item.energietraeger}`),
    },
    {
      key: 'status',
      header: t('stammdaten.zaehler.tabelle.status'),
      render: (item) => t(`stammdaten.common.enums.betriebsStatus.${item.status}`),
    },
    {
      key: 'empfang',
      header: t('stammdaten.zaehler.tabelle.empfang'),
      // Die Frage, mit der beim Anschliessen einer Anlage angefangen wird:
      // Haengt hier ueberhaupt ein Geraet, und kommt etwas an? Sie stand
      // bisher nur auf der Detailseite — bei zwoelf Zaehlern zwoelf Klicks,
      // um den stummen zu finden.
      render: (item) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={item.empfangBadgeVariante}>{item.empfangLabel}</Badge>
          {item.empfangRelativ.length > 0 && (
            <span className="text-xs text-muted-foreground" title={item.empfangZeitpunkt}>
              {item.empfangRelativ}
            </span>
          )}
        </span>
      ),
    },
    { key: 'createdAt', header: t('stammdaten.zaehler.tabelle.createdAt'), render: (item) => formatiereZeitpunkt(item.createdAt) },
  ];

  // Im eingebetteten Modus ist `systemId` in jeder Zeile derselbe Wert.
  const columns = eingebettet ? alleSpalten.filter((spalte) => spalte.key !== 'systemId') : alleSpalten;

  return (
    <DataList<ZaehlerZeileView>
      caption={eingebettet ? t('stammdaten.zaehler.tabelle.captionFuerSystem') : t('stammdaten.zaehler.tabelle.caption')}
      columns={columns}
      items={view.items}
      getRowKey={(item) => item.id}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      emptyMessage={eingebettet ? t('stammdaten.zaehler.tabelle.leerFuerSystem') : t('stammdaten.zaehler.tabelle.leer')}
      actionHeader={t('stammdaten.common.aktion')}
      renderRowAction={(item) => (
        <Link
          to={`/stammdaten/zaehler/${item.id}`}
          aria-label={`${t('stammdaten.zaehler.tabelle.detailsAnzeigen')} ${kurzId(item.id)}`}
          className="text-link underline-offset-4 hover:underline"
        >
          {t('stammdaten.zaehler.tabelle.detailsAnzeigen')}
        </Link>
      )}
      pagination={{
        hasNextPage: view.hasNextPage,
        isFetchingNextPage: view.isFetchingNextPage,
        onLoadMore: view.loadMore,
        loadMoreLabel: t('stammdaten.common.weitereLaden'),
      }}
    />
  );
}
