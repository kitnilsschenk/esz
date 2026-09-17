import type { EinsparlaufArt } from '@edms/shared';
import { useEinsparlaufDetail } from '../api';
import type { DetailField } from '../../stammdaten/components/shared';
import { kurzId } from '../../stammdaten/components/shared';
import { formatiereKwh, formatiereVerfahren, qualitaetsStufeLabel } from '../../stammdaten/hooks/berechnung';
import { einsparlaufArtLabel, einsparlaufAusloeserLabel, formatiereAnzahl, jaNein } from './nachweisFormat';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export interface EinsparlaufDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly foerderjahrId: string | undefined;
  readonly preflightId: string | undefined;
  readonly ersetztEinsparlaufId: string | null | undefined;
  readonly art: EinsparlaufArt | undefined;
  /**
   * `true`, wenn auf diesem Lauf eine Einreichung vermerkt werden darf: nur
   * ein Förderjahr-Nachweis ohne synthetische Daten ist einreichbar (D7,
   * fail-closed — der Server lehnt alles andere mit einem Konflikt ab). Ein
   * grüner Preflight ist darin bereits enthalten: Ein Lauf mit
   * `art=foerderjahr_nachweis` kann nur auf einer bestandenen Prüfung
   * entstanden sein.
   */
  readonly istEinreichbar: boolean;
  readonly fields: readonly DetailField[];
  /** Jahres-Summe über die ausgewiesenen Zeilen — dieselbe Zahl, die im Export unter „Einspardaten Jahr" steht. */
  readonly summeFields: readonly DetailField[];
}

/**
 * Anzeige-Modell des Einspar-Lauf-Kopfes. PII-frei — `endkundeId` in den
 * Ergebniszeilen ist ein Pseudonym.
 *
 * Die Jahres-Summe wird HIER aus den mitgelieferten `ergebnisse` gebildet.
 * Sie ist bewusst eine ANZEIGE-Summe über die ausgewiesenen Zeilen: Zeilen
 * ohne Zahlenwert (ausgeschlossen, nicht nachweisbar) gehen nicht ein, werden
 * aber daneben gezählt — eine Summe, die verschweigt, wie viele Paare sie
 * nicht enthält, wäre irreführend.
 */
export function useEinsparlaufDetailView(einsparlaufId: string): EinsparlaufDetailView {
  const query = useEinsparlaufDetail(einsparlaufId);
  const detail = query.data;

  const ergebnisse = detail?.ergebnisse ?? [];
  const ausgewiesene = ergebnisse.filter((zeile) => zeile.status === 'ausgewiesen');
  const ausgeschlossene = ergebnisse.filter((zeile) => zeile.status === 'ausgeschlossen');
  const summeKwh = ausgewiesene.reduce((summe, zeile) => summe + (zeile.einsparungKwhEndenergie ?? 0), 0);

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'art', label: t('nachweis.einsparlauf.detail.art'), value: einsparlaufArtLabel(detail.art) },
        {
          key: 'verfahren',
          label: t('nachweis.einsparlauf.detail.verfahren'),
          value: formatiereVerfahren(detail.verfahrenCode, detail.verfahrenVersion),
        },
        {
          key: 'umfangPaareAnzahl',
          label: t('nachweis.einsparlauf.detail.umfangPaareAnzahl'),
          value: formatiereAnzahl(detail.umfangPaareAnzahl),
        },
        {
          key: 'monateGebunden',
          label: t('nachweis.einsparlauf.detail.monateGebunden'),
          value: `${formatiereAnzahl(detail.monateGebunden)} / ${formatiereAnzahl(detail.monateErwartet)}`,
        },
        {
          key: 'gebundeneLaeufeAnzahl',
          label: t('nachweis.einsparlauf.detail.gebundeneLaeufeAnzahl'),
          value: formatiereAnzahl(detail.gebundeneLaeufeAnzahl),
        },
        {
          key: 'qualitaetsStufeMin',
          label: t('nachweis.einsparlauf.detail.qualitaetsStufeMin'),
          value: qualitaetsStufeLabel(detail.qualitaetsStufeMin),
        },
        {
          key: 'ausloeser',
          label: t('nachweis.einsparlauf.detail.ausloeser'),
          value: einsparlaufAusloeserLabel(detail.ausloeser),
        },
        { key: 'synthetic', label: t('nachweis.einsparlauf.detail.synthetic'), value: jaNein(detail.synthetic) },
        { key: 'codeRevision', label: t('nachweis.einsparlauf.detail.codeRevision'), value: detail.codeRevision },
        {
          key: 'erstelltAt',
          label: t('nachweis.einsparlauf.detail.erstelltAt'),
          value: formatiereZeitpunkt(detail.erstelltAt),
        },
        {
          key: 'erstelltVonSub',
          label: t('nachweis.einsparlauf.detail.erstelltVonSub'),
          value: kurzId(detail.erstelltVonSub),
        },
        { key: 'id', label: t('nachweis.einsparlauf.detail.id'), value: kurzId(detail.id) },
      ]
    : [];

  const summeFields: readonly DetailField[] = detail
    ? [
        {
          key: 'summeEinsparung',
          label: t('nachweis.einsparlauf.detail.summeEinsparung'),
          value: formatiereKwh(summeKwh),
        },
        {
          key: 'summeAusgewiesenePaare',
          label: t('nachweis.einsparlauf.detail.summeAusgewiesenePaare'),
          value: `${formatiereAnzahl(ausgewiesene.length)} / ${formatiereAnzahl(ergebnisse.length)}`,
        },
        {
          key: 'summeAusgeschlossenePaare',
          label: t('nachweis.einsparlauf.detail.summeAusgeschlossenePaare'),
          value: formatiereAnzahl(ausgeschlossene.length),
        },
      ]
    : [];

  return {
    isPending: query.isPending,
    isError: query.isError,
    foerderjahrId: detail?.foerderjahrId,
    preflightId: detail?.preflightId,
    ersetztEinsparlaufId: detail?.ersetztEinsparlaufId,
    art: detail?.art,
    istEinreichbar: detail !== undefined && detail.art === 'foerderjahr_nachweis' && !detail.synthetic,
    fields,
    summeFields,
  };
}
