// Zod-Formular-Schema für „Einflussgröße erfassen" — Feldgrenzen 1:1 gegen
// `EinflussgroesseErfassenDto` (`src/backend/src/stammdaten/einflussgroesse/
// dto/einflussgroesse-erfassen.dto.ts`) gespiegelt. `groesseCode` ist in v1
// ein geschlossenes `select` (die fünf `EINFLUSS_KATALOG`-Codes) — die
// `wertNum`/`wertCode`-XOR-Regel (abhängig von `wert_art` des gewählten
// Codes) UND die Art.-14-Bedingung (`betroffenerTyp='anschlussnutzer'`)
// laufen über `superRefine`, ALLE Felder bleiben dabei IMMER sichtbar
// (`EntityForm` kennt kein dynamisches Ein-/Ausblenden — analog
// `standortAnlegenFormSchema.ts`s `typ`-abhängige `adresse`-Regel: hier nur
// frühes, feldbezogenes Formular-Feedback, KEINE Ersatz-Autorität für die
// serverseitige `EinflussgroesseService#validiereWerte()`-Prüfung).

import { z } from 'zod';
import type {
  EinflussAnlassCode,
  EinflussBetroffenerTyp,
  EinflussgroesseErfassen,
  EinflussQuelleTyp,
  EinflussRechtsgrundlage,
} from '@edms/shared';
import { istArt14Pflicht, NUTZUNGSZWECK_CODE_WERTE, wertArtFuerGroesseCode } from './einflussgroesseConstants';
import { t } from '../../../../shared/i18n/t';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rohe Objekt-Form OHNE `superRefine` — `EinflussgroesseErfassenFormValues`
// wird GEZIELT von DIESER (nicht-generischen) Form abgeleitet, analog
// `standortAnlegenFormSchema.ts`/`messkonzeptAnlegenFormSchema.ts`.
const einflussgroesseErfassenFormShape = z.object({
  groesseCode: z.string().min(1, t('stammdaten.einflussgroesse.form.errors.groesseCodeErforderlich')),
  wertNum: z
    .string()
    .trim()
    .refine((wert) => wert.length === 0 || (!Number.isNaN(Number(wert)) && Number(wert) >= 0), t('stammdaten.einflussgroesse.form.errors.wertNumUngueltig')),
  wertCode: z.string().trim().max(64, t('stammdaten.einflussgroesse.form.errors.wertCodeZuLang')),
  gueltigAbMonat: z.string().min(1, t('stammdaten.einflussgroesse.form.errors.gueltigAbMonatErforderlich')),
  gueltigBisMonat: z.string().trim(),
  betroffenerTyp: z.string().min(1, t('stammdaten.einflussgroesse.form.errors.betroffenerTypErforderlich')),
  quelleTyp: z.string().min(1, t('stammdaten.einflussgroesse.form.errors.quelleTypErforderlich')),
  rechtsgrundlage: z.string().min(1, t('stammdaten.einflussgroesse.form.errors.rechtsgrundlageErforderlich')),
  abwaegungRef: z.string().trim().max(256, t('stammdaten.einflussgroesse.form.errors.abwaegungRefZuLang')),
  art14InformationAt: z.string().trim(),
  standortId: z
    .string()
    .trim()
    .refine((wert) => wert.length === 0 || UUID_PATTERN.test(wert), t('stammdaten.einflussgroesse.form.errors.standortIdUngueltig')),
  anlassCode: z.string(),
});

export type EinflussgroesseErfassenFormValues = z.infer<typeof einflussgroesseErfassenFormShape>;

