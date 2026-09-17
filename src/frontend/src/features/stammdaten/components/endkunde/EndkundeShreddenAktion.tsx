import { useId, useState, type ReactNode } from 'react';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useEndkundeShredBeantragenView, type KryptoShreddingGrund } from '../../hooks/endkunde';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

export interface EndkundeShreddenAktionProps {
  readonly endkundeId: string;
}

const STANDARD_GRUND: KryptoShreddingGrund = 'betroffenenantrag_art17';

/**
 * „Krypto-Shredding beantragen"-Aktion (Art. 17 DSGVO, Vier-Augen-Workflow
 * Schritt 1 — ADR-0009 §2.2). Dieser Schritt selbst ist HARMLOS: er legt nur
 * einen Antrag im Status `beantragt` an, OHNE den Endkunden zu löschen — die
 * tatsächliche, unwiderrufliche Löschung erfolgt erst, wenn eine ZWEITE
 * Person den Antrag freigibt (`EndkundeShredAntragOffen`, Schritt 2). Der
 * `ConfirmDialog` verlangt trotzdem Type-to-confirm (Nutzer muss das Wort
 * „BEANTRAGEN" exakt eintippen — bewusst EIN ANDERES Wort als das
 * „SCHREDDERN" der Freigeben-Aktion, damit der Unterschied zwischen „Antrag
 * stellen" und „tatsächlich löschen" auch beim Type-to-confirm sichtbar
 * bleibt) UND einen gewählten Löschgrund (`KryptoShreddingGrund`,
 * whitelisted — Backend-Pflichtfeld, `grund`-Select sitzt DIREKT in der
 * Dialog-Beschreibung).
 *
 * `EndkundeDetailAnsicht` rendert diese Komponente nur, solange der Endkunde
 * NICHT geschreddert ist UND KEIN offener Antrag existiert
 * (`useEndkundeShredAntragOffenView`) — existiert bereits einer, zeigt
 * `EndkundeShredAntragOffen` stattdessen die Freigeben-/Ablehnen-Aktionen.
 * Rollen-gated wie `EndkundeSperrenAktion`.
 */
export function EndkundeShreddenAktion({ endkundeId }: EndkundeShreddenAktionProps): ReactNode {
  const view = useEndkundeShredBeantragenView(endkundeId);
  const kannBeantragen = useKannStammdatenAnlegen();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [grund, setGrund] = useState<KryptoShreddingGrund>(STANDARD_GRUND);
  const grundFeldId = useId();

  if (!kannBeantragen) {
    return null;
  }

  const bestaetigungswort = t('stammdaten.endkunde.detail.shredBeantragenBestaetigungswort');

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} className="w-full" />
        <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} className="w-full" />
        <Button type="button" variant="destructive" onClick={() => setDialogOffen(true)} disabled={view.isSubmitting}>
          {t('stammdaten.endkunde.detail.shredBeantragenAction')}
        </Button>
      </CardContent>
      <ConfirmDialog
        titel={t('stammdaten.endkunde.detail.shredBeantragenDialogTitel')}
        beschreibung={
          <>
            <p>{t('stammdaten.endkunde.detail.shredBeantragenDialogBeschreibung')}</p>
            <div className="space-y-2">
              <Label htmlFor={grundFeldId}>{t('stammdaten.endkunde.detail.shreddernGrundLabel')}</Label>
              <Select
                id={grundFeldId}
                value={grund}
                onChange={(event) => setGrund(event.target.value as KryptoShreddingGrund)}
              >
                <option value="betroffenenantrag_art17">
                  {t('stammdaten.endkunde.detail.shreddernGrundOptionen.betroffenenantragArt17')}
                </option>
                <option value="aufbewahrung_abgelaufen">
                  {t('stammdaten.endkunde.detail.shreddernGrundOptionen.aufbewahrungAbgelaufen')}
                </option>
                <option value="sonstige_rechtsgrundlage">
                  {t('stammdaten.endkunde.detail.shreddernGrundOptionen.sonstigeRechtsgrundlage')}
                </option>
              </Select>
            </div>
          </>
        }
        bestaetigenLabel={t('stammdaten.endkunde.detail.shredBeantragenBestaetigenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        bestaetigungstext={bestaetigungswort}
        bestaetigungstextLabel={t('stammdaten.endkunde.detail.shredBeantragenBestaetigungstextLabel')}
        onBestaetigen={() => {
          setDialogOffen(false);
          view.beantragen(grund);
        }}
      />
    </Card>
  );
}
