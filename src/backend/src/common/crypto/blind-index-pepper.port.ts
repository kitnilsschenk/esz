/**
 * ADR-0005 §26.3 (D14, O4 Vorgabe-Punkt 2) — Ports & Adapters für das
 * system-weite Blind-Index-Pepper-Geheimnis (O(1)-Lookup DevEUI →
 * `device.geraet_zuordnung`, ohne lineares Entschlüsseln aller Zeilen).
 *
 * **RL-3 (rote Linie, verbindlich):** der Pepper
 *   - ist ≥ 256 bit (32 Byte),
 *   - kommt **ausschließlich** aus KMS/Vault/ENV — **niemals** aus der DB,
 *   - wird **niemals** geloggt (auch nicht in Fehlermeldungen/Metriken),
 *   - ist **umgebungsgetrennt** (dev/staging/prod verwenden unterschiedliche
 *     Pepper-Werte, SEC-8, ADR-0005 §26.3),
 *   - ist **least-privilege**-zugänglich: `getActivePepper()` ist
 *     ausschließlich der Worker- und der Provisioning-Identität zugänglich
 *     (kein allgemeiner KMS-Zugriff für andere Prinzipale, ADR-0005 §26.3).
 *
 * Prod-Adapter (später, NICHT Teil dieses Pakets): Cloud-KMS/Vault-Secret-
 * Read (Netzwerk-I/O) — deshalb `async`, konsistent zum Stil von
 * `KeyManagementPort` (s. dort). Dev-Adapter = `LocalDevPepperAdapter`.
 *
 * **Scope-Hinweis (bewusste Einschränkung dieses Pakets):** ADR-0005 §26.3
 * skizziert den Ziel-Port zusätzlich mit einer Methode
 * `getPepperByVersion(version): Promise<Buffer>` (für den
 * Rotations-Übergang, "nicht v1-blockierend, da synthetic-only mit fixem
 * Dev-Pepper"). Diese Methode ist HIER bewusst **noch nicht** Teil des
 * Ports (kein Rotations-Mechanismus in diesem Refactoring-Paket) — s.
 * Auslieferungsbericht `backend-lead`, zur Entscheidung beim nächsten
 * Ausbauschritt (Pepper-Rotation).
 */
export interface ActiveBlindIndexPepper {
  /** Pepper-Geheimnis (≥ 32 Byte / 256 bit) — NUR im Prozessspeicher, NIE persistiert/geloggt. */
  readonly pepper: Buffer;
  /** Pepper-Versionsnummer — wird zusammen mit dem Blind-Index gespeichert (Rotations-Voraussetzung). */
  readonly version: number;
}

export interface BlindIndexPepperPort {
  /** Liefert den aktuell aktiven Pepper + dessen Version. */
  readonly getActivePepper: () => Promise<ActiveBlindIndexPepper>;
}

export const BLIND_INDEX_PEPPER_PORT = Symbol('BLIND_INDEX_PEPPER_PORT');
