/**
 * ADR-0008 §16 (D4) — break-glass-Konstanten für `read:verbrauch_detail`.
 *
 * `MAX_FENSTER_TAGE`: der ADR nennt "Vorschlag: ≤ 7 Tage, final
 * security-lead/compliance-director" (§16, C2 offener Punkt §29) — dieser
 * Wert ist daher PROVISORISCH und muss vor dem ersten realen Konsumenten
 * (ADR-0005, s. §16 "break-glass-Härtung") final von `security-lead`/
 * `compliance-director` bestätigt werden.
 *
 * `BREAK_GLASS_ZWECK_WHITELIST`: der ADR nennt exemplarisch
 * `stoerungsdiagnose` (§16). Erweiterung NUR nach Review
 * (`access-control-engineer`/`compliance-director`) — kein Freitext (rote
 * Linie 2).
 */
export const MAX_FENSTER_TAGE = 7;

export const BREAK_GLASS_ZWECK_WHITELIST = ['stoerungsdiagnose'] as const;

export type BreakGlassZweckCode = (typeof BREAK_GLASS_ZWECK_WHITELIST)[number];

export function isBreakGlassZweckCode(value: string): value is BreakGlassZweckCode {
  return (BREAK_GLASS_ZWECK_WHITELIST as readonly string[]).includes(value);
}
