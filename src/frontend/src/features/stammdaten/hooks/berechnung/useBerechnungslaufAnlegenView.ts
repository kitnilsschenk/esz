import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BerechnungParametervorschlag, Energietraeger } from '@edms/shared';
import {
  encodeMesskonzeptVersionId,
  useMesskonzeptVersionDetail,
  useMesskonzeptVersionenListe,
} from '../../api/messkonzept';
import { useBerechnungslaufAnlegen, useParametervorschlag } from '../../api/berechnung';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

/** Ein wählbarer Energieträger des aktuellen Messkonzepts. */
export interface EnergietraegerAuswahl {
  readonly mvetId: string;
  /** Der Enum-Wert, NICHT `string` — die Oberflaeche schlaegt damit einen i18n-Schluessel nach. */
  readonly energietraeger: Energietraeger;
}

/** Die Felder, die der Bediener tatsächlich anfasst. */
export interface LaufFormWerte {
  readonly mvetId: string;
  readonly periodeVon: string;
  readonly periodeBis: string;
  readonly grundlastAnteil: string;
  readonly stationRef: string;
}

export interface BerechnungslaufAnlegenView extends MutationViewBasis {
  readonly energietraeger: readonly EnergietraegerAuswahl[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly werte: LaufFormWerte;
  readonly setzeWert: (feld: keyof LaufFormWerte, wert: string) => void;
  /** Der Vorschlag zum gewählten Energieträger; `undefined`, solange keiner gewählt/geladen ist. */
  readonly vorschlag: BerechnungParametervorschlag | undefined;
  readonly vorschlagLaedt: boolean;
  /** Die Herleitung erneut übernehmen — nach einer verworfenen Handeingabe. */
  readonly uebernimmVorschlag: () => void;
  /** Was einen Lauf ins Leere laufen ließe. Leer = nichts im Weg. */
  readonly hindernisse: readonly HindernisCode[];
  readonly absendbar: boolean;
  readonly absenden: () => void;
}

/**
 * Was der Lauf braucht, aber nicht vorfindet — als Codes, damit die
 * Oberfläche die Texte hält und der Hook testbar bleibt.
 */
export type HindernisCode =
  | 'keine_baseline'
  | 'einheit_nicht_verwertbar'
  | 'keine_zaehler'
  | 'keine_daten'
  | 'gtz_base_fehlt'
  | 'systemgrenze_fallback'
  /**
   * V0076 — das Messkonzept ist `standard`/`alternativ`. Dort ermittelt der
   * Lauf den Grundlastanteil SELBST aus der Vermessung; der hier
   * eingetragene Wert geht nicht ein. Kein Hindernis, aber ohne den Hinweis
   * traegt jemand eine Zahl ein, sucht sie spaeter im Ergebnis und findet
   * sie nicht.
   */
  | 'grundlast_wird_angepasst'
  /**
   * V0076/C10 — die Klimastation lässt sich nur aus früheren Läufen
   * vorschlagen, weil am Standort keine hinterlegt ist. Kein Hindernis, aber
   * eine Warnung: Frühere Läufe wiederholen zuverlässig auch einen Fehler.
   * Genau so ist bei Pilotbestand A eine Station 220 km neben dem Objekt
   * jahrelang unbemerkt geblieben (ADR-0006 C10.1).
   */
  | 'station_nur_aus_laeufen';

const LEER: LaufFormWerte = {
  mvetId: '',
  periodeVon: '',
  periodeBis: '',
  grundlastAnteil: '',
  stationRef: '',
};

/**
 * Der Weg zum ersten Berechnungslauf eines Kunden.
 *
 * **Warum die Felder nicht einfach leer sind.** `POST /berechnung/laeufe`
 * verlangt sechs Pflichtparameter. Fünf davon lassen sich aus dem Bestand
 * herleiten; der sechste — `grundlastAnteil` — ist die Zahl, an der in diesem
 * Projekt schon einmal die halbe Auswertung gescheitert ist. Ein geratenes
 * `g = 0,25` hat jeden Sommermonat als Mehrverbrauch ausgewiesen, während der
 * Kunde tatsächlich eingespart hatte.
 *
 * Der Server schlägt deshalb vor (`GET /berechnung/parametervorschlag`), und
 * dieser Hook übernimmt den Vorschlag, sobald ein Energieträger gewählt ist.
 * Überschreiben bleibt möglich — die Herleitung steht daneben, damit man ihr
 * widersprechen kann.
 *
 * **Hindernisse vor dem Rechnen, nicht danach.** Eine fehlende
 * Baseline-Periode, eine Einheit außer kWh, eine leere Systemgrenze: All das
 * merkt der Lauf auch selbst — aber erst, nachdem jemand ihn gestartet hat,
 * und bei der leeren Systemgrenze merkt er es gar nicht, sondern rechnet
 * still über alle Zähler des Kunden. Diese Ansicht sagt es vorher.
 */
export function useBerechnungslaufAnlegenView(endkundeId: string): BerechnungslaufAnlegenView {
  const navigate = useNavigate();
  const [werte, setWerte] = useState<LaufFormWerte>(LEER);
  // Merkt sich, WELCHER Vorschlag schon uebernommen wurde. Ohne das wuerde
  // jede Neubewertung die Handeingabe des Bedieners ueberschreiben — und
  // zwar genau dann, wenn er gerade tippt.
  const [uebernommenFuer, setUebernommenFuer] = useState<string | undefined>(undefined);

  const versionen = useMesskonzeptVersionenListe({ endkundeId });
  const aktuelleVersionNr = versionen.data?.pages
    .flatMap((seite) => seite.daten)
    .find((eintrag) => eintrag.gueltigBis === null)?.versionNr;
  // Ohne gueltige Version gibt es nichts abzurufen — die Query bleibt AUS.
  //
  // Bis 2026-09-17 ging hier bei fehlendem Messkonzept eine Anfrage mit
  // LEERER Kennung raus (`''`). Sie scheiterte serverseitig, und die
  // Oberflaeche meldete daraufhin „Das Messkonzept konnte nicht geladen
  // werden." — was nach einer Stoerung klingt. Tatsaechlich war schlicht kein
  // Messkonzept hinterlegt, wofuer es eine eigene, hilfreiche Meldung gibt.
  // Der Bediener las einen Serverfehler, wo er eine Handlungsanweisung
  // gebraucht haette.
  const versionVorhanden = aktuelleVersionNr !== undefined;
  const detail = useMesskonzeptVersionDetail(
    versionVorhanden ? encodeMesskonzeptVersionId({ endkundeId, versionNr: aktuelleVersionNr }) : '',
    { enabled: versionVorhanden },
  );

  const energietraeger: readonly EnergietraegerAuswahl[] = useMemo(
    () => (detail.data?.energietraeger ?? []).map((e) => ({ mvetId: e.mvetId, energietraeger: e.energietraeger })),
    [detail.data],
  );

  const gewaehlt = werte.mvetId === '' ? undefined : werte.mvetId;
  const vorschlagQuery = useParametervorschlag(endkundeId, gewaehlt);
  const vorschlag = vorschlagQuery.data;
  const mutation = useBerechnungslaufAnlegen();

  function uebernimm(daten: BerechnungParametervorschlag): void {
    setWerte((bisher) => ({
      ...bisher,
      periodeVon: daten.periodeVonVorschlag ?? '',
      periodeBis: daten.periodeBisVorschlag ?? '',
      grundlastAnteil: daten.grundlast === null ? '' : String(daten.grundlast.anteilVorschlag),
      stationRef: daten.stationRefVorschlaege[0] ?? bisher.stationRef,
    }));
  }

  // EINMAL je Vorschlag uebernehmen, beim ersten Eintreffen. Danach gehoert
  // das Formular dem Bediener.
  if (vorschlag !== undefined && uebernommenFuer !== vorschlag.mvetId) {
    setUebernommenFuer(vorschlag.mvetId);
    uebernimm(vorschlag);
  }

  // Seit V0076 entscheidet der Messkonzept-Typ, ob der Lauf die Koeffizienten
  // setzt oder an die Vermessung anpasst.
  //
  // POSITIV geprueft, nicht als `!== 'vereinfacht'`: Solange das Detail noch
  // laedt, ist `typ` undefiniert — und eine Verneinung machte daraus
  // faelschlich „wird angepasst". Der Hinweis erschiene dann bei jedem
  // Messkonzept fuer einen Wimpernschlag, und `gtz_base_fehlt` wuerde
  // blockieren, wo nichts fehlt.
  const passtAn = detail.data?.typ === 'standard' || detail.data?.typ === 'alternativ';

  const hindernisse: HindernisCode[] = [];
  if (passtAn) {
    hindernisse.push('grundlast_wird_angepasst');
  }
  if (vorschlag !== undefined) {
    if (vorschlag.baselineWertKwh === null) {
      hindernisse.push('keine_baseline');
    }
    if (!vorschlag.baselineEinheitVerwertbar) {
      hindernisse.push('einheit_nicht_verwertbar');
    }
    if (vorschlag.zaehlerAnzahl === 0) {
      hindernisse.push('keine_zaehler');
    }
    if (vorschlag.datenVon === null) {
      hindernisse.push('keine_daten');
    }
    // Nur, wenn die Witterungsbereinigung ueberhaupt greift: Bei g = 1 haengt
    // nichts an GTZ_base, und der Lauf verlangt ihn dann auch nicht.
    //
    // Beim angepassten Messkonzept gilt die Ausnahme NICHT: Dort ist g gar
    // kein Eingabewert, und die Baseline-Perioden sind die Vermessung selbst.
    // Ohne sie bricht der Lauf ab, gleich was im g-Feld steht.
    if (!vorschlag.gtzBaseErmittelbar && (passtAn || werte.grundlastAnteil !== '1')) {
      hindernisse.push('gtz_base_fehlt');
    }
    if (vorschlag.systemgrenzeQuelle === 'endkunde_fallback') {
      hindernisse.push('systemgrenze_fallback');
    }
    if (vorschlag.stationRefHerkunft === 'fruehere_laeufe') {
      hindernisse.push('station_nur_aus_laeufen');
    }
  }

  const grundlastZahl = Number.parseFloat(werte.grundlastAnteil.replace(',', '.'));
  const feldeVollstaendig =
    werte.mvetId !== '' &&
    werte.periodeVon !== '' &&
    werte.periodeBis !== '' &&
    werte.stationRef.trim() !== '' &&
    Number.isFinite(grundlastZahl) &&
    grundlastZahl >= 0 &&
    grundlastZahl <= 1;

  // `systemgrenze_fallback` haelt NICHT auf: Es ist eine Warnung, keine
  // Unmoeglichkeit — es gibt Bestaende mit genau einem Messkonzept, fuer die
  // der Fallback richtig rechnet. Alles andere schon.
  const NUR_HINWEIS: readonly HindernisCode[] = [
    'systemgrenze_fallback',
    'grundlast_wird_angepasst',
    'station_nur_aus_laeufen',
  ];
  const blockierend = hindernisse.filter((h) => !NUR_HINWEIS.includes(h));

  return {
    ...mutationViewBasis(mutation),
    energietraeger,
    // `detail` zaehlt nur mit, solange die Query ueberhaupt laeuft. Eine
    // abgeschaltete Query bleibt in TanStack Query dauerhaft `isPending` —
    // wer sie ungeprueft mitoderte, liesse die Ansicht bei fehlendem
    // Messkonzept ewig laden. Das waere derselbe Fehler wie zuvor, nur mit
    // einem Ladebalken statt einer falschen Fehlermeldung.
    isPending: versionen.isPending || (versionVorhanden && detail.isPending),
    isError: versionen.isError || detail.isError,
    werte,
    setzeWert: (feld, wert) => {
      setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    },
    vorschlag,
    vorschlagLaedt: vorschlagQuery.isFetching,
    uebernimmVorschlag: () => {
      if (vorschlag !== undefined) {
        uebernimm(vorschlag);
      }
    },
    hindernisse,
    absendbar: feldeVollstaendig && blockierend.length === 0 && !mutation.isPending,
    absenden: () => {
      mutation.mutate(
        {
          endkundeId,
          mvetId: werte.mvetId,
          periodeVon: werte.periodeVon,
          periodeBis: werte.periodeBis,
          grundlastAnteil: grundlastZahl,
          stationRef: werte.stationRef.trim(),
          // `ausloeser: 'manuell'` — genau das ist es: Ein Mensch hat den
          // Lauf angestossen. `job` bliebe der Automatik vorbehalten, die es
          // noch nicht gibt (`analytics.lauf_auftrag` ist ungenutzt).
          ausloeser: 'manuell',
        },
        {
          onSuccess: (lauf) => {
            void navigate(`/stammdaten/endkunden/${endkundeId}/berechnungen/${lauf.id}`);
          },
        },
      );
    },
  };
}
