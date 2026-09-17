import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import { logger } from './logger.js';

/**
 * Fixe, beliebig gewählte Kennung für den Advisory-Lock-Scope "EDMS-
 * Migrations-Runner" (ADR-0001 §10.4 (c)). Jeder Prozess (CI, lokal, künftige
 * Tools), der mit demselben Schlüssel `pg_advisory_lock` aufruft, serialisiert
 * sich gegen alle anderen — genau das schützt vor parallelen Runner-Läufen
 * gegen dieselbe Datenbank. Der Zahlenwert selbst hat keine weitere
 * Bedeutung; er darf sich künftig NICHT ändern, ohne alle Runner-Instanzen
 * gleichzeitig zu aktualisieren.
 */
export const ADVISORY_LOCK_KEY = '727472931';

export async function connect(config: ClientConfig): Promise<Client> {
  const client = new Client(config);

  // Migrations-Hinweise sichtbar machen (database-lead-Review 2026-09-17).
  //
  // Ohne diesen Handler verschluckt der Runner JEDES `RAISE NOTICE`/`RAISE
  // WARNING` aus einer Migration. Aufgefallen an V0087: Die Migration meldet
  // dem Betreiber, wie viele Art.-18-Sperren ohne Erhebungs-Entscheidung
  // zurueckbleiben — und diese Meldung kam nirgends an. Ein Hinweis, den
  // niemand sieht, ist kein Hinweis; die Migration haette stillschweigend
  // eine offene fachliche Aufgabe hinterlassen.
  //
  // GRENZE ZUR LOGGING-REGEL (s. `logger.ts`): Dort steht, dass niemals
  // Datenbank-Fehlermeldungen im Rohformat geloggt werden, weil sie
  // Tabellendaten oder Query-Fragmente echoen koennen. Das gilt unveraendert
  // fuer FEHLER. Was hier durchgereicht wird, ist etwas anderes: der Text
  // eines `RAISE` aus einer Migration DIESES Repositories — selbst
  // verfasster Text, kein von der Datenbank zurueckgeworfener Inhalt.
  //
  // Daraus folgt eine Pflicht fuer Migrations-Autoren: In `RAISE` gehoeren
  // Anzahlen, Codes und Dateinamen — NIEMALS Zeileninhalte, IDs von
  // betroffenen Personen oder Messwerte. Wer eine Zeile ausgeben will, gibt
  // stattdessen die ABFRAGE aus, mit der man sie findet (Muster V0087).
  // NUR `WARNING` und hoeher. `RAISE NOTICE` bleibt bewusst unsichtbar:
  // PostgreSQL selbst schickt auf diesem Kanal reichlich Eigengeplauder
  // ("relation ... already exists, skipping", "role ... has already been
  // granted membership"), das in einem Migrationsprotokoll nur Rauschen ist
  // und die eine Zeile verdeckt, auf die es ankommt. Wer aus einer Migration
  // heraus den Betreiber ansprechen will, nimmt `RAISE WARNING` -- das ist
  // dann auch eine bewusste Entscheidung und keine Debug-Ausgabe, die
  // versehentlich stehen blieb.
  client.on('notice', (notice) => {
    const text = notice.message ?? '';
    if (text.length === 0 || notice.severity !== 'WARNING') {
      return;
    }
    logger.warn(`[Migration] ${text}`);
  });

  await client.connect();
  return client;
}

/**
 * Nimmt den prozessweiten Advisory-Lock, führt `fn` aus und gibt den Lock in
 * einem `finally` garantiert wieder frei — auch bei Fehlern in `fn`.
 */
export async function withAdvisoryLock<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1::bigint)', [ADVISORY_LOCK_KEY]);
  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]);
  }
}
