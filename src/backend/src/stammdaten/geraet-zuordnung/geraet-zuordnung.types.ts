import type { GeraetZuordnungStatus } from '../persistence/device/device-geraet-zuordnung.repository';

/**
 * `components/schemas/GeraetZuordnungDetail`. KEIN `devEui`/Blind-Index-Feld
 * (O4 Design-Prinzip 1, ADR-0005 §11/§26.2) — die Klartext-DevEUI wird nach
 * der Provisionierung NIE erneut exponiert; Reverse-Aufloesung ist ein
 * separater, break-glass-gehaerteter Endpunkt (`read:geraet_zuordnung`,
 * ADR-0005 §26.4 SEC-5), NICHT Teil dieses Contracts.
 */
export interface GeraetZuordnungDetail {
  readonly id: string;
  readonly zaehlerId: string;
  readonly status: GeraetZuordnungStatus;
  readonly pepperVersion: number;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
