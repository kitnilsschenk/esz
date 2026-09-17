import type { IngestQuelleGeheimnisFeld, IngestQuelleKonfig, TlsModus } from '@edms/shared';
import { useIngestQuellen } from '../../api/ingestQuelle';
import { formatiereKalenderdatum, formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';
import type { BadgeVariante } from '../../../nachweis/hooks/nachweisFormat';

export interface IngestQuelleZeileView {
  readonly id: string;
  readonly quelleCode: string;
  readonly bezeichnung: string;
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly tlsLabel: string;
  readonly tlsBadgeVariante: BadgeVariante;
  readonly statusLabel: string;
  readonly statusBadgeVariante: BadgeVariante;
  readonly istAktiv: boolean;
  /** „Benutzername, Passwort" — oder der Hinweis, dass nichts hinterlegt ist. */
  readonly geheimnisseLabel: string;
  readonly notiz: string;
  readonly geaendertLabel: string;
  /** Text zum Zertifikats-Ablauf — leer, wenn keins hinterlegt ist. */
  readonly zertifikatLabel: string;
  readonly zertifikatBadgeVariante: BadgeVariante;
  /** `true`, sobald das Zertifikat abgelaufen ist oder bald abläuft. */
  readonly zertifikatWarnt: boolean;
}

export interface IngestQuellenView {
  readonly items: readonly IngestQuelleZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  readonly istLeer: boolean;
  /** `true`, sobald mindestens ein Zertifikat abgelaufen ist oder bald abläuft. */
  readonly zeigeZertifikatHinweis: boolean;
}

/**
 * Ab wann vor einem ablaufenden Zertifikat gewarnt wird.
 *
 * 30 Tage, weil ADR-0005 §17 für den produktiven Pfad Zertifikate mit
 * höchstens 90 Tagen Laufzeit verlangt: Ein Drittel der Laufzeit ist genug
 * Vorlauf, um ein neues zu beschaffen, und selten genug, dass die Warnung
 * nicht zum Dauerzustand wird — eine Warnung, die immer steht, liest
 * irgendwann niemand mehr.
 */
export const ZERTIFIKAT_WARNUNG_TAGE = 30;

interface ZertifikatAnzeige {
  readonly zertifikatLabel: string;
  readonly zertifikatBadgeVariante: BadgeVariante;
  readonly zertifikatWarnt: boolean;
}

/**
 * Der Zustand der hinterlegten Zertifikate in einem Satz.
 *
 * **Bewertet wird das FRÜHESTE Ablaufdatum beider Zertifikate.** Zuerst stand
 * hier nur das Client-Zertifikat — das war ein Denkfehler: Läuft das
 * CA-Zertifikat ab, bricht die Vertrauenskette zum Broker genauso, und die
 * Verbindung kommt genauso wenig zustande. Für den Betrieb zählt, wann das
 * ERSTE von beiden die Aufnahme stilllegt; welches es war, steht beim
 * Bearbeiten der Quelle.
 */
export function zertifikatAnzeige(
  gueltigBisWerte: readonly (string | null)[],
  jetzt: Date = new Date(),
): ZertifikatAnzeige {
  const vorhanden = gueltigBisWerte.filter((wert): wert is string => wert !== null);
  if (vorhanden.length === 0) {
    return { zertifikatLabel: '', zertifikatBadgeVariante: 'outline', zertifikatWarnt: false };
  }

  const gueltigBis = vorhanden.reduce((frueheste, kandidat) =>
    new Date(kandidat).getTime() < new Date(frueheste).getTime() ? kandidat : frueheste,
  );
  const bis = new Date(gueltigBis);
  const tage = Math.floor((bis.getTime() - jetzt.getTime()) / 86_400_000);

  if (tage < 0) {
    return {
      zertifikatLabel: t('stammdaten.ingestQuelle.tabelle.zertifikatAbgelaufen'),
      zertifikatBadgeVariante: 'destructive',
      zertifikatWarnt: true,
    };
  }
  if (tage <= ZERTIFIKAT_WARNUNG_TAGE) {
    return {
      // Die Tageszahl steht im Text, weil „läuft bald ab" allein nicht sagt,
      // ob es um morgen oder um vier Wochen geht.
      zertifikatLabel: `${t('stammdaten.ingestQuelle.tabelle.zertifikatLaeuftAb')} ${String(tage)} ${t('stammdaten.ingestQuelle.tabelle.tage')}`,
      zertifikatBadgeVariante: 'warning',
      zertifikatWarnt: true,
    };
  }
  return {
    zertifikatLabel: `${t('stammdaten.ingestQuelle.tabelle.zertifikatGueltigBis')} ${formatiereKalenderdatum(gueltigBis.slice(0, 10))}`,
    zertifikatBadgeVariante: 'success',
    zertifikatWarnt: false,
  };
}

export function tlsLabel(modus: TlsModus): string {
  return t(`stammdaten.ingestQuelle.enums.tlsModus.${modus}`);
}

function geheimnisLabel(feld: IngestQuelleGeheimnisFeld): string {
  return t(`stammdaten.ingestQuelle.enums.geheimnis.${feld}`);
}

/**
 * Anzeige-Modell der Datenquellen.
 *
 * **`kein_tls` wird als Warnung ausgezeichnet, nicht als neutraler Zustand.**
 * Unverschlüsselt zu einem Broker zu sprechen ist für den lokalen Dev-Stack
 * vertretbar und sonst nirgends; ein graues Abzeichen daneben ließe das wie
 * eine gleichwertige Wahl aussehen.
 *
 * Die hinterlegten Geheimnisse erscheinen als AUFZÄHLUNG ihrer Feldnamen —
 * die Werte gibt der Server nicht heraus, und diese Ansicht fragt auch nicht
 * danach. „Nichts hinterlegt" ist dabei eine eigene Aussage und nicht als
 * leere Zelle dargestellt: Bei einem Broker, der Anmeldung verlangt, ist
 * genau das die Fehlerursache.
 */
export function useIngestQuellenView(): IngestQuellenView {
  const query = useIngestQuellen();

  const items: readonly IngestQuelleZeileView[] = (query.data ?? []).map((quelle: IngestQuelleKonfig) => ({
    id: quelle.id,
    quelleCode: quelle.quelleCode,
    bezeichnung: quelle.bezeichnung,
    brokerHost: quelle.brokerHost,
    topic: quelle.topic,
    clientId: quelle.clientId,
    tlsLabel: tlsLabel(quelle.tlsModus),
    tlsBadgeVariante: quelle.tlsModus === 'kein_tls' ? 'warning' : 'success',
    statusLabel: t(`stammdaten.ingestQuelle.enums.status.${quelle.status}`),
    statusBadgeVariante: quelle.status === 'aktiv' ? 'success' : 'outline',
    istAktiv: quelle.status === 'aktiv',
    geheimnisseLabel:
      quelle.hinterlegteGeheimnisse.length > 0
        ? quelle.hinterlegteGeheimnisse.map(geheimnisLabel).join(', ')
        : t('stammdaten.ingestQuelle.tabelle.keineGeheimnisse'),
    notiz: quelle.notiz ?? '',
    geaendertLabel: formatiereZeitpunkt(quelle.updatedAt),
    ...zertifikatAnzeige([quelle.clientZertifikatGueltigBis, quelle.caZertifikatGueltigBis]),
  }));

  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
    ladeFehlerMeldung: t('stammdaten.ingestQuelle.tabelle.ladeFehler'),
    istLeer: !query.isPending && !query.isError && items.length === 0,
    zeigeZertifikatHinweis: items.some((zeile) => zeile.zertifikatWarnt),
  };
}
