// Zod-Formular-Schema für „Zähler ändern" — Feldgrenzen 1:1 gegen
// `ZaehlerAendernDto` gespiegelt. Einziges änderbares Feld: `geraetetyp`
// (`energietraeger`/`systemId` sind laut DTO NICHT änderbar).

import { z } from 'zod';
import type { ZaehlerAendern } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const zaehlerAendernFormSchema = z.object({
  geraetetyp: z
    .string()
    .trim()
    .min(1, t('stammdaten.zaehler.form.errors.geraetetypErforderlich'))
    .max(200, t('stammdaten.zaehler.form.errors.geraetetypZuLang')),
});

export type ZaehlerAendernFormValues = z.infer<typeof zaehlerAendernFormSchema>;

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `ZaehlerAendern`. */
export function toZaehlerAendernPayload(values: ZaehlerAendernFormValues): ZaehlerAendern {
  return { geraetetyp: values.geraetetyp.trim() };
}
