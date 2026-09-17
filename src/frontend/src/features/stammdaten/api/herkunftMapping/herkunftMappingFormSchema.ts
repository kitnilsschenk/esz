import { z } from 'zod';
import { t } from '../../../../shared/i18n/t';

/**
 * Grenzen 1:1 aus `HerkunftMappingAnlegenDto` (Backend) gespiegelt.
 *
 * Die vier Kennungen sind UUIDs OHNE Versionsprüfung: Die EDMS-eigenen sind
 * nach V0002-Konvention UUIDv7, und über die Version, in der ein fremder
 * Netzserver seine Kennungen vergibt, hat das EDMS nicht zu befinden.
 */
export const herkunftMappingFormSchema = z.object({
  // NICHT `.optional()`: Das Formular fuehrt fuer jedes Feld einen Wert, und
  // `EntityForm` verlangt einen Record ohne `undefined`. Leer bedeutet hier
  // "nimm die Kennung dieser Installation" -- das uebersetzt der View-Hook,
  // bevor er den Server ruft.
  quelleCode: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, t('stammdaten.herkunftMapping.formular.quelleCodeUngueltig'))
    .or(z.literal('')),
  chirpstackTenantId: z.string().uuid(t('stammdaten.herkunftMapping.formular.uuidUngueltig')),
  chirpstackApplicationId: z.string().uuid(t('stammdaten.herkunftMapping.formular.uuidUngueltig')),
  endkundeId: z.string().uuid(t('stammdaten.herkunftMapping.formular.uuidUngueltig')),
  standortId: z.string().uuid(t('stammdaten.herkunftMapping.formular.uuidUngueltig')),
});

export type HerkunftMappingFormValues = z.infer<typeof herkunftMappingFormSchema>;
