// Zod-Formular-Schema für „Zähler-Verortung beenden".

import { z } from 'zod';
import { UUID_PATTERN } from './standortFormHelpers';
import type { ZaehlerVerortungBeendenInput } from './standortApi';
import { t } from '../../../../shared/i18n/t';

export const zaehlerVerortungBeendenFormSchema = z.object({
  zaehlerId: z
    .string()
    .trim()
    .min(1, t('stammdaten.standort.zaehler.form.errors.zaehlerIdErforderlich'))
    .regex(UUID_PATTERN, t('stammdaten.standort.zaehler.form.errors.zaehlerIdUngueltig')),
  gueltigBis: z.string().min(1, t('stammdaten.standort.zaehler.form.errors.gueltigBisErforderlich')),
});

export type ZaehlerVerortungBeendenFormValues = z.infer<typeof zaehlerVerortungBeendenFormSchema>;

export const zaehlerVerortungBeendenFormDefaultValues: ZaehlerVerortungBeendenFormValues = { zaehlerId: '', gueltigBis: '' };

function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Mappt die (validierten) Formularwerte auf `ZaehlerVerortungBeendenInput`. */
export function toZaehlerVerortungBeendenPayload(values: ZaehlerVerortungBeendenFormValues): ZaehlerVerortungBeendenInput {
  return { zaehlerId: values.zaehlerId.trim(), gueltigBis: toIsoDateTime(values.gueltigBis) };
}
