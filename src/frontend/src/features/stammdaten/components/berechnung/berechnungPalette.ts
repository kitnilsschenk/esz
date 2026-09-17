// Fest validierte Serienfarben für das Referenz-vs-Ist-Monatsdiagramm — die
// Hex-Werte leben als CSS-Custom-Properties in `globals.css`
// (`--viz-serie-1..4`, je ein eigener Light-/Dark-Wert), dieselben Tokens
// wie `../verbrauch/verbrauchPalette.ts` (EIN validierter Farbraum je Theme,
// aber jeder Entitäts-Ordner hält seine eigene, kleine Wrapper-Datei — s.
// `berechnungDiagrammLayout.ts`-Kopfkommentar). Reihenfolge ist FEST:
// Slot 1 = Referenz (R_m), Slot 2 = Ist — NIE zyklisch vergeben, NIE
// vertauscht (Verwechslungsgefahr zwischen witterungsbereinigtem Referenz-
// und tatsächlichem Ist-Wert wäre fachlich gravierend).
const REFERENZ_FUELL_KLASSE = 'fill-[var(--viz-serie-1)]';
const IST_FUELL_KLASSE = 'fill-[var(--viz-serie-2)]';
const REFERENZ_HINTERGRUND_KLASSE = 'bg-[var(--viz-serie-1)]';
const IST_HINTERGRUND_KLASSE = 'bg-[var(--viz-serie-2)]';

/** SVG-`fill`-Klasse der Serie (0 = Referenz, 1 = Ist). */
export function serienFuellKlasse(serienIndex: 0 | 1): string {
  return serienIndex === 0 ? REFERENZ_FUELL_KLASSE : IST_FUELL_KLASSE;
}

/** Hintergrundfarb-Klasse der Serie (0 = Referenz, 1 = Ist) — Legenden-Swatch. */
export function serienHintergrundKlasse(serienIndex: 0 | 1): string {
  return serienIndex === 0 ? REFERENZ_HINTERGRUND_KLASSE : IST_HINTERGRUND_KLASSE;
}
