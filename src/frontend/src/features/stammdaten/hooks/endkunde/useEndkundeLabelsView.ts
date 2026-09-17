import { useMemo } from 'react';
import { useEndkundeLabels } from '../../api/endkunde';
import { useKannEndkundePiiLesen } from '../shared/useKannEndkundePiiLesen';
import { kurzId } from '../../components/shared';

export interface EndkundeLabelsView {
  /**
   * Anzeigename fuer EINE Endkunde-Id. Faellt IMMER auf die Kurz-Id zurueck —
   * fehlende Berechtigung, noch nicht geladen, serverseitig gefiltert
   * (gesperrt/geschreddert) und unbekannte Id sind fuer die Darstellung
   * derselbe Fall: kein Label, also das Pseudonym. Die Oberflaeche
   * unterscheidet diese Faelle bewusst NICHT — der Server begruendet die
   * Filterung nicht (Auflage A4, kein Existenz-Leak), also darf die UI daraus
   * auch keine Aussage konstruieren.
   */
  readonly anzeigeName: (endkundeId: string) => string;
  /** `true`, solange die Aufloesung laeuft — fuer eine dezente Ladeanzeige, kein Blockieren. */
  readonly isPending: boolean;
  /**
   * `true`, wenn Klartextnamen ueberhaupt angezeigt werden koennen. Steuert
   * den statischen Zweckbindungs-Hinweis (Auflage A8 — ein blockierendes
   * Zweck-Token waere hier ausdruecklich unverhaeltnismaessig).
   */
  readonly zeigtKlartext: boolean;
}

/**
 * Reichert eine dargestellte Endkunden-Menge um Klartextnamen an
 * (ADR-0008 **D12**).
 *
 * Der Aufrufer uebergibt genau die Ids, die er GERADE ZEIGT — eine
 * Listenseite, die Optionen eines Auswahlfelds. Nicht mehr: Auflage A3 bindet
 * den Aufruf an den sichtbaren Ausschnitt, A2 deckelt ihn bei 100. Ein
 * Vorabladen des Gesamtbestands waere ein Bruch beider Auflagen und zugleich
 * die Aufloesung der Gleichung „1 Aufruf = 1 Seite = 1 Audit-Event".
 *
 * Ohne Berechtigung wird gar nicht erst gefragt (`useKannEndkundePiiLesen`) —
 * das erspart einen abgelehnten Aufruf UND ein unnoetiges Audit-Ereignis.
 */
export function useEndkundeLabelsView(endkundeIds: readonly string[]): EndkundeLabelsView {
  const kannLesen = useKannEndkundePiiLesen();
  const query = useEndkundeLabels(endkundeIds, { enabled: kannLesen });

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of query.data ?? []) {
      map.set(item.id, item.name);
    }
    return map;
  }, [query.data]);

  return {
    anzeigeName: (endkundeId) => nameById.get(endkundeId) ?? kurzId(endkundeId),
    isPending: kannLesen && endkundeIds.length > 0 && query.isPending,
    zeigtKlartext: kannLesen && nameById.size > 0,
  };
}
