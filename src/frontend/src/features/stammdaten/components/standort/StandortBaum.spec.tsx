import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { StandortBaum } from './StandortBaum';
import type { StandortBaumKnotenView } from '../../hooks/standort';

function zeile(overrides: Partial<StandortBaumKnotenView> & Pick<StandortBaumKnotenView, 'id'>): StandortBaumKnotenView {
  return {
    parentId: null,
    typ: 'liegenschaft',
    ebene: 0,
    status: 'aktiv',
    hatAdresse: true,
    zaehlerAnzahl: 0,
    hatKinder: false,
    istExpandiert: false,
    anzeigeName: 'Standort',
    istPlatzhalter: false,
    posInSet: 1,
    setSize: 1,
    ...overrides,
  };
}

const WURZEL_A = zeile({
  id: 'wurzel-a',
  typ: 'liegenschaft',
  ebene: 0,
  hatKinder: true,
  istExpandiert: true,
  anzeigeName: 'Standort A',
  posInSet: 1,
  setSize: 2,
});
const KIND_A1 = zeile({
  id: 'kind-a1',
  parentId: 'wurzel-a',
  typ: 'raum',
  ebene: 1,
  anzeigeName: 'Raum A1',
  posInSet: 1,
  setSize: 1,
});
const WURZEL_B = zeile({
  id: 'wurzel-b',
  typ: 'gebaeude',
  ebene: 0,
  anzeigeName: 'Gebäude (ohne Leseberechtigung)',
  istPlatzhalter: true,
  posInSet: 2,
  setSize: 2,
});

const KNOTEN: readonly StandortBaumKnotenView[] = [WURZEL_A, KIND_A1, WURZEL_B];

function renderBaum(overrides: Partial<Parameters<typeof StandortBaum>[0]> = {}) {
  const onAktivWechseln = vi.fn();
  const onToggleExpand = vi.fn();
  const utils = render(
    <StandortBaum
      knoten={KNOTEN}
      aktiveId="wurzel-a"
      onAktivWechseln={onAktivWechseln}
      onToggleExpand={onToggleExpand}
      isPending={false}
      isError={false}
      istLeer={false}
      loadingMessage="Daten werden geladen …"
      errorMessage="Fehler."
      emptyMessage="Noch kein Standort angelegt."
      ariaLabel="Standort-Baum"
      {...overrides}
    />,
  );
  return { ...utils, onAktivWechseln, onToggleExpand };
}

