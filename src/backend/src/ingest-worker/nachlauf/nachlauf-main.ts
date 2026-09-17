import 'reflect-metadata';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SyntheticOnlyConfigService } from '../../stammdaten/synthetic/synthetic-only.config';
import { NachlaufRunnerModule } from './nachlauf-runner.module';
import { NachlaufService } from './nachlauf.service';
import type { NachlaufBilanz } from './nachlauf.service';

/**
 * Der Nachlauf-Runner — Messwerte aus einer Datei aufnehmen.
 *
 * WARUM ES IHN GIBT
 * -----------------
 * `herkunft='backfill'` war seit ADR-0005 §21 (D9) im Datenmodell, die
 * Plausibilitätsprüfung behandelte sie seit dem 2026-09-08 richtig, der
 * Schreibpfad war geprüft — **und hatte keinen Aufrufer außer Tests**. Damit
 * war der Nachlauf im Code vorhanden und im Betrieb nicht durchführbar.
 * Dieselbe Lücke, die schon der Retention-Runner geschlossen hat: zwischen
 * fertigem Dienst und Betrieb.
 *
 * DATEIFORMAT
 * -----------
 * Eine JSON-Zeile je Uplink (NDJSON), Inhalt genau der ChirpStack-Envelope,
 * den auch der Broker liefert. Kein eigenes Austauschformat — wer einen
 * Ausfall nacharbeitet, hat den Envelope, und eine Umwandlung dazwischen
 * wäre eine zusätzliche Stelle, an der Werte verlorengehen.
 *
 * PROBELAUF IST DER STANDARD
 * --------------------------
 * Ohne `--ausfuehren` wird nur gelesen und geprüft. Die Zahl der unlesbaren
 * Zeilen ist die Angabe, wegen der man den Probelauf macht: Sie sagt, ob die
 * Datei taugt, BEVOR etwas geschrieben wird. Dieselbe Linie wie beim
 * Retention-Runner und beim `--yes` des Migrations-Runners.
 *
 * WIEDERHOLUNG IST UNSCHÄDLICH
 * ----------------------------
 * Der Schreibpfad ist idempotent. Ein zweiter Lauf über dieselbe Datei
 * erzeugt keine Dubletten — wichtig, weil der Regelfall genau das ist:
 * erst ein Teil nacharbeiten, dann sicherheitshalber alles.
 *
 * GEBRAUCH
 * --------
 *   node dist/ingest-worker/nachlauf/nachlauf-main.js --datei=/pfad/uplinks.ndjson
 *   node dist/ingest-worker/nachlauf/nachlauf-main.js --datei=/pfad/uplinks.ndjson --ausfuehren
 */

const logger = new Logger('NachlaufRunner');

const GEBRAUCH = [
  'Gebrauch:',
  '  nachlauf-main.js --datei=<pfad.ndjson> [--ausfuehren]',
  '',
  'Eine JSON-Zeile je Uplink (ChirpStack-Envelope, wie vom Broker geliefert).',
  'Ohne --ausfuehren laeuft der Nachlauf als Probelauf: liest und prueft, schreibt nichts.',
].join('\n');

