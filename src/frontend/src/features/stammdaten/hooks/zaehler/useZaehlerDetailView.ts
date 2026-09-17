import type { GeraetAnbindung } from '@edms/shared';
import type { BetriebsStatus, Energietraeger } from '@edms/shared';
import { useZaehlerDetail } from '../../api/zaehler';
import type { DetailField } from '../../components/shared';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  /** Steuert Sichtbarkeit/Deaktivierung der „Stilllegen"-Aktion in der Ansicht. */
  readonly istStillgelegt: boolean;
  /** Freitext-Gerätetyp — bestimmt, welche Messkanäle erwartet werden (ADR-0011). */
  readonly geraetetyp: string | undefined;
  /** `geraetAnbindung` des Zählers durchgereicht — `null` = derzeit keine aktive Zuordnung (ADR-0011 D7). */
  readonly geraetAnbindung: GeraetAnbindung | null;
}

function energietraegerLabel(wert: Energietraeger): string {
  return t(`stammdaten.common.enums.energietraeger.${wert}`);
}

function statusLabel(wert: BetriebsStatus): string {
  return t(`stammdaten.common.enums.betriebsStatus.${wert}`);
}

/**
 * Leitet aus der Zähler-Detail-Query ein reines Anzeige-Modell ab. Zähler
 * ist NICHT-PII — alle Felder über den generischen `fields`-Renderer.
 */
export function useZaehlerDetailView(zaehlerId: string): ZaehlerDetailView {
  const query = useZaehlerDetail(zaehlerId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.zaehler.detail.id'), value: detail.id },
        { key: 'systemId', label: t('stammdaten.zaehler.detail.systemId'), value: detail.systemId },
        { key: 'geraetetyp', label: t('stammdaten.zaehler.detail.geraetetyp'), value: detail.geraetetyp },
        {
          key: 'energietraeger',
          label: t('stammdaten.zaehler.detail.energietraeger'),
          value: energietraegerLabel(detail.energietraeger),
        },
        { key: 'status', label: t('stammdaten.zaehler.detail.status'), value: statusLabel(detail.status) },
        { key: 'createdAt', label: t('stammdaten.zaehler.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
        { key: 'updatedAt', label: t('stammdaten.zaehler.detail.updatedAt'), value: formatiereZeitpunkt(detail.updatedAt) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    istStillgelegt: detail?.status === 'stillgelegt',
    geraetetyp: detail?.geraetetyp,
    geraetAnbindung: detail?.geraetAnbindung ?? null,
  };
}
