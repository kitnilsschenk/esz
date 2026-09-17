import { useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { StandortBaumKnotenView } from '../../hooks/standort';
import { cn } from '../../../../shared/lib/cn';
import { Badge } from '../../../../shared/ui/badge';
import { t } from '../../../../shared/i18n/t';

export interface StandortBaumProps {
  readonly knoten: readonly StandortBaumKnotenView[];
  readonly aktiveId: string | undefined;
  readonly onAktivWechseln: (id: string) => void;
  readonly onToggleExpand: (id: string) => void;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly istLeer: boolean;
  readonly loadingMessage: string;
  readonly errorMessage: string;
  readonly emptyMessage: string;
  readonly ariaLabel: string;
}

function typLabel(typ: StandortBaumKnotenView['typ']): string {
  return t(`stammdaten.common.enums.standortTyp.${typ}`);
}

function statusLabel(status: StandortBaumKnotenView['status']): string {
  return t(`stammdaten.common.enums.betriebsStatus.${status}`);
}

/**
 * Barrierefreie Baum-Ansicht (WCAG 2.2 AA — die anspruchsvollste Komponente
 * dieses Auftrags). DOM-Struktur folgt WÖRTLICH dem WAI-ARIA-APG-Referenz-
 * muster für Tree-Views (verschachteltes `<li role="treeitem"><ul
 * role="group">…</ul></li>`, https://www.w3.org/WAI/ARIA/apg/patterns/treeview/):
 * - Wurzel-`<ul role="tree">`, jeder Knoten `<li role="treeitem">`,
 *   Kind-Container `<ul role="group">` NUR wenn aufgeklappt.
 * - `aria-expanded` NUR auf Knoten MIT Kindern (Blätter tragen das Attribut
 *   NICHT — korrekt laut Spezifikation).
 * - `aria-level`/`aria-setsize`/`aria-posinset` je Knoten (Ebene/Geschwister-
 *   Position), damit Screenreader Tiefe/Position ansagen können.
 * - Rovendes Tabindex-Muster: GENAU EIN Knoten (`aktiveId`) hat `tabIndex=0`,
 *   alle anderen `-1` — Pfeiltasten bewegen den Fokus PROGRAMMATISCH
 *   (`fokussiere()`), Tab verlässt/betritt den Baum als GANZES Widget.
 * - Tastatur-Flow (APG-Standard): ↓/↑ nächster/vorheriger sichtbarer Knoten
 *   (in DFS-Vorreihenfolge, identisch zur Render-Reihenfolge); → klappt
 *   einen zugeklappten Knoten MIT Kindern auf, bewegt bei einem bereits
 *   aufgeklappten Knoten zum ersten Kind; ← klappt einen aufgeklappten
 *   Knoten zu, bewegt sonst zum Eltern-Knoten; Home/End springen zum
 *   ersten/letzten sichtbaren Knoten.
 * - Sichtbarer Fokus-Ring (`focus-visible:ring-2`), Klick bewegt den Fokus
 *   IMPERATIV (`fokussiere()`, verlässt sich NICHT auf plattform-
 *   abhängiges natives Klick-fokussiert-Element-Verhalten, z. B. macOS
 *   Safari ohne „Volle Tastatursteuerung").
 * - Platzhalter-Anzeigetext (fehlende `read:standort_pii`-Berechtigung ODER
 *   noch ladend) wird NUR optisch gedämpft (`italic text-muted-foreground`)
 *   dargestellt — KEIN Fehler-Styling (`text-destructive-text`), da dies
 *   laut Auftrag KEIN Fehlerzustand ist.
 */
export function StandortBaum(props: StandortBaumProps): ReactNode {
  const {
    knoten,
    aktiveId,
    onAktivWechseln,
    onToggleExpand,
    isPending,
    isError,
    istLeer,
    loadingMessage,
    errorMessage,
    emptyMessage,
    ariaLabel,
  } = props;
  const refs = useRef(new Map<string, HTMLLIElement>());

  const kinderVonId = useMemo(() => {
    const map = new Map<string | null, StandortBaumKnotenView[]>();
    for (const eintrag of knoten) {
      const liste = map.get(eintrag.parentId);
      if (liste === undefined) {
        map.set(eintrag.parentId, [eintrag]);
      } else {
        liste.push(eintrag);
      }
    }
    return map;
  }, [knoten]);

  function fokussiere(id: string): void {
    onAktivWechseln(id);
    refs.current.get(id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    if (aktiveId === undefined) {
      return;
    }
    const index = knoten.findIndex((eintrag) => eintrag.id === aktiveId);
    const aktuell = knoten[index];
    if (aktuell === undefined) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const naechster = knoten[index + 1];
        if (naechster !== undefined) {
          fokussiere(naechster.id);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const vorheriger = knoten[index - 1];
        if (vorheriger !== undefined) {
          fokussiere(vorheriger.id);
        }
        break;
      }
      case 'Home': {
        event.preventDefault();
        const erster = knoten[0];
        if (erster !== undefined) {
          fokussiere(erster.id);
        }
        break;
      }
      case 'End': {
        event.preventDefault();
        const letzter = knoten[knoten.length - 1];
        if (letzter !== undefined) {
          fokussiere(letzter.id);
        }
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (aktuell.hatKinder && !aktuell.istExpandiert) {
          onToggleExpand(aktuell.id);
        } else if (aktuell.hatKinder && aktuell.istExpandiert) {
          const erstesKind = knoten[index + 1];
          if (erstesKind !== undefined && erstesKind.parentId === aktuell.id) {
            fokussiere(erstesKind.id);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (aktuell.hatKinder && aktuell.istExpandiert) {
          onToggleExpand(aktuell.id);
        } else if (aktuell.parentId !== null) {
          fokussiere(aktuell.parentId);
        }
        break;
      }
      default:
        break;
    }
  }

  function handleChevronClick(event: MouseEvent<HTMLSpanElement>, eintrag: StandortBaumKnotenView): void {
    event.stopPropagation();
    if (eintrag.hatKinder) {
      onToggleExpand(eintrag.id);
    }
  }

  /**
   * Expliziter `aria-label` je Knoten (statt "Name aus Inhalt"): OHNE ihn
   * würde die Accessible-Name-Berechnung eines aufgeklappten Knotens den
   * kompletten Text ALLER Nachfahren (das verschachtelte `role="group"`
   * steckt im selben `<li>`) mit einschließen — ein Screenreader kündigte
   * dann z. B. "Liegenschaft Standort A Raum Raum A1 …" statt nur "Liegenschaft
   * Standort A" an. Der Label-Text bildet bewusst NUR die eigene Zeile ab
   * (Typ, Anzeigename, Status, Zähleranzahl) — identisch zum sichtbaren Text,
   * ohne die Kind-Knoten.
   */
  function ariaLabelFuerZeile(eintrag: StandortBaumKnotenView): string {
    const teile = [typLabel(eintrag.typ), eintrag.anzeigeName];
    if (eintrag.status === 'stillgelegt') {
      teile.push(statusLabel(eintrag.status));
    }
    if (eintrag.zaehlerAnzahl > 0) {
      teile.push(`${t('stammdaten.standort.baum.zaehlerAnzahlPraefix')} ${String(eintrag.zaehlerAnzahl)}`);
    }
    return teile.join(', ');
  }

  function renderGeschwister(elternId: string | null): ReactNode {
    const geschwister = kinderVonId.get(elternId) ?? [];
    return geschwister.map((eintrag) => (
      <li
        key={eintrag.id}
        ref={(element) => {
          if (element) {
            refs.current.set(eintrag.id, element);
          } else {
            refs.current.delete(eintrag.id);
          }
        }}
        role="treeitem"
        aria-label={ariaLabelFuerZeile(eintrag)}
        aria-level={eintrag.ebene + 1}
        aria-setsize={eintrag.setSize}
        aria-posinset={eintrag.posInSet}
        {...(eintrag.hatKinder ? { 'aria-expanded': eintrag.istExpandiert } : {})}
        tabIndex={eintrag.id === aktiveId ? 0 : -1}
        onClick={(event) => {
          event.stopPropagation();
          fokussiere(eintrag.id);
        }}
        className={cn(
          'rounded-md px-2 py-1.5 text-sm outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          eintrag.id === aktiveId ? 'bg-accent text-accent-foreground' : 'cursor-pointer hover:bg-muted/50',
        )}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            onClick={(event) => handleChevronClick(event, eintrag)}
            className={cn('flex h-4 w-4 shrink-0 items-center justify-center', eintrag.hatKinder ? 'text-muted-foreground' : 'invisible')}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', eintrag.istExpandiert && 'rotate-90')} />
          </span>
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{typLabel(eintrag.typ)}</span>
          <span className={cn('truncate', eintrag.istPlatzhalter && 'italic text-muted-foreground')}>{eintrag.anzeigeName}</span>
          {eintrag.status === 'stillgelegt' && <Badge variant="outline">{statusLabel(eintrag.status)}</Badge>}
          {eintrag.zaehlerAnzahl > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {t('stammdaten.standort.baum.zaehlerAnzahlPraefix')} {eintrag.zaehlerAnzahl}
            </span>
          )}
        </div>
        {eintrag.istExpandiert && eintrag.hatKinder && (
          <ul role="group" className="ml-5 mt-1.5 space-y-0.5 border-l border-border pl-3">
            {renderGeschwister(eintrag.id)}
          </ul>
        )}
      </li>
    ));
  }

  if (isPending) {
    return (
      <p role="status" aria-live="polite" className="px-1 py-6 text-sm text-muted-foreground">
        {loadingMessage}
      </p>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="px-1 py-6 text-sm font-medium text-destructive-text">
        {errorMessage}
      </p>
    );
  }

  if (istLeer) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul role="tree" aria-label={ariaLabel} onKeyDown={handleKeyDown} className="flex flex-col gap-0.5">
      {renderGeschwister(null)}
    </ul>
  );
}
