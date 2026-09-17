import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MesskanalListItem } from '@edms/shared';
import { DataList, kurzId, type DataListColumn } from '../shared';
import { useMesskanaeleListeView } from '../../hooks/messkanal';
import { MesskanalLastgangPanel } from '../verbrauch';
import { Badge } from '../../../../shared/ui/badge';
import { Button } from '../../../../shared/ui/button';
import { Tooltip } from '../../../../shared/ui/tooltip';
import { t } from '../../../../shared/i18n/t';

export interface MesskanaeleTabelleProps {
  readonly zaehlerId: string;
}

/**
 * Messkanäle-Liste EINES Zählers (`ADR-0008 §23 / D11 Pass 1`, Sub-Ressource
 * `/stammdaten/zaehler/{zaehlerId}/messkanaele`) — eingebettet in
 * `ZaehlerDetailAnsicht` (KEIN eigener Top-Level-Listen-Route, Messkanal hat
 * keinen globalen Index-Endpunkt).
 *
 * Um zwei Spalten erweitert (Betriebs-UI-Konzept Punkt 4): „Letzte
 * Übertragung" (Freshness je Kanal, `read:monitoring`, KEIN break-glass) und
 * die Aktion „Lastgang ansehen" (öffnet `MesskanalLastgangPanel` — löst den
 * zweckgebundenen break-glass-Fluss `read:verbrauch_detail` aus). Bewusst
 * KEIN Dauer-Diagramm in dieser Tabelle selbst (DS-07-Innensicht,
 * ADR-0008 §6.5) — nur EIN Panel gleichzeitig offen (`lastgangMesskanalId`).
 */
export function MesskanaeleTabelle({ zaehlerId }: MesskanaeleTabelleProps): ReactNode {
  const view = useMesskanaeleListeView(zaehlerId);
  const [lastgangMesskanalId, setLastgangMesskanalId] = useState<string | undefined>(undefined);

  const columns: readonly DataListColumn<MesskanalListItem>[] = [
    { key: 'id', header: t('stammdaten.messkanal.tabelle.id'), render: (item) => kurzId(item.id) },
    { key: 'messgroesse', header: t('stammdaten.messkanal.tabelle.messgroesse'), render: (item) => item.messgroesse },
    { key: 'einheit', header: t('stammdaten.messkanal.tabelle.einheit'), render: (item) => item.einheit },
    {
      key: 'art',
      header: t('stammdaten.messkanal.tabelle.art'),
      render: (item) => t(`stammdaten.common.enums.messgroesseArt.${item.art}`),
    },
    {
      key: 'status',
      header: t('stammdaten.messkanal.tabelle.status'),
      render: (item) => t(`stammdaten.common.enums.betriebsStatus.${item.status}`),
    },
    {
      key: 'obisKennzahl',
      header: t('stammdaten.messkanal.tabelle.obisKennzahl'),
      render: (item) => item.obisKennzahl ?? t('stammdaten.common.keineAngabe'),
    },
    {
      key: 'freshness',
      header: t('stammdaten.messkanal.tabelle.letzteUebertragung'),
      render: (item) => {
        if (view.freshnessIsPending) {
          return <span className="text-sm text-muted-foreground">{t('stammdaten.common.laedt')}</span>;
        }
        const freshness = view.freshnessFuer(item.id);
        if (freshness === undefined) {
          return <span className="text-sm text-muted-foreground">{t('stammdaten.common.keineAngabe')}</span>;
        }
        return <Badge variant={freshness.ueberfaellig ? 'destructive' : 'success'}>{freshness.label}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DataList<MesskanalListItem>
        caption={t('stammdaten.messkanal.tabelle.caption')}
        columns={columns}
        items={view.items}
        getRowKey={(item) => item.id}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('stammdaten.messkanal.tabelle.leer')}
        actionHeader={t('stammdaten.common.aktion')}
        renderRowAction={(item) => (
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/stammdaten/messkanaele/${item.id}`}
              aria-label={`${t('stammdaten.messkanal.tabelle.detailsAnzeigen')} ${kurzId(item.id)}`}
              className="text-link underline-offset-4 hover:underline"
            >
              {t('stammdaten.messkanal.tabelle.detailsAnzeigen')}
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${t('stammdaten.messkanal.tabelle.lastgangAnsehenAction')} ${kurzId(item.id)}`}
                onClick={() => setLastgangMesskanalId(item.id)}
              >
                {t('stammdaten.messkanal.tabelle.lastgangAnsehenAction')}
              </Button>
              <Tooltip text={t('stammdaten.verbrauch.lastgang.tooltip')} label={t('stammdaten.messkanal.tabelle.lastgangTooltipLabel')} />
            </span>
          </div>
        )}
        pagination={{
          hasNextPage: view.hasNextPage,
          isFetchingNextPage: view.isFetchingNextPage,
          onLoadMore: view.loadMore,
          loadMoreLabel: t('stammdaten.common.weitereLaden'),
        }}
      />
      {lastgangMesskanalId !== undefined && (
        <MesskanalLastgangPanel
          key={lastgangMesskanalId}
          messkanalId={lastgangMesskanalId}
          zaehlerId={zaehlerId}
          onSchliessen={() => setLastgangMesskanalId(undefined)}
        />
      )}
    </div>
  );
}
