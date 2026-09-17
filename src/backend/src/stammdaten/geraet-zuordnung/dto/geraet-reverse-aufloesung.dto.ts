import { IsIn, IsString, Matches } from 'class-validator';
import { GERAET_REVERSE_ZWECK_WHITELIST, TICKET_REF_FORMAT } from '../../../auth/policy/geraet-reverse.constants';
import type { GeraetReverseZweckCode } from '../../../auth/policy/geraet-reverse.constants';

/**
 * `components/schemas/GeraetReverseAufloesungAnfrage` (stammdaten.openapi.yaml,
 * ADR-0005 §26.4 SEC-5). Strukturelle 400-Validierung (Defense-in-Depth,
 * `.claude/rules/backend-nestjs.md`: "Alle Eingaben validiert") — die
 * ABAC-relevante Whitelist-/Format-PRÜFUNG selbst (403-Deny-Gründe) läuft
 * UNABHÄNGIG davon im `InCodePolicyAdapter.evaluateGeraetReverse()`
 * (Separation of Concerns, s. `geraet-reverse-zugriff.util.ts`-Kommentar).
 * Dieselben Konstanten (`GERAET_REVERSE_ZWECK_WHITELIST`/`TICKET_REF_FORMAT`)
 * — kein zweites, potenziell abweichendes Vokabular.
 */
export class GeraetReverseAufloesungDto {
  @IsIn(GERAET_REVERSE_ZWECK_WHITELIST)
  zweck!: GeraetReverseZweckCode;

  @IsString()
  @Matches(TICKET_REF_FORMAT, {
    message: 'ticketRef muss dem Format GROSSBUCHSTABEN-ZIFFERN entsprechen (z. B. HD-1234) — kein Freitext.',
  })
  ticketRef!: string;
}
