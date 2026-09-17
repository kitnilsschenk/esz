import type { VerarbeitungsStatus } from '@edms/shared';
import { useAnschlussnutzerDetail } from '../../api/anschlussnutzer';
import type { DetailField } from '../../components/shared';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';
import { einschraenkungGrundLabel } from '../shared/einschraenkungGrund';

export interface AnschlussnutzerPiiView {
  /**
   * `null` bedeutet HIER ausschließlich: serverseitig maskiert (D6) ODER
   * Detail noch nicht geladen — niemals „technisch nicht vorhanden" (analog
   * `EndkundePiiView`). Ein fehlender, aber NICHT maskierter `kontakt` wird
   * bereits hier auf einen Anzeigetext gemappt.
   */
  readonly name: string | null;
  readonly kontakt: string | null;
}

export interface AnschlussnutzerDetailView {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly fields: readonly DetailField[];
  readonly pii: AnschlussnutzerPiiView;
  /** Steuert, ob `AnschlussnutzerSperrenAktion` noch angezeigt wird (analog Endkunde). */
  readonly istGesperrt: boolean;
  readonly istGeloescht: boolean;
}

function verarbeitungsStatusLabel(status: VerarbeitungsStatus): string {
  return t(`stammdaten.common.enums.verarbeitungsStatus.${status}`);
}

/**
 * Leitet aus der Anschlussnutzer-Detail-Query ein reines Anzeige-Modell ab:
 * die Nicht-PII-Kernfelder als `DetailField[]` (für `DetailView`) sowie den
 * PII-Block getrennt (für `PiiMaskedField`) — exakt das Muster von
 * `useEndkundeDetailView`. Die Maskierungs-Entscheidung selbst trifft
 * ausschließlich der Server (`PiiProjektionsPolicy`, D6).
 */
export function useAnschlussnutzerDetailView(anschlussnutzerId: string): AnschlussnutzerDetailView {
  const query = useAnschlussnutzerDetail(anschlussnutzerId);
  const detail = query.data;

  const fields: readonly DetailField[] = detail
    ? [
        { key: 'id', label: t('stammdaten.anschlussnutzer.detail.id'), value: detail.id },
        { key: 'endkundeId', label: t('stammdaten.anschlussnutzer.detail.endkundeId'), value: detail.endkundeId },
        {
          key: 'verarbeitungsStatus',
          label: t('stammdaten.anschlussnutzer.detail.verarbeitungsStatus'),
          value: verarbeitungsStatusLabel(detail.verarbeitungsStatus),
        },
        { key: 'createdAt', label: t('stammdaten.anschlussnutzer.detail.createdAt'), value: formatiereZeitpunkt(detail.createdAt) },
        { key: 'updatedAt', label: t('stammdaten.anschlussnutzer.detail.updatedAt'), value: formatiereZeitpunkt(detail.updatedAt) },
        // Art.-18-Einschraenkung, nur solange sie besteht — der
        // Kohaerenz-CHECK (V0024) laesst den Grund ausschliesslich bei
        // `gesperrt` zu. Gleiche Begruendung und gleiche Grenzen wie beim
        // Endkunden (ADR-0007 A11.4).
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
  const pii: AnschlussnutzerPiiView = piiBlock
    ? {
        name: piiBlock.name,
        kontakt: piiBlock.kontakt ?? t('stammdaten.anschlussnutzer.detail.piiKontaktKeineAngabe'),
      }
    : { name: null, kontakt: null };

  return {
    isPending: query.isPending,
    isError: query.isError,
    fields,
    pii,
    istGesperrt: detail?.verarbeitungsStatus === 'gesperrt',
    istGeloescht: detail?.verarbeitungsStatus === 'geloescht',
  };
}