describe('StandortBaum (WCAG 2.2 AA Tree-View)', () => {
  it('rendert die WAI-ARIA-Baumstruktur: tree/treeitem/group, aria-level, aria-expanded NUR bei Knoten mit Kindern', () => {
    renderBaum();

    const tree = screen.getByRole('tree', { name: 'Standort-Baum' });
    expect(tree).toBeInTheDocument();

    const wurzelA = screen.getByRole('treeitem', { name: /Standort A/ });
    expect(wurzelA).toHaveAttribute('aria-level', '1');
    expect(wurzelA).toHaveAttribute('aria-expanded', 'true');

    const kindA1 = screen.getByRole('treeitem', { name: /Raum A1/ });
    expect(kindA1).toHaveAttribute('aria-level', '2');
    // Blattknoten: KEIN `aria-expanded` (Spezifikation).
    expect(kindA1).not.toHaveAttribute('aria-expanded');

    // Kinder von "Standort A" stecken in einem verschachtelten `role="group"`.
    const gruppe = within(wurzelA).getByRole('group');
    expect(within(gruppe).getByRole('treeitem', { name: /Raum A1/ })).toBeInTheDocument();
  });

  it('rovendes Tabindex-Muster: NUR der aktive Knoten hat tabIndex 0, alle anderen -1', () => {
    renderBaum({ aktiveId: 'wurzel-a' });

    expect(screen.getByRole('treeitem', { name: /Standort A/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('treeitem', { name: /Raum A1/ })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('treeitem', { name: /Gebäude/ })).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowDown bewegt Fokus UND aktiven Knoten zum nächsten sichtbaren Knoten (DFS-Reihenfolge)', () => {
    const { onAktivWechseln } = renderBaum({ aktiveId: 'wurzel-a' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });

    expect(onAktivWechseln).toHaveBeenCalledWith('kind-a1');
    expect(screen.getByRole('treeitem', { name: /Raum A1/ })).toHaveFocus();
  });

  it('ArrowUp bewegt zum vorherigen sichtbaren Knoten', () => {
    const { onAktivWechseln } = renderBaum({ aktiveId: 'kind-a1' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowUp' });

    expect(onAktivWechseln).toHaveBeenCalledWith('wurzel-a');
  });

  it('Home/End springen zum ersten/letzten sichtbaren Knoten', () => {
    const { onAktivWechseln } = renderBaum({ aktiveId: 'kind-a1' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
    expect(onAktivWechseln).toHaveBeenLastCalledWith('wurzel-b');

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Home' });
    expect(onAktivWechseln).toHaveBeenLastCalledWith('wurzel-a');
  });

  it('ArrowRight klappt einen ZUGEKLAPPTEN Knoten MIT Kindern auf', () => {
    const wurzelC = zeile({
      id: 'wurzel-c',
      typ: 'gebaeude',
      anzeigeName: 'Standort C',
      hatKinder: true,
      istExpandiert: false,
      posInSet: 1,
      setSize: 1,
    });
    const { onToggleExpand, onAktivWechseln } = renderBaum({ aktiveId: 'wurzel-c', knoten: [wurzelC] });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });

    expect(onToggleExpand).toHaveBeenCalledWith('wurzel-c');
    // Zugeklappt bleibt der Fokus auf dem Knoten selbst — erst ein ZWEITES
    // ArrowRight (nach dem Aufklappen) bewegt zum ersten Kind (separater Test).
    expect(onAktivWechseln).not.toHaveBeenCalled();
  });

  it('ArrowRight auf einem Blattknoten (keine Kinder) bewegt weder Fokus noch klappt etwas auf', () => {
    const { onToggleExpand, onAktivWechseln } = renderBaum({ aktiveId: 'wurzel-b' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });

    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(onAktivWechseln).not.toHaveBeenCalled();
  });

  it('ArrowRight bewegt bei einem BEREITS aufgeklappten Knoten zum ersten Kind', () => {
    const { onAktivWechseln } = renderBaum({ aktiveId: 'wurzel-a' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });

    expect(onAktivWechseln).toHaveBeenCalledWith('kind-a1');
  });

  it('ArrowLeft klappt einen aufgeklappten Knoten zu', () => {
    const { onToggleExpand } = renderBaum({ aktiveId: 'wurzel-a' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowLeft' });

    expect(onToggleExpand).toHaveBeenCalledWith('wurzel-a');
  });

  it('ArrowLeft bewegt bei einem Kind-Knoten zum Eltern-Knoten', () => {
    const { onAktivWechseln } = renderBaum({ aktiveId: 'kind-a1' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowLeft' });

    expect(onAktivWechseln).toHaveBeenCalledWith('wurzel-a');
  });

  it('Klick auf den Auf-/Zuklapp-Pfeil klappt NUR auf/zu — löst NICHT gleichzeitig eine Aktiv-Wechsel-Auswahl aus', () => {
    const { onToggleExpand, onAktivWechseln } = renderBaum({ aktiveId: 'wurzel-b' });

    const wurzelA = screen.getByRole('treeitem', { name: /Standort A/ });
    const pfeil = wurzelA.querySelector('[aria-hidden="true"]');
    expect(pfeil).not.toBeNull();
    fireEvent.click(pfeil as Element);

    expect(onToggleExpand).toHaveBeenCalledWith('wurzel-a');
    expect(onAktivWechseln).not.toHaveBeenCalled();
  });

  it('Klick auf die Knoten-Zeile wechselt den aktiven Knoten', () => {
    const { onAktivWechseln } = renderBaum({ aktiveId: 'wurzel-a' });

    fireEvent.click(screen.getByRole('treeitem', { name: /Raum A1/ }));

    expect(onAktivWechseln).toHaveBeenCalledWith('kind-a1');
  });

  it('stellt Platzhalter-Knoten (fehlende PII-Berechtigung) OPTISCH gedämpft dar — OHNE Fehler-Rolle/-Styling', () => {
    renderBaum();

    const platzhalterText = screen.getByText('Gebäude (ohne Leseberechtigung)');
    expect(platzhalterText).toHaveClass('italic');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('zeigt einen Ladehinweis (role=status) während `isPending`', () => {
    renderBaum({ isPending: true });

    expect(screen.getByRole('status')).toHaveTextContent('Daten werden geladen …');
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung (role=alert) bei `isError`', () => {
    renderBaum({ isError: true });

    expect(screen.getByRole('alert')).toHaveTextContent('Fehler.');
  });

  it('zeigt einen Leer-Hinweis, wenn der Endkunde noch keinen Standort hat', () => {
    renderBaum({ istLeer: true, knoten: [] });

    expect(screen.getByText('Noch kein Standort angelegt.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = renderBaum();

    expect(await runAxe(container)).toEqual([]);
  });
});
