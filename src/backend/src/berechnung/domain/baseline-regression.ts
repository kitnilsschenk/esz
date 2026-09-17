/**
 * ADR-0006 B13 — Herleitung der Baseline-Koeffizienten aus einer VERMESSENEN
 * Baseline-Periode (Standard-Messkonzept, Merkblatt Technik v2.2 Kap. 2.2.2).
 * REINE Domäne wie `witterung-gtz.ts`: keine I/O, keine NestJS-/DB-/
 * Zeit-Abhängigkeit, vollständig deterministisch.
 *
 * WARUM DIESE DATEI NEBEN `witterung-gtz.ts` STEHT UND NICHT DARIN
 * ------------------------------------------------------------------
 * Die Rechenvorschrift für den Monatswert ändert sich NICHT. Sie lautet in
 * beiden Messkonzepten
 *
 *     R_m = a₀ · (d_m / d_a)  +  b₁ · GTZ_m
 *
 * und lebt weiterhin ausschließlich in `referenzMonat()`. Vereinfachtes und
 * Standard-Messkonzept unterscheiden sich allein darin, WOHER (a₀, b₁)
 * kommen:
 *
 *   • vereinfacht (Kap. 2.1.2): normativ gesetzt aus der erfassten
 *     Jahres-Baseline B und dem Grundlast-Anteil g —
 *     a₀ = g·B, b₁ = (1−g)·B / GTZ_base.
 *   • Standard (Kap. 2.2.2): an die Vermessung angepasst — DIESE Datei.
 *
 * Diese Trennung ist der ganze Punkt: die Formel, die der Bewilligungsbehörde
 * erklärt wird, und die Golden Vectors, die sie versiegeln, bleiben
 * unangetastet. Ein zweiter Rechenkern wäre ein zweiter Erklärungsgegenstand
 * und eine zweite Fehlerquelle.
 *
 * DAS MODELL
 * ----------
 * Angepasst wird OHNE Achsenabschnitt, dafür mit den Kalendertagen als
 * eigenem Regressor:
 *
 *     kwh_m = c · d_m  +  b₁ · GTZ_m
 *
 * Das ist kein Kunstgriff, sondern die Form, die `referenzMonat()` ohnehin
 * rechnet: `c` IST die Tages-Grundlast, `a₀ = c · d_a` die Jahres-Grundlast.
 * Ein gewöhnlicher Achsenabschnitt würde dagegen unterstellen, dass jeder
 * Monat gleich lang ist — bei 28 bis 31 Tagen ein systematischer, immer
 * gleichgerichteter Fehler zugunsten der kurzen Monate.
 *
 * Kap. 2.2.2 verlangt ausdrücklich „mindestens Aussagen zum
 * einflussunabhängigen Anteil des Verbrauchs" — das ist genau `a₀`, und im
 * angepassten Modell ist es eine gemessene Größe statt einer gesetzten.
 *
 * GÜTEMASSE
 * ---------
 * Ausgewiesen werden drei, weil sie verschiedene Fragen beantworten und
 * einzeln jeweils täuschen können:
 *
 *   • R² — wie viel der Streuung das Modell erklärt. ZENTRIERT definiert
 *     (1 − SSE/SST mit SST um den Mittelwert), also so, wie ein Leser der
 *     Vorlage es erwartet. Für ein Modell ohne Achsenabschnitt ist auch die
 *     unzentrierte Variante gebräuchlich — sie fällt systematisch höher aus
 *     und schmeichelt dem Modell. Deshalb die zentrierte.
 *   • CV(RMSE) — die typische relative Abweichung. Deckt auf, wenn ein hohes
 *     R² allein aus dem starken Sommer-Winter-Kontrast stammt.
 *   • NMBE — der systematische Versatz. Dass er hier nahe null liegt, ist
 *     KEINE Güte: Kleinste Quadrate erzwingen es fast. Er steht dabei, weil
 *     eine fehlende Null-Zeile mehr über einen Datenfehler verriete als sein
 *     Vorhandensein über das Modell.
 */

/** Ein Monatspunkt der Vermessung. `tage` und `gtz` sind die Regressoren, `verbrauchKwh` die Zielgröße. */
export interface BaselinePunkt {
  /** Erster Kalendertag des Monats, ISO `YYYY-MM-DD` — nur für Diagnose/Determinismus der Reihenfolge. */
  readonly monat: string;
  /** d_m — Kalendertage im Monat, > 0. */
  readonly tage: number;
  /** GTZ_m — Gradtagzahl des Monats in der Baseline-Periode (Kd), ≥ 0. */
  readonly gtz: number;
  /** Gemessener Verbrauch des Monats in kWh, ≥ 0. */
  readonly verbrauchKwh: number;
}

