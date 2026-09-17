import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DWD_AENDERUNGSVERMERK, DWD_QUELLENVERMERK } from '../../berechnung/klima/dwd-quellenvermerk.const';
import { renderExportBundleV1, renderExportBundleV2, waehleRenderer } from './nachweis-export-renderer';
import type { ExportRenderInput } from './nachweis-export-renderer';
import { EXPORT_DATEINAMEN, EXPORT_SPALTENPROFIL } from './nachweis-export-spaltenprofil.const';

const EK1 = 'e1111111-1111-1111-1111-111111111111';
const LAUF1 = 'b1111111-1111-1111-1111-111111111111';
const GG1 = 'g1111111-1111-1111-1111-111111111111';

function baueEingang(overrides: Partial<ExportRenderInput> = {}): ExportRenderInput {
  const basis: ExportRenderInput = {
    header: {
      exportId: 'x0000000-0000-0000-0000-000000000000',
      einsparlaufId: 'l0000000-0000-0000-0000-000000000000',
      ersetztEinsparlaufId: null,
      foerderjahrCode: 'FJ-2027',
      foerderjahrNummer: 1,
      foerderjahrVonMonat: '2027-01-01',
      foerderjahrBisMonat: '2027-04-01',
      foerderjahrDefinitionQuelle: 'kalenderjahr',
      einsparlaufArt: 'foerderjahr_nachweis',
      verfahrenCode: 'einsparung_foerderjahr_kap91',
      verfahrenVersion: 1,
      parameter: { abdeckungsfloor_pct: 75, vorzeichenregel: 'verrechnung_ohne_kappung' },
      bindungsHashHex: 'ab'.repeat(32),
      umfangPaareAnzahl: 1,
      monateErwartet: 4,
      monateGebunden: 4,
      gebundeneLaeufeAnzahl: 1,
      qualitaetsStufeMin: 'belastbar',
      preflightId: 'p0000000-0000-0000-0000-000000000000',
      preflightProfilCode: 'foerderjahr_preflight_de02',
      preflightProfilVersion: 1,
      preflightErgebnis: 'gruen',
      preflightBlockerAnzahl: 0,
      preflightWarnungAnzahl: 0,
      preflightHinweisAnzahl: 0,
      preflightRegelCodes: [],
      schemaCode: 'nachweis_export_kanonisch',
      schemaVersion: 1,
      pseudonymProfil: 'standard',
      stationDarstellung: 'pseudonymisiert',
      zweck: 'nachweis',
      anfrageRef: null,
      erzeugtAtUtc: '2027-05-01T10:00:00.000Z',
      codeRevision: 'test-sha',
    },
    berechnungslaeufe: [
      {
        berechnungslaufId: LAUF1,
        endkundeId: EK1,
        // V0027/D7: kein Einflussgroessen-Snapshot in diesem Fixture — der
        // v1-Regelfall (keine mvet-System-Zuordnung gepflegt). Der Renderer
        // muss die Kategorie dann sichtbar als ausgelassen ausweisen.
        einflussgroesseSnapshotId: null,
        energietraeger: 'gas',
        periodeVon: '2027-01-01',
        periodeBis: '2027-05-01',
        stationRef: 'STATION-A',
        verfahrenCode: 'einfach_gtz_normal_v1',
        verfahrenVersion: 1,
        parameter: { t_innen: 20 },
        parameterHashHex: 'aa'.repeat(32),
        rohdatenHashHex: 'bb'.repeat(32),
        baselineWertKwh: 20000,
        grundlastAnteil: 0.2,
        gtzBase: 3500,
        gtzNorm: 3400,
        baselineNormKwh: 19500,
        qualitaetsStufeMin: 'belastbar',
        messkonzeptTyp: 'vereinfacht',
        gueteR2: null,
        gueteCvRmsePct: null,
        gueteNmbePct: null,
        guetePunkte: null,
        baselineAbweichungPct: null,
      },
    ],
    klimaTage: [{ stationRef: 'STATION-A', tag: '2027-01-01', tMittel: 2.5, gtzTag: 17.5 }],
    einflussgroessen: [],
    rohdaten: [
      { endkundeId: EK1, energietraeger: 'gas', messkanalKey: 42, tag: '2027-01-01', wertKwh: 12.345, qualitaetMin: 2, anzahlMesswerte: 96 },
    ],
    bindungen: [
      {
        endkundeId: EK1,
        energietraeger: 'gas',
        monat: '2027-01-01',
        berechnungslaufId: LAUF1,
        referenzKwh: 200,
        istKwh: 150,
        deltaKwh: 50,
        deltaAusgewiesenKwh: 50,
        qualitaetsStufe: 'belastbar',
        behandlung: 'gemessen',
        kandidatenAnzahl: 1,
      },
    ],
    ergebnisse: [
      {
        endkundeId: EK1,
        energietraeger: 'gas',
        status: 'ausgewiesen',
        ausschlussGrundCode: null,
        referenzKwhSumme: 200,
        istKwhSumme: 150,
        einsparungKwhEndenergie: 50,
        monateAusgewiesen: 1,
        monateErsatz: 0,
        monateFehlend: 3,
        qualitaetsStufeMin: 'eingeschraenkt',
        wissAuswertungAusgenommen: false,
      },
    ],
    differenzZeilen: null,
    dwdAttributionErforderlich: false,
    endkundePseudonym: (id) => (id === EK1 ? 'EK-0001' : 'EK-0002'),
    systemPseudonym: (id) => id,
    messkanalPseudonym: (key) => (key === 42 ? 'MK-0001' : `MK-${String(key)}`),
    stationWert: (ref) => (ref === 'STATION-A' ? 'ST-0001' : ref),
    geraeteQuoten: [],
    nachweisSysteme: [],
    nachweisMesspunkte: [],
    geraeteGruppen: [],
    foerderjahr: { code: 'FJ-2027', nummer: 1, vonMonat: '2027-01-01', bisMonat: '2027-04-01' },
    geraetegruppeWert: (id, bezeichnung) => (id === GG1 ? 'GG-0001' : bezeichnung),
  };
  return { ...basis, ...overrides };
}

