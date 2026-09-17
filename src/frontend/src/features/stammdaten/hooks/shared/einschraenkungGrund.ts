import type { EinschraenkungGrund } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

type MessageKey = Parameters<typeof t>[0];

/**
 * Die vier Tatbestaende des Art. 18 Abs. 1 DSGVO in der Reihenfolge der Norm —
 * EIN Vokabular fuer Endkunde UND Anschlussnutzer, fuer das Setzen wie fuer
 * das Anzeigen.
 *
 * Bewusst geteilt statt je Entitaet dupliziert: beide sind eigenstaendige
 * betroffene Personen mit IDENTISCHER Art.-18-Semantik. Zwei unabhaengig
 * gepflegte Listen wuerden frueher oder spaeter auseinanderlaufen — und eine
 * Divergenz faende hier niemand, weil beide Oberflaechen fuer sich genommen
 * plausibel blieben. Dieselbe Begruendung wie serverseitig bei
 * `entscheideSperre()`.
 *
 * Es gibt bewusst KEINE Auffangoption: Art. 18 Abs. 1 kennt keine
 * Auffangklausel, und ein „sonstiges" waere binnen Wochen der Sammeleimer
 * (ADR-0007 A11.1).
 */
export const EINSCHRAENKUNG_GRUND_OPTIONEN: readonly {
  readonly wert: EinschraenkungGrund;
  readonly labelKey: MessageKey;
}[] = [
  { wert: 'art18_1a_richtigkeit', labelKey: 'stammdaten.common.einschraenkungGrund.optionen.art18_1a' },
  { wert: 'art18_1b_unrechtmaessig', labelKey: 'stammdaten.common.einschraenkungGrund.optionen.art18_1b' },
  {
    wert: 'art18_1c_rechtsverteidigung_betroffener',
    labelKey: 'stammdaten.common.einschraenkungGrund.optionen.art18_1c',
  },
  { wert: 'art18_1d_widerspruch', labelKey: 'stammdaten.common.einschraenkungGrund.optionen.art18_1d' },
];

/**
 * Beschreibt den Tatbestand sachlich und ohne Wertung ueber die betroffene
 * Person (ADR-0007 A11.4).
 */
export function einschraenkungGrundLabel(grund: EinschraenkungGrund): string {
  const option = EINSCHRAENKUNG_GRUND_OPTIONEN.find((eintrag) => eintrag.wert === grund);
  // Unerreichbar, solange die generierten Typen und diese Liste denselben
  // Stand haben — der Fallback vermeidet einen leeren Tabelleneintrag, falls
  // die Spec um einen Wert waechst, bevor die Uebersetzung nachgezogen ist.
  return option === undefined ? grund : t(option.labelKey);
}

/**
 * Die beiden Tatbestaende, bei denen ueber die WEITERE ERHEBUNG zu
 * entscheiden ist (Auflage C-8, ADR-0012 Stufe C).
 *
 * Bei lit. a und lit. c stellt sich die Frage nicht: Art. 18 Abs. 2 nimmt die
 * SPEICHERUNG aus der Einschraenkung aus, die Messung laeuft dort ohne
 * Weiteres weiter und nur ihre Auswertung ruht. Bei lit. b (die Verarbeitung
 * ist unrechtmaessig) und lit. d (Widerspruch anhaengig) steht dagegen die
 * Rechtmaessigkeit des Erhebens selbst in Frage — und der Ingest-Pfad ist
 * Erhebung UND Speicherung in einem Vorgang.
 *
 * Die Liste spiegelt `GRUENDE_MIT_NEUERHEBUNGSFRAGE` im Backend und
 * `c_gruende_mit_frage` in `consent.ingest_rechtsgrundlage_wirksam()`. Sie
 * steht hier nur, damit das Formular das Feld ueberhaupt zeigen kann —
 * durchgesetzt wird die Regel serverseitig (400 bei fehlender und bei
 * ueberfluessiger Angabe), nicht hier.
 */
export function brauchtNeuerhebungsEntscheidung(grund: EinschraenkungGrund | ''): boolean {
  return grund === 'art18_1b_unrechtmaessig' || grund === 'art18_1d_widerspruch';
}
