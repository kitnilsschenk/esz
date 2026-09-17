import type { EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';

/**
 * Die BEFRISTETEN Tatbestände des Art. 18 Abs. 1 DSGVO (ADR-0007 A11.11).
 *
 * Nur diese zwei tragen dem Wortlaut nach eine zeitliche Grenze:
 *
 *   * `art18_1a_richtigkeit` — „für eine Dauer, die es dem Verantwortlichen
 *     ermöglicht, die Richtigkeit der personenbezogenen Daten zu überprüfen"
 *   * `art18_1d_widerspruch` — „solange noch nicht feststeht, ob die
 *     berechtigten Gründe des Verantwortlichen gegenüber denen der betroffenen
 *     Person überwiegen"
 *
 * BEWUSST NICHT enthalten:
 *   * `art18_1b_unrechtmaessig` — die betroffene Person hat die Löschung
 *     abgelehnt und die Einschränkung stattdessen VERLANGT; sie endet nicht
 *     von selbst, sondern auf ihren Wunsch.
 *   * `art18_1c_rechtsverteidigung_betroffener` — sie besteht, solange die
 *     Daten zur Rechtsverteidigung benötigt werden; das Ende bestimmt der
 *     Rechtsstreit, nicht eine Prüffrist des Verantwortlichen.
 *
 * Diese zwei mit zu überwachen wäre nicht „sicherheitshalber mehr", sondern
 * falsch: die Wiedervorlage würde Vorgänge als überfällig melden, die
 * regelkonform fortbestehen — und die Liste damit zu Rauschen machen, das
 * niemand mehr liest.
 */
export const BEFRISTETE_EINSCHRAENKUNG_GRUENDE: readonly EinschraenkungGrundCode[] = [
  'art18_1a_richtigkeit',
  'art18_1d_widerspruch',
];

/**
 * Vorgabe-Schwelle der Wiedervorlage in Tagen.
 *
 * Art. 18 nennt KEINE Zahl — die Dauer ist an den Zweck gebunden („die es dem
 * Verantwortlichen ermöglicht, die Richtigkeit zu überprüfen"). Ein
 * willkürlicher Wert wäre hier schlechter als gar keiner, deshalb ist die
 * Zahl an eine Norm angelehnt statt geschätzt: **Art. 12 Abs. 3** gibt dem
 * Verantwortlichen EINEN MONAT, um auf einen Antrag der betroffenen Person zu
 * reagieren (um zwei Monate verlängerbar). Eine Prüfung, die nach dieser
 * Frist noch läuft, verdient eine Wiedervorlage — nicht als Verstoß, sondern
 * als Anlass zur Nachschau.
 *
 * Die Schwelle ist daher eine BETRIEBLICHE Vorgabe, keine Rechtsfolge: sie
 * löst nichts aus, sie macht sichtbar. Der Endpunkt lässt sie überschreiben
 * (`schwelleTage`), damit die Fachseite ohne Code-Änderung anders schneiden
 * kann.
 *
 * OFFEN (analog A16): die organisatorische Bestätigung dieses Werts steht aus.
 * Bis dahin ist er als Ausgangswert dokumentiert, nicht als beschlossene
 * Frist.
 */
export const EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_DEFAULT = 30;

/** Zulässiger Bereich der überschreibbaren Schwelle (Schutz vor Unsinn-Eingaben). */
export const EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_MIN = 1;
export const EINSCHRAENKUNG_WIEDERVORLAGE_TAGE_MAX = 3650;
