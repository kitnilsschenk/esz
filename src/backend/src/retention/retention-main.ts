import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { RetentionRunnerModule } from './retention-runner.module';
import { QuarantaeneRetentionService } from './quarantaene-retention.service';
import { MesswertVerdichtungService } from './messwert-verdichtung.service';

/**
 * Der Retention-Runner — die Stelle, an der die Löschläufe tatsächlich
 * starten.
 *
 * WARUM ES IHN GIBT
 * -----------------
 * Der Quarantäne-Lauf war seit V0048 gebaut, geprüft und im Modul
 * registriert — und **hatte keinen Aufrufer**. Keine Route, kein Scheduler,
 * kein Kommando. Er war damit vollständig wirkungslos: Ein Retentionlauf, den
 * niemand starten kann, löscht nichts, und die Auflage, die er erfüllen soll,
 * bleibt unerfüllt. Dasselbe hätte für die Verdichtung gegolten.
 *
 * Aufgefallen ist das beim Verdrahten der Verdichtung, nicht bei ihrer
 * Prüfung: Alle Tests waren grün, weil sie den Dienst direkt aufrufen. Die
 * Lücke lag zwischen Dienst und Betrieb.
 *
 * PROBELAUF IST DER STANDARD
 * --------------------------
 * Ohne `--ausfuehren` zählt jeder Befehl nur. Das ist dieselbe Linie wie beim
 * `--yes` des Migrations-Runners und beim Bestätigungsargument des
 * Quarantäne-Dienstes: Bevor zum ersten Mal gelöscht wird, muss jemand sehen
 * können, WIE VIEL gelöscht würde. Eine unerwartet große Zahl ist ein Befund,
 * kein Grund weiterzumachen.
 *
 * WAS DIESER RUNNER NICHT DARF
 * ----------------------------
 * Die F2-gebundenen Löschläufe (`analytics.*`, `einfluss.*`, `nachweis.*`,
 * `audit.*`, Rohmesswerte Stufe B) stehen weiter unter der Ausführungssperre
 * des `compliance-director` — bis der Aktenvermerk „Fristfeststellung F2"
 * (Auflage AW-15) vorliegt. Sie sind hier nicht implementiert, und das ist
 * kein Versehen: Ein Kommando, das man nur nicht aufrufen soll, ist eine
 * schwächere Sicherung als eines, das es nicht gibt.
 *
 * BEFEHLE
 * -------
 *   node dist/retention/retention-main.js quarantaene [--ausfuehren]
 *   node dist/retention/retention-main.js verdichtung --von=YYYY-MM-DD --bis=YYYY-MM-DD [--ausfuehren]
 *
 * `--bis` ist HALBOFFEN: der erste Tag, der NICHT mehr verdichtet wird.
 */

const logger = new Logger('RetentionRunner');

const GEBRAUCH = [
  'Gebrauch:',
  '  retention-main.js quarantaene [--ausfuehren]',
  '  retention-main.js verdichtung --von=YYYY-MM-DD --bis=YYYY-MM-DD [--ausfuehren]',
  '',
  'Ohne --ausfuehren laeuft jeder Befehl als Probelauf (zaehlt, aendert nichts).',
  '--bis ist halboffen: der erste Tag, der NICHT mehr verdichtet wird.',
].join('\n');

