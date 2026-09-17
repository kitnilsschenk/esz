import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DetailView } from '../shared';
import { useMesskanalDetailView } from '../../hooks/messkanal';
import { MesskanalAendernFormular } from './MesskanalAendernFormular';
import { MesskanalStilllegenAktion } from './MesskanalStilllegenAktion';
import { MesskanalZuordnungAktion } from '../../../geraeteerkennung';
import { t } from '../../../../shared/i18n/t';

export interface MesskanalDetailAnsichtProps {
  readonly messkanalId: string;
}

/**
 * Messkanal-Detail (`ADR-0008 §23 / D11 Pass 1`, Top-Level-Route
 * `/stammdaten/messkanaele/:messkanalId`): NICHT-PII — alle Felder über
 * `DetailView`s generisches `fields`-Array. Enthält das inline
 * „Ändern"-Formular sowie die „Stilllegen"-Aktion (nur solange NICHT bereits
 * stillgelegt) und einen Rücksprung zum zugehörigen Zähler.
 *
 * A11y-Härtung (WCAG 2.2 AA 4.1.3 „Status Messages") — analog
 * `ZaehlerDetailAnsicht`: erfolgreiches Stilllegen wird über eine
 * `role="status" aria-live="polite"`-Region HIER (bleibende Stelle, NICHT in
 * `MesskanalStilllegenAktion`, das nach Erfolg verschwindet) angesagt.
 */
export function MesskanalDetailAnsicht({ messkanalId }: MesskanalDetailAnsichtProps): ReactNode {
  const view = useMesskanalDetailView(messkanalId);
  const [stilllegenErfolgsmeldung, setStilllegenErfolgsmeldung] = useState<string | undefined>(undefined);
  const vorherigerIstStillgelegtRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (view.isPending || view.isError) {
      return;
    }
    const vorher = vorherigerIstStillgelegtRef.current;
    vorherigerIstStillgelegtRef.current = view.istStillgelegt;
    if (vorher === false && view.istStillgelegt) {
      setStilllegenErfolgsmeldung(t('stammdaten.messkanal.detail.stilllegenErfolgreich'));
    }
  }, [view.isPending, view.isError, view.istStillgelegt]);

  return (
    <DetailView
      headingId="messkanal-detail-heading"
      title={t('stammdaten.messkanal.detailPage.title')}
      isPending={view.isPending}
      isError={view.isError}
      loadingMessage={t('stammdaten.common.laedt')}
      errorMessage={t('stammdaten.common.fehler')}
      fields={view.fields}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {stilllegenErfolgsmeldung ?? ''}
      </p>
      {/*
        Zugeordnet wird HIER, nicht beim Endkunden: Der Kanal ist an dieser
        Stelle bereits im Kontext. Auf der Endkundenseite muesste ihn jemand
        aus einer Liste von Pseudonym-IDs heraussuchen.
      */}
      <MesskanalZuordnungAktion messkanalId={messkanalId} />
      <MesskanalAendernFormular messkanalId={messkanalId} />
      {!view.istStillgelegt && <MesskanalStilllegenAktion messkanalId={messkanalId} />}
      {view.zaehlerId !== undefined && (
        <p>
          <Link to={`/stammdaten/zaehler/${view.zaehlerId}`} className="text-link underline-offset-4 hover:underline">
            {t('stammdaten.messkanal.detailPage.backAction')}
          </Link>
        </p>
      )}
    </DetailView>
  );
}
