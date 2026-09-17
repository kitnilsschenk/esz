// Zod-Formular-Schema für „Einspar-Lauf starten" — Feldgrenzen 1:1 gegen
// `EinsparlaufAnlegenDto` (`src/backend/src/nachweis/dto/einsparlauf-anlegen.dto.ts`)
// gespiegelt.
//
// `foerderjahrId` und `preflightId` sind NICHT Teil des Formulars: Der Lauf
// wird ausschließlich AUS EINEM Preflight heraus gestartet
// (`/nachweis/preflights/:preflightId/einsparlauf-neu`), beide Werte stehen
// damit fest. Das ist die Umsetzung der Ketten-Reihenfolge
// Förderjahr → Preflight → Einspar-Lauf (D4): Ein Formular, in dem man einen
// beliebigen Preflight eintippen kann, könnte einen roten Preflight mit
// `art=foerderjahr_nachweis` kombinieren — der Server lehnt das ab (409),
// aber eine Eingabemaske, die verlässlich scheitert, ist ein Fehler in der
// Oberfläche.

import { z } from 'zod';
import type { EinsparlaufAnlegen, EinsparlaufArt, EinsparlaufAusloeser } from '@edms/shared';
import { t } from '../../../shared/i18n/t';

/**
 * Reihenfolge = Anzeigereihenfolge. `foerderjahr_nachweis` steht zuerst, wird
 * aber NUR angeboten, wenn der Preflight grün ist (s.
 * `useEinsparlaufAnlegenView`) — `zwischenstand` darf auf einem roten
 * Preflight aufsetzen.
 */
export const EINSPARLAUF_ART_WERTE: readonly EinsparlaufArt[] = ['foerderjahr_nachweis', 'zwischenstand'];

/**
 * `job` fehlt bewusst: Dieser Wert kennzeichnet einen serverseitig
 * angestoßenen Lauf. Ihn in einer Maske anzubieten, die ein Mensch bedient,
 * hieße, die Herkunft eines Nachweis-Laufs falsch beurkunden zu können.
 */
export const EINSPARLAUF_AUSLOESER_WERTE: readonly EinsparlaufAusloeser[] = ['manuell', 'korrektur'];

export const einsparlaufAnlegenFormSchema = z.object({
  art: z.string().min(1, t('nachweis.einsparlauf.form.errors.artErforderlich')),
  ausloeser: z.string().min(1, t('nachweis.einsparlauf.form.errors.ausloeserErforderlich')),
  /** Optional — leer heißt „kein Vorgänger-Lauf wird abgelöst". */
  ersetztEinsparlaufId: z.string(),
});

export type EinsparlaufAnlegenFormValues = z.infer<typeof einsparlaufAnlegenFormSchema>;

export const einsparlaufAnlegenFormDefaultValues: EinsparlaufAnlegenFormValues = {
  art: '',
  ausloeser: 'manuell',
  ersetztEinsparlaufId: '',
};

export interface EinsparlaufAnlegenKontext {
  readonly foerderjahrId: string;
  readonly preflightId: string;
}

/** Mappt die (validierten) Formularwerte + den Ketten-Kontext auf `EinsparlaufAnlegen`. */
export function toEinsparlaufAnlegenPayload(
  values: EinsparlaufAnlegenFormValues,
  kontext: EinsparlaufAnlegenKontext,
): EinsparlaufAnlegen {
  const ersetztEinsparlaufId = values.ersetztEinsparlaufId.trim();
  return {
    foerderjahrId: kontext.foerderjahrId,
    preflightId: kontext.preflightId,
    art: values.art as EinsparlaufArt,
    ausloeser: values.ausloeser as EinsparlaufAusloeser,
    ...(ersetztEinsparlaufId.length > 0 ? { ersetztEinsparlaufId } : {}),
  };
}