/** Warum eine Anpassung nicht möglich war. Kein Code bedeutet „hat geklappt". */
export type RegressionHindernis =
  /** Zu wenige Monatspunkte (< MINDEST_PUNKTE). */
  | 'zu_wenige_punkte'
  /** Die Gradtagzahl variiert über die Punkte praktisch nicht — der Einfluss ist nicht trennbar (Kap. 2.2.2). */
  | 'gtz_variiert_nicht'
  /** Normalgleichung singulär bzw. numerisch nicht auflösbar. */
  | 'singulaer'
  /**
   * Angepasste Tages-Grundlast negativ — physikalisch unmöglich.
   *
   * Gegen den Pilotbestand A mit echten DWD-Daten geprüft: Die häufigste
   * Ursache ist NICHT ein Datenfehler, sondern eine zu hohe
   * Heizgrenztemperatur. Beim VDI-3807-Default von 15 °C tragen Mai und
   * September dort reichlich Gradtagzahl bei, obwohl das Gebäude nicht heizt;
   * die Anpassung gleicht das über eine steilere Kennlinie aus und drückt die
   * Grundlast unter null. Bei 9 °C passt dieselbe Reihe mit R² = 0,99.
   */
  | 'grundlast_negativ';

export interface BaselineRegressionErgebnis {
  /** c — Tages-Grundlast in kWh/d, ≥ 0. */
  readonly grundlastProTagKwh: number;
  /** b₁ — Steigung in kWh/Kd, ≥ 0. Null, wenn kein Witterungseinfluss nachweisbar war. */
  readonly koeffizientB1KwhProKd: number;
  /**
   * `false`, wenn die Anpassung b₁ ≤ 0 ergab. Dann ist b₁ auf 0 gesetzt und
   * das Modell ist ein reiner Grundlast-Verbraucher (g = 1) — der Strom-Fall.
   * Ein negativer Heizkoeffizient hieße „je kälter, desto weniger Heizenergie";
   * ihn stehen zu lassen wäre falsch, ihn stillschweigend zu kappen ebenso.
   */
  readonly witterungsanteilNachweisbar: boolean;
  /** R² (zentriert). Kann bei einem schlechten Modell negativ werden — das ist eine Aussage, kein Fehler. */
  readonly bestimmtheitsmass: number;
  /** CV(RMSE) in Prozent des Monatsmittels. */
  readonly cvRmsePct: number;
  /** NMBE in Prozent der Gesamtmenge. */
  readonly nmbePct: number;
  /** n — Zahl der eingegangenen Monatspunkte. */
  readonly punkte: number;
}

/**
 * Mindestzahl an Monatspunkten. Das Merkblatt nennt KEINE Zahl — Kap. 2.2.2
 * fordert qualitativ, dass die Einflussgrößen „soweit variieren, dass sich ihr
 * Einfluss auf den Energieverbrauch hinreichend bestimmt ableiten lässt".
 * Sechs Punkte auf zwei Parameter sind die untere Grenze, ab der eine Aussage
 * überhaupt belastbar ist; ein volles Jahr (12) ist der Regelfall und deckt
 * Sommer wie Winter ab. Der Wert steht hier und nicht in der Konfiguration,
 * weil er die Aussagekraft der Zahl bestimmt, nicht den Betrieb.
 */
export const MINDEST_PUNKTE = 6 as const;

/**
 * Untere Schranke für die relative Streuung der Gradtagzahl. Liegt
 * (max − min) / max darunter, ist der Witterungseinfluss rechnerisch nicht
 * vom Grundlastterm trennbar — die Normalgleichung ist dann zwar oft noch
 * lösbar, das Ergebnis aber beliebig.
 */
export const MINDEST_GTZ_STREUUNG = 0.05 as const;

export type BaselineRegressionAusgang =
  | { readonly art: 'erfolg'; readonly ergebnis: BaselineRegressionErgebnis }
  | { readonly art: 'hindernis'; readonly code: RegressionHindernis; readonly hinweis: string };

/**
 * Passt `kwh_m = c·d_m + b₁·GTZ_m` per kleinster Quadrate an und bewertet die
 * Anpassung. Wirft nicht — ein nicht anpassbarer Bestand ist ein fachliches
 * Ergebnis, kein Programmfehler, und der Aufrufer muss ihn dem Nutzer
 * erklären können.
 */
