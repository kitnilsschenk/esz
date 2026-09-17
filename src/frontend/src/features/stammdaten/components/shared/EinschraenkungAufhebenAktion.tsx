import { useId, useState, type ReactNode } from 'react';
import { Card, CardContent } from '../../../../shared/ui/card';
import { Button } from '../../../../shared/ui/button';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../../shared/ui/status-region';
import {
  UNTERRICHTUNG_KANAL_OPTIONEN,
  type UnterrichtungKanal,
} from '../../hooks/shared/unterrichtungKanal';
import { t } from '../../../../shared/i18n/t';
import type { MutationViewBasis } from '../../hooks/shared/mutationView';

export interface EinschraenkungAufhebenAktionProps {
  readonly unterrichtung: MutationViewBasis & { readonly unterrichten: (kanal: UnterrichtungKanal) => void };
  readonly aufhebung: MutationViewBasis & { readonly entsperren: () => void };
}

/**
 * Der zweistufige Entsperr-Vorgang nach Art. 18 Abs. 3 DSGVO (ADR-0007
 * A11.7/A11.10) — GETEILT von Endkunde und Anschlussnutzer, weil der Vorgang
 * fuer beide identisch ist und die Reihenfolge nur an einer Stelle erklaert
 * werden sollte.
 *
 * Beide Schritte sind SICHTBAR untereinander, nicht hinter einem Assistenten
 * versteckt: der Sachbearbeiter soll sehen, dass es zwei Handlungen sind und
 * dass die zweite von der ersten abhaengt. Der Aufhebungs-Knopf bleibt
 * deshalb dauerhaft anklickbar — scheitert er mangels Nachweis, erklaert die
 * Server-Fehlermeldung genau das. Ihn clientseitig zu sperren waere
 * verlockend, wuerde aber eine Kontrolle vortaeuschen, die serverseitig
 * liegt (und beim naechsten Reload aus veraltetem Cache falsch sein koennte).
 *
 * Kein Vorgabewert fuer den Kanal — wie beim Sperrgrund ist das eine
 * Feststellung, kein Formular-Default.
 */
export function EinschraenkungAufhebenAktion({
  unterrichtung,
  aufhebung,
}: EinschraenkungAufhebenAktionProps): ReactNode {
  const [kanal, setKanal] = useState<UnterrichtungKanal | ''>('');
  const [dialogOffen, setDialogOffen] = useState(false);
  const kanalFeldId = useId();

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('stammdaten.common.einschraenkungAufhebung.schritt1Titel')}</p>
          <p className="text-sm text-muted-foreground">
            {t('stammdaten.common.einschraenkungAufhebung.schritt1Beschreibung')}
          </p>
          <StatusRegion ton="fehler" nachricht={unterrichtung.submitErrorMessage} />
          <StatusRegion ton="erfolg" nachricht={unterrichtung.erfolgsMeldung} />
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor={kanalFeldId}>{t('stammdaten.common.einschraenkungAufhebung.kanalLabel')}</Label>
              <Select
                id={kanalFeldId}
                value={kanal}
                onChange={(event) => setKanal(event.target.value as UnterrichtungKanal | '')}
              >
                <option value="">{t('stammdaten.common.einschraenkungAufhebung.kanalPlatzhalter')}</option>
                {UNTERRICHTUNG_KANAL_OPTIONEN.map((option) => (
                  <option key={option.wert} value={option.wert}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => {
                if (kanal !== '') {
                  unterrichtung.unterrichten(kanal);
                }
              }}
              disabled={unterrichtung.isSubmitting || kanal === ''}
            >
              {t('stammdaten.common.einschraenkungAufhebung.unterrichtenAction')}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('stammdaten.common.einschraenkungAufhebung.schritt2Titel')}</p>
          <p className="text-sm text-muted-foreground">
            {t('stammdaten.common.einschraenkungAufhebung.schritt2Beschreibung')}
          </p>
          <StatusRegion ton="fehler" nachricht={aufhebung.submitErrorMessage} />
          <StatusRegion ton="erfolg" nachricht={aufhebung.erfolgsMeldung} />
          <Button type="button" onClick={() => setDialogOffen(true)} disabled={aufhebung.isSubmitting}>
            {t('stammdaten.common.einschraenkungAufhebung.entsperrenAction')}
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        titel={t('stammdaten.common.einschraenkungAufhebung.dialogTitel')}
        beschreibung={t('stammdaten.common.einschraenkungAufhebung.dialogBeschreibung')}
        bestaetigenLabel={t('stammdaten.common.einschraenkungAufhebung.entsperrenAction')}
        abbrechenLabel={t('stammdaten.common.abbrechen')}
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        onBestaetigen={() => {
          setDialogOffen(false);
          aufhebung.entsperren();
        }}
      />
    </Card>
  );
}
