import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiProblemError } from '@edms/shared';
import { Button } from '../../../shared/ui/button';
import { StatusRegion } from '../../../shared/ui/status-region';
import { bieteDateiZumSpeichernAn } from '../../../shared/lib/dateiDownload';
import { t } from '../../../shared/i18n/t';
import { fetchNutzerinfoDokument } from '../api';

const HTML_MIME_TYP = 'text/html;charset=utf-8';

export interface NutzerinfoDokumentAktionProps {
  readonly informationId: string;
}

/**
 * „Kundendokument speichern" — der Weg von der Vorschau zum Gegenstand.
 *
 * Die Ansicht daneben zeigt, WAS der Kunde erfährt; dieser Knopf gibt es
 * heraus, in der Form, in der es ihn erreicht. Ohne ihn bliebe die
 * Betriebssicht eine Vorschau ohne Adressat — und die Auflage aus [Q3]
 * Kap. 6 nur durch Abschreiben erfüllbar.
 *
 * Der Abruf läuft über den API-Client statt über einen `<a href>`: die Route
 * verlangt `Authorization: Bearer`, und eine Browser-Navigation schickt den
 * Header nicht mit (s. `dateiDownload.ts`). Kein TanStack Query — es gibt
 * nichts zu cachen, das Dokument wird bei jedem Abruf deterministisch neu
 * gerendert.
 */
export function NutzerinfoDokumentAktion({ informationId }: NutzerinfoDokumentAktionProps): ReactNode {
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehlerMeldung, setzeFehlerMeldung] = useState<string | undefined>(undefined);
  const [erfolgsMeldung, setzeErfolgsMeldung] = useState<string | undefined>(undefined);
  const istGemountetRef = useRef(true);

  useEffect(() => {
    istGemountetRef.current = true;
    return () => {
      istGemountetRef.current = false;
    };
  }, []);

  const speichern = useCallback((): void => {
    setzeLaeuft(true);
    setzeFehlerMeldung(undefined);
    setzeErfolgsMeldung(undefined);

    void fetchNutzerinfoDokument(informationId)
      .then((html) => {
        bieteDateiZumSpeichernAn(`energieinformation_${informationId}.html`, html, HTML_MIME_TYP);
        if (istGemountetRef.current) {
          setzeErfolgsMeldung(t('nutzerinfo.bericht.dokumentErfolg'));
        }
      })
      .catch((fehler: unknown) => {
        if (!istGemountetRef.current) {
          return;
        }
        const detail = fehler instanceof ApiProblemError ? fehler.detail : undefined;
        setzeFehlerMeldung(detail ?? t('nutzerinfo.bericht.dokumentFehler'));
      })
      .finally(() => {
        if (istGemountetRef.current) {
          setzeLaeuft(false);
        }
      });
  }, [informationId]);

  return (
    <div className="space-y-2">
      <StatusRegion ton="fehler" nachricht={fehlerMeldung} />
      <StatusRegion ton="erfolg" nachricht={erfolgsMeldung} />
      <Button type="button" variant="outline" disabled={laeuft} onClick={speichern}>
        {laeuft ? t('nutzerinfo.bericht.dokumentLaeuft') : t('nutzerinfo.bericht.dokumentAction')}
      </Button>
      <p className="max-w-prose text-xs text-muted-foreground">{t('nutzerinfo.bericht.dokumentHinweis')}</p>
    </div>
  );
}
