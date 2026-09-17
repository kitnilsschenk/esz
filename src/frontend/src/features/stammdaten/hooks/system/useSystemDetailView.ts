import type { BetriebsStatus } from '@edms/shared';
import { useSystemDetail } from '../../api/system';
import type { DetailField } from '../../components/shared';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

export interface SystemDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  /** Steuert Sichtbarkeit/Deaktivierung der „Stilllegen"-Aktion in der Ansicht. */
  readonly istStillgelegt: boolean;
}

function statusLabel(wert: BetriebsStatus): string {
  return t(`stammdaten.common.enums.betriebsStatus.${wert}`);
}

/**
 * Leitet aus der System-Detail-Query ein reines Anzeige-Modell ab
 * (`DetailField[]` für `DetailView`). System ist NICHT-PII (ADR-0008 §23 /
 * D11 Pass 1) — alle Felder laufen über den generischen `fields`-Renderer,
 * kein `PiiMaskedField` nötig (anders als bei Endkunde).
 */
export function useSystemDetailView(systemId: string): SystemDetailView {
  const query = useSystemDetail(systemId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.system.detail.id'), value: detail.id },
        { key: 'endkundeId', label: t('stammdaten.system.detail.endkundeId'), value: detail.endkundeId },
        { key: 'bezeichnung', label: t('stammdaten.system.detail.bezeichnung'), value: detail.bezeichnung },
        { key: 'systemgrenze', label: t('stammdaten.system.detail.systemgrenze'), value: detail.systemgrenze },
        {
          key: 'standort',
          label: t('stammdaten.system.detail.standort'),
          // Bewusst die Kennung und nicht der Name: Der liegt
          // feldverschluesselt in `identity.*`, und ein zweiter
          // Aufloesungs-Aufruf nur fuer diese eine Zeile waere hier
          // unverhaeltnismaessig. Im Aendern-Formular steht der Klartext.
          value: detail.standortId ?? t('stammdaten.common.keineAngabe'),
        },
        {
          key: 'systembeschreibung',
          label: t('stammdaten.system.detail.systembeschreibung'),
          value: detail.systembeschreibung ?? t('stammdaten.common.keineAngabe'),
        },
        { key: 'status', label: t('stammdaten.system.detail.status'), value: statusLabel(detail.status) },
        { key: 'createdAt', label: t('stammdaten.system.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
        { key: 'updatedAt', label: t('stammdaten.system.detail.updatedAt'), value: formatiereZeitpunkt(detail.updatedAt) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    istStillgelegt: detail?.status === 'stillgelegt',
  };
}