function findeRepoWurzel(): string {
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    try {
      readFileSync(join(dir, 'pnpm-workspace.yaml'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('pnpm-workspace.yaml nicht gefunden — Repo-Wurzel unauffindbar.');
}

/**
 * Der Textinhalt einer Exportdatei.
 *
 * Seit Exportschema v3 kann `inhalt` ein `Buffer` sein (die
 * Einsparungsnachweis-Mappe). Fuer die CSV-Pruefungen hier ist es immer ein
 * String — der Helfer macht das explizit, statt an jeder Stelle zu casten.
 */
function text(datei: { readonly inhalt: string | Buffer } | undefined): string {
  const inhalt = datei?.inhalt;
  return typeof inhalt === 'string' ? inhalt : (inhalt?.toString('utf8') ?? '');
}

describe('renderExportBundleV1() — Determinismus (Kernanforderung)', () => {
  it('liefert bei identischer Eingabe BIT-IDENTISCHE Dateiinhalte und denselben manifestHash', () => {
    const eingang = baueEingang();
    const erst = renderExportBundleV1(eingang);
    const zweit = renderExportBundleV1(baueEingang());

    expect(erst.manifestHash.equals(zweit.manifestHash)).toBe(true);
    expect(erst.dateien).toHaveLength(zweit.dateien.length);
    for (const datei of erst.dateien) {
      const gegenstueck = zweit.dateien.find((d) => d.dateiname === datei.dateiname);
      expect(gegenstueck).toBeDefined();
      expect(text(datei)).toBe(text(gegenstueck));
      expect(datei.hash.equals(gegenstueck?.hash as Buffer)).toBe(true);
    }
  });

  it('reagiert auf eine Aenderung der Eingangsdaten mit einem ANDEREN manifestHash (kein Hash-Fixpunkt)', () => {
    const basis = renderExportBundleV1(baueEingang());
    const geaendert = renderExportBundleV1(
      baueEingang({
        ergebnisse: [
          {
            endkundeId: EK1,
            energietraeger: 'gas',
            status: 'ausgewiesen',
            ausschlussGrundCode: null,
            referenzKwhSumme: 200,
            istKwhSumme: 100, // geaendert
            einsparungKwhEndenergie: 100,
            monateAusgewiesen: 1,
            monateErsatz: 0,
            monateFehlend: 3,
            qualitaetsStufeMin: 'eingeschraenkt',
            wissAuswertungAusgenommen: false,
          },
        ],
      }),
    );
    expect(basis.manifestHash.equals(geaendert.manifestHash)).toBe(false);
  });
});

describe('renderExportBundleV1() — Auflage A12 (rohdaten bedingt auf FJ-10, seit V0028)', () => {
  it('enthaelt rohdaten_messwert_tag.csv, wenn der gebundene Preflight KEIN FJ-10 fuehrt (Standardfall dieses Fixtures)', () => {
    const ergebnis = renderExportBundleV1(baueEingang());
    const datei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.ROHDATEN_MESSWERT_TAG);
    expect(datei).toBeDefined();
    expect(datei?.kategorie).toBe('rohdaten');
    // Sortierung/Pseudonymisierung: EK-0001,gas,MK-0001,2027-01-01,12.345,2,96
    expect(text(datei)).toContain('EK-0001,gas,MK-0001,2027-01-01,12.345,2,96');
    const metablatt = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.METABLATT);
    expect(text(metablatt)).toContain('kategorie_rohdaten_status,enthalten');
  });

  it('enthaelt KEINE rohdaten_messwert_tag.csv, wenn der gebundene Preflight FJ-10 fuehrt (Sperrstatus strukturell nicht aufloesbar), und weist die Auslassung im Metablatt sichtbar aus (DE-02-Muster)', () => {
    const eingang = baueEingang();
    const ergebnis = renderExportBundleV1({ ...eingang, header: { ...eingang.header, preflightRegelCodes: ['FJ-10'] } });
    expect(ergebnis.dateien.some((d) => d.dateiname === EXPORT_DATEINAMEN.ROHDATEN_MESSWERT_TAG)).toBe(false);
    expect(ergebnis.dateien.some((d) => d.kategorie === 'rohdaten')).toBe(false);
    const metablatt = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.METABLATT);
    expect(text(metablatt)).toContain('Auflage A12');
    expect(text(metablatt)).toContain('FJ-10');
  });
});

