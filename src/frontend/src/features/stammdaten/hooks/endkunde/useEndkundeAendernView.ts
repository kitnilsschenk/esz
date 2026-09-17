import { useNavigate } from 'react-router-dom';
import {
  toEndkundeAendernPayload,
  useEndkundeAendern,
  useEndkundeDetail,
  type EndkundeAendernFormValues,
} from '../../api/endkunde';
import { mutationViewBasis, type MutationViewBasis } from '../shared/mutationView';

export interface EndkundeAendernView extends MutationViewBasis {
  /** `false`, solange das aktuelle Detail (Vorbefüllung) noch nicht geladen ist. */
  readonly isReady: boolean;
  /**
   * `true`, wenn der Server `stammdatenPii` maskiert geliefert hat (D6 —
   * z. B. ein bereits gesperrtes/geschreddertes Subjekt). Die PII-Felder
   * sind in diesem Fall bewusst LEER vorbefüllt (NICHT mit dem `null`-Wert
   * "überschrieben") — `EndkundeAendernFormular` zeigt dafür einen
   * Hinweistext, dass Name/Anschrift/ggf. Kontakt bei Bedarf vollständig neu
   * eingegeben werden müssen. Kein stilles Überschreiben mit Leerstring.
   */
  readonly piiMaskiert: boolean;
  readonly defaultValues: EndkundeAendernFormValues;
  readonly submit: (values: EndkundeAendernFormValues) => void;
}

/**
 * Leitet aus der Endkunde-Ändern-Mutation ein reines Anzeige-/Aktions-Modell
 * ab — inkl. Vorbefüllung aus dem bereits geladenen Detail (`useEndkundeDetail`
 * teilt sich den TanStack-Query-Cache-Eintrag mit `useEndkundeDetailView`,
 * KEIN zusätzlicher Request, analog `useSystemAendernView`). Navigiert nach
 * erfolgreichem Submit zurück zum Endkunde-Detail (analog
 * `useEndkundeAnlegenView`s Navigation zum neu angelegten Detail) — anders
 * als System/Zähler/Messkanal lebt das Endkunde-Ändern-Formular auf einer
 * EIGENEN Route (`/stammdaten/endkunden/:endkundeId/aendern`), nicht inline
 * im Detail.
 */
export function useEndkundeAendernView(endkundeId: string): EndkundeAendernView {
  const navigate = useNavigate();
  const detailQuery = useEndkundeDetail(endkundeId);
  const mutation = useEndkundeAendern();
  const detail = detailQuery.data;
  const piiMaskiert = detail !== undefined && detail.stammdatenPii === null;

  const defaultValues: EndkundeAendernFormValues = detail
    ? {
        name: detail.stammdatenPii?.name ?? '',
        anschrift: detail.stammdatenPii?.anschrift ?? '',
        kontakt: detail.stammdatenPii?.kontakt ?? '',
        endkundengruppe: detail.endkundengruppe ?? '',
      }
    : { name: '', anschrift: '', kontakt: '', endkundengruppe: '' };

  return {
    isReady: detail !== undefined,
    piiMaskiert,
    defaultValues,
    ...mutationViewBasis(mutation),
    submit: (values) => {
      mutation.mutate(
        { id: endkundeId, input: toEndkundeAendernPayload(values) },
        {
          onSuccess: () => {
            // `void`: kein Data-Router (`BrowserRouter`), `navigate(...)` ist
            // hier stets synchron (analog `useEndkundeAnlegenView`).
            void navigate(`/stammdaten/endkunden/${endkundeId}`);
          },
        },
      );
    },
  };
}
