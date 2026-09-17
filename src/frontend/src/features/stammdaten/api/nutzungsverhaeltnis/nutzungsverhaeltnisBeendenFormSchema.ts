// Zod-Formular-Schema für „Nutzungsverhältnis beenden" — Feldgrenzen 1:1
// gegen `NutzungsverhaeltnisBeendenDto` gespiegelt.

import { z } from 'zod';
import type { NutzungsverhaeltnisBeenden } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const nutzungsverhaeltnisBeendenFormSchema = z.object({
  gueltigBis: z.string().min(1, t('stammdaten.nutzungsverhaeltnis.form.errors.gueltigBisErforderlich')),
});

export type NutzungsverhaeltnisBeendenFormValues = z.infer<typeof nutzungsverhaeltnisBeendenFormSchema>;

export const nutzungsverhaeltnisBeendenFormDefaultValues: NutzungsverhaeltnisBeendenFormValues = { gueltigBis: '' };

/** Siehe `nutzungsverhaeltnisAnlegenFormSchema.ts` — `date` → `date-time`-ISO-String. */
function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `NutzungsverhaeltnisBeenden`. */
export function toNutzungsverhaeltnisBeendenPayload(values: NutzungsverhaeltnisBeendenFormValues): NutzungsverhaeltnisBeenden {
  return { gueltigBis: toIsoDateTime(values.gueltigBis) };
}