export const einflussgroesseErfassenFormSchema: z.ZodType<EinflussgroesseErfassenFormValues> =
  einflussgroesseErfassenFormShape.superRefine((values, ctx) => {
    const wertArt = wertArtFuerGroesseCode(values.groesseCode);
    const hatWertNum = values.wertNum.trim().length > 0;
    const hatWertCode = values.wertCode.trim().length > 0;

    if (wertArt === 'numerisch') {
      if (!hatWertNum) {
        ctx.addIssue({ code: 'custom', path: ['wertNum'], message: t('stammdaten.einflussgroesse.form.errors.wertNumErforderlich') });
      }
      if (hatWertCode) {
        ctx.addIssue({ code: 'custom', path: ['wertCode'], message: t('stammdaten.einflussgroesse.form.errors.wertCodeNichtZulaessig') });
      }
    } else if (wertArt === 'codiert') {
      if (!hatWertCode) {
        ctx.addIssue({ code: 'custom', path: ['wertCode'], message: t('stammdaten.einflussgroesse.form.errors.wertCodeErforderlich') });
      }
      if (hatWertNum) {
        ctx.addIssue({ code: 'custom', path: ['wertNum'], message: t('stammdaten.einflussgroesse.form.errors.wertNumNichtZulaessig') });
      }
      if (values.groesseCode === 'nutzungszweck' && hatWertCode && !(NUTZUNGSZWECK_CODE_WERTE as readonly string[]).includes(values.wertCode.trim())) {
        ctx.addIssue({ code: 'custom', path: ['wertCode'], message: t('stammdaten.einflussgroesse.form.errors.wertCodeNutzungszweckUngueltig') });
      }
    }

    if (values.gueltigBisMonat.trim().length > 0 && Date.parse(values.gueltigBisMonat) <= Date.parse(values.gueltigAbMonat)) {
      ctx.addIssue({ code: 'custom', path: ['gueltigBisMonat'], message: t('stammdaten.einflussgroesse.form.errors.gueltigBisVorAb') });
    }

    const betroffenerTyp = values.betroffenerTyp as EinflussBetroffenerTyp | '';
    if (istArt14Pflicht(betroffenerTyp)) {
      if (values.rechtsgrundlage.length > 0 && values.rechtsgrundlage !== 'art6_1f') {
        ctx.addIssue({ code: 'custom', path: ['rechtsgrundlage'], message: t('stammdaten.einflussgroesse.form.errors.rechtsgrundlageArt14') });
      }
      if (values.abwaegungRef.trim().length === 0) {
        ctx.addIssue({ code: 'custom', path: ['abwaegungRef'], message: t('stammdaten.einflussgroesse.form.errors.abwaegungRefErforderlich') });
      }
      if (values.art14InformationAt.trim().length === 0) {
        ctx.addIssue({ code: 'custom', path: ['art14InformationAt'], message: t('stammdaten.einflussgroesse.form.errors.art14InformationAtErforderlich') });
      }
    } else if (betroffenerTyp === 'endkunde' && values.rechtsgrundlage.length > 0 && values.rechtsgrundlage !== 'art6_1b') {
      // V0022 (P2, compliance-director): Endkunde-Zeilen sind auf art6_1b
      // festgeschrieben (die LIA ist konstitutiv für art6_1f — DB-CHECK
      // ck_intervall_endkunde_art6_1b). Server bleibt Autorität; dies ist nur
      // frühes Formular-Feedback, damit die UI keinen 400 provoziert.
      ctx.addIssue({ code: 'custom', path: ['rechtsgrundlage'], message: t('stammdaten.einflussgroesse.form.errors.rechtsgrundlageEndkundeArt6b') });
    }
  });

export const einflussgroesseErfassenFormDefaultValues: EinflussgroesseErfassenFormValues = {
  groesseCode: '',
  wertNum: '',
  wertCode: '',
  gueltigAbMonat: '',
  gueltigBisMonat: '',
  betroffenerTyp: '',
  quelleTyp: '',
  rechtsgrundlage: '',
  abwaegungRef: '',
  art14InformationAt: '',
  standortId: '',
  anlassCode: '',
};

/** `<input type="date">` liefert `YYYY-MM-DD` — der Tages-Anteil wird auf den Monatsanfang normiert (`MonatsanfangConstraint`, Backend). */
function toMonatsanfang(datumIsoDate: string): string {
  return `${datumIsoDate.slice(0, 7)}-01`;
}

/** Siehe `nutzungsverhaeltnisBeendenFormSchema.ts` — `date` → `date-time`-ISO-String. */
function toIsoDateTime(datumIsoDate: string): string {
  return `${datumIsoDate}T00:00:00.000Z`;
}

/** Mappt die (validierten) Formularwerte auf das API-Request-DTO `EinflussgroesseErfassen`. */
export function toEinflussgroesseErfassenPayload(values: EinflussgroesseErfassenFormValues): EinflussgroesseErfassen {
  const wertNum = values.wertNum.trim();
  const wertCode = values.wertCode.trim();
  const gueltigBisMonat = values.gueltigBisMonat.trim();
  const abwaegungRef = values.abwaegungRef.trim();
  const art14InformationAt = values.art14InformationAt.trim();
  const standortId = values.standortId.trim();
  return {
    groesseCode: values.groesseCode,
    ...(wertNum.length > 0 ? { wertNum: Number(wertNum) } : {}),
    ...(wertCode.length > 0 ? { wertCode } : {}),
    gueltigAbMonat: toMonatsanfang(values.gueltigAbMonat),
    ...(gueltigBisMonat.length > 0 ? { gueltigBisMonat: toMonatsanfang(gueltigBisMonat) } : {}),
    betroffenerTyp: values.betroffenerTyp as EinflussBetroffenerTyp,
    quelleTyp: values.quelleTyp as EinflussQuelleTyp,
    rechtsgrundlage: values.rechtsgrundlage as EinflussRechtsgrundlage,
    ...(abwaegungRef.length > 0 ? { abwaegungRef } : {}),
    ...(art14InformationAt.length > 0 ? { art14InformationAt: toIsoDateTime(art14InformationAt) } : {}),
    ...(standortId.length > 0 ? { standortId } : {}),
    ...(values.anlassCode.length > 0 ? { anlassCode: values.anlassCode as EinflussAnlassCode } : {}),
  };
}
