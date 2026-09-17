/**
 * `components/schemas/GeraetReverseAufloesungErgebnis` (ADR-0005 §26.4
 * SEC-5). Das EINZIGE Response-Schema im gesamten Contract, das `devEui` im
 * Klartext trägt — bewusst NICHT Teil von `GeraetZuordnungDetail` (O4
 * Design-Prinzip 1). `id`/`zaehlerId` sind Pseudonyme (kein Geräte-Korrelat
 * für sich genommen), `devEui` verlässt das System NUR über diesen einen
 * Endpunkt (RL-2).
 */
export interface GeraetReverseAufloesungErgebnis {
  readonly id: string;
  readonly zaehlerId: string;
  readonly devEui: string;
}
