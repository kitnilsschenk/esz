import type { IngestQuelle } from '@edms/shared';
import { useIngestStatus } from '../../api/ingestBetrieb';
import { quarantaeneGrundLabel } from './ingestBetriebFormat';
import { formatiereRelativeZeit } from '../shared/relativeZeit';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

export interface IngestStatusKennzahl {
  readonly key: string;
  readonly label: string;
  /** Absolute Angabe, oder der Ersatztext, wenn es den Zeitpunkt nicht gibt. */
  readonly wert: string;
  /** „vor 3 Min." — leer, wenn es keinen Zeitpunkt gibt. */
  readonly relativ: string;
}

export interface IngestQuelleView {
  readonly quelleCode: string;
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly lebendig: boolean;
  readonly zustandLabel: string;
  readonly zustandBadgeVariante: 'success' | 'destructive';
  /** Warum nicht lebendig — leer, wenn alles in Ordnung ist. */
  readonly zustandHinweis: string;
  readonly herzschlagLabel: string;
  readonly herzschlagRelativ: string;
  /**
   * Hinweis zur gepflegten Konfiguration — leer, wenn alles zusammenpasst.
   *
   * Drei verschiedene Aussagen, ein Feld: Der Prozess läuft ohne gepflegte
   * Quelle, er läuft trotz deaktivierter Quelle, oder er fährt eine andere
   * Konfiguration als die gepflegte. Alle drei bedeuten dasselbe für den
   * Bedienenden — was er in der Verwaltung sieht, gilt für diesen Prozess
   * gerade NICHT.
   */
  readonly konfigurationHinweis: string;
}

/**
 * Passt der laufende Prozess zu dem, was gepflegt ist?
 *
 * Der Worker lädt seine Quelle NUR beim Start. Diese drei Fälle sind die,
 * in denen die Verwaltungsansicht etwas anderes zeigt als das, womit der
 * Prozess tatsächlich arbeitet — und ohne den Hinweis würde man ihr glauben.
 *
 * Die Reihenfolge ist die der Schwere: Ein deaktivierte Quelle, deren Worker
 * noch läuft, ist gravierender als eine geänderte Adresse; und ein Worker
 * ganz ohne gepflegte Quelle ist der Ausgangszustand, den man kennen muss,
 * bevor man über Abweichungen redet.
 */
function konfigurationHinweis(quelle: IngestQuelle): string {
  if (!quelle.gepflegt) {
    return t('stammdaten.ingestBetrieb.quellen.nichtGepflegt');
  }
  if (quelle.gepflegtInaktiv) {
    return t('stammdaten.ingestBetrieb.quellen.deaktiviertLaeuftNoch');
  }
  if (quelle.abweichendeFelder.length > 0) {
    return `${t('stammdaten.ingestBetrieb.quellen.abweichend')} ${quelle.abweichendeFelder.join(', ')}`;
  }
  return '';
}

export interface IngestGrundZeileView {
  readonly grund: string;
  readonly grundLabel: string;
  readonly anzahlLabel: string;
}

export interface IngestStatusView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly quellen: readonly IngestQuelleView[];
  /** `true`, wenn sich noch nie ein Worker gemeldet hat — dann läuft die Aufnahme gar nicht. */
  readonly keineQuellen: boolean;
  readonly kennzahlen: readonly IngestStatusKennzahl[];
  readonly quarantaeneGesamtLabel: string;
  readonly gruende: readonly IngestGrundZeileView[];
  /** `true`, wenn noch nie ein Messwert geschrieben wurde — dann ist die Aufnahme nie angelaufen. */
  readonly nochNieDatenEmpfangen: boolean;
}

const ZAHL_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

function anzahlLabel(anzahl: string): string {
  const zahl = Number(anzahl);
  return Number.isFinite(zahl) ? ZAHL_FORMAT.format(zahl) : anzahl;
}

