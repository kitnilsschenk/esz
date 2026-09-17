import { X509Certificate } from 'node:crypto';

/**
 * Liest das Ablaufdatum aus einem PEM-Zertifikat.
 *
 * **`node:crypto` statt einer Bibliothek.** Node kann X.509 seit v15 selbst;
 * eine zusätzliche Abhängigkeit für `notAfter` wäre nicht zu rechtfertigen —
 * schon gar nicht in einem Vorhaben mit Lizenzprüfpflicht je Paket
 * (`.claude/rules/dependencies.md`).
 *
 * **`undefined` statt Fehler bei unlesbarem Inhalt.** Ein Zertifikat, dessen
 * Ablaufdatum sich nicht ermitteln lässt, soll die Pflege nicht blockieren:
 * Der Verbindungsaufbau ist die Stelle, an der sich echte Gültigkeit
 * entscheidet, nicht das Formular. Die Betriebssicht sagt dann „unbekannt"
 * statt einer erfundenen Zahl.
 */
export function leseGueltigBis(pem: string): string | undefined {
  if (pem.length === 0) {
    return undefined;
  }
  try {
    const zertifikat = new X509Certificate(pem);
    const bis = new Date(zertifikat.validTo);
    return Number.isNaN(bis.getTime()) ? undefined : bis.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Ist das Zertifikat zum Prüfzeitpunkt bereits abgelaufen?
 *
 * Ein abgelaufenes Zertifikat einzuspielen ist kein Grenzfall, sondern der
 * häufigste Bedienfehler beim Erneuern: Man kopiert versehentlich das ALTE.
 * Es anzunehmen hieße, eine Verbindung zu konfigurieren, die sicher nicht
 * zustande kommt — und der Grund stünde nur im Worker-Protokoll.
 */
export function istAbgelaufen(pem: string, jetzt: Date = new Date()): boolean {
  const bis = leseGueltigBis(pem);
  return bis !== undefined && new Date(bis).getTime() <= jetzt.getTime();
}
