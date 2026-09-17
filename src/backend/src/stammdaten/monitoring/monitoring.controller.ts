import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { MonitoringService } from './monitoring.service';
import { MonitoringListQueryDto } from './dto/monitoring-list-query.dto';
import type { VollstaendigkeitItem } from './monitoring.types';

const DEFAULT_NUR_MIT_LUECKEN = true;

/** `/monitoring/vollstaendigkeit` (stammdaten.openapi.yaml) — DE-02, nur Metadaten. */
@Controller('monitoring/vollstaendigkeit')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async liste(@Query() query: MonitoringListQueryDto): Promise<Seite<VollstaendigkeitItem>> {
    return this.monitoringService.vollstaendigkeit({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.endkundeId !== undefined ? { endkundeId: query.endkundeId } : {}),
      limit: resolveLimit(query.limit),
      nurMitLuecken: query.nurMitLuecken ?? DEFAULT_NUR_MIT_LUECKEN,
    });
  }
}
