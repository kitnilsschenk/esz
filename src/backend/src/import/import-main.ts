import 'reflect-metadata';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TransactionHost } from '@nestjs-cls/transactional';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { EndkundeService } from '../stammdaten/endkunde/endkunde.service';
import { SystemService } from '../stammdaten/system/system.service';
import { ZaehlerService } from '../stammdaten/zaehler/zaehler.service';
import { MesskanalService } from '../stammdaten/messkanal/messkanal.service';
import { ImportRunnerModule } from './import-runner.module';
import { ImportStammdatenRepository } from './persistence/import-stammdaten.repository';
import { ImportMesswertRepository, QUALITAET_CODES, QUALITAET_STANDARD } from './persistence/import-messwert.repository';
import type { ImportQualitaet } from './persistence/import-messwert.repository';
import { ImportLaufService, type ImportBilanz } from './import-lauf.service';
import { leseMessmappe, MessreiheParseFehler } from './messreihe/messreihe-parser';
import type { Messmappe } from './messreihe/messreihe.types';

/**
 * Der Messreihen-Import — Bestandsdaten aus Tabellenmappen übernehmen.
 *
 * WOFÜR ES IHN GIBT
 * -----------------
 * Bis hierher kannte das System genau zwei Wege, an Messwerte zu kommen: den
 * Live-Ingest über den Broker und den Nachlauf aus einer NDJSON-Datei mit
 * ChirpStack-Envelopes. Beide setzen voraus, dass die Werte von einem Gerät
 * stammen, das dieses System kennt. Bestandsdaten aus den Jahren vor der
 * Anbindung — genau die, aus denen eine Baseline entsteht — kamen darüber
 * nicht herein.
 *
 * DATEIFORMAT
 * -----------
 * XLSX-Arbeitsmappen mit einem Blatt je Förderjahr (`FJ1 2018-2019`), darin
 * Tageszeilen mit `Datum` und je Messgröße einer Spalte, abgeschlossen von
 * einer Summenzeile. Gelesen wird über einen eigenen, abhängigkeitsfreien
 * XLSX-Leser (`xlsx/`), Spalten werden über ihre Überschrift zugeordnet.
 *
 * WAS ER PRÜFT, BEVOR ER SCHREIBT
 * -------------------------------
 * Die Summenzeile jedes Blattes wird gegen die Summe der gelesenen Tage
 * gehalten. Weicht sie ab, bricht der Import ab — es ist der einzige Weg, ein
 * fehlendes oder doppeltes Datum zu bemerken, ohne die Quelle zu kennen.
 *
 * PROBELAUF IST DER STANDARD
 * --------------------------
 * Ohne `--ausfuehren` wird gelesen, geprüft und bilanziert. Die Spalte
 * `vorhanden` ist die Angabe, wegen der man ihn macht: Sie sagt, ob auf einem
 * Kanal schon Werte liegen — und damit, ob dieser Lauf ergänzt oder
 * wiederholt.
 *
 * WIE DIE WERTE EINGESTUFT WERDEN
 * -------------------------------
 * `qualitaet = geschaetzt`, `herkunft = import_altsystem`. Beides ist eine
 * fachliche Aussage und keine Voreinstellung: Eine übernommene Tabelle ist
 * kein gemessener Wert, und `import_altsystem` hat im Rangvergleich den
 * NIEDRIGSTEN Rang (V0013) — ein Import überschreibt damit niemals einen
 * gemessenen Wert, er füllt nur, wo nichts steht.
 *
 * GEBRAUCH
 * --------
 *   node dist/import/import-main.js --kennung=Pilotbestand A --datei=a.xlsx --datei=b.xlsx
 *   node dist/import/import-main.js --kennung=Pilotbestand A --datei=a.xlsx --ausfuehren
 */

const logger = new Logger('MessreihenImport');

const STANDARD_ZEITZONE = 'Europe/Berlin';

