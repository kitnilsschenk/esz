import { useMemo, useState } from 'react';
import type { Aufloesung, VerbrauchAggregatMetadaten } from '@edms/shared';
import { useVerbrauch } from '../../api/verbrauch';
import { berechneAnfrageZeitraum, erzeugeBucketZeitpunkte, heutigesDatumUtc, standardZeitraumFuer } from './verbrauchZeitraum';

export interface VerbrauchSerieView {
  /** Stabiler Schlüssel INNERHALB einer Einheiten-Gruppe (= Messgröße). */
  readonly key: string;
  readonly messgroesse: string;
  /** Ausgerichtet auf `buckets` — `undefined` an Position `i` bedeutet: Lücke, NIEMALS `0`. */
  readonly werte: readonly (number | undefined)[];
}

export interface VerbrauchGruppeView {
  readonly einheit: string;
  readonly serien: readonly VerbrauchSerieView[];
}

export interface VerbrauchTabellenZeileView {
  readonly zeitpunkt: string;
  readonly messgroesse: string;
  readonly einheit: string;
  /** `undefined` = Lücke (kein belastbarer Wert für diesen Bucket). */
  readonly wert: number | undefined;
}

export interface VerbrauchView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** `true`, solange `vonDatum` NICHT vor `bisDatum` liegt — Abfrage wird in diesem Fall gar nicht erst abgesetzt. */
  readonly zeitraumUngueltig: boolean;
  /** `true`, wenn die Abfrage erfolgreich war, aber GAR KEINE Messwerte im Zeitraum existieren (Leerzustand, KEIN Fehler). */
  readonly istLeer: boolean;
  /** Erwartete Bucket-Grenzen (ISO, UTC) — die x-Achse ALLER Diagramme dieser Ansicht. */
  readonly buckets: readonly string[];
  /** JE Einheit ein eigenes Diagramm (small multiples) — nie zwei Einheiten in einem Achsenkreuz. */
  readonly gruppen: readonly VerbrauchGruppeView[];
  readonly tabelle: readonly VerbrauchTabellenZeileView[];
  readonly metadaten: VerbrauchAggregatMetadaten | undefined;
  readonly aufloesung: Aufloesung;
  readonly vonDatum: string;
  readonly bisDatum: string;
  readonly inklusiveUnterknoten: boolean;
  readonly setVonDatum: (datum: string) => void;
  readonly setBisDatum: (datum: string) => void;
  readonly setAufloesung: (aufloesung: Aufloesung) => void;
  readonly setInklusiveUnterknoten: (wert: boolean) => void;
}

/**
 * View-Model der Standort-Verbrauchsanzeige (letztes fehlendes
 * Ausliefer-Stück, `messwerte.openapi.yaml` Route A). Kapselt:
 *  - den lokalen UI-Zustand der Zeitraumwahl (Filter sind reiner Client-
 *    Zustand, KEIN Server-State, `.claude/rules/frontend-react.md`),
 *  - die Normalisierung auf `time_bucket`-taugliche Grenzen
 *    (`berechneAnfrageZeitraum`),
 *  - die Gruppierung der flachen Zeitreihe nach `einheit` (getrennte
 *    Diagramme, "Niemals zwei y-Achsen") und darunter nach `messgroesse`
 *    (Serien EINER Einheit),
 *  - die Ausrichtung jeder Serie auf die vollständige erwartete
 *    Bucket-Folge (`erzeugeBucketZeitpunkte`) — ein in der Server-Antwort
 *    FEHLENDER Bucket wird zu `undefined` (Lücke), NIE zu `0`.
 */
