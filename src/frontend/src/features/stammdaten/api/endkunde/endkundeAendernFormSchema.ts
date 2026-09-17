// Zod-Formular-Schema für „Endkunde ändern" — Feldgrenzen 1:1 gegen
// `EndkundePiiDto`/`components/schemas/EndkundeAendern`
// (`schemas/openapi/stammdaten.openapi.yaml`) gespiegelt, identisch zu
// `endkundeFormSchema.ts` (Anlegen) — eigene Datei trotzdem (analog
// `systemAendernFormSchema.ts`/`zaehlerAendernFormSchema.ts`), damit Ändern
// und Anlegen unabhängig voneinander weiterentwickelt werden können.
//
// WICHTIG (PII-Vorbefüllung bei serverseitiger Maskierung, D6): Das Backend
// liefert `stammdatenPii: null`, wenn die aufrufende Rolle/der
// Verarbeitungsstatus keinen PII-Zugriff erlaubt (hier: `betrieb` auf einem
// bereits gesperrten/geschredderten Subjekt — reines `betrieb`-Lesen ohne
// PII-Berechtigung gibt es sonst nicht, `@Roles('betrieb')` gilt für diese
// gesamte Route). `useEndkundeAendernView` befüllt die PII-Felder in diesem
// Fall bewusst NICHT mit dem (dann `null`-wertigen) Klartext, sondern lässt
// sie leer UND markiert `piiMaskiert: true` — das Formular zeigt dafür einen
// Hinweis, dass Name/Anschrift/Kontakt bei Bedarf vollständig neu eingegeben
// werden müssen (kein stilles Überschreiben mit Leerstring, s.
// `EndkundeAendernFormular.tsx`).

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
import type { EndkundeAendern } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export const endkundeAendernFormSchema = z.object({
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

export type EndkundeAendernFormValues = z.infer<typeof endkundeAendernFormSchema>;

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `EndkundeAendern`. */
export function toEndkundeAendernPayload(values: EndkundeAendernFormValues): EndkundeAendern {
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
