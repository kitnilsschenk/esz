// Zod-Formular-Schema fuer „Messkanal einer Geraetegruppe zuordnen" —
// Feldgrenzen 1:1 gegen `ZuordnungAnlegenDto` gespiegelt (analog
// `zaehlerAnlegenFormSchema.ts`).
//
// `messkanalId` ist KEIN Formularfeld: Das Formular sitzt auf der Detailseite
// des Messkanals, der Kanal steht also bereits fest. Wer ihn dort noch einmal
// auswaehlen muesste, koennte den falschen erwischen.
//
// `istUntermessung` ist es seit V0058 ebenfalls nicht mehr: Die Topologie
// gehoert an den Messkanal (dort steht sie beim Einbau fest) und wird von der
// API abgeleitet. Sie hier ein zweites Mal abzufragen hiesse, dem Bearbeiter
// eine Angabe zu ueberlassen, die die Einsparberechnung anders liest.

import { z } from 'zod';
import type { Erkennungsmethode, GeraeteZuordnungAnlegen } from '@edms/shared';
import { t } from '../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen. */
export const ERKENNUNGSMETHODE_WERTE: readonly Erkennungsmethode[] = [
  'direktmessung',
  'algorithmus',
  'vorschaltgeraet',
  'sonstige',
];

const PROZENT_MUSTER = /^\d{1,3}([.,]\d{1,2})?$/;

function alsZahl(wert: string): number {
  return Number(wert.replace(',', '.'));
}

export const zuordnungFormSchema = z
  .object({
    geraetegruppeId: z.string().min(1, t('geraeteerkennung.zuordnenForm.errors.gruppeErforderlich')),
    methode: z.string().min(1, t('geraeteerkennung.zuordnenForm.errors.methodeErforderlich')),
    genauigkeitPct: z.string().trim(),
    anteilProzent: z
      .string()
      .trim()
      .regex(PROZENT_MUSTER, t('geraeteerkennung.zuordnenForm.errors.anteilUngueltig')),
    gueltigVon: z.string().min(1, t('geraeteerkennung.zuordnenForm.errors.gueltigVonErforderlich')),
  })
  .superRefine((werte, ctx) => {
    if (alsZahl(werte.anteilProzent) <= 0 || alsZahl(werte.anteilProzent) > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anteilProzent'],
        message: t('geraeteerkennung.zuordnenForm.errors.anteilUngueltig'),
      });
    }

    // Die Genauigkeit ist Pflicht, sobald NICHT direkt gemessen wird ([Q3]
    // Kap. 5). Eine algorithmisch geschaetzte Zuordnung ohne Angabe, wie genau
    // sie ist, laesst sich gegenueber der Bewilligungsbehoerde nicht
    // einordnen — sie ist dann eine Behauptung ueber fremden Verbrauch.
    if (werte.methode === 'direktmessung') {
      return;
    }
    if (!PROZENT_MUSTER.test(werte.genauigkeitPct) || alsZahl(werte.genauigkeitPct) > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['genauigkeitPct'],
        message: t('geraeteerkennung.zuordnenForm.errors.genauigkeitErforderlich'),
      });
    }
  });

export type ZuordnungFormValues = z.infer<typeof zuordnungFormSchema>;

export const zuordnungFormDefaultValues: ZuordnungFormValues = {
  geraetegruppeId: '',
  methode: '',
  genauigkeitPct: '',
  anteilProzent: '100',
  gueltigVon: '',
};

/**
 * Mappt die (validierten) Formularwerte + die Routen-`messkanalId` auf das
 * API-Request-DTO. Der Cast auf `Erkennungsmethode` ist sicher: `methode`
 * kommt aus einem `select`, dessen Optionen ausschliesslich
 * `ERKENNUNGSMETHODE_WERTE` sind.
 */
export function toZuordnungAnlegenPayload(
  values: ZuordnungFormValues,
  messkanalId: string,
): GeraeteZuordnungAnlegen {
  const methode = values.methode as Erkennungsmethode;
  return {
    geraetegruppeId: values.geraetegruppeId,
    messkanalId,
    methode,
    anteilProzent: alsZahl(values.anteilProzent),
    gueltigVon: values.gueltigVon,
    ...(methode === 'direktmessung' ? {} : { genauigkeitPct: alsZahl(values.genauigkeitPct) }),
  };
}
