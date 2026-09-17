import { describe, expect, it } from 'vitest';
import { DWD_QUELLENVERMERK } from '../../berechnung/klima/dwd-quellenvermerk.const';
import type { NutzerinfoBericht, NutzerinformationItem } from '../nutzerinfo.types';
import { rendereNutzerinfoDokument, type DokumentSeite } from './nutzerinfo-dokument.renderer';

/** Synthetische Portal-Adresse fuer alle Tests — kein echter Betrieb, keine echte Domain. */
const PORTAL_URL = 'https://portal.beispiel-edms.test/portal';

function information(overrides: Partial<NutzerinformationItem> = {}): NutzerinformationItem {
  return {
    id: '0198c3aa-aaaa-7000-8000-000000000001',
    endkundeId: '0198c3aa-aaaa-7000-8000-00000000000e',
    energietraeger: 'gas',
    monat: '2025-03-01',
    berechnungslaufId: '0198c3aa-aaaa-7000-8000-000000000009',
    referenzKwh: 1500,
    istKwh: 1234,
    deltaKwh: 266,
    qualitaetsStufe: 'belastbar',
    abdeckungPct: 100,
    tageFehlend: 0,
    kandidatenAnzahl: 1,
    inhaltHashHex: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    erzeugtAt: '2025-04-01T06:00:00.000Z',
    zugestelltAt: null,
    zustellweg: null,
    ...overrides,
  };
}

function bericht(overrides: Partial<NutzerinfoBericht> = {}): NutzerinfoBericht {
  return {
    information: information(),
    vonTag: '2025-03-01',
    bisTag: '2025-03-31',
    gruppen: [{ geraetegruppeId: 'g1', bezeichnung: 'Heizung', verbrauchKwh: 900, anteilPct: 72.9 }],
    zugeordnetKwh: 900,
    nichtZugeordnetKwh: 334,
    ohneTageswerte: false,
    vormonatDeltaKwh: null,
    vormonatIstKwh: null,
    ...overrides,
  };
}

function seite(overrides: Partial<DokumentSeite> = {}): DokumentSeite {
  return { bericht: bericht(), klimaAusDwd: false, ...overrides };
}

