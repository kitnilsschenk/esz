import type { ReactNode } from 'react';
import { DataList, type DataListColumn } from '../shared';
import { Badge } from '../../../../shared/ui/badge';
import { Button } from '../../../../shared/ui/button';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useIngestQuellenView, useQuelleStatusAktion, type IngestQuelleZeileView } from '../../hooks/ingestQuelle';
import { t } from '../../../../shared/i18n/t';

/**
 * Die gepflegten Datenquellen.
 *
 * Zwei Dinge macht diese Tabelle bewusst sichtbar:
 *
 * 1. **Ob Zugangsdaten hinterlegt sind** — als Aufzählung der Feldnamen. Die
 *    Werte gibt der Server nicht heraus, und diese Ansicht fragt nicht danach.
 *    „Nichts hinterlegt" steht ausgeschrieben statt als leere Zelle: Bei einem
 *    Broker, der eine Anmeldung verlangt, ist genau das die Fehlerursache.
 * 2. **Unverschlüsselte Verbindungen als Warnung**, nicht als gleichwertige
 *    Wahl. `kein_tls` ist für den lokalen Dev-Broker vertretbar und sonst
 *    nirgends.
 *
 * Es gibt kein Löschen, nur Deaktivieren: Die Kennung steht in
 * Quarantäne-Zeilen und im Herkunfts-Abgleich, ein Entfernen ließe die dort
 * ins Leere zeigen.
 */
export function IngestQuellenTabelle(): ReactNode {
  const view = useIngestQuellenView();
  const statusAktion = useQuelleStatusAktion();

  const columns: readonly DataListColumn<IngestQuelleZeileView>[] = [
    {
      key: 'bezeichnung',
      header: t('stammdaten.ingestQuelle.tabelle.bezeichnung'),
      render: (zeile) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground">{zeile.bezeichnung}</p>
          <code className="font-mono text-xs text-muted-foreground">{zeile.quelleCode}</code>
        </div>
      ),
    },
    {
      key: 'broker',
      header: t('stammdaten.ingestQuelle.tabelle.broker'),
      render: (zeile) => (
        <div className="space-y-1">
          <code className="break-all font-mono text-xs text-foreground">{zeile.brokerHost}</code>
          <p className="break-all text-xs text-muted-foreground">{zeile.topic}</p>
        </div>
      ),
    },
    {
      key: 'tls',
      header: t('stammdaten.ingestQuelle.tabelle.tls'),
      render: (zeile) => <Badge variant={zeile.tlsBadgeVariante}>{zeile.tlsLabel}</Badge>,
    },
    {
      key: 'geheimnisse',
      header: t('stammdaten.ingestQuelle.tabelle.geheimnisse'),
      render: (zeile) => <span className="text-xs text-muted-foreground">{zeile.geheimnisseLabel}</span>,
    },
    {
      key: 'zertifikat',
      header: t('stammdaten.ingestQuelle.tabelle.zertifikat'),
      // Leer, wenn keins hinterlegt ist — eine Zelle „—" an einer Stelle, an
      // der es gar kein Zertifikat geben MUSS, waere Rauschen.
      render: (zeile) =>
        zeile.zertifikatLabel.length > 0 ? (
          <Badge variant={zeile.zertifikatBadgeVariante}>{zeile.zertifikatLabel}</Badge>
        ) : null,
    },
    {
      key: 'status',
      header: t('stammdaten.ingestQuelle.tabelle.status'),
      render: (zeile) => <Badge variant={zeile.statusBadgeVariante}>{zeile.statusLabel}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm text-muted-foreground">{t('stammdaten.ingestQuelle.tabelle.einfuehrung')}</p>
      {/*
        Der Hinweis steht ueber der Tabelle und nicht nur als Abzeichen in der
        Zeile: Ein ablaufendes Zertifikat legt die Datenaufnahme still, und
        zwar lautlos — das gehoert dorthin, wo man es liest, ohne die Spalte
        gezielt zu suchen.
      */}
      {view.zeigeZertifikatHinweis && (
        <p role="status" className="max-w-prose text-sm font-medium text-destructive-text">
          {t('stammdaten.ingestQuelle.tabelle.zertifikatHinweis')}
        </p>
      )}
      <StatusRegion ton="fehler" nachricht={statusAktion.submitErrorMessage} />
      <StatusRegion ton="erfolg" nachricht={statusAktion.erfolgsMeldung} />
      <DataList<IngestQuelleZeileView>
        caption={t('stammdaten.ingestQuelle.tabelle.caption')}
        columns={columns}
        items={view.items}
        getRowKey={(zeile) => zeile.id}
        isPending={view.isPending}
        isError={view.isError}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={view.ladeFehlerMeldung}
        emptyMessage={t('stammdaten.ingestQuelle.tabelle.leer')}
        actionHeader={t('stammdaten.common.aktion')}
        renderRowAction={(zeile) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={statusAktion.isSubmitting}
            onClick={() => {
              statusAktion.umschalten(zeile.id, zeile.istAktiv);
            }}
          >
            {zeile.istAktiv
              ? t('stammdaten.ingestQuelle.tabelle.deaktivieren')
              : t('stammdaten.ingestQuelle.tabelle.aktivieren')}
          </Button>
        )}
      />
    </div>
  );
}