export function baselineRegression(punkte: readonly BaselinePunkt[]): BaselineRegressionAusgang {
  if (punkte.length < MINDEST_PUNKTE) {
    return {
      art: 'hindernis',
      code: 'zu_wenige_punkte',
      hinweis:
        `Die Vermessung liefert ${String(punkte.length)} Monatswert(e); fuer eine belastbare Anpassung sind ` +
        `mindestens ${String(MINDEST_PUNKTE)} noetig (Merkblatt Technik Kap. 2.2.2: die Einflussgroessen muessen ` +
        `waehrend des Messzeitraums hinreichend variieren).`,
    };
  }

  const gtzWerte = punkte.map((p) => p.gtz);
  const gtzMax = Math.max(...gtzWerte);
  const gtzMin = Math.min(...gtzWerte);
  if (gtzMax <= 0 || (gtzMax - gtzMin) / gtzMax < MINDEST_GTZ_STREUUNG) {
    return {
      art: 'hindernis',
      code: 'gtz_variiert_nicht',
      hinweis:
        `Die Gradtagzahl variiert ueber die Vermessung zu wenig (min ${gtzMin.toFixed(1)} Kd, max ` +
        `${gtzMax.toFixed(1)} Kd). Der Witterungseinfluss laesst sich dann nicht vom einflussunabhaengigen ` +
        `Anteil trennen — jede Aufteilung waere beliebig.`,
    };
  }

  // Normalgleichungen der 2-Parameter-Anpassung ohne Achsenabschnitt:
  //   [ Σd²   Σd·G ] [c ]   [ Σd·y ]
  //   [ Σd·G  ΣG²  ] [b₁] = [ ΣG·y ]
  let sDD = 0;
  let sDG = 0;
  let sGG = 0;
  let sDY = 0;
  let sGY = 0;
  for (const p of punkte) {
    sDD += p.tage * p.tage;
    sDG += p.tage * p.gtz;
    sGG += p.gtz * p.gtz;
    sDY += p.tage * p.verbrauchKwh;
    sGY += p.gtz * p.verbrauchKwh;
  }

  const determinante = sDD * sGG - sDG * sDG;
  if (!Number.isFinite(determinante) || Math.abs(determinante) < Number.EPSILON * Math.abs(sDD * sGG)) {
    return {
      art: 'hindernis',
      code: 'singulaer',
      hinweis:
        'Die Normalgleichung der Anpassung ist nicht eindeutig loesbar (singulaer). Tage und Gradtagzahl ' +
        'verlaufen ueber die Vermessung praktisch proportional.',
    };
  }

  let c = (sDY * sGG - sGY * sDG) / determinante;
  let b1 = (sGY * sDD - sDY * sDG) / determinante;

  // b₁ ≤ 0 heisst: je kaelter, desto weniger Verbrauch. Das ist kein Modell,
  // sondern der Befund "kein Witterungseinfluss nachweisbar" — der Regelfall
  // bei Strom. Dann wird auf den reinen Grundlast-Fall zurueckgefallen und
  // c NEU bestimmt (sonst traegt c die weggeworfene Steigung mit).
  const witterungsanteilNachweisbar = b1 > 0;
  if (!witterungsanteilNachweisbar) {
    b1 = 0;
    const summeTage = punkte.reduce((s, p) => s + p.tage, 0);
    const summeKwh = punkte.reduce((s, p) => s + p.verbrauchKwh, 0);
    c = summeTage > 0 ? summeKwh / summeTage : 0;
  }

  if (!Number.isFinite(c) || c < 0) {
    return {
      art: 'hindernis',
      code: 'grundlast_negativ',
      hinweis:
        `Die Anpassung ergibt eine negative Tages-Grundlast (${c.toFixed(3)} kWh/d). Ein Verbrauch unter null ` +
        'ist physikalisch unmoeglich. Haeufigste Ursache ist NICHT ein Datenfehler, sondern eine zu hohe ' +
        'Heizgrenztemperatur: Uebergangsmonate tragen dann Gradtagzahl bei, obwohl das Gebaeude nicht heizt. ' +
        'Die Anpassung gleicht das ueber eine steilere Kennlinie aus und drueckt die Grundlast unter null. ' +
        'Zuerst `t_heizgrenze_c` pruefen (VDI-3807-Default 15 °C ist fuer gut gedaemmte Nichtwohngebaeude oft ' +
        'zu hoch), danach die Eingangsdaten.',
    };
  }

  const mittel = punkte.reduce((s, p) => s + p.verbrauchKwh, 0) / punkte.length;
  let sse = 0;
  let sst = 0;
  let versatz = 0;
  for (const p of punkte) {
    const vorhersage = c * p.tage + b1 * p.gtz;
    const rest = p.verbrauchKwh - vorhersage;
    sse += rest * rest;
    sst += (p.verbrauchKwh - mittel) * (p.verbrauchKwh - mittel);
    versatz += rest;
  }

  const summeKwh = punkte.reduce((s, p) => s + p.verbrauchKwh, 0);
  // Freiheitsgrade: n − 2 angepasste Parameter. Bei b₁ = 0 wurde nur einer
  // bestimmt — dann n − 1, sonst waere die Streuung kuenstlich aufgeblaeht.
  const freiheitsgrade = Math.max(1, punkte.length - (witterungsanteilNachweisbar ? 2 : 1));

  return {
    art: 'erfolg',
    ergebnis: {
      grundlastProTagKwh: c,
      koeffizientB1KwhProKd: b1,
      witterungsanteilNachweisbar,
      // SST = 0 hiesse: alle Monate exakt gleich. Dann erklaert das Modell
      // nichts, weil es nichts zu erklaeren gibt — R² ist undefiniert, nicht 1.
      bestimmtheitsmass: sst > 0 ? 1 - sse / sst : 0,
      cvRmsePct: mittel > 0 ? (Math.sqrt(sse / freiheitsgrade) / mittel) * 100 : 0,
      nmbePct: summeKwh > 0 ? (versatz / summeKwh) * 100 : 0,
      punkte: punkte.length,
    },
  };
}

