import type { ReactNode } from 'react';
import { DataList, type DataListColumn } from '../../stammdaten/components/shared';
import { Button } from '../../../shared/ui/button';
import { StatusRegion } from '../../../shared/ui/status-region';
import { useExportDateiDownloadView, type NachweisExportDateiView } from '../hooks';
import { t } from '../../../shared/i18n/t';

export interface NachweisExportDateienTabelleProps {
  readonly exportId: string;
  readonly dateien: readonly NachweisExportDateiView[];
}

/**
 * Dateiliste eines Exports mit Abruf je Zeile.
 *
 * Der Abruf ist eine SCHALTFLÄCHE, kein Link: Die Datei existiert nirgends
 * als Ablage — sie wird bei jedem Abruf neu erzeugt, gegen die hinterlegte
 * Prüfsumme geprüft und protokolliert. Ein Link würde eine Adresse
 * suggerieren, die man teilen oder als Lesezeichen ablegen kann; beides
 * träfe hier nicht zu.
 *
 * Die Prüfsummen stehen ungekürzt: gekürzt taugten sie nicht zum Abgleich.
 */
export function NachweisExportDateienTabelle({ exportId, dateien }: NachweisExportDateienTabelleProps): ReactNode {
  const download = useExportDateiDownloadView(exportId);

  const columns: readonly DataListColumn<NachweisExportDateiView>[] = [
    {
      key: 'dateiname',
      header: t('nachweis.export.tabelle.dateiname'),
      render: (datei) => <span className="font-medium text-foreground">{datei.dateiname}</span>,
    },
    { key: 'kategorie', header: t('nachweis.export.tabelle.kategorie'), render: (datei) => datei.kategorieLabel },
    { key: 'zeilenAnzahl', header: t('nachweis.export.tabelle.zeilenAnzahl'), render: (datei) => datei.zeilenAnzahlLabel },
    {
      key: 'dateiHash',
      header: t('nachweis.export.tabelle.dateiHash'),
      render: (datei) => <code className="break-all font-mono text-xs text-muted-foreground">{datei.dateiHash}</code>,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('nachweis.export.detail.dateienSectionHinweis')}</p>
      <StatusRegion ton="fehler" nachricht={download.fehlerMeldung} />
      <StatusRegion ton="erfolg" nachricht={download.erfolgsMeldung} />
      <DataList<NachweisExportDateiView>
        caption={t('nachweis.export.tabelle.caption')}
        columns={columns}
        items={dateien}
        getRowKey={(datei) => datei.dateiname}
        isPending={false}
        isError={false}
        loadingMessage={t('stammdaten.common.laedt')}
        errorMessage={t('stammdaten.common.fehler')}
        emptyMessage={t('nachweis.export.tabelle.leer')}
        actionHeader={t('stammdaten.common.aktion')}
        renderRowAction={(datei) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`${t('nachweis.export.tabelle.herunterladen')} ${datei.dateiname}`}
            disabled={download.laufenderDateiname !== undefined}
            onClick={() => {
              download.herunterladen(datei.dateiname);
            }}
          >
            {download.laufenderDateiname === datei.dateiname
              ? t('nachweis.export.tabelle.wirdGeladen')
              : t('nachweis.export.tabelle.herunterladen')}
          </Button>
        )}
      />
    </div>
  );
}
