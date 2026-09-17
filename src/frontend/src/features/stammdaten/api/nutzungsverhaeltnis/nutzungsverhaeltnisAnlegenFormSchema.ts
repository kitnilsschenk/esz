// Zod-Formular-Schema für „Nutzungsverhältnis anlegen" — Feldgrenzen 1:1
// gegen `NutzungsverhaeltnisAnlegenDto` gespiegelt (analog
// `zaehlerAnlegenFormSchema.ts`). Referenzkonsistenz (anschlussnutzerId/
// systemId müssen zum gewählten endkundeId gehören) prüft AUSSCHLIESSLICH
// der Server (400, problem+json) — kein Client-seitiger Vorab-Check.

import { z } from 'zod';
import type { Datenklasse, NutzungsRolle, NutzungsverhaeltnisAnlegen } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen (view-hook). */
export const DATENKLASSE_WERTE: readonly Datenklasse[] = ['abrechnungsminimum', 'detailverbrauch'];
export const NUTZUNGS_ROLLE_WERTE: readonly NutzungsRolle[] = [
  'mieter',
  'eigentuemer_selbstnutzer',
  'gewerbe_nutzer',
  'sonstige',
];

export const nutzungsverhaeltnisAnlegenFormSchema = z.object({
  endkundeId: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.endkundeErforderlich')),
  anschlussnutzerId: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.anschlussnutzerErforderlich')),
  systemId: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.systemErforderlich')),
  datenklasse: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.datenklasseErforderlich')),
  rolle: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.rolleErforderlich')),
  gueltigVon: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.gueltigVonErforderlich')),
});

export type NutzungsverhaeltnisAnlegenFormValues = z.infer<typeof nutzungsverhaeltnisAnlegenFormSchema>;

export const nutzungsverhaeltnisAnlegenFormDefaultValues: NutzungsverhaeltnisAnlegenFormValues = {
  endkundeId: '',
  anschlussnutzerId: '',
  systemId: '',
  datenklasse: 'abrechnungsminimum',
  rolle: '',
  gueltigVon: '',
};

/**
 * Wandelt den Wert eines `<input type="date">`-Felds (`YYYY-MM-DD`) in einen
 * `format: date-time`-konformen ISO-String um (Mitternacht UTC) — die API
 * erwartet `date-time` (`schemas/openapi/stammdaten.openapi.yaml`), das
 * `EntityForm`-`date`-Feld liefert bewusst nur ein Datum (kein Uhrzeit-Input
 * in diesem Pass).
 */
function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/**
 * Mappt die (validierten) Formularwerte auf das API-Request-DTO
 * `NutzungsverhaeltnisAnlegen`. Die Casts auf `Datenklasse`/`NutzungsRolle`
 * sind sicher — beide Felder sind `select`-Felder mit ausschließlich
 * `DATENKLASSE_WERTE`/`NUTZUNGS_ROLLE_WERTE`-Optionen (view-hook).
 */
export function toNutzungsverhaeltnisAnlegenPayload(values: NutzungsverhaeltnisAnlegenFormValues): NutzungsverhaeltnisAnlegen {
  return {
    endkundeId: values.endkundeId,
    anschlussnutzerId: values.anschlussnutzerId,
    systemId: values.systemId,
    datenklasse: values.datenklasse as Datenklasse,
    rolle: values.rolle as NutzungsRolle,
    gueltigVon: toIsoDateTime(values.gueltigVon),
  };
}
