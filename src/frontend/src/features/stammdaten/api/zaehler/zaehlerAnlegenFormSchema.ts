// Zod-Formular-Schema für „Zähler anlegen" — Feldgrenzen 1:1 gegen
// `ZaehlerAnlegenDto` (`src/backend/src/stammdaten/zaehler/dto/zaehler-anlegen.dto.ts`)
// gespiegelt (analog `systemAnlegenFormSchema.ts`).

import { z } from 'zod';
import type { Energietraeger, ZaehlerAnlegen } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen (view-hook). */
export const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

export const zaehlerAnlegenFormSchema = z.object({
  systemId: z.string().min(1, t('stammdaten.zaehler.form.errors.systemErforderlich')),
  geraetetyp: z
    .string()
    .trim()
    .min(1, t('stammdaten.zaehler.form.errors.geraetetypErforderlich'))
    .max(200, t('stammdaten.zaehler.form.errors.geraetetypZuLang')),
  energietraeger: z.string().min(1, t('stammdaten.zaehler.form.errors.energietraegerErforderlich')),
});

export type ZaehlerAnlegenFormValues = z.infer<typeof zaehlerAnlegenFormSchema>;

export const zaehlerAnlegenFormDefaultValues: ZaehlerAnlegenFormValues = {
  systemId: '',
  geraetetyp: '',
  energietraeger: '',
};

/**
 * Mappt die (validierten) Formularwerte auf das API-Request-DTO
 * `ZaehlerAnlegen`. Der Cast auf `Energietraeger` ist sicher: `energietraeger`
 * kommt aus einem `select`-Feld, dessen Optionen ausschließlich
 * `ENERGIETRAEGER_WERTE`-Einträge sind (view-hook) — ein anderer Wert kann im
 * UI nicht ausgewählt werden.
 */
export function toZaehlerAnlegenPayload(values: ZaehlerAnlegenFormValues): ZaehlerAnlegen {
  return {
    systemId: values.systemId,
    geraetetyp: values.geraetetyp.trim(),
    energietraeger: values.energietraeger as Energietraeger,
  };
}
