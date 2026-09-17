import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify(scrypt)` trifft die Node-Überladung MIT `options` nicht — die
 * generische Signatur kennt nur `(password, salt, keylen)`. Der Wrapper
 * bindet die richtige Überladung, statt an der Aufrufstelle zu casten.
 */
const scryptAsync = promisify(
  (
    passwort: string,
    salt: Buffer,
    keylen: number,
    optionen: ScryptOptions,
    rueckruf: (fehler: Error | null, abgeleitet: Buffer) => void,
  ): void => {
    scrypt(passwort, salt, keylen, optionen, rueckruf);
  },
);

/**
 * scrypt-Parameter (RFC 7914).
 *
 * `N` ist der Kostenfaktor, `r` die Blockgröße, `p` die Parallelität. Der
 * Speicherbedarf ist ungefähr `128 · N · r` Byte — bei N=32768, r=8 also
 * rund 32 MB je Ableitung. Das ist die Bremse, um die es geht: Sie
 * verteuert das Durchprobieren gestohlener Hashes um denselben Faktor, um
 * den sie eine echte Anmeldung verlangsamt (dort einmal, dort milliardenfach).
 *
 * Die Werte werden MIT dem Hash gespeichert (`passwort_algo`, Form
 * `scrypt$N$r$p`, V0066). Wer sie später erhöht, macht damit keine
 * bestehende Zeile unlesbar — alte Hashes werden weiter mit IHREN Parametern
 * geprüft und beim nächsten erfolgreichen Anmelden neu abgeleitet.
 */
export const SCRYPT_N = 32_768;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
const SCHLUESSEL_LAENGE = 64;
const SALT_LAENGE = 16;

/**
 * `maxmem` muss über dem Bedarf liegen, sonst wirft Node. Node rechnet
 * grob `128 · N · r` plus Aufschlag — 96 MB lassen Luft für eine spätere
 * Erhöhung von `N` auf 65536, ohne dass jemand diese Zeile suchen muss.
 */
const MAX_MEM = 96 * 1024 * 1024;

export interface PasswortAbleitung {
  readonly hash: Buffer;
  readonly salt: Buffer;
  /** Form `scrypt$N$r$p` — gehört zur Zeile, nicht in eine Konstante. */
  readonly algo: string;
}

interface ScryptParameter {
  readonly n: number;
  readonly r: number;
  readonly p: number;
}

export class PasswortAlgoFehler extends Error {}

/**
 * Passwort-Ableitung für den Portal-Zugang.
 *
 * **scrypt statt Argon2id**, weil `node:crypto` es mitbringt: Eine
 * Passwort-Hashing-Bibliothek wäre eine neue Produktivabhängigkeit
 * (`.claude/rules/dependencies.md`, vor der Installation lizenz- und
 * freigabepflichtig) für ein Verfahren, das die Standardbibliothek in einer
 * von OWASP ausdrücklich akzeptierten Form bereits anbietet. Dieselbe
 * Überlegung wie beim ZIP-Leser des DWD-Adapters.
 *
 * **Salt je Zugang**, damit zwei Kunden mit demselben Passwort verschiedene
 * Hashes haben — sonst verriete die Gleichheit zweier Zeilen genau das.
 */
export async function leiteAb(passwort: string): Promise<PasswortAbleitung> {
  const salt = randomBytes(SALT_LAENGE);
  const hash = await ableiten(passwort, salt, { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return { hash, salt, algo: `scrypt$${String(SCRYPT_N)}$${String(SCRYPT_R)}$${String(SCRYPT_P)}` };
}

/**
 * Prüft ein Passwort gegen eine gespeicherte Ableitung — mit DEREN
 * Parametern, nicht mit den heutigen.
 *
 * Der Vergleich ist zeitkonstant: Ein `Buffer.equals()` verriete über die
 * Laufzeit, wie viele Bytes übereinstimmten, und das genügt, um ein Passwort
 * Byte für Byte zu erraten.
 */
export async function pruefe(passwort: string, hash: Buffer, salt: Buffer, algo: string): Promise<boolean> {
  const parameter = parseAlgo(algo);
  const kandidat = await ableiten(passwort, salt, parameter);
  return kandidat.length === hash.length && timingSafeEqual(kandidat, hash);
}

/** `true`, wenn die gespeicherte Ableitung schwächer ist als die heutige — dann lohnt ein Neu-Ableiten. */
export function istVeraltet(algo: string): boolean {
  const parameter = parseAlgo(algo);
  return parameter.n < SCRYPT_N || parameter.r < SCRYPT_R || parameter.p < SCRYPT_P;
}

async function ableiten(passwort: string, salt: Buffer, parameter: ScryptParameter): Promise<Buffer> {
  // `normalize('NFC')`: Ein Passwort mit Umlaut kann je nach Tastatur und
  // Betriebssystem in zwei Unicode-Formen ankommen. Ohne Normalisierung
  // scheitert die Anmeldung an einem Unterschied, den niemand sieht.
  return scryptAsync(passwort.normalize('NFC'), salt, SCHLUESSEL_LAENGE, {
    N: parameter.n,
    r: parameter.r,
    p: parameter.p,
    maxmem: MAX_MEM,
  });
}

function parseAlgo(algo: string): ScryptParameter {
  const treffer = /^scrypt\$(\d+)\$(\d+)\$(\d+)$/.exec(algo);
  if (treffer === null) {
    // Fail-closed: Lieber eine Anmeldung, die mit klarer Meldung scheitert,
    // als eine, die stillschweigend mit geratenen Parametern prüft und
    // deshalb IMMER falsch antwortet.
    throw new PasswortAlgoFehler(`Unbekanntes Passwort-Verfahren '${algo}' — erwartet 'scrypt$N$r$p'.`);
  }
  return { n: Number(treffer[1]), r: Number(treffer[2]), p: Number(treffer[3]) };
}
