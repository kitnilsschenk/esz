/**
 * ADR-0008 §19 (D7) — Envelope-Verschlüsselung, Ports & Adapters. Ein DEK
 * (256 bit) je Subjekt, vom KMS-Master-Key gewrappt
 * (`identity.subjekt_schluessel.wrapped_dek`). Klartext-DEK liegt NIE in der
 * DB — nur im App-Prozessspeicher, transient.
 *
 * Prod-Adapter (später, NICHT Teil dieses Pakets, ADR-0008 §19/§27): Cloud-
 * KMS `GenerateDataKey`/`Decrypt` (AWS KMS `@aws-sdk/client-kms`,
 * Apache-2.0 ✓ / Azure Key Vault `@azure/keyvault-keys`, MIT ✓) — der
 * Master-Key verlässt das HSM nie. Dev-Adapter = `LocalDevKmsAdapter`.
 *
 * KRITISCHER Aufrufer-Constraint (`backend-lead`-Votum 8, ADR-0008 §19
 * Review-Nachtrag, PRÄZISIERT nach Review-Befund Phase 4b — s. ADR-0008
 * §29(C)): ein Cloud-KMS-Roundtrip ist Netzwerk-I/O — er soll nicht
 * innerhalb der INNEREN, savepoint-basierten `@Transactional(Propagation.
 * Nested)`-Klammer laufen (Contention-/Timeout-Risiko). Aufrufer rufen
 * `generateDataKey()`/`unwrapDek()` daher VOR der jeweiligen NESTED-Methode
 * auf und reichen nur das bereits im Speicher liegende Klartext-Ergebnis
 * (DEK) hinein.
 *
 * Das erfüllt den Constraint NUR relativ zur inneren Nested-Tx — NICHT
 * relativ zur äußeren Request-Transaktion: der global registrierte
 * `TransactionInterceptor` öffnet für jeden Request (außer
 * `@SkipTransaction`) bereits VOR dem Controller eine `Propagation.
 * Required`-Transaktion mit sofortigem BEGIN auf derselben DB-Verbindung.
 * `generateDataKey()`/`unwrapDek()` laufen damit TATSÄCHLICH innerhalb einer
 * bereits offenen (äußeren) Transaktion — nur außerhalb des inneren
 * SAVEPOINTs. Für den `LocalDevKmsAdapter` (synchron, kein echter
 * Netzwerk-Roundtrip) ist das unkritisch. Vor Einführung eines echten
 * Cloud-KMS-Adapters (ADR-0005) ist das architektonisch zu lösen — sonst
 * hält die äußere Request-Tx die DB-Verbindung über die KMS-Netz-Latenz
 * offen. Offener Punkt: ADR-0008 §29(C).
 */
export interface GeneratedDataKey {
  /** Klartext-DEK (32 Byte) — NUR im Prozessspeicher, NIE persistiert. */
  readonly dek: Buffer;
  /** Vom KMS-Master-Key gewrapptes DEK — das, was in der DB landet. */
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
}

export interface WrappedDekRef {
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
}

export interface KeyManagementPort {
  /** Generiert einen neuen DEK + liefert Klartext UND gewrapptes Chiffrat. */
  readonly generateDataKey: () => Promise<GeneratedDataKey>;
  /** Entpackt ein gewapptes DEK zurück zum Klartext-DEK. */
  readonly unwrapDek: (ref: WrappedDekRef) => Promise<Buffer>;
}

export const KEY_MANAGEMENT_PORT = Symbol('KEY_MANAGEMENT_PORT');