describe('Spalten-Positivliste (Auflage A15, kein SELECT *)', () => {
  const gerenderteDateien = Object.entries(EXPORT_SPALTENPROFIL);

  // Gegen das V2-Buendel geprueft, weil es die Obermenge ist: Es enthaelt
  // alle v1-Dateien UND die beiden Geraeteerkennungs-Dateien (V0064). Gegen
  // v1 gerendert faenden die letzten beiden keinen Treffer.
  it.each(gerenderteDateien)('%s hat GENAU den definierten Spalten-Header', (dateiname, erwarteteHeader) => {
    const ergebnis = renderExportBundleV2(baueEingang({ differenzZeilen: [{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 10, wertNeuKwh: 20, deltaKwh: 10 }] }));
    const datei = ergebnis.dateien.find((d) => d.dateiname === dateiname);
    expect(datei).toBeDefined();
    const ersteZeile = text(datei).split('\r\n')[0];
    expect(ersteZeile).toBe(erwarteteHeader.join(','));
  });
});

describe('renderExportBundleV1() — Korrektur-Export (B7 Punkt 4, Differenz-Report)', () => {
  it('rendert KEINE einspardaten_differenz.csv, wenn differenzZeilen=null', () => {
    const ergebnis = renderExportBundleV1(baueEingang({ differenzZeilen: null }));
    expect(ergebnis.dateien.some((d) => d.dateiname === EXPORT_DATEINAMEN.EINSPARDATEN_DIFFERENZ)).toBe(false);
  });

  it('rendert einspardaten_differenz.csv mit klassierter Richtung, wenn differenzZeilen gesetzt ist', () => {
    const ergebnis = renderExportBundleV1(
      baueEingang({ differenzZeilen: [{ endkundeId: EK1, energietraeger: 'gas', wertAltKwh: 100, wertNeuKwh: 130, deltaKwh: 30 }] }),
    );
    const datei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.EINSPARDATEN_DIFFERENZ);
    expect(datei).toBeDefined();
    expect(text(datei)).toContain('EK-0001,gas,100.000,130.000,30.000,hoeher\r\n');
  });
});

