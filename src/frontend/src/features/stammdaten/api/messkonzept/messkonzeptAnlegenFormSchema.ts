// Zod-Formular-Schema für „Neue Messkonzept-Version anlegen" — Feldgrenzen
// 1:1 gegen `MesskonzeptVersionAnlegenDto`/`EnergietraegerBaselineDto`
// (`src/backend/src/stammdaten/messkonzept/dto/*.ts`) gespiegelt.
//
// Eigenes (NICHT `EntityForm`-basiertes) Schema, weil `energietraeger` ein
// wiederholbares Array aus Objekten ist (`ArrayMinSize(1)`/`ArrayMaxSize(20)`
// serverseitig) — `EntityForm`s generischer Feldrenderer kennt aktuell nur
// skalare Felder (`text|textarea|checkbox|select|date`, siehe dortiger
// Kommentar). `MesskonzeptVersionAnlegenFormular` verwendet dieses Schema
// daher in einem dedizierten Formular (Entscheidung dokumentiert im
// Abschlussbericht), reicht aber alle anderen Primitive weiter (`t()`,
// `enumSelectOptions`, aria-Pattern von `EntityForm`).

import { z } from 'zod';
import type { Energietraeger, MesskonzeptTyp, MesskonzeptVersionAnlegen } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen. */
export const MESSKONZEPT_TYP_WERTE: readonly MesskonzeptTyp[] = ['vereinfacht', 'standard', 'alternativ'];
export const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

const energietraegerZeileSchema = z.object({
  energietraeger: z.string().min(1, t('stammdaten.messkonzept.form.errors.energietraegerErforderlich')),
  baselineWert: z
    .string()
    .trim()
    .refine((wert) => wert.length === 0 || !Number.isNaN(Number(wert)), t('stammdaten.messkonzept.form.errors.baselineWertUngueltig')),
  baselineEinheit: z.string().trim().max(50, t('stammdaten.messkonzept.form.errors.baselineEinheitZuLang')),
  baselineMethode: z.string().trim().max(200, t('stammdaten.messkonzept.form.errors.baselineMethodeZuLang')),
  baselineBegruendung: z.string().trim().max(2000, t('stammdaten.messkonzept.form.errors.baselineBegruendungZuLang')),
  /**
   * TB-02 ([Q3] Kap. 2.1.2) — der externe Belegverweis (V0065).
   *
   * Die Anzahl ist als String geführt wie `baselineWert`: ein leeres Feld
   * heißt „nicht erfasst", nicht „null Abrechnungen". Bei einem Wert unter
   * drei verlangt der Server eine Begründung.
   *
   * `baselineBelegRef` (uuid) ist hier BEWUSST NICHT mehr enthalten: Das
   * Feld ist im Datenmodell als Slot für die spätere Beleg-Ablage
   * reserviert und verweist heute auf nichts. Als Eingabefeld war es eine
   * Falle — wer dort eine UUID einträgt, glaubt, einen Beleg zu hinterlegen.
   * Die API führt den Slot weiter.
   */
  baselineAbrechnungenAnzahl: z
    .string()
    .trim()
    .refine(
      (wert) => wert.length === 0 || /^\d{1,2}$/.test(wert),
      t('stammdaten.messkonzept.form.errors.baselineAbrechnungenAnzahlUngueltig'),
    ),
  baselineBelegAktenzeichen: z.string().trim().max(200, t('stammdaten.messkonzept.form.errors.baselineBelegAktenzeichenZuLang')),
  baselineBelegAblageort: z.string().trim().max(200, t('stammdaten.messkonzept.form.errors.baselineBelegAblageortZuLang')),
  // ADR-0007 O-B3b — einziges NICHT-String-Feld der Zeile (Checkbox statt
  // Texteingabe): ein Substitutionsfall ist eine Ja/Nein-Feststellung des
  // Betriebs-Teams, kein Freitext. Bewusst OHNE `.refine` — es gibt keinen
  // ungueltigen Zustand, den ein Nutzer hier herstellen koennte.
  energietraegerSubstitution: z.boolean(),
});

export type MesskonzeptEnergietraegerZeileValues = z.infer<typeof energietraegerZeileSchema>;

export const messkonzeptEnergietraegerZeileDefaultValues: MesskonzeptEnergietraegerZeileValues = {
  energietraeger: '',
  baselineWert: '',
  baselineEinheit: '',
  baselineMethode: '',
  baselineBegruendung: '',
  baselineAbrechnungenAnzahl: '',
  baselineBelegAktenzeichen: '',
  baselineBelegAblageort: '',
  energietraegerSubstitution: false,
};

