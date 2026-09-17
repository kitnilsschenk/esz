import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { baueEinsparungsnachweisMappe, type MappeEingabe, type MappeSystem } from './einsparungsnachweis-mappe';
import { XlsxArbeitsmappe } from '../../import/xlsx/xlsx-arbeitsmappe';

/**
 * Die Einsparungsnachweis-Mappe (Exportschema v3, V0075).
 *
 * Geprüft wird mit dem hauseigenen XLSX-LESER — er liest Werte, aber KEINE
 * Formeln (nur deren zwischengespeichertes Ergebnis, und das schreibt die
 * Mappe bewusst nicht). Formelzellen kommen deshalb als leer zurück; dass
 * dort überhaupt eine Formel steht, wird über die Rohdatei geprüft.
 */
describe('Einsparungsnachweis-Mappe', () => {
  const SYSTEM: MappeSystem = {
    systemId: 'S-01',
    endkundePseudonym: 'EK-0001',
    endkundengruppe: 'Kreditinstitut',
    standort: 'Standort 1',
    energietraeger: 'waerme',
    messpunktAnzahl: 2,
    baselineVersion: 'B1',
    bemerkung: null,
    messkonzeptTyp: 'vereinfacht',
    bestimmtheitsmass: null,
    cvRmsePct: null,
    nmbePct: null,
    guetePunkte: null,
    baselineAbweichungPct: null,
    grundlastA0Kwh: 2633.4,
    koeffizientB1: 4.913044,
    istX1: 3717.98,
    bereinigungsverfahren: 'Gradtagzahlverfahren (VDI 3807)',
    summeBezugKwh: null,
    summeEigenerzeugungKwh: null,
    summeEinspeisungKwh: null,
    datenverfuegbarkeitPct: null,
    geraeteerkennungPct: 42.5,
    zeitanteil: 1,
    monateAusgewiesen: 12,
    monateGesamt: 12,
  };

  const EINGABE: MappeEingabe = {
    foerderjahrCode: 'FJ-2023',
    foerderjahrVonMonat: '2022-11-01',
    foerderjahrBisMonat: '2023-10-01',
    erzeugtAtUtc: '2026-09-15T20:00:00.000Z',
    systeme: [SYSTEM],
    messpunkte: [
      {
        messpunktId: 'S-01-MK-0001',
        systemId: 'S-01',
        zaehlerPseudonym: 'MK-0001',
        richtung: 'bezug',
        summeKwh: 16025.7,
        qualitaetsFlag: 'gemessen',
      },
      {
        messpunktId: 'S-01-MK-0002',
        systemId: 'S-01',
        zaehlerPseudonym: 'MK-0002',
        richtung: 'eigenerzeugung',
        summeKwh: 500,
        qualitaetsFlag: 'gemessen',
      },
    ],
    rohdatenEnthalten: true,
  };

  function baue(overrides: Partial<MappeEingabe> = {}): XlsxArbeitsmappe {
    return XlsxArbeitsmappe.lese(baueEinsparungsnachweisMappe({ ...EINGABE, ...overrides }));
  }

  /**
   * Die Formeln eines Blattes als `{Zelle: Formel}` — der Leser oben liefert
   * sie nicht (er kennt nur Werte). Entpackt wird von Hand: Der ZIP-Schreiber
   * legt Größen und Namen in den lokalen Eintragskopf, also genügt ein Lauf
   * über die Kopfsignaturen.
   */
  function formeln(blattNummer: number, eingabe: MappeEingabe = EINGABE): Record<string, string> {
    const zip = baueEinsparungsnachweisMappe(eingabe);
    let pos = 0;
    let xml = '';
    while (pos + 30 <= zip.length && zip.readUInt32LE(pos) === 0x04034b50) {
      const komprimiert = zip.readUInt32LE(pos + 18);
      const namensLaenge = zip.readUInt16LE(pos + 26);
      const extraLaenge = zip.readUInt16LE(pos + 28);
      const name = zip.subarray(pos + 30, pos + 30 + namensLaenge).toString('utf8');
      const datenAb = pos + 30 + namensLaenge + extraLaenge;
      if (name === `xl/worksheets/sheet${String(blattNummer)}.xml`) {
        xml = inflateRawSync(zip.subarray(datenAb, datenAb + komprimiert)).toString('utf8');
        break;
      }
      pos = datenAb + komprimiert;
    }
    expect(xml).not.toBe('');

    const treffer: Record<string, string> = {};
    for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f[^>]*>(.*?)<\/f>/g)) {
      treffer[m[1] ?? ''] = (m[2] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    }
    return treffer;
  }

  /** Der Wert einer Zelle (0-basiert), oder `undefined` bei Formel/leer. */
  function wert(mappe: XlsxArbeitsmappe, blatt: string, zeile: number, spalte: number): unknown {
    const z = mappe.blatt(blatt)[zeile]?.[spalte];
    if (z === undefined) {
      return undefined;
    }
    switch (z.art) {
      case 'text':
        return z.text;
      case 'zahl':
        return z.zahl;
      case 'datum':
        return z.iso;
      case 'bool':
        return z.wert;
    }
  }

  it('hat die neun Blätter der Vorlage in ihrer Reihenfolge', () => {
    expect(baue().blattNamen).toEqual([
      '0_Anleitung',
      '1_Systemregister',
      '2_Messpunkte',
      '3_System_Ist',
      '4_Baseline',
      '5_Einsparung',
      '6a_Aggregation_ET',
      '6b_LK_Endkundengruppe',
      '7_Sachbericht_P13',
    ]);
  });

  it('schreibt die Baseline-Koeffizienten der Überführung', () => {
    // a₀ = B·g und b₁ = B·(1−g)/GTZ_base — an der Wärme des Pilotbestands A geprüft.
    const mappe = baue();

    expect(wert(mappe, '4_Baseline', 2, 4)).toBe(2633.4);
    expect(wert(mappe, '4_Baseline', 2, 6)).toBeCloseTo(4.913044, 6);
  });

  it('lässt Modellgüte R² und die zweite Einflussgröße LEER', () => {
    // Es wurde nichts gefittet. Eine Zahl dort wäre die Behauptung einer
    // Güte, die nie gemessen wurde.
    const mappe = baue();

    expect(wert(mappe, '4_Baseline', 2, 7)).toBeUndefined();
    expect(wert(mappe, '4_Baseline', 2, 8)).toBeUndefined();
    expect(wert(mappe, '4_Baseline', 2, 9)).toBeUndefined();
  });

  it('trägt die Endkundengruppe und den Standort ins Systemregister', () => {
    const mappe = baue();

    expect(wert(mappe, '1_Systemregister', 2, 2)).toBe('Kreditinstitut');
    expect(wert(mappe, '1_Systemregister', 2, 3)).toBe('Standort 1');
  });

  it('schreibt „nicht erfasst", wo Branche oder Standort fehlen', () => {
    // Eine leere Zelle liesse offen, ob die Angabe fehlt oder vergessen
    // wurde, sie zu rendern.
    const mappe = baue({ systeme: [{ ...SYSTEM, endkundengruppe: null, standort: null }] });

    expect(wert(mappe, '1_Systemregister', 2, 2)).toBe('nicht erfasst');
    expect(wert(mappe, '1_Systemregister', 2, 3)).toBe('nicht erfasst');
  });

  it('unterscheidet die Energierichtung der Messpunkte', () => {
    const mappe = baue();

    expect(wert(mappe, '2_Messpunkte', 2, 3)).toBe('Bezug');
    expect(wert(mappe, '2_Messpunkte', 3, 3)).toBe('Eigenerzeugung');
  });

  it('rechnet Blatt 3 per SUMIFS aus den Messpunkten, wenn die Rohdaten enthalten sind', () => {
    const roh = baueEinsparungsnachweisMappe(EINGABE).toString('latin1');
    // Die Blätter liegen komprimiert vor — geprüft wird über den Leser, dass
    // die Zellen KEINEN Wert tragen (also Formeln sind).
    const mappe = XlsxArbeitsmappe.lese(Buffer.from(roh, 'latin1'));

    expect(wert(mappe, '3_System_Ist', 2, 2)).toBeUndefined();
    expect(wert(mappe, '3_System_Ist', 2, 5)).toBeUndefined();
  });

  it('schreibt bei GESPERRTEN Rohdaten Werte statt Formeln — sonst stünde dort überall null', () => {
    // A12: Ohne die Rohdaten kann Blatt 3 nicht aus Blatt 2 summieren. Die
    // Vorlagenformel lieferte dann 0 und behauptete einen Verbrauch von null.
    const mappe = baue({
      rohdatenEnthalten: false,
      systeme: [{ ...SYSTEM, summeBezugKwh: 16025.7, summeEigenerzeugungKwh: 0, summeEinspeisungKwh: 0 }],
      messpunkte: EINGABE.messpunkte.map((mp) => ({ ...mp, summeKwh: null })),
    });

    expect(wert(mappe, '3_System_Ist', 2, 2)).toBe(16025.7);
    expect(wert(mappe, '2_Messpunkte', 2, 4)).toBeUndefined();
  });

  it('nennt den Zeitanteil als Faktor UND im Klartext', () => {
    // „10 von 13" liest sich anders als „0,7692" — beides steht da.
    const mappe = baue({
      systeme: [{ ...SYSTEM, zeitanteil: 0.7692, monateAusgewiesen: 10, monateGesamt: 13 }],
    });

    expect(wert(mappe, '5_Einsparung', 2, 8)).toBeCloseTo(0.7692, 4);
    expect(wert(mappe, '5_Einsparung', 2, 13)).toBe('10 von 13');
  });

  it('setzt den Primärenergiefaktor auf 1 und sagt im Anleitungsblatt, warum', () => {
    const mappe = baue();

    expect(wert(mappe, '5_Einsparung', 2, 10)).toBe(1);
    const anleitung = mappe
      .blatt('0_Anleitung')
      .flatMap((zeile) => zeile.map((z) => (z?.art === 'text' ? z.text : '')))
      .join(' ');
    expect(anleitung).toContain('Primärenergiefaktor');
    expect(anleitung).toContain('Modellgüte R²');
    expect(anleitung).toContain('VEREINFACHTES Messkonzept');
  });

  it('weist im Anleitungsblatt aus, wenn die Messpunkt-Summen gesperrt sind', () => {
    const mappe = baue({ rohdatenEnthalten: false });

    const anleitung = mappe
      .blatt('0_Anleitung')
      .flatMap((zeile) => zeile.map((z) => (z?.art === 'text' ? z.text : '')))
      .join(' ');
    expect(anleitung).toContain('Rohdaten-Kategorie gesperrt');
  });

  it('gruppiert Blatt 6b je (Branche, Energieträger)', () => {
    const mappe = baue({
      systeme: [
        SYSTEM,
        { ...SYSTEM, systemId: 'S-02', energietraeger: 'strom' },
        { ...SYSTEM, systemId: 'S-03', endkundengruppe: 'Handel', energietraeger: 'strom' },
      ],
    });

    // Nur die Datenzeilen: die abschliessende Hinweiszeile hat keine
    // Energietraeger-Spalte.
    const zeilen = mappe
      .blatt('6b_LK_Endkundengruppe')
      .slice(2)
      .filter((z) => z[1] !== undefined);
    expect(zeilen).toHaveLength(3);
  });

  describe('Standard-Messkonzept (V0076)', () => {
    const ANGEPASST: MappeSystem = {
      ...SYSTEM,
      messkonzeptTyp: 'standard',
      bestimmtheitsmass: 0.9557,
      cvRmsePct: 16.53,
      nmbePct: 0.01,
      guetePunkte: 12,
      baselineAbweichungPct: -0.02,
    };

    it('trägt R² in Spalte J, wo tatsächlich angepasst wurde', () => {
      const mappe = baue({ systeme: [ANGEPASST] });

      expect(wert(mappe, '4_Baseline', 2, 9)).toBeCloseTo(0.9557, 4);
    });

    it('nennt in „Modelltyp" den Weg zu den Koeffizienten, nicht nur das Bereinigungsverfahren', () => {
      // Spalte D ist die Stelle, an der die Vorlage „lin. Regression" erwartet.
      // Steht dort nur das Bereinigungsverfahren, bleibt offen, ob angepasst
      // wurde -- und die leere Spalte J daneben sähe nach Versäumnis aus.
      const vereinfacht = String(wert(baue(), '4_Baseline', 2, 3));
      const angepasst = String(wert(baue({ systeme: [ANGEPASST] }), '4_Baseline', 2, 3));

      expect(vereinfacht).toContain('normativ gesetzt');
      expect(angepasst).toContain('angepasst');
    });

    it('stellt die Gütemaße zusammen — R² allein wäre irreführend', () => {
      // CV(RMSE) deckt auf, wenn ein hohes R² nur aus dem Sommer-Winter-
      // Kontrast stammt; ohne n ist R² gar nicht bewertbar.
      const mappe = baue({ systeme: [ANGEPASST] });
      const zeile = mappe.blatt('4_Baseline')[5];

      expect(zeile?.[1]?.art === 'zahl' ? zeile[1].zahl : null).toBeCloseTo(0.9557, 4);
      expect(zeile?.[2]?.art === 'zahl' ? zeile[2].zahl : null).toBeCloseTo(16.53, 2);
      expect(zeile?.[4]?.art === 'zahl' ? zeile[4].zahl : null).toBe(12);
    });

    it('weist den Abstand zur erfassten Baseline aus', () => {
      const mappe = baue({ systeme: [ANGEPASST] });
      const zeile = mappe.blatt('4_Baseline')[5];

      expect(zeile?.[5]?.art === 'zahl' ? zeile[5].zahl : null).toBeCloseTo(-0.02, 2);
    });

    it('erklärt im Anleitungsblatt beide Wege, wenn das Bündel gemischt ist', () => {
      // Ein Bündel mit beiden Messkonzepten hat leere und gefüllte
      // Güte-Zeilen nebeneinander. Ohne Erklärung liest sich das als Lücke.
      const mappe = baue({ systeme: [SYSTEM, { ...ANGEPASST, systemId: 'S-02' }] });
      const anleitung = mappe
        .blatt('0_Anleitung')
        .flatMap((zeile) => zeile.map((z) => (z?.art === 'text' ? z.text : '')))
        .join(' ');

      expect(anleitung).toContain('GEMISCHT');
      expect(anleitung).toContain('1 von 2 Systemen');
    });
  });

  describe('Treue zur Vorlage', () => {
    it('schreibt Energieträger in der Schreibweise des Formulars, nicht als internen Code', () => {
      // Blatt 7 der Vorlage summiert mit SUMIFS auf die Zeichenkette „Strom".
      // Stünde dort `strom`, käme beim Übertragen ins Originalformular still
      // eine Null heraus.
      const mappe = baue({
        systeme: [SYSTEM, { ...SYSTEM, systemId: 'S-02', energietraeger: 'strom' }],
      });

      expect(wert(mappe, '1_Systemregister', 2, 4)).toBe('Wärme');
      expect(wert(mappe, '6a_Aggregation_ET', 2, 0)).toBe('Strom');
      expect(wert(mappe, '6b_LK_Endkundengruppe', 2, 1)).toBe('Strom');
      expect(wert(mappe, '7_Sachbericht_P13', 1, 2)).toBe('Strom-Einsparung [kWh]');
      expect(wert(mappe, '7_Sachbericht_P13', 1, 3)).toBe('Wärme-Einsparung [kWh]');
    });

    it('holt Endkunde, Energieträger und Baseline-Version per INDEX/MATCH statt sie zu kopieren', () => {
      // Wie in der Vorlage: Wer im Systemregister etwas korrigiert, sieht die
      // Korrektur auf Blatt 5. Eine Kopie bliebe stehen.
      const f = formeln(6);

      expect(f['B3']).toContain('INDEX(1_Systemregister!$B$3:$B$3,MATCH(A3');
      expect(f['C3']).toContain('INDEX(1_Systemregister!$E$3:$E$3,MATCH(A3');
      expect(f['D3']).toContain('INDEX(4_Baseline!$B$3:$B$3,MATCH(A3');
    });

    it('fängt eine unauffindbare System-ID ab und trägt die zweite Einflussgröße mit', () => {
      // Die Vorlagenformel wörtlich: IFERROR(... + N(b₂)*N(X₂), 0).
      const f = formeln(6);

      expect(f['G3']).toMatch(/^IFERROR\(/);
      expect(f['G3']).toContain('N(INDEX(4_Baseline!$I$3:$I$3');
      expect(f['G3']).toContain('*N(F3)');
      expect(f['G3']).toMatch(/,0\)$/);
    });

    it('hält beide Kriterienbereiche von Blatt 6b auf Blatt 5', () => {
      // Vorher stand der eine auf Blatt 5, der andere auf Blatt 1 — die
      // Zuordnung hing dann daran, dass beide zeilengleich sortiert bleiben.
      const f = formeln(8);

      expect(f['C3']).toContain('5_Einsparung!$O$');
      expect(f['C3']).not.toContain('1_Systemregister!');
    });

    it('trennt die Gütespalten sauber von den Vorlagenspalten', () => {
      // Unsere Ergänzungen stehen RECHTS von M und verschieben nichts.
      const mappe = baue();

      expect(mappe.blatt('5_Einsparung')[1]?.[13]).toMatchObject({ text: 'Ausgewiesene Monate' });
      expect(mappe.blatt('5_Einsparung')[1]?.[14]).toMatchObject({ text: 'Endkundengruppe (Hilfsspalte)' });
    });
  });

  it('ist deterministisch — zweimal dieselbe Eingabe ergibt dieselbe Datei', () => {
    // Die Datei wird über ihren SHA-256 geführt und beim Download gegen ihn
    // geprüft.
    expect(baueEinsparungsnachweisMappe(EINGABE).equals(baueEinsparungsnachweisMappe(EINGABE))).toBe(true);
  });

  it('kommt ohne Systeme zurecht', () => {
    // Ein Export ohne bindbare Läufe ist selten, aber möglich — die Mappe
    // muss dann eine leere Form liefern, nicht abstürzen.
    const mappe = baue({ systeme: [], messpunkte: [] });

    expect(mappe.blattNamen).toHaveLength(9);
  });
});
