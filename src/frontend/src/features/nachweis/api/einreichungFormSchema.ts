// Zod-Formular-Schema für „Einreichung vermerken" — Feldgrenzen 1:1 gegen
// `EinreichungAnlegenDto` (`src/backend/src/nachweis/dto/einreichung-anlegen.dto.ts`)
// gespiegelt, inklusive der Kohärenz-Regel: `ersetztEinreichungId` und
// `korrekturGrundCode` müssen GEMEINSAM gesetzt oder GEMEINSAM leer sein
// (DB-CHECK `ck_einreichung_ersetzt_kohaerenz`).
//
// `uebermitteltAt` ist der vom Bediener ERKLÄRTE Zeitpunkt (Ehrlichkeits-
// klausel D7) — er wird als Berliner Ortszeit eingegeben und im
// Payload-Mapper nach UTC gewandelt (`shared/format/datum.ts`).

import { z } from 'zod';
import type {
  EinreichungAnlegen,
  EinreichungArt,
  EinreichungUebermittlungsweg,
  KorrekturGrundCode,
} from '@edms/shared';
import { vonOrtszeitEingabe, zuOrtszeitEingabe } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

/** Reihenfolge = Anzeigereihenfolge der `select`-Optionen. */
export const EINREICHUNG_ART_WERTE: readonly EinreichungArt[] = [
  'verwendungsnachweis',
  'zwischennachweis',
  'anfrage_bafa',
  'stichprobe',
];

export const UEBERMITTLUNGSWEG_WERTE: readonly EinreichungUebermittlungsweg[] = [
  'bscw_manuell',
  'email_geschuetzt',
  'api',
];

export const KORREKTUR_GRUND_CODE_WERTE: readonly KorrekturGrundCode[] = [
  'messwert_korrektur',
  'klima_revision',
  'baseline_korrektur',
  'einflussgroesse_korrektur',
  'verfahren_version_neu',
  'parameter_korrektur',
  'foerderjahr_definition_geaendert',
  'sonstige',
];

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const einreichungVermerkenFormSchema = z
  .object({
    art: z.string().min(1, t('nachweis.einreichung.form.errors.artErforderlich')),
    uebermittlungsweg: z.string().min(1, t('nachweis.einreichung.form.errors.uebermittlungswegErforderlich')),
    uebermitteltAt: z
      .string()
      .min(1, t('nachweis.einreichung.form.errors.uebermitteltAtErforderlich'))
      .refine(
        (wert) => vonOrtszeitEingabe(wert) !== undefined,
        t('nachweis.einreichung.form.errors.uebermitteltAtUngueltig'),
      ),
    empfaenger: z
      .string()
      .trim()
      .min(1, t('nachweis.einreichung.form.errors.empfaengerErforderlich'))
      .max(128, t('nachweis.einreichung.form.errors.empfaengerZuLang')),
    anfrageRef: z.string().trim().max(128, t('nachweis.einreichung.form.errors.anfrageRefZuLang')),
    belegRef: z
      .string()
      .trim()
      .refine((wert) => wert.length === 0 || UUID_MUSTER.test(wert), t('nachweis.einreichung.form.errors.belegRefUngueltig')),
    ersetztEinreichungId: z
      .string()
      .trim()
      .refine(
        (wert) => wert.length === 0 || UUID_MUSTER.test(wert),
        t('nachweis.einreichung.form.errors.ersetztEinreichungIdUngueltig'),
      ),
    korrekturGrundCode: z.string(),
  })
  // Beide Fehler hängen am Korrekturgrund: Er ist das Feld, das der Nutzer im
  // einen wie im anderen Fall anfassen muss.
  .refine((werte) => werte.ersetztEinreichungId.length === 0 || werte.korrekturGrundCode.length > 0, {
    path: ['korrekturGrundCode'],
    message: t('nachweis.einreichung.form.errors.korrekturGrundFehlt'),
  })
  .refine((werte) => werte.korrekturGrundCode.length === 0 || werte.ersetztEinreichungId.length > 0, {
    path: ['korrekturGrundCode'],
    message: t('nachweis.einreichung.form.errors.korrekturOhneVorgaenger'),
  });

export type EinreichungVermerkenFormValues = z.infer<typeof einreichungVermerkenFormSchema>;

/**
 * Vorbelegung. `uebermitteltAt` steht auf „jetzt": Der Vermerk folgt in aller
 * Regel unmittelbar auf die Handlung, die er bezeugt. `empfaenger` spiegelt
 * den Server-Default `bafa`.
 */
export function einreichungVermerkenFormDefaultValues(jetztIso: string): EinreichungVermerkenFormValues {
  return {
    art: '',
    uebermittlungsweg: '',
    uebermitteltAt: zuOrtszeitEingabe(jetztIso),
    empfaenger: 'bafa',
    anfrageRef: '',
    belegRef: '',
    ersetztEinreichungId: '',
    korrekturGrundCode: '',
  };
}

/**
 * Mappt die (validierten) Formularwerte auf `EinreichungAnlegen`.
 * `uebermitteltAt` ist zu diesem Zeitpunkt bereits als parsbar geprüft — der
 * Fallback auf den Rohwert kann daher nicht greifen und steht nur, damit der
 * Typ ohne nicht-null-Behauptung aufgeht.
 */
export function toEinreichungVermerkenPayload(values: EinreichungVermerkenFormValues): EinreichungAnlegen {
  const anfrageRef = values.anfrageRef.trim();
  const belegRef = values.belegRef.trim();
  const ersetztEinreichungId = values.ersetztEinreichungId.trim();
  return {
    art: values.art as EinreichungArt,
    uebermittlungsweg: values.uebermittlungsweg as EinreichungUebermittlungsweg,
    uebermitteltAt: vonOrtszeitEingabe(values.uebermitteltAt) ?? values.uebermitteltAt,
    empfaenger: values.empfaenger.trim(),
    ...(anfrageRef.length > 0 ? { anfrageRef } : {}),
    ...(belegRef.length > 0 ? { belegRef } : {}),
    ...(ersetztEinreichungId.length > 0
      ? { ersetztEinreichungId, korrekturGrundCode: values.korrekturGrundCode as KorrekturGrundCode }
      : {}),
  };
}
