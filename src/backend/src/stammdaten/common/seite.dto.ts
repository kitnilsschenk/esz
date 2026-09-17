/** Response-Form für `components/schemas/SeitenInfo` (stammdaten.openapi.yaml). */
export interface SeitenInfo {
  readonly naechsterCursor: string | null;
  readonly limit: number;
}

export interface Seite<T> {
  readonly daten: readonly T[];
  readonly seite: SeitenInfo;
}

export function toSeite<T>(daten: readonly T[], naechsterCursor: string | null, limit: number): Seite<T> {
  return { daten, seite: { naechsterCursor, limit } };
}
