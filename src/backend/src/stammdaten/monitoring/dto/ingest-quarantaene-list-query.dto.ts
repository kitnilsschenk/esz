import { IsIn, IsOptional, Matches } from 'class-validator';
import { ListQueryDto } from '../../common/list-query.dto';
import type { IngestQuarantaeneGrund } from '../../persistence/ingest/ingest-betrieb.repository';

/**
 * Werteliste 1:1 aus dem DB-CHECK `ck_quarantaene_grund` (V0011, erweitert in V0042) gespiegelt —
 * ein unbekannter Grund wird an der DTO-Grenze abgewiesen, nicht erst durch
 * ein leeres Abfrageergebnis beantwortet (das sähe aus wie „keine Befunde").
 */
const GRUND_WERTE: readonly IngestQuarantaeneGrund[] = [
  'envelope_parse_fehler',
  'devEUI_unbekannt',
  'unbekannter_geraetetyp',
  'decode_fehler',
  'kanal_unbekannt',
  'unplausibel_monotonie_verletzt',
  'einheit_inkonsistent',
  'zeitstempel_fehlt',
  'herkunft_widerspruechlich',
  'skalensprung_verdacht',
];

/** `GET /monitoring/ingest/quarantaene` — Cursor-Pagination (geerbt) + optionaler Grund-Filter. */
export class IngestQuarantaeneListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(GRUND_WERTE)
  grund?: IngestQuarantaeneGrund;

  /** Form 1:1 aus `ck_quelle_status_code_form` (V0039) gespiegelt. */
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,62}$/, {
    message: 'quelle darf nur a-z, 0-9, _ und - enthalten (erstes Zeichen alphanumerisch, hoechstens 63 Zeichen).',
  })
  quelle?: string;
}
