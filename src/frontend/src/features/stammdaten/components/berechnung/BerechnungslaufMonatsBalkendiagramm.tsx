import { useId, useState, type ReactNode } from 'react';
import type { BerechnungslaufMonatsZeileView } from '../../hooks/berechnung';
import { formatiereZahl } from '../../hooks/berechnung';
import { cn } from '../../../../shared/lib/cn';
import { t } from '../../../../shared/i18n/t';
import { serienFuellKlasse, serienHintergrundKlasse } from './berechnungPalette';
import {
  DIAGRAMM_BREITE,
  DIAGRAMM_HOEHE,
  DIREKTLABEL_ZEILENHOEHE,
  balkenPfad,
  berechneBalkenPositionen,
  berechneMaxWert,
  berechneRand,
  berechneYAchse,
  maxOf,
  schaetzeTextbreite,
  waehleAchsenLabelIndizes,
} from './berechnungDiagrammLayout';

export interface BerechnungslaufMonatsBalkendiagrammProps {
  /** Sichtbarer Titel des Diagramms (Figure-Caption). */
  readonly titel: string;
  readonly zeilen: readonly BerechnungslaufMonatsZeileView[];
}

interface HoverZustand {
  readonly monatIndex: number;
  readonly serienIndex: 0 | 1;
}

/**
 * Handgeschriebenes SVG-Balkendiagramm — bewusst OHNE Chart-Bibliothek
 * (Bundle-Budget ≤ 250 KB gz), analog `../verbrauch/VerbrauchBalkendiagramm.tsx`
 * (dieselbe zugrundeliegende dataviz-Spezifikation: 4px-Eckenradius,
 * 2px-Balkenlücke, gedeckelte Balkenbreite, "runde Y-Achse auf saubere
 * Zahlen", Label-Kollisionsvermeidung durch Auslassen statt Rotation,
 * Trefferfläche größer als sichtbarer Balken, Tooltip an den
 * Diagrammrändern geklemmt). Balken statt Linie: ein Monatswert ist eine
 * diskrete Größe je Periode, eine Linie würde eine zwischen Monaten
 * tatsächlich nicht existierende Interpolation suggerieren.
 *
 * GENAU zwei feste Serien (Referenz `R_m` vs. Ist) — IMMER Legende UND
 * Direktbeschriftung (Farbe allein reicht bei Farbfehlsichtigkeit nicht,
 * s. `../verbrauch/verbrauchPalette.ts`-Kopfkommentar zur Tritan-Separation
 * dieser Palette). Die Direktbeschriftung nutzt Text-Tokens
 * (`fill-muted-foreground`), NIEMALS die Serienfarbe. Jeder Monatswert ist
 * hier IMMER vorhanden (kein Lücken-Konzept wie bei Verbrauch) — die
 * `zeilen`-Prop ist bereits die vollständige, sortierte Monatsfolge des
 * Laufs.
 */
