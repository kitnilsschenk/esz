import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TransactionHost } from '@nestjs-cls/transactional';
import { DemoRunnerModule } from './demo-runner.module';
import { DemoDatenService } from './demo-daten.service';
import { EndkundeService } from '../stammdaten/endkunde/endkunde.service';
import { SystemService } from '../stammdaten/system/system.service';
import { ZaehlerService } from '../stammdaten/zaehler/zaehler.service';
import { MesskanalService } from '../stammdaten/messkanal/messkanal.service';
import { MesskonzeptService } from '../stammdaten/messkonzept/messkonzept.service';
import { BerechnungslaufService } from '../berechnung/berechnungslauf.service';
import { MesswertVerdichtungService } from '../retention/messwert-verdichtung.service';
import { GeraeteerkennungService } from '../geraeteerkennung/geraeteerkennung.service';
import { NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';
import { PreflightService } from '../nachweis/preflight.service';
import { EinsparlaufService } from '../nachweis/einsparlauf.service';
import { NachweisExportService } from '../nachweis/export/nachweis-export.service';

/**
 * Der Demo-Datengenerator — die Stelle, an der aus einem leeren Schema ein
 * vorführbarer BAFA-Export wird.
 *
 * WARUM ES IHN GIBT
 * -----------------
 * Der Nachweis-Export war gebaut, getestet und grün — und hatte nie etwas
 * enthalten. Die Integrationstests legen Stammdaten an und lassen den Export
 * laufen, schreiben aber KEINE Messwerte: Die Rohdaten-Datei blieb leer, die
 * Einsparung stand auf `nicht_nachweisbar`. Geprüft war damit, dass der Export
 * durchläuft — nicht, dass er etwas ausweist.
 *
 * Dieser Befehl erzeugt den Bestand, an dem sich das zeigen lässt: zwei Jahre
 * Stundenwerte, daraus eine Baseline, ein Berechnungslauf, ein Einsparlauf und
 * am Ende CSV-Dateien mit Zeilen darin.
 *
 * ER SCHREIBT NUR IN EINE ENTWICKLUNGSUMGEBUNG
 * --------------------------------------------
 * `EDMS_ENV_CLASS` muss `dev` sein. Ein Generator, der versehentlich in einen
 * Produktivbestand schreibt, legt dort erfundene Endkunden an — und die sind
 * von echten hinterher nicht mehr zu unterscheiden.
 *
 * BEFEHL
 * ------
 *   node dist/demo/demo-main.js [--jahr=2026] [--einsparung=0.12] [--kennung=A1]
 */

const logger = new Logger('DemoDaten');

const GEBRAUCH = [
  'Gebrauch:',
  '  demo-main.js [--jahr=<JJJJ>] [--einsparung=<0..0.9>] [--kennung=<kurz>]',
  '',
  '  --jahr        Nachweisjahr; das Vorjahr traegt die Baseline. Default: Vorjahr.',
  '  --einsparung  Anteil, um den der Verbrauch im Nachweisjahr sinkt. Default: 0.12.',
  '  --kennung     Kuerzel fuer Namen und Codes, macht mehrere Laeufe unterscheidbar.',
].join('\n');

function argument(argv: readonly string[], name: string): string | undefined {
  const treffer = argv.find((wert) => wert.startsWith(`--${name}=`));
  return treffer?.slice(name.length + 3);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${GEBRAUCH}\n`);
    return 0;
  }

  const envKlasse = process.env['EDMS_ENV_CLASS'] ?? 'dev';
  if (envKlasse !== 'dev') {
    logger.error(
      `EDMS_ENV_CLASS ist "${envKlasse}". Der Demo-Generator schreibt ausschliesslich in eine ` +
        'Entwicklungsumgebung — erfundene Endkunden waeren in einem echten Bestand hinterher nicht ' +
        'mehr von echten zu unterscheiden.',
    );
    return 2;
  }

  const jetzt = new Date();
  const jahr = Number(argument(argv, 'jahr') ?? jetzt.getUTCFullYear() - 1);
  const einsparung = Number(argument(argv, 'einsparung') ?? '0.12');
  const kennung = argument(argv, 'kennung') ?? `${String(jahr)}-${String(Date.now()).slice(-5)}`;

  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    logger.error(`--jahr=${String(jahr)} ist kein plausibles Kalenderjahr.`);
    return 2;
  }
  if (!Number.isFinite(einsparung) || einsparung < 0 || einsparung > 0.9) {
    logger.error(`--einsparung=${String(einsparung)} liegt ausserhalb von 0 bis 0,9.`);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(DemoRunnerModule, {
    logger: ['warn', 'error', 'log'],
  });

  try {
    // `app.get()` loest auch Dienste auf, die ihr Modul nicht exportiert —
    // dasselbe Vorgehen wie in den Integrationstests. Die Modulgrenzen dafuer
    // zu oeffnen hiesse, sie fuer ein Entwicklungswerkzeug aufzuweichen.
    const service = new DemoDatenService({
      txHost: app.get(TransactionHost),
      endkunde: app.get(EndkundeService),
      system: app.get(SystemService),
      zaehler: app.get(ZaehlerService),
      messkanal: app.get(MesskanalService),
      messkonzept: app.get(MesskonzeptService),
      berechnung: app.get(BerechnungslaufService),
      verdichtung: app.get(MesswertVerdichtungService),
      geraeteerkennung: app.get(GeraeteerkennungService),
      foerderjahre: app.get(NachweisFoerderjahrRepository),
      preflight: app.get(PreflightService),
      einsparlauf: app.get(EinsparlaufService),
      export: app.get(NachweisExportService),
    });

    const ergebnis = await service.erzeuge({
      nachweisjahr: jahr,
      einsparungAnteil: einsparung,
      kennung,
    });

    const zeilenGesamt = ergebnis.dateien.reduce((summe, datei) => summe + datei.zeilen, 0);
    process.stdout.write(
      [
        '',
        '=== Demo-Bestand erzeugt ===',
        `Endkunde:        ${ergebnis.endkundeId}`,
        `Foerderjahr:     ${ergebnis.foerderjahrCode} (${ergebnis.foerderjahrId})`,
        `Berechnungslauf: ${ergebnis.berechnungslaufId}`,
        `Einsparlauf:     ${ergebnis.einsparlaufId}`,
        `Export:          ${ergebnis.exportId}`,
        `Messwerte:       ${ergebnis.messwerteGeschrieben.toLocaleString('de-DE')}`,
        `Tageswerte:      ${ergebnis.tageVerdichtet.toLocaleString('de-DE')}`,
        '',
        'Export-Dateien (Datenzeilen ohne Kopfzeile):',
        ...ergebnis.dateien.map((datei) => `  ${datei.dateiname.padEnd(34)} ${String(datei.zeilen).padStart(7)}`),
        '',
        `Summe Datenzeilen: ${String(zeilenGesamt)}`,
        '',
        // Der Umfang eines Foerderjahres bestimmt sich ueber die
        // Perioden-Ueberlappung, nicht ueber den Erzeuger. Ein zweiter Lauf
        // mit demselben --jahr holt die Endkunden des ersten mit in den
        // Export — richtig so, aber beim Vorfuehren ueberraschend.
        'Hinweis: Das Foerderjahr umfasst ALLE Berechnungslaeufe dieser Periode —',
        'auch die frueherer Demo-Laeufe mit demselben --jahr. Fuer einen Bestand mit',
        'genau einem Endkunden ein anderes --jahr waehlen oder das Schema neu aufsetzen.',
        '',
      ].join('\n'),
    );

    // Ein Export ohne eine einzige Datenzeile ist kein Erfolg, auch wenn jeder
    // Schritt durchgelaufen ist — genau dieser Zustand war der Anlass fuer
    // diesen Generator.
    if (zeilenGesamt === 0) {
      logger.error('Der Export enthaelt KEINE Datenzeile. Das ist ein Befund, kein Ergebnis.');
      return 1;
    }
    return 0;
  } finally {
    await app.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((fehler: unknown) => {
    logger.error(fehler instanceof Error ? fehler.message : String(fehler));
    if (fehler instanceof Error && fehler.stack !== undefined) {
      logger.error(fehler.stack);
    }
    process.exitCode = 1;
  });