const GEBRAUCH = [
  'Gebrauch:',
  '  import-main.js --kennung=<Bestand> --datei=<mappe.xlsx> [--datei=...] [--endkunde=<uuid>]',
  '                 [--zeitzone=Europe/Berlin] [--ausfuehren]',
  '',
  '  --kennung    Bestandsschluessel; Praefix aller Systembezeichnungen dieses Imports.',
  '               Ein zweiter Lauf mit derselben Kennung trifft denselben Bestand.',
  '  --endkunde   An diesen Endkunden anhaengen. Fehlt er, wird der Bestand ueber die',
  '               Kennung gesucht und sonst ein neuer Endkunde angelegt.',
  '  --qualitaet  gemessen|geschaetzt (Default geschaetzt). KEINE Formalie: Die Abdeckung eines',
  '               Monats zaehlt ausschliesslich GEMESSENE Tage — ein als geschaetzt importiertes',
  '               Jahr hat 0 % Abdeckung und traegt keinen Nachweis. Ablesungen aus einem',
  '               Altsystem sind `gemessen`, eine gerechnete Reihe ist es nicht.',
  '  --ausfuehren Ohne dies laeuft der Import als Probelauf: liest und prueft, schreibt nichts.',
].join('\n');

function argWert(argv: readonly string[], name: string): string | undefined {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer?.slice(name.length + 3);
}