describe('rendereNutzerinfoDokument', () => {
  it('nennt Verbrauch, Erwartung und Einsparung in der Sprache des Kunden', () => {
    const html = rendereNutzerinfoDokument([seite()], null, PORTAL_URL);

    expect(html).toContain('1.234 kWh');
    expect(html).toContain('1.500 kWh');
    expect(html).toContain('<strong>266 kWh eingespart</strong>');
    // Betriebs-Vokabular gehört nicht auf ein Kundendokument.
    expect(html).not.toContain('Berechnungslauf');
    expect(html).not.toContain('Qualitätsstufe');
  });

  it('benennt einen Mehrverbrauch, statt ihn zu glätten', () => {
    // Kap. 6 verlangt die Angabe von Einsparungen UND Mehrverbräuchen; die
    // Vorzeichenregel des BAFA-Nachweises gilt hier ausdrücklich NICHT
    // (s. Spaltenkommentar zu `delta_kwh`, V0054).
    const html = rendereNutzerinfoDokument(
      [seite({ bericht: bericht({ information: information({ istKwh: 1800, deltaKwh: -300 }) }) })],
      null,
      PORTAL_URL,
    );

    expect(html).toContain('<strong>300 kWh mehr</strong>');
    expect(html).not.toContain('eingespart');
  });

  it('trägt den DWD-Quellenvermerk, wenn echte Klimadaten in die Rechnung eingingen', () => {
    // Auflage A-2, Punkt 3: kundengerichtete Ausgaben bereinigter Werte.
    const html = rendereNutzerinfoDokument([seite({ klimaAusDwd: true })], null, PORTAL_URL);

    expect(html).toContain('Deutscher Wetterdienst');
    expect(html).toContain('Gradtagzahlen');
  });

  it('trägt ihn NICHT bei synthetischem Klima — er wäre eine Falschangabe', () => {
    const html = rendereNutzerinfoDokument([seite({ klimaAusDwd: false })], null, PORTAL_URL);

    expect(html).not.toContain(DWD_QUELLENVERMERK);
    expect(html).not.toContain('Wetterdienst');
  });

  it('maskiert Gruppenbezeichnungen — sie sind frei erfasster Text', () => {
    // Ohne Maskierung wäre die Stammdatenpflege ein Weg, Skript in ein
    // Dokument zu bringen, das weitergereicht und im Browser geöffnet wird.
    const html = rendereNutzerinfoDokument(
      [
        seite({
          bericht: bericht({
            gruppen: [
              { geraetegruppeId: 'g1', bezeichnung: '<script>alert(1)</script>', verbrauchKwh: 10, anteilPct: 1 },
            ],
          }),
        }),
      ],
      null,
      PORTAL_URL,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sagt bei fehlenden Tageswerten, dass die Aufteilung unbekannt ist — nicht null', () => {
    const html = rendereNutzerinfoDokument([seite({ bericht: bericht({ ohneTageswerte: true }) })], null, PORTAL_URL);

    expect(html).toContain('keine Tageswerte');
    expect(html).not.toContain('<table>');
  });

  it('sagt bei fehlender Zuordnung, dass keine Gruppen erfasst sind', () => {
    const html = rendereNutzerinfoDokument([seite({ bericht: bericht({ gruppen: [] }) })], null, PORTAL_URL);

    expect(html).toContain('keine Gerätegruppen erfasst');
  });

  it('weist eine eingeschränkte Datenlage aus, statt sie zu verschweigen', () => {
    const html = rendereNutzerinfoDokument(
      [
        seite({
          bericht: bericht({ information: information({ qualitaetsStufe: 'eingeschraenkt', tageFehlend: 3 }) }),
        }),
      ],
      null,
      PORTAL_URL,
    );

    expect(html).toContain('eingeschränkt');
    expect(html).toContain('An 3 Tagen');
  });

  it('schweigt über die Datenlage, wenn sie in Ordnung ist', () => {
    const html = rendereNutzerinfoDokument([seite()], null, PORTAL_URL);

    expect(html).not.toContain('eingeschränkt');
  });

  it('trägt Beleg-Kennung und Prüfsumme in der Fußzeile', () => {
    // Die Verbindung zwischen gedrucktem Blatt und eingefrorener Zeile —
    // ohne sie ließe sich später nicht sagen, welche Fassung der Kunde hatte.
    const html = rendereNutzerinfoDokument([seite()], null, PORTAL_URL);

    expect(html).toContain('0198c3aa-aaaa-7000-8000-000000000001');
    expect(html).toContain('abcdef0123456789');
  });

  it('setzt in der Mappe jede Information auf eine eigene Seite', () => {
    const html = rendereNutzerinfoDokument([seite(), seite(), seite()], '2025-03-01', PORTAL_URL);

    expect(html.match(/class="blatt"/g)).toHaveLength(3);
    expect(html).toContain('Monatliche Energieinformationen März 2025');
    expect(html).toContain('enthält 3 Informationen');
  });

  it('lässt das erste Blatt eines Einzeldokuments ohne Seitenumbruch beginnen', () => {
    // Sonst käme eine leere erste Seite aus dem Drucker.
    expect(rendereNutzerinfoDokument([seite()], null, PORTAL_URL)).toContain('blatt blatt--erstes');
  });

  it('rendert deterministisch — gleiche Eingabe, gleiches Byte-Ergebnis', () => {
    // Trägt den Hash-Vergleich aus V0054 („kein Byte-Archiv, sondern
    // deterministisches Re-Rendering") auch für das Dokument.
    expect(rendereNutzerinfoDokument([seite()], null, PORTAL_URL)).toBe(rendereNutzerinfoDokument([seite()], null, PORTAL_URL));
  });

  it('holt keine externen Mittel nach — das Dokument muss offline lesbar bleiben', () => {
    const html = rendereNutzerinfoDokument([seite()], '2025-03-01', PORTAL_URL);

    // „Offline lesbar" heißt: nichts wird beim Öffnen automatisch
    // nachgeladen (Skript, Bild, Stylesheet-Link). Ein <a href> zum Portal
    // ist davon ausdrücklich NICHT betroffen — ein Verweistext löst keinen
    // Netzzugriff aus, solange niemand draufklickt. Die frühere Prüfung
    // „kein http(s):// im Dokument" war deshalb zu grob geworden, sobald der
    // Portal-Hinweis (bewusst) eine URL im Klartext trägt.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<link');
  });

  it('verweist auf das Nutzerportal — sonst erfährt der Kunde nie, dass es das digitale Opt-out gibt', () => {
    // TB-06 verlangt die monatliche Information MIT Opt-out. Das Opt-out ist
    // nur ueber das Portal erreichbar; ohne diesen Absatz stuende der Weg
    // dorthin in keinem Dokument, das der Kunde bekommt.
    const html = rendereNutzerinfoDokument([seite()], null, PORTAL_URL);

    expect(html).toContain(`href="${PORTAL_URL}"`);
    expect(html).toContain(PORTAL_URL);
    expect(html).toContain('widersprechen');
  });

  it('trägt keinen Zugangscode- oder Kennung-WERT — nur das WORT „Zugangscode" im Fließtext ist zulässig', () => {
    // Der Zugangscode existiert nach seiner Ausgabe nur noch als Suchindex
    // (HMAC, `PortalCodeIndexService`) — im Klartext ist er nirgends
    // abrufbar. Ein monatlich wiederholter Klartext-Code waere ein
    // Dauer-Generalschluessel zu fremden Verbrauchsdaten. Der Bericht/die
    // Seite kennt strukturell gar keinen Code-/Kennung-Wert (s.
    // `NutzerinfoBericht`) — dieser Test prueft das strukturell am
    // gerenderten FORMAT, nicht am Wort: Weder das Code-Format
    // (`ABCD-EFGH-JKMN`, s. `erzeugeZugangscode`) noch das Kennung-Format
    // (`EK-ABC234`, s. `erzeugeKennung`) duerfen im Dokument vorkommen. Das
    // Wort „Zugangscode" selbst ist im Satz „wir senden Ihnen dann einen
    // Zugangscode per Post zu" ausdruecklich erwuenscht.
    const html = rendereNutzerinfoDokument([seite()], null, PORTAL_URL);

    expect(html).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/);
    expect(html).not.toMatch(/\bEK-[A-Z2-9]{6}\b/);
  });
});
