import { useId, useState, type ReactNode } from 'react';
import type { ShredAblehnungsgrund } from '@edms/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { useEndkundeShredAntragOffenView } from '../../hooks/endkunde';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';
import { formatiereZeitpunkt } from '../../../../shared/format/datum';

export interface EndkundeShredAntragOffenProps {
  readonly endkundeId: string;
}

const STANDARD_ABLEHNUNGSGRUND: ShredAblehnungsgrund = 'kein_rechtsgrund';

/**
 * „Offener Shred-Antrag"-Sektion (Art. 17 DSGVO, Vier-Augen-Workflow Schritt
 * 2 — ADR-0009 §2.2–§2.5). Wird von `EndkundeDetailAnsicht` nur gerendert,
 * solange ein Antrag im Status `beantragt` existiert
 * (`useEndkundeShredAntragOffenView`) — die informative Anzeige
 * (Antragsteller/Grund/Zeitpunkte) bleibt für JEDE lesende Rolle sichtbar
 * (analog `read:stammdaten` erlaubt `betrieb`/`compliance-auditor` das
 * Lesen der Anträge); die beiden Entscheidungs-Aktionen sind zusätzlich
 * rollen-gated (`useKannStammdatenAnlegen`, rein kosmetisch — der
 * `@Roles('betrieb')`-Guard des Backend-Controllers ist die alleinige
 * Durchsetzungsinstanz).
 *
 * Selbst-Freigabe-Verbot (ADR-0009 §2.5): ist der aktuelle Session-`sub` der
 * Antragsteller (`istEigenerAntrag`), werden Freigeben/Ablehnen durch einen
 * Hinweistext ERSETZT — der Server bleibt trotzdem die Durchsetzungsinstanz
 * (`useEndkundeShredAntragOffenView` übersetzt einen etwaigen 403
 * `vier_augen_selbstfreigabe_verboten` ohnehin in dieselbe Meldung, z. B. bei
 * einem Wettlauf zweier Tabs derselben Person).
 *
 * Freigeben löst ATOMAR die tatsächliche, unwiderrufliche Krypto-Löschung
 * aus — deshalb `variant="destructive"` + Type-to-confirm „SCHREDDERN"
 * (identisches Wort/identische Warnung wie zuvor der Direkt-Endpoint, jetzt
 * hier statt in `EndkundeShreddenAktion`). Ablehnen ist terminal, aber NICHT
 * destruktiv (kein Type-to-confirm, nur ein `ShredAblehnungsgrund`-Select).
 */
