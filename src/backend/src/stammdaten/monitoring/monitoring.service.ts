import { Injectable } from '@nestjs/common';
import { EnergyMonitoringRepository } from '../persistence/energy/energy-monitoring.repository';
import type { VollstaendigkeitEintrag } from '../persistence/energy/energy-monitoring.repository';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import type { VollstaendigkeitItem } from './monitoring.types';

function mapVollstaendigkeitItem(eintrag: VollstaendigkeitEintrag): VollstaendigkeitItem {
  return {
    endkundeId: eintrag.endkundeId,
    systemId: null,
    zaehlerId: null,
    ebene: eintrag.ebene,
    luecken: eintrag.luecken,
    geprueftAm: eintrag.createdAt,
  };
}

/**
 * ADR-0008 §6.5/§13 (DE-02) — `read:monitoring`. Liefert AUSSCHLIESSLICH
 * Lücken-Metadaten (§20, `EnergyMonitoringRepository`) — KEINE PII, KEIN
 * Verbrauchsinhalt.
 */
@Injectable()
export class MonitoringService {
  constructor(private readonly monitoringRepository: EnergyMonitoringRepository) {}

  async vollstaendigkeit(options: {
    readonly cursor?: string;
    readonly limit: number;
    readonly endkundeId?: string;
    readonly nurMitLuecken: boolean;
  }): Promise<Seite<VollstaendigkeitItem>> {
    // `paginate()` erwartet {createdAt,id} — hier über einen kleinen Adapter
    // auf {createdAt, id=endkundeId} abgebildet (dieselbe Cursor-Konvention).
    const rows = await this.monitoringRepository.listVollstaendigkeit(options);
    const adaptiert = rows.map((row) => ({ ...row, id: row.endkundeId }));
    const { daten, naechsterCursor } = paginate(adaptiert, options.limit);
    return toSeite(daten.map(mapVollstaendigkeitItem), naechsterCursor, options.limit);
  }
}
