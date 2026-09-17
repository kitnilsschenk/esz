import type { QualitaetsStufe } from '@edms/shared';
import type { BadgeProps } from '../../../../shared/ui/badge';
import { useBerechnungslaufDetail } from '../../api/berechnung';
import type { DetailField } from '../../components/shared';
import { kurzId } from '../../components/shared';
import {
  ausloeserLabel,
  formatiereAnteilAlsProzent,
  formatiereGradtagzahl,
  formatiereKoeffizient,
  formatiereKwh,
  formatiereMonat,
  formatierePeriode,
  formatiereProzentwert,
  formatiereVerfahren,
  qualitaetsStufeBadgeVariante,
  qualitaetsStufeLabel,
  formatiereEinsparung,
} from './berechnungFormat';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { t } from '../../../../shared/i18n/t';

export interface BerechnungslaufMonatsZeileView {
  readonly monat: string;
  readonly monatLabel: string;
  readonly referenzKwh: number;
  readonly referenzKwhLabel: string;
  readonly istKwh: number;
  readonly istKwhLabel: string;
  /** Referenz minus Ist, mit Vorzeichen: positiv = eingespart. */
  readonly einsparungKwhLabel: string;
  readonly istMehrverbrauch: boolean;
  readonly abdeckungPctLabel: string;
  readonly qualitaetsStufe: QualitaetsStufe;
  readonly qualitaetsStufeLabel: string;
  readonly qualitaetsStufeBadgeVariante: NonNullable<BadgeProps['variant']>;
}

/**
 * Die Jahresbilanz des Laufs — die Frage, mit der ein Bediener auf diese
 * Seite kommt. Sie stand bisher nirgends: Die Tabelle zeigte Referenz und Ist
 * je Monat, und wer die Einsparung wissen wollte, musste zwoelf Differenzen
 * im Kopf bilden.
 */
export interface BerechnungslaufBilanzView {
  readonly referenzKwhLabel: string;
  readonly istKwhLabel: string;
  readonly einsparungKwhLabel: string;
  readonly istMehrverbrauch: boolean;
}

export interface BerechnungslaufDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  readonly monatsZeilen: readonly BerechnungslaufMonatsZeileView[];
  /** `undefined`, solange keine Monatswerte geladen sind. */
  readonly bilanz: BerechnungslaufBilanzView | undefined;
  /**
   * `true`, wenn ein Korrekturlauf diesen hier abgelöst hat. Dann ist seine
   * Zahl nicht mehr maßgeblich — und eine weitere Korrektur gehört an den
   * neuesten Lauf.
   */
  readonly istErsetzt: boolean;
}

const KEINE_ANGABE = 'stammdaten.berechnung.detail.keineAngabe' as const;

/**
 * Leitet aus der Berechnungslauf-Detail-Query ein reines Anzeige-Modell ab:
 * die Kopf-Felder als `DetailField[]` (für `DetailView`, PII-frei — `endkundeId`
 * bleibt ein gekürztes Pseudonym-Surrogat, KEIN Klartext-Stammdatum) sowie die
 * Monatsergebnisse GETRENNT (für Tabelle UND Balkendiagramm in
 * `BerechnungslaufDetailAnsicht`, dieselben aufbereiteten Werte für beide —
 * die Tabelle ist damit zugleich die Textalternative des Diagramms).
 */
