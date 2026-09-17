import { describe, expect, it } from 'vitest';
import { geraetAnbindenFormSchema, toGeraetZuordnungDevEui } from './geraetZuordnungFormSchema';

describe('geraetAnbindenFormSchema', () => {
  it('nimmt die Kennung ohne Trennzeichen an', () => {
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '0080e1150570e060' }).success).toBe(true);
  });

  it('nimmt sie auch paarweise getrennt an — beide Schreibweisen kursieren', () => {
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '00:80:e1:15:05:70:e0:60' }).success).toBe(true);
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '00-80-E1-15-05-70-E0-60' }).success).toBe(true);
  });

  it('weist zu kurze, zu lange und nicht-hexadezimale Eingaben ab', () => {
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '0080e1150570e0' }).success).toBe(false);
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '0080e1150570e06012' }).success).toBe(false);
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '0080e1150570e0gg' }).success).toBe(false);
  });

  it('lässt gemischte Trennzeichen durch — wie der Server auch', () => {
    // Das Muster stammt 1:1 aus dem DTO und prüft je Zweiergruppe einzeln.
    // Hier strenger zu sein hieße, eine Eingabe abzulehnen, die der Server
    // annimmt — und die Normalisierung entfernt die Trennzeichen ohnehin.
    expect(geraetAnbindenFormSchema.safeParse({ devEui: '00:80-e1:15:05:70:e0:60' }).success).toBe(true);
    expect(toGeraetZuordnungDevEui({ devEui: '00:80-e1:15:05:70:e0:60' })).toBe('0080e1150570e060');
  });

  it('normalisiert auf EINE Schreibweise, bevor die Kennung den Browser verlässt', () => {
    // Der Server bildet aus der Kennung einen deterministischen Blind-Index.
    // Zwei Schreibweisen ergäben zwei verschiedene Indizes — also für das
    // System zwei Geräte. Das Anbinden ginge gut, der erste Uplink liefe ins
    // Leere.
    const erwartet = '0080e1150570e060';
    expect(toGeraetZuordnungDevEui({ devEui: '00:80:E1:15:05:70:E0:60' })).toBe(erwartet);
    expect(toGeraetZuordnungDevEui({ devEui: '00-80-e1-15-05-70-e0-60' })).toBe(erwartet);
    expect(toGeraetZuordnungDevEui({ devEui: '  0080E1150570E060  ' })).toBe(erwartet);
  });
});
