import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBerechnungslaufDetailView } from './useBerechnungslaufDetailView';

const { useBerechnungslaufDetailMock } = vi.hoisted(() => ({ useBerechnungslaufDetailMock: vi.fn() }));
vi.mock('../../api/berechnung', () => ({ useBerechnungslaufDetail: useBerechnungslaufDetailMock }));

/**
 * Die Modellgüte in der Lauf-Detailansicht (V0076).
 *
 * Geprüft wird die Entscheidung, WANN die Gütezeilen erscheinen — nicht ihre
 * Formatierung. Beim vereinfachten Messkonzept wurde nichts angepasst; eine
 * Zeile „Modellgüte R²: —" liesse offen, ob die Zahl fehlt oder gar nicht
 * existiert.
 */
describe('useBerechnungslaufDetailView — Modellgüte', () => {
  const BASIS = {
    id: '0198c3aa-0000-0000-0000-000000000001',
    endkundeId: '0198c3aa-0000-0000-0000-000000000002',
    mvetId: '0198c3aa-0000-0000-0000-000000000003',
    energietraeger: 'waerme',
    verfahrenCode: 'witterung_gtz_vdi3807',
    verfahrenVersion: 2,
    periodeVon: '2024-01-01',
    periodeBis: '2025-01-01',
    baselineWertKwh: 21320.308,
    grundlastAnteil: 0.015,
    gtzBase: 3717.98,
    gtzNorm: null,
    baselineNormKwh: null,
    messkonzeptTyp: 'standard' as const,
    modellguete: {
      bestimmtheitsmass: 0.9489,
      cvRmsePct: 19.76,
      nmbePct: -0.17,
      punkte: 12,
      baselineAbweichungPct: 2.01,
    },
    qualitaetsStufeMin: 'belastbar',
    ausloeser: 'manuell',
    ersetztLaufId: null,
    ersetztDurchLaufId: null,
    erstelltAt: '2026-09-16T10:00:00.000Z',
    ergebnisse: [],
  };

  /** Die Kopf-Felder als Schlüssel-Wert-Abbild. `DetailField.value` ist ein ReactNode — hier sind es durchweg Strings. */
  function felder(overrides: Record<string, unknown> = {}): Record<string, string | undefined> {
    useBerechnungslaufDetailMock.mockReturnValue({
      data: { ...BASIS, ...overrides },
      isPending: false,
      isError: false,
    });
    const { result } = renderHook(() => useBerechnungslaufDetailView(BASIS.id));
    return Object.fromEntries(result.current.fields.map((f) => [f.key, typeof f.value === 'string' ? f.value : undefined]));
  }

  it('zeigt die vier Gütemaße, wenn das Modell angepasst wurde', () => {
    const f = felder();

    expect(f['gueteR2']).toBe('0,9489');
    expect(f['gueteCvRmse']).toBe('19,8 %');
    expect(f['gueteNmbe']).toBe('-0,2 %');
    expect(f['guetePunkte']).toBe('12');
  });

  it('lässt sie ganz weg, wenn nichts angepasst wurde', () => {
    const f = felder({ messkonzeptTyp: 'vereinfacht', modellguete: null });

    expect(f['gueteR2']).toBeUndefined();
    expect(f['guetePunkte']).toBeUndefined();
    expect(f['baselineAbweichung']).toBeUndefined();
  });

  it('nennt das Messkonzept im Klartext, nicht als Code', () => {
    expect(felder()['messkonzeptTyp']).toContain('Vermessung');
    expect(felder({ messkonzeptTyp: 'vereinfacht', modellguete: null })['messkonzeptTyp']).toContain('gesetzt');
  });

  it('weist den Abstand zur erfassten Baseline aus, sagt aber „keine Angabe" statt null', () => {
    expect(felder()['baselineAbweichung']).toBe('2 %');
    expect(felder({ modellguete: { ...BASIS.modellguete, baselineAbweichungPct: null } })['baselineAbweichung']).toBe(
      'keine Angabe',
    );
  });

  it('stellt R² NICHT als Prozentwert dar', () => {
    // R² ist kein Anteil und darf negativ werden; „−12 %" wäre irreführend.
    const f = felder({ modellguete: { ...BASIS.modellguete, bestimmtheitsmass: -0.12 } });

    expect(f['gueteR2']).toBe('-0,1200');
    expect(f['gueteR2']).not.toContain('%');
  });
});
