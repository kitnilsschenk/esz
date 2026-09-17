import type { ReactNode } from 'react';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useZaehlerStilllegenView } from '../../hooks/zaehler';
import { t } from '../../../../shared/i18n/t';

export interface ZaehlerStilllegenAktionProps {
  readonly zaehlerId: string;
}

/**
 * „Stilllegen"-Aktion (`ADR-0008 §23 / D11 Pass 1`, IDEMPOTENT, `status=
 * stillgelegt` — kein Hard-Delete, ADR-0004 §14). `ZaehlerDetailAnsicht`
 * rendert diese Komponente nur, solange der Zähler noch NICHT stillgelegt
 * ist (`useZaehlerDetailView().istStillgelegt`).
 */
export function ZaehlerStilllegenAktion({ zaehlerId }: ZaehlerStilllegenAktionProps): ReactNode {
  const view = useZaehlerStilllegenView(zaehlerId);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} className="w-full" />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} className="w-full" />
        <Button type="button" variant="destructive" onClick={view.stilllegen} disabled={view.isSubmitting}>
          {t('stammdaten.zaehler.detail.stilllegenAction')}
        </Button>
      </CardContent>
    </Card>
  );
}
