// Zod-Formular-Schema für „Förderjahr anlegen" — Feldgrenzen 1:1 gegen
// `FoerderjahrAnlegenDto` (`src/backend/src/nachweis/dto/foerderjahr-anlegen.dto.ts`)
// gespiegelt (analog `systemAnlegenFormSchema.ts`).
//
// `nummer` bleibt bewusst ein `string` im Formularzustand (`EntityForm`s
// `kind: 'number'` speichert `string`, s. dortiger Kommentar) und wird erst
// in `toFoerderjahrAnlegenPayload` nach `number` gewandelt.
//
// `vonMonat`/`bisMonat` sind BEIDE INKLUSIVE Monatsanfänge (anders als
// `BerechnungslaufAnlegen.periodeBis`, dort exklusiv). Der Server prüft das
// ebenfalls (Service + DB-CHECKs `ck_foerderjahr_von_monat_erster`/
// `…_bis_monat_erster`) — hier gespiegelt, damit der Fehler am Feld statt als
// Server-Fehlermeldung erscheint.
//
// `vonTag`/`bisTag` sind OPTIONAL (seit V0070) und für den Fall gedacht, dass
// das Förderjahr aus einem Bewilligungsbescheid stammt und nicht am
// Monatsersten beginnt — Kap. 9.1 des Technischen Merkblatts v2.2 verlangt
// dann die zeitanteilige Ermittlung. Bleiben sie leer, gilt das volle
// Monatsfenster. `bisTag` ist EXKLUSIV, `bisMonat` INKLUSIV; die drei
// Refinements unten fangen genau die Verwechslungen ab, die daraus entstehen.

import { z } from 'zod';
import type { DefinitionQuelle, FoerderjahrAnlegen } from '@edms/shared';
import { t } from '../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen. */
export const DEFINITION_QUELLE_WERTE: readonly DefinitionQuelle[] = ['kalenderjahr', 'bewilligungszeitraum'];

const CODE_MUSTER = /^[A-Za-z0-9_-]+$/;
const MONATSERSTER_MUSTER = /^\d{4}-\d{2}-01$/;
const GANZZAHL_MUSTER = /^\d+$/;
/** Ein Kalendertag ODER leer — die Tagesangaben sind optional. */
const TAG_ODER_LEER_MUSTER = /^(\d{4}-\d{2}-\d{2})?$/;

