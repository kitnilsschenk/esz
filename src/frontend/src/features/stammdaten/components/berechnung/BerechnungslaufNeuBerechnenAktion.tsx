import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../shared/ui/button';
import { Card, CardContent } from '../../../../shared/ui/card';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useBerechnungslaufNeuBerechnen } from '../../api/berechnung';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { toSubmitErrorMessage } from '../../hooks/shared/mutationView';
import { t } from '../../../../shared/i18n/t';

export interface BerechnungslaufNeuBerechnenAktionProps {
  readonly endkundeId: string;
  readonly laufId: string;
  /** `true`, wenn dieser Lauf bereits durch einen neueren ersetzt wurde. */
  readonly istErsetzt: boolean;
}

/**
 * „Neu rechnen" — der Einstieg in die nachträgliche Korrektur.
 *
 * **Warum es diese Aktion braucht.** Ein falsch gerechneter Lauf war aus der
 * Oberfläche heraus nicht richtigzustellen: Läufe entstanden ausschließlich
 * serverseitig, und die Korrektur (`ersetztLaufId`) verlangte, sämtliche
 * Parameter des alten Laufs von Hand zu wiederholen. Wer dabei einen Wert
 * danebengreift, korrigiert nicht, sondern rechnet etwas anderes.
 *
 * Die Aktion nimmt deshalb keine Eingaben entgegen. Der Server übernimmt
 * Messkonzept, Zeitraum, Grundlastanteil, Klimastation und Gradtagzahlen vom
 * ersetzten Lauf — geändert hat sich nur die Datenlage.
 *
 * **Rückfrage vor dem Rechnen**, weil die Folge über diesen Lauf
 * hinausreicht: Der neue Lauf wird ab dann für Nachweis UND Monatsbericht
 * herangezogen. Überschrieben wird nichts — der alte Lauf bleibt einsehbar
 * (ADR-0007 B7/D7, „nie stilles Überschreiben"). Nach Erfolg führt die
 * Ansicht direkt zum Korrekturlauf; sonst stünde man weiter vor der alten
 * Zahl und wüsste nicht, ob etwas passiert ist.
 *
 * Rein kosmetisch rollen-gated (`useKannStammdatenAnlegen`) — die
 * Durchsetzung liegt beim `@Roles('betrieb')`-Guard des Servers.
 */
export function BerechnungslaufNeuBerechnenAktion({
  endkundeId,
  laufId,
  istErsetzt,
}: BerechnungslaufNeuBerechnenAktionProps): ReactNode {
  const kannRechnen = useKannStammdatenAnlegen();
  const mutation = useBerechnungslaufNeuBerechnen();
  const navigate = useNavigate();
  const [dialogOffen, setDialogOffen] = useState(false);

  if (!kannRechnen) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <StatusRegion ton="fehler" nachricht={toSubmitErrorMessage(mutation.error)} />
        {istErsetzt ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {t('stammdaten.berechnung.detail.neuberechnung.ersetztHinweis')}
          </p>
        ) : (
          <>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t('stammdaten.berechnung.detail.neuberechnung.hinweis')}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                setDialogOffen(true);
              }}
            >
              {t('stammdaten.berechnung.detail.neuberechnung.action')}
            </Button>
          </>
        )}

        <ConfirmDialog
          offen={dialogOffen}
          titel={t('stammdaten.berechnung.detail.neuberechnung.dialogTitel')}
          beschreibung={t('stammdaten.berechnung.detail.neuberechnung.dialogText')}
          bestaetigenLabel={t('stammdaten.berechnung.detail.neuberechnung.dialogBestaetigen')}
          abbrechenLabel={t('stammdaten.berechnung.detail.neuberechnung.dialogAbbrechen')}
          onSchliessen={() => {
            setDialogOffen(false);
          }}
          onBestaetigen={() => {
            setDialogOffen(false);
            mutation.mutate(laufId, {
              onSuccess: (neuerLauf) => {
                void navigate(`/stammdaten/endkunden/${endkundeId}/berechnungen/${neuerLauf.id}`);
              },
            });
          }}
        />
      </CardContent>
    </Card>
  );
}
