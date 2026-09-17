// Zod-Formular-Schema für „Endkunde anlegen" — Feldgrenzen 1:1 gegen
// `components/schemas/EndkundePii`/`EndkundeAnlegen`
// (`schemas/openapi/stammdaten.openapi.yaml`) gespiegelt.
//
// Offener Punkt (Abschlussbericht): Es gibt noch kein
// `src/shared/src/validation/`-Modul, aus dem Backend UND Frontend dasselbe
// Zod-Schema importieren könnten (`.claude/rules/frontend-react.md`:
// „Schemas teilweise geteilt mit Backend") — das Backend validiert parallel
// mit `class-validator`-DTOs (`endkunde-pii.dto.ts`). Die Grenzen sind hier
// manuell synchron gehalten; eine spätere Ausgliederung nach
// `src/shared/src/validation/endkunde.ts` bliebe additiv.

/*
 * KEIN `vonWissAuswertungAusgenommen`. Das Feld stand hier bis zuletzt als
 * Haekchen — und JEDER Aufruf des Formulars scheiterte damit an einem 400:
 * Der Dienst weist das Attribut seit AW-27 (V0052) in Anlegen UND Aendern ab
 * (`endkunde.service.ts`, `DE04_UEBER_WIDERSPRUCH`). Der Mapper schickte es
 * immer mit, weil `boolean` nie `undefined` ist — das Formular war also
 * vollstaendig unbenutzbar, nicht nur das Haekchen.
 *
 * Gesetzt wird das Attribut ausschliesslich ueber eine Erklaerung:
 * `POST /consent/widersprueche` mit `zweckCode: wiss_auswertung`, in der
 * Oberflaeche der Widerspruchs-Zweig im Consent-Abschnitt. GELESEN wird es
 * weiter (Detailansicht, Liste) — es ist die Durchsetzungsstelle, nur eben
 * nicht mehr die Eingabestelle. Ein von Hand gesetztes Flag behauptet einen
 * Vorgang, den niemand belegen kann.
 */

import { z } from 'zod';
import type { EndkundeAnlegen } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const endkundeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, t('stammdaten.endkunde.form.errors.nameErforderlich'))
    .max(512, t('stammdaten.endkunde.form.errors.nameZuLang')),
  anschrift: z
    .string()
    .trim()
    .min(1, t('stammdaten.endkunde.form.errors.anschriftErforderlich'))
    .max(1024, t('stammdaten.endkunde.form.errors.anschriftZuLang')),
  kontakt: z.string().trim().max(512, t('stammdaten.endkunde.form.errors.kontaktZuLang')),
  endkundengruppe: z.string().trim().max(200, t('stammdaten.endkunde.form.errors.endkundengruppeZuLang')),
});

export type EndkundeFormValues = z.infer<typeof endkundeFormSchema>;

export const endkundeFormDefaultValues: EndkundeFormValues = {
  name: '',
  anschrift: '',
  kontakt: '',
  endkundengruppe: '',
};

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `EndkundeAnlegen`. */
export function toEndkundeAnlegenPayload(values: EndkundeFormValues): EndkundeAnlegen {
  const kontakt = values.kontakt.trim();
  const gruppe = values.endkundengruppe.trim();
  return {
    stammdatenPii: {
      name: values.name.trim(),
      anschrift: values.anschrift.trim(),
      ...(kontakt.length > 0 ? { kontakt } : {}),
    },
    // Leer = nicht erfasst. Ein Leerstring waere ein dritter Zustand neben
    // „nicht erfasst" und „erfasst" — der Server weist ihn ab.
    ...(gruppe.length > 0 ? { endkundengruppe: gruppe } : {}),
  };
}
