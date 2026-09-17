import { describe, expect, it } from 'vitest';
import { verketteHinweise } from './hinweis';

describe('verketteHinweise', () => {
  it('verbindet mehrere Bausteine zu einem Text', () => {
    expect(verketteHinweise('Die Bilanzgrenze.', 'Nur die ersten 100 Einträge.')).toBe(
      'Die Bilanzgrenze. Nur die ersten 100 Einträge.',
    );
  });

  it('lässt fehlende Bausteine weg, statt Lücken zu erzeugen', () => {
    expect(verketteHinweise('Die Bilanzgrenze.', undefined)).toBe('Die Bilanzgrenze.');
    expect(verketteHinweise(undefined, 'Nur die ersten 100 Einträge.')).toBe('Nur die ersten 100 Einträge.');
  });

  it('liefert `undefined`, wenn nichts übrig bleibt', () => {
    // Passt damit direkt in das `...(x !== undefined ? { hint: x } : {})`-Muster,
    // das `exactOptionalPropertyTypes` an dieser Stelle verlangt.
    expect(verketteHinweise(undefined, undefined)).toBeUndefined();
    expect(verketteHinweise('')).toBeUndefined();
  });
});
