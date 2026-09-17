// Zod-Formular-Schema für „Messkanal ändern" — Feldgrenzen 1:1 gegen
// `MesskanalAendernDto` gespiegelt. Änderbare Felder: `einheit`,
// `obisKennzahl` (`messgroesse`/`art`/`zaehlerId` sind laut DTO NICHT
// änderbar).

import { z } from 'zod';
import type { MesskanalAendern, Messrichtung } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const messkanalAendernFormSchema = z.object({
  einheit: z
    .string()
    .trim()
    .min(1, t('stammdaten.messkanal.form.errors.einheitErforderlich'))
    .max(50, t('stammdaten.messkanal.form.errors.einheitZuLang')),
  obisKennzahl: z.string().trim().max(50, t('stammdaten.messkanal.form.errors.obisKennzahlZuLang')),
  istUntermessung: z.boolean(),
  richtung: z.string().min(1, t('stammdaten.messkanal.form.errors.richtungErforderlich')),
});

export type MesskanalAendernFormValues = z.infer<typeof messkanalAendernFormSchema>;

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `MesskanalAendern`. */
export function toMesskanalAendernPayload(values: MesskanalAendernFormValues): MesskanalAendern {
  const obisKennzahl = values.obisKennzahl.trim();
  return {
    einheit: values.einheit.trim(),
    istUntermessung: values.istUntermessung,
    richtung: values.richtung as Messrichtung,
    ...(obisKennzahl.length > 0 ? { obisKennzahl } : {}),
  };
}
