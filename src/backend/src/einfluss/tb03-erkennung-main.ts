import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { Tb03ErkennungRunnerModule } from './tb03-erkennung-runner.module';
import { Tb03ErkennungService } from './tb03-erkennung.service';

/**
 * Der TB-03-Erkennungslauf — die Stelle, an der die Schwellwertüberwachung
 * tatsächlich startet.
 *
 * WARUM ES IHN GIBT, UND WARUM ER KEIN DATENBANK-JOB IST
 * ------------------------------------------------------
 * Die Regeln von TB-03 haben eine Mindestdauer. Ein Intervall, das offen
 * bleibt, überschreitet sie, ohne dass irgendjemand etwas schreibt — ein
 * Haken am Erfassungs-Endpunkt sähe genau diese Fälle nie. Es braucht also
 * etwas, das von sich aus über die Zeit schaut.
 *
 * Naheliegend wäre `pg_cron` gewesen. Die Extension ist im Ziel-Image aber
 * nicht vorhanden und verlangt `shared_preload_libraries` plus Neustart
 * (V0012 beschreibt das ausführlich), und `cron.schedule` ist ein
 * cluster-weiter Seiteneffekt, der in einer Migration nichts zu suchen hat.
 * Dieses Repo hat für Betriebsaufgaben ein anderes, funktionierendes Muster:
 * einen eigenen Prozess mit eigenem, schmalem Modulschnitt. Die monatliche
 * Kadenz kommt damit von außen — von dem, was auch die übrigen Läufe startet.
 *
 * PROBELAUF IST DER STANDARD (A24)
 * --------------------------------
 * Ohne `--ausfuehren` wird gezählt und gemeldet, aber kein Befund
 * geschrieben. Dieselbe Linie wie beim Retention-Runner und beim
 * Migrations-Runner: Bevor zum ersten Mal Nachweisartefakte entstehen, muss
 * jemand sehen können, WIE VIELE entstünden. Das ist hier besonders
 * wichtig, weil `einfluss.befund` weder UPDATE noch DELETE kennt — ein zu
 * früh geschriebener Befund bleibt.
 *
 * Das Einsicht-Ereignis (A19a) schreibt AUCH der Probelauf: Er liest
 * denselben Klartextbestand, und die Auditpflicht hängt am Lesen, nicht am
 * Schreiben.
 *
 * BEFEHL
 * ------
 *   node dist/einfluss/tb03-erkennung-main.js [--ausfuehren]
 *
 * Voraussetzung ist `EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL` — die eigene,
 * least-privilege Verbindung als `edms_einfluss_erkennung` (V0079). Ohne
 * sie startet der Lauf nicht; ein Rückfall auf `DATABASE_URL` wäre genau
 * die Aufweichung, die diese Rolle verhindern soll.
 */

const logger = new Logger('Tb03Erkennung');

const GEBRAUCH = [
  'Gebrauch:',
  '  tb03-erkennung-main.js [--ausfuehren]',
  '',
  'Ohne --ausfuehren laeuft die Erkennung als Probelauf (zaehlt, schreibt keine Befunde).',
  'Das Einsicht-Audit-Ereignis wird in beiden Faellen geschrieben.',
].join('\n');

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${GEBRAUCH}\n`);
    return 0;
  }

  const unbekannt = argv.filter((a) => a !== '--ausfuehren');
  if (unbekannt.length > 0) {
    logger.error(`Unbekannte Argumente: ${unbekannt.join(' ')}`);
    process.stdout.write(`${GEBRAUCH}\n`);
    return 2;
  }

  const ausfuehren = argv.includes('--ausfuehren');

  const app = await NestFactory.createApplicationContext(Tb03ErkennungRunnerModule, {
    // Das Ergebnis geht auf stdout und soll nicht zwischen Bootstrap-Meldungen untergehen.
    logger: ['warn', 'error'],
  });

  try {
    // `@Transactional()` braucht einen CLS-Kontext. Im HTTP-Betrieb stellt ihn
    // der Transaktions-Interceptor bereit; hier gibt es keinen Request.
    const cls = app.get(ClsService);
    const service = app.get(Tb03ErkennungService);

    return await cls.run(async () => {
      const ergebnis = ausfuehren ? await service.fuehreAus() : await service.probelauf();

      // stdout, NICHT der Logger: Das Ergebnis eines Laufs ist die Ausgabe des
      // Kommandos, keine Protokollzeile.
      process.stdout.write(
        `TB-03-Erkennung (${ergebnis.modus}, Laufmonat ${ergebnis.laufMonat}): ` +
          `${ergebnis.gepruefteSysteme} System(e) geprueft, ` +
          `${ergebnis.kandidaten} Befund(e) erkannt, ` +
          `${ergebnis.geschrieben} geschrieben, ` +
          `${ergebnis.bereitsVorhanden} bereits vorhanden.\n`,
      );

      // Was der Lauf STEHEN GELASSEN hat — ohne diese Zeilen waere ein
      // blockierter Lauf von einem leeren nicht zu unterscheiden.
      process.stdout.write(
        `Nicht geprueft: ${ergebnis.uebersprungenNichtAktiv} System(e) nicht aktiver Endkunden (A18), ` +
          `${ergebnis.uebersprungenOhneAnker} ohne Baseline-Periode (A16).\n`,
      );

      if (ergebnis.nichtUeberwachteGroessen.length > 0) {
        // A25 -- diese Zeile ist eine Auflage, keine Höflichkeit: Eine
        // Katalog-Groesse ohne Schwellwert ist NICHT MASCHINELL UEBERWACHT.
        // Sie darf nie als "nie ueberschritten" gelesen werden.
        process.stdout.write(
          `NICHT MASCHINELL UEBERWACHT (keine Schwelle im Katalog): ` +
            `${ergebnis.nichtUeberwachteGroessen.join(', ')} — ` +
            `das bedeutet NICHT "nie ueberschritten".\n`,
        );
      }

      for (const skip of ergebnis.skips) {
        process.stdout.write(`Ausgesetzt: System ${skip.systemId}, ${skip.groesseCode} — ${skip.grund}.\n`);
      }

      return 0;
    });
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
    process.exitCode = 1;
  });
