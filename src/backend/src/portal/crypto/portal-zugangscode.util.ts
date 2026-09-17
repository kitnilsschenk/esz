import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Alphabet ohne verwechselbare Zeichen — kein `0`/`O`, kein `1`/`I`/`L`.
 *
 * Code und Kennung werden von Papier abgetippt. Ein Zeichendreher führt sonst
 * zu einem Anmeldefehler, den niemand versteht, und im schlechteren Fall zu
 * einem Anruf beim Betrieb, der den Code nicht nachschlagen kann (er existiert
 * nur im Brief).
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Drei Blöcke à vier Zeichen — 12 Zeichen aus 31 Symbolen ≈ 59 Bit. */
const CODE_BLOECKE = 3;
const CODE_BLOCK_LAENGE = 4;

/** `EK-` + sechs Zeichen ≈ 30 Bit — genug, damit Kennungen nicht kollidieren, kurz genug zum Abtippen. */
const KENNUNG_LAENGE = 6;
const KENNUNG_PRAEFIX = 'EK-';

function zufallsZeichen(anzahl: number): string {
  // `randomInt` statt `Math.random()`: Der Code IST das Geheimnis, und ein
  // vorhersagbarer Zufallsgenerator wäre hier die ganze Schwachstelle.
  let ergebnis = '';
  for (let i = 0; i < anzahl; i += 1) {
    ergebnis += ALPHABET[randomInt(ALPHABET.length)];
  }
  return ergebnis;
}

/**
 * Erzeugt einen Einmal-Zugangscode in der Form `ABCD-EFGH-JKMN`.
 *
 * Der Klartext existiert danach **genau einmal**: im Brief. Er wird nirgends
 * gespeichert und ist nicht nachschlagbar — auch nicht durch den Betrieb. Ein
 * nachschlagbarer Code wäre ein Generalschlüssel zu fremden Verbrauchsdaten;
 * wer seinen Brief verliert, bekommt einen neuen Code, keinen alten zurück.
 */
export function erzeugeZugangscode(): string {
  return Array.from({ length: CODE_BLOECKE }, () => zufallsZeichen(CODE_BLOCK_LAENGE)).join('-');
}

/** Erzeugt eine Anmeldekennung in der Form `EK-ABC234` (nicht geheim, s. V0068). */
export function erzeugeKennung(): string {
  return `${KENNUNG_PRAEFIX}${zufallsZeichen(KENNUNG_LAENGE)}`;
}

/**
 * Kanonische Form einer Eingabe: Großbuchstaben, Trennzeichen und
 * Leerraum entfernt.
 *
 * Ein Kunde tippt `abcd efgh jkmn` oder `ABCD-EFGH-JKMN` — beides ist
 * derselbe Code. Ohne Normalisierung entscheidet die Schreibweise über den
 * Anmeldeerfolg, und der Betrieb bekommt Anrufe über einen Code, der „nicht
 * geht".
 */
export function normalisiereCode(eingabe: string): string {
  return eingabe.toUpperCase().replaceAll(/[\s-]/g, '');
}

/**
 * Der deterministische Suchwert zu einem Zugangscode:
 * `HMAC-SHA256(pepper, normalisierter_code)`.
 *
 * **Warum HMAC mit Pepper und nicht scrypt wie beim Passwort.** Der
 * Einlöse-Pfad kennt nur den Code — er muss die Zeile damit FINDEN. Ein
 * gesalzener Passwort-Hash ist je Zeile verschieden und damit nicht
 * durchsuchbar; die Alternative wäre, alle Zugänge durchzuprobieren.
 *
 * Der Pepper liegt außerhalb der Datenbank (Umgebung, später KMS). Wer nur
 * die Datenbank liest, kann Codes deshalb nicht offline durchprobieren —
 * dasselbe Muster und derselbe Grund wie beim DevEUI-Blind-Index
 * (`BlindIndexService`, ADR-0005 §26.3).
 *
 * Beim PASSWORT ist die Lage anders: Dort ist die Kennung der Suchschlüssel,
 * das Passwort wird nur noch verglichen — und ein vom Menschen gewähltes
 * Geheimnis braucht eine langsame Ableitung (s. `portal-passwort.util.ts`).
 */
export function berechneCodeIndex(code: string, pepper: Buffer): Buffer {
  return createHmac('sha256', pepper).update(normalisiereCode(code), 'utf8').digest();
}

/** Zeitkonstanter Vergleich — ein `Buffer.equals()` verriete über die Laufzeit, wie viele Bytes stimmten. */
export function gleichenIndizes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