/**
 * Ein Monat der Vermessung, BEVOR die Gradtagzahl gebildet ist.
 *
 * Für die Heizgrenzensuche genügt `BaselinePunkt` nicht: Dort ist die
 * Gradtagzahl bereits ausgerechnet, sie hängt aber genau an der Größe, die
 * gesucht wird. Deshalb kommen hier die Tagesmitteltemperaturen mit.
 */
export interface VermessungsMonat {
  readonly monat: string;
  readonly tage: number;
  readonly verbrauchKwh: number;
  /** Tagesmitteltemperaturen der Monatsscheibe in °C. */
  readonly temperaturenC: readonly number[];
}

export interface HeizgrenzeKandidat {
  readonly tHeizgrenzeC: number;
  /** `null`, wenn die Anpassung bei dieser Heizgrenze scheitert (dann steht der Grund in `hindernis`). */
  readonly cvRmsePct: number | null;
  readonly bestimmtheitsmass: number | null;
  readonly grundlastProTagKwh: number | null;
  readonly hindernis: RegressionHindernis | null;
}

export interface HeizgrenzeVorschlag {
  /** Die Heizgrenze mit dem kleinsten CV(RMSE) unter den Kandidaten. */
  readonly tHeizgrenzeC: number;
  readonly cvRmsePct: number;
  readonly bestimmtheitsmass: number;
  readonly grundlastProTagKwh: number;
  /** Alle geprüften Kandidaten — die Wahl soll nachvollziehbar sein, nicht geglaubt werden müssen. */
  readonly kandidaten: readonly HeizgrenzeKandidat[];
}

/**
 * Geprüfte Heizgrenztemperaturen in °C.
 *
 * Der VDI-3807-Standardwert 15 °C ist die obere Grenze des Bereichs, nicht
 * seine Mitte: Er stammt aus dem Wohngebäudebestand, und Abweichungen nach
 * oben sind selten. Nach unten dagegen häufig — gut gedämmte Nichtwohngebäude
 * mit hohen internen Lasten (Personen, IT) heizen erst deutlich später.
 */
export const HEIZGRENZE_KANDIDATEN: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16];

/**
 * Sucht die Heizgrenze, bei der das Modell die Vermessung am besten trifft.
 *
 * **Warum CV(RMSE) und nicht R² als Kriterium.** R² belohnt einen großen
 * Sommer-Winter-Kontrast; eine zu hohe Heizgrenze erzeugt genau den, indem sie
 * den Übergangsmonaten Gradtagzahl zuschreibt. Das Maß, das die Wahl treffen
 * soll, darf nicht dasselbe belohnen, was der Fehler erzeugt. CV(RMSE) misst
 * die typische Abweichung und reagiert darauf richtig herum.
 *
 * **Kandidaten ohne nachweisbaren Witterungsanteil zählen nicht.** Bei b₁ = 0
 * ist die Heizgrenze bedeutungslos — jede Wahl liefert dasselbe Modell, und
 * die Suche würde eine Genauigkeit vortäuschen, die es nicht gibt. Für solche
 * Systeme gibt die Funktion `null` zurück.
 *
 * Gibt `null` zurück, wenn KEIN Kandidat ein brauchbares Modell ergibt. Das
 * ist dann kein Parameterproblem mehr, sondern ein Datenproblem.
 */
