import type { ApiProblemError, ShredAblehnungsgrund, ShredAntrag } from '@edms/shared';
import {
  useEndkundeShredAblehnen,
  useEndkundeShredAntragOffen,
  useEndkundeShredFreigeben,
} from '../../api/endkunde';
import { useAktuellerSub } from '../shared/useAktuellerSub';
import { kurzId } from '../../components/shared';
import { t, type MessageKey } from '../../../../shared/i18n/t';

/**
 * Server-Fehlertext des Selbst-Freigabe-Verbots (ADR-0009 §2.2/§2.5) —
 * `ForbiddenException('vier_augen_selbstfreigabe_verboten')` landet
 * unverändert im `ApiProblemError.detail` (`problem-details.filter.ts`
 * mappt `HttpException.message` 1:1 auf `detail`).
 */
const SELBSTFREIGABE_VERBOTEN_DETAIL = 'vier_augen_selbstfreigabe_verboten';

export interface EndkundeShredAntragOffenView {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** `undefined` = kein offener Antrag (oder Query noch nicht geladen — s. `isPending`). */
  readonly antrag: ShredAntrag | undefined;
  readonly antragstellerKurz: string;
  readonly grundLabel: string;
  readonly beantragtAm: string;
  readonly gueltigBis: string;
  /**
   * `true` NUR, wenn der aktuelle Session-`sub` bekannt ist UND mit dem
   * Antragsteller übereinstimmt (bevorzugter Pfad, ADR-0009 §2.5). Solange
   * die Sitzung noch lädt, bleibt dies `false` (Fallback: Aktionen sichtbar,
   * ein etwaiger 403 wird unten in `freigebenErrorMessage`/
   * `ablehnenErrorMessage` verständlich übersetzt).
   */
  readonly istEigenerAntrag: boolean;
  readonly selbstFreigabeHinweis: string | undefined;
  readonly isFreigebenSubmitting: boolean;
  readonly freigebenErrorMessage: string | undefined;
  readonly freigeben: () => void;
  readonly isAblehnenSubmitting: boolean;
  readonly ablehnenErrorMessage: string | undefined;
  readonly ablehnen: (grund: ShredAblehnungsgrund) => void;
}

function grundLabel(grund: ShredAntrag['grund']): string {
  switch (grund) {
    case 'betroffenenantrag_art17':
      return t('stammdaten.endkunde.detail.shreddernGrundOptionen.betroffenenantragArt17');
    case 'aufbewahrung_abgelaufen':
      return t('stammdaten.endkunde.detail.shreddernGrundOptionen.aufbewahrungAbgelaufen');
    case 'sonstige_rechtsgrundlage':
      return t('stammdaten.endkunde.detail.shreddernGrundOptionen.sonstigeRechtsgrundlage');
  }
}

function toActionErrorMessage(error: ApiProblemError | null, selbstFehlerKey: MessageKey): string | undefined {
  if (error === null) {
    return undefined;
  }
  if (error.status === 403 && error.detail === SELBSTFREIGABE_VERBOTEN_DETAIL) {
    return t(selbstFehlerKey);
  }
  return error.detail ?? t('stammdaten.common.fehlerAllgemein');
}

/**
 * Leitet aus dem „offener Antrag"-Read-Query + den Freigeben-/
 * Ablehnen-Mutationen ein reines Anzeige-/Aktions-Modell für
 * `EndkundeShredAntragOffen` ab (ADR-0009 §2.2–§2.5, Vier-Augen Schritt 2).
 *
 * Der Server bleibt in JEDEM Fall die alleinige Durchsetzungsinstanz
 * (`.claude/rules/backend-nestjs.md`) — ein 403 mit genau
 * `vier_augen_selbstfreigabe_verboten` wird deshalb IMMER (nicht nur im
 * Fallback-Pfad ohne bekannten `sub`) in eine verständliche deutsche Meldung
 * übersetzt, z. B. bei einem Wettlauf zweier Tabs derselben Person.
 */
export function useEndkundeShredAntragOffenView(endkundeId: string): EndkundeShredAntragOffenView {
  const query = useEndkundeShredAntragOffen(endkundeId);
  const aktuellerSub = useAktuellerSub();
  const freigebenMutation = useEndkundeShredFreigeben();
  const ablehnenMutation = useEndkundeShredAblehnen();

  const antrag = query.data ?? undefined;
  const istEigenerAntrag = antrag !== undefined && aktuellerSub !== undefined && antrag.beantragtVonSub === aktuellerSub;

  return {
    isPending: query.isPending,
    isError: query.isError,
    antrag,
    antragstellerKurz: antrag ? kurzId(antrag.beantragtVonSub) : '',
    grundLabel: antrag ? grundLabel(antrag.grund) : '',
    beantragtAm: antrag?.beantragtAm ?? '',
    gueltigBis: antrag?.gueltigBis ?? '',
    istEigenerAntrag,
    selbstFreigabeHinweis: istEigenerAntrag ? t('stammdaten.endkunde.detail.shredAntragSelbstHinweis') : undefined,
    isFreigebenSubmitting: freigebenMutation.isPending,
    freigebenErrorMessage: toActionErrorMessage(
      freigebenMutation.error,
      'stammdaten.endkunde.detail.shredAntragFreigebenSelbstFehler',
    ),
    freigeben: () => {
      if (antrag === undefined) {
        return;
      }
      freigebenMutation.mutate({ endkundeId, antragId: antrag.id, input: { bestaetigung: 'ENDGUELTIG_LOESCHEN' } });
    },
    isAblehnenSubmitting: ablehnenMutation.isPending,
    ablehnenErrorMessage: toActionErrorMessage(
      ablehnenMutation.error,
      'stammdaten.endkunde.detail.shredAntragAblehnenSelbstFehler',
    ),
    ablehnen: (grund) => {
      if (antrag === undefined) {
        return;
      }
      ablehnenMutation.mutate({ endkundeId, antragId: antrag.id, input: { ablehnungsgrund: grund } });
    },
  };
}
