// Zod-Formular-Schema für „Einflussgröße korrigieren" — Feldgrenzen 1:1
// gegen `EinflussgroesseKorrigierenDto`/`EinflussgroesseKorrekturWerteDto`
// gespiegelt. EIN flaches Formular für BEIDE Server-Fälle: „nur schließen"
// (nur `gueltigBisMonat` ausgefüllt) UND „schließen + Korrektur-Zeile"
// (zusätzlich die `korrektur*`-Felder). Trigger für den zweiten Fall ist
// `korrekturGueltigAbMonat` (Pflichtfeld JEDER Korrektur-Zeile laut DTO) —
// Feldlabel macht das explizit ("… nur ausfüllen, wenn …"), s.
// `EinflussgroesseKorrigierenFormular.tsx`. `groesseCode` ist NICHT Teil
// dieses Formulars (Backend erbt ihn vom Original-Intervall) — die
// `wert_art`-abhängige XOR-Regel (`wertArt`-Parameter) ist daher NUR
// verfügbar, wenn der Aufrufer sie kennt (Liste liefert `groesseCode` je
// Zeile, s. `EinflussgroesseTabelle`s Korrigieren-Link); ohne bekannten
// `wertArt` gilt ein generisches XOR (genau einer der beiden Werte).

import { z } from 'zod';
import type {
  EinflussBetroffenerTyp,
  EinflussgroesseKorrigieren,
  EinflussQuelleTyp,
  EinflussRechtsgrundlage,
} from '@edms/shared';
import { istArt14Pflicht, type EinflussWertArt } from './einflussgroesseConstants';
import { t } from '../../../../shared/i18n/t';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const einflussgroesseKorrigierenFormShape = z.object({
  gueltigBisMonat: z.string().min(1, t('stammdaten.einflussgroesse.form.errors.gueltigBisMonatErforderlich')),
  korrekturGueltigAbMonat: z.string().trim(),
  korrekturWertNum: z
    .string()
    .trim()
    .refine((wert) => wert.length === 0 || (!Number.isNaN(Number(wert)) && Number(wert) >= 0), t('stammdaten.einflussgroesse.form.errors.wertNumUngueltig')),
  korrekturWertCode: z.string().trim().max(64, t('stammdaten.einflussgroesse.form.errors.wertCodeZuLang')),
  korrekturGueltigBisMonat: z.string().trim(),
  korrekturBetroffenerTyp: z.string().trim(),
  korrekturQuelleTyp: z.string().trim(),
  korrekturRechtsgrundlage: z.string().trim(),
  korrekturAbwaegungRef: z.string().trim().max(256, t('stammdaten.einflussgroesse.form.errors.abwaegungRefZuLang')),
  korrekturArt14InformationAt: z.string().trim(),
  korrekturStandortId: z
    .string()
    .trim()
    .refine((wert) => wert.length === 0 || UUID_PATTERN.test(wert), t('stammdaten.einflussgroesse.form.errors.standortIdUngueltig')),
});

export type EinflussgroesseKorrigierenFormValues = z.infer<typeof einflussgroesseKorrigierenFormShape>;

/**
 * Parametrisiert nach der `wert_art` DER GRÖSSE des zu korrigierenden
 * Intervalls (falls bekannt — s. Datei-Kopf) — analog
 * `standortPiiAendernFormSchema(typ, istWurzel)`.
 */
