import type { EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import type { VerarbeitungsStatus } from '../persistence/energy/energy-endkunde.repository';
import { konflikt, ungueltigeEingabe } from './problem.util';

/**
 * Der Zustand, den die Entscheidung braucht — bewusst ein STRUKTURELLER Typ
 * statt `Endkunde | Anschlussnutzer`: die Regel haengt an genau diesen zwei
 * Feldern und soll nicht an Entitaets-Typen gebunden sein.
 */
export interface SperrZustand {
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  /**
   * Optional UND explizit `undefined`-faehig: die Repository-Typen fuehren
   * das Feld als optionale Spalte (`exactOptionalPropertyTypes` unterscheidet
   * „fehlt" von „ist undefined"). Beide Faelle bedeuten hier dasselbe —
   * kein dokumentierter Grund, also fail-closed.
   */
  readonly einschraenkungGrundCode?: string | null | undefined;
  /**
   * Auflage C-8 (V0087): die am Sperrvorgang festgehaltene Entscheidung, ob
   * bei lit. b / lit. d WEITER ERHOBEN wird. `null`/fehlend heisst „Frage
   * stellt sich nicht" (lit. a / lit. c) oder „Bestandszeile aus der Zeit vor
   * V0087" — beides ist KEINE Entscheidung gegen die Erhebung, s.
   * `pruefeNeuerhebungsEntscheidung()`.
   */
  readonly neuerhebungFortsetzen?: boolean | null | undefined;
}

/**
 * Die beiden Art.-18-Tatbestaende, bei denen sich die Frage nach der
 * WEITEREN ERHEBUNG ueberhaupt stellt (Auflage C-8, ADR-0012 Stufe C).
 *
 * Warum nur diese zwei: Art. 18 Abs. 2 nimmt die SPEICHERUNG aus der
 * Einschraenkung aus — bei lit. a (bestrittene Richtigkeit) und lit. c
 * (Rechtsverteidigung der betroffenen Person) laeuft die Messung deshalb
 * ohne Weiteres weiter, ihr Ergebnis wird nur nicht ausgewertet. Bei lit. b
 * (die Verarbeitung ist unrechtmaessig) und lit. d (Widerspruch nach Art. 21
 * anhaengig) steht dagegen die Rechtmaessigkeit des Erhebens selbst in Frage,
 * und der Ingest-Pfad ist Erhebung UND Speicherung in einem Vorgang. Wer hier
 * weitermisst, entscheidet — die Frage ist, ob bewusst.
 *
 * Spiegelbild von `c_gruende_mit_frage` in
 * `consent.ingest_rechtsgrundlage_wirksam()` (V0087). Die Liste steht
 * zwangslaeufig an beiden Orten: die Datenbank muss ohne die Anwendung
 * entscheiden koennen, die Anwendung ohne Datenbank-Rundreise validieren.
 * Wer sie aendert, aendert BEIDE — ein Integrationstest
 * (`consent-ingest-rechtsgrundlage-gate.integration.spec.ts`) haelt die
 * Wirkung zusammen.
 */
export const GRUENDE_MIT_NEUERHEBUNGSFRAGE: readonly EinschraenkungGrundCode[] = [
  'art18_1b_unrechtmaessig',
  'art18_1d_widerspruch',
];

/**
 * Validiert die C-8-Entscheidung gegen den Sperrgrund und liefert den zu
 * speichernden Wert (`boolean` bei lit. b / lit. d, sonst `null`).
 *
 * BEIDE Richtungen sind ein 400, nicht eine stille Korrektur:
 *
 * - FEHLT sie bei lit. b / lit. d, gibt es keinen vertretbaren Default. `true`
 *   hiesse weitermessen, obwohl die Rechtmaessigkeit gerade bestritten ist;
 *   `false` hiesse die Messreihe abreissen zu lassen, obwohl der Widerspruch
 *   noch geprueft wird und eine Luecke sich spaeter nicht nachfuellen laesst.
 *   Der DB-CHECK `ck_*_neuerhebung_entschieden` (V0087) laesst die Zeile
 *   ohnehin nicht zu — ohne diese Pruefung waere die Antwort ein 500 statt
 *   einer Erklaerung, was fehlt.
 * - IST sie bei lit. a / lit. c gesetzt, wird sie NICHT einfach verworfen. Der
 *   Aufrufer glaubte sonst, eine Entscheidung dokumentiert zu haben, die
 *   nirgends steht — derselbe Fehlermodus, den `entscheideSperre()` weiter
 *   unten fuer den Grund beschreibt.
 */
export function pruefeNeuerhebungsEntscheidung(
  grund: EinschraenkungGrundCode,
  entscheidung: boolean | undefined,
  subjektBezeichnung: string,
): boolean | null {
  const frageStelltSich = GRUENDE_MIT_NEUERHEBUNGSFRAGE.includes(grund);

  if (frageStelltSich && entscheidung === undefined) {
    throw ungueltigeEingabe(
      `${subjektBezeichnung}: bei diesem Einschraenkungsgrund ist ausdruecklich zu entscheiden, ob die ` +
        'Messdaten-Erhebung fortgesetzt wird (`neuerhebungFortsetzen`). Art. 18 Abs. 2 nimmt nur die ' +
        'SPEICHERUNG aus der Einschraenkung aus; bei lit. b und lit. d steht die Rechtmaessigkeit des ' +
        'Erhebens selbst in Frage. Es gibt dafuer keine sinnvolle Voreinstellung.',
    );
  }

  if (!frageStelltSich && entscheidung !== undefined) {
    throw ungueltigeEingabe(
      `${subjektBezeichnung}: bei diesem Einschraenkungsgrund stellt sich die Frage nach der weiteren Erhebung ` +
        'nicht (Art. 18 Abs. 2 nimmt die Speicherung aus) — `neuerhebungFortsetzen` wird hier nicht ' +
        'entgegengenommen, damit keine Entscheidung dokumentiert erscheint, die es nicht gibt.',
    );
  }

  return frageStelltSich ? (entscheidung ?? null) : null;
}

/**
 * `'sperren'` = das Subjekt ist `aktiv` und muss jetzt eingeschraenkt werden.
 * `'idempotent'` = es ist bereits mit GENAU DIESEM Grund eingeschraenkt; der
 * Aufruf wird mit 200 und unveraendertem Zustand beantwortet, OHNE erneut zu
 * schreiben.
 */
export type SperrEntscheidung = 'sperren' | 'idempotent';

/**
 * Die EINE Entscheidungsregel fuer Art.-18-Sperren (ADR-0007 A11.2) — geteilt
 * von `EndkundeService` und `AnschlussnutzerService`.
 *
 * Bewusst hier statt in beiden Services dupliziert: Endkunde und
 * Anschlussnutzer sind zwei eigenstaendige betroffene Personen mit
 * IDENTISCHER Art.-18-Semantik. Zwei unabhaengig gepflegte Kopien waeren
 * genau die Divergenzgefahr, die dieses Repo an anderer Stelle bereits
 * benennt (s. `toVerarbeitungsStatus()`-Kommentar in
 * `energy-anschlussnutzer.repository.ts`) — und eine Divergenz faende hier
 * niemand, weil beide Pfade fuer sich genommen plausibel blieben.
 *
 * Warum die Entscheidung ueberhaupt noetig ist: der Guard
 * `WHERE verarbeitungs_status = 'aktiv'` im UPDATE greift bei bereits
 * gesperrtem Subjekt nicht, das Statement schreibt also nichts. Ohne
 * vorgelagerte Entscheidung waere die Antwort trotzdem 200 und der
 * mitgelieferte Grund STILL verworfen — der Sachbearbeiter glaubt
 * dokumentiert zu haben, die Datenbank haelt nichts, und der Preflight
 * schliesst das Paar weiterhin fail-closed aus. Fail-open in der Wahrnehmung
 * bei Fail-closed in der Wirkung.
 *
 * Wirft `konflikt()` (409, `application/problem+json`) in allen Faellen, in
 * denen weder gesperrt noch idempotent quittiert werden darf. Ein bestehender
 * Grund wird ueber diesen Pfad NIEMALS ueberschrieben: ein Wechsel 1a -> 1d
 * ist eine inhaltliche Aenderung des Art.-18-Vorgangs (andere Frist, andere
 * Wirkung im Nachweis, ggf. Art.-19-Ausloeser) und braucht einen eigenen
 * dokumentierten Vorgang.
 *
 * @param subjektBezeichnung Fachbegriff fuer die Fehlermeldung („Endkunde",
 *   „Anschlussnutzer") — die 409-Texte richten sich an das Betriebs-Team.
 */
export function entscheideSperre(
  zustand: SperrZustand,
  grund: EinschraenkungGrundCode,
  subjektBezeichnung: string,
  neuerhebungFortsetzen: boolean | null,
): SperrEntscheidung {
  if (zustand.verarbeitungsStatus === 'geloescht') {
    throw konflikt(
      `${subjektBezeichnung}: nach Art. 17 geloescht (Krypto-Shredding vollzogen) — eine Verarbeitungseinschraenkung ` +
        'ist nicht mehr moeglich.',
    );
  }

  if (zustand.verarbeitungsStatus !== 'gesperrt') {
    return 'sperren';
  }

  if (zustand.einschraenkungGrundCode === grund) {
    // Auflage C-8: Gleicher Grund allein macht den Aufruf noch nicht
    // idempotent. Weicht die MITGELIEFERTE Erhebungs-Entscheidung von der
    // gespeicherten ab, waere eine stille 200 derselbe Fehlermodus, den der
    // Abschnitt ueber den Grund weiter unten beschreibt — der Sachbearbeiter
    // glaubt umentschieden zu haben, das Gate misst weiter wie zuvor.
    //
    // `!==` statt `IS DISTINCT FROM`-Nachbau reicht: beide Werte sind zu
    // diesem Zeitpunkt durch `pruefeNeuerhebungsEntscheidung()` bzw.
    // `mapRow()` auf `boolean | null` normalisiert, `undefined` kommt hier
    // nicht mehr an. Ausnahme ist die Bestandszeile aus der Zeit vor V0087
    // (Spalte NULL bei lit. b/d): sie faellt in den Zweig und liefert die
    // Erklaerung, dass die Entscheidung nachzutragen ist — richtig so, denn
    // nachgetragen wird sie ueber einen eigenen Vorgang, nicht ueber einen
    // Wiederholungsaufruf des Sperrens.
    const gespeichert = zustand.neuerhebungFortsetzen ?? null;
    if (gespeichert !== neuerhebungFortsetzen) {
      throw konflikt(
        `${subjektBezeichnung}: bereits mit diesem Grund eingeschraenkt, aber mit einer anderen Entscheidung ` +
          'ueber die weitere Messdaten-Erhebung. Diese Entscheidung wird ueber den Sperr-Pfad nicht ' +
          'ueberschrieben — ihre Aenderung ist ein eigener dokumentierter Vorgang.',
      );
    }
    return 'idempotent';
  }

  if (zustand.einschraenkungGrundCode === null || zustand.einschraenkungGrundCode === undefined) {
    throw konflikt(
      `${subjektBezeichnung}: bereits ohne dokumentierten Grund eingeschraenkt (Bestandsdaten). Das nachtraegliche ` +
        'Erfassen des Grundes ist ein eigener Vorgang und wird ueber diesen Pfad nicht vorgenommen.',
    );
  }

  throw konflikt(
    `${subjektBezeichnung}: bereits mit einem abweichenden Grund eingeschraenkt. Ein bestehender ` +
      'Einschraenkungsgrund wird ueber diesen Pfad nicht ueberschrieben — die Aenderung des Art.-18-Vorgangs ist ' +
      'ein eigener Vorgang.',
  );
}

/**
 * `'aufheben'` = das Subjekt ist `gesperrt` und die Einschraenkung ist jetzt
 * aufzuheben (der Unterrichtungs-Nachweis nach Art. 18 Abs. 3 wird davon
 * UNABHAENGIG geprueft, s. Aufrufer -- er braucht Datenbankzugriff und
 * gehoert daher nicht in diese reine Funktion).
 * `'idempotent'` = das Subjekt ist bereits `aktiv`; der Aufruf wird mit 200
 * und unveraendertem Zustand beantwortet, OHNE zu schreiben.
 */
export type AufhebungEntscheidung = 'aufheben' | 'idempotent';

/**
 * Zustandsregel fuer die Aufhebung einer Art.-18-Einschraenkung (ADR-0007
 * A11.7/A11.10) -- geteilt von `EndkundeService` und
 * `AnschlussnutzerService`, aus denselben Gruenden wie `entscheideSperre()`.
 *
 * NUR `gesperrt -> aktiv`. Aus `geloescht` (Art. 17 vollzogen) wird
 * fail-closed ABGELEHNT und ausdruecklich NICHT idempotent quittiert: eine
 * stille 200 wuerde dem Betriebs-Team suggerieren, es habe eine
 * Einschraenkung aufgehoben, die es gar nicht mehr gibt -- und die Frage
 * verdecken, warum jemand eine geloeschte Person zu entsperren versucht.
 *
 * `aktiv` ist dagegen echt idempotent: es gibt nichts aufzuheben, nichts zu
 * verbergen und keinen Nachweis, der fehlen koennte.
 */
export function entscheideAufhebung(zustand: SperrZustand, subjektBezeichnung: string): AufhebungEntscheidung {
  if (zustand.verarbeitungsStatus === 'geloescht') {
    throw konflikt(
      `${subjektBezeichnung}: nach Art. 17 geloescht (Krypto-Shredding vollzogen) — es besteht keine ` +
        'Verarbeitungseinschraenkung, die aufgehoben werden koennte.',
    );
  }

  return zustand.verarbeitungsStatus === 'gesperrt' ? 'aufheben' : 'idempotent';
}

/**
 * Wird geworfen, wenn die Aufhebung ohne den nach Art. 18 Abs. 3 geschuldeten
 * Unterrichtungs-Nachweis versucht wird. Eigene Funktion, damit BEIDE Services
 * denselben Wortlaut verwenden -- der Text erklaert dem Betriebs-Team den
 * naechsten Schritt, nicht nur das Scheitern.
 */
export function fehlenderUnterrichtungsNachweis(subjektBezeichnung: string): Error {
  return konflikt(
    `${subjektBezeichnung}: die Aufhebung setzt voraus, dass die betroffene Person zuvor unterrichtet wurde ` +
      '(Art. 18 Abs. 3 DSGVO). Bitte zuerst die Unterrichtung dokumentieren — der Nachweis muss sich auf ' +
      'GENAU diese Einschraenkung beziehen (Bindung ueber den Sperrzeitpunkt).',
  );
}
