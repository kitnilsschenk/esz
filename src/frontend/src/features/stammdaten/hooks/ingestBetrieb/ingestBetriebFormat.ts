// Reine Aufbereitungsfunktionen der Ingest-Betriebssicht — ohne React-Bezug.

import type { IngestQuarantaeneGrund } from '@edms/shared';
import { t } from '../../../../shared/i18n/t';

export function quarantaeneGrundLabel(grund: IngestQuarantaeneGrund): string {
  return t(`stammdaten.ingestBetrieb.gruende.${grund}.titel`);
}

/**
 * Zu jedem Grund der nächste Handgriff.
 *
 * Der Unterschied zwischen einem Protokoll und einem Arbeitsvorrat: Ein
 * Protokoll sagt, was passiert ist. Hier steht, was zu tun ist. „devEUI
 * unbekannt" ist für jemanden, der gerade einen Zähler anschließt, keine
 * Information — „das Gerät sendet, ist aber keinem Zähler zugeordnet" ist
 * eine.
 */
export function quarantaeneGrundHinweis(grund: IngestQuarantaeneGrund): string {
  return t(`stammdaten.ingestBetrieb.gruende.${grund}.hinweis`);
}