export const messkonzeptVersionAnlegenFormSchema = z.object({
  typ: z.string().min(1, t('stammdaten.messkonzept.form.errors.typErforderlich')),
  systemgrenze: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkonzept.form.errors.systemgrenzeErforderlich'))
    .max(4000, t('stammdaten.messkonzept.form.errors.systemgrenzeZuLang')),
  systembeschreibung: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkonzept.form.errors.systembeschreibungErforderlich'))
    .max(4000, t('stammdaten.messkonzept.form.errors.systembeschreibungZuLang')),
  bereinigungsverfahren: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkonzept.form.errors.bereinigungsverfahrenErforderlich'))
    .max(4000, t('stammdaten.messkonzept.form.errors.bereinigungsverfahrenZuLang')),
  messgeraeteWahl: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkonzept.form.errors.messgeraeteWahlErforderlich'))
    .max(4000, t('stammdaten.messkonzept.form.errors.messgeraeteWahlZuLang')),
  geraeteerkennungsVerfahren: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkonzept.form.errors.geraeteerkennungsVerfahrenErforderlich'))
    .max(4000, t('stammdaten.messkonzept.form.errors.geraeteerkennungsVerfahrenZuLang')),
  aenderungsgrund: z.string().trim().max(2000, t('stammdaten.messkonzept.form.errors.aenderungsgrundZuLang')),
  energietraeger: z
    .array(energietraegerZeileSchema)
    .min(1, t('stammdaten.messkonzept.form.errors.energietraegerListeErforderlich'))
    .max(20, t('stammdaten.messkonzept.form.errors.energietraegerListeZuLang')),
});

export type MesskonzeptVersionAnlegenFormValues = z.infer<typeof messkonzeptVersionAnlegenFormSchema>;

export const messkonzeptVersionAnlegenFormDefaultValues: MesskonzeptVersionAnlegenFormValues = {
  typ: '',
  systemgrenze: '',
  systembeschreibung: '',
  bereinigungsverfahren: '',
  messgeraeteWahl: '',
  geraeteerkennungsVerfahren: '',
  aenderungsgrund: '',
  energietraeger: [messkonzeptEnergietraegerZeileDefaultValues],
};

/**
 * Mappt die (validierten) Formularwerte auf das API-Request-DTO
 * `MesskonzeptVersionAnlegen`. Die Casts auf `MesskonzeptTyp`/`Energietraeger`
 * sind sicher — beide kommen aus `select`-Feldern mit ausschließlich
 * `MESSKONZEPT_TYP_WERTE`/`ENERGIETRAEGER_WERTE`-Optionen.
 */
export function toMesskonzeptVersionAnlegenPayload(values: MesskonzeptVersionAnlegenFormValues): MesskonzeptVersionAnlegen {
  const aenderungsgrund = values.aenderungsgrund.trim();
  return {
    typ: values.typ as MesskonzeptTyp,
    systemgrenze: values.systemgrenze.trim(),
    systembeschreibung: values.systembeschreibung.trim(),
    bereinigungsverfahren: values.bereinigungsverfahren.trim(),
    messgeraeteWahl: values.messgeraeteWahl.trim(),
    geraeteerkennungsVerfahren: values.geraeteerkennungsVerfahren.trim(),
    ...(aenderungsgrund.length > 0 ? { aenderungsgrund } : {}),
    energietraeger: values.energietraeger.map((zeile) => {
      const baselineWert = zeile.baselineWert.trim();
      const baselineEinheit = zeile.baselineEinheit.trim();
      const baselineMethode = zeile.baselineMethode.trim();
      const baselineBegruendung = zeile.baselineBegruendung.trim();
      const baselineAbrechnungenAnzahl = zeile.baselineAbrechnungenAnzahl.trim();
      const baselineBelegAktenzeichen = zeile.baselineBelegAktenzeichen.trim();
      const baselineBelegAblageort = zeile.baselineBelegAblageort.trim();
      return {
        energietraeger: zeile.energietraeger as Energietraeger,
        ...(baselineWert.length > 0 ? { baselineWert: Number(baselineWert) } : {}),
        ...(baselineEinheit.length > 0 ? { baselineEinheit } : {}),
        ...(baselineMethode.length > 0 ? { baselineMethode } : {}),
        ...(baselineBegruendung.length > 0 ? { baselineBegruendung } : {}),
        ...(baselineAbrechnungenAnzahl.length > 0 ? { baselineAbrechnungenAnzahl: Number(baselineAbrechnungenAnzahl) } : {}),
        ...(baselineBelegAktenzeichen.length > 0 ? { baselineBelegAktenzeichen } : {}),
        ...(baselineBelegAblageort.length > 0 ? { baselineBelegAblageort } : {}),
        // Immer explizit — nicht konditional wie die String-Felder darueber:
        // `EnergietraegerBaseline` fuehrt das Feld als Pflichtangabe (der
        // Generator macht `default: false` zu `required`), und ein NICHT
        // gesetzter Substitutionsfall soll als ausdrueckliches `false`
        // uebertragen werden statt als Auslassung (ADR-0007 O-B3b: das
        // Merkmal wird bewusst gesetzt oder bewusst nicht gesetzt).
        energietraegerSubstitution: zeile.energietraegerSubstitution,
      };
    }),
  };
}
