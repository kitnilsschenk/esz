import type { VerarbeitungsStatus } from '@edms/shared';
import { useEndkundeDetail } from '../../api/endkunde';
import type { DetailField } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { einschraenkungGrundLabel } from '../shared/einschraenkungGrund';

export interface EndkundePiiView {
  /**
   * `null` bedeutet HIER ausschließlich: serverseitig maskiert (D6,
   * `compliance-auditor`/gesperrt/geschreddert) ODER Detail noch nicht
   * geladen — niemals „technisch nicht vorhanden". Ein fehlender, aber
   * NICHT maskierter `kontakt` wird bereits im Hook auf einen Anzeigetext
   * gemappt (siehe unten), bleibt also ein normaler `string`.
   */
  readonly name: string | null;
  readonly anschrift: string | null;
  readonly kontakt: string | null;
}

export interface EndkundeDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  readonly pii: EndkundePiiView;
  /** `verarbeitungsStatus === 'gesperrt'` (Art. 18) — steuert, ob `EndkundeSperrenAktion` noch angezeigt wird. */
  readonly istGesperrt: boolean;
  /** `verarbeitungsStatus === 'geloescht'` (Art. 17, Kryptoshredding bereits erfolgt) — steuert, ob `EndkundeShreddenAktion` noch angezeigt wird. */
  readonly istGeschreddert: boolean;
}

function verarbeitungsStatusLabel(status: VerarbeitungsStatus): string {
  return t(`stammdaten.endkunde.status.verarbeitung.${status}`);
}

function jaNeinLabel(value: boolean): string {
  return value ? t('stammdaten.common.ja') : t('stammdaten.common.nein');
}

/**
 * Leitet aus der Endkunde-Detail-Query ein reines Anzeige-Modell ab: die
 * Nicht-PII-Kernfelder als `DetailField[]` (für `DetailView`) sowie den
 * PII-Block getrennt (für `PiiMaskedField`, ADR-0008 §11 Linie 2 — PII läuft
 * NIE über den generischen Feld-Renderer). Die Maskierungs-Entscheidung
 * selbst trifft ausschließlich der Server (`PiiProjektionsPolicy`, D6) — der
 * Hook zeigt nur an, was `stammdatenPii` bereits ist (`null` oder befüllt).
 */
export function useEndkundeDetailView(endkundeId: string): EndkundeDetailView {
  const query = useEndkundeDetail(endkundeId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.endkunde.detail.id'), value: detail.id },
        {
          key: 'verarbeitungsStatus',
          label: t('stammdaten.endkunde.detail.verarbeitungsStatus'),
          value: verarbeitungsStatusLabel(detail.verarbeitungsStatus),
        },
        {
          key: 'vonWissAuswertungAusgenommen',
          label: t('stammdaten.endkunde.detail.vonWissAuswertungAusgenommen'),
          value: jaNeinLabel(detail.vonWissAuswertungAusgenommen),
        },
        {
          key: 'endkundengruppe',
          label: t('stammdaten.endkunde.detail.endkundengruppe'),
          value: detail.endkundengruppe ?? t('stammdaten.common.keineAngabe'),
        },
        { key: 'createdAt', label: t('stammdaten.endkunde.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
        { key: 'updatedAt', label: t('stammdaten.endkunde.detail.updatedAt'), value: formatiereZeitpunkt(detail.updatedAt) },
        // Art.-18-Einschraenkung: NUR sichtbar, solange sie besteht. Der
        // Kohaerenz-CHECK (V0024) laesst den Grund ausschliesslich bei
        // `gesperrt` zu — bei jedem anderen Status waeren die Felder `null`
        // und eine Zeile „—" wuerde nur Rauschen erzeugen. Sichtbar fuer
        // `betrieb` UND `compliance-auditor` (ADR-0007 A11.4): ohne Anzeige
        // koennte niemand die befristeten Taatbestaende 1a/1d im Blick
        // behalten oder pruefen, ob die Preflight-Einstufung zum
        // dokumentierten Grund passt.
        ...(detail.einschraenkungGrundCode !== null && detail.einschraenkungGrundCode !== undefined
          ? [
              {
                key: 'einschraenkungGrund',
                label: t('stammdaten.common.einschraenkungGrund.feldLabel'),
                value: einschraenkungGrundLabel(detail.einschraenkungGrundCode),
              },
            ]
          : []),
        ...(detail.gesperrtSeit !== null && detail.gesperrtSeit !== undefined
          ? [
              {
                key: 'gesperrtSeit',
                label: t('stammdaten.common.einschraenkungGrund.gesperrtSeit'),
                value: formatiereZeitpunkt(detail.gesperrtSeit),
              },
            ]
          : []),
      ]
    : [];

  const piiBlock = detail?.stammdatenPii ?? null;
  const pii: EndkundePiiView = piiBlock
    ? {
        name: piiBlock.name,
        anschrift: piiBlock.anschrift,
        kontakt: piiBlock.kontakt ?? t('stammdaten.endkunde.detail.piiKontaktKeineAngabe'),
      }
    : { name: null, anschrift: null, kontakt: null };

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    pii,
    istGesperrt: detail?.verarbeitungsStatus === 'gesperrt',
    istGeschreddert: detail?.verarbeitungsStatus === 'geloescht',
  };
}
