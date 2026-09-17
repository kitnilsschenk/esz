import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiProblemError } from '@edms/shared';
import { fetchNachweisExportDatei } from '../api';
import { bieteDateiZumSpeichernAn } from '../../../shared/lib/dateiDownload';
import { t } from '../../../shared/i18n/t';

const CSV_MIME_TYP = 'text/csv;charset=utf-8';

export interface ExportDateiDownloadView {
  /** Dateiname des gerade laufenden Abrufs, sonst `undefined` — die Zeile zeigt so lange „Wird geladen …". */
  readonly laufenderDateiname: string | undefined;
  readonly fehlerMeldung: string | undefined;
  readonly erfolgsMeldung: string | undefined;
  readonly herunterladen: (dateiname: string) => void;
}

/**
 * Abruf einer einzelnen Export-Datei.
 *
 * Bewusst OHNE TanStack Query: Es gibt hier nichts zu cachen. Der Server
 * erzeugt die Datei bei JEDEM Abruf neu und gleicht sie gegen die
 * hinterlegte Prüfsumme ab — ein zwischengespeicherter Inhalt würde genau die
 * Prüfung umgehen, um derentwillen der Abruf so gebaut ist. Gehalten wird
 * daher nur flüchtiger Oberflächen-Zustand (welcher Abruf läuft, wie ist der
 * letzte ausgegangen), kein Server-State.
 *
 * Jeder Abruf wird serverseitig protokolliert — auch der erfolgreiche. Die
 * Oberfläche löst ihn deshalb nur auf ausdrückliches Klicken aus, nie
 * beiläufig beim Rendern der Liste.
 */
export function useExportDateiDownloadView(exportId: string): ExportDateiDownloadView {
  const [laufenderDateiname, setLaufenderDateiname] = useState<string | undefined>(undefined);
  const [fehlerMeldung, setFehlerMeldung] = useState<string | undefined>(undefined);
  const [erfolgsMeldung, setErfolgsMeldung] = useState<string | undefined>(undefined);
  const istGemountetRef = useRef(true);

  useEffect(() => {
    istGemountetRef.current = true;
    return () => {
      istGemountetRef.current = false;
    };
  }, []);

  const herunterladen = useCallback(
    (dateiname: string): void => {
      setLaufenderDateiname(dateiname);
      setFehlerMeldung(undefined);
      setErfolgsMeldung(undefined);

      void fetchNachweisExportDatei(exportId, dateiname)
        .then((inhalt) => {
          bieteDateiZumSpeichernAn(dateiname, inhalt, CSV_MIME_TYP);
          if (istGemountetRef.current) {
            setErfolgsMeldung(t('nachweis.export.tabelle.downloadErfolg'));
          }
        })
        .catch((fehler: unknown) => {
          if (!istGemountetRef.current) {
            return;
          }
          // Der Server begründet einen verweigerten Abruf fachlich (RFC 9457,
          // z. B. abweichende Prüfsumme) — diese Begründung ist genauer als
          // jeder eigene Text und wird deshalb bevorzugt gezeigt.
          const detail = fehler instanceof ApiProblemError ? fehler.detail : undefined;
          setFehlerMeldung(detail ?? t('nachweis.export.tabelle.downloadFehler'));
        })
        .finally(() => {
          if (istGemountetRef.current) {
            setLaufenderDateiname(undefined);
          }
        });
    },
    [exportId],
  );

  return { laufenderDateiname, fehlerMeldung, erfolgsMeldung, herunterladen };
}