export function EndkundeShredAntragOffen({ endkundeId }: EndkundeShredAntragOffenProps): ReactNode {
  const view = useEndkundeShredAntragOffenView(endkundeId);
  const kannEntscheiden = useKannStammdatenAnlegen();
  const [freigebenDialogOffen, setFreigebenDialogOffen] = useState(false);
  const [ablehnenDialogOffen, setAblehnenDialogOffen] = useState(false);
  const [ablehnungsgrund, setAblehnungsgrund] = useState<ShredAblehnungsgrund>(STANDARD_ABLEHNUNGSGRUND);
  const ablehnungsgrundFeldId = useId();

  if (view.antrag === undefined) {
    return null;
  }

  const bestaetigungswort = t('stammdaten.endkunde.detail.shreddernBestaetigungswort');

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('stammdaten.endkunde.detail.shredAntragOffenTitel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.endkunde.detail.shredAntragAntragsteller')}
            </dt>
            <dd className="text-sm text-foreground">{view.antragstellerKurz}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.endkunde.detail.shreddernGrundLabel')}
            </dt>
            <dd className="text-sm text-foreground">{view.grundLabel}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.endkunde.detail.shredAntragBeantragtAm')}
            </dt>
            <dd className="text-sm text-foreground">{formatiereZeitpunkt(view.beantragtAm)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('stammdaten.endkunde.detail.shredAntragGueltigBis')}
            </dt>
            <dd className="text-sm text-foreground">{formatiereZeitpunkt(view.gueltigBis)}</dd>
          </div>
        </dl>
        {kannEntscheiden && view.selbstFreigabeHinweis !== undefined && (
          <p className="text-sm text-muted-foreground">{view.selbstFreigabeHinweis}</p>
        )}
        {kannEntscheiden && view.selbstFreigabeHinweis === undefined && (
          <div className="flex flex-wrap items-center gap-4">
            {view.freigebenErrorMessage !== undefined && (
              <p role="alert" className="w-full text-sm font-medium text-destructive-text">
                {view.freigebenErrorMessage}
              </p>
            )}
            {view.ablehnenErrorMessage !== undefined && (
              <p role="alert" className="w-full text-sm font-medium text-destructive-text">
                {view.ablehnenErrorMessage}
              </p>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() => setFreigebenDialogOffen(true)}
              disabled={view.isFreigebenSubmitting || view.isAblehnenSubmitting}
            >
              {t('stammdaten.endkunde.detail.shredAntragFreigebenAction')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAblehnenDialogOffen(true)}
              disabled={view.isFreigebenSubmitting || view.isAblehnenSubmitting}
            >
              {t('stammdaten.endkunde.detail.shredAntragAblehnenAction')}
            </Button>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        titel={t('stammdaten.endkunde.detail.shredAntragFreigebenDialogTitel')}
        beschreibung={
          <>
            <p className="font-bold text-destructive-text">{t('stammdaten.endkunde.detail.shreddernDialogWarnung')}</p>
            <p>{t('stammdaten.endkunde.detail.shredAntragFreigebenDialogBeschreibung')}</p>
          </>
        }
        bestaetigenLabel={t('stammdaten.endkunde.detail.shreddernBestaetigenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        variant="destructive"
        offen={freigebenDialogOffen}
        onSchliessen={() => setFreigebenDialogOffen(false)}
        bestaetigungstext={bestaetigungswort}
        bestaetigungstextLabel={t('stammdaten.endkunde.detail.shreddernBestaetigungstextLabel')}
        onBestaetigen={() => {
          setFreigebenDialogOffen(false);
          view.freigeben();
        }}
      />
      <ConfirmDialog
        titel={t('stammdaten.endkunde.detail.shredAntragAblehnenDialogTitel')}
        beschreibung={
          <div className="space-y-2">
            <p>{t('stammdaten.endkunde.detail.shredAntragAblehnenDialogBeschreibung')}</p>
            <Label htmlFor={ablehnungsgrundFeldId}>{t('stammdaten.endkunde.detail.shredAntragAblehnungsgrundLabel')}</Label>
            <Select
              id={ablehnungsgrundFeldId}
              value={ablehnungsgrund}
              onChange={(event) => setAblehnungsgrund(event.target.value as ShredAblehnungsgrund)}
            >
              <option value="kein_rechtsgrund">
                {t('stammdaten.endkunde.detail.shredAntragAblehnungsgrundOptionen.keinRechtsgrund')}
              </option>
              <option value="endkunde_widerspruch">
                {t('stammdaten.endkunde.detail.shredAntragAblehnungsgrundOptionen.endkundeWiderspruch')}
              </option>
              <option value="fehlbedienung">
                {t('stammdaten.endkunde.detail.shredAntragAblehnungsgrundOptionen.fehlbedienung')}
              </option>
              <option value="sonstiges">{t('stammdaten.endkunde.detail.shredAntragAblehnungsgrundOptionen.sonstiges')}</option>
            </Select>
          </div>
        }
        bestaetigenLabel={t('stammdaten.endkunde.detail.shredAntragAblehnenBestaetigenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        offen={ablehnenDialogOffen}
        onSchliessen={() => setAblehnenDialogOffen(false)}
        onBestaetigen={() => {
          setAblehnenDialogOffen(false);
          view.ablehnen(ablehnungsgrund);
        }}
      />
    </Card>
  );
}
