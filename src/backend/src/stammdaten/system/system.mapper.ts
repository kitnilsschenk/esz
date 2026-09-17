import type { System } from '../persistence/energy/energy-system.repository';
import type { SystemDetail, SystemListItem } from './system.types';

export function mapSystemListItem(system: System): SystemListItem {
  return {
    id: system.id,
    endkundeId: system.endkundeId,
    bezeichnung: system.bezeichnung,
    status: system.status,
    createdAt: system.createdAt,
  };
}

export function mapSystemDetail(system: System): SystemDetail {
  return {
    id: system.id,
    endkundeId: system.endkundeId,
    bezeichnung: system.bezeichnung,
    systemgrenze: system.systemgrenze,
    systembeschreibung: system.systembeschreibung,
    standortId: system.standortId,
    status: system.status,
    createdAt: system.createdAt,
    updatedAt: system.updatedAt,
  };
}
