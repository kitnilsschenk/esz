// Zod-Formular-Schema für „Standort anlegen" (Wurzel ODER Kind, ADR-0010 D1/
// D2.4/D4) — Feldgrenzen 1:1 gegen `StandortAnlegenDto` gespiegelt
// (`src/backend/src/stammdaten/standort/dto/standort-anlegen.dto.ts`).

import { z } from 'zod';
import type { StandortTyp } from '@edms/shared';
import { STANDORT_WURZEL_TYPEN, istAdressePflicht, istAdresseZulaessig } from './standortConstants';
import { klimareferenzFeldSchema, sortierungFeldSchema } from './standortFormHelpers';
import type { StandortAnlegenInput } from './standortApi';
import { t } from '../../../../shared/i18n/t';

// Rohe Objekt-Form OHNE `superRefine` — `StandortAnlegenFormValues` wird
// GEZIELT von DIESER (nicht-generischen) Form abgeleitet, analog
// `zaehlerAnlegenFormSchema.ts`/`messkonzeptAnlegenFormSchema.ts`: ein
// per Hand geschriebenes `interface` erfüllt `EntityForm`s generische
// `FormValuesRecord`-Constraint NICHT (fehlende Index-Signatur) — der über
// `z.infer` abgeleitete Typ dagegen schon (etablierte Repo-Konvention).
const standortAnlegenFormShape = z.object({
  typ: z.string().min(1, t('stammdaten.standort.form.errors.typErforderlich')),
  sortierung: sortierungFeldSchema,
  bezeichnung: z
    .string()
    .trim()
    .min(1, t('stammdaten.standort.form.errors.bezeichnungErforderlich'))
    .max(512, t('stammdaten.standort.form.errors.bezeichnungZuLang')),
  adresse: z.string().trim().max(1024, t('stammdaten.standort.form.errors.adresseZuLang')),
  klimareferenz: klimareferenzFeldSchema,
});

export type StandortAnlegenFormValues = z.infer<typeof standortAnlegenFormShape>;

/**
 * Parametrisiert nach `istWurzel` (zur Aufrufzeit bekannt — "Wurzel anlegen"
 * und "Kind anlegen" sind getrennte Formular-Instanzen, s.
 * `hooks/standort/useStandortKindAnlegenView.ts`): erzwingt per
 * `superRefine` dieselben D2.4/D4-Regeln, die der Server ohnehin
 * durchsetzt (400 bei Verstoß) — hier nur als frühes, feldbezogenes
 * Formular-Feedback, KEINE Ersatz-Autorität.
 */
export function standortAnlegenFormSchema(istWurzel: boolean): z.ZodType<StandortAnlegenFormValues> {
  return standortAnlegenFormShape.superRefine((values, ctx) => {
    const typ = values.typ as StandortTyp;
    if (values.typ.length === 0) {
      return;
    }
    if (istWurzel && !(STANDORT_WURZEL_TYPEN as readonly string[]).includes(typ)) {
      ctx.addIssue({ code: 'custom', path: ['typ'], message: t('stammdaten.standort.form.errors.wurzelTypUngueltig') });
    }
    const hatAdresse = values.adresse.trim().length > 0;
    if (!istAdresseZulaessig(typ, istWurzel) && hatAdresse) {
      ctx.addIssue({ code: 'custom', path: ['adresse'], message: t('stammdaten.standort.form.errors.adresseNichtZulaessig') });
    }
    if (istAdressePflicht(istWurzel) && !hatAdresse) {
      ctx.addIssue({ code: 'custom', path: ['adresse'], message: t('stammdaten.standort.form.errors.adresseErforderlich') });
    }
  });
}

export function standortAnlegenFormDefaultValues(): StandortAnlegenFormValues {
  return { typ: '', sortierung: '0', bezeichnung: '', adresse: '', klimareferenz: '' };
}

export interface StandortAnlegenPayloadContext {
  readonly endkundeId: string;
  readonly parentId: string | null;
}

/** Mappt die (validierten) Formularwerte + den Anlege-Kontext auf `StandortAnlegenInput`. */
export function toStandortAnlegenPayload(values: StandortAnlegenFormValues, context: StandortAnlegenPayloadContext): StandortAnlegenInput {
  const adresse = values.adresse.trim();
  const klimareferenz = values.klimareferenz.trim();
  return {
    endkundeId: context.endkundeId,
    typ: values.typ as StandortTyp,
    ...(context.parentId !== null ? { parentId: context.parentId } : {}),
    sortierung: Number(values.sortierung),
    bezeichnung: values.bezeichnung.trim(),
    ...(adresse.length > 0 ? { adresse } : {}),
    ...(klimareferenz.length > 0 ? { klimareferenz } : {}),
  };
}
