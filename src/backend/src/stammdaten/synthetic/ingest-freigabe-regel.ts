import type { IngestFreigabeStand } from './ingest-freigabe.repository';

/**
 * Die Entscheidungsregeln des Ingest-Gate-Markers (ADR-0008 §22, V0083) —
 * als reine Funktion, ohne Nest, ohne Datenbank.
 *
 * Warum getrennt vom Service: Was hier steht, ist die eigentliche Sicherung.
 * Sie gehört prüfbar, ohne dafür einen Anwendungskontext hochzufahren — wie
 * `domain/baseline-regression.ts` und `domain/tb03-regel.ts` im selben
 * Repository. Der Service holt den Stand und ruft diese Funktion; mehr tut er
 * nicht.
 *
 * Wirft bei jedem Zweifel. Es gibt keinen Rückgabewert „unklar": Ein Gate,
 * das im Zweifel öffnet, ist keins.
 */
export function pruefeIngestFreigabe(
  stand: IngestFreigabeStand | undefined,
  erwarteterFingerabdruck: string | undefined,
): void {
  if (stand === undefined) {
    throw new Error(
      'EDMS_SYNTHETIC_ONLY=false, aber in gate.ingest_freigabe steht keine Erklaerung — fail-closed ' +
        '(ADR-0008 §22). Der Betrieb mit echten Personendaten setzt eine erteilte Freigabe voraus; sie ' +
        'wird von der Rolle edms_ingest_freigabe geschrieben, nicht von der Anwendung.',
    );
  }

  if (!stand.wirksam) {
    throw new Error(
      `EDMS_SYNTHETIC_ONLY=false, aber die letzte Erklaerung ist ein ${stand.art} vom ` +
        `${stand.erklaertAt.toISOString()} — fail-closed (ADR-0008 §22). Ein Widerruf gilt, bis eine ` +
        'neue Freigabe erklaert wird.',
    );
  }

  if (erwarteterFingerabdruck === undefined || erwarteterFingerabdruck.trim() === '') {
    throw new Error(
      'EDMS_SYNTHETIC_ONLY=false, aber EDMS_INGEST_FREIGABE_FINGERABDRUCK ist nicht gesetzt — ' +
        'fail-closed (ADR-0008 §22). Der Wert kommt aus dem Deploy-Gate ' +
        '(`node tools/ci/ingest-gate-status.mjs --fingerabdruck`) und bindet diesen Start an den ' +
        'Nachweis-Stand, gegen den die Freigabe erklaert wurde.',
    );
  }

  if (erwarteterFingerabdruck !== stand.aktenstandFingerabdruck) {
    // Der eigentliche Gewinn gegenueber einem blossen Ja/Nein: Eine Freigabe
    // gilt fuer EINEN Stand der Nachweise. Wird spaeter eine DSFA
    // ueberarbeitet oder ein AVV-Register geaendert, passt der Fingerabdruck
    // nicht mehr — und die Freigabe gilt nicht stillschweigend weiter. Ohne
    // diese Bindung waere der Marker eine Unterschrift auf einem Blankoblatt.
    throw new Error(
      'EDMS_SYNTHETIC_ONLY=false, aber der Nachweis-Stand hat sich seit der Freigabe geaendert — ' +
        `fail-closed (ADR-0008 §22). Erwartet laut Deploy: ${erwarteterFingerabdruck}; erklaert wurde ` +
        `gegen: ${stand.aktenstandFingerabdruck ?? '(keiner)'}. Eine Freigabe gilt fuer EINEN Stand der ` +
        'Nachweise und ist nach einer Aenderung neu zu erklaeren.',
    );
  }
}
