// Zod-Formular-Schema für „Gerät anbinden" — Feldgrenzen 1:1 gegen
// `GeraetZuordnungAnlegenDto`
// (`src/backend/src/stammdaten/geraet-zuordnung/dto/geraet-zuordnung-anlegen.dto.ts`)
// gespiegelt: 16 Hex-Zeichen (IEEE EUI-64), optional paarweise durch `:` oder
// `-` getrennt, Länge 16–23.

import { z } from 'zod';
import { t } from '../../../../shared/i18n/t';

const DEVEUI_MUSTER = /^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){7}$/;

export const geraetAnbindenFormSchema = z.object({
  devEui: z
    .string()
    .trim()
    .min(1, t('stammdaten.geraetAnbindung.form.errors.devEuiErforderlich'))
    .max(23, t('stammdaten.geraetAnbindung.form.errors.devEuiZuLang'))
    .regex(DEVEUI_MUSTER, t('stammdaten.geraetAnbindung.form.errors.devEuiFormat')),
});

export type GeraetAnbindenFormValues = z.infer<typeof geraetAnbindenFormSchema>;

export const geraetAnbindenFormDefaultValues: GeraetAnbindenFormValues = { devEui: '' };

/**
 * Trennzeichen werden entfernt und auf Kleinschreibung normalisiert, bevor
 * die Kennung den Browser verlässt.
 *
 * Der Server nimmt beide Schreibweisen an, bildet daraus aber einen
 * deterministischen Blind-Index — und der fällt für `70:B3:D5` und `70b3d5`
 * unterschiedlich aus. Zwei Schreibweisen derselben Kennung wären damit für
 * das System zwei verschiedene Geräte: Beim Anbinden ginge es gut, beim
 * ersten Uplink liefe es in `devEUI_unbekannt`. Deshalb genau eine Form.
 */
export function toGeraetZuordnungDevEui(values: GeraetAnbindenFormValues): string {
  return values.devEui.trim().replaceAll(/[:-]/g, '').toLowerCase();
}
