import { ListQueryDto } from '../../common/list-query.dto';

/**
 * `components/schemas/AusfallListeQuery`-Äquivalent (stammdaten.openapi.yaml,
 * `GET /monitoring/ausfaelle`) — reine Cursor-Pagination (`cursor`/`limit`,
 * geerbt), KEIN weiterer Filter in v1 (die Überfälligkeits-Schwelle selbst
 * ist bewusst KEIN Query-Parameter, s. `ingest-freshness.constants.ts`).
 */
export class AusfallListQueryDto extends ListQueryDto {}
