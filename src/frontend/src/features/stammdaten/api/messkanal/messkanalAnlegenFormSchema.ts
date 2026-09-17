// Zod-Formular-Schema für „Messkanal anlegen" — Feldgrenzen 1:1 gegen
// `MesskanalAnlegenDto` gespiegelt (analog `zaehlerAnlegenFormSchema.ts`).
// `zaehlerId` ist KEIN Formularfeld — die Anlegen-Seite ist unter
// `/stammdaten/zaehler/:zaehlerId/messkanaele/neu` geroutet (Sub-Ressource).

import { z } from 'zod';
import type { MessgroesseArt, Messrichtung } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';
import type { MesskanalAnlegenInput } from './messkanalApi';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen (view-hook). */
export const MESSGROESSE_ART_WERTE: readonly MessgroesseArt[] = ['kumulativ_zaehlerstand', 'intervall_verbrauch'];

/**
 * Reihenfolge = Anzeigereihenfolge. `bezug` zuerst, weil es der Regelfall
 * ist und die Vorauswahl bleibt.
 */
export const MESSRICHTUNG_WERTE: readonly Messrichtung[] = ['bezug', 'eigenerzeugung', 'einspeisung'];

export const messkanalAnlegenFormSchema = z.object({
  messgroesse: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkanal.form.errors.messgroesseErforderlich'))
    .max(100, t('stammdaten.messkanal.form.errors.messgroesseZuLang')),
  einheit: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkanal.form.errors.einheitErforderlich'))
    .max(50, t('stammdaten.messkanal.form.errors.einheitZuLang')),
  art: z.string().min(1, t('stammdaten.messkanal.form.errors.artErforderlich')),
  obisKennzahl: z.string().trim().max(50, t('stammdaten.messkanal.form.errors.obisKennzahlZuLang')),
  istUntermessung: z.boolean(),
  richtung: z.string().min(1, t('stammdaten.messkanal.form.errors.richtungErforderlich')),
});

export type MesskanalAnlegenFormValues = z.infer<typeof messkanalAnlegenFormSchema>;

export const messkanalAnlegenFormDefaultValues: MesskanalAnlegenFormValues = {
  messgroesse: '',
  einheit: '',
  art: '',
  obisKennzahl: '',
  // Die Hauptmessung ist der Regelfall — ein stilles `true` naehme einen Kanal
  // unbemerkt aus der Einsparberechnung.
  istUntermessung: false,
  // `bezug` ist der Regelfall. Eine Einspeisung wird vom Ist-Verbrauch
  // ABGEZOGEN — das darf nie die Vorauswahl sein.
  richtung: 'bezug',
};

/**
 * Mappt die (validierten) Formularwerte + die Routen-`zaehlerId` auf das
 * API-Request-Eingabeobjekt `MesskanalAnlegenInput`. Der Cast auf
 * `MessgroesseArt` ist sicher (siehe `zaehlerAnlegenFormSchema.ts`s
 * analoge Begründung für `energietraeger`).
 */
export function toMesskanalAnlegenPayload(values: MesskanalAnlegenFormValues, zaehlerId: string): MesskanalAnlegenInput {
  const obisKennzahl = values.obisKennzahl.trim();
  return {
    zaehlerId,
    messgroesse: values.messgroesse.trim(),
    einheit: values.einheit.trim(),
    art: values.art as MessgroesseArt,
    istUntermessung: values.istUntermessung,
    richtung: values.richtung as Messrichtung,
    ...(obisKennzahl.length > 0 ? { obisKennzahl } : {}),
  };
}
