// Client-seitige SPIEGELUNG der break-glass-Konstanten aus
// `src/backend/src/auth/policy/break-glass.constants.ts` (ADR-0008 §16/D4) —
// rein für UI-Komfort (Vorbefüllung/weiche Client-Validierung VOR dem
// Request), die Autorität bleibt beim PDP (`InCodePolicyAdapter.
// evaluateBreakGlass()`), der dieselben Grenzen serverseitig erneut prüft
// und bei Verstoß mit 403 (`break_glass_grenzen_verletzt`/`zweck_fehlt`)
// ablehnt. KEIN Duplizieren von Sicherheitslogik, nur von Formular-UX-Regeln
// (analog `standortConstants.ts`).
//
// Die Whitelist ist NICHT Teil der generierten OpenAPI-Typen (der Header
// `X-Edms-Zugriffszweck` ist dort ein einfacher `string`) — daher hier von
// Hand nachgeführt. Ändert sich `BREAK_GLASS_ZWECK_WHITELIST` im Backend,
// MUSS diese Liste synchron nachgezogen werden (sonst zeigt die Auswahl
// Werte an, die serverseitig abgelehnt würden).

export const BREAK_GLASS_ZWECK_WHITELIST = ['stoerungsdiagnose'] as const;

export type BreakGlassZweckCode = (typeof BREAK_GLASS_ZWECK_WHITELIST)[number];

/** Maximale Fensterbreite (Tage) des break-glass-Zwecks (`bisTs - vonTs`), ADR-0008 §16. */
export const MAX_FENSTER_TAGE = 7;