function argWert(argv: readonly string[], name: string): string | undefined {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer?.slice(name.length + 3);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const befehl = argv[0];
  const ausfuehren = argv.includes('--ausfuehren');

  if (befehl === undefined || befehl === '--help' || befehl === '-h') {
    process.stdout.write(`${GEBRAUCH}\n`);
    return befehl === undefined ? 2 : 0;
  }

  const app = await NestFactory.createApplicationContext(RetentionRunnerModule, {
    // Der Runner schreibt sein Ergebnis selbst auf stdout — der Nest-Logger
    // bleibt auf Warnungen und Fehler beschraenkt, damit das Ergebnis eines
    // Laufs nicht zwischen Bootstrap-Meldungen untergeht.
    logger: ['warn', 'error'],
  });

  try {
    // Ein CLS-Kontext ist Voraussetzung fuer `@Transactional()`. Im
    // HTTP-Betrieb stellt ihn der globale Transaktions-Interceptor bereit;
    // hier gibt es keinen Request, also oeffnet ihn der Runner selbst.
    const cls = app.get(ClsService);

    switch (befehl) {
      case 'quarantaene':
        return await cls.run(() => fuehreQuarantaeneAus(app.get(QuarantaeneRetentionService), ausfuehren));
      case 'verdichtung':
        return await cls.run(() =>
          fuehreVerdichtungAus(app.get(MesswertVerdichtungService), argv, ausfuehren),
        );
      default:
        logger.error(`Unbekannter Befehl: ${befehl}`);
        process.stdout.write(`${GEBRAUCH}\n`);
        return 2;
    }
  } finally {
    await app.close();
  }
}

async function fuehreQuarantaeneAus(
  service: QuarantaeneRetentionService,
  ausfuehren: boolean,
): Promise<number> {
  const ergebnis = ausfuehren ? await service.fuehreAus(true) : await service.probelauf();

  // stdout, NICHT der Logger: Das Ergebnis eines Laufs ist die Ausgabe des
  // Kommandos, keine Protokollzeile. Ein Betreiber, der `... | tee` nutzt,
  // soll es bekommen, ohne die Log-Level zu kennen.
  process.stdout.write(
    `Quarantaene-Retention (${ergebnis.modus}): ${ergebnis.anzahlGenullt} Blind-Index-Nullung(en), ` +
      `${ergebnis.anzahlGeloescht} Zeile(n) geloescht, ` +
      `${ergebnis.uebersprungenOffenerVorgang} wegen offenem Ausfall-Vorgang stehen gelassen.\n`,
  );

  // Die Zahl der uebersprungenen Zeilen ist kein Fehler, aber ein Befund: Sie
  // macht sichtbar, dass der Lauf etwas STEHEN GELASSEN hat. Ohne sie waere
  // ein blockierter Lauf von einem leeren nicht zu unterscheiden.
  return 0;
}

async function fuehreVerdichtungAus(
  service: MesswertVerdichtungService,
  argv: readonly string[],
  ausfuehren: boolean,
): Promise<number> {
  const vonTag = argWert(argv, 'von');
  const bisTag = argWert(argv, 'bis');

  if (vonTag === undefined || bisTag === undefined) {
    logger.error('verdichtung braucht --von=YYYY-MM-DD und --bis=YYYY-MM-DD.');
    process.stdout.write(`${GEBRAUCH}\n`);
    return 2;
  }

  // Der Dienst arbeitet je Durchgang hoechstens einen Kanal-Batch ab
  // (Batch-Grenze, `.claude/rules/database-migrations.md`). Die Wiederholung
  // ist Sache des Aufrufers — hier.
  let nachKanalKey = 0;
  let durchgaenge = 0;
  let kanaele = 0;
  let tageszeilen = 0;

  for (;;) {
    const optionen = { vonTag, bisTag, nachKanalKey };
    const ergebnis = ausfuehren ? await service.fuehreAus(optionen) : await service.probelauf(optionen);

    durchgaenge += 1;
    kanaele += ergebnis.anzahlKanaele;
    tageszeilen += ergebnis.anzahlTageszeilen;

    if (!ergebnis.weitere) {
      process.stdout.write(
        `Verdichtung (${ergebnis.modus}) ${vonTag} bis <${bisTag}, ${ergebnis.zeitzone}: ` +
          `${kanaele} Messkanal/-kanaele in ${durchgaenge} Durchgang/Durchgaengen, ` +
          `${tageszeilen} Tageszeile(n).\n`,
      );
      return 0;
    }

    nachKanalKey = ergebnis.letzterKanalKey;
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    logger.error(`Retention-Runner abgebrochen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`);
    process.exit(1);
  });
