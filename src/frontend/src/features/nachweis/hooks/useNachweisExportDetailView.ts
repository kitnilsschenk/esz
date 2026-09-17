import { useNachweisExportDetail } from '../api';
import type { DetailField } from '../../stammdaten/components/shared';
import { kurzId } from '../../stammdaten/components/shared';
import {
  exportKategorieLabel,
  exportZweckLabel,
  formatiereAnzahl,
  formatiereBigintAnzahl,
  jaNein,
  stationDarstellungLabel,
} from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export interface NachweisExportDateiView {
  readonly dateiname: string;
  readonly kategorieLabel: string;
  readonly zeilenAnzahlLabel: string;
  readonly dateiHash: string;
}

export interface NachweisExportDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly einsparlaufId: string | undefined;
  readonly fields: readonly DetailField[];
  readonly dateien: readonly NachweisExportDateiView[];
}

/**
 * Anzeige-Modell des Export-Kopfes samt Datei-Manifest.
 *
 * Der Export selbst hält keine Dateiinhalte vor — nur Namen, Zeilenzahlen und
 * Prüfsummen. Jeder Abruf einer Datei erzeugt sie neu und gleicht sie gegen
 * die hier gezeigte Prüfsumme ab. Die Prüfsummen werden deshalb VOLLSTÄNDIG
 * angezeigt: gekürzt taugten sie zum Abgleich nicht.
 */
export function useNachweisExportDetailView(exportId: string): NachweisExportDetailView {
  const query = useNachweisExportDetail(exportId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'zweck', label: t('nachweis.export.detail.zweck'), value: exportZweckLabel(detail.zweck) },
        {
          key: 'stationDarstellung',
          label: t('nachweis.export.detail.stationDarstellung'),
          value: stationDarstellungLabel(detail.stationDarstellung),
        },
        {
          key: 'de04Auszug',
          label: t('nachweis.export.detail.de04Auszug'),
          value: jaNein(detail.de04Auszug),
        },
        { key: 'format', label: t('nachweis.export.detail.format'), value: detail.format },
        {
          key: 'schema',
          label: t('nachweis.export.detail.schema'),
          value: `${detail.schemaCode} (v${String(detail.schemaVersion)})`,
        },
        {
          key: 'pseudonymProfil',
          label: t('nachweis.export.detail.pseudonymProfil'),
          value: detail.pseudonymProfil,
        },
        {
          key: 'anfrageRef',
          label: t('nachweis.export.detail.anfrageRef'),
          value: detail.anfrageRef ?? t('stammdaten.common.keineAngabe'),
        },
        {
          key: 'dateienAnzahl',
          label: t('nachweis.export.detail.dateienAnzahl'),
          value: formatiereAnzahl(detail.dateienAnzahl),
        },
        {
          key: 'zeilenAnzahlGesamt',
          label: t('nachweis.export.detail.zeilenAnzahlGesamt'),
          value: formatiereBigintAnzahl(detail.zeilenAnzahlGesamt),
        },
        {
          key: 'erzeugtAt',
          label: t('nachweis.export.detail.erzeugtAt'),
          value: formatiereZeitpunkt(detail.erzeugtAt),
        },
        {
          key: 'erzeugtVonSub',
          label: t('nachweis.export.detail.erzeugtVonSub'),
          value: kurzId(detail.erzeugtVonSub),
        },
        { key: 'manifestHash', label: t('nachweis.export.detail.manifestHash'), value: detail.manifestHash },
        { key: 'id', label: t('nachweis.export.detail.id'), value: kurzId(detail.id) },
      ]
    : [];

  const dateien: readonly NachweisExportDateiView[] = (detail?.dateien ?? []).map((datei) => ({
    dateiname: datei.dateiname,
    kategorieLabel: exportKategorieLabel(datei.kategorie),
    zeilenAnzahlLabel: formatiereBigintAnzahl(datei.zeilenAnzahl),
    dateiHash: datei.dateiHash,
  }));

  return {
    isPending: query.isPending,
    isError: query.isError,
    einsparlaufId: detail?.einsparlaufId,
    fields,
    dateien,
  };
}