export const foerderjahrAnlegenFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, t('nachweis.foerderjahr.form.errors.codeErforderlich'))
      .max(32, t('nachweis.foerderjahr.form.errors.codeZuLang'))
      .regex(CODE_MUSTER, t('nachweis.foerderjahr.form.errors.codeZeichen')),
    vorhabenRef: z
      .string()
      .trim()
      .min(1, t('nachweis.foerderjahr.form.errors.vorhabenRefErforderlich'))
      .max(128, t('nachweis.foerderjahr.form.errors.vorhabenRefZuLang')),
    nummer: z
      .string()
      .trim()
      .regex(GANZZAHL_MUSTER, t('nachweis.foerderjahr.form.errors.nummerUngueltig'))
      .refine((wert) => Number(wert) >= 1 && Number(wert) <= 20, t('nachweis.foerderjahr.form.errors.nummerBereich')),
    vonMonat: z.string().regex(MONATSERSTER_MUSTER, t('nachweis.foerderjahr.form.errors.vonMonatErster')),
    bisMonat: z.string().regex(MONATSERSTER_MUSTER, t('nachweis.foerderjahr.form.errors.bisMonatErster')),
    vonTag: z.string().regex(TAG_ODER_LEER_MUSTER, t('nachweis.foerderjahr.form.errors.tagFormat')),
    bisTag: z.string().regex(TAG_ODER_LEER_MUSTER, t('nachweis.foerderjahr.form.errors.tagFormat')),
    definitionQuelle: z.string().min(1, t('nachweis.foerderjahr.form.errors.definitionQuelleErforderlich')),
    bescheidRef: z.string().trim().max(128, t('nachweis.foerderjahr.form.errors.bescheidRefZuLang')),
  })
  // Der Fehler hängt am ZWEITEN Feld (`bisMonat`) — dort steht die Eingabe,
  // die der Nutzer korrigieren muss, und `EntityForm` fokussiert das erste
  // fehlerhafte Feld in Anzeigereihenfolge.
  .refine((werte) => werte.bisMonat >= werte.vonMonat, {
    path: ['bisMonat'],
    message: t('nachweis.foerderjahr.form.errors.bisVorVon'),
  })
  // Eine halbe Angabe waere ein Foerderjahr, dessen eines Ende beschieden und
  // dessen anderes gerundet ist.
  .refine((werte) => (werte.vonTag === '') === (werte.bisTag === ''), {
    path: ['bisTag'],
    message: t('nachweis.foerderjahr.form.errors.tageNurGemeinsam'),
  })
  .refine((werte) => werte.vonTag === '' || werte.bisTag === '' || werte.vonTag < werte.bisTag, {
    path: ['bisTag'],
    message: t('nachweis.foerderjahr.form.errors.tagBisVorVon'),
  })
  // Die Monatsangaben sind das Etikett der taggenauen Grenzen. Laufen sie
  // auseinander, wiese die Liste ein anderes Foerderjahr aus als der Nachweis
  // rechnet — der Server weist das ab, hier steht es am Feld.
  .refine((werte) => werte.vonTag === '' || werte.vonTag.slice(0, 7) === werte.vonMonat.slice(0, 7), {
    path: ['vonTag'],
    message: t('nachweis.foerderjahr.form.errors.vonTagAusserhalb'),
  })
  .refine((werte) => werte.bisTag === '' || letzterTagMonat(werte.bisTag) === werte.bisMonat.slice(0, 7), {
    path: ['bisTag'],
    message: t('nachweis.foerderjahr.form.errors.bisTagAusserhalb'),
  });

/**
 * Der Monat des LETZTEN enthaltenen Tages — `bisTag` ist exklusiv.
 *
 * Läuft ein Förderjahr bis zum 11.01., ist der Januar sein letzter Monat,
 * obwohl `bisTag` auf den 12.01. zeigt. Ohne diesen Schritt läge die Grenze
 * für jedes Förderjahr, das an einem Monatsersten endet, einen Monat daneben.
 */
function letzterTagMonat(bisTagExklusiv: string): string {
  return new Date(Date.parse(`${bisTagExklusiv}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 7);
}

export type FoerderjahrAnlegenFormValues = z.infer<typeof foerderjahrAnlegenFormSchema>;

export const foerderjahrAnlegenFormDefaultValues: FoerderjahrAnlegenFormValues = {
  code: '',
  vorhabenRef: '',
  nummer: '',
  vonMonat: '',
  bisMonat: '',
  vonTag: '',
  bisTag: '',
  definitionQuelle: '',
  bescheidRef: '',
};

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `FoerderjahrAnlegen`. */
export function toFoerderjahrAnlegenPayload(values: FoerderjahrAnlegenFormValues): FoerderjahrAnlegen {
  const bescheidRef = values.bescheidRef.trim();
  return {
    code: values.code.trim(),
    vorhabenRef: values.vorhabenRef.trim(),
    nummer: Number(values.nummer),
    vonMonat: values.vonMonat,
    bisMonat: values.bisMonat,
    // Leer heisst: volles Monatsfenster. Die Felder werden dann GAR NICHT
    // gesendet — ein leerer String waere kein Datum, und der Server soll
    // nicht zwischen „nicht angegeben" und „leer" raten muessen.
    ...(values.vonTag !== '' && values.bisTag !== '' ? { vonTag: values.vonTag, bisTag: values.bisTag } : {}),
    definitionQuelle: values.definitionQuelle as DefinitionQuelle,
    ...(bescheidRef.length > 0 ? { bescheidRef } : {}),
  };
}
