// Zod-Formular-Schema für „System/Messstelle ändern" — Feldgrenzen 1:1 gegen
// `SystemAendernDto` gespiegelt. Das Formular ist mit den aktuellen Werten
// vorbefüllt (Detail-Query) — `bezeichnung`/`systemgrenze` bleiben deshalb im
// UI Pflichtfelder (leeres Absenden ergibt kein sinnvolles Teil-Update);
// `systembeschreibung` bleibt wie im DTO optional (leer => Feld wird beim
// Absenden weggelassen, nicht auf leer gesetzt).

import { z } from 'zod';
import type { SystemAendern } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const systemAendernFormSchema = z.object({
  bezeichnung: z
    .string()
    .trim()
    .min(1, t('stammdaten.system.form.errors.bezeichnungErforderlich'))
    .max(200, t('stammdaten.system.form.errors.bezeichnungZuLang')),
  systemgrenze: z
    .string()
    .trim()
    .min(1, t('stammdaten.system.form.errors.systemgrenzeErforderlich'))
    .max(2000, t('stammdaten.system.form.errors.systemgrenzeZuLang')),
  systembeschreibung: z.string().trim().max(4000, t('stammdaten.system.form.errors.systembeschreibungZuLang')),
  /** Leerstring = kein Standort zugeordnet. */
  standortId: z.string(),
});

export type SystemAendernFormValues = z.infer<typeof systemAendernFormSchema>;

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `SystemAendern`. */
export function toSystemAendernPayload(values: SystemAendernFormValues): SystemAendern {
  const systembeschreibung = values.systembeschreibung.trim();
  return {
    bezeichnung: values.bezeichnung.trim(),
    systemgrenze: values.systemgrenze.trim(),
    ...(systembeschreibung.length > 0 ? { systembeschreibung } : {}),
    // Leerstring heisst „keiner gewaehlt" und wird gar nicht geschickt — der
    // Vertrag kennt fuer das Loeschen eines Standorts keinen Weg, und einen
    // zu erfinden waere hier die falsche Stelle.
    ...(values.standortId !== '' ? { standortId: values.standortId } : {}),
  };
}