export function einflussgroesseKorrigierenFormSchema(wertArt: EinflussWertArt | undefined): z.ZodType<EinflussgroesseKorrigierenFormValues> {
  return einflussgroesseKorrigierenFormShape.superRefine((values, ctx) => {
    const mitKorrektur = values.korrekturGueltigAbMonat.trim().length > 0;
    if (!mitKorrektur) {
      return;
    }

    if (values.korrekturGueltigBisMonat.trim().length > 0 && Date.parse(values.korrekturGueltigBisMonat) <= Date.parse(values.korrekturGueltigAbMonat)) {
      ctx.addIssue({ code: 'custom', path: ['korrekturGueltigBisMonat'], message: t('stammdaten.einflussgroesse.form.errors.korrekturGueltigBisVorAb') });
    }
    if (values.korrekturBetroffenerTyp.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['korrekturBetroffenerTyp'], message: t('stammdaten.einflussgroesse.form.errors.korrekturBetroffenerTypErforderlich') });
    }
    if (values.korrekturQuelleTyp.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['korrekturQuelleTyp'], message: t('stammdaten.einflussgroesse.form.errors.korrekturQuelleTypErforderlich') });
    }
    if (values.korrekturRechtsgrundlage.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['korrekturRechtsgrundlage'], message: t('stammdaten.einflussgroesse.form.errors.korrekturRechtsgrundlageErforderlich') });
    }

    const hatWertNum = values.korrekturWertNum.trim().length > 0;
    const hatWertCode = values.korrekturWertCode.trim().length > 0;
    if (wertArt === 'numerisch') {
      if (!hatWertNum) {
        ctx.addIssue({ code: 'custom', path: ['korrekturWertNum'], message: t('stammdaten.einflussgroesse.form.errors.korrekturWertNumErforderlich') });
      }
      if (hatWertCode) {
        ctx.addIssue({ code: 'custom', path: ['korrekturWertCode'], message: t('stammdaten.einflussgroesse.form.errors.korrekturWertCodeNichtZulaessig') });
      }
    } else if (wertArt === 'codiert') {
      if (!hatWertCode) {
        ctx.addIssue({ code: 'custom', path: ['korrekturWertCode'], message: t('stammdaten.einflussgroesse.form.errors.korrekturWertCodeErforderlich') });
      }
      if (hatWertNum) {
        ctx.addIssue({ code: 'custom', path: ['korrekturWertNum'], message: t('stammdaten.einflussgroesse.form.errors.korrekturWertNumNichtZulaessig') });
      }
    } else if (hatWertNum === hatWertCode) {
      // `wertArt` unbekannt (kein `groesseCode`-Kontext, s. Datei-Kopf) —
      // generisches XOR statt größen-spezifischer Pflicht.
      ctx.addIssue({ code: 'custom', path: ['korrekturWertNum'], message: t('stammdaten.einflussgroesse.form.errors.korrekturWertXorErforderlich') });
    }

    const betroffenerTyp = values.korrekturBetroffenerTyp as EinflussBetroffenerTyp | '';
    if (istArt14Pflicht(betroffenerTyp)) {
      if (values.korrekturRechtsgrundlage.length > 0 && values.korrekturRechtsgrundlage !== 'art6_1f') {
        ctx.addIssue({ code: 'custom', path: ['korrekturRechtsgrundlage'], message: t('stammdaten.einflussgroesse.form.errors.korrekturRechtsgrundlageArt14') });
      }
      if (values.korrekturAbwaegungRef.trim().length === 0) {
        ctx.addIssue({ code: 'custom', path: ['korrekturAbwaegungRef'], message: t('stammdaten.einflussgroesse.form.errors.korrekturAbwaegungRefErforderlich') });
      }
      if (values.korrekturArt14InformationAt.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['korrekturArt14InformationAt'],
          message: t('stammdaten.einflussgroesse.form.errors.korrekturArt14InformationAtErforderlich'),
        });
      }
    }
  });
}

export const einflussgroesseKorrigierenFormDefaultValues: EinflussgroesseKorrigierenFormValues = {
  gueltigBisMonat: '',
  korrekturGueltigAbMonat: '',
  korrekturWertNum: '',
  korrekturWertCode: '',
  korrekturGueltigBisMonat: '',
  korrekturBetroffenerTyp: '',
  korrekturQuelleTyp: '',
  korrekturRechtsgrundlage: '',
  korrekturAbwaegungRef: '',
  korrekturArt14InformationAt: '',
  korrekturStandortId: '',
};

/** `<input type="date">` liefert `YYYY-MM-DD` — der Tages-Anteil wird auf den Monatsanfang normiert (`MonatsanfangConstraint`, Backend). */
function toMonatsanfang(datumIsoDate: string): string {
  return `${datumIsoDate.slice(0, 7)}-01`;
}

/** Siehe `nutzungsverhaeltnisBeendenFormSchema.ts` — `date` → `date-time`-ISO-String. */
function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `EinflussgroesseKorrigieren`. */
export function toEinflussgroesseKorrigierenPayload(values: EinflussgroesseKorrigierenFormValues): EinflussgroesseKorrigieren {
  const gueltigBisMonat = toMonatsanfang(values.gueltigBisMonat);
  const korrekturGueltigAbMonat = values.korrekturGueltigAbMonat.trim();
  if (korrekturGueltigAbMonat.length === 0) {
    return { gueltigBisMonat };
  }

  const korrekturWertNum = values.korrekturWertNum.trim();
  const korrekturWertCode = values.korrekturWertCode.trim();
  const korrekturGueltigBisMonat = values.korrekturGueltigBisMonat.trim();
  const korrekturAbwaegungRef = values.korrekturAbwaegungRef.trim();
  const korrekturArt14InformationAt = values.korrekturArt14InformationAt.trim();
  const korrekturStandortId = values.korrekturStandortId.trim();

  return {
    gueltigBisMonat,
    korrektur: {
      gueltigAbMonat: toMonatsanfang(korrekturGueltigAbMonat),
      ...(korrekturGueltigBisMonat.length > 0 ? { gueltigBisMonat: toMonatsanfang(korrekturGueltigBisMonat) } : {}),
      ...(korrekturWertNum.length > 0 ? { wertNum: Number(korrekturWertNum) } : {}),
      ...(korrekturWertCode.length > 0 ? { wertCode: korrekturWertCode } : {}),
      betroffenerTyp: values.korrekturBetroffenerTyp as EinflussBetroffenerTyp,
      quelleTyp: values.korrekturQuelleTyp as EinflussQuelleTyp,
      rechtsgrundlage: values.korrekturRechtsgrundlage as EinflussRechtsgrundlage,
      ...(korrekturAbwaegungRef.length > 0 ? { abwaegungRef: korrekturAbwaegungRef } : {}),
      ...(korrekturArt14InformationAt.length > 0 ? { art14InformationAt: toIsoDateTime(korrekturArt14InformationAt) } : {}),
      ...(korrekturStandortId.length > 0 ? { standortId: korrekturStandortId } : {}),
    },
  };
}
