import type { ReactNode } from 'react';
import { Badge } from '../../../../shared/ui/badge';
import { Button } from '../../../../shared/ui/button';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { useErwarteteKanaeleView } from '../../hooks/zaehler';
import { useKannStammdatenAnlegen } from '../../hooks/shared/useKannStammdatenAnlegen';
import { t } from '../../../../shared/i18n/t';

export interface ErwarteteMesskanaeleHinweisProps {
  readonly zaehlerId: string;
  /** Der am Zähler eingetragene Gerätetyp — bestimmt, welche Kanäle erwartet werden. */
  readonly geraetetyp: string | undefined;
}

/**
 * Sagt am Zähler, welche Messkanäle sein Gerätetyp liefern wird — und legt
 * sie auf Knopfdruck zeichengenau an.
 *
 * **Das Problem, das es löst:** „Messgröße" und „Einheit" sind Freitext. Sie
 * müssen exakt dem entsprechen, was der Decoder ausgibt, sonst bekommt der
 * Kanal nie einen Wert und die Uplinks landen in der Quarantäne — bemerkbar
 * erst, wenn das Gerät längst montiert ist. Bisher stand dieses Wissen nur
 * im Programmcode.
 *
 * Der Abgleich ist streng: Ein Kanal gilt nur als vorhanden, wenn Messgröße,
 * Einheit UND Art übereinstimmen. Ein nachsichtiger Vergleich meldete „kwh"
 * als erledigt — und genau der Kanal bliebe leer.
 */
export function ErwarteteMesskanaeleHinweis({ zaehlerId, geraetetyp }: ErwarteteMesskanaeleHinweisProps): ReactNode {
  const view = useErwarteteKanaeleView(zaehlerId, geraetetyp);
  const kannAnlegen = useKannStammdatenAnlegen();

  if (view.isPending) {
    return null;
  }

  if (view.geraetetypUnbekannt) {
    return (
      <p className="text-sm text-muted-foreground">{t('stammdaten.zaehler.erwarteteKanaele.geraetetypUnbekannt')}</p>
    );
  }

  if (view.ohneVorlage || view.kanaele.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {view.alleAngelegt
          ? t('stammdaten.zaehler.erwarteteKanaele.alleAngelegt')
          : t('stammdaten.zaehler.erwarteteKanaele.einfuehrung')}
      </p>
      <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
      <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
      <ul className="space-y-2">
        {view.kanaele.map((kanal) => (
          <li key={kanal.key} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-foreground">
              <span className="font-medium">{kanal.messgroesse}</span> · {kanal.einheit} · {kanal.artLabel}
            </span>
            <span className="text-xs text-muted-foreground">{kanal.beschreibung}</span>
            {kanal.istAngelegt ? (
              <Badge variant="success">{t('stammdaten.zaehler.erwarteteKanaele.angelegt')}</Badge>
            ) : (
              <>
                <Badge variant="warning">{t('stammdaten.zaehler.erwarteteKanaele.fehlt')}</Badge>
                {kannAnlegen && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={view.isSubmitting}
                    aria-label={`${t('stammdaten.zaehler.erwarteteKanaele.anlegenAction')} ${kanal.messgroesse}`}
                    onClick={() => {
                      view.anlegen(kanal);
                    }}
                  >
                    {t('stammdaten.zaehler.erwarteteKanaele.anlegenAction')}
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
