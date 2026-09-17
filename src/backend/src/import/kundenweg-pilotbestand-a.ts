import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { SecurityContext } from '../common/security/security-context';
import { NutzerinformationService } from '../nutzerinfo/nutzerinformation.service';
import { PortalZugangService } from '../portal/portal-zugang.service';
import { KundenwegRunnerModule } from './kundenweg-runner.module';

/**
 * Der Kundenweg für den Pilotbestand A: monatliche Informationen erzeugen
 * und einen Portal-Zugang ausgeben.
 *
 * Beides sind Betriebsvorgänge, die sonst in der Oberfläche stattfinden —
 * hier zusammengezogen, um den Weg an einem echten Bestand einmal zu gehen.
 * Der Zugangscode erscheint dabei GENAU EINMAL auf der Ausgabe: Er wird
 * nirgends gespeichert und ist nicht erneut abrufbar (s.
 * `PortalZugangService`).
 */

const logger = new Logger('KundenwegPilotbestandA');

const KENNUNG = 'Pilotbestand A';

/**
 * Die Monate, für die informiert wird.
 *
 * Bewusst innerhalb des letzten Förderjahres und OHNE dessen Randmonate: Ein
 * angeschnittener Oktober liefert der monatlichen Information keinen
 * Kandidaten mehr (s. `findKandidatenFuerMonat`) — richtig so, aber für eine
 * Vorführung wenig ergiebig.
 */
const MONATE = ['2023-06-01', '2023-07-01', '2023-08-01', '2023-09-01'] as const;

const subject: SecurityContext = {
  sub: 'kundenweg-pilotbestand-a',
  actorTyp: 'benutzer',
  roles: ['betrieb'],
  azp: 'edms-bff',
};

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(KundenwegRunnerModule, {
    logger: ['log', 'warn', 'error'],
  });
  const txHost = app.get<TransactionHost<TransactionalAdapterTypeOrm>>(TransactionHost);
  const tx = <T>(fn: () => Promise<T>): Promise<T> => txHost.withTransaction(Propagation.Required, fn);

  try {
    const zeilen: unknown = await tx(() =>
      txHost.tx.query('SELECT endkunde_id FROM energy.system WHERE bezeichnung = $1', [`${KENNUNG} — Hauptzaehler`]),
    );
    const endkundeId = (zeilen as { endkunde_id: string }[])[0]?.endkunde_id;
    if (endkundeId === undefined) {
      logger.error(`Bestand '${KENNUNG}' nicht gefunden — erst importieren und aufbauen.`);
      return 2;
    }

    // --- 1. Monatliche Informationen (TB-06) --------------------------
    for (const monat of MONATE) {
      const ergebnis = await tx(() => app.get(NutzerinformationService).fuehreAus(monat, new Date()));
      logger.log(
        `${monat}: ${String(ergebnis.anzahlErzeugt)} erzeugt, ` +
          `${String(ergebnis.ohneBerechnung)} ohne Berechnung, ` +
          `${String(ergebnis.uebersprungenWiderspruch)} mit Widerspruch, ` +
          `${String(ergebnis.uebersprungenGesperrt)} gesperrt.`,
      );
    }

    const eigene: unknown = await tx(() =>
      txHost.tx.query(
        `SELECT monat, energietraeger, round(delta_kwh) AS delta
           FROM nutzerinfo.information WHERE endkunde_id = $1 ORDER BY monat, energietraeger`,
        [endkundeId],
      ),
    );
    for (const zeile of eigene as { monat: Date; energietraeger: string; delta: string }[]) {
      logger.log(`  ${new Date(zeile.monat).toISOString().slice(0, 7)} ${zeile.energietraeger}: ${zeile.delta} kWh`);
    }

    // --- 2. Portal-Zugang ---------------------------------------------
    const ausgabe = await tx(() => app.get(PortalZugangService).gibCodeAus(endkundeId, subject, true));
    logger.log('');
    logger.log('=========================================================');
    logger.log(`  Kennung:     ${ausgabe.kennung}`);
    logger.log(`  Zugangscode: ${ausgabe.code}`);
    logger.log(`  Gueltig bis: ${ausgabe.gueltigBis.slice(0, 10)}`);
    logger.log(`  Portal:      ${ausgabe.portalUrl}${ausgabe.portalUrlIstStandard ? '  (Dev-Vorgabe!)' : ''}`);
    logger.log(`  Brief:       ${String(ausgabe.brief.length)} Zeichen druckfertiges HTML`);
    logger.log('=========================================================');
    logger.log('Der Code steht NUR hier — er ist nirgends gespeichert.');

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
