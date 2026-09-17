import { describe, expect, it } from 'vitest';
import {
  MINDEST_PUNKTE,
  baselineRegression,
  koeffizientenInBaselineGroessen,
  sucheHeizgrenze,
  type BaselinePunkt,
  type VermessungsMonat,
} from './baseline-regression';
import { TAGE_PRO_JAHR_DEFAULT, referenzMonat } from './witterung-gtz';

/**
 * Die Baseline-Anpassung des Standard-Messkonzepts (ADR-0006 B13).
 *
 * Die Testfälle sind KONSTRUIERT, nicht gemessen: zu bekannten Koeffizienten
 * wird der Verbrauch ausgerechnet und geprüft, ob die Anpassung sie
 * zurückfindet. Ein Test gegen gemessene Werte prüfte den Bestand, nicht den
 * Kern.
 */
describe('Baseline-Anpassung (Standard-Messkonzept)', () => {
  /** Zwölf Monate mit realistisch schwankender Gradtagzahl und Monatslänge. */
  const GTZ_JAHRESGANG = [394, 506, 602, 611, 497, 435, 283, 103, 0, 0, 44, 243] as const;
  const TAGE_JAHRESGANG = [31, 30, 31, 31, 28, 31, 30, 31, 30, 31, 31, 30] as const;

  function reiheAus(c: number, b1: number, stoerung: readonly number[] = []): BaselinePunkt[] {
    return GTZ_JAHRESGANG.map((gtz, i) => ({
      monat: `2019-${String(i + 1).padStart(2, '0')}-01`,
      tage: TAGE_JAHRESGANG[i] ?? 30,
      gtz,
      verbrauchKwh: c * (TAGE_JAHRESGANG[i] ?? 30) + b1 * gtz + (stoerung[i] ?? 0),
    }));
  }

  it('findet die Koeffizienten exakt zurück, wenn die Reihe ihnen genau folgt', () => {
    const ausgang = baselineRegression(reiheAus(0.8, 5.5));

    expect(ausgang.art).toBe('erfolg');
    if (ausgang.art !== 'erfolg') return;
    expect(ausgang.ergebnis.grundlastProTagKwh).toBeCloseTo(0.8, 9);
    expect(ausgang.ergebnis.koeffizientB1KwhProKd).toBeCloseTo(5.5, 9);
    expect(ausgang.ergebnis.bestimmtheitsmass).toBeCloseTo(1, 9);
    expect(ausgang.ergebnis.cvRmsePct).toBeCloseTo(0, 6);
    expect(ausgang.ergebnis.nmbePct).toBeCloseTo(0, 6);
    expect(ausgang.ergebnis.punkte).toBe(12);
  });

  it('rechnet die Monatslänge heraus, statt jeden Monat gleich lang zu nehmen', () => {
    // Reine Grundlast, KEIN Witterungsanteil in den Daten -- aber die
    // Monatslängen schwanken. Ein Modell mit gewöhnlichem Achsenabschnitt
    // müsste die Schwankung der Gradtagzahl zuschreiben und b₁ von null
    // verschieden ausweisen.
    const punkte = TAGE_JAHRESGANG.map((tage, i) => ({
      monat: `2019-${String(i + 1).padStart(2, '0')}-01`,
      tage,
      gtz: GTZ_JAHRESGANG[i] ?? 0,
      verbrauchKwh: 10 * tage,
    }));

    const ausgang = baselineRegression(punkte);

    expect(ausgang.art).toBe('erfolg');
    if (ausgang.art !== 'erfolg') return;
    expect(ausgang.ergebnis.grundlastProTagKwh).toBeCloseTo(10, 9);
    expect(ausgang.ergebnis.koeffizientB1KwhProKd).toBeCloseTo(0, 9);
  });

  it('behandelt eine fallende Kennlinie als „kein Witterungseinfluss", nicht als Modell', () => {
    // b₁ < 0 hiesse: je kälter, desto weniger Heizenergie. Der Kern setzt b₁
    // auf 0 und bestimmt die Grundlast neu aus der Gesamtmenge.
    const punkte = reiheAus(50, -2);

    const ausgang = baselineRegression(punkte);

    expect(ausgang.art).toBe('erfolg');
    if (ausgang.art !== 'erfolg') return;
    expect(ausgang.ergebnis.witterungsanteilNachweisbar).toBe(false);
    expect(ausgang.ergebnis.koeffizientB1KwhProKd).toBe(0);

    const summeTage = punkte.reduce((s, p) => s + p.tage, 0);
    const summeKwh = punkte.reduce((s, p) => s + p.verbrauchKwh, 0);
    expect(ausgang.ergebnis.grundlastProTagKwh).toBeCloseTo(summeKwh / summeTage, 9);
  });

  it('weist eine verrauschte Reihe mit R² unter 1 aus, ohne die Koeffizienten zu verlieren', () => {
    const ausgang = baselineRegression(reiheAus(0.8, 5.5, [120, -90, 60, -140, 80, -50, 30, -20, 10, -10, 25, -15]));

    expect(ausgang.art).toBe('erfolg');
    if (ausgang.art !== 'erfolg') return;
    expect(ausgang.ergebnis.bestimmtheitsmass).toBeGreaterThan(0.9);
    expect(ausgang.ergebnis.bestimmtheitsmass).toBeLessThan(1);
    expect(ausgang.ergebnis.cvRmsePct).toBeGreaterThan(0);
    expect(ausgang.ergebnis.koeffizientB1KwhProKd).toBeCloseTo(5.5, 0);
  });

  it('lehnt zu wenige Monatspunkte ab, statt eine Zahl zu erfinden', () => {
    const ausgang = baselineRegression(reiheAus(0.8, 5.5).slice(0, MINDEST_PUNKTE - 1));

    expect(ausgang.art).toBe('hindernis');
    if (ausgang.art !== 'hindernis') return;
    expect(ausgang.code).toBe('zu_wenige_punkte');
  });

  it('lehnt ab, wenn die Gradtagzahl über die Vermessung kaum variiert', () => {
    // Kap. 2.2.2 verlangt, dass die Einflussgrösse hinreichend variiert.
    const punkte = TAGE_JAHRESGANG.map((tage, i) => ({
      monat: `2019-${String(i + 1).padStart(2, '0')}-01`,
      tage,
      gtz: 300 + (i % 2),
      verbrauchKwh: 0.8 * tage + 5.5 * 300,
    }));

    const ausgang = baselineRegression(punkte);

    expect(ausgang.art).toBe('hindernis');
    if (ausgang.art !== 'hindernis') return;
    expect(ausgang.code).toBe('gtz_variiert_nicht');
  });

  it('lehnt eine negative Grundlast ab', () => {
    // Stark negativer Achsenabschnitt bei intakter Steigung -- ein Datenfehler,
    // kein Modell.
    const ausgang = baselineRegression(reiheAus(-40, 12));

    expect(ausgang.art).toBe('hindernis');
    if (ausgang.art !== 'hindernis') return;
    expect(ausgang.code).toBe('grundlast_negativ');
  });

  it('gibt R² = 0 aus, wenn es gar nichts zu erklären gibt', () => {
    // Alle Monate exakt gleich: die Streuung um den Mittelwert ist null, das
    // Modell erklärt nichts -- R² = 1 wäre hier eine Schmeichelei.
    const punkte = GTZ_JAHRESGANG.map((gtz, i) => ({
      monat: `2019-${String(i + 1).padStart(2, '0')}-01`,
      tage: 30,
      gtz,
      verbrauchKwh: 1000,
    }));

    const ausgang = baselineRegression(punkte);

    expect(ausgang.art).toBe('erfolg');
    if (ausgang.art !== 'erfolg') return;
    expect(ausgang.ergebnis.bestimmtheitsmass).toBe(0);
  });

  describe('Heizgrenzensuche', () => {
    const T_INNEN = 20;
    const gtz = (t: number, tH: number): number => (t < tH ? T_INNEN - t : 0);

    /**
     * Baut eine Vermessung, die einer WAHREN Heizgrenze folgt: Der Verbrauch
     * entsteht aus den Gradtagzahlen unter `tWahr`, nicht unter irgendeiner
     * anderen. Die Suche muss sie zurückfinden.
     */
    function vermessung(tWahr: number): VermessungsMonat[] {
      // Zwölf Monate, Tagestemperaturen von winterlich bis sommerlich.
      const monatsTemperaturen = [2, 0, -1, 3, 7, 11, 15, 18, 19, 17, 12, 6];
      return monatsTemperaturen.map((mittel, i) => {
        const temperaturenC = Array.from({ length: 30 }, (_, tag) => mittel + (tag % 5) - 2);
        const summeGtz = temperaturenC.reduce((s, t) => s + gtz(t, tWahr), 0);
        return {
          monat: `2019-${String(i + 1).padStart(2, '0')}-01`,
          tage: 30,
          verbrauchKwh: 9 * 30 + 4.5 * summeGtz,
          temperaturenC,
        };
      });
    }

    it('findet die Heizgrenze zurück, der die Reihe tatsächlich folgt', () => {
      const vorschlag = sucheHeizgrenze(vermessung(11), gtz);

      expect(vorschlag).not.toBeNull();
      expect(vorschlag?.tHeizgrenzeC).toBe(11);
      expect(vorschlag?.cvRmsePct).toBeCloseTo(0, 6);
      expect(vorschlag?.grundlastProTagKwh).toBeCloseTo(9, 6);
    });

    it('legt alle geprüften Kandidaten offen, nicht nur den Sieger', () => {
      // Die Wahl soll nachvollziehbar sein. Ein blosser Vorschlag ohne die
      // Alternativen daneben verlangt Glauben statt Pruefung.
      const vorschlag = sucheHeizgrenze(vermessung(11), gtz, [10, 11, 12]);

      expect(vorschlag?.kandidaten.map((k) => k.tHeizgrenzeC)).toEqual([10, 11, 12]);
      expect(vorschlag?.kandidaten.every((k) => k.cvRmsePct !== null || k.hindernis !== null)).toBe(true);
    });

    it('vermerkt Kandidaten, an denen die Anpassung scheitert, statt sie zu verschweigen', () => {
      // Eine zu hohe Heizgrenze schreibt den Uebergangsmonaten Gradtagzahl zu
      // und drueckt die Grundlast unter null — genau der Fall des Pilotbestands A.
      const vorschlag = sucheHeizgrenze(vermessung(9), gtz);

      const gescheitert = vorschlag?.kandidaten.filter((k) => k.hindernis !== null) ?? [];
      expect(gescheitert.length).toBeGreaterThan(0);
      expect(gescheitert.some((k) => k.hindernis === 'grundlast_negativ')).toBe(true);
      expect(vorschlag?.tHeizgrenzeC).toBe(9);
    });

    it('gibt null zurück, wenn kein Witterungseinfluss nachweisbar ist', () => {
      // Der Strom-Fall: konstanter Tagesverbrauch. Jede Heizgrenze liefert
      // dasselbe Modell — ein Vorschlag täuschte eine Genauigkeit vor, die es
      // nicht gibt.
      const flach = vermessung(11).map((m) => ({ ...m, verbrauchKwh: 12 * m.tage }));

      expect(sucheHeizgrenze(flach, gtz)).toBeNull();
    });

    it('wählt nach CV(RMSE), nicht nach R²', () => {
      // R² belohnt einen grossen Sommer-Winter-Kontrast — den erzeugt eine zu
      // hohe Heizgrenze gerade. Das Kriterium darf nicht dasselbe belohnen,
      // was der Fehler erzeugt.
      const vorschlag = sucheHeizgrenze(vermessung(10), gtz);
      const sieger = vorschlag?.kandidaten.find((k) => k.tHeizgrenzeC === vorschlag.tHeizgrenzeC);
      const bestesR2 = Math.max(
        ...(vorschlag?.kandidaten.map((k) => k.bestimmtheitsmass ?? -Infinity) ?? [-Infinity]),
      );

      expect(sieger?.cvRmsePct).toBe(
        Math.min(...(vorschlag?.kandidaten.map((k) => k.cvRmsePct ?? Infinity) ?? [Infinity])),
      );
      expect(vorschlag?.tHeizgrenzeC).toBe(10);
      expect(bestesR2).toBeGreaterThan(0);
    });
  });

  describe('Rückrechnung in die Grössen des Laufs', () => {
    it('trifft mit a₀, B und g exakt dieselbe Monatsreferenz wie die Koeffizienten selbst', () => {
      // DER Test dieses Arbeitspakets: der Standard-Pfad darf keine zweite
      // Rechenvorschrift einführen. Er füllt B und g so, dass referenzMonat()
      // -- unverändert, golden-vector-versiegelt -- exakt a₀·(d_m/d_a) + b₁·GTZ_m
      // liefert.
      const c = 0.813162;
      const b1 = 5.540767;
      const gtzBase = 3717.98;
      const gtzMonat = 602;
      const tageImMonat = 31;

      const { baselineJahresWertKwh, grundlastAnteil } = koeffizientenInBaselineGroessen({
        grundlastProTagKwh: c,
        koeffizientB1KwhProKd: b1,
        gtzBase,
        tageProJahr: TAGE_PRO_JAHR_DEFAULT,
      });

      const ueberDenLauf = referenzMonat({
        baselineJahresWertKwh,
        grundlastAnteil,
        tageImMonat,
        tageProJahr: TAGE_PRO_JAHR_DEFAULT,
        gtzMonatIst: gtzMonat,
        gtzBase,
      });
      const direkt = c * tageImMonat + b1 * gtzMonat;

      expect(ueberDenLauf).toBeCloseTo(direkt, 9);
    });

    it('setzt g = 1, wenn kein Witterungsanteil nachweisbar war', () => {
      const { grundlastAnteil } = koeffizientenInBaselineGroessen({
        grundlastProTagKwh: 12,
        koeffizientB1KwhProKd: 0,
        gtzBase: 3700,
        tageProJahr: TAGE_PRO_JAHR_DEFAULT,
      });

      expect(grundlastAnteil).toBe(1);
    });

    it('kommt mit einer durchgehend verbrauchsfreien Vermessung zurecht', () => {
      // Sonst stünde in referenzMonat() eine Division durch null.
      const { baselineJahresWertKwh, grundlastAnteil } = koeffizientenInBaselineGroessen({
        grundlastProTagKwh: 0,
        koeffizientB1KwhProKd: 0,
        gtzBase: 3700,
        tageProJahr: TAGE_PRO_JAHR_DEFAULT,
      });

      expect(baselineJahresWertKwh).toBe(0);
      expect(grundlastAnteil).toBe(1);
    });
  });
});
