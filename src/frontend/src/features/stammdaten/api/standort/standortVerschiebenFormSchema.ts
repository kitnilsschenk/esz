// Zod-Formular-Schema für „Standort verschieben" (Reparent, D6) —
// `neuerParentId: null` bedeutet "an die Wurzel" (D2.4, nur zulässig für
// `typ` liegenschaft/gebaeude). Ein natives `<select>` kennt kein
// `null`-Option-Value — `WURZEL_SENTINEL` kodiert diesen Fall als
// eigenständigen String-Wert, der NIE mit einer echten Standort-UUID
// kollidiert.

import { z } from 'zod';
import type { StandortVerschieben } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const WURZEL_SENTINEL = '__wurzel__';

export const standortVerschiebenFormSchema = z.object({
  neuerParentId: z.string().min(1, t('stammdaten.standort.form.errors.zielErforderlich')),
});

export type StandortVerschiebenFormValues = z.infer<typeof standortVerschiebenFormSchema>;

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `StandortVerschieben`. */
export function toStandortVerschiebenPayload(values: StandortVerschiebenFormValues): StandortVerschieben {
  return { neuerParentId: values.neuerParentId === WURZEL_SENTINEL ? null : values.neuerParentId };
}