export function sucheHeizgrenze(
  monate: readonly VermessungsMonat[],
  gradtagzahlTag: (tMittelC: number, tHeizgrenzeC: number) => number,
  kandidaten: readonly number[] = HEIZGRENZE_KANDIDATEN,
): HeizgrenzeVorschlag | null {
  const gepruefte: HeizgrenzeKandidat[] = [];
  let bester: (HeizgrenzeVorschlag & { readonly _cv: number }) | null = null;

  for (const tH of kandidaten) {
    const punkte: BaselinePunkt[] = monate.map((m) => ({
      monat: m.monat,
      tage: m.tage,
      gtz: m.temperaturenC.reduce((summe, t) => summe + gradtagzahlTag(t, tH), 0),
      verbrauchKwh: m.verbrauchKwh,
    }));
    const ausgang = baselineRegression(punkte);

    if (ausgang.art === 'hindernis') {
      gepruefte.push({
        tHeizgrenzeC: tH,
        cvRmsePct: null,
        bestimmtheitsmass: null,
        grundlastProTagKwh: null,
        hindernis: ausgang.code,
      });
      continue;
    }

    const e = ausgang.ergebnis;
    gepruefte.push({
      tHeizgrenzeC: tH,
      cvRmsePct: e.cvRmsePct,
      bestimmtheitsmass: e.bestimmtheitsmass,
      grundlastProTagKwh: e.grundlastProTagKwh,
      hindernis: null,
    });

    if (!e.witterungsanteilNachweisbar) {
      continue;
    }
    if (bester === null || e.cvRmsePct < bester._cv) {
      bester = {
        _cv: e.cvRmsePct,
        tHeizgrenzeC: tH,
        cvRmsePct: e.cvRmsePct,
        bestimmtheitsmass: e.bestimmtheitsmass,
        grundlastProTagKwh: e.grundlastProTagKwh,
        kandidaten: [],
      };
    }
  }

  if (bester === null) {
    return null;
  }
  return {
    tHeizgrenzeC: bester.tHeizgrenzeC,
    cvRmsePct: bester.cvRmsePct,
    bestimmtheitsmass: bester.bestimmtheitsmass,
    grundlastProTagKwh: bester.grundlastProTagKwh,
    kandidaten: gepruefte,
  };
}

/**
 * Rechnet die angepassten Koeffizienten in die Grössen zurück, mit denen der
 * Lauf und `referenzMonat()` seit jeher arbeiten:
 *
 *     a₀ = c · d_a                    (Jahres-Grundlast)
 *     B  = a₀ + b₁ · GTZ_base         (Jahres-Baseline unter Baseline-Wetter)
 *     g  = a₀ / B                     (Grundlast-Anteil)
 *
 * Damit durchläuft der Standard-Pfad DIESELBE Rechenvorschrift und füllt
 * DIESELBEN Spalten wie der vereinfachte. Wer den Nachweis prüft, sieht ein
 * Verfahren, nicht zwei.
 */
export function koeffizientenInBaselineGroessen(input: {
  readonly grundlastProTagKwh: number;
  readonly koeffizientB1KwhProKd: number;
  readonly gtzBase: number;
  readonly tageProJahr: number;
}): { readonly baselineJahresWertKwh: number; readonly grundlastAnteil: number } {
  const a0 = input.grundlastProTagKwh * input.tageProJahr;
  const b = a0 + input.koeffizientB1KwhProKd * input.gtzBase;
  if (!(b > 0)) {
    // Kann nur eintreten, wenn die Vermessung durchgehend Verbrauch 0 zeigt.
    // g=1 ist dann die einzige Aufteilung, die referenzMonat() nicht auf eine
    // Division durch null fuehrt.
    return { baselineJahresWertKwh: 0, grundlastAnteil: 1 };
  }
  return { baselineJahresWertKwh: b, grundlastAnteil: Math.min(1, Math.max(0, a0 / b)) };
}
