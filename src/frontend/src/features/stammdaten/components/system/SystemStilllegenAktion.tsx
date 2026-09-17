import type { ReactNode } from 'react';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useSystemStilllegenView } from '../../hooks/system';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

export interface SystemStilllegenAktionProps {
  readonly systemId: string;
}

/**
 * „Stilllegen"-Aktion (Feature-Pass A, analog `ZaehlerStilllegenAktion`,
 * IDEMPOTENT, `status=stillgelegt` — kein Hard-Delete, ADR-0004 §14).
 * `SystemDetailAnsicht` rendert diese Komponente nur, solange das System
 * noch NICHT stillgelegt ist (`useSystemDetailView().istStillgelegt`).
 *
 * Zusätzlich rein kosmetisch rollen-gated (`useKannStammdatenAnlegen`,
 * analog den „Anlegen"-Links auf den Listen-/Detail-Seiten): Rollen ohne
 * `betrieb` (insb. `compliance-auditor`) sehen die Aktion gar nicht erst.
 * Dies ist KEINE Autorisierungsentscheidung — der `@Roles('betrieb')`-Guard
 * des Backend-Controllers lehnt den `DELETE` ohnehin mit 403 ab (Server =
 * alleinige Durchsetzungsinstanz, `.claude/rules/backend-nestjs.md`).
 */
export function SystemStilllegenAktion({ systemId }: SystemStilllegenAktionProps): ReactNode {
  const view = useSystemStilllegenView(systemId);
  const kannStilllegen = useKannStammdatenAnlegen();

  if (!kannStilllegen) {
    return null;
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} className="w-full" />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} className="w-full" />
        <Button type="button" variant="destructive" onClick={view.stilllegen} disabled={view.isSubmitting}>
          {t('stammdaten.system.detail.stilllegenAction')}
        </Button>
      </CardContent>
    </Card>
  );
}
