// Zod-Formular-Schema für „Zähler an diesem Standort verorten" (D3,
// "Umsetzen" — öffnet eine neue Zeitscheibe UND schließt automatisch die
// offene Vorgänger-Verortung). `zaehlerId` ist EIN freies UUID-Eingabefeld
// (kein Picker-Widget in diesem Pass — offener Punkt, s. Abschlussbericht:
// ein Zähler-Autocomplete wäre eine separate, größere UI-Komponente).

import { z } from 'zod';
import { UUID_PATTERN } from './standortFormHelpers';
import type { ZaehlerVerortungAnlegenInput } from './standortApi';
import { t } from '../../../../shared/i18n/t';

export const zaehlerVerortungAnlegenFormSchema = z.object({
  zaehlerId: z
    .string()
    .trim()
    .min(1, t('stammdaten.standort.zaehler.form.errors.zaehlerIdErforderlich'))
    .regex(UUID_PATTERN, t('stammdaten.standort.zaehler.form.errors.zaehlerIdUngueltig')),
  gueltigVon: z.string().min(1, t('stammdaten.standort.zaehler.form.errors.gueltigVonErforderlich')),
});

export type ZaehlerVerortungAnlegenFormValues = z.infer<typeof zaehlerVerortungAnlegenFormSchema>;

export const zaehlerVerortungAnlegenFormDefaultValues: ZaehlerVerortungAnlegenFormValues = { zaehlerId: '', gueltigVon: '' };

/** `date` → `date-time`-ISO-String (analog `nutzungsverhaeltnisAnlegenFormSchema.ts`). */
function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Mappt die (validierten) Formularwerte + den Standort-Kontext (aus dem ausgewählten Baum-Knoten) auf `ZaehlerVerortungAnlegenInput`. */
export function toZaehlerVerortungAnlegenPayload(
  values: ZaehlerVerortungAnlegenFormValues,
  context: { readonly standortId: string },
): ZaehlerVerortungAnlegenInput {
  return { zaehlerId: values.zaehlerId.trim(), standortId: context.standortId, gueltigVon: toIsoDateTime(values.gueltigVon) };
}
