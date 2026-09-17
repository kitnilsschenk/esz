// Zod-Formular-Schema für „Standort-Label/Adresse ändern" (Vollersatz, D4/
// D5) — Feldgrenzen 1:1 gegen `StandortPiiAendernDto` gespiegelt. Ein
// weggelassenes `adresse` LÖSCHT die hinterlegte Adresse (Vollersatz, kein
// Feld-Teil-Update) — s. `standort.service.ts#aendernPii`.

import { z } from 'zod';
import type { StandortPiiAendern, StandortTyp } from '@edms/shared';
import { istAdressePflicht, istAdresseZulaessig } from './standortConstants';
import { t } from '../../../../shared/i18n/t';

// Rohe Objekt-Form OHNE `superRefine` — s. `standortAnlegenFormSchema.ts`s
// Kommentar (`z.infer` statt Hand-`interface`, wegen `EntityForm`s
// `FormValuesRecord`-Constraint).
const standortPiiAendernFormShape = z.object({
  bezeichnung: z
    .string()
    .trim()
    .min(1, t('stammdaten.standort.form.errors.bezeichnungErforderlich'))
    .max(512, t('stammdaten.standort.form.errors.bezeichnungZuLang')),
  adresse: z.string().trim().max(1024, t('stammdaten.standort.form.errors.adresseZuLang')),
  geo: z.string().trim().max(128, t('stammdaten.standort.form.errors.geoZuLang')),
});

export type StandortPiiAendernFormValues = z.infer<typeof standortPiiAendernFormShape>;

/**
 * Parametrisiert nach `typ`/`istWurzel` DES KONKRETEN Knotens (beim Öffnen
 * des Formulars bereits bekannt, NICHT Teil dieses Formulars — anders als
 * beim Anlegen ist der Typ hier unveränderlich, eigene Aktion
 * `update:standort` Struktur).
 */
export function standortPiiAendernFormSchema(typ: StandortTyp, istWurzel: boolean): z.ZodType<StandortPiiAendernFormValues> {
  return standortPiiAendernFormShape.superRefine((values, ctx) => {
    const hatAdresse = values.adresse.trim().length > 0;
    if (!istAdresseZulaessig(typ, istWurzel) && hatAdresse) {
      ctx.addIssue({ code: 'custom', path: ['adresse'], message: t('stammdaten.standort.form.errors.adresseNichtZulaessig') });
    }
    if (istAdressePflicht(istWurzel) && !hatAdresse) {
      ctx.addIssue({ code: 'custom', path: ['adresse'], message: t('stammdaten.standort.form.errors.adresseErforderlich') });
    }
  });
}

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `StandortPiiAendern`. */
export function toStandortPiiAendernPayload(values: StandortPiiAendernFormValues): StandortPiiAendern {
  const adresse = values.adresse.trim();
  const geo = values.geo.trim();
  return {
    bezeichnung: values.bezeichnung.trim(),
    ...(adresse.length > 0 ? { adresse } : {}),
    ...(geo.length > 0 ? { geo } : {}),
  };
}
