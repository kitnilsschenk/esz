import { useId, useState, type ReactNode } from 'react';
import type { Aufloesung } from '@edms/shared';
import type { VerbrauchSerieView } from '../../hooks/verbrauch';
import { formatiereBucket, formatiereWert } from '../../hooks/verbrauch';
import { cn } from '../../../../shared/lib/cn';
import { t } from '../../../../shared/i18n/t';
import { serienFuellKlasse, serienHintergrundKlasse } from './verbrauchPalette';
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
} from './verbrauchDiagrammLayout';

export interface VerbrauchBalkendiagrammProps {
  /**
   * Sichtbarer Titel des Diagramms (Figure-Caption) — bei GENAU einer Serie
   * benennt er sie explizit (z. B. "Wirkarbeit (kWh)"), s.
   * `VerbrauchAnsicht`. KEINE Legendenbox bei einer einzigen Serie
   * (dataviz-Skill: "der Titel benennt sie").
   */
  readonly titel: string;
  readonly einheit: string;
  readonly aufloesung: Aufloesung;
  /** Erwartete Bucket-Startzeiten (ISO, UTC) — die x-Achse. */
  readonly buckets: readonly string[];
  readonly serien: readonly VerbrauchSerieView[];
}

interface HoverZustand {
  readonly serienIndex: number;
  readonly bucketIndex: number;
}

/**
 * Handgeschriebenes SVG-Balkendiagramm — bewusst OHNE Chart-Bibliothek
 * (Bundle-Budget, `dataviz`-Skill). Balken statt Linie: Verbrauch je
 * Zeit-Bucket ist eine diskrete Größe je Periode, eine Linie würde eine
 * Interpolation zwischen Perioden suggerieren, die es fachlich nicht gibt.
 *
 * Lücken (`serie.werte[i] === undefined`) werden NIE als Nullbalken
 * gezeichnet — der Bucket bleibt leer, weder Pfad noch Trefferfläche
 * entstehen dafür (die Gesamtzahl der Lücken zeigt `VerbrauchAnsicht` separat
 * über `metadaten.erkannteLuecken` an).
 *
 * Bei ≥2 Serien sind Legende UND Direktbeschriftung PFLICHT (die
 * Tritan-Separation dieser Palette liegt bei ~5,4, unter der 8er-Schwelle —
 * Farbe allein reicht bei Farbfehlsichtigkeit nicht). Die Direktbeschriftung
 * nutzt Text-Tokens (`fill-muted-foreground`), NIEMALS die Serienfarbe.
 */
