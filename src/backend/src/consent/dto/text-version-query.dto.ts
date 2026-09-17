import { IsOptional, Matches } from 'class-validator';

/** `GET /consent/texte` — optional auf einen Zweck eingegrenzt. */
export class TextVersionQueryDto {
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]{2,63}$/, {
    message: 'zweck darf nur Kleinbuchstaben, Ziffern und Unterstrich enthalten (erstes Zeichen ein Buchstabe).',
  })
  zweck?: string;
}
