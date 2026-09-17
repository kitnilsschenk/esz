import type { BetriebsStatus, MessgroesseArt } from '@edms/shared';
import { useMesskanalDetail } from '../../api/messkanal';
import type { DetailField } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

export interface MesskanalDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  readonly zaehlerId: string | undefined;
  /** Steuert Sichtbarkeit/Deaktivierung der „Stilllegen"-Aktion in der Ansicht. */
  readonly istStillgelegt: boolean;
}

function artLabel(wert: MessgroesseArt): string {
  return t(`stammdaten.common.enums.messgroesseArt.${wert}`);
}

function statusLabel(wert: BetriebsStatus): string {
  return t(`stammdaten.common.enums.betriebsStatus.${wert}`);
}

/**
 * Leitet aus der Messkanal-Detail-Query ein reines Anzeige-Modell ab.
 * Messkanal ist NICHT-PII — alle Felder über den generischen
 * `fields`-Renderer. `zaehlerId` wird zusätzlich roh zurückgegeben (Link
 * „Zurück zum Zähler").
 */
export function useMesskanalDetailView(messkanalId: string): MesskanalDetailView {
  const query = useMesskanalDetail(messkanalId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.messkanal.detail.id'), value: detail.id },
        { key: 'zaehlerId', label: t('stammdaten.messkanal.detail.zaehlerId'), value: detail.zaehlerId },
        { key: 'messgroesse', label: t('stammdaten.messkanal.detail.messgroesse'), value: detail.messgroesse },
        { key: 'einheit', label: t('stammdaten.messkanal.detail.einheit'), value: detail.einheit },
        { key: 'art', label: t('stammdaten.messkanal.detail.art'), value: artLabel(detail.art) },
        { key: 'status', label: t('stammdaten.messkanal.detail.status'), value: statusLabel(detail.status) },
        {
          key: 'richtung',
          label: t('stammdaten.messkanal.detail.richtung'),
          value: t(`stammdaten.messkanal.richtung.${detail.richtung}`),
        },
        {
          key: 'istUntermessung',
          label: t('stammdaten.messkanal.detail.istUntermessungLabel'),
          value: detail.istUntermessung
            ? t('stammdaten.messkanal.detail.istUntermessungJa')
            : t('stammdaten.messkanal.detail.istUntermessungNein'),
        },
        {
          key: 'obisKennzahl',
          label: t('stammdaten.messkanal.detail.obisKennzahl'),
          value: detail.obisKennzahl ?? t('stammdaten.common.keineAngabe'),
        },
        { key: 'createdAt', label: t('stammdaten.messkanal.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
        { key: 'updatedAt', label: t('stammdaten.messkanal.detail.updatedAt'), value: formatiereZeitpunkt(detail.updatedAt) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    zaehlerId: detail?.zaehlerId,
    istStillgelegt: detail?.status === 'stillgelegt',
  };
}
