import { apiClient, toApiProblemError, type EndkundeLabelItem } from '@edms/shared';

/**
 * Serverseitige Mengengrenze aus `EndkundeLabelsAnfrageDto` (Auflage A2,
 * ADR-0008 D12) — **100, nicht 500** wie beim Standort-Batch.
 *
 * Der Standort-Endpunkt liegt unter `{endkundeId}` und ist durch die
 * Mandantengrenze gedeckelt; dieser hat keine solche Obergrenze. 100 ist
 * zugleich das `limit`-Maximum der Listen, womit gilt: **1 Aufruf = 1
 * dargestellte Seite = 1 Audit-Event** — genau diese Gleichung macht die
 * Audit-Granularität „je Aufruf" verhältnismäßig.
 *
 * Anders als beim Standort wird hier BEWUSST NICHT gechunkt: Eine Anfrage
 * über mehr als eine Seite hinweg würde die Gleichung brechen (Korollar K4)
 * und aus einem Seitenaufruf mehrere Audit-Ereignisse machen. Wer mehr als
 * 100 Ids hat, hat einen Aufruf zu viel gebaut — deshalb schneidet diese
 * Funktion ab, statt still zu stückeln.
 */
export const ENDKUNDE_LABELS_MAX_BATCH_GROESSE = 100;

/**
 * `operationId: endkundeLabelsBatch` (`POST /stammdaten/endkunden/labels`,
 * `read:endkunde_pii`, ADR-0008 D12).
 *
 * **Kein `Idempotency-Key`** (Nebenbefund N1 der K14-Entscheidung), anders als
 * beim Standort-Sibling: Der Header ist für schreibende Operationen gedacht;
 * POST ist hier nur gewählt, weil eine Id-Menge nicht in den Query-String
 * gehört. Seine Semantik legte zudem nahe, das Audit-Event bei Wiederholung zu
 * unterdrücken — ein Bruch von Auflage A6, denn jede Einsicht ist eine
 * Einsicht.
 *
 * Die Antwortmenge kann KLEINER sein als die Anfragemenge: gesperrte
 * (Art. 18), geschredderte (Art. 17) und unbekannte Ids fallen serverseitig
 * still heraus (A4) — ohne Begründung, ohne Fehler. Der Aufrufer behandelt
 * eine fehlende Id schlicht als „kein Label" und zeigt weiter das Pseudonym.
 */
export async function postEndkundeLabelsBatch(endkundeIds: readonly string[]): Promise<EndkundeLabelItem[]> {
  if (endkundeIds.length === 0) {
    return [];
  }

  const { data, error } = await apiClient.POST('/stammdaten/endkunden/labels', {
    body: { endkundeIds: [...endkundeIds].slice(0, ENDKUNDE_LABELS_MAX_BATCH_GROESSE) },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