function argWerte(argv: readonly string[], name: string): readonly string[] {
  return argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${GEBRAUCH}\n`);
    return 0;
  }

  const kennung = argWert(argv, 'kennung');
  const dateien = argWerte(argv, 'datei');
  const ausfuehren = argv.includes('--ausfuehren');
  const zeitzone = argWert(argv, 'zeitzone') ?? STANDARD_ZEITZONE;
  const endkundeId = argWert(argv, 'endkunde');

  const qualitaetRoh = argWert(argv, 'qualitaet');
  if (qualitaetRoh !== undefined && !(qualitaetRoh in QUALITAET_CODES)) {
    logger.error(`--qualitaet='${qualitaetRoh}' ist ungueltig (erlaubt: ${Object.keys(QUALITAET_CODES).join('|')}).`);
    return 2;
  }
  const qualitaet: ImportQualitaet = (qualitaetRoh as ImportQualitaet | undefined) ?? QUALITAET_STANDARD;

  if (kennung === undefined || kennung.trim().length === 0) {
    logger.error('--kennung=<Bestand> fehlt.');
    process.stdout.write(`${GEBRAUCH}\n`);
    return 2;
  }
  if (dateien.length === 0) {
    logger.error('Mindestens ein --datei=<pfad.xlsx> wird gebraucht.');
    process.stdout.write(`${GEBRAUCH}\n`);
    return 2;
  }

  // Lesen und pruefen VOR dem Nest-Bootstrap: Eine unlesbare Mappe soll
  // keinen Datenbank-Pool aufmachen — dieselbe Reihenfolge-Begruendung wie
  // beim Nachlauf.
  const mappen: Messmappe[] = [];
  for (const pfad of dateien) {
    try {
      const info = await stat(pfad);
      if (!info.isFile()) {
        logger.error(`${pfad} ist keine Datei.`);
        return 2;
      }
    } catch {
      logger.error(`Datei nicht lesbar: ${pfad}`);
      return 2;
    }

    try {
      const mappe = leseMessmappe(basename(pfad), await readFile(pfad));
      mappen.push(mappe);
      const tage = mappe.blaetter.reduce((s, b) => s + (b.reihen[0]?.werte.length ?? 0), 0);
      logger.log(
        `${mappe.dateiname}: ${String(mappe.blaetter.length)} Foerderjahr(e), ` +
          `Anlage '${mappe.anlage ?? 'Hauptzaehler'}', rund ${String(tage)} Tage je Messgroesse.`,
      );
    } catch (fehler) {
      // Ein Parse-Fehler ist die Auskunft, wegen der es den Probelauf gibt.
      // Er nennt Datei, Blatt und Zeile — und bricht ab, statt die Mappe
      // teilweise zu uebernehmen.
      logger.error(fehler instanceof MessreiheParseFehler ? fehler.message : `${pfad}: unlesbar.`);
      return 1;
    }
  }

  // Fail-closed-Selbstcheck als PLAIN-JS-Instanziierung VOR dem Bootstrap —
  // wie in `nachlauf-main.ts` begruendet. Der Import schreibt Stammdaten UND
  // Messwerte; er darf unter einer widerspruechlichen Umgebung gar nicht
  // erst anlaufen.
  const syntheticOnlyConfig = new SyntheticOnlyConfigService();
  logger.log(
    `Import-Selbstcheck bestanden — envClass=${syntheticOnlyConfig.envClass}, ` +
      `syntheticOnly=${String(syntheticOnlyConfig.syntheticOnly)} (keine Secrets geloggt, RL-2).`,
  );

  const app = await NestFactory.createApplicationContext(ImportRunnerModule, { logger: ['warn', 'error'] });

  try {
    const service = new ImportLaufService({
      // `app.get()` loest auch Dienste auf, die ihr Modul nicht exportiert —
      // dieselbe Vorgehensweise wie beim Demo-Generator, damit die Fachmodule
      // ihre Grenzen nicht fuer ein Betriebswerkzeug oeffnen muessen.
      txHost: app.get(TransactionHost),
      endkunde: app.get(EndkundeService),
      system: app.get(SystemService),
      zaehler: app.get(ZaehlerService),
      messkanal: app.get(MesskanalService),
      stammdaten: app.get(ImportStammdatenRepository),
      messwerte: app.get(ImportMesswertRepository),
    });

    const bilanz = await service.importiere(mappen, {
      kennung: kennung.trim(),
      ...(endkundeId === undefined ? {} : { endkundeId }),
      zeitzone,
      qualitaet,
      ausfuehren,
    });

    process.stdout.write(formuliereBilanz(bilanz, ausfuehren));
    return 0;
  } finally {
    await app.close();
  }
}

function formuliereBilanz(bilanz: ImportBilanz, ausfuehren: boolean): string {
  const zeilen: string[] = [`Messreihen-Import (${bilanz.modus}, Einstufung: ${bilanz.qualitaet}):`];

  if (bilanz.endkundeId === undefined) {
    zeilen.push('  Endkunde: wird beim Ausfuehren neu angelegt.');
  } else {
    zeilen.push(`  Endkunde: ${bilanz.endkundeId}${bilanz.endkundeNeu ? ' (neu angelegt)' : ''}`);
  }

  const breite = Math.max(...bilanz.kanaele.map((k) => k.system.length), 10);
  for (const kanal of bilanz.kanaele) {
    const kopf = `  ${kanal.system.padEnd(breite)}  ${kanal.messgroesse.padEnd(18)}`;
    const zeitraum = `${kanal.vonTag}..${kanal.bisTag}`;
    const zahlen = `${String(kanal.tage).padStart(5)} Tage  ${kanal.summeKwh.toFixed(0).padStart(9)} kWh`;
    const stand = ausfuehren
      ? `${String(kanal.geschrieben).padStart(5)} geschrieben (vorher ${String(kanal.vorhanden)})`
      : `${String(kanal.vorhanden).padStart(5)} vorhanden${kanal.neuAngelegt ? ', Kanal fehlt noch' : ''}`;
    zeilen.push(`${kopf}  ${zeitraum}  ${zahlen}  ${stand}`);
  }

  zeilen.push(
    `  Summe: ${String(bilanz.kanaele.length)} Kanal/Kanaele, ${String(bilanz.tageGesamt)} Tageswerte` +
      (ausfuehren ? `, ${String(bilanz.geschriebenGesamt)} geschrieben.` : ' (nichts geschrieben — Probelauf).'),
  );

  if (!ausfuehren) {
    zeilen.push('  Mit --ausfuehren erneut starten, um zu schreiben.');
  }

  return `${zeilen.join('\n')}\n`;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((fehler: unknown) => {
    logger.error(fehler instanceof Error ? fehler.message : 'Unbekannter Fehler im Import.');
    process.exitCode = 1;
  });
