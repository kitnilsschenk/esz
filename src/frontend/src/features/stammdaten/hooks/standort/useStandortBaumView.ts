import { useMemo, useState } from 'react';
import type { StandortLabelItem, StandortStatus, StandortStruktur, StandortTyp } from '@edms/shared';
import { useStandortBaum, useStandortLabels } from '../../api/standort';
import { kurzId } from '../../components/shared';
import { useKannStandortPiiLesen } from './useKannStandortPiiLesen';
import { t } from '../../../../shared/i18n/t';

export interface StandortBaumKnotenView {
  readonly id: string;
  readonly parentId: string | null;
  readonly typ: StandortTyp;
  readonly ebene: number;
  readonly status: StandortStatus;
  readonly hatAdresse: boolean;
  readonly zaehlerAnzahl: number;
  readonly hatKinder: boolean;
  readonly istExpandiert: boolean;
  /** Bezeichnung (bei Berechtigung + geladen) ODER Platzhalter-Anzeigetext — NIE beides gemischt. */
  readonly anzeigeName: string;
  /** `true`, solange KEIN Klartext-Label gezeigt wird (fehlende Berechtigung ODER noch ladend) — steuert NUR die Optik (kein Fehler-Styling), s. `StandortBaum.tsx`. */
  readonly istPlatzhalter: boolean;
  readonly posInSet: number;
  readonly setSize: number;
}

export interface StandortBaumView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly errorMessage: string | undefined;
  /** Sichtbare Knoten (Auf-/Zuklapp-Zustand bereits angewendet), DFS-Vorreihenfolge — entspricht der Render-/Fokus-Reihenfolge. */
  readonly knoten: readonly StandortBaumKnotenView[];
  readonly istLeer: boolean;
  readonly aktiveId: string | undefined;
  readonly setAktiveId: (id: string) => void;
  readonly toggleExpand: (id: string) => void;
  /** `true`, solange die Rolle `read:standort_pii` (voraussichtlich) NICHT hat — steuert die Platzhalter-Darstellung, KEIN Fehlerzustand. */
  readonly kannPiiLesen: boolean;
  /** Ermittelt den Anzeigenamen für EINEN BELIEBIGEN (nicht notwendig sichtbaren) Knoten — für Auswahllisten (z. B. „Verschieben"-Ziel). */
  readonly anzeigeNameFuer: (standortId: string) => string;
  /** Bereits entschlüsseltes Label EINES sichtbaren Knotens (bezeichnung+anschrift) — `undefined`, solange nicht geladen/nicht berechtigt/nicht sichtbar. Für das PII-Ändern-Formular (Vorbefüllung, KEINE erneute Entschlüsselung). */
  readonly labelItemFuer: (standortId: string) => StandortLabelItem | undefined;
  readonly alleKnoten: readonly StandortStruktur[];
  readonly refetchBaum: () => void;
}

function typLabel(typ: StandortTyp): string {
  return t(`stammdaten.common.enums.standortTyp.${typ}`);
}

