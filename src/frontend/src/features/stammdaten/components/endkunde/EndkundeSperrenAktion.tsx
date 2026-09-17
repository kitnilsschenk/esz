import { useId, useState, type ReactNode } from 'react';
import type { EinschraenkungGrund } from '@edms/shared';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useEndkundeSperrenView } from '../../hooks/endkunde';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import {
  brauchtNeuerhebungsEntscheidung,
  EINSCHRAENKUNG_GRUND_OPTIONEN,
} from '../../hooks/shared/einschraenkungGrund';
import { t } from '../../../../shared/i18n/t';

export interface EndkundeSperrenAktionProps {
  readonly endkundeId: string;
}


/**
 * „Sperren"-Aktion (Art. 18 DSGVO). `EndkundeDetailAnsicht` rendert sie nur,
 * solange der Endkunde noch NICHT gesperrt/geschreddert ist
 * (`useEndkundeDetailView().istGesperrt` / `.istGeschreddert`).
 *
 * Der Einschraenkungsgrund ist Pflicht (ADR-0007 A11.1) und hat BEWUSST
 * KEINEN Vorgabewert: welcher der vier Tatbestaende vorliegt, ist eine
 * fachliche Feststellung, kein Formular-Default. Ein vorbelegter Wert waere
 * hier besonders schaedlich, weil der Grund eine materielle Rechtsfolge
 * steuert — 1a/1c fuehren im Nachweis zum Ausweis MIT Kennzeichnung (FJ-07b),
 * 1b/1d zum Paar-Ausschluss (FJ-07c). Der Ausloeser bleibt daher `disabled`,
 * bis aktiv gewaehlt wurde (Muster `StandortStilllegenAktion`).
 *
 * Die Auswahl sitzt VOR dem Dialog, nicht darin: so benennt die
 * Dialog-Beschreibung den bereits gewaehlten Grund und die Bestaetigung ist
 * eine Bestaetigung genau dieser Entscheidung. (Der `ConfirmDialog` kennt
 * keine Moeglichkeit, seinen Bestaetigen-Knopf zu sperren — nur
 * Type-to-confirm, was hier unverhaeltnismaessig waere: anders als das
 * unwiderrufliche Krypto-Shredding ist die Einschraenkung dem Grunde nach
 * reversibel.)
 *
 * Bei den Gruenden lit. b und lit. d kommt ein ZWEITES Pflichtfeld hinzu
 * (Auflage C-8): ob die Messdaten-Erhebung waehrend der Einschraenkung
 * fortgesetzt wird. Es erscheint erst nach der Grund-Wahl und hat aus
 * demselben Grund wie der Grund selbst KEINEN Vorgabewert — `true` hiesse
 * weitermessen, obwohl die Rechtmaessigkeit gerade bestritten ist, `false`
 * hiesse eine Messluecke erzeugen, die sich nachtraeglich nicht schliessen
 * laesst. Bei lit. a und lit. c bleibt das Feld verborgen: dort stellt sich
 * die Frage nicht (Art. 18 Abs. 2 nimmt die Speicherung aus), und der Server
 * weist eine Angabe mit 400 zurueck.
 *
 * Rollen-gated (`useKannStammdatenAnlegen`, rein kosmetisch — der
 * `@Roles('betrieb')`-Guard des Backend-Controllers ist die alleinige
 * Durchsetzungsinstanz, `.claude/rules/backend-nestjs.md`).
 */
export function EndkundeSperrenAktion({ endkundeId }: EndkundeSperrenAktionProps): ReactNode {
  const view = useEndkundeSperrenView(endkundeId);
  const kannSperren = useKannStammdatenAnlegen();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [grund, setGrund] = useState<EinschraenkungGrund | ''>('');
  const [erhebung, setErhebung] = useState<'' | 'fortsetzen' | 'stoppen'>('');
  const grundFeldId = useId();
  const erhebungFeldId = useId();

  if (!kannSperren) {
    return null;
  }

  const gewaehlt = EINSCHRAENKUNG_GRUND_OPTIONEN.find((option) => option.wert === grund);
  const fragtNachErhebung = brauchtNeuerhebungsEntscheidung(grund);
  const bereit = grund !== '' && (!fragtNachErhebung || erhebung !== '');

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 pt-6">
        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} className="w-full" />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} className="w-full" />
        <div className="space-y-2">
          <Label htmlFor={grundFeldId}>{t('stammdaten.common.einschraenkungGrund.auswahlLabel')}</Label>
          <Select
            id={grundFeldId}
            value={grund}
            onChange={(event) => {
              setGrund(event.target.value as EinschraenkungGrund | '');
              // Die Entscheidung gehoert zum GRUND. Wer ihn wechselt, hat
              // die Frage fuer den neuen Tatbestand noch nicht beantwortet —
              // eine stehengebliebene Antwort waere eine Aussage, die
              // niemand zu diesem Grund getroffen hat.
              setErhebung('');
            }}
          >
            <option value="">{t('stammdaten.common.einschraenkungGrund.platzhalter')}</option>
            {EINSCHRAENKUNG_GRUND_OPTIONEN.map((option) => (
              <option key={option.wert} value={option.wert}>
                {t(option.labelKey)}
              </option>
            ))}
          </Select>
        </div>
        {fragtNachErhebung && (
          <div className="w-full space-y-2">
            <Label htmlFor={erhebungFeldId}>{t('stammdaten.common.neuerhebung.label')}</Label>
            <Select
              id={erhebungFeldId}
              value={erhebung}
              onChange={(event) => setErhebung(event.target.value as '' | 'fortsetzen' | 'stoppen')}
            >
              <option value="">{t('stammdaten.common.neuerhebung.platzhalter')}</option>
              <option value="fortsetzen">{t('stammdaten.common.neuerhebung.fortsetzen')}</option>
              <option value="stoppen">{t('stammdaten.common.neuerhebung.stoppen')}</option>
            </Select>
            <p className="text-sm text-muted-foreground">{t('stammdaten.common.neuerhebung.hinweis')}</p>
          </div>
        )}
        <Button
          type="button"
          variant="destructive"
          onClick={() => setDialogOffen(true)}
          disabled={view.isSubmitting || !bereit}
        >
          {t('stammdaten.endkunde.detail.sperrenAction')}
        </Button>
      </CardContent>
      <ConfirmDialog
        titel={t('stammdaten.endkunde.detail.sperrenDialogTitel')}
        beschreibung={
          <>
            <p>{t('stammdaten.endkunde.detail.sperrenDialogBeschreibung')}</p>
            {gewaehlt !== undefined && (
              <p>
                {t('stammdaten.common.einschraenkungGrund.dialogGrund')} {t(gewaehlt.labelKey)}
              </p>
            )}
            {fragtNachErhebung && erhebung !== '' && (
              <p>
                {erhebung === 'fortsetzen'
                  ? t('stammdaten.common.neuerhebung.dialogFortsetzen')
                  : t('stammdaten.common.neuerhebung.dialogStoppen')}
              </p>
            )}
          </>
        }
        bestaetigenLabel={t('stammdaten.endkunde.detail.sperrenBestaetigenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        variant="destructive"
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        onBestaetigen={() => {
          setDialogOffen(false);
          if (grund === '') {
            return;
          }
          if (fragtNachErhebung) {
            if (erhebung === '') {
              return;
            }
            view.sperren(grund, erhebung === 'fortsetzen');
            return;
          }
          view.sperren(grund);
        }}
      />
    </Card>
  );
}
