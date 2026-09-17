import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { SecurityContext } from '../common/security/security-context';
import type { EndkundeService } from '../stammdaten/endkunde/endkunde.service';
import type { SystemService } from '../stammdaten/system/system.service';
import type { ZaehlerService } from '../stammdaten/zaehler/zaehler.service';
import type { MesskanalService } from '../stammdaten/messkanal/messkanal.service';
import type { MesskonzeptService } from '../stammdaten/messkonzept/messkonzept.service';
import type { BerechnungslaufService } from '../berechnung/berechnungslauf.service';
import type { PreflightService } from '../nachweis/preflight.service';
import type { EinsparlaufService } from '../nachweis/einsparlauf.service';
import type { NachweisExportService } from '../nachweis/export/nachweis-export.service';
import type { NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';
import { fensterAusMonaten } from '../nachweis/persistence/nachweis-foerderjahr.repository';
import type { MesswertVerdichtungService } from '../retention/messwert-verdichtung.service';
import type { GeraeteerkennungService } from '../geraeteerkennung/geraeteerkennung.service';

/**
 * Die Dienste, die der Generator braucht. Sie werden vom `demo-main.ts` aus
 * dem Nest-Kontext aufgelöst und hier hereingereicht — die Fachmodule
 * exportieren ihre Dienste bewusst nicht, und sie dafür zu öffnen hieße, eine
 * Modulgrenze für ein Entwicklungswerkzeug aufzuweichen.
 */
export interface DemoDienste {
  readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>;
  readonly endkunde: EndkundeService;
  readonly system: SystemService;
  readonly zaehler: ZaehlerService;
  readonly messkanal: MesskanalService;
  readonly messkonzept: MesskonzeptService;
  readonly berechnung: BerechnungslaufService;
  readonly verdichtung: MesswertVerdichtungService;
  readonly geraeteerkennung: GeraeteerkennungService;
  readonly foerderjahre: NachweisFoerderjahrRepository;
  readonly preflight: PreflightService;
  readonly einsparlauf: EinsparlaufService;
  readonly export: NachweisExportService;
}

export interface DemoErgebnis {
  readonly endkundeId: string;
  readonly foerderjahrId: string;
  readonly foerderjahrCode: string;
  readonly berechnungslaufId: string;
  readonly einsparlaufId: string;
  readonly exportId: string;
  readonly dateien: readonly { readonly dateiname: string; readonly zeilen: number }[];
  readonly messwerteGeschrieben: number;
  readonly tageVerdichtet: number;
}

export interface DemoOptionen {
  /** Das Jahr, für das der Nachweis geführt wird. Das Vorjahr trägt die Baseline. */
  readonly nachweisjahr: number;
  /** Wie viel weniger im Nachweisjahr verbraucht wird, als die Baseline erwarten ließe. */
  readonly einsparungAnteil: number;
  /** Ein Kürzel, das in Namen und Kennungen auftaucht — macht mehrere Läufe unterscheidbar. */
  readonly kennung: string;
}

const STUNDEN_JE_TAG = 24;

/**
 * Die Messkanaele des Demo-Systems und ihr Anteil am Verbrauch.
 *
 * Die Untermessungen tragen einen ANTEIL der Hauptmessung — sie sind keine
 * zusaetzliche Energie, sondern eine Aufteilung derselben. Genau das ist der
 * Fall, den die Zuordnungsquote als „im Gesamtverbrauch enthalten" kennt.
 */
const KANAELE = [
  { rolle: 'hauptmessung', anteil: 1, istUntermessung: false },
  { rolle: 'beleuchtung', anteil: 0.28, istUntermessung: true },
  { rolle: 'serverraum', anteil: 0.14, istUntermessung: true },
] as const;

/**
 * Die Baseline ist der Jahresverbrauch der HAUPTMESSUNG im Vorjahr.
 *
 * Genau das misst auch die Einsparberechnung: Sie laesst Untermessungen seit
 * V0058 aus, weil deren Verbrauch bereits in der Hauptmessung steckt. Vor
 * V0058 summierte sie alle Kanaele — und dieser Bestand wies deshalb trotz
 * 12 Prozent WENIGER Verbrauch eine Einsparung von MINUS 18 154 kWh aus.
 */
const BASELINE_FAKTOR = KANAELE[0].anteil;

/**
 * Der synthetische Betrieb: ein Bürogebäude mit Grundlast rund um die Uhr,
 * mehr Verbrauch an Werktagen und einem witterungsabhängigen Anteil.
 *
 * Die Zahlen sind erfunden, aber nicht beliebig — sie sollen einen Verlauf
 * ergeben, an dem man erkennt, ob eine Auswertung plausibel rechnet. Ein
 * konstanter Verbrauch täte das nicht: Er sähe auch dann richtig aus, wenn die
 * Witterungsbereinigung gar nicht greift.
 */
function stundenverbrauchKwh(zeitpunkt: Date, faktor: number): number {
  const stunde = zeitpunkt.getUTCHours();
  const wochentag = zeitpunkt.getUTCDay();
  const tagImJahr = Math.floor(
    (zeitpunkt.getTime() - Date.UTC(zeitpunkt.getUTCFullYear(), 0, 1)) / 86_400_000,
  );

  const grundlast = 4;
  const bueroBetrieb = wochentag >= 1 && wochentag <= 5 && stunde >= 7 && stunde < 18 ? 11 : 0;
  // Heizlast über einen Jahreszyklus — im Januar am höchsten, im Juli null.
  const heizlast = Math.max(0, 9 * Math.cos((2 * Math.PI * tagImJahr) / 365));

  return (grundlast + bueroBetrieb + heizlast) * faktor;
}

/**
 * Erzeugt einen vollständigen, synthetischen Datenbestand — von der
 * Stammdatenanlage über zwei Jahre Messwerte bis zum fertigen BAFA-Export.
 *
 * **Wozu er da ist.** Der Nachweis-Export war gebaut und getestet, aber nie
 * an einem Bestand vorgeführt worden: Die Integrationstests legen Stammdaten
 * an und lassen den Export laufen, schreiben aber KEINE Messwerte — die
 * Rohdaten-Datei blieb deshalb leer und die Einsparung `nicht_nachweisbar`.
 * Der Export lief also, ohne je etwas zu enthalten. Dieser Generator schließt
 * genau diese Lücke: Am Ende liegen CSV-Dateien mit Zeilen darin.
 *
 * **Er nimmt die echten Wege.** Stammdaten, Messkonzept, Berechnungslauf,
 * Preflight, Einsparlauf und Export laufen über die Fachdienste, nicht über
 * SQL. Ein Generator, der die Tabellen direkt füllt, prüft nichts — er liefe
 * auch dann, wenn die Anlegewege kaputt sind, und genau die soll er vorführen.
 *
 * **Ausnahme Messwerte.** Zwei Jahre Stundenwerte sind rund 17 500 Zeilen je
 * Kanal; die werden gebündelt per SQL geschrieben. Der Ingest-Weg selbst hat
 * seinen eigenen Ende-zu-Ende-Test (`ingest-worker.e2e.integration.spec.ts`)
 * und ist hier nicht der Prüfgegenstand.
 */
export class DemoDatenService {
  private readonly logger = new Logger('DemoDaten');

  constructor(private readonly dienste: DemoDienste) {}

  /** Der Betriebs-Kontext, unter dem der Generator schreibt. */
  private readonly subject: SecurityContext = {
    sub: 'demo-generator',
    actorTyp: 'benutzer',
    roles: ['betrieb'],
    azp: 'edms-bff',
  };

  private inTransaktion<T>(fn: () => Promise<T>): Promise<T> {
    return this.dienste.txHost.withTransaction(Propagation.Required, fn);
  }

  async erzeuge(optionen: DemoOptionen): Promise<DemoErgebnis> {
    const { nachweisjahr, kennung } = optionen;
    const baselinejahr = nachweisjahr - 1;

    // --- 1. Stammdaten -------------------------------------------------
    const endkundeId = await this.inTransaktion(async () => {
      const angelegt = await this.dienste.endkunde.anlegen(
        {
          stammdatenPii: {
            name: `Musterbetrieb ${kennung} GmbH`,
            anschrift: `Industriestrasse ${String(1 + (kennung.length % 40))}, 76131 Karlsruhe`,
            kontakt: `betrieb-${kennung.toLowerCase()}@example.invalid`,
          },
        },
        this.subject,
      );
      return angelegt.id;
    });
    this.logger.log(`Endkunde ${endkundeId} angelegt.`);

    const systemId = await this.inTransaktion(async () => {
      const system = await this.dienste.system.anlegen({
        endkundeId,
        bezeichnung: `Verwaltungsgebaeude ${kennung}`,
        systemgrenze: 'Hauptzaehler Gebaeude A, inkl. Beleuchtung, Lueftung und Serverraum',
        systembeschreibung: 'Synthetischer Demo-Bestand, keine realen Verbrauchsdaten.',
      });
      return system.id;
    });

    const kanaele = await this.inTransaktion(async () => {
      const ergebnis: { readonly id: string; readonly key: number; readonly rolle: string }[] = [];
      // Hauptmessung plus zwei Untermessungen — erst damit hat die
      // Geraeteerkennung ueberhaupt etwas zuzuordnen, und der Nenner der
      // Quote bleibt die Hauptmessung.
      for (const { rolle } of KANAELE) {
        const zaehler = await this.dienste.zaehler.anlegen({
          systemId,
          geraetetyp: 'synthetisch-referenz-v1',
          energietraeger: 'strom',
        });
        const kanal = await this.dienste.messkanal.anlegen(zaehler.id, {
          // KLEINGESCHRIEBEN, und das ist keine Kosmetik: Der Kanal-Lookup der
          // Datenaufnahme vergleicht `messgroesse` EXAKT
          // (`energy-stammdaten-lookup.repository.ts`). Der Decoder
          // `synthetisch-referenz-v1` liefert `wirkarbeit`; stand hier
          // `Wirkarbeit`, fand kein einziger eintreffender Uplink seinen Kanal
          // und landete in Quarantaene — beobachtet 2026-09-08, der gesamte
          // Ingest-Pfad war dadurch im Dev-Bestand tot, ohne dass es auffiel.
          messgroesse: 'wirkarbeit',
          einheit: 'kWh',
          art: 'kumulativ_zaehlerstand',
          istUntermessung: KANAELE.find((k) => k.rolle === rolle)?.istUntermessung ?? false,
        });
        const key = await this.kanalKey(kanal.id);
        ergebnis.push({ id: kanal.id, key, rolle });
      }
      return ergebnis;
    });
    this.logger.log(`${String(kanaele.length)} Messkanaele angelegt.`);

    // --- 2. Messkonzept mit Baseline -----------------------------------
    // Der Baseline-Wert ist der Jahresverbrauch des VORJAHRES — er wird unten
    // aus denselben Stundenwerten gebildet, aus denen auch die Messwerte
    // entstehen. Ein frei gewaehlter Wert liesse die Einsparung beliebig
    // ausfallen und damit nichts beweisen.
    const baselineKwh = this.jahresverbrauchKwh(baselinejahr, BASELINE_FAKTOR);
    const mvetId = await this.inTransaktion(async () => {
      await this.dienste.messkonzept.anlegenVersion(endkundeId, {
        // 'vereinfacht', weil der Demo-Bestand KEINE Baseline-Perioden fuehrt:
        // Der Baseline-Wert ist ein gesetzter Jahresverbrauch, keine Vermessung.
        // Seit V0076 liest der Lauf diesen Typ -- er als 'standard' zu fuehren
        // hiesse, eine Anpassung an Messdaten zu behaupten, die es nicht gibt.
        typ: 'vereinfacht',
        systemgrenze: 'Hauptzaehler Gebaeude A',
        systembeschreibung: 'Synthetischer Demo-Bestand.',
        bereinigungsverfahren: 'Gradtagzahlverfahren nach VDI 3807',
        messgeraeteWahl: 'Fernauslesbare Zaehler (LoRaWAN)',
        geraeteerkennungsVerfahren: 'Direktmessung ueber Untermessungen',
        energietraeger: [
          {
            energietraeger: 'strom',
            baselineWert: Math.round(baselineKwh),
            baselineEinheit: 'kWh',
            baselineMethode: `Jahresverbrauch ${String(baselinejahr)} aus Messwerten`,
          },
        ],
      });
      return this.mvetId(endkundeId);
    });
    await this.inTransaktion(() => this.verknuepfeMvetMitSystem(mvetId, systemId));
    this.logger.log(`Messkonzept angelegt, Baseline ${String(Math.round(baselineKwh))} kWh.`);

    // --- 3. Messwerte: Baselinejahr + Nachweisjahr ---------------------
    let messwerteGeschrieben = 0;
    for (const kanal of kanaele) {
      const anteil = KANAELE.find((k) => k.rolle === kanal.rolle)?.anteil ?? 1;
      for (const jahr of [baselinejahr, nachweisjahr]) {
        const sparfaktor = jahr === nachweisjahr ? 1 - optionen.einsparungAnteil : 1;
        messwerteGeschrieben += await this.inTransaktion(() =>
          this.schreibeJahresMesswerte(kanal.key, jahr, anteil * sparfaktor),
        );
      }
    }
    this.logger.log(`${String(messwerteGeschrieben)} Messwerte geschrieben.`);

    // --- 4. Verdichtung auf Tageswerte ---------------------------------
    // Sie ist die Voraussetzung fuer die Geraeteerkennungs-Quote UND fuer die
    // Rohdaten-Datei des Exports: Beide lesen `measurement.messwert_tag`.
    const verdichtung = await this.dienste.verdichtung.fuehreAus({
      vonTag: `${String(baselinejahr)}-01-01`,
      bisTag: `${String(nachweisjahr + 1)}-01-01`,
      // Die Verdichtung laesst den heutigen Tag bewusst aus (er ist noch nicht
      // vollstaendig). Bei einem Nachweisjahr in der Vergangenheit spielt das
      // keine Rolle; `jetzt` bleibt deshalb ungesetzt.
    });
    this.logger.log(`${String(verdichtung.anzahlTageszeilen)} Tageswerte verdichtet.`);

    // --- 5. Geraetegruppen (TB-05) -------------------------------------
    await this.legeGeraetegruppenAn(endkundeId, kanaele, `${String(nachweisjahr)}-01-01`);

    // --- 6. Berechnungslauf --------------------------------------------
    const berechnungslaufId = await this.inTransaktion(async () => {
      const lauf = await this.dienste.berechnung.starten(
        {
          endkundeId,
          mvetId,
          periodeVon: `${String(nachweisjahr)}-01-01`,
          periodeBis: `${String(nachweisjahr + 1)}-01-01`,
          grundlastAnteil: 0.25,
          stationRef: `DEMO-STATION-${kennung}`,
          gtzBaseOverride: 3500,
        },
        this.subject,
        true,
      );
      return lauf.id;
    });
    this.logger.log(`Berechnungslauf ${berechnungslaufId} gestartet.`);

    // --- 7. Foerderjahr, Preflight, Einsparlauf -------------------------
    const foerderjahrCode = `FJ-DEMO-${kennung}`;
    const foerderjahrId = await this.inTransaktion(async () => {
      const jahr = await this.dienste.foerderjahre.insert({
        id: randomUUID(),
        code: foerderjahrCode,
        vorhabenRef: `AZ-DEMO-${kennung}`,
        nummer: 1,
        ...fensterAusMonaten(`${String(nachweisjahr)}-01-01`, `${String(nachweisjahr)}-12-01`),
        definitionQuelle: 'kalenderjahr',
        bescheidRef: null,
      });
      return jahr.id;
    });

    const preflight = await this.inTransaktion(() =>
      this.dienste.preflight.ausfuehren(
        { foerderjahrId, profilCode: 'foerderjahr_preflight_de02' },
        this.subject,
        true,
      ),
    );
    this.logger.log(`Preflight: ${preflight.preflight.ergebnis}.`);

    const einsparlauf = await this.inTransaktion(() =>
      this.dienste.einsparlauf.starten(
        {
          foerderjahrId,
          preflightId: preflight.preflight.id,
          // `zwischenstand` und nicht `foerderjahr_nachweis`: Der
          // Nachweis-Lauf verlangt einen GRUENEN Preflight, und der haengt an
          // Vorbedingungen, die ein Demo-Bestand nicht erfuellen soll (etwa
          // einem gezeichneten Messkonzept). Der Zwischenstand ist ausdruecklich
          // auch bei rotem Preflight zulaessig (ADR-0007 D4) und traegt
          // dieselben Zahlen.
          art: 'zwischenstand',
        },
        this.subject,
        true,
      ),
    );
    this.logger.log(`Einsparlauf ${einsparlauf.id} mit ${String(einsparlauf.ergebnisse.length)} Ergebnissen.`);

    // --- 8. Der Export --------------------------------------------------
    const exportAntwort = await this.inTransaktion(() =>
      this.dienste.export.erzeugen(einsparlauf.id, {}, this.subject),
    );

    const dateien: { readonly dateiname: string; readonly zeilen: number }[] = [];
    for (const datei of exportAntwort.dateien) {
      const inhalt = await this.inTransaktion(() =>
        this.dienste.export.datei(exportAntwort.id, datei.dateiname, this.subject),
      );
      // Kopfzeile zaehlt nicht als Datenzeile — sonst saehe eine leere Datei
      // wie eine gefuellte aus.
      dateien.push({
        dateiname: datei.dateiname,
        // Die Einsparungsnachweis-Mappe ist binaer; Zeilen zaehlen ergibt
        // dort keinen Sinn.
        zeilen: typeof inhalt === 'string' ? Math.max(inhalt.trimEnd().split('\n').length - 1, 0) : 0,
      });
    }

    return {
      endkundeId,
      foerderjahrId,
      foerderjahrCode,
      berechnungslaufId,
      einsparlaufId: einsparlauf.id,
      exportId: exportAntwort.id,
      dateien,
      messwerteGeschrieben,
      tageVerdichtet: verdichtung.anzahlTageszeilen,
    };
  }

  // ------------------------------------------------------------------
  // Hilfen
  // ------------------------------------------------------------------

  private async kanalKey(messkanalId: string): Promise<number> {
    const rows: unknown = await this.dienste.txHost.tx.query(
      'SELECT kanal_key FROM energy.messkanal WHERE id = $1',
      [messkanalId],
    );
    const zeile = (rows as { kanal_key: number }[])[0];
    if (zeile === undefined) {
      throw new Error(`Messkanal ${messkanalId} wurde angelegt, hat aber keinen kanal_key.`);
    }
    return zeile.kanal_key;
  }

  private async mvetId(endkundeId: string): Promise<string> {
    const rows: unknown = await this.dienste.txHost.tx.query(
      `SELECT mvet.id
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mk.endkunde_id = $1
        ORDER BY mvet.created_at DESC
        LIMIT 1`,
      [endkundeId],
    );
    const zeile = (rows as { id: string }[])[0];
    if (zeile === undefined) {
      throw new Error('Messkonzept-Version wurde angelegt, ist aber nicht lesbar.');
    }
    return zeile.id;
  }

  /**
   * V0028 — es gibt (bewusst) keinen HTTP-Schreibpfad fuer diese Zuordnung.
   * Ohne sie fuehrt der Preflight `FJ-10`, und die Kategorie `rohdaten` fehlt
   * im Export.
   */
  private async verknuepfeMvetMitSystem(mvetId: string, systemId: string): Promise<void> {
    await this.dienste.txHost.tx.query(
      `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
         SELECT mvet.id, sys.id, mvet.endkunde_id
           FROM energy.messkonzept_version_energietraeger mvet, energy.system sys
          WHERE mvet.id = $1 AND sys.id = $2
       ON CONFLICT DO NOTHING`,
      [mvetId, systemId],
    );
  }

  /** Der Jahresverbrauch, den das Verbrauchsmodell fuer ein Jahr ergibt. */
  private jahresverbrauchKwh(jahr: number, faktor: number): number {
    let summe = 0;
    const zeiger = new Date(Date.UTC(jahr, 0, 1));
    while (zeiger.getUTCFullYear() === jahr) {
      for (let stunde = 0; stunde < STUNDEN_JE_TAG; stunde += 1) {
        const zeitpunkt = new Date(zeiger.getTime() + stunde * 3_600_000);
        summe += stundenverbrauchKwh(zeitpunkt, faktor);
      }
      zeiger.setUTCDate(zeiger.getUTCDate() + 1);
    }
    return summe;
  }

  /**
   * Schreibt ein Jahr Stundenwerte als KUMULATIVE Zaehlerstaende — so, wie ein
   * echter Zaehler sie liefert. Der Kanal ist als `kumulativ_zaehlerstand`
   * angelegt; Intervallverbraeuche an dieser Stelle waeren ein anderer
   * Messgroessen-Typ und wuerden von der Verdichtung anders gelesen.
   */
  private async schreibeJahresMesswerte(kanalKey: number, jahr: number, faktor: number): Promise<number> {
    const startStand: unknown = await this.dienste.txHost.tx.query(
      'SELECT COALESCE(max(wert), 0)::float8 AS stand FROM measurement.messwert WHERE messkanal_key = $1',
      [kanalKey],
    );
    let stand = (startStand as { stand: number }[])[0]?.stand ?? 0;

    const werte: string[] = [];
    const parameter: unknown[] = [];
    let geschrieben = 0;

    const zeiger = new Date(Date.UTC(jahr, 0, 1));
    while (zeiger.getUTCFullYear() === jahr) {
      for (let stunde = 0; stunde < STUNDEN_JE_TAG; stunde += 1) {
        const zeitpunkt = new Date(zeiger.getTime() + stunde * 3_600_000);
        stand += stundenverbrauchKwh(zeitpunkt, faktor);
        parameter.push(kanalKey, zeitpunkt.toISOString(), stand.toFixed(3));
        werte.push(
          `($${String(parameter.length - 2)}, $${String(parameter.length - 1)}, $${String(parameter.length)}, 0, 0)`,
        );
        geschrieben += 1;
      }
      zeiger.setUTCDate(zeiger.getUTCDate() + 1);

      // In Buendeln schreiben: Ein einzelnes INSERT mit 26 000 Parametern
      // sprengt das Postgres-Limit von 65 535 Bind-Parametern.
      if (werte.length >= 2_000) {
        await this.schreibeBuendel(werte, parameter);
        werte.length = 0;
        parameter.length = 0;
      }
    }
    if (werte.length > 0) {
      await this.schreibeBuendel(werte, parameter);
    }
    return geschrieben;
  }

  private async schreibeBuendel(werte: readonly string[], parameter: readonly unknown[]): Promise<void> {
    await this.dienste.txHost.tx.query(
      `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
       VALUES ${werte.join(', ')}
       ON CONFLICT (messkanal_key, ts) DO NOTHING`,
      [...parameter],
    );
  }

  /**
   * Zwei Geraetegruppen mit je einer Untermessung (TB-05). Erst damit hat der
   * Monatsbericht eine Aufteilung, und die Zuordnungsquote eine Zahl.
   */
  private async legeGeraetegruppenAn(
    endkundeId: string,
    kanaele: readonly { readonly id: string; readonly rolle: string }[],
    gueltigVon: string,
  ): Promise<void> {
    for (const [rolle, bezeichnung] of [
      ['beleuchtung', 'Beleuchtung'],
      ['serverraum', 'Serverraum und IT'],
    ] as const) {
      const kanal = kanaele.find((k) => k.rolle === rolle);
      if (kanal === undefined) {
        continue;
      }
      await this.inTransaktion(async () => {
        const gruppe = await this.dienste.geraeteerkennung.legeGruppeAn({
          endkundeId,
          bezeichnung,
          beschreibung: 'Synthetischer Demo-Bestand.',
        });
        await this.dienste.geraeteerkennung.legeZuordnungAn({
          geraetegruppeId: gruppe.id,
          messkanalId: kanal.id,
          methode: 'direktmessung',
          // Die Untermessung steht seit V0058 am Kanal (s. `KANAELE`) und
          // wird von dort abgeleitet — sie ist keine Angabe der Zuordnung
          // mehr.
          gueltigVon,
        });
      });
    }
    this.logger.log('Geraetegruppen angelegt und zugeordnet.');
  }
}
