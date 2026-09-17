import { useState } from 'react';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { mutationViewBasis, type MutationViewBasis } from '../../stammdaten/hooks/shared/mutationView';
import { useNutzerinfoLauf } from '../api';

/** Eine Zeile der Ergebnisaufstellung. */
export interface LaufZahlView {
  readonly schluessel: string;
  readonly label: string;
  readonly wert: number;
  /** Erläutert, ob die Zahl in Ordnung ist — oder ein Befund. */
  readonly erlaeuterung: string;
  /** `true` bei `ohneBerechnung` > 0: hervorgehoben, nicht weggerundet. */
  readonly istBefund: boolean;
}

export interface NutzerinfoLaufErgebnisView {
  readonly monatLabel: string;
  readonly modusLabel: string;
  readonly warProbelauf: boolean;
  readonly zahlen: readonly LaufZahlView[];
  /** Zusammenfassender Satz — steht über den Zahlen, nicht darunter. */
  readonly fazit: string;
}

export interface NutzerinfoLaufView extends MutationViewBasis {
  readonly monat: string;
  readonly setzeMonat: (monat: string) => void;
  readonly monatFehler: string | undefined;
  readonly starteProbelauf: () => void;
  readonly starteAusfuehrung: () => void;
  readonly ergebnis: NutzerinfoLaufErgebnisView | undefined;
}

/** Der Vormonat als `YYYY-MM` — der Regelfall beim Öffnen der Seite. */
function vormonat(jetzt: Date): string {
  const jahr = jetzt.getUTCFullYear();
  const monat = jetzt.getUTCMonth(); // 0-basiert; ohne +1 ist es bereits der Vormonat
  const datum = new Date(Date.UTC(jahr, monat - 1, 1));
  return `${String(datum.getUTCFullYear())}-${String(datum.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Der Erzeugungslauf der monatlichen Nutzerinformation (TB-06).
 *
 * **Der Probelauf ist der Standard**, und die Oberfläche macht das sichtbar:
 * zwei getrennte Schaltflächen statt eines Häkchens „wirklich ausführen".
 * Wer zählt, bevor er schreibt, sieht vorher, wie viele Kunden gar nicht
 * informiert werden können.
 *
 * **Die wichtigste Zahl ist nicht die der erzeugten Informationen.** Es ist
 * `ohneBerechnung`: Für diese Kunden gibt es keinen eindeutig bindbaren
 * Berechnungslauf — sie müssten informiert werden und können es nicht. Die
 * Ansicht hebt sie hervor und erklärt sie; die beiden anderen
 * Übersprungen-Zahlen (Widerspruch, Sperrung) sind dagegen in Ordnung und
 * werden auch so benannt. Ohne diese Unterscheidung liest sich ein Lauf mit
 * 40 von 100 informierten Kunden wie ein Fehler, obwohl er einer sein kann
 * oder auch nicht.
 */
export function useNutzerinfoLaufView(jetzt: Date = new Date()): NutzerinfoLaufView {
  const mutation = useNutzerinfoLauf();
  const [monat, setzeMonat] = useState<string>(vormonat(jetzt));

  const monatFehler = /^\d{4}-\d{2}$/.test(monat) ? undefined : t('nutzerinfo.lauf.monatFehler');

  const starte = (ausfuehren: boolean): void => {
    if (monatFehler !== undefined) {
      return;
    }
    mutation.mutate({ monat: `${monat}-01`, ausfuehren });
  };

  const daten = mutation.data;
  const ergebnis: NutzerinfoLaufErgebnisView | undefined =
    daten === undefined
      ? undefined
      : {
          monatLabel: formatiereKalenderdatum(daten.monat),
          modusLabel: t(`nutzerinfo.lauf.modus.${daten.modus}`),
          warProbelauf: daten.modus === 'probelauf',
          zahlen: [
            {
              schluessel: 'erzeugt',
              label: t('nutzerinfo.lauf.zahl.erzeugt'),
              wert: daten.anzahlErzeugt,
              erlaeuterung: t('nutzerinfo.lauf.erlaeuterung.erzeugt'),
              istBefund: false,
            },
            {
              schluessel: 'widerspruch',
              label: t('nutzerinfo.lauf.zahl.widerspruch'),
              wert: daten.uebersprungenWiderspruch,
              erlaeuterung: t('nutzerinfo.lauf.erlaeuterung.widerspruch'),
              istBefund: false,
            },
            {
              schluessel: 'gesperrt',
              label: t('nutzerinfo.lauf.zahl.gesperrt'),
              wert: daten.uebersprungenGesperrt,
              erlaeuterung: t('nutzerinfo.lauf.erlaeuterung.gesperrt'),
              istBefund: false,
            },
            {
              schluessel: 'ohneBerechnung',
              label: t('nutzerinfo.lauf.zahl.ohneBerechnung'),
              wert: daten.ohneBerechnung,
              erlaeuterung: t('nutzerinfo.lauf.erlaeuterung.ohneBerechnung'),
              istBefund: daten.ohneBerechnung > 0,
            },
          ],
          fazit:
            daten.ohneBerechnung > 0
              ? t('nutzerinfo.lauf.fazitBefund')
              : t('nutzerinfo.lauf.fazitVollstaendig'),
        };

  return {
    monat,
    setzeMonat,
    monatFehler,
    starteProbelauf: () => {
      starte(false);
    },
    starteAusfuehrung: () => {
      starte(true);
    },
    ergebnis,
    // Kein Erfolgstext: Das Ergebnis IST die Rueckmeldung, und es steht
    // unmittelbar darunter. Ein zusaetzliches „Erfolgreich" waere Rauschen
    // ueber den Zahlen, auf die es ankommt.
    ...mutationViewBasis(mutation),
  };
}
