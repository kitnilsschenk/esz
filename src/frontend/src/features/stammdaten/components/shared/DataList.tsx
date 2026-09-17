import { useId, useState, type ReactNode } from 'react';
import { cn } from '../../../../shared/lib/cn';
import { Button } from '../../../../shared/ui/button';
import { Card } from '../../../../shared/ui/card';
import { Input } from '../../../../shared/ui/input';
import { Label } from '../../../../shared/ui/label';

export interface DataListColumn<TItem> {
  readonly key: string;
  readonly header: string;
  readonly render: (item: TItem) => ReactNode;
}

export interface DataListPagination {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly loadMoreLabel: string;
}

export interface DataListFilter<TItem> {
  /** Sichtbare Feld-Beschriftung (`<label>`), z. B. „Liste filtern". */
  readonly label: string;
  readonly platzhalter: string;
  /**
   * Entscheidet je Eintrag, ob er zum Suchbegriff passt. Der Aufrufer bestimmt,
   * WORAUF gefiltert wird — bei Endkunden etwa auf den (ggf. aufgelösten)
   * Klartextnamen UND die Kurz-Id, damit das Feld für jede Rolle etwas tut.
   * Der Suchbegriff kommt bereits normalisiert (getrimmt, Kleinbuchstaben).
   */
  readonly trifftZu: (item: TItem, suchbegriff: string) => boolean;
}

export interface DataListProps<TItem> {
  /** Sichtbare `<caption>` — beschreibt die Tabelle für alle Nutzer:innen (A11y). */
  readonly caption: string;
  readonly columns: readonly DataListColumn<TItem>[];
  readonly items: readonly TItem[];
  readonly getRowKey: (item: TItem) => string;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly loadingMessage: string;
  readonly errorMessage: string;
  readonly emptyMessage: string;
  readonly actionHeader?: string;
  readonly renderRowAction?: (item: TItem) => ReactNode;
  readonly pagination?: DataListPagination;
  /**
   * Optionales Filterfeld über der Tabelle.
   *
   * **Filtert AUSSCHLIESSLICH die bereits geladenen Einträge — es sucht nicht
   * im Bestand.** Das ist eine bewusste, klein gehaltene Maßnahme und kein
   * Ersatz für eine serverseitige Suche: Die Klartextnamen liegen
   * feldverschlüsselt und je Subjekt mit eigenem Schlüssel in der Datenbank
   * (Voraussetzung des Krypto-Shreddings, Art. 17) — ein `LIKE` darauf ist
   * technisch unmöglich, und die Alternativen (Blind-Index, n-Gramm-Index,
   * serverseitiges Entschlüsseln) sind entweder auf exakte Treffer beschränkt
   * oder brauchen ein eigenes Krypto-Votum (ADR-0008 D12 §6).
   *
   * Damit daraus kein falsches Versprechen wird, benennt die Oberfläche die
   * Grenze ausdrücklich (`filterHinweis`) — ein Filter, der so aussieht wie
   * eine Suche, aber nur die geladene Seite trifft, wäre schlimmer als keiner.
   */
  readonly filter?: DataListFilter<TItem>;
  /** Sichtbarer Hinweis auf die Reichweite des Filters (Pflicht, wenn `filter` gesetzt ist). */
  readonly filterHinweis?: string;
  /** Meldung, wenn der Filter alles wegfiltert — fachlich etwas anderes als „Liste leer". */
  readonly filterLeerMessage?: string;
  /** Ergebnis-Ansage für Screenreader, z. B. `(n) => \`${n} von ${m} Einträgen\``. */
  readonly filterErgebnisAnsage?: (sichtbar: number, gesamt: number) => string;
}

/**
 * Generische Listen-/Tabellen-Primitive mit Lade-/Leer-/Fehlerzustand
 * (`.claude/rules/frontend-react.md`: A11y, semantisches HTML). Bewusst
 * `<table>` statt Div-Grid — Listen-Daten sind tabellarisch (Spalten je
 * Feld), `<caption>`/`scope="col"` machen die Struktur für Screenreader
 * navigierbar. Jede Stammdaten-Entität liefert nur `columns` +
 * `renderRowAction` (z. B. Link zum Detail) — die ÖFFENTLICHE API dieser
 * Datei (Props/Verhalten/Rollen) bleibt dabei UNVERÄNDERT (geteiltes
 * Fundament, ADR-0008 §23 / D11); restylt wurde nur die Optik
 * (Phase 4c-Feinschliff, Design-System: Card + Zebra/Hover-Tabelle).
 */
