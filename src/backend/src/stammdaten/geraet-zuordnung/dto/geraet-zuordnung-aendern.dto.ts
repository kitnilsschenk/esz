import { IsIn } from 'class-validator';

const AKTIONEN = ['deaktivieren'] as const;
export type GeraetZuordnungAktion = (typeof AKTIONEN)[number];

/**
 * `components/schemas/GeraetZuordnungAendern` (stammdaten.openapi.yaml,
 * ADR-0005 §26.4). v1 MINIMAL: nur `deaktivieren` (status→`inaktiv`,
 * `gueltig_bis=now()`). Ein Geraete-Tausch am selben Zaehler ist in v1 ZWEI
 * Client-Aufrufe (PATCH deaktivieren + anschliessendes POST auf die
 * Create-Route mit der neuen DevEUI) — KEIN eigener "Tausch-in-einem-Call"-
 * Modus (Aufgabenstellung: "minimal fuer v1"). `aktion` als Enum-Feld
 * (statt leerem Body) haelt die DTO additiv erweiterbar (z. B. ein
 * kuenftiges `'tauschen'`), ohne einen Breaking Change zu erzwingen.
 */
export class GeraetZuordnungAendernDto {
  @IsIn(AKTIONEN)
  aktion!: GeraetZuordnungAktion;
}
