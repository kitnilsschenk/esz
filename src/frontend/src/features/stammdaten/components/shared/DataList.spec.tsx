import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { DataList, type DataListColumn } from './DataList';

interface Item {
  readonly id: string;
  readonly name: string;
}

const columns: readonly DataListColumn<Item>[] = [
  { key: 'id', header: 'ID', render: (item) => item.id },
  { key: 'name', header: 'Name', render: (item) => item.name },
];

const baseProps = {
  caption: 'Test-Liste',
  columns,
  getRowKey: (item: Item) => item.id,
  loadingMessage: 'Lädt …',
  errorMessage: 'Fehler',
  emptyMessage: 'Keine Einträge',
};

describe('DataList', () => {
  it('zeigt die Ladeanzeige, wenn isPending true ist', () => {
    render(<DataList<Item> {...baseProps} items={[]} isPending isError={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Lädt …');
  });

  it('zeigt die Fehlermeldung, wenn isError true ist', () => {
    render(<DataList<Item> {...baseProps} items={[]} isPending={false} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent('Fehler');
  });

  it('zeigt die Leer-Meldung, wenn keine Einträge vorhanden sind', () => {
    render(<DataList<Item> {...baseProps} items={[]} isPending={false} isError={false} />);
    expect(screen.getByText('Keine Einträge')).toBeInTheDocument();
  });

  it('rendert eine Zeile je Eintrag inkl. Zeilen-Aktion', () => {
    render(
      <DataList<Item>
        {...baseProps}
        items={[{ id: '1', name: 'Erster' }]}
        isPending={false}
        isError={false}
        actionHeader="Aktion"
        renderRowAction={(item) => <a href={`/detail/${item.id}`}>Details {item.name}</a>}
      />,
    );

    expect(screen.getByRole('cell', { name: 'Erster' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details Erster' })).toBeInTheDocument();
  });

  it('ruft onLoadMore bei Klick auf „Weitere laden" auf', () => {
    const onLoadMore = vi.fn();
    render(
      <DataList<Item>
        {...baseProps}
        items={[{ id: '1', name: 'Erster' }]}
        isPending={false}
        isError={false}
        pagination={{ hasNextPage: true, isFetchingNextPage: false, onLoadMore, loadMoreLabel: 'Weitere laden' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Weitere laden' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('deaktiviert „Weitere laden", wenn keine weitere Seite existiert', () => {
    render(
      <DataList<Item>
        {...baseProps}
        items={[{ id: '1', name: 'Erster' }]}
        isPending={false}
        isError={false}
        pagination={{ hasNextPage: false, isFetchingNextPage: false, onLoadMore: vi.fn(), loadMoreLabel: 'Weitere laden' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Weitere laden' })).toBeDisabled();
  });

  it('hat im normalen Zustand keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <DataList<Item> {...baseProps} items={[{ id: '1', name: 'Erster' }]} isPending={false} isError={false} />,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  describe('Filter über die geladenen Einträge', () => {
    interface TestItem {
      readonly id: string;
      readonly name: string;
    }

    const ITEMS: TestItem[] = [
      { id: 'a1', name: 'Stadtwerke Musterstadt' },
      { id: 'b2', name: 'Wohnbau Beispielheim' },
      { id: 'c3', name: 'Stadtwerke Andernorts' },
    ];

    function rendereMitFilter() {
      return render(
        <DataList<TestItem>
          caption="Testliste"
          columns={[{ key: 'name', header: 'Name', render: (item) => item.name }]}
          items={ITEMS}
          getRowKey={(item) => item.id}
          isPending={false}
          isError={false}
          loadingMessage="lädt"
          errorMessage="Fehler"
          emptyMessage="Keine Einträge vorhanden."
          filter={{
            label: 'Liste filtern',
            platzhalter: 'Name …',
            trifftZu: (item, suchbegriff) =>
              item.name.toLowerCase().includes(suchbegriff) || item.id.toLowerCase().includes(suchbegriff),
          }}
          filterHinweis="Filtert die bereits geladenen Einträge."
          filterLeerMessage="Kein geladener Eintrag passt zum Filter."
          filterErgebnisAnsage={(sichtbar, gesamt) => `Gefiltert: ${String(sichtbar)} von ${String(gesamt)} Einträgen`}
        />,
      );
    }

    it('grenzt die Zeilen auf den Suchbegriff ein', () => {
      rendereMitFilter();

      fireEvent.change(screen.getByLabelText('Liste filtern'), { target: { value: 'stadtwerke' } });

      expect(screen.getByText('Stadtwerke Musterstadt')).toBeInTheDocument();
      expect(screen.getByText('Stadtwerke Andernorts')).toBeInTheDocument();
      expect(screen.queryByText('Wohnbau Beispielheim')).not.toBeInTheDocument();
    });

    it('benennt die Reichweite des Filters sichtbar', () => {
      // Ein Filter, der aussieht wie eine Suche, aber nur die geladene Menge
      // trifft, waere schlimmer als keiner — die Grenze steht deshalb am Feld.
      rendereMitFilter();

      expect(screen.getByText(/Filtert die bereits geladenen Einträge/)).toBeInTheDocument();
    });

    it('unterscheidet „kein Treffer" von „Liste leer"', () => {
      rendereMitFilter();

      fireEvent.change(screen.getByLabelText('Liste filtern'), { target: { value: 'zzz' } });

      expect(screen.getByText('Kein geladener Eintrag passt zum Filter.')).toBeInTheDocument();
      expect(screen.queryByText('Keine Einträge vorhanden.')).not.toBeInTheDocument();
    });

    it('sagt die Trefferzahl über eine dauerhaft gemountete Live-Region an', () => {
      // WCAG 2.2 AA 4.1.3: Die Zahl aendert sich beim Tippen, ohne dass der
      // Fokus sie passiert. Die Region ist leer, aber vorhanden — erst beim
      // Einfuegen bestueckte polite Regionen werden verschluckt.
      rendereMitFilter();

      const region = screen.getByRole('status');
      expect(region).toBeEmptyDOMElement();

      fireEvent.change(screen.getByLabelText('Liste filtern'), { target: { value: 'wohnbau' } });

      expect(screen.getByRole('status')).toBe(region);
      expect(region).toHaveTextContent('Gefiltert: 1 von 3 Einträgen');
    });

    it('ignoriert Groß-/Kleinschreibung und umgebende Leerzeichen', () => {
      rendereMitFilter();

      fireEvent.change(screen.getByLabelText('Liste filtern'), { target: { value: '  WOHNBAU  ' } });

      expect(screen.getByText('Wohnbau Beispielheim')).toBeInTheDocument();
    });

    it('rendert ohne `filter`-Prop kein Filterfeld', () => {
      render(
        <DataList<TestItem>
          caption="Testliste"
          columns={[{ key: 'name', header: 'Name', render: (item) => item.name }]}
          items={ITEMS}
          getRowKey={(item) => item.id}
          isPending={false}
          isError={false}
          loadingMessage="lädt"
          errorMessage="Fehler"
          emptyMessage="Keine Einträge vorhanden."
        />,
      );

      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });
  });
});
