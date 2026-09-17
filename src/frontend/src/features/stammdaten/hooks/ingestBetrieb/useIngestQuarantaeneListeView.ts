import { useState } from 'react';
import type { IngestQuarantaeneGrund } from '@edms/shared';
import { useIngestQuarantaeneListe } from '../../api/ingestBetrieb';
import { kurzId } from '../../components/shared';
import { quarantaeneGrundHinweis, quarantaeneGrundLabel } from './ingestBetriebFormat';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

export interface IngestQuarantaeneZeileView {
  readonly id: string;
  readonly grund: IngestQuarantaeneGrund;
  readonly grundLabel: string;
  readonly grundHinweis: string;
  readonly zaehlerIdLabel: string;
  /** Ziel für „Zähler öffnen" — `undefined`, wenn das Gerät nicht aufgelöst werden konnte. */
  readonly zaehlerId: string | undefined;
  readonly fPortLabel: string;
  /** Netzserver, der die Nachricht empfangen hat — bei mehreren Netzen der erste Handgriff. */
  readonly quelleLabel: string;
  /** Gekürzte Application-Kennung des Netzservers; beim Betreiber ein Gebäude. */
  readonly applicationLabel: string;
  readonly topicRedacted: string;
  readonly empfangenAtLabel: string;
  /**
   * Die Messgrößen, die der betroffene Zähler tatsächlich führt — leer, wenn
   * kein Zähler aufgelöst werden konnte.
   *
   * Steht nur bei `kanal_unbekannt`: Dort ist es die Angabe, die die Ursache
   * zeigt. Der Kanal-Lookup vergleicht die Messgröße EXAKT; weicht die
   * Schreibweise am Zähler von der ab, die das Gerät meldet, findet kein
   * Uplink seinen Kanal. Bei allen anderen Gründen wäre die Liste nur
   * Beiwerk und würde die Zeile zustellen.
   */
  readonly zaehlerMessgroessen: string;
}

export interface IngestQuarantaeneListeView {
  readonly items: readonly IngestQuarantaeneZeileView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly loadMore: () => void;
}

/**
 * Anzeige-Modell des Quarantäne-Arbeitsvorrats.
 *
 * Zu jeder Zeile steht neben dem Grund auch, was zu tun ist — beim
 * häufigsten Fall (`devEUI_unbekannt`, ein sendendes, aber nicht
 * angebundenes Gerät) samt Sprungziel, sofern der Zähler aufgelöst werden
 * konnte. Genau dann ist er es allerdings meist nicht: Wenn das Gerät
 * unbekannt ist, gibt es keinen Zähler dazu. Der Sprung hilft bei den
 * anderen Gründen — `kanal_unbekannt`, `einheit_inkonsistent`,
 * `unbekannter_geraetetyp` —, bei denen der Zähler feststeht und die
 * Ursache an ihm hängt.
 */
export function useIngestQuarantaeneListeView(grund?: IngestQuarantaeneGrund): IngestQuarantaeneListeView {
  const query = useIngestQuarantaeneListe(grund !== undefined ? { grund } : {});
  const ohneBezug = t('stammdaten.ingestBetrieb.tabelle.ohneBezug');

  const items: readonly IngestQuarantaeneZeileView[] = query.data
    ? query.data.pages.flatMap((seite) =>
        seite.daten.map((zeile) => ({
          id: zeile.id,
          grund: zeile.grund,
          grundLabel: quarantaeneGrundLabel(zeile.grund),
          grundHinweis: quarantaeneGrundHinweis(zeile.grund),
          zaehlerIdLabel: zeile.zaehlerId !== null ? kurzId(zeile.zaehlerId) : ohneBezug,
          zaehlerId: zeile.zaehlerId ?? undefined,
          fPortLabel: zeile.fPort !== null ? String(zeile.fPort) : ohneBezug,
          quelleLabel: zeile.quelleCode ?? ohneBezug,
          // Gekürzt wie jede andere Pseudonym-Kennung in den Tabellen. Der
          // volle Wert brächte hier nichts — gesucht wird damit im
          // Netzserver, nicht im EDMS.
          applicationLabel: zeile.chirpstackApplicationId !== null ? kurzId(zeile.chirpstackApplicationId) : ohneBezug,
          topicRedacted: zeile.topicRedacted,
          empfangenAtLabel: formatiereZeitpunkt(zeile.empfangenAt),
          zaehlerMessgroessen:
            zeile.grund === 'kanal_unbekannt' && zeile.zaehlerMessgroessen !== null ? zeile.zaehlerMessgroessen : '',
        })),
      )
    : [];

  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}

export interface IngestQuarantaeneFilterView {
  readonly grund: string;
  readonly setzeGrund: (wert: string) => void;
  readonly aktiverGrund: IngestQuarantaeneGrund | undefined;
}

/** Grund-Filter der Liste — reiner Client-Zustand, gefiltert wird serverseitig. */
export function useIngestQuarantaeneFilterView(): IngestQuarantaeneFilterView {
  const [grund, setzeGrund] = useState<string>('');

  return {
    grund,
    setzeGrund,
    aktiverGrund: grund.length > 0 ? (grund as IngestQuarantaeneGrund) : undefined,
  };
}
