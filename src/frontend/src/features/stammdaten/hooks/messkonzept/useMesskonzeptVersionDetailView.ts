import type { EnergietraegerBaselineDetail } from '@edms/shared';
import { encodeMesskonzeptVersionId, useMesskonzeptVersionDetail } from '../../api/messkonzept';
import type { DetailField } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt, formatiereZeitpunktOder } from '../../../../shared/format/datum';

export interface MesskonzeptVersionDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  readonly energietraeger: readonly EnergietraegerBaselineDetail[];
}

/**
 * Leitet aus der Messkonzept-Version-Detail-Query ein reines Anzeige-Modell
 * ab: die skalaren TB-01-Felder als `DetailField[]` (für `DetailView`) sowie
 * die Energieträger/Baseline-Liste GETRENNT (für die eingebettete
 * `EnergietraegerBaselineTabelle` in `MesskonzeptVersionDetailAnsicht`) —
 * Messkonzept ist NICHT-PII (analog `useSystemDetailView`), es geht hier
 * NICHT um eine Maskierungs-Trennung, sondern um zwei unterschiedliche
 * Darstellungsformen (Skalar-Liste vs. Tabelle).
 */
export function useMesskonzeptVersionDetailView(endkundeId: string, versionNr: number): MesskonzeptVersionDetailView {
  const query = useMesskonzeptVersionDetail(encodeMesskonzeptVersionId({ endkundeId, versionNr }));
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'versionNr', label: t('stammdaten.messkonzept.detail.versionNr'), value: detail.versionNr },
        {
          key: 'typ',
          label: t('stammdaten.messkonzept.detail.typ'),
          value: t(`stammdaten.common.enums.messkonzeptTyp.${detail.typ}`),
        },
        { key: 'systemgrenze', label: t('stammdaten.messkonzept.detail.systemgrenze'), value: detail.systemgrenze },
        {
          key: 'systembeschreibung',
          label: t('stammdaten.messkonzept.detail.systembeschreibung'),
          value: detail.systembeschreibung,
        },
        {
          key: 'bereinigungsverfahren',
          label: t('stammdaten.messkonzept.detail.bereinigungsverfahren'),
          value: detail.bereinigungsverfahren,
        },
        {
          key: 'messgeraeteWahl',
          label: t('stammdaten.messkonzept.detail.messgeraeteWahl'),
          value: detail.messgeraeteWahl,
        },
        {
          key: 'geraeteerkennungsVerfahren',
          label: t('stammdaten.messkonzept.detail.geraeteerkennungsVerfahren'),
          value: detail.geraeteerkennungsVerfahren,
        },
        {
          key: 'aenderungsgrund',
          label: t('stammdaten.messkonzept.detail.aenderungsgrund'),
          value: detail.aenderungsgrund ?? t('stammdaten.messkonzept.detail.aenderungsgrundKeineAngabe'),
        },
        { key: 'gueltigVon', label: t('stammdaten.messkonzept.detail.gueltigVon'), value: formatiereZeitpunkt(detail.gueltigVon) },
        {
          key: 'gueltigBis',
          label: t('stammdaten.messkonzept.detail.gueltigBis'),
          value: formatiereZeitpunktOder(detail.gueltigBis, t('stammdaten.messkonzept.detail.gueltigBisAktuell')),
        },
        { key: 'createdAt', label: t('stammdaten.messkonzept.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    energietraeger: detail?.energietraeger ?? [],
  };
}
