// Zod-Formular-Schema des break-glass-CTAs „Lastgang ansehen" (Route B,
// `read:verbrauch_detail`, Betriebs-UI-Konzept Punkt 3.4/4). Erzwingt
// clientseitig dieselbe Fenster-Obergrenze (`MAX_FENSTER_TAGE`), die der PDP
// serverseitig ohnehin durchsetzt (403 bei Verstoß) — reines, frühes
// Formular-Feedback, KEINE Ersatz-Autorität (analog `standortAnlegenFormSchema.ts`).
//
// Der Zweck-Code selbst ist HIER bewusst KEIN Formularfeld: die Whitelist hat
// aktuell genau einen Eintrag (`stoerungsdiagnose`, `breakGlassConstants.ts`)
// — eine Auswahl mit nur einer, immer vorbelegten Option wäre eine Schein-
// Wahlmöglichkeit. Die Dialog-Komponente zeigt den Zweck stattdessen als
// Klartext-Hinweis; sobald die Whitelist wächst, wird dies ein echtes
// `select`-Feld (offener Punkt, s. Abschlussbericht).

import { z } from 'zod';
import { BREAK_GLASS_ZWECK_WHITELIST, MAX_FENSTER_TAGE } from './breakGlassConstants';
import type { MesskanalZeitreiheAnfrage } from './verbrauchApi';
import { t } from '../../../../shared/i18n/t';

const MILLISEKUNDEN_PRO_TAG = 24 * 60 * 60 * 1000;

const messkanalLastgangFormShape = z.object({
  von: z.string().min(1, t('stammdaten.verbrauch.lastgang.form.errors.vonErforderlich')),
  bis: z.string().min(1, t('stammdaten.verbrauch.lastgang.form.errors.bisErforderlich')),
});

export type MesskanalLastgangFormValues = z.infer<typeof messkanalLastgangFormShape>;

export const messkanalLastgangFormSchema: z.ZodType<MesskanalLastgangFormValues> = messkanalLastgangFormShape.superRefine(
  (values, ctx) => {
    if (values.von.length === 0 || values.bis.length === 0) {
      return;
    }
    if (values.von > values.bis) {
      ctx.addIssue({ code: 'custom', path: ['bis'], message: t('stammdaten.verbrauch.lastgang.form.errors.vonNachBis') });
      return;
    }
    const vonMs = Date.parse(`${values.von}T00:00:00.000Z`);
    const bisMs = Date.parse(`${values.bis}T00:00:00.000Z`);
    const fensterTage = (bisMs - vonMs) / MILLISEKUNDEN_PRO_TAG;
    if (fensterTage > MAX_FENSTER_TAGE) {
      ctx.addIssue({ code: 'custom', path: ['bis'], message: t('stammdaten.verbrauch.lastgang.form.errors.fensterZuGross') });
    }
  },
);

export const messkanalLastgangFormDefaultValues: MesskanalLastgangFormValues = { von: '', bis: '' };

function toIsoStart(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Kalendarisches `bis` (inklusive) → halboffenes Intervallende (exklusiv, +1 Tag UTC), analog `verbrauchZeitraum.ts#datumVerschieben`. */
function toIsoEndeExklusiv(datumIsoDate: string): string {
  const basis = new Date(toIsoStart(datumIsoDate));
  basis.setUTCDate(basis.getUTCDate() + 1);
  return basis.toISOString();
}

/** Mappt die (validierten) Formularwerte + den Zähler-Kontext auf `MesskanalZeitreiheAnfrage`. */
export function toMesskanalZeitreiheAnfrage(
  values: MesskanalLastgangFormValues,
  context: { readonly zaehlerId: string },
): MesskanalZeitreiheAnfrage {
  const von = toIsoStart(values.von);
  const bis = toIsoEndeExklusiv(values.bis);
  return {
    von,
    bis,
    zugriffszweck: {
      zweckCode: BREAK_GLASS_ZWECK_WHITELIST[0],
      zaehlerId: context.zaehlerId,
      von,
      bis,
    },
  };
}
