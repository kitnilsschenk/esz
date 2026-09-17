import { describe, expect, it } from 'vitest';
import { PasswortAlgoFehler, SCRYPT_N, istVeraltet, leiteAb, pruefe } from './portal-passwort.util';

describe('leiteAb / pruefe', () => {
  it('erkennt das richtige Passwort wieder', async () => {
    const { hash, salt, algo } = await leiteAb('Ein sicheres Passwort 2026');

    await expect(pruefe('Ein sicheres Passwort 2026', hash, salt, algo)).resolves.toBe(true);
  }, 30_000);

  it('weist ein falsches Passwort ab', async () => {
    const { hash, salt, algo } = await leiteAb('Ein sicheres Passwort 2026');

    await expect(pruefe('Ein sicheres Passwort 2027', hash, salt, algo)).resolves.toBe(false);
  }, 30_000);

  it('gibt zwei gleichen Passwoertern verschiedene Hashes — sonst verriete die Gleichheit sie', async () => {
    const a = await leiteAb('gleiches Passwort');
    const b = await leiteAb('gleiches Passwort');

    expect(a.hash.equals(b.hash)).toBe(false);
    expect(a.salt.equals(b.salt)).toBe(false);
  }, 30_000);

  it('speichert die Parameter MIT — sonst waeren alte Hashes nach einer Erhoehung unlesbar', async () => {
    const { algo } = await leiteAb('egal');

    expect(algo).toMatch(/^scrypt\$\d+\$\d+\$\d+$/);
  }, 30_000);

  it('prueft mit den Parametern der ZEILE, nicht mit den heutigen', async () => {
    // Ein schwaecher abgeleiteter Bestands-Hash muss weiter pruefbar bleiben.
    const schwach = 'scrypt$16384$8$1';
    const { hash, salt } = await leiteAbMit('altes Passwort', schwach);

    await expect(pruefe('altes Passwort', hash, salt, schwach)).resolves.toBe(true);
  }, 30_000);

  it('behandelt zwei Unicode-Schreibweisen desselben Umlauts als dasselbe Passwort', async () => {
    // Je nach Tastatur und System kommt "ü" als ein Zeichen oder als u +
    // Kombinierendes Trema an. Ohne Normalisierung scheitert die Anmeldung an
    // einem Unterschied, den niemand sieht.
    const komponiert = 'Grünstrom!2026';
    const zerlegt = 'Grünstrom!2026';
    const { hash, salt, algo } = await leiteAb(komponiert);

    await expect(pruefe(zerlegt, hash, salt, algo)).resolves.toBe(true);
  }, 30_000);

  it('weist ein unbekanntes Verfahren fail-closed ab, statt still falsch zu pruefen', async () => {
    const { hash, salt } = await leiteAb('egal');

    await expect(pruefe('egal', hash, salt, 'bcrypt$12')).rejects.toBeInstanceOf(PasswortAlgoFehler);
  }, 30_000);
});

describe('istVeraltet', () => {
  it('erkennt eine schwaechere Ableitung', () => {
    expect(istVeraltet(`scrypt$${String(SCRYPT_N / 2)}$8$1`)).toBe(true);
  });

  it('meldet die heutige Ableitung als aktuell', () => {
    expect(istVeraltet(`scrypt$${String(SCRYPT_N)}$8$1`)).toBe(false);
  });
});

/** Leitet mit ausdruecklich vorgegebenen Parametern ab (nur fuer den Bestands-Test). */
async function leiteAbMit(passwort: string, algo: string): Promise<{ hash: Buffer; salt: Buffer }> {
  const { randomBytes, scryptSync } = await import('node:crypto');
  const treffer = /^scrypt\$(\d+)\$(\d+)\$(\d+)$/.exec(algo);
  const salt = randomBytes(16);
  const hash = scryptSync(passwort.normalize('NFC'), salt, 64, {
    N: Number(treffer?.[1]),
    r: Number(treffer?.[2]),
    p: Number(treffer?.[3]),
    maxmem: 96 * 1024 * 1024,
  });
  return { hash, salt };
}
