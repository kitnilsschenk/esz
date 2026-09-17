// Zod-Formular-Schema für „Anschlussnutzer anlegen" — Feldgrenzen 1:1 gegen
// `AnschlussnutzerPiiDto`/`AnschlussnutzerAnlegenDto`
// (`src/backend/src/stammdaten/anschlussnutzer/dto/*.ts`) gespiegelt (analog
// `endkundeFormSchema.ts` — Anschlussnutzer ist eine PII-Entität, Muster =
// Endkunde, ADR-0008 §23 / D11 Phase 4c Pass 2). Zusätzlich `endkundeId`
// (Fremdschlüssel-Auswahl, analog `systemAnlegenFormSchema.ts`).

import { z } from 'zod';
import type { AnschlussnutzerAnlegen } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const anschlussnutzerFormSchema = z.object({
  endkundeId: z.string().min(1, t('stammdaten.anschlussnutzer.form.errors.endkundeErforderlich')),
  name: z
    .string()
    .trim()
    .min(1, t('stammdaten.anschlussnutzer.form.errors.nameErforderlich'))
    .max(512, t('stammdaten.anschlussnutzer.form.errors.nameZuLang')),
  kontakt: z.string().trim().max(512, t('stammdaten.anschlussnutzer.form.errors.kontaktZuLang')),
});

export type AnschlussnutzerFormValues = z.infer<typeof anschlussnutzerFormSchema>;

export const anschlussnutzerFormDefaultValues: AnschlussnutzerFormValues = {
  endkundeId: '',
  name: '',
  kontakt: '',
};

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `AnschlussnutzerAnlegen`. */
export function toAnschlussnutzerAnlegenPayload(values: AnschlussnutzerFormValues): AnschlussnutzerAnlegen {
  const kontakt = values.kontakt.trim();
  return {
    endkundeId: values.endkundeId,
    stammdatenPii: {
      name: values.name.trim(),
      ...(kontakt.length > 0 ? { kontakt } : {}),
    },
  };
}
