// Zod-Formular-Schema für „Standort stilllegen" (Body `{grund}`, D2.6) —
// whitelisted Grund (kein Freitext, Linie 2), analog `ShredAblehnenAnweisungDto`.

import { z } from 'zod';
import type { StandortStilllegen, StandortStilllegenGrund } from '@edms/shared';
import { STANDORT_STILLLEGEN_GRUND_WERTE } from './standortConstants';
import { t } from '../../../../shared/i18n/t';

export const standortStilllegenFormSchema = z.object({
  grund: z.string().min(1, t('stammdaten.standort.form.errors.grundErforderlich')),
});

export type StandortStilllegenFormValues = z.infer<typeof standortStilllegenFormSchema>;

export const standortStilllegenFormDefaultValues: StandortStilllegenFormValues = { grund: '' };

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `StandortStilllegen`. */
export function toStandortStilllegenPayload(values: StandortStilllegenFormValues): StandortStilllegen {
  return { grund: values.grund as StandortStilllegenGrund };
}

export { STANDORT_STILLLEGEN_GRUND_WERTE };
