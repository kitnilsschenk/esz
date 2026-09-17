import { useState } from 'react';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { useFoerderjahreListe } from '../../nachweis/api';
import {
  useGruppeAnlegen,
  useGruppen,
  useQuote,
  useZuordnungBeenden,
  useZuordnungen,
} from '../api';

export interface GruppeView {
  readonly id: string;
  readonly bezeichnung: string;
  readonly beschreibung: string | null;
}

export interface ZuordnungView {
  readonly schluessel: string;
  readonly geraetegruppeId: string;
  readonly gruppeBezeichnung: string;
  readonly messkanalId: string;
  readonly methodeLabel: string;
  /** „± 5 %" bzw. „Messgerät" bei Direktmessung. */
  readonly genauigkeitLabel: string;
  readonly anteilLabel: string;
  readonly topologieLabel: string;
  readonly zeitraumLabel: string;
  readonly wirksam: boolean;
  readonly beendetGrund: string | null;
}

export interface QuoteView {
  readonly foerderjahrLabel: string;
  /** `undefined`, solange die Quote nicht bestimmbar ist. */
  readonly quoteLabel: string | undefined;
  readonly sollLabel: string;
  /** `undefined` = unbekannt, nicht „nicht erreicht". */
  readonly erreicht: boolean | undefined;
  readonly zugeordnetLabel: string;
  readonly gesamtLabel: string;
  readonly gruppen: readonly { readonly id: string; readonly bezeichnung: string; readonly label: string }[];
  /** Hinweis, wenn keine Tageswerte vorliegen — dann ist die Quote unbekannt, nicht 0. */
  readonly ohneTageswerteHinweis: string | undefined;
  /** Hinweis, wenn Systeme als entbehrlich vermerkt sind. */
  readonly entbehrlichHinweis: string | undefined;
}

