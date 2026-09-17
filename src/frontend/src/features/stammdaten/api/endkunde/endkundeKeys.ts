import { createResourceQueryKeys } from '../shared';

// Query-Key-Factory der Endkunde-Ressource (TanStack-Query-Konvention,
// analog `healthKeys`/`authKeys`). EINE Zeile — das ist die gesamte
// ressourcen-spezifische Anpassung dieses Bausteins.
export const endkundeKeys = createResourceQueryKeys('endkunde');

/**
 * ADR-0008 D12 — Batch-Label-Aufloesung. Der Key bindet die SORTIERTE
 * Id-Menge: Dieselbe Menge in anderer Reihenfolge ist derselbe Cache-Eintrag,
 * eine andere Menge ein anderer. So loest ein Blaettern in der Liste genau
 * einen neuen Aufruf aus — und ein Zurueckblaettern gar keinen.
 *
 * Bewusst KEIN Praefix-Invalidierer wie beim Standort: Labels aendern sich
 * nur ueber `PATCH /stammdaten/endkunden/{id}`, das ohnehin bereits
 * `endkundeKeys.listen()` und `.detail()` invalidiert. Ein zusaetzlicher
 * Label-Invalidierer wuerde beim naechsten Render einen weiteren
 * auditierten PII-Zugriff ausloesen — fuer eine Namensaenderung, die der
 * Nutzer gerade selbst vorgenommen hat.
 */
export function endkundeLabelsKey(endkundeIds: readonly string[]): readonly [string, 'labels', readonly string[]] {
  return [...endkundeKeys.all, 'labels', [...endkundeIds].sort()] as const;
}
