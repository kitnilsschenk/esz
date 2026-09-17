// Zod-Formular-Schema für die CTA „Standort zuordnen" auf der
// Zähler-Detailseite (Betriebs-UI-Konzept Punkt 3 — Empty-State des
// Standort-Breadcrumb-Blocks). Spiegelbildlich zu
// `zaehlerVerortungAnlegenFormSchema.ts` (dort: `standortId` aus dem
// Baum-Kontext bekannt, `zaehlerId` freies Eingabefeld; hier umgekehrt:
// `zaehlerId` aus der Route bekannt, `standortId` freies Eingabefeld) —
// beide mappen auf dieselbe `ZaehlerVerortungAnlegenInput`/`POST
// .../verortung`-Mutation (`useZaehlerVerortungAnlegen`), KEINE eigene
// Mutation nötig.

import { z } from 'zod';
import { UUID_PATTERN } from './standortFormHelpers';
import type { ZaehlerVerortungAnlegenInput } from './standortApi';
import { t } from '../../../../shared/i18n/t';

export const zaehlerStandortZuordnenFormSchema = z.object({
  standortId: z
    .string()
    .trim()
    .min(1, t('stammdaten.zaehler.standort.form.errors.standortIdErforderlich'))
    .regex(UUID_PATTERN, t('stammdaten.zaehler.standort.form.errors.standortIdUngueltig')),
  gueltigVon: z.string().min(1, t('stammdaten.standort.zaehler.form.errors.gueltigVonErforderlich')),
});

export type ZaehlerStandortZuordnenFormValues = z.infer<typeof zaehlerStandortZuordnenFormSchema>;

export const zaehlerStandortZuordnenFormDefaultValues: ZaehlerStandortZuordnenFormValues = { standortId: '', gueltigVon: '' };

function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Mappt die (validierten) Formularwerte + den Zähler-Kontext auf `ZaehlerVerortungAnlegenInput`. */
export function toZaehlerStandortZuordnenPayload(
  values: ZaehlerStandortZuordnenFormValues,
  context: { readonly zaehlerId: string },
): ZaehlerVerortungAnlegenInput {
  return { zaehlerId: context.zaehlerId, standortId: values.standortId.trim(), gueltigVon: toIsoDateTime(values.gueltigVon) };
}