export function VerbrauchBalkendiagramm(props: VerbrauchBalkendiagrammProps): ReactNode {
  const { titel, einheit, aufloesung, buckets, serien } = props;
  const [hover, setHover] = useState<HoverZustand | null>(null);
  const titelId = useId();

  const mehrereSerien = serien.length > 1;

  const direktLabelBreiteMax = mehrereSerien ? maxOf(serien.map((serie) => schaetzeTextbreite(serie.messgroesse))) : 0;
  const rand = berechneRand(direktLabelBreiteMax);
  const plotBreite = DIAGRAMM_BREITE - rand.links - rand.rechts;
  const plotHoehe = DIAGRAMM_HOEHE - rand.oben - rand.unten;
  const baselineY = rand.oben + plotHoehe;

  const maxWert = berechneMaxWert(serien);
  const yTicks = berechneYAchse(maxWert);
  const yMax = yTicks[yTicks.length - 1] ?? 1;

  function yPosition(wert: number): number {
    return yMax > 0 ? baselineY - (wert / yMax) * plotHoehe : baselineY;
  }

  const positionen = berechneBalkenPositionen(buckets.length, serien.length, plotBreite);
  const bandBreite = buckets.length > 0 ? plotBreite / buckets.length : plotBreite;

  const labelText = buckets.map((zeitpunkt) => formatiereBucket(zeitpunkt, aufloesung));
  const maxLabelBreite = maxOf(labelText.map(schaetzeTextbreite));
  const labelIndizes = new Set(waehleAchsenLabelIndizes(buckets.length, bandBreite, maxLabelBreite));

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
              {formatiereWert(tick)}
            </text>
          </g>
        ))}

        <line x1={rand.links} x2={rand.links + plotBreite} y1={baselineY} y2={baselineY} className="stroke-border" strokeWidth={1} />

        {buckets.map((_zeitpunkt, bucketIndex) =>
          labelIndizes.has(bucketIndex) ? (
            <text
              key={bucketIndex}
              x={rand.links + bandBreite * bucketIndex + bandBreite / 2}
              y={baselineY + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {labelText[bucketIndex]}
            </text>
          ) : null,
        )}

        {positionen.map((position) => {
          const serie = serien[position.serienIndex];
          const zeitpunkt = buckets[position.bucketIndex];
          const wert = serie?.werte[position.bucketIndex];
          if (serie === undefined || zeitpunkt === undefined || wert === undefined) {
            // Lücke: bewusst KEIN Pfad, KEINE Trefferfläche — niemals als Nullbalken zeichnen.
            return null;
          }

          const x = rand.links + position.balkenX;
          const hoehe = Math.max(baselineY - yPosition(wert), 0);
          const istHover = hover?.serienIndex === position.serienIndex && hover.bucketIndex === position.bucketIndex;
          const trefferBreite = Math.max(position.balkenBreite, 8);
          const zeitpunktText = formatiereBucket(zeitpunkt, aufloesung);
          const wertText = `${formatiereWert(wert)} ${einheit}`;
          const beschriftung = mehrereSerien ? `${zeitpunktText}: ${wertText}, ${serie.messgroesse}` : `${zeitpunktText}: ${wertText}`;

          function setzeHover(aktiv: boolean): void {
            setHover(aktiv ? { serienIndex: position.serienIndex, bucketIndex: position.bucketIndex } : null);
          }

          return (
            <g key={`${position.serienIndex}-${position.bucketIndex}`}>
              {/* Trefferfläche größer als der sichtbare Balken (volle Plot-Höhe) — "Interaction": Hit-Target > Mark. */}
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
                <VerbrauchTooltip
                  x={x + position.balkenBreite / 2}
                  y={yPosition(wert)}
                  zeitpunktText={zeitpunktText}
                  wertText={wertText}
                  serienLabel={mehrereSerien ? serie.messgroesse : undefined}
                  diagrammBreite={DIAGRAMM_BREITE}
                />
              )}
            </g>
          );
        })}

        {/* Direktbeschriftung je Serie (Text-Token, NIEMALS Serienfarbe) — Pflicht bei ≥2 Serien. */}
        {mehrereSerien &&
          serien.map((serie, serienIndex) => (
            <text
              key={serie.key}
              x={rand.links + plotBreite + 8}
              y={rand.oben + serienIndex * DIREKTLABEL_ZEILENHOEHE + 10}
              className="fill-muted-foreground text-[11px]"
            >
              {serie.messgroesse}
            </text>
          ))}
      </svg>

      {mehrereSerien && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t('stammdaten.verbrauch.diagramm.legendeAriaLabel')}>
          {serien.map((serie, serienIndex) => (
            <li key={serie.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', serienHintergrundKlasse(serienIndex))} />
              {serie.messgroesse}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

interface VerbrauchTooltipProps {
  readonly x: number;
  readonly y: number;
  readonly zeitpunktText: string;
  readonly wertText: string;
  readonly serienLabel: string | undefined;
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
function VerbrauchTooltip(props: VerbrauchTooltipProps): ReactNode {
  const { x, y, zeitpunktText, wertText, serienLabel, diagrammBreite } = props;
  const breiten = [schaetzeTextbreite(wertText), schaetzeTextbreite(zeitpunktText), serienLabel !== undefined ? schaetzeTextbreite(serienLabel) : 0];
  const boxBreite = maxOf(breiten) + 16;
  const boxHoehe = serienLabel !== undefined ? 48 : 34;
  const RAND_PUFFER = 4;
  const boxXRoh = x - boxBreite / 2;
  const boxX = Math.max(RAND_PUFFER, Math.min(boxXRoh, diagrammBreite - boxBreite - RAND_PUFFER));
  const boxY = Math.max(y - boxHoehe - 8, RAND_PUFFER);

  return (
    <g aria-hidden="true" pointerEvents="none">
      <rect x={boxX} y={boxY} width={boxBreite} height={boxHoehe} rx={4} className="fill-popover stroke-border" strokeWidth={1} />
      <text x={boxX + 8} y={boxY + 16} className="fill-popover-foreground text-[11px] font-semibold">
        {wertText}
      </text>
      <text x={boxX + 8} y={boxY + 30} className="fill-muted-foreground text-[10px]">
        {zeitpunktText}
      </text>
      {serienLabel !== undefined && (
        <text x={boxX + 8} y={boxY + 44} className="fill-muted-foreground text-[10px]">
          {serienLabel}
        </text>
      )}
    </g>
  );
}
