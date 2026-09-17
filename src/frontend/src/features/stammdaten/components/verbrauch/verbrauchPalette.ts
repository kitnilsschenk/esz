// Fest validierte Serienfarben (`dataviz`-Skill, Farbvalidator — alle sechs
// Prüfungen in Hell UND Dunkel bestanden). Die eigentlichen Hex-Werte leben
// als CSS-Custom-Properties in `globals.css` (`--viz-serie-1..4`, JE ein
// eigener Light-/Dark-Wert — "Dunkelmodus ist eigenständig gewählt, keine
// automatische Umkehrung"). Diese Datei referenziert sie nur über
// Tailwind-Arbitrary-Value-Klassen, DAMIT dieselbe Klasse in Hell/Dunkel
// automatisch die richtige Farbe zieht (kein JS-seitiges Dark-Mode-Branching
// im Diagramm nötig).
//
// Reihenfolge ist FEST und wird NIEMALS zyklisch vergeben (Auftragsvorgabe).
// Der Endpoint gruppiert Serien nach Messgröße INNERHALB einer Einheit — mehr
// als vier Messgrößen je Einheit an einem Standort sind ein in der Praxis
// nicht erwarteter Grenzfall. Eine fünfte (oder weitere) Serie bekommt daher
// bewusst KEINEN wiederverwendeten Slot 1-4 (Verwechslungsgefahr mit einer
// echten Serie), sondern einen neutralen, nicht Teil der validierten Palette
// befindlichen Grauton (`--viz-serie-fallback`) — die Serien-IDENTITÄT hängt
// in diesem Grenzfall ohnehin primär an der Direktbeschriftung/Legende
// (Text), nicht an der Farbe.
const SERIEN_FUELL_KLASSEN: readonly string[] = [
  'fill-[var(--viz-serie-1)]',
  'fill-[var(--viz-serie-2)]',
  'fill-[var(--viz-serie-3)]',
  'fill-[var(--viz-serie-4)]',
];

const SERIEN_HINTERGRUND_KLASSEN: readonly string[] = [
  'bg-[var(--viz-serie-1)]',
  'bg-[var(--viz-serie-2)]',
  'bg-[var(--viz-serie-3)]',
  'bg-[var(--viz-serie-4)]',
];

const FALLBACK_FUELL_KLASSE = 'fill-[var(--viz-serie-fallback)]';
const FALLBACK_HINTERGRUND_KLASSE = 'bg-[var(--viz-serie-fallback)]';

/** SVG-`fill`-Klasse für die Serie an `index` (Balken). */
export function serienFuellKlasse(index: number): string {
  return SERIEN_FUELL_KLASSEN[index] ?? FALLBACK_FUELL_KLASSE;
}

/** Hintergrundfarb-Klasse für die Serie an `index` (Legenden-Swatch). */
export function serienHintergrundKlasse(index: number): string {
  return SERIEN_HINTERGRUND_KLASSEN[index] ?? FALLBACK_HINTERGRUND_KLASSE;
}