export function useVerbrauchView(standortId: string): VerbrauchView {
  const [bisDatum, setBisDatumState] = useState<string>(() => heutigesDatumUtc());
  const [vonDatum, setVonDatumState] = useState<string>(() => standardZeitraumFuer('tag', heutigesDatumUtc()).von);
  const [aufloesung, setAufloesungState] = useState<Aufloesung>('tag');
  const [inklusiveUnterknoten, setInklusiveUnterknoten] = useState<boolean>(true);

  const zeitraumUngueltig = vonDatum > bisDatum;

  const { von, bis } = useMemo(
    () => berechneAnfrageZeitraum(vonDatum, bisDatum, aufloesung),
    [vonDatum, bisDatum, aufloesung],
  );

  const query = useVerbrauch(
    standortId,
    { von, bis, aufloesung, inklusiveUnterknoten },
    { enabled: !zeitraumUngueltig },
  );

  const buckets = useMemo(() => erzeugeBucketZeitpunkte(von, bis, aufloesung), [von, bis, aufloesung]);

  const zeitreihe = query.data?.zeitreihe ?? [];

  const { gruppen, tabelle } = useMemo(() => {
    // Reihenfolge der Einheiten UND der Messgrößen je Einheit = erstes
    // Auftreten in der Server-Antwort (stabil, KEINE alphabetische
    // Neusortierung) — die Server-Antwort selbst ist nach
    // `zeitpunkt, messgroesse, einheit` sortiert (Repository-Query), Gruppen
    // erscheinen also in konsistenter Reihenfolge über mehrere Aufrufe hinweg.
    const einheiten: string[] = [];
    const messgroessenProEinheit = new Map<string, string[]>();
    const wertProSchluessel = new Map<string, number>();

    for (const punkt of zeitreihe) {
      if (!messgroessenProEinheit.has(punkt.einheit)) {
        einheiten.push(punkt.einheit);
        messgroessenProEinheit.set(punkt.einheit, []);
      }
      const messgroessen = messgroessenProEinheit.get(punkt.einheit);
      if (messgroessen !== undefined && !messgroessen.includes(punkt.messgroesse)) {
        messgroessen.push(punkt.messgroesse);
      }
      wertProSchluessel.set(`${punkt.einheit}::${punkt.messgroesse}::${punkt.zeitpunkt}`, punkt.wert);
    }

    const gruppenErgebnis: VerbrauchGruppeView[] = einheiten.map((einheit) => ({
      einheit,
      serien: (messgroessenProEinheit.get(einheit) ?? []).map((messgroesse) => ({
        key: messgroesse,
        messgroesse,
        werte: buckets.map((zeitpunkt) => wertProSchluessel.get(`${einheit}::${messgroesse}::${zeitpunkt}`)),
      })),
    }));

    const tabelleErgebnis: VerbrauchTabellenZeileView[] = gruppenErgebnis.flatMap((gruppe) =>
      gruppe.serien.flatMap((serie) =>
        buckets.map((zeitpunkt, index) => ({
          zeitpunkt,
          messgroesse: serie.messgroesse,
          einheit: gruppe.einheit,
          wert: serie.werte[index],
        })),
      ),
    );

    return { gruppen: gruppenErgebnis, tabelle: tabelleErgebnis };
  }, [zeitreihe, buckets]);

  return {
    isPending: query.isPending && !zeitraumUngueltig,
    isError: query.isError,
    zeitraumUngueltig,
    istLeer: query.isSuccess && zeitreihe.length === 0,
    buckets,
    gruppen,
    tabelle,
    metadaten: query.data?.metadaten,
    aufloesung,
    vonDatum,
    bisDatum,
    inklusiveUnterknoten,
    setVonDatum: setVonDatumState,
    setBisDatum: setBisDatumState,
    setAufloesung: (naechsteAufloesung: Aufloesung) => {
      setAufloesungState(naechsteAufloesung);
      const naechsterZeitraum = standardZeitraumFuer(naechsteAufloesung, bisDatum);
      setVonDatumState(naechsterZeitraum.von);
      setBisDatumState(naechsterZeitraum.bis);
    },
    setInklusiveUnterknoten,
  };
}