describe('renderExportBundleV1() — Auflage A20 (bedingte DWD-Attribution)', () => {
  it('nimmt den DWD-Vermerk NICHT ins Metablatt auf, wenn keine DWD-Daten eingingen', () => {
    const ergebnis = renderExportBundleV1(baueEingang({ dwdAttributionErforderlich: false }));
    const metablatt = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.METABLATT);
    expect(text(metablatt)).toContain('nicht anwendbar');
    expect(text(metablatt)).not.toContain('Deutscher Wetterdienst');
  });

  it('nimmt den DWD-Vermerk UND den Aenderungsvermerk ins Metablatt auf, wenn DWD-Daten eingingen', () => {
    const ergebnis = renderExportBundleV1(baueEingang({ dwdAttributionErforderlich: true }));
    const metablatt = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.METABLATT);
    // Gegen die KONSTANTEN geprueft, nicht gegen abgeschriebene Textstuecke:
    // Der Wortlaut gibt der DWD vor (§ 7 DWDG), er hat sich mit der
    // A-1-Freigabe am 2026-09-09 schon einmal geaendert, und ein Test, der
    // ihn zweitschreibt, prueft dann nur noch die eigene Kopie.
    expect(text(metablatt)).toContain(DWD_QUELLENVERMERK);
    expect(text(metablatt)).toContain(DWD_AENDERUNGSVERMERK);
  });

  it('traegt KEINE Dateikopf-Kurzreferenz in baseline_lauf.csv/baseline_klima_tag.csv, wenn keine DWD-Daten eingingen (Header bleibt erste Zeile)', () => {
    const ergebnis = renderExportBundleV1(baueEingang({ dwdAttributionErforderlich: false }));
    const laufDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.BASELINE_LAUF);
    const klimaDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG);
    expect(text(laufDatei).split('\r\n')[0]).toBe(EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.BASELINE_LAUF].join(','));
    expect(text(klimaDatei).split('\r\n')[0]).toBe(EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG].join(','));
  });

  it('traegt eine Dateikopf-Kurzreferenz (VOR dem Tabellen-Header) in GENAU den zwei DWD-abgeleiteten Dateien, wenn DWD-Daten eingingen (A20, "Dateien reisen einzeln")', () => {
    const ergebnis = renderExportBundleV1(baueEingang({ dwdAttributionErforderlich: true }));
    const laufDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.BASELINE_LAUF);
    const klimaDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG);
    const laufZeilen = text(laufDatei).split('\r\n') ?? [];
    const klimaZeilen = text(klimaDatei).split('\r\n') ?? [];

    expect(laufZeilen[0]).toContain('metablatt.csv');
    expect(laufZeilen[1]).toBe(EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.BASELINE_LAUF].join(','));
    expect(klimaZeilen[0]).toContain('metablatt.csv');
    expect(klimaZeilen[1]).toBe(EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG].join(','));

    // Kurzreferenz ist KEIN Volltext-Duplikat (dependencies.md: "kein Duplizieren von Vermerkstexten").
    expect(laufZeilen[0]).not.toContain('Deutscher Wetterdienst');

    // Alle ANDEREN Dateien bleiben UNBERUEHRT.
    const jahrDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.EINSPARDATEN_JAHR);
    expect(text(jahrDatei).split('\r\n')[0]).toBe(EXPORT_SPALTENPROFIL[EXPORT_DATEINAMEN.EINSPARDATEN_JAHR].join(','));
  });
});

describe('renderExportBundleV1() — Auflage A13 (Stationsdarstellung, Ehrlichkeitsklausel)', () => {
  it('verwendet bei pseudonymisiert die Stations-Pseudonyme und traegt die Ehrlichkeitsklausel', () => {
    const ergebnis = renderExportBundleV1(baueEingang({ header: { ...baueEingang().header, stationDarstellung: 'pseudonymisiert' } }));
    const klimaDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG);
    expect(text(klimaDatei)).toContain('ST-0001');
    expect(text(klimaDatei)).not.toContain('STATION-A');
    const metablatt = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.METABLATT);
    expect(text(metablatt)).toContain('KEINE Anonymisierung');
  });

  it('verwendet bei klarname den rohen stationRef', () => {
    const eingang = baueEingang();
    const ergebnis = renderExportBundleV1({
      ...eingang,
      header: { ...eingang.header, stationDarstellung: 'klarname', anfrageRef: 'AZ-2027-001' },
      stationWert: (ref) => ref,
    });
    const klimaDatei = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG);
    expect(text(klimaDatei)).toContain('STATION-A');
  });
});

describe('renderExportBundleV1() — Manifest', () => {
  it('listet alle Dateien SORTIERT nach Dateiname mit korrektem sha256_hex', () => {
    const ergebnis = renderExportBundleV1(baueEingang());
    const manifest = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.MANIFEST);
    expect(manifest).toBeDefined();
    const zeilen = text(manifest).trim().split('\r\n').slice(1);
    const dateinamenInManifest = zeilen.map((z) => z.split(',')[0]);
    expect(dateinamenInManifest).toEqual([...dateinamenInManifest].sort());
    for (const andereDatei of ergebnis.dateien.filter((d) => d.dateiname !== EXPORT_DATEINAMEN.MANIFEST)) {
      expect(text(manifest)).toContain(andereDatei.hash.toString('hex'));
    }
  });
});

