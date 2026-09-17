import type { ReactNode } from 'react';
import { t } from '../../../../shared/i18n/t';
import { Badge } from '../../../../shared/ui/badge';

export interface PiiMaskedFieldProps {
  readonly label: string;
  /**
   * `string` = Klartext-Wert (bereits vom Server rollen-/status-geprüft
   * geliefert); `null` = vom Server maskiert (`PiiProjektionsPolicy`, D6) —
   * die UI zeigt dann NUR einen Maskierungs-Hinweis. Es gibt HIER keinen
   * Entschlüsselungs-/Berechnungspfad — die Komponente rendert ausschließlich,
   * was die API bereits entschieden hat (ADR-0008 §11 Linie 2/§18 D6).
   */
  readonly value: string | null;
}

/**
 * Zeigt ein einzelnes PII-Feld an und markiert eine serverseitige Maskierung
 * SICHTBAR + für Screenreader (eigener `aria-label`, überschreibt den
 * sichtbaren „•••"-Text als Accessible Name). Wird NIE für Nicht-PII-Felder
 * verwendet (dafür `DetailView`s generisches `fields`-Array) — diese
 * Trennung ist bewusst (ADR-0008 §23 / D11: „Maskierte Felder sichtbar
 * kennzeichnen"). Optik (Phase 4c-Feinschliff, Design-System): der
 * Maskierungs-Hinweis ist ein dezentes „secondary"-Badge, Klartext bleibt
 * normaler Fließtext — Verhalten/A11y-Rollen bleiben UNVERÄNDERT.
 */
export function PiiMaskedField({ label, value }: PiiMaskedFieldProps): ReactNode {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">
        {value === null ? (
          <Badge variant="secondary" aria-label={t('stammdaten.common.pii.maskiertHinweis')}>
            {t('stammdaten.common.pii.maskiertText')}
          </Badge>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
