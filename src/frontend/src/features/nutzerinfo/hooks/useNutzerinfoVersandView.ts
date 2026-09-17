import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiProblemError } from '@edms/shared';
import { fetchNutzerinfoMonatsmappe, useSammelZustellungVermerken } from '../api';
import { bieteDateiZumSpeichernAn } from '../../../shared/lib/dateiDownload';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';
import { toSubmitErrorMessage } from '../../stammdaten/hooks/shared/mutationView';

const HTML_MIME_TYP = 'text/html;charset=utf-8';

export interface NutzerinfoVersandView {
  readonly monat: string;
  readonly setzeMonat: (monat: string) => void;
  readonly monatFehler: string | undefined;
  /** `true`, solange die Mappe geholt wird. */
  readonly mappeLaeuft: boolean;
  readonly mappeHolen: () => void;
  readonly dialogOffen: boolean;
  readonly oeffneDialog: () => void;
  readonly schliesseDialog: () => void;
  readonly zustellenLaeuft: boolean;
  readonly zustellen: () => void;
  readonly fehlerMeldung: string | undefined;
  readonly erfolgsMeldung: string | undefined;
}

/** Der Vormonat als `YYYY-MM` — derselbe Regelfall wie beim Erzeugungslauf. */
function vormonat(jetzt: Date): string {
  const datum = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth() - 1, 1));
  return `${String(datum.getUTCFullYear())}-${String(datum.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Der Postweg der monatlichen Nutzerinformation: Mappe holen, drucken,
 * absenden, Zustellung vermerken.
 *
 * **Warum zwei getrennte Schritte und kein „drucken und abhaken".** Zwischen
 * Ausdruck und Einlieferung liegt Arbeit außerhalb des Systems. Ein Vermerk,
 * der schon beim Drucken gesetzt würde, behauptete eine Zustellung, die noch
 * gar nicht stattgefunden hat — und der Versandnachweis ist genau die
 * Angabe, auf die es gegenüber der Bewilligungsbehörde ankommt. Deshalb holt
 * der eine Schritt das Dokument, und der zweite bestätigt ausdrücklich, dass
 * es hinausgegangen ist.
 *
 * **Der Zustellzeitpunkt ist „jetzt" und nicht wählbar.** Der Regelfall ist
 * das Vermerken unmittelbar nach der Einlieferung. Ein frei wählbares Datum
 * am Stapel wäre eine Einladung, den Nachweis zurückzudatieren; wer einen
 * abweichenden Zeitpunkt braucht, vermerkt einzeln am Endkunden.
 *
 * Der Abruf der Mappe läuft bewusst OHNE TanStack Query: Es gibt nichts zu
 * cachen — die Mappe wird bei jedem Abruf aus den eingefrorenen Zeilen neu
 * gerendert, und ein zwischengespeichertes Dokument könnte einen Nachzügler
 * verschweigen.
 */
export function useNutzerinfoVersandView(jetzt: Date = new Date()): NutzerinfoVersandView {
  const [monat, setzeMonat] = useState<string>(vormonat(jetzt));
  const [mappeLaeuft, setzeMappeLaeuft] = useState(false);
  const [dialogOffen, setzeDialogOffen] = useState(false);
  const [fehlerMeldung, setzeFehlerMeldung] = useState<string | undefined>(undefined);
  const [erfolgsMeldung, setzeErfolgsMeldung] = useState<string | undefined>(undefined);
  const mutation = useSammelZustellungVermerken();
  const istGemountetRef = useRef(true);

  useEffect(() => {
    istGemountetRef.current = true;
    return () => {
      istGemountetRef.current = false;
    };
  }, []);

  const monatFehler = /^\d{4}-\d{2}$/.test(monat) ? undefined : t('nutzerinfo.lauf.monatFehler');

  const mappeHolen = useCallback((): void => {
    if (monatFehler !== undefined) {
      return;
    }
    setzeMappeLaeuft(true);
    setzeFehlerMeldung(undefined);
    setzeErfolgsMeldung(undefined);

    void fetchNutzerinfoMonatsmappe(`${monat}-01`)
      .then((html) => {
        bieteDateiZumSpeichernAn(`energieinformationen_${monat}.html`, html, HTML_MIME_TYP);
        if (istGemountetRef.current) {
          setzeErfolgsMeldung(t('nutzerinfo.versand.mappeErfolg'));
        }
      })
      .catch((fehler: unknown) => {
        if (!istGemountetRef.current) {
          return;
        }
        // Der Server begründet fachlich (z. B. „für diesen Monat ist keine
        // Information erzeugt") — genauer als jeder eigene Text.
        const detail = fehler instanceof ApiProblemError ? fehler.detail : undefined;
        setzeFehlerMeldung(detail ?? t('nutzerinfo.versand.mappeFehler'));
      })
      .finally(() => {
        if (istGemountetRef.current) {
          setzeMappeLaeuft(false);
        }
      });
  }, [monat, monatFehler]);

  const zustellen = useCallback((): void => {
    if (monatFehler !== undefined) {
      return;
    }
    setzeDialogOffen(false);
    setzeFehlerMeldung(undefined);
    setzeErfolgsMeldung(undefined);

    mutation.mutate(
      { monat: `${monat}-01`, zustellweg: 'brief', zugestelltAt: new Date().toISOString() },
      {
        onSuccess: (ergebnis) => {
          const kern = `${String(ergebnis.anzahlVermerkt)} ${t('nutzerinfo.versand.zustellenErfolgSuffix')} ${formatiereKalenderdatum(ergebnis.monat)}.`;
          // Die uebergangenen Zeilen werden GENANNT, nicht verschwiegen: Sonst
          // laese sich „1 vermerkt" bei zwei Kunden wie ein halber Fehlschlag.
          const nachtrag =
            ergebnis.anzahlBereitsZugestellt === 0
              ? ''
              : ` ${String(ergebnis.anzahlBereitsZugestellt)} ${t('nutzerinfo.versand.bereitsZugestelltSuffix')}`;
          setzeErfolgsMeldung(`${kern}${nachtrag}`);
        },
      },
    );
  }, [monat, monatFehler, mutation]);

  return {
    monat,
    setzeMonat,
    monatFehler,
    mappeLaeuft,
    mappeHolen,
    dialogOffen,
    oeffneDialog: () => {
      setzeDialogOffen(true);
    },
    schliesseDialog: () => {
      setzeDialogOffen(false);
    },
    zustellenLaeuft: mutation.isPending,
    zustellen,
    fehlerMeldung: fehlerMeldung ?? toSubmitErrorMessage(mutation.error),
    erfolgsMeldung,
  };
}