export function DataList<TItem>(props: DataListProps<TItem>): ReactNode {
  const {
    caption,
    columns,
    items,
    getRowKey,
    isPending,
    isError,
    loadingMessage,
    errorMessage,
    emptyMessage,
    actionHeader,
    renderRowAction,
    pagination,
    filter,
    filterHinweis,
    filterLeerMessage,
    filterErgebnisAnsage,
  } = props;
  const filterFeldId = useId();
  const [suchbegriff, setSuchbegriff] = useState('');

  const normalisiert = suchbegriff.trim().toLowerCase();
  const sichtbareItems =
    filter !== undefined && normalisiert.length > 0 ? items.filter((item) => filter.trifftZu(item, normalisiert)) : items;
  const istGefiltert = sichtbareItems.length !== items.length;

  if (isPending) {
    return (
      <p role="status" aria-live="polite" className="px-1 py-6 text-sm text-muted-foreground">
        {loadingMessage}
      </p>
    );
  }

  // Der Fehlerzustand ersetzt die Tabelle NUR, wenn es nichts zu zeigen gibt.
  // Vorher galt `isError` unbedingt — dadurch verschwand bei einem
  // fehlgeschlagenen „Weitere laden" die gesamte bereits geladene Liste
  // (TanStack setzt die Query in den Fehlerzustand, auch wenn frühere Seiten
  // im Cache stehen). Der Nutzer verlor damit für einen Folgeseiten-Fehler
  // seinen kompletten Arbeitsstand.
  if (isError && items.length === 0) {
    return (
      <p role="alert" className="px-1 py-6 text-sm font-medium text-destructive-text">
        {errorMessage}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {filter !== undefined && (
        <div className="space-y-1">
          <Label htmlFor={filterFeldId}>{filter.label}</Label>
          <Input
            id={filterFeldId}
            type="search"
            value={suchbegriff}
            placeholder={filter.platzhalter}
            {...(filterHinweis !== undefined ? { 'aria-describedby': `${filterFeldId}-hinweis` } : {})}
            onChange={(event) => setSuchbegriff(event.target.value)}
            className="max-w-md"
          />
          {filterHinweis !== undefined && (
            <p id={`${filterFeldId}-hinweis`} className="text-xs text-muted-foreground">
              {filterHinweis}
            </p>
          )}
          {/*
            WCAG 2.2 AA 4.1.3: Die Trefferzahl aendert sich beim Tippen, ohne
            dass der Fokus sie passiert. Die Region bleibt DAUERHAFT gemountet
            (leer, solange nicht gefiltert wird) — eine polite Live-Region, die
            erst zusammen mit ihrem Text eingefuegt wird, verschlucken mehrere
            Screenreader (dieselbe Begruendung wie in `shared/ui/status-region.tsx`).
          */}
          <p role="status" aria-live="polite" className="sr-only">
            {istGefiltert && filterErgebnisAnsage !== undefined ? filterErgebnisAnsage(sichtbareItems.length, items.length) : ''}
          </p>
        </div>
      )}
      {sichtbareItems.length === 0 ? (
        // Fachlich etwas anderes als `emptyMessage`: Es GIBT Eintraege, sie
        // passen nur nicht zum Suchbegriff.
        <p className="px-1 py-6 text-sm text-muted-foreground">{filterLeerMessage ?? emptyMessage}</p>
      ) : (
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="border-b border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground">
              {caption}
            </caption>
            <thead className="bg-muted/50">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    {column.header}
                  </th>
                ))}
                {renderRowAction && (
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    {actionHeader}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sichtbareItems.map((item, index) => {
                const rowKey = getRowKey(item);
                return (
                  <tr
                    key={rowKey}
                    className={cn(
                      'border-b border-border transition-colors last:border-0 hover:bg-muted/50',
                      index % 2 === 1 && 'bg-muted/30',
                    )}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3 text-foreground">
                        {column.render(item)}
                      </td>
                    ))}
                    {renderRowAction && <td className="px-4 py-3">{renderRowAction(item)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      {isError && (
        <p role="alert" className="px-1 text-sm font-medium text-destructive-text">
          {errorMessage}
        </p>
      )}
      {pagination && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pagination.onLoadMore}
          disabled={!pagination.hasNextPage || pagination.isFetchingNextPage}
        >
          {pagination.loadMoreLabel}
        </Button>
      )}
    </div>
  );
}
