/**
 * Eine Herkunfts-Zuordnung, wie die API sie ausgibt (ADR-0011 B2/D3).
 *
 * AUSSCHLIESSLICH Kennungen, keine Namen — auf BEIDEN Seiten und aus zwei
 * verschiedenen Gruenden:
 *
 * - Die ChirpStack-Namen (`tenantName`, `applicationName`) werden gar nicht
 *   erst gelesen (D1): Freitext aus einem fremden System, ohne Feldkatalog
 *   und ohne Loeschkonzept; im Beleg stand dort faktisch eine Anschrift.
 * - Der EDMS-Standortname liegt feldverschluesselt in `identity.standort_pii`
 *   und ist damit PII. `/monitoring/ingest` ist eine PII-freie Flaeche.
 *   Ihn hier auszugeben waere eine eigene Entscheidung — s. ADR-0011 O12.
 *
 * `standortTyp` ist die einzige beschreibende Angabe, die ohne PII zu haben
 * ist (`liegenschaft|gebaeude|…`, V0017). Sie beantwortet immerhin die
 * Plausibilitaetsfrage „ist das ueberhaupt ein Gebaeude?" — die Struktur beim
 * heutigen Betreiber sagt Application = Gebaeude, das Schema erzwingt es
 * aber bewusst nicht.
 */
export interface HerkunftMappingItem {
  readonly id: string;
  /** Aus welchem Netz die Zuordnung stammt (ADR-0011 D8). */
  readonly quelleCode: string;
  readonly chirpstackTenantId: string;
  readonly chirpstackApplicationId: string;
  readonly endkundeId: string;
  readonly standortId: string;
  readonly standortTyp: string;
  readonly createdAt: string;
}