export function BerechnungslaufMonatsBalkendiagramm(props: BerechnungslaufMonatsBalkendiagrammProps): ReactNode {
  const { titel, zeilen } = props;
  const [hover, setHover] = useState<HoverZustand | null>(null);
  const titelId = useId();

  const serienLabels: readonly [string, string] = [
    t('stammdaten.berechnung.diagramm.serieReferenz'),
    t('stammdaten.berechnung.diagramm.serieIst'),
  ];

  const direktLabelBreiteMax = maxOf(serienLabels.map(schaetzeTextbreite));
  const rand = berechneRand(direktLabelBreiteMax);
  const plotBreite = DIAGRAMM_BREITE - rand.links - rand.rechts;
  const plotHoehe = DIAGRAMM_HOEHE - rand.oben - rand.unten;
  const baselineY = rand.oben + plotHoehe;

  const referenzWerte = zeilen.map((zeile) => zeile.referenzKwh);
  const istWerte = zeilen.map((zeile) => zeile.istKwh);
  const maxWert = berechneMaxWert(referenzWerte, istWerte);
  const yTicks = berechneYAchse(maxWert);
  const yMax = yTicks[yTicks.length - 1] ?? 1;

  function yPosition(wert: number): number {
    return yMax > 0 ? baselineY - (wert / yMax) * plotHoehe : baselineY;
  }

  const positionen = berechneBalkenPositionen(zeilen.length, plotBreite);
  const bandBreite = zeilen.length > 0 ? plotBreite / zeilen.length : plotBreite;

  const labelText = zeilen.map((zeile) => zeile.monatLabel);
  const maxLabelBreite = maxOf(labelText.map(schaetzeTextbreite));
  const labelIndizes = new Set(waehleAchsenLabelIndizes(zeilen.length, bandBreite, maxLabelBreite));

  return (
    <figure aria-labelledby={titelId} className="space-y-2">
      <figcaption id={titelId} className="text-sm font-semibold text-foreground">
        {titel}
      </figcaption>
      <svg role="group" aria-labelledby={titelId} viewBox={`0 0 ${DIAGRAMM_BREITE} ${DIAGRAMM_HOEHE}`} className="w-full" style={{ maxHeight: 320 }}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={rand.links}
              x2={rand.links + plotBreite}
              y1={yPosition(tick)}
              y2={yPosition(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text x={rand.links - 8} y={yPosition(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
              {formatiereZahl(tick)}
            </text>
          </g>
        ))}

        <line x1={rand.links} x2={rand.links + plotBreite} y1={baselineY} y2={baselineY} className="stroke-border" strokeWidth={1} />

        {zeilen.map((_zeile, monatIndex) =>
          labelIndizes.has(monatIndex) ? (
            <text
              key={monatIndex}
              x={rand.links + bandBreite * monatIndex + bandBreite / 2}
              y={baselineY + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {labelText[monatIndex]}
            </text>
          ) : null,
        )}

        {positionen.map((position) => {
          const zeile = zeilen[position.monatIndex];
          if (zeile === undefined) {
            return null;
          }
          const wert = position.serienIndex === 0 ? zeile.referenzKwh : zeile.istKwh;
          const wertLabel = position.serienIndex === 0 ? zeile.referenzKwhLabel : zeile.istKwhLabel;
          const serienLabel = serienLabels[position.serienIndex];

          const x = rand.links + position.balkenX;
          const hoehe = Math.max(baselineY - yPosition(wert), 0);
          const istHover = hover?.monatIndex === position.monatIndex && hover.serienIndex === position.serienIndex;
          const trefferBreite = Math.max(position.balkenBreite, 8);
          const beschriftung = `${zeile.monatLabel}: ${wertLabel}, ${serienLabel}`;

          function setzeHover(aktiv: boolean): void {
            setHover(aktiv ? { monatIndex: position.monatIndex, serienIndex: position.serienIndex } : null);
          }

          return (
            <g key={`${String(position.monatIndex)}-${String(position.serienIndex)}`}>
              {/* Trefferfläche größer als der sichtbare Balken (volle Plot-Höhe) — Hit-Target > Mark. */}
              <rect
                x={x - (trefferBreite - position.balkenBreite) / 2}
                y={rand.oben}
                width={trefferBreite}
                height={plotHoehe}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={beschriftung}
                onPointerEnter={() => setzeHover(true)}
                onPointerLeave={() => setzeHover(false)}
                onFocus={() => setzeHover(true)}
                onBlur={() => setzeHover(false)}
                className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
              <path
                d={balkenPfad(x, baselineY, position.balkenBreite, hoehe)}
                className={cn(serienFuellKlasse(position.serienIndex), istHover && 'opacity-80')}
                pointerEvents="none"
              />
              {istHover && (
                <BerechnungTooltip
                  x={x + position.balkenBreite / 2}
                  y={yPosition(wert)}
                  monatLabel={zeile.monatLabel}
                  wertLabel={wertLabel}
                  serienLabel={serienLabel}
                  diagrammBreite={DIAGRAMM_BREITE}
                />
              )}
            </g>
          );
        })}

        {/* Direktbeschriftung je Serie (Text-Token, NIEMALS Serienfarbe) — bei fest 2 Serien immer sichtbar. */}
        {serienLabels.map((serienLabel, serienIndex) => (
          <text
            key={serienLabel}
            x={rand.links + plotBreite + 8}
            y={rand.oben + serienIndex * DIREKTLABEL_ZEILENHOEHE + 10}
            className="fill-muted-foreground text-[11px]"
          >
            {serienLabel}
          </text>
        ))}
      </svg>

      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t('stammdaten.berechnung.diagramm.legendeAriaLabel')}>
        {serienLabels.map((serienLabel, serienIndex) => (
          <li key={serienLabel} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', serienHintergrundKlasse(serienIndex === 0 ? 0 : 1))} />
            {serienLabel}
          </li>
        ))}
      </ul>
    </figure>
  );
}

interface BerechnungTooltipProps {
  readonly x: number;
  readonly y: number;
  readonly monatLabel: string;
  readonly wertLabel: string;
  readonly serienLabel: string;
  readonly diagrammBreite: number;
}

/**
 * Rein SVG-basierter Tooltip (kein `foreignObject`) — bleibt dadurch exakt an
 * den Diagramm-Koordinaten ausgerichtet, unabhängig von der tatsächlichen
 * Render-Skalierung des responsiven `viewBox`. `aria-hidden`, weil dieselbe
 * Information bereits vollständig im `aria-label` der Trefferfläche steckt
 * (identische Inhalte bei Hover UND Tastatur-Fokus, keine Doppel-Ansage).
 * X-Position wird an den Diagrammrändern geklemmt (kein Überlauf).
 */
function BerechnungTooltip(props: BerechnungTooltipProps): ReactNode {
  const { x, y, monatLabel, wertLabel, serienLabel, diagrammBreite } = props;
  const boxBreite = maxOf([schaetzeTextbreite(wertLabel), schaetzeTextbreite(monatLabel), schaetzeTextbreite(serienLabel)]) + 16;
  const boxHoehe = 48;
  const RAND_PUFFER = 4;
  const boxXRoh = x - boxBreite / 2;
  const boxX = Math.max(RAND_PUFFER, Math.min(boxXRoh, diagrammBreite - boxBreite - RAND_PUFFER));
  const boxY = Math.max(y - boxHoehe - 8, RAND_PUFFER);

  return (
    <g aria-hidden="true" pointerEvents="none">
      <rect x={boxX} y={boxY} width={boxBreite} height={boxHoehe} rx={4} className="fill-popover stroke-border" strokeWidth={1} />
      <text x={boxX + 8} y={boxY + 16} className="fill-popover-foreground text-[11px] font-semibold">
        {wertLabel}
      </text>
      <text x={boxX + 8} y={boxY + 30} className="fill-muted-foreground text-[10px]">
        {monatLabel}
      </text>
      <text x={boxX + 8} y={boxY + 44} className="fill-muted-foreground text-[10px]">
        {serienLabel}
      </text>
    </g>
  );
}