/**
 * Anzeige-Modell des Ingest-Betriebszustands.
 *
 * **Die Antwort trägt keinen Verbindungszustand, und diese Ansicht erfindet
 * keinen.** Sie zeigt drei Zeitpunkte — wann zuletzt gemessen, geschrieben
 * und aussortiert wurde — jeweils absolut UND relativ. Die relative Angabe
 * ist die eigentlich betriebsrelevante: „vor 4 Std." bei einem Gerät, das
 * stündlich sendet, ist die Störungsmeldung. Eine Ampel „verbunden" wäre
 * geraten und im Zweifel beruhigend falsch.
 */
export function useIngestStatusView(): IngestStatusView {
  const query = useIngestStatus();
  const status = query.data;
  const keineDaten = t('stammdaten.ingestBetrieb.status.nochNie');

  const kennzahlen: readonly IngestStatusKennzahl[] = status
    ? [
        {
          key: 'letzteSchreibungAt',
          label: t('stammdaten.ingestBetrieb.status.letzteSchreibung'),
          wert: status.letzteSchreibungAt !== null ? formatiereZeitpunkt(status.letzteSchreibungAt) : keineDaten,
          relativ: status.letzteSchreibungAt !== null ? formatiereRelativeZeit(status.letzteSchreibungAt) : '',
        },
        {
          key: 'letzterMesswertAt',
          label: t('stammdaten.ingestBetrieb.status.letzterMesswert'),
          wert: status.letzterMesswertAt !== null ? formatiereZeitpunkt(status.letzterMesswertAt) : keineDaten,
          relativ: status.letzterMesswertAt !== null ? formatiereRelativeZeit(status.letzterMesswertAt) : '',
        },
        {
          key: 'letzteQuarantaeneAt',
          label: t('stammdaten.ingestBetrieb.status.letzteQuarantaene'),
          wert: status.letzteQuarantaeneAt !== null ? formatiereZeitpunkt(status.letzteQuarantaeneAt) : keineDaten,
          relativ: status.letzteQuarantaeneAt !== null ? formatiereRelativeZeit(status.letzteQuarantaeneAt) : '',
        },
      ]
    : [];

  const quellen: readonly IngestQuelleView[] = (status?.quellen ?? []).map((quelle) => ({
    quelleCode: quelle.quelleCode,
    brokerHost: quelle.brokerHost,
    topic: quelle.topic,
    clientId: quelle.clientId,
    lebendig: quelle.lebendig,
    zustandLabel: quelle.lebendig
      ? t('stammdaten.ingestBetrieb.quellen.lebendig')
      : t('stammdaten.ingestBetrieb.quellen.nichtLebendig'),
    zustandBadgeVariante: quelle.lebendig ? 'success' : 'destructive',
    // Zwei verschiedene Störungen, zwei verschiedene Handgriffe: Meldet der
    // Worker selbst, dass die Verbindung nicht steht, ist der Broker das
    // Problem. Schweigt er, ist es der Prozess.
    zustandHinweis: quelle.lebendig
      ? ''
      : quelle.verbunden
        ? t('stammdaten.ingestBetrieb.quellen.herzschlagVeraltet')
        : t('stammdaten.ingestBetrieb.quellen.nichtVerbunden'),
    konfigurationHinweis: konfigurationHinweis(quelle),
    herzschlagLabel: formatiereZeitpunkt(quelle.letzterHerzschlagAt),
    herzschlagRelativ: formatiereRelativeZeit(quelle.letzterHerzschlagAt),
  }));

  return {
    isPending: query.isPending,
    isError: query.isError,
    quellen,
    keineQuellen: status !== undefined && status.quellen.length === 0,
    kennzahlen,
    quarantaeneGesamtLabel: status !== undefined ? anzahlLabel(status.quarantaeneGesamt) : '',
    gruende: (status?.quarantaeneJeGrund ?? []).map((eintrag) => ({
      grund: eintrag.grund,
      grundLabel: quarantaeneGrundLabel(eintrag.grund),
      anzahlLabel: anzahlLabel(eintrag.anzahl),
    })),
    nochNieDatenEmpfangen: status !== undefined && status.letzteSchreibungAt === null,
  };
}
