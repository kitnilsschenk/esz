import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Gemeinsames Cursor-Pagination-Query-DTO (api-contracts.md: "Cursor-basiert,
 * niemals offset", `limit` max. 100). `whitelist:true`/
 * `forbidNonWhitelisted:true` sind global aktiv (main.ts) — Query-Parameter
 * außerhalb dieses DTOs werden abgelehnt (bzw. auf spezialisierten
 * Subklassen ergänzt).
 */
export class ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export const DEFAULT_LIST_LIMIT = 50;

export function resolveLimit(limit: number | undefined): number {
  return limit ?? DEFAULT_LIST_LIMIT;
}