describe('B7-Zweckbindung — struktureller Beleg (Auftragspflicht "kein einfluss.*-Lesepfad")', () => {
  it('referenziert im gesamten Quelltext von nachweis/export/** NIEMALS das einfluss-Schema (nur den Domaenen-Begriff "einflussgroessen")', () => {
    const wurzel = findeRepoWurzel();
    const exportDir = join(wurzel, 'src', 'backend', 'src', 'nachweis', 'export');
    const verboteneMuster = [/\beinfluss\.(katalog|intervall|befund)\b/, /from ['"].*\/einfluss\//, /require\(['"].*\/einfluss\//];

    const dateien = readdirSync(exportDir).filter((f) => f.endsWith('.ts'));
    expect(dateien.length).toBeGreaterThan(0);
    for (const datei of dateien) {
      const inhalt = readFileSync(join(exportDir, datei), 'utf8');
      for (const muster of verboteneMuster) {
        expect(inhalt).not.toMatch(muster);
      }
    }
  });

  it('renderExportBundleV1 importiert AUSSCHLIESSLICH aus domain/**, berechnung/hash.util, berechnung/klima/**, dem eigenen verfahren.const und Spaltenprofil', () => {
    const wurzel = findeRepoWurzel();
    const pfad = join(wurzel, 'src', 'backend', 'src', 'nachweis', 'export', 'nachweis-export-renderer.ts');
    const inhalt = readFileSync(pfad, 'utf8');
    const importZeilen = inhalt.split('\n').filter((z) => z.trim().startsWith('import'));
    const erlaubtePraefixe = [
      "'../domain/",
      "'../../berechnung/hash.util",
      "'../../berechnung/klima/dwd-quellenvermerk.const",
      "'../verfahren.const",
      "'./nachweis-export-spaltenprofil.const",
      // Exportschema v3 (V0075): Die Einsparungsnachweis-Mappe liegt im
      // SELBEN Verzeichnis und importiert ihrerseits nur den XLSX-Schreiber
      // aus `common/`. Sie faellt damit unter dieselbe Pruefung wie der
      // Renderer — der Struktur-Test darueber liest ALLE `.ts` dieses
      // Verzeichnisses und wuerde einen `einfluss`-Zugriff auch dort finden.
      "'./einsparungsnachweis-mappe",
    ];
    for (const zeile of importZeilen) {
      expect(erlaubtePraefixe.some((praefix) => zeile.includes(praefix))).toBe(true);
    }
  });
});

describe('Exportschema v2 (V0064) — Geraeteerkennungs-Quote (TB-05)', () => {
  const QUOTE = {
    endkundeId: EK1,
    energietraeger: 'gas',
    gesamtKwh: 1000,
    zugeordnetKwh: 260,
    quotePct: 26,
    sollQuotePct: 20,
    erreicht: true,
    systemeGesamt: 3,
    systemeEntbehrlich: 1,
    ohneTageswerte: false,
  };
  const GRUPPE = {
    endkundeId: EK1,
    energietraeger: 'gas',
    geraetegruppeId: GG1,
    bezeichnung: 'Wohnung Musterfrau',
    methode: 'direktmessung',
    zugeordnetKwh: 260,
    anteilPct: 26,
    genauigkeitPctMin: 2.5,
  };

  it('laesst v1 UNVERAENDERT — sonst driftete jeder bereits eingereichte Nachweis', () => {
    // Der Download rendert einen bestehenden Export NEU und vergleicht gegen
    // seinen Hash. Wuerde v1 die neuen Dateien mitliefern, waere jeder
    // Altexport rueckwirkend "gedriftet", obwohl an ihm nichts falsch ist.
    const ergebnis = renderExportBundleV1(baueEingang({ geraeteQuoten: [QUOTE], geraeteGruppen: [GRUPPE] }));

    expect(ergebnis.dateien.some((d) => d.kategorie === 'geraeteerkennung')).toBe(false);
  });

  it('rendert unter v1 fuer dieselbe Eingabe denselben Manifest-Hash wie ohne Quotendaten', () => {
    const ohne = renderExportBundleV1(baueEingang());
    const mit = renderExportBundleV1(baueEingang({ geraeteQuoten: [QUOTE], geraeteGruppen: [GRUPPE] }));

    expect(mit.manifestHash.toString('hex')).toBe(ohne.manifestHash.toString('hex'));
  });

  it('rendert unter v2 beide Dateien mit Quote, Sollquote und Erreichung', () => {
    const ergebnis = renderExportBundleV2(baueEingang({ geraeteQuoten: [QUOTE], geraeteGruppen: [GRUPPE] }));
    const quote = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.GERAETEERKENNUNG_QUOTE);

    expect(quote?.kategorie).toBe('geraeteerkennung');
    expect(text(quote)).toContain('EK-0001,gas,FJ-2027,1,2027-01-01,2027-04-01,1000.000,260.000,26.00,20.00,true,3,1,false');
  });

  it('rendert die Gruppendatei je METHODE — eine gemessene Zuordnung ist etwas anderes als eine gerechnete', () => {
    const ergebnis = renderExportBundleV2(
      baueEingang({
        geraeteQuoten: [QUOTE],
        geraeteGruppen: [GRUPPE, { ...GRUPPE, methode: 'algorithmus', zugeordnetKwh: 40, anteilPct: 4, genauigkeitPctMin: 15 }],
      }),
    );
    const gruppe = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE);
    const zeilen = text(gruppe).split('\r\n').filter((z) => z.length > 0) ?? [];

    expect(zeilen).toHaveLength(3); // Header + zwei Methoden
    expect(zeilen[1]).toBe('EK-0001,gas,GG-0001,algorithmus,40.000,4.00,15.00');
    expect(zeilen[2]).toBe('EK-0001,gas,GG-0001,direktmessung,260.000,26.00,2.50');
  });

  it('haelt die Freitext-Bezeichnung aus dem Regelexport heraus (A13-Muster)', () => {
    // `energy.geraetegruppe.bezeichnung` ist Freitext — jemand kann eine
    // Gruppe nach einer Person benennen, und der Export ist sonst
    // durchgehend pseudonymisiert.
    const ergebnis = renderExportBundleV2(baueEingang({ geraeteQuoten: [QUOTE], geraeteGruppen: [GRUPPE] }));
    const gruppe = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE);

    expect(text(gruppe)).toContain('GG-0001');
    expect(text(gruppe)).not.toContain('Musterfrau');
  });

  it('zeigt die Bezeichnung bei aktenkundiger Anfrage (stationDarstellung=klarname)', () => {
    const eingang = baueEingang({ geraeteQuoten: [QUOTE], geraeteGruppen: [GRUPPE] });
    const ergebnis = renderExportBundleV2({
      ...eingang,
      header: { ...eingang.header, stationDarstellung: 'klarname', anfrageRef: 'AZ-2027-001' },
      geraetegruppeWert: (_id, bezeichnung) => bezeichnung,
    });
    const gruppe = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE);

    expect(text(gruppe)).toContain('Wohnung Musterfrau');
  });

  it('laesst Quote und Erreichung LEER, wenn es keine Tageswerte gibt — eine 0 waere ein Ergebnis', () => {
    const ergebnis = renderExportBundleV2(
      baueEingang({
        geraeteQuoten: [{ ...QUOTE, gesamtKwh: 0, zugeordnetKwh: 0, quotePct: null, erreicht: null, ohneTageswerte: true }],
      }),
    );
    const quote = ergebnis.dateien.find((d) => d.dateiname === EXPORT_DATEINAMEN.GERAETEERKENNUNG_QUOTE);

    expect(text(quote)).toContain('0.000,0.000,,20.00,,3,1,true');
  });

  it('rendert beide Dateien AUCH leer — sonst waere "keine Zuordnung" von "nicht geprueft" nicht zu unterscheiden', () => {
    const ergebnis = renderExportBundleV2(baueEingang());
    const namen = ergebnis.dateien.map((d) => d.dateiname);

    expect(namen).toContain(EXPORT_DATEINAMEN.GERAETEERKENNUNG_QUOTE);
    expect(namen).toContain(EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE);
  });

  it('waehlt den Renderer nach der gespeicherten Schema-Version', () => {
    expect(waehleRenderer(1)).toBe(renderExportBundleV1);
    expect(waehleRenderer(2)).toBe(renderExportBundleV2);
  });

  it('weist eine unbekannte Version fail-closed ab, statt still das falsche Buendel zu bauen', () => {
    expect(() => waehleRenderer(99)).toThrow(/Unbekannte Exportschema-Version 99/);
  });
});
