/**
 * Entscheidet, ob ein Navigations-Eintrag zur aktuellen Route gehört.
 *
 * Bewusst eine eigene, reine Funktion statt `NavLink`s eingebautem
 * `isActive` — aus zwei Gründen:
 *
 * 1. **Zusatzpfade.** Einige Detail-Routen liegen unter einem ANDEREN
 *    Top-Level-Präfix als der Nav-Eintrag, zu dem sie fachlich gehören:
 *    Ein Messkanal-Detail lebt unter `/stammdaten/messkanaele/:id`, gehört
 *    aber zum Eintrag „Zähler & Messkanäle" (`/stammdaten/zaehler`).
 *    `NavLink` kann nur EIN Ziel prüfen — die Markierung erlosch dort also
 *    ausgerechnet bei der Route, die der Eintrag im Namen führt.
 * 2. **Testbarkeit.** Als reine Funktion ist die Zuordnung ohne Router und
 *    ohne Rendering prüfbar.
 *
 * Der Abgleich ist SEGMENTWEISE: `/stammdaten/zaehler` passt auf
 * `/stammdaten/zaehler/123`, aber nicht auf `/stammdaten/zaehlerwerk`.
 */
export interface NavAktivPfade {
  readonly to: string;
  /**
   * `true` = nur exakte Übereinstimmung. Zwingend für den Arbeitsplatz
   * (`/`) — als Präfix betrachtet würde er auf JEDER Route passen und die
   * Startseite dauerhaft als aktiv markieren.
   */
  readonly exakt?: boolean;
  /** Weitere Pfad-Präfixe, die diesen Eintrag ebenfalls aktiv setzen. */
  readonly weiterePfade?: readonly string[];
}

function passt(pathname: string, ziel: string, exakt: boolean): boolean {
  if (pathname === ziel) {
    return true;
  }
  return !exakt && pathname.startsWith(`${ziel}/`);
}

export function istNavEintragAktiv(pathname: string, eintrag: NavAktivPfade): boolean {
  if (passt(pathname, eintrag.to, eintrag.exakt ?? false)) {
    return true;
  }
  return (eintrag.weiterePfade ?? []).some((pfad) => passt(pathname, pfad, false));
}
