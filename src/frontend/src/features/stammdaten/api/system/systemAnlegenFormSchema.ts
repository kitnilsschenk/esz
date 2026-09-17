// Zod-Formular-Schema für „System/Messstelle anlegen" — Feldgrenzen 1:1 gegen
// `SystemAnlegenDto` (`src/backend/src/stammdaten/system/dto/system-anlegen.dto.ts`)
// gespiegelt (analog `endkundeFormSchema.ts`; noch kein geteiltes
// `src/shared/src/validation/`-Modul, siehe dortiger „Offener Punkt").

import { z } from 'zod';
import type { SystemAnlegen } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const systemAnlegenFormSchema = z.object({
  endkundeId: z.string().min(1, t('stammdaten.system.form.errors.endkundeErforderlich')),
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
});

export type SystemAnlegenFormValues = z.infer<typeof systemAnlegenFormSchema>;

export const systemAnlegenFormDefaultValues: SystemAnlegenFormValues = {
  endkundeId: '',
  bezeichnung: '',
  systemgrenze: '',
  systembeschreibung: '',
};

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `SystemAnlegen`. */
export function toSystemAnlegenPayload(values: SystemAnlegenFormValues): SystemAnlegen {
  const systembeschreibung = values.systembeschreibung.trim();
  return {
    endkundeId: values.endkundeId,
    bezeichnung: values.bezeichnung.trim(),
    systemgrenze: values.systemgrenze.trim(),
    ...(systembeschreibung.length > 0 ? { systembeschreibung } : {}),
  };
}
