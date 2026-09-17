import { describe, expect, it } from 'vitest';
import { REFERENZ_OPTIONEN_LIMIT, referenzOptionen } from './referenzOptionen';

interface TestItem {
  readonly id: string;
}

const toOption = (item: TestItem) => ({ value: item.id, label: item.id });

function seiten(...seitenDaten: readonly TestItem[][]) {
  return { pages: seitenDaten.map((daten) => ({ daten })) };
}

describe('referenzOptionen (Fremdschlüssel-Auswahllisten)', () => {
  it('nutzt das Server-Maximum als Seitengröße', () => {
    expect(REFERENZ_OPTIONEN_LIMIT).toBe(100);
  });

  it('liefert eine leere Auswahl, solange nichts geladen ist', () => {
    expect(referenzOptionen<TestItem>({ data: undefined, hasNextPage: false }, toOption).optionen).toEqual([]);
  });

  it('flacht ALLE geladenen Seiten ab, nicht nur die erste', () => {
    // Der Vorgängercode las `pages[0]` — jede weitere geladene Seite fiel
    // stillschweigend unter den Tisch.
    const referenz = referenzOptionen({ data: seiten([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }]), hasNextPage: false }, toOption);

    expect(referenz.optionen.map((option) => option.value)).toEqual(['a', 'b', 'c']);
  });

  it('meldet KEINE Kürzung, wenn der Server keine weitere Seite hat', () => {
    const referenz = referenzOptionen({ data: seiten([{ id: 'a' }]), hasNextPage: false }, toOption);

    expect(referenz.istGekuerzt).toBe(false);
    expect(referenz.hinweis).toBeUndefined();
  });

  it('macht eine gekürzte Auswahl über einen sichtbaren Hinweis kenntlich', () => {
    // Kernpunkt: Ohne diesen Hinweis war der 101. Datensatz schlicht nicht
    // wählbar, ohne dass die Oberfläche das irgendwo erwähnte.
    const referenz = referenzOptionen({ data: seiten([{ id: 'a' }]), hasNextPage: true }, toOption);

    expect(referenz.istGekuerzt).toBe(true);
    expect(referenz.hinweis).toContain('nur die ersten 100 Einträge');
  });
});