function vergleicheGeschwister(a: StandortStruktur, b: StandortStruktur): number {
  if (a.sortierung !== b.sortierung) {
    return a.sortierung - b.sortierung;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Leitet aus der Struktur-Query (`useStandortBaum`, PII-frei) UND der
 * Label-Batch-Query (`useStandortLabels`, NUR für die aktuell sichtbaren
 * Knoten) ein reines Baum-Anzeige-/Interaktions-Modell ab (ADR-0010 D5 —
 * ZWEI GETRENNTE Queries, hier zusammengeführt). Auf-/Zuklapp- und
 * „aktiver Knoten"-Zustand leben bewusst HIER (nicht in der
 * Baum-Komponente) — Server-State bleibt ausschließlich in TanStack Query,
 * reiner UI-Zustand (Set/aktive Id) in lokalem `useState`
 * (`.claude/rules/frontend-react.md`).
 *
 * Ohne `read:standort_pii` (`useKannStandortPiiLesen`) wird der Label-Batch-
 * Aufruf gar nicht erst abgesetzt (`useStandortLabels`s `enabled`-Gate) —
 * jeder Knoten bekommt stattdessen einen Platzhalter-Anzeigetext
 * ("<Typ> (ohne Leseberechtigung)"). Das ist KEIN Fehlerzustand: `isError`
 * bezieht sich ausschließlich auf die STRUKTUR-Query; ein Label-Batch-Fehler
 * (z. B. ein unerwarteter 403 trotz `kannPiiLesen === true`, etwa nach
 * Rollenentzug mitten in der Sitzung) degradiert ebenfalls NUR zur
 * Platzhalter-Darstellung, statt eine Fehlermeldung zu zeigen — der Baum
 * bleibt in jedem Fall vollständig bedienbar.
 */
export function useStandortBaumView(endkundeId: string): StandortBaumView {
  const baumQuery = useStandortBaum(endkundeId);
  const kannPiiLesen = useKannStandortPiiLesen();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [aktiveIdState, setAktiveIdState] = useState<string | undefined>(undefined);

  const alleKnoten = baumQuery.data ?? [];

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, StandortStruktur[]>();
    for (const knoten of alleKnoten) {
      const liste = map.get(knoten.parentId);
      if (liste === undefined) {
        map.set(knoten.parentId, [knoten]);
      } else {
        liste.push(knoten);
      }
    }
    for (const liste of map.values()) {
      liste.sort(vergleicheGeschwister);
    }
    return map;
  }, [alleKnoten]);

  const sichtbareStruktur = useMemo(() => {
    const ergebnis: StandortStruktur[] = [];
    function besuche(parentId: string | null): void {
      const geschwister = childrenByParent.get(parentId) ?? [];
      for (const knoten of geschwister) {
        ergebnis.push(knoten);
        if (expandedIds.has(knoten.id)) {
          besuche(knoten.id);
        }
      }
    }
    besuche(null);
    return ergebnis;
  }, [childrenByParent, expandedIds]);

  const sichtbareIds = useMemo(() => sichtbareStruktur.map((knoten) => knoten.id), [sichtbareStruktur]);

  const labelsQuery = useStandortLabels(endkundeId, sichtbareIds, { enabled: kannPiiLesen });
  const labelDarstellungErlaubt = kannPiiLesen && !labelsQuery.isError;

  const labelItemById = useMemo(() => {
    const map = new Map<string, StandortLabelItem>();
    for (const item of labelsQuery.data ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [labelsQuery.data]);

  function labelItemFuer(standortId: string): StandortLabelItem | undefined {
    return labelDarstellungErlaubt ? labelItemById.get(standortId) : undefined;
  }

  function anzeigeNameFuer(standortId: string): string {
    const knoten = alleKnoten.find((eintrag) => eintrag.id === standortId);
    const typText = knoten ? typLabel(knoten.typ) : t('stammdaten.standort.baum.unbekannterKnoten');
    if (!labelDarstellungErlaubt) {
      return `${typText} ${t('stammdaten.standort.baum.keinePiiBerechtigungSuffix')}`;
    }
    if (labelsQuery.isPending && sichtbareIds.includes(standortId)) {
      return `${typText} (${t('stammdaten.common.laedt')})`;
    }
    const bezeichnung = labelItemById.get(standortId)?.bezeichnung;
    return bezeichnung ?? `${typText} (${kurzId(standortId)})`;
  }

  const knoten: StandortBaumKnotenView[] = sichtbareStruktur.map((eintrag) => {
    const geschwister = childrenByParent.get(eintrag.parentId) ?? [];
    return {
      id: eintrag.id,
      parentId: eintrag.parentId,
      typ: eintrag.typ,
      ebene: eintrag.ebene,
      status: eintrag.status,
      hatAdresse: eintrag.hatAdresse,
      zaehlerAnzahl: eintrag.zaehlerAnzahl,
      hatKinder: (childrenByParent.get(eintrag.id) ?? []).length > 0,
      istExpandiert: expandedIds.has(eintrag.id),
      anzeigeName: anzeigeNameFuer(eintrag.id),
      istPlatzhalter: !labelDarstellungErlaubt || (labelsQuery.isPending && sichtbareIds.includes(eintrag.id)),
      posInSet: geschwister.findIndex((geschwister_) => geschwister_.id === eintrag.id) + 1,
      setSize: geschwister.length,
    };
  });

  const aktiveId = aktiveIdState ?? knoten[0]?.id;

  function toggleExpand(id: string): void {
    setExpandedIds((bisherige) => {
      const neue = new Set(bisherige);
      if (neue.has(id)) {
        neue.delete(id);
      } else {
        neue.add(id);
      }
      return neue;
    });
  }

  return {
    isPending: baumQuery.isPending,
    isError: baumQuery.isError,
    errorMessage: baumQuery.isError ? t('stammdaten.common.fehler') : undefined,
    knoten,
    istLeer: !baumQuery.isPending && !baumQuery.isError && alleKnoten.length === 0,
    aktiveId,
    setAktiveId: setAktiveIdState,
    toggleExpand,
    kannPiiLesen,
    anzeigeNameFuer,
    labelItemFuer,
    alleKnoten,
    refetchBaum: () => {
      void baumQuery.refetch();
    },
  };
}
