// Zod-Formular-Schema für „Standort-Struktur ändern" (`typ`/`sortierung` —
// NICHT `status`/PII, D2.6/D5) — beide Felder werden IMMER (vorbefüllt)
// mitgeschickt, damit die Backend-Regel "mindestens ein Feld gesetzt"
// (`standort.service.ts#aendern`) trivial erfüllt ist.

import { z } from 'zod';
import type { StandortAendern, StandortTyp } from '@edms/shared';
import { STANDORT_WURZEL_TYPEN } from './standortConstants';
import { klimareferenzFeldSchema, sortierungFeldSchema } from './standortFormHelpers';
import { t } from '../../../../shared/i18n/t';

// Rohe Objekt-Form OHNE `superRefine` — s. `standortAnlegenFormSchema.ts`s
// Kommentar (`z.infer` statt Hand-`interface`, wegen `EntityForm`s
// `FormValuesRecord`-Constraint).
const standortAendernFormShape = z.object({
  typ: z.string().min(1, t('stammdaten.standort.form.errors.typErforderlich')),
  sortierung: sortierungFeldSchema,
  klimareferenz: klimareferenzFeldSchema,
});

export type StandortAendernFormValues = z.infer<typeof standortAendernFormShape>;

/** D2.4 — ein Wurzelknoten muss `liegenschaft`/`gebaeude` BLEIBEN. */
export function standortAendernFormSchema(istWurzel: boolean): z.ZodType<StandortAendernFormValues> {
  return standortAendernFormShape.superRefine((values, ctx) => {
    const typ = values.typ as StandortTyp;
    if (istWurzel && values.typ.length > 0 && !(STANDORT_WURZEL_TYPEN as readonly string[]).includes(typ)) {
      ctx.addIssue({ code: 'custom', path: ['typ'], message: t('stammdaten.standort.form.errors.wurzelTypUngueltig') });
    }
  });
}

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `StandortAendern`. */
export function toStandortAendernPayload(values: StandortAendernFormValues): StandortAendern {
  // `klimareferenz` geht IMMER mit, auch leer: Der Leerstring ist hier der
  // Weg, eine hinterlegte Station wieder zu entfernen (der Server macht
  // daraus NULL). Ihn wegzulassen hiesse „nicht anfassen" — dann liesse sich
  // eine falsche Station nie mehr loswerden.
  return {
    typ: values.typ as StandortTyp,
    sortierung: Number(values.sortierung),
    klimareferenz: values.klimareferenz.trim(),
  };
}
