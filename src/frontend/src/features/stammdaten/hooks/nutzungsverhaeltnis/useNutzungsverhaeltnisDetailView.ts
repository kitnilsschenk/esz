import type { Datenklasse, NutzungsRolle } from '@edms/shared';
import { useNutzungsverhaeltnisDetail } from '../../api/nutzungsverhaeltnis';
import type { DetailField } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt, formatiereZeitpunktOder } from '../../../../shared/format/datum';

export interface NutzungsverhaeltnisDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  /** Steuert Sichtbarkeit der „Beenden"-Aktion in der Ansicht. */
  readonly istBeendet: boolean;
}

function datenklasseLabel(wert: Datenklasse): string {
  return t(`stammdaten.common.enums.datenklasse.${wert}`);
}

function rolleLabel(wert: NutzungsRolle): string {
  return t(`stammdaten.common.enums.nutzungsRolle.${wert}`);
}

/**
 * Leitet aus der Nutzungsverhältnis-Detail-Query ein reines Anzeige-Modell
 * ab. Nutzungsverhältnis ist NICHT-PII (Beziehungs-Attribute, keine
 * Personendaten) — alle Felder über den generischen `fields`-Renderer.
 */
export function useNutzungsverhaeltnisDetailView(nutzungsverhaeltnisId: string): NutzungsverhaeltnisDetailView {
  const query = useNutzungsverhaeltnisDetail(nutzungsverhaeltnisId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.nutzungsverhaeltnis.detail.id'), value: detail.id },
        { key: 'endkundeId', label: t('stammdaten.nutzungsverhaeltnis.detail.endkundeId'), value: detail.endkundeId },
        {
          key: 'anschlussnutzerId',
          label: t('stammdaten.nutzungsverhaeltnis.detail.anschlussnutzerId'),
          value: detail.anschlussnutzerId,
        },
        { key: 'systemId', label: t('stammdaten.nutzungsverhaeltnis.detail.systemId'), value: detail.systemId },
        {
          key: 'datenklasse',
          label: t('stammdaten.nutzungsverhaeltnis.detail.datenklasse'),
          value: datenklasseLabel(detail.datenklasse),
        },
        { key: 'rolle', label: t('stammdaten.nutzungsverhaeltnis.detail.rolle'), value: rolleLabel(detail.rolle) },
        { key: 'gueltigVon', label: t('stammdaten.nutzungsverhaeltnis.detail.gueltigVon'), value: formatiereZeitpunkt(detail.gueltigVon) },
        {
          key: 'gueltigBis',
          label: t('stammdaten.nutzungsverhaeltnis.detail.gueltigBis'),
          value: formatiereZeitpunktOder(detail.gueltigBis, t('stammdaten.nutzungsverhaeltnis.detail.gueltigBisAktuell')),
        },
        { key: 'createdAt', label: t('stammdaten.nutzungsverhaeltnis.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
        { key: 'updatedAt', label: t('stammdaten.nutzungsverhaeltnis.detail.updatedAt'), value: formatiereZeitpunkt(detail.updatedAt) },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    istBeendet: detail?.gueltigBis !== null && detail?.gueltigBis !== undefined,
  };
}
