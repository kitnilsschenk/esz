import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { SecurityContext } from '../common/security/security-context';
import { MesskonzeptService } from '../stammdaten/messkonzept/messkonzept.service';
import { SystemgrenzeService } from '../stammdaten/messkonzept/systemgrenze.service';
import { BaselinePeriodeService } from '../stammdaten/messkonzept/baseline-periode.service';
import { BerechnungslaufService } from '../berechnung/berechnungslauf.service';
import { MesswertVerdichtungService } from '../retention/messwert-verdichtung.service';
import { GeraeteerkennungService } from '../geraeteerkennung/geraeteerkennung.service';
import { NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';
import { PreflightService } from '../nachweis/preflight.service';
import { EinsparlaufService } from '../nachweis/einsparlauf.service';
import { NachweisExportService } from '../nachweis/export/nachweis-export.service';
import { AufbauRunnerModule } from './aufbau-runner.module';

/**
 * Aufbau-Skript fuer den importierten Pilotbestand A: Messkonzept,
 * Verdichtung, Geraetegruppen, Berechnung, Foerderjahr, Preflight,
 * Einsparlauf, Export.
 *
 * Es ruft die ECHTEN Fachdienste, nicht SQL — was hier klemmt, klemmt auch in
 * der Oberflaeche. Es ist wiederholbar: Was schon steht, wird nicht neu
 * angelegt.
 *
 * BEWUSST BESTANDS-SPEZIFISCH. Die Baseline-Werte, die Systemgrenze und der
 * Zuschnitt der Geraetegruppen sind fachliche Festlegungen fuer GENAU DIESE
 * Liegenschaft. Sie stehen hier nachvollziehbar im Code statt nur in der
 * Datenbank — aber dies ist kein allgemeines Werkzeug, und es soll auch keins
 * werden: Ein Generator, der Baselines erfindet, waere genau das, was der
 * Importer bewusst nicht tut.
 *
 * WAS DER ERSTE DURCHLAUF ZUTAGE GEFOERDERT HAT
 * --------------------------------------------
 * 1. **Monatsraster gegen taggenaues Foerderjahr.** Der Berechnungslauf
 *    verlangt Monatsanfaenge ("v1-Einschraenkung"). Die
 *    Foerderjahre laufen vom 12.10. bis 11.10. — ein Bewilligungszeitraum
 *    laesst sich damit nicht abbilden. Dieses Skript naehert auf Monatsraster
 *    und verschiebt jedes Foerderjahr dabei um elf Tage. Fuer eine echte
 *    Einreichung waere das zu klaeren.
 *
 * 2. **`bisMonat` ist INKLUSIV, `periodeBis` EXKLUSIV.** Beide auf denselben
 *    Wert zu setzen laesst das Foerderjahr dreizehn Monate erwarten und
 *    zwoelf bekommen; jeder unbelegte Monat ist ein FJ-02-Blocker, das
 *    Ergebnis `nicht_nachweisbar`. Die beiden Felder heissen aehnlich und
 *    meinen Verschiedenes.
 *
 * 3. **Ein Berechnungslauf je ENERGIETRAEGER.** Der Preflight sucht
 *    Kandidaten je (Endkunde, Energietraeger). Laeufe nur fuer Strom lassen
 *    jeden Waerme-Monat als FJ-02 stehen.
 *
 * 4. **Geschaetzte Tage zaehlen NICHT zur Abdeckung** (`abdeckungPct =
 *    100 * tageGemessen / tageImMonat`, ADR-0006 B12). Ein vollstaendig als
 *    `geschaetzt` importiertes Jahr hat 0 % Abdeckung und ist in jedem Monat
 *    `nicht_ausweisbar`. Fuer diese modellierten Reihen ist das die richtige
 *    Antwort — das System verweigert den Nachweis fuer gerechnete Daten, und
 *    genau das soll es. Fuer Ablesungen aus einem Altsystem waere es falsch;
 *    dafuer gibt es seit diesem Durchlauf `--qualitaet=gemessen` am Importer.
 *
 * 5. **FJ-09 blockt, solange `EDMS_SYNTHETIC_ONLY=true` gilt.** Das ist
 *    beabsichtigt (s. `preflight.service.ts`): Ein gruener Preflight fuer
 *    `art=foerderjahr_nachweis` ist in diesem Betriebsmodus strukturell
 *    unerreichbar. Der Zwischenstand ist der vorgesehene Weg und traegt
 *    dieselben Zahlen.
 */

const logger = new Logger('AufbauPilotbestandA');

const KENNUNG = 'Pilotbestand A';
const HAUPTZAEHLER = `${KENNUNG} — Hauptzaehler`;

/**
 * Die Foerderjahre der Mappen: 12.10. bis 11.10., FJ1 ist die Baseline.
 *
 * BEFUND: `von`/`bis` sind die ECHTEN Foerderjahresgrenzen, `monatVon`/
 * `monatBis` das, was die Berechnung heute annimmt. Der Berechnungslauf
 * verlangt Monatsanfaenge (`berechnungslauf.service.ts`, „v1-Einschraenkung") —
 * ein Bewilligungszeitraum, der am 12. eines Monats beginnt, laesst sich damit
 * nicht abbilden. Die Naeherung verschiebt jedes Foerderjahr um elf Tage.
 */
const FOERDERJAHRE = [
  { nummer: 1, von: '2018-10-12', bis: '2019-10-12' },
  { nummer: 2, von: '2019-10-12', bis: '2020-10-12' },
  { nummer: 3, von: '2020-10-12', bis: '2021-10-12' },
  { nummer: 4, von: '2021-10-12', bis: '2022-10-12' },
  { nummer: 5, von: '2022-10-12', bis: '2023-10-12' },
] as const;

/** Baseline = FJ1, die Uebersichtsblaetter fuehren es selbst als Index 100. */
const BASELINE_STROM_KWH = 131_132;
const BASELINE_WAERME_KWH = 20_900;

/**
 * Der GRUNDLASTANTEIL je Energietraeger — aus den Tageswerten des
 * Baselinejahres abgeleitet, nicht geraten.
 *
 * `referenzMonat()` teilt die Baseline in einen witterungsUNABHAENGIGEN
 * Grundlastanteil `g` und einen witterungsgefuehrten Rest `1-g`. Wer `g`
 * falsch waehlt, verteilt die Jahresmenge falsch ueber die Monate — und die
 * monatliche Einsparung ist dann Unsinn, obwohl die Jahressumme stimmt.
 *
 * STROM: `g = 1`. Der Verbrauch ist NICHT witterungsgefuehrt — im
 * Baselinejahr liegt der Juli/August-Mittelwert bei 386,5 kWh/Tag UEBER dem
 * von Januar/Dezember (357,6). Das deckt sich mit der Methodik der Mappe
 * („Strom Sommerfaktor (Kuehlung vs. Beleuchtung), Juli/August 1,04/1,03")
 * und mit dem NSHV-Blatt („Flacher Monatsverlauf, kein Witterungsbezug. Der
 * Verbrauch folgt dem Betriebskalender"). Ein Witterungsanteil von 75 %, wie
 * der erste Durchlauf ihn ansetzte, drueckte die Sommer-Referenz gegen null
 * und liess jeden Sommermonat als Mehrverbrauch erscheinen.
 *
 * WAERME: `g = 0,126` — das Verhaeltnis des Sommerniveaus (Juli/August,
 * 7,2 kWh/Tag: reine Warmwasser-Grundlast, keine Heizung) zum Jahresmittel
 * (57,3 kWh/Tag). Der Rest folgt den Gradtagzahlen, wie es sein soll.
 */
const GRUNDLASTANTEIL: Readonly<Record<string, number>> = {
  strom: 1,
  waerme: 0.126,
};

/** Die vier Untermessungen — Stromseite. Die BHKW-WAERME ist Erzeugung und gehoert NICHT dazu. */
const GERAETEGRUPPEN = [
  { system: `${KENNUNG} — BHKW`, bezeichnung: 'BHKW Hilfsstrom' },
  { system: `${KENNUNG} — NSHV Phasen`, bezeichnung: 'Beleuchtung und Arbeitsplaetze (NSHV)' },
  { system: `${KENNUNG} — MSR (UVT)`, bezeichnung: 'MSR und Lueftung (UVT)' },
  { system: `${KENNUNG} — Kaeltemaschine`, bezeichnung: 'Kaelteerzeugung' },
] as const;

const subject: SecurityContext = {
  sub: 'aufbau-pilotbestand-a',
  actorTyp: 'benutzer',
  roles: ['betrieb'],
  azp: 'edms-bff',
};

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(AufbauRunnerModule, { logger: ['log', 'warn', 'error'] });
  const txHost = app.get<TransactionHost<TransactionalAdapterTypeOrm>>(TransactionHost);
  const tx = <T>(fn: () => Promise<T>): Promise<T> => txHost.withTransaction(Propagation.Required, fn);

  try {
    // --- 0. Den importierten Bestand finden ---------------------------
    const bestand: unknown = await tx(() =>
      txHost.tx.query(
        `SELECT s.id, s.bezeichnung, s.endkunde_id FROM energy.system s WHERE s.bezeichnung LIKE $1 ORDER BY s.bezeichnung`,
        [`${KENNUNG}%`],
      ),
    );
    const systeme = bestand as { id: string; bezeichnung: string; endkunde_id: string }[];
    const haupt = systeme.find((s) => s.bezeichnung === HAUPTZAEHLER);
    if (haupt === undefined) {
      logger.error(`System '${HAUPTZAEHLER}' nicht gefunden — erst importieren.`);
      return 2;
    }
    const endkundeId = haupt.endkunde_id;
    logger.log(`Endkunde ${endkundeId}, ${String(systeme.length)} Systeme.`);

    // --- 1. Messkonzept mit Baseline ----------------------------------
    const bestehendeVersion: unknown = await tx(() =>
      txHost.tx.query(
        `SELECT mv.id FROM energy.messkonzept_version mv
           JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
          WHERE mk.endkunde_id = $1 AND mv.gueltig_bis IS NULL`,
        [endkundeId],
      ),
    );
    if ((bestehendeVersion as unknown[]).length > 0) {
      logger.log('Messkonzept-Version besteht bereits — nicht neu versioniert.');
    } else
    await tx(() =>
      app.get(MesskonzeptService).anlegenVersion(endkundeId, {
        typ: 'standard',
        systemgrenze:
          'Hauptzaehler Liegenschaft Pilotbestand A (Strom und Waerme). Die vier Untermessungen ' +
          '(BHKW-Hilfsstrom, NSHV, MSR/UVT, Kaeltemaschine) liegen INNERHALB dieser Grenze. ' +
          'Die WAERME-ERZEUGUNG des BHKW liegt ausserhalb — sie ist Erzeugung, kein Verbrauch.',
        systembeschreibung:
          'Bestandsuebernahme aus Messreihen-Mappen (Tageswerte, Foerderjahre 1-5, 12.10.2018-11.10.2023).',
        bereinigungsverfahren:
          'Gradtagzahlverfahren nach VDI 3807. ACHTUNG: Die uebernommenen Waermewerte sind BEREITS ' +
          'witterungsbereinigt (Quellmessung); eine erneute Bereinigung waere doppelt.',
        messgeraeteWahl: 'Bestandszaehler der Liegenschaft, Tageswerte aus Uebernahme',
        geraeteerkennungsVerfahren: 'Direktmessung ueber vier Untermessungen (NSHV, MSR, Kaelte, BHKW-Hilfsstrom)',
        energietraeger: [
          {
            energietraeger: 'strom',
            baselineWert: BASELINE_STROM_KWH,
            baselineEinheit: 'kWh',
            baselineMethode: 'Foerderjahr 1 (12.10.2018-11.10.2019) aus den uebernommenen Tageswerten',
            baselineAbrechnungenAnzahl: 1,
            baselineBegruendung:
              'Es liegen keine drei Jahresabrechnungen vor. Die Baseline stuetzt sich auf das erste ' +
              'Foerderjahr der uebernommenen Messreihe; frueher liegen keine Daten vor.',
          },
          {
            energietraeger: 'waerme',
            baselineWert: BASELINE_WAERME_KWH,
            baselineEinheit: 'kWh',
            baselineMethode: 'Foerderjahr 1 (12.10.2018-11.10.2019) aus den uebernommenen Tageswerten',
            baselineAbrechnungenAnzahl: 1,
            baselineBegruendung:
              'Es liegen keine drei Jahresabrechnungen vor. Die Baseline stuetzt sich auf das erste ' +
              'Foerderjahr der uebernommenen Messreihe; frueher liegen keine Daten vor.',
          },
        ],
      }),
    );
    logger.log('Messkonzept angelegt.');

    const mvets: unknown = await tx(() =>
      txHost.tx.query(
        `SELECT mvet.id, mvet.energietraeger
           FROM energy.messkonzept_version_energietraeger mvet
           JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
           JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
          WHERE mk.endkunde_id = $1 AND mv.gueltig_bis IS NULL`,
        [endkundeId],
      ),
    );
    const mvetJeTraeger = new Map(
      (mvets as { id: string; energietraeger: string }[]).map((m) => [m.energietraeger, m.id]),
    );
    logger.log(`MVETs: ${[...mvetJeTraeger.keys()].join(', ')}`);

    // Alle Systeme an die MVETs haengen — die Untermessungen gehoeren in
    // dieselbe Systemgrenze wie der Hauptzaehler.
    //
    // Seit V0072 ueber den Fachdienst statt per SQL: Was dieses Skript tut,
    // kann der Betrieb jetzt auch in der Oberflaeche tun, und der Vorgang
    // steht im Audit-Log.
    //
    // Nur, WENN noch nichts gesetzt ist. Das Skript ist wiederholbar, und
    // seit es die Oberflaeche gibt, kann jemand die Grenze bewusst enger
    // gezogen haben — ein zweiter Skriptlauf darf diese Entscheidung nicht
    // ueberschreiben.
    const systemIds = systeme.map((system) => system.id);
    for (const [traeger, mvetId] of mvetJeTraeger) {
      const bestehend = await tx(() => app.get(SystemgrenzeService).lesen(mvetId));
      if (bestehend.systeme.length > 0) {
        logger.log(`Systemgrenze ${traeger}: bereits gesetzt (${String(bestehend.systeme.length)} Systeme).`);
        continue;
      }
      await tx(() => app.get(SystemgrenzeService).setzen(mvetId, systemIds, subject, true));
      logger.log(`Systemgrenze ${traeger}: ${String(systemIds.length)} Systeme gesetzt.`);
    }

    // --- 1b. Baseline-Perioden ----------------------------------------
    // GTZ_base wird aus dem Baseline-ZEITRAUM hergeleitet, nicht aus einer
    // gesetzten Zahl. Die Periode ist Foerderjahr 1 — dasselbe Jahr, aus dem
    // die Baseline-MENGE stammt.
    //
    // Seit V0073 ebenfalls ueber den Fachdienst. Vorher stand hier ein
    // SQL-Einwurf mit dem Vermerk, dass es keinen anderen Weg gebe: Ohne ihn
    // bliebe fuer GTZ_base nur der `gtzBaseOverride` — also genau die
    // geratene Gradtagzahl, die aus diesem Bestand verschwinden sollte.
    //
    // BEFUND, der bleibt: Es ist EINE Periode, nicht drei. TB-02 erwartet den
    // Mittelwert aus mindestens drei Jahresabrechnungen; hier liegt nur das
    // Baselinejahr der Mappen vor. Die Route weist das ueber
    // `abrechnungenAnzahlDeklariert`/`anzahlWeichtAb` aus, sobald jemand die
    // Zahl am Messkonzept pflegt.
    for (const [traeger, mvetId] of mvetJeTraeger) {
      const bestehend = await tx(() => app.get(BaselinePeriodeService).lesen(mvetId));
      if (bestehend.perioden.length > 0) {
        logger.log(`Baseline-Periode ${traeger}: bereits erfasst (${String(bestehend.perioden.length)}).`);
        continue;
      }
      const baselineMenge = traeger === 'strom' ? BASELINE_STROM_KWH : BASELINE_WAERME_KWH;
      const antwort = await tx(() =>
        app
          .get(BaselinePeriodeService)
          .setzen(
            mvetId,
            [{ von: FOERDERJAHRE[0].von, bis: FOERDERJAHRE[0].bis, menge: baselineMenge, einheit: 'kWh' }],
            subject,
            true,
          ),
      );
      logger.log(
        `Baseline-Periode ${traeger}: ${FOERDERJAHRE[0].von} bis ${FOERDERJAHRE[0].bis} ` +
          `(${String(antwort.perioden[0]?.tage ?? 0)} Tage, letzter Tag ${antwort.perioden[0]?.letzterTag ?? '?'}).`,
      );
    }

    // --- 2. Verdichtung auf Tageswerte --------------------------------
    const verdichtung = await app.get(MesswertVerdichtungService).fuehreAus({
      vonTag: '2018-10-01',
      bisTag: '2023-11-01',
    });
    logger.log(`${String(verdichtung.anzahlTageszeilen)} Tageszeilen verdichtet.`);

    // --- 3. Geraetegruppen (TB-05) ------------------------------------
    for (const gruppe of GERAETEGRUPPEN) {
      const system = systeme.find((s) => s.bezeichnung === gruppe.system);
      if (system === undefined) {
        logger.warn(`System '${gruppe.system}' fehlt — Gruppe uebersprungen.`);
        continue;
      }
      const kanaele: unknown = await tx(() =>
        txHost.tx.query(
          `SELECT k.id FROM energy.messkanal k
             JOIN energy.zaehler z ON z.id = k.zaehler_id
            WHERE z.system_id = $1 AND k.messgroesse = 'wirkarbeit'`,
          [system.id],
        ),
      );
      const kanalId = (kanaele as { id: string }[])[0]?.id;
      if (kanalId === undefined) {
        logger.warn(`Kein Stromkanal in '${gruppe.system}' — Gruppe uebersprungen.`);
        continue;
      }

      const schonZugeordnet: unknown = await tx(() =>
        txHost.tx.query(
          `SELECT 1 FROM energy.geraetegruppe_kanal WHERE messkanal_id = $1 AND gueltig_bis IS NULL`,
          [kanalId],
        ),
      );
      if ((schonZugeordnet as unknown[]).length > 0) {
        logger.log(`Geraetegruppe fuer '${gruppe.system}' besteht bereits.`);
        continue;
      }

      await tx(async () => {
        const angelegt = await app.get(GeraeteerkennungService).legeGruppeAn({
          endkundeId,
          bezeichnung: gruppe.bezeichnung,
          beschreibung: 'Direktmessung ueber eine eigene Untermessung.',
        });
        await app.get(GeraeteerkennungService).legeZuordnungAn({
          geraetegruppeId: angelegt.id,
          messkanalId: kanalId,
          methode: 'direktmessung',
          // Direktmessung: die Genauigkeit ist die des Zaehlers, keine Schaetzung —
          // das Feld bleibt weg statt auf einen erfundenen Prozentwert gesetzt.
          gueltigVon: '2018-10-12',
        });
      });
      logger.log(`Geraetegruppe '${gruppe.bezeichnung}' zugeordnet.`);
    }

    // --- 4. Berechnungslaeufe je Foerderjahr --------------------------
    const laeufe: { nummer: number; id: string }[] = [];
    for (const fj of FOERDERJAHRE) {
      // BEIDE Energietraeger: Der Preflight sucht Kandidaten je
      // (Endkunde, Energietraeger). Ein Lauf nur fuer Strom laesst jeden
      // Waerme-Monat als FJ-02 (kein Kandidat) stehen.
      for (const [traeger, mvetId] of mvetJeTraeger) {
      // Idempotenz: Ein zweiter Skriptlauf darf keinen ZWEITEN Lauf fuer
      // dieselbe Periode anlegen. Zwei gleichwertige Kandidaten machen die
      // Bindung mehrdeutig (FJ-05) — und eine Auswertung, die beide summiert,
      // zeigt glatt das Doppelte. Genau darauf bin ich hereingefallen.
      const vorhanden: unknown = await tx(() =>
        txHost.tx.query(
          `SELECT id FROM analytics.berechnungslauf
            WHERE endkunde_id = $1 AND mvet_id = $2 AND periode_von = $3::date AND periode_bis = $4::date
              AND ersetzt_lauf_id IS NULL`,
          [endkundeId, mvetId, fj.von, fj.bis],
        ),
      );
      if ((vorhanden as unknown[]).length > 0) {
        logger.log(`FJ${String(fj.nummer)} ${traeger}: Berechnungslauf besteht bereits.`);
        continue;
      }

      const lauf = await tx(() =>
        app.get(BerechnungslaufService).starten(
          {
            endkundeId,
            mvetId,
            // TAGGENAU seit V0070 — dieselben Grenzen wie das Foerderjahr.
            periodeVon: fj.von,
            periodeBis: fj.bis,
            grundlastAnteil: GRUNDLASTANTEIL[traeger] ?? 1,
            // DWD 04094 = „Weingarten, Kr. Ravensburg" (47,806 N / 9,621 E,
            // 441 m, Reihe seit 1946) — die naechstgelegene Station mit
            // durchgehender Reihe ueber den Bewilligungszeitraum.
            //
            // KEINE Entfernungsangabe zum Bestand (2026-09-17): Die
            // Stationsbezeichnung nennt einen Landkreis mit rund 290.000
            // Einwohnern und verortet nichts. Eine Entfernung dazu verengte
            // das auf einen Umkreis — fuer die fachliche Aussage entbehrlich.
            //
            // Der Kreisname steht hier BEWUSST: Es ist die amtliche
            // Stationsbezeichnung des DWD, nicht die Bezeichnung des
            // Bestands. Der Bestand selbst heisst seit dem 2026-09-16
            // „Pilotbestand A"; eine amtliche Bezeichnung Dritter zu
            // verfaelschen waere schlechter als der Ortsbezug, den sie
            // mitfuehrt — die Angabe muss gegen das DWD-Stationsverzeichnis
            // pruefbar bleiben.
            //
            // Hier stand bis 2026-09-16 `DWD-04911`. Das ist STRAUBING in
            // Niederbayern, rund 220 km entfernt, anderes Bundesland, anderer
            // Klimaraum. Aufgefallen ist es nie, weil der synthetische
            // Adapter die Stationsnummer gar nicht liest — sie war eine
            // Zeichenkette ohne Wirkung. Mit `EDMS_KLIMA_QUELLE=dwd` wird sie
            // wirksam, und die Witterungsbereinigung liefe gegen das falsche
            // Wetter: plausibel aussehend, nachweislich falsch.
            stationRef: 'DWD-04094',
            // KEIN gtzBaseOverride mehr: Der erste Durchlauf setzte hier 3500
            // Kd/a — eine Zahl ohne Grundlage in den Daten. Ohne den Override
            // leitet der Lauf GTZ_base aus der `energy.baseline_periode` her
            // (unten angelegt), also aus DERSELBEN Klimaquelle wie GTZ_m.
            // Erst damit ist das Verhaeltnis der beiden eine Aussage.
          },
          subject,
          true,
        ),
      );
      laeufe.push({ nummer: fj.nummer, id: lauf.id });
      logger.log(
        `FJ${String(fj.nummer)} ${traeger}: Berechnungslauf ${lauf.id}, ` +
          `${String(lauf.ergebnisse.length)} Monatsergebnis(se).`,
      );
      }
    }

    // --- 5. Foerderjahre, Preflight, Einsparlauf ----------------------
    for (const fj of FOERDERJAHRE.slice(1)) {
      const code = `FJ-PILOTBESTAND-A-${String(fj.nummer)}`;
      const vorhanden: unknown = await tx(() =>
        txHost.tx.query('SELECT id FROM nachweis.foerderjahr WHERE code = $1', [code]),
      );
      const foerderjahrId =
        (vorhanden as { id: string }[])[0]?.id ??
        (
          await tx(() =>
            app.get(NachweisFoerderjahrRepository).insert({
              id: randomUUID(),
              code,
              vorhabenRef: 'AZ-PILOTBESTAND-A-ESZ',
              nummer: fj.nummer,
              // TAGGENAU seit V0070 — genau die Grenzen aus dem
              // Bewilligungszeitraum, kein Monatsraster mehr.
              vonTag: fj.von,
              bisTag: fj.bis,
              definitionQuelle: 'bewilligungszeitraum',
              bescheidRef: null,
            }),
          )
        ).id;

      const preflight = await tx(() =>
        app
          .get(PreflightService)
          .ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, subject, true),
      );
      const einsparlauf = await tx(() =>
        app
          .get(EinsparlaufService)
          .starten({ foerderjahrId, preflightId: preflight.preflight.id, art: 'zwischenstand' }, subject, true),
      );
      logger.log(
        `FJ${String(fj.nummer)}: Preflight ${preflight.preflight.ergebnis}, ` +
          `Einsparlauf ${einsparlauf.id} mit ${String(einsparlauf.ergebnisse.length)} Ergebnis(sen).`,
      );

      if (fj.nummer === FOERDERJAHRE.length) {
        const exportAntwort = await tx(() => app.get(NachweisExportService).erzeugen(einsparlauf.id, {}, subject));
        for (const datei of exportAntwort.dateien) {
          const inhalt = await tx(() =>
            app.get(NachweisExportService).datei(exportAntwort.id, datei.dateiname, subject),
          );
          const umfang =
            typeof inhalt === 'string'
              ? `${String(Math.max(inhalt.trimEnd().split('\n').length - 1, 0))} Zeilen`
              : `${String(inhalt.length)} Bytes (Mappe)`;
          logger.log(`  Export ${datei.dateiname}: ${umfang}`);
        }
      }
    }

    return 0;
  } finally {
    await app.close();
  }
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((fehler: unknown) => {
    logger.error(fehler instanceof Error ? `${fehler.message}\n${fehler.stack ?? ''}` : 'Unbekannter Fehler.');
    process.exitCode = 1;
  });