export interface GeraeteerkennungView extends MutationViewBasis {
  readonly gruppen: readonly GruppeView[];
  readonly zuordnungen: readonly ZuordnungView[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly ladeFehlerMeldung: string;
  readonly gruppenLeerMeldung: string;
  readonly zuordnungenLeerMeldung: string;

  readonly neueGruppe: string;
  readonly setzeNeueGruppe: (bezeichnung: string) => void;
  readonly legeGruppeAn: () => void;

  readonly beendenGrund: string;
  readonly setzeBeendenGrund: (grund: string) => void;
  readonly beende: (geraetegruppeId: string, messkanalId: string) => void;

  /** Förderjahre zur Auswahl — die Quote ist je Projektjahr definiert. */
  readonly foerderjahre: readonly { readonly id: string; readonly label: string }[];
  readonly foerderjahrId: string;
  readonly setzeFoerderjahrId: (id: string) => void;
  readonly energietraeger: string;
  readonly setzeEnergietraeger: (wert: string) => void;
  readonly quote: QuoteView | undefined;
  readonly quoteLaedt: boolean;
}

function formatiereKwh(wert: number): string {
  return `${wert.toLocaleString('de-DE', { maximumFractionDigits: 0 })} kWh`;
}

function formatierePct(wert: number): string {
  return `${wert.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

/**
 * Geräte- und Anlagengruppen eines Endkunden (TB-05, [Q3] Kap. 5).
 *
 * **Was diese Ansicht besonders macht: Sie zeigt eine Quote, die auch
 * unbekannt sein darf.** Liegen für das Förderjahr keine Tageswerte vor, ist
 * die Zuordnungsquote nicht „0 %", sondern nicht bestimmbar — und die Ansicht
 * sagt das mit einem eigenen Hinweis, statt eine Null hinzuschreiben. Eine
 * Null sieht aus wie ein Ergebnis und wird als eines gelesen; der häufigste
 * Grund ist aber, dass die Verdichtung für den Zeitraum noch nicht gelaufen
 * ist.
 *
 * **Die Entbehrlichkeits-Feststellung hebt die Quote nicht.** Sind Systeme
 * als „Geräteerkennung nicht sinnvoll" vermerkt, erscheint das als eigener
 * Hinweis neben der Zahl — nicht als Korrektur an ihr. Die Würdigung trifft
 * ein Mensch.
 */
export function useGeraeteerkennungView(endkundeId: string): GeraeteerkennungView {
  const gruppenQuery = useGruppen(endkundeId);
  const zuordnungenQuery = useZuordnungen(endkundeId);
  const foerderjahreQuery = useFoerderjahreListe({});

  const [neueGruppe, setzeNeueGruppe] = useState('');
  const [beendenGrund, setzeBeendenGrund] = useState('');
  const [foerderjahrId, setzeFoerderjahrId] = useState('');
  const [energietraeger, setzeEnergietraeger] = useState('strom');

  const anlegenMutation = useGruppeAnlegen();
  const beendenMutation = useZuordnungBeenden();
  const quoteQuery = useQuote(endkundeId, energietraeger, foerderjahrId === '' ? undefined : foerderjahrId);

  const zuordnungen: ZuordnungView[] = (zuordnungenQuery.data ?? []).map((zuordnung) => ({
    schluessel: `${zuordnung.geraetegruppeId}|${zuordnung.messkanalId}|${zuordnung.gueltigVon}`,
    geraetegruppeId: zuordnung.geraetegruppeId,
    gruppeBezeichnung: zuordnung.geraetegruppeBezeichnung,
    messkanalId: zuordnung.messkanalId,
    methodeLabel: t(`geraeteerkennung.methode.${zuordnung.methode}`),
    genauigkeitLabel:
      zuordnung.genauigkeitPct === null
        ? t('geraeteerkennung.zuordnung.genauigkeitMessgeraet')
        : `± ${formatierePct(100 - zuordnung.genauigkeitPct)}`,
    anteilLabel: formatierePct(zuordnung.anteilProzent),
    topologieLabel: zuordnung.imGesamtverbrauchEnthalten
      ? t('geraeteerkennung.zuordnung.untermessung')
      : t('geraeteerkennung.zuordnung.eigenerZaehler'),
    zeitraumLabel:
      zuordnung.gueltigBis === null
        ? `${t('geraeteerkennung.zuordnung.seit')} ${formatiereKalenderdatum(zuordnung.gueltigVon)}`
        : `${formatiereKalenderdatum(zuordnung.gueltigVon)} – ${formatiereKalenderdatum(zuordnung.gueltigBis)}`,
    wirksam: zuordnung.wirksam,
    beendetGrund: zuordnung.beendetGrund,
  }));

  const quoteDaten = quoteQuery.data;
  const quote: QuoteView | undefined =
    quoteDaten === undefined
      ? undefined
      : {
          foerderjahrLabel: `${quoteDaten.foerderjahrCode} (${t('geraeteerkennung.quote.projektjahr')} ${String(quoteDaten.foerderjahrNummer)})`,
          quoteLabel: quoteDaten.quotePct === null ? undefined : formatierePct(quoteDaten.quotePct),
          sollLabel: formatierePct(quoteDaten.sollQuotePct),
          erreicht: quoteDaten.erreicht ?? undefined,
          zugeordnetLabel: formatiereKwh(quoteDaten.zugeordnetKwh),
          gesamtLabel: formatiereKwh(quoteDaten.gesamtKwh),
          gruppen: quoteDaten.gruppen.map((gruppe) => ({
            id: gruppe.geraetegruppeId,
            bezeichnung: gruppe.bezeichnung,
            label: `${formatiereKwh(gruppe.zugeordnetKwh)} · ${formatierePct(gruppe.anteilPct)}`,
          })),
          ohneTageswerteHinweis: quoteDaten.ohneTageswerte
            ? t('geraeteerkennung.quote.ohneTageswerte')
            : undefined,
          entbehrlichHinweis:
            quoteDaten.systemeEntbehrlich === 0
              ? undefined
              : `${String(quoteDaten.systemeEntbehrlich)} ${t('geraeteerkennung.quote.entbehrlichSuffix')} ${String(quoteDaten.systemeGesamt)}`,
        };

  return {
    gruppen: (gruppenQuery.data ?? []).map((gruppe) => ({
      id: gruppe.id,
      bezeichnung: gruppe.bezeichnung,
      beschreibung: gruppe.beschreibung,
    })),
    zuordnungen,
    isPending: gruppenQuery.isPending || zuordnungenQuery.isPending,
    isError: gruppenQuery.isError || zuordnungenQuery.isError,
    ladeFehlerMeldung: t('geraeteerkennung.ladeFehler'),
    gruppenLeerMeldung: t('geraeteerkennung.gruppenLeer'),
    zuordnungenLeerMeldung: t('geraeteerkennung.zuordnungenLeer'),

    neueGruppe,
    setzeNeueGruppe,
    legeGruppeAn: () => {
      anlegenMutation.mutate({ endkundeId, bezeichnung: neueGruppe });
      setzeNeueGruppe('');
    },

    beendenGrund,
    setzeBeendenGrund,
    beende: (geraetegruppeId: string, messkanalId: string) => {
      beendenMutation.mutate({
        geraetegruppeId,
        messkanalId,
        // Beendet wird zum heutigen Tag: Eine Zuordnung endet, wenn jemand
        // sie beendet, nicht rueckwirkend. Ein frei waehlbares Datum liesse
        // die Quote der Vergangenheit nachtraeglich verschieben.
        gueltigBis: new Date().toISOString().slice(0, 10),
        grund: beendenGrund,
      });
    },

    // Bewusst NUR die erste Seite: Foerderjahre sind eine kurze Liste (fuenf
    // im Regelfall). Eine Nachlade-Mechanik im Auswahlfeld waere Aufwand fuer
    // einen Fall, den es nicht gibt -- und wenn es ihn doch gibt, faellt es
    // hier auf, statt still abzuschneiden.
    foerderjahre: (foerderjahreQuery.data?.pages.flatMap((seite) => seite.daten) ?? []).map((jahr) => ({
      id: jahr.id,
      label: `${jahr.code} (${t('geraeteerkennung.quote.projektjahr')} ${String(jahr.nummer)})`,
    })),
    foerderjahrId,
    setzeFoerderjahrId,
    energietraeger,
    setzeEnergietraeger,
    quote,
    quoteLaedt: quoteQuery.isPending && foerderjahrId !== '',

    // Beide Mutationen teilen sich die Rueckmeldung: Es ist EIN Abschnitt,
    // und zwei getrennte Statuszeilen uebereinander waeren Rauschen.
    ...mutationViewBasis(
      anlegenMutation.isPending || anlegenMutation.error !== null || anlegenMutation.isSuccess
        ? anlegenMutation
        : beendenMutation,
      t('geraeteerkennung.erfolg'),
    ),
  };
}
