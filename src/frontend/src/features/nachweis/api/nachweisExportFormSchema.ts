// Zod-Formular-Schema für „Nachweis-Export erzeugen" — gegen
// `NachweisExportErzeugenDto` (`src/backend/src/nachweis/dto/nachweis-export-erzeugen.dto.ts`)
// gespiegelt, ABER bewusst ENGER als das DTO. Zwei Werte, die der Server
// entgegennähme, werden hier gar nicht erst anbietbar:
//
// **`zweck='wissenschaftliche_auswertung'` — nicht anbietbar (Auflage A23).**
// Der Wert ist fail-closed gesperrt (DB-CHECK
// `ck_export_zweck_wiss_auswertung_gesperrt`, V0025; der Service weist ihn
// zusätzlich mit 403 ab), solange Empfänger, Rolle (Art. 26 vs. 28) und
// Rechtsgrundlage ungeklärt sind. Ein Auswahleintrag, der zuverlässig in
// einen Fehler läuft, wäre eine Attrappe.
//
// **`stationDarstellung='klarname'` — nicht anbietbar (Auflage A21/A13).**
// Der Klarname der Klimastation verlangt eine Zweitfreigabe (Antragsteller ≠
// Freigeber). Die ist NICHT gebaut — das DTO sagt es selbst: „für
// `stationDarstellung='klarname'` bleibt das Vier-Augen-Prinzip in v1
// UNGESICHERT (nur RBAC `@Roles('betrieb')`)". Diesen Weg einen Klick weit
// entfernt anzubieten, würde einen ungesicherten Pfad bequem machen. Die
// Oberfläche sendet das Feld gar nicht; der Server setzt seinen Default
// `pseudonymisiert` (Art. 25 Abs. 2).
//
// Folgerichtig entfällt auch `anfrageRef`: Es ist im DTO die aktenkundige
// Anforderung FÜR den Klarnamen (`@ValidateIf(stationDarstellung ===
// 'klarname')`). Ohne den Klarnamen-Weg hätte das Feld keinen Anlass.

import { z } from 'zod';
import type { ExportStationDarstellung, NachweisExportErzeugen, NachweisExportZweck } from '@edms/shared';
import { t } from '../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge. `wissenschaftliche_auswertung` fehlt bewusst — s. Dateikopf (A23). */
export const NACHWEIS_EXPORT_ZWECK_WERTE: readonly NachweisExportZweck[] = ['nachweis', 'erfolgskontrolle'];

export const nachweisExportErzeugenFormSchema = z.object({
  zweck: z.string().min(1, t('nachweis.export.form.errors.zweckErforderlich')),
});

export type NachweisExportErzeugenFormValues = z.infer<typeof nachweisExportErzeugenFormSchema>;

export const nachweisExportErzeugenFormDefaultValues: NachweisExportErzeugenFormValues = {
  zweck: 'nachweis',
};

/**
 * Die pseudonymisierte Stationsdarstellung ist der Default des Servers und
 * wird hier TROTZDEM ausdrücklich mitgesendet: Ein weggelassenes Feld
 * überlässt die datenschutzrechtlich maßgebliche Entscheidung einem Default,
 * der sich ändern könnte, ohne dass diese Oberfläche es merkt.
 */
const STATION_DARSTELLUNG: ExportStationDarstellung = 'pseudonymisiert';

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `NachweisExportErzeugen`. */
export function toNachweisExportErzeugenPayload(values: NachweisExportErzeugenFormValues): NachweisExportErzeugen {
  return { zweck: values.zweck as NachweisExportZweck, stationDarstellung: STATION_DARSTELLUNG };
}
