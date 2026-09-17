import { t } from '../../../../shared/i18n/t';

type MessageKey = Parameters<typeof t>[0];

/** Geschlossene Liste `energy.einschraenkung_unterrichtung.kanal` (V0035). */
export const UNTERRICHTUNG_KANAELE = ['postalisch', 'elektronisch', 'telefonisch', 'persoenlich'] as const;
export type UnterrichtungKanal = (typeof UNTERRICHTUNG_KANAELE)[number];

/**
 * Ein Vokabular fuer beide Subjektarten — dieselbe Begruendung wie bei
 * `EINSCHRAENKUNG_GRUND_OPTIONEN`.
 */
export const UNTERRICHTUNG_KANAL_OPTIONEN: readonly {
  readonly wert: UnterrichtungKanal;
  readonly labelKey: MessageKey;
}[] = [
  { wert: 'postalisch', labelKey: 'stammdaten.common.einschraenkungAufhebung.kanaele.postalisch' },
  { wert: 'elektronisch', labelKey: 'stammdaten.common.einschraenkungAufhebung.kanaele.elektronisch' },
  { wert: 'telefonisch', labelKey: 'stammdaten.common.einschraenkungAufhebung.kanaele.telefonisch' },
  { wert: 'persoenlich', labelKey: 'stammdaten.common.einschraenkungAufhebung.kanaele.persoenlich' },
];
