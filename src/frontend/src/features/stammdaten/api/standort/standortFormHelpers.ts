// Geteilte Zod-Bausteine der Standort-Formulare (Anlegen/Ändern/PII-Ändern/
// Zähler-Verortung) — analog `UUID_PATTERN` in `messkonzeptAnlegenFormSchema.ts`.

import { z } from 'zod';
import { t } from '../../../../shared/i18n/t';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `sortierung` bleibt im Formular-State ein `string` (wie alle übrigen
 * Felder, `EntityForm`s `FormFieldValue = string | boolean`) und wird ERST
 * in der jeweiligen `to…Payload()`-Funktion via `Number(...)` in eine echte
 * Zahl gewandelt (analog `baselineWert` in `messkonzeptAnlegenFormSchema.ts`)
 * — vermeidet eine Erweiterung von `EntityForm`s Werte-Domäne um `number`.
 */
export const sortierungFeldSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, t('stammdaten.standort.form.errors.sortierungUngueltig'));

/**
 * `klimareferenz` — die Klimastation des Standorts (ADR-0010), z. B.
 * `DWD-04094`. Optional; Leerstring heißt „keine hinterlegt".
 *
 * Dieselbe Zeichen-Whitelist wie serverseitig: Die Kennung landet im realen
 * DWD-Adapter in Datei- und URL-Pfaden.
 */
export const klimareferenzFeldSchema = z
  .string()
  .trim()
  .max(64, t('stammdaten.standort.form.errors.klimareferenzZuLang'))
  .regex(/^[A-Za-z0-9_-]*$/, t('stammdaten.standort.form.errors.klimareferenzUngueltig'));