function argWert(argv: readonly string[], name: string): string | undefined {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer?.slice(name.length + 3);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const ausfuehren = argv.includes('--ausfuehren');
  const datei = argWert(argv, 'datei');

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${GEBRAUCH}\n`);
    return 0;
  }
  if (datei === undefined) {
    logger.error('--datei=<pfad> fehlt.');
    process.stdout.write(`${GEBRAUCH}\n`);
    return 2;
  }

  // Vor dem Nest-Bootstrap: eine fehlende Datei soll KEINEN DB-Pool
  // aufmachen — dieselbe Reihenfolge-Begruendung wie beim Selbstcheck des
  // Workers (s. `worker-main.ts`).
  try {
    const info = await stat(datei);
    if (!info.isFile()) {
      logger.error(`${datei} ist keine Datei.`);
      return 2;
    }
  } catch {
    logger.error(`Datei nicht lesbar: ${datei}`);
    return 2;
  }

  // Fail-closed-Selbstcheck als PLAIN-JS-Instanziierung VOR dem Bootstrap —
  // exakt wie in `worker-main.ts` begruendet: garantierte Reihenfolge,
  // unabhaengig vom Nest-Modulgraphen. Der Nachlauf schreibt Messwerte, er
  // darf unter einer widerspruechlichen Umgebung gar nicht erst anlaufen.
  const syntheticOnlyConfig = new SyntheticOnlyConfigService();
  logger.log(
    `Nachlauf-Selbstcheck bestanden — envClass=${syntheticOnlyConfig.envClass}, ` +
      `syntheticOnly=${String(syntheticOnlyConfig.syntheticOnly)} (keine Secrets geloggt, RL-2).`,
  );

  const app = await NestFactory.createApplicationContext(NachlaufRunnerModule, {
    // Das Ergebnis geht auf stdout; der Nest-Logger bleibt auf Warnungen und
    // Fehler, damit die Bilanz nicht zwischen Bootstrap-Zeilen untergeht.
    logger: ['warn', 'error'],
  });

  try {
    const service = app.get(NachlaufService);
    const leser = createInterface({ input: createReadStream(datei, 'utf8'), crlfDelay: Infinity });
    try {
      const bilanz = await service.verarbeiteDatei(leser, ausfuehren);
      process.stdout.write(formuliereBilanz(bilanz));
      // Liegengebliebenes ist ein Befund, kein Absturz: Der Lauf hat getan,
      // was er konnte, und sagt, was er nicht konnte. Exit 1 macht das in
      // einem Skript sichtbar, ohne den Rest zu verwerfen.
      //
      // Im Probelauf zaehlt das die unlesbaren Zeilen, in der Ausfuehrung
      // ZUSAETZLICH die Quarantaene — dort geht eine unlesbare Zeile durch die
      // Pipeline und landet als Quarantaene-Eintrag, `zeilenUnlesbar` bleibt
      // also 0. Ohne den zweiten Summanden meldete ein Lauf, der KEINEN
      // einzigen Messwert geschrieben hat, einen glatten Erfolg.
      return bilanz.zeilenUnlesbar + bilanz.quarantaene > 0 ? 1 : 0;
    } finally {
      leser.close();
    }
  } finally {
    await app.close();
  }
}

function formuliereBilanz(bilanz: NachlaufBilanz): string {
  const zeilen = [
    `Nachlauf (${bilanz.modus}): ${String(bilanz.zeilenGelesen)} Zeile(n) gelesen, ` +
      `${String(bilanz.zeilenLeer)} leer, ${String(bilanz.zeilenUnlesbar)} unlesbar.`,
  ];

  if (bilanz.modus === 'ausfuehrung') {
    zeilen.push(
      `  ${String(bilanz.uplinksVerarbeitet)} Uplink(s) verarbeitet: ` +
        `${String(bilanz.messwerteGeschrieben)} Messwert(e) geschrieben, ` +
        `${String(bilanz.quarantaene)} in Quarantaene.`,
    );
    // Der Grund ist die eigentliche Auskunft: "300 in Quarantaene" allein
    // sagt nicht, ob ein Zaehler unbekannt ist oder die Werte unplausibel.
    for (const [grund, anzahl] of bilanz.quarantaeneJeGrund) {
      zeilen.push(`    ${grund}: ${String(anzahl)}`);
    }
  }

  if (bilanz.ersteUnlesbareZeilen.length > 0) {
    zeilen.push(`  Unlesbar ab Zeile: ${bilanz.ersteUnlesbareZeilen.map(String).join(', ')}`);
  }

  return `${zeilen.join('\n')}\n`;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((fehler: unknown) => {
    logger.error(fehler instanceof Error ? fehler.message : 'Unbekannter Fehler im Nachlauf.');
    process.exitCode = 1;
  });
