import type { PolicyAction } from './policy-decision-port';

/** Grob-Kategorie einer `PolicyAction` — NIE per Literalvergleich ableiten (s. u.). */
export type ActionCategory = 'read' | 'write' | 'delete' | 'shred';

/**
 * PDP-Blocker 1 (ADR-0008 §14/§30, `access-control-engineer` + `backend-lead`
 * unabhängig gefunden): Der vormalige `InCodePolicyAdapter` verglich Aktionen
 * HART gegen das Literal `'read'` (`action !== 'read'` / `action === 'read'`).
 * Die additiv erweiterten Fach-Aktionen (`read:stammdaten`,
 * `read:monitoring`, `read:verbrauch_detail`, `create:*`, `update:*`,
 * `delete:*`, `shred:*`) matchen einen Literalvergleich NICHT — Folge:
 * (a) `compliance-auditor` würde bei jedem Stammdaten-Read fälschlich als
 *     Schreibzugriff abgelehnt (DS-01-Bruch),
 * (b) die DE-04-Ausnahme (`vonWissAuswertungAusgenommen && action==='read'`)
 *     würde für die neuen Lese-Aktionen STILL nie mehr feuern.
 *
 * Verbindliche Behebung: JEDE Aktions-Kategorie-Prüfung läuft über DIESE
 * Hilfsfunktion (`a.startsWith('read')` bzw. Präfix-Klassifikation), NIE über
 * Literalgleichheit. Reihenfolge der Prüfungen ist bewusst so gewählt, dass
 * `'read:verbrauch_detail'`/`'read:*'` als `'read'`, `'shred:*'` als
 * `'shred'`, `'delete'`/`'delete:*'` als `'delete'` und alles übrige
 * (`'write'`, `'create:*'`, `'update:*'`) als `'write'` klassifiziert wird.
 */
export function classifyAction(action: PolicyAction): ActionCategory {
  if (action.startsWith('read')) {
    return 'read';
  }

  if (action.startsWith('shred')) {
    return 'shred';
  }

  if (action.startsWith('delete')) {
    return 'delete';
  }

  // 'write' (Legacy-Aktion aus der Methoden-Ableitung) sowie alle
  // 'create:*'/'update:*'-Fachaktionen (ADR-0008 §14 Taxonomie).
  return 'write';
}