export function useBerechnungslaufDetailView(laufId: string): BerechnungslaufDetailView {
  const query = useBerechnungslaufDetail(laufId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.berechnung.detail.id'), value: kurzId(detail.id) },
        { key: 'endkundeId', label: t('stammdaten.berechnung.detail.endkundeId'), value: kurzId(detail.endkundeId) },
        { key: 'mvetId', label: t('stammdaten.berechnung.detail.mvetId'), value: kurzId(detail.mvetId) },
        {
          key: 'energietraeger',
          label: t('stammdaten.berechnung.detail.energietraeger'),
          value: t(`stammdaten.common.enums.energietraeger.${detail.energietraeger}`),
        },
        {
          key: 'verfahren',
          label: t('stammdaten.berechnung.detail.verfahren'),
          value: formatiereVerfahren(detail.verfahrenCode, detail.verfahrenVersion),
        },
        {
          key: 'periode',
          label: t('stammdaten.berechnung.detail.periode'),
          value: formatierePeriode(detail.periodeVon, detail.periodeBis),
        },
        {
          key: 'messkonzeptTyp',
          label: t('stammdaten.berechnung.detail.messkonzeptTyp'),
          value: t(`stammdaten.berechnung.enums.messkonzeptTyp.${detail.messkonzeptTyp}`),
        },
        {
          key: 'baselineWertKwh',
          label: t('stammdaten.berechnung.detail.baselineWertKwh'),
          value: formatiereKwh(detail.baselineWertKwh),
        },
        {
          key: 'grundlastAnteil',
          label: t('stammdaten.berechnung.detail.grundlastAnteil'),
          value: formatiereAnteilAlsProzent(detail.grundlastAnteil),
        },
        { key: 'gtzBase', label: t('stammdaten.berechnung.detail.gtzBase'), value: formatiereGradtagzahl(detail.gtzBase) },
        {
          key: 'gtzNorm',
          label: t('stammdaten.berechnung.detail.gtzNorm'),
          value: detail.gtzNorm !== null ? formatiereGradtagzahl(detail.gtzNorm) : t(KEINE_ANGABE),
        },
        {
          key: 'baselineNormKwh',
          label: t('stammdaten.berechnung.detail.baselineNormKwh'),
          value: detail.baselineNormKwh !== null ? formatiereKwh(detail.baselineNormKwh) : t(KEINE_ANGABE),
        },
        // Die Guetemasse stehen NUR beim angepassten Modell — beim
        // vereinfachten Verfahren wurde nichts angepasst, und eine Zeile mit
        // „—" liesse offen, ob die Zahl fehlt oder gar nicht existiert.
        ...(detail.modellguete !== null
          ? [
              {
                key: 'gueteR2',
                label: t('stammdaten.berechnung.detail.gueteR2'),
                value: formatiereKoeffizient(detail.modellguete.bestimmtheitsmass),
              },
              {
                key: 'gueteCvRmse',
                label: t('stammdaten.berechnung.detail.gueteCvRmse'),
                value: formatiereProzentwert(detail.modellguete.cvRmsePct),
              },
              {
                key: 'gueteNmbe',
                label: t('stammdaten.berechnung.detail.gueteNmbe'),
                value: formatiereProzentwert(detail.modellguete.nmbePct),
              },
              {
                key: 'guetePunkte',
                label: t('stammdaten.berechnung.detail.guetePunkte'),
                value: String(detail.modellguete.punkte),
              },
              {
                key: 'baselineAbweichung',
                label: t('stammdaten.berechnung.detail.baselineAbweichung'),
                value:
                  detail.modellguete.baselineAbweichungPct !== null
                    ? formatiereProzentwert(detail.modellguete.baselineAbweichungPct)
                    : t(KEINE_ANGABE),
              },
            ]
          : []),
        {
          key: 'qualitaetsStufeMin',
          label: t('stammdaten.berechnung.detail.qualitaetsStufeMin'),
          value: qualitaetsStufeLabel(detail.qualitaetsStufeMin),
        },
        { key: 'ausloeser', label: t('stammdaten.berechnung.detail.ausloeser'), value: ausloeserLabel(detail.ausloeser) },
        {
          key: 'ersetztLaufId',
          label: t('stammdaten.berechnung.detail.ersetztLaufId'),
          value: detail.ersetztLaufId !== null ? kurzId(detail.ersetztLaufId) : t(KEINE_ANGABE),
        },
        {
          key: 'erstelltAt',
          label: t('stammdaten.berechnung.detail.erstelltAt'),
          value: formatiereZeitpunkt(detail.erstelltAt),
        },
      ]
    : [];

  const monatsZeilen: readonly BerechnungslaufMonatsZeileView[] = (detail?.ergebnisse ?? []).map((zeile) => ({
    monat: zeile.monat,
    monatLabel: formatiereMonat(zeile.monat),
    referenzKwh: zeile.referenzKwh,
    referenzKwhLabel: formatiereKwh(zeile.referenzKwh),
    istKwh: zeile.istKwh,
    istKwhLabel: formatiereKwh(zeile.istKwh),
    einsparungKwhLabel: formatiereEinsparung(zeile.referenzKwh, zeile.istKwh),
    istMehrverbrauch: zeile.referenzKwh - zeile.istKwh < 0,
    abdeckungPctLabel: formatiereProzentwert(zeile.abdeckungPct),
    qualitaetsStufe: zeile.qualitaetsStufe,
    qualitaetsStufeLabel: qualitaetsStufeLabel(zeile.qualitaetsStufe),
    qualitaetsStufeBadgeVariante: qualitaetsStufeBadgeVariante(zeile.qualitaetsStufe),
  }));

  const referenzSumme = monatsZeilen.reduce((summe, zeile) => summe + zeile.referenzKwh, 0);
  const istSumme = monatsZeilen.reduce((summe, zeile) => summe + zeile.istKwh, 0);

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    monatsZeilen,
    istErsetzt: detail?.ersetztDurchLaufId != null,
    bilanz:
      monatsZeilen.length === 0
        ? undefined
        : {
            referenzKwhLabel: formatiereKwh(referenzSumme),
            istKwhLabel: formatiereKwh(istSumme),
            einsparungKwhLabel: formatiereEinsparung(referenzSumme, istSumme),
            istMehrverbrauch: referenzSumme - istSumme < 0,
          },
  };
}
