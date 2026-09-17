import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConsentVorflugService } from './consent-vorflug.service';
import { ConsentVorflugRunnerModule } from './consent-vorflug-runner.module';

/**
 * Der Vorflug-Check des Ingest-Gates (ADR-0012 Stufe C, Auflage C-12).
 *
 * WOZU
 * ----
 * `EDMS_INGEST_CONSENT_ENFORCEMENT=true` wirkt sofort: Ab dem Umlegen
 * schreibt der Worker für jeden Zähler ohne wirksame Rechtsgrundlage nichts
 * mehr. Ohne vorherige Zählung merkt der Betrieb das erst daran, dass
 * Messwerte ausbleiben — und dann ist „liegt es am Gate oder an der Technik"
 * genau die Frage, die sich am schwersten beantworten lässt.
 *
 * Dieser Lauf beantwortet sie vorher.
 *
 * WARUM ER HEUTE MIT HOHER WAHRSCHEINLICHKEIT ETWAS FINDET
 * --------------------------------------------------------
 * `consent.einwilligung` verlangt eine freigegebene `consent.text_version`,
 * und die Texte stehen noch auf Entwurf (V-8d). Es kann derzeit also gar
 * keine wirksame Anschlussnutzer-Einwilligung geben; für jeden Zähler mit
 * aktivem Nutzungsverhältnis liefert das Gate `false`. Das ist korrektes
 * Fail-closed-Verhalten — aber wer den Schalter ohne diesen Lauf umlegt, legt
 * unter Umständen den halben Bestand still.
 *
 * ER AENDERT NICHTS
 * -----------------
 * Nur Lesen. Keine Metrik, kein Verwurf-Aggregat, kein Audit-Ereignis, kein
 * geschriebener Messwert. Der Lauf ist eine Frage, keine Handlung — und
 * deshalb gibt es hier auch kein `--ausfuehren` wie bei den übrigen Runnern.
 *
 * BEFEHL
 * ------
 *   node dist/ingest-worker/consent-vorflug-main.js [--zaehler-nennen]
 *
 * Voraussetzung ist `EDMS_INGEST_DATABASE_URL` — dieselbe least-privilege
 * Verbindung, die auch der Worker benutzt. Das ist Absicht: Der Vorflug soll
 * GENAU das sehen, was der Worker später sehen wird, nicht mehr.
 */

const logger = new Logger('ConsentVorflug');

const GEBRAUCH = [
  'Gebrauch:',
  '  consent-vorflug-main.js [--zaehler-nennen]',
  '',
  'Prueft fuer JEDEN Zaehler, ob das Ingest-Gate ihn durchliesse, und zaehlt.',
  'Aendert nichts.',
  '',
  '  --zaehler-nennen   Nennt zusaetzlich die Kennungen der abgewiesenen Zaehler.',
  '                     Standardmaessig AUS: Die Liste sagt, fuer welche',
  '                     Messstellen keine Rechtsgrundlage vorliegt -- eine',
  '                     Aussage ueber Personen, nicht ueber Geraete. Sie gehoert',
  '                     auf den Bildschirm dessen, der die Luecke schliesst,',
  '                     nicht in ein Log-Aggregat.',
].join('\n');

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${GEBRAUCH}\n`);
    return 0;
  }

  const unbekannt = argv.filter((a) => a !== '--zaehler-nennen');
  if (unbekannt.length > 0) {
    logger.error(`Unbekannte Argumente: ${unbekannt.join(' ')}`);
    process.stdout.write(`${GEBRAUCH}\n`);
    return 2;
  }

  const zaehlerNennen = argv.includes('--zaehler-nennen');

  const app = await NestFactory.createApplicationContext(ConsentVorflugRunnerModule, {
    // Das Ergebnis geht auf stdout und soll nicht zwischen Bootstrap-Meldungen untergehen.
    logger: ['warn', 'error'],
  });

  try {
    const ergebnis = await app.get(ConsentVorflugService).pruefe(zaehlerNennen);

    // stdout, NICHT der Logger: Das Ergebnis eines Laufs ist die Ausgabe des
    // Kommandos, keine Protokollzeile.
    process.stdout.write(
      `Ingest-Gate-Vorflug: ${String(ergebnis.zaehlerGesamt)} Zaehler geprueft, ` +
        `${String(ergebnis.wuerdeDurchlassen)} wuerden durchlaufen, ` +
        `${String(ergebnis.wuerdeVerwerfen)} wuerden abgewiesen.\n`,
    );

    if (ergebnis.wuerdeVerwerfen > 0) {
      process.stdout.write(
        'ACHTUNG: Beim Umlegen von EDMS_INGEST_CONSENT_ENFORCEMENT wuerden fuer diese\n' +
          'Zaehler ab sofort KEINE Messwerte mehr geschrieben. Der Verwurf ist beabsichtigt\n' +
          '(fail-closed), aber er sollte eine Entscheidung sein und keine Ueberraschung.\n',
      );
      if (zaehlerNennen) {
        process.stdout.write(`Abgewiesen wuerden:\n${ergebnis.verworfeneZaehlerIds.join('\n')}\n`);
      } else {
        process.stdout.write('Mit --zaehler-nennen werden die betroffenen Kennungen ausgegeben.\n');
      }
    }

    // Exit 0 auch bei Abweisungen: Der Lauf hat seine Arbeit getan. Ein
    // Fehlercode waere hier irrefuehrend -- er wuerde einen Defekt melden, wo
    // ein Befund steht.
    return 0;
  } finally {
    await app.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : 'Unbekannter Fehler im Vorflug-Check');
    process.exitCode = 1;
  });
