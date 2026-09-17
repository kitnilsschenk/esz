import type { ReactNode } from 'react';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useMesskanalStilllegenView } from '../../hooks/messkanal';
import { t } from '../../../../shared/i18n/t';

export interface MesskanalStilllegenAktionProps {
  readonly messkanalId: string;
}

/**
 * „Stilllegen"-Aktion (`ADR-0008 §23 / D11 Pass 1`, IDEMPOTENT, kein
 * Hard-Delete — analog `ZaehlerStilllegenAktion`). `MesskanalDetailAnsicht`
 * rendert diese Komponente nur, solange der Messkanal noch NICHT
 * stillgelegt ist.
 */
export function MesskanalStilllegenAktion({ messkanalId }: MesskanalStilllegenAktionProps): ReactNode {
  const view = useMesskanalStilllegenView(messkanalId);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} className="w-full" />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} className="w-full" />
        <Button type="button" variant="destructive" onClick={view.stilllegen} disabled={view.isSubmitting}>
          {t('stammdaten.messkanal.detail.stilllegenAction')}
        </Button>
      </CardContent>
    </Card>
  );
}
