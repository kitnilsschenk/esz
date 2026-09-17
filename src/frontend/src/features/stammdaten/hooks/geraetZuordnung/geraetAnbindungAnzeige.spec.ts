import { describe, expect, it } from 'vitest';
import type { GeraetAnbindung } from '@edms/shared';
import { geraetAnbindungAnzeige } from './useGeraetAnbindungView';

function anbindung(overrides: Partial<GeraetAnbindung> = {}): GeraetAnbindung {
  return {
    id: '0198c3bb-bbbb-7000-8000-000000000002',
    status: 'aktiv',
    gueltigVon: '2026-03-12T09:00:00.000Z',
    gueltigBis: null,
    pepperVersion: 1,
    ...overrides,
  };
}

describe('geraetAnbindungAnzeige', () => {
  it('meldet eine aktive Anbindung samt Beginn in Berliner Zeit', () => {
    const anzeige = geraetAnbindungAnzeige(anbindung());

    expect(anzeige.istAngebunden).toBe(true);
    expect(anzeige.geraetZuordnungId).toBe('0198c3bb-bbbb-7000-8000-000000000002');
    expect(anzeige.angebundenSeitLabel).toBe('12.03.2026, 10:00');
  });

  it('behandelt `null` als „derzeit nicht angebunden"', () => {
    const anzeige = geraetAnbindungAnzeige(null);

    expect(anzeige.istAngebunden).toBe(false);
    expect(anzeige.geraetZuordnungId).toBeUndefined();
  });

  it('gilt eine beendete Zuordnung NICHT als angebunden', () => {
    // Die Schnittstelle liefert im Regelfall `null`; eine beendete Zeile
    // darf hier aber unter keinen Umständen als aktive Anbindung durchgehen.
    expect(geraetAnbindungAnzeige(anbindung({ status: 'inaktiv', gueltigBis: '2026-04-01T00:00:00.000Z' })).istAngebunden).toBe(false);
    expect(geraetAnbindungAnzeige(anbindung({ status: 'geschreddert' })).istAngebunden).toBe(false);
  });
});
