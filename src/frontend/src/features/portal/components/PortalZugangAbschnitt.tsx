import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { PortalZugangAusgabe, PortalZugangStatus } from '@edms/shared';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { StatusRegion } from '../../../shared/ui/status-region';
import { formatiereZeitpunkt } from '../../../shared/format/datum';
import { t, type MessageKey } from '../../../shared/i18n/t';
import { usePortalZugangAusgabe, usePortalZugangSperre, usePortalZugangStand } from '../api';

export interface PortalZugangAbschnittProps {
  readonly endkundeId: string;
  readonly headingId: string;
}

const STATUS_SCHLUESSEL = {
  ausgegeben: 'portal.zugang.statusAusgegeben',
  aktiv: 'portal.zugang.statusAktiv',
  gesperrt: 'portal.zugang.statusGesperrt',
} as const satisfies Record<PortalZugangStatus, MessageKey>;

/**
 * Übersetzt den Status und hält einen unbekannten Wert AUS der Fehlergrenze.
 *
 * Bis 2026-09-16 stand hier ein direkter Zugriff `t(STATUS_SCHLUESSEL[status])`.
 * Der OpenAPI-Vertrag führte `offen`, geliefert hat das Backend immer
 * `ausgegeben` (so steht es seit V0066 im CHECK `ck_portal_zugang_status`).
 * Der Nachschlag ergab `undefined`, `t(undefined)` warf — und weil hier keine
 * eigene Grenze lag, fing die `RouteErrorBoundary` der Route den Fehler:
 * Die **gesamte** Endkunden-Detailseite wurde durch „Ein unerwarteter Fehler
 * ist aufgetreten." ersetzt, sobald ein Zugangscode ausgegeben war. Damit war
 * der Weg zum digitalen Opt-out über die Oberfläche unbenutzbar.
 *
 * Der Vertrag ist korrigiert und der Typ stimmt wieder. Der Rückfall bleibt
 * trotzdem: Ein Enum-Wert, den der Server kennt und dieser Client noch nicht,
 * ist bei einem versionierten Vertrag jederzeit wieder möglich — und darf
 * dann eine Zeile in einer Definitionsliste kosten, nicht die ganze Seite.
 */
function statusText(status: PortalZugangStatus): string {
  const schluessel: MessageKey | undefined = STATUS_SCHLUESSEL[status];
  return schluessel === undefined ? status : t(schluessel);
}

/**
 * Die Betriebssicht auf den Portal-Zugang eines Endkunden.
 *
 * **Ohne diesen Abschnitt wäre das Portal unerreichbar.** Der Zugangscode
 * entsteht nur auf Anforderung des Betriebs, und der Kunde erfährt ihn nur
 * aus dem gedruckten Brief — es gibt keinen Selbstregistrierungsweg und
 * bewusst auch keinen: Wer sich selbst anmelden könnte, könnte sich für
 * jemand anderen anmelden.
 *
 * **Der Code steht genau einmal auf dem Bildschirm.** Er wird nicht in den
 * Query-Cache gelegt, nicht erneut abrufbar gehalten und verschwindet, sobald
 * der Bereich geschlossen wird. Das ist keine Unbequemlichkeit, die man
 * wegoptimieren sollte — ein nachschlagbarer Code wäre ein Generalschlüssel
 * zu fremden Verbrauchsdaten, und der Betrieb hätte ihn dauerhaft in
 * Reichweite.
 */
export function PortalZugangAbschnitt({ endkundeId, headingId }: PortalZugangAbschnittProps): ReactNode {
  const stand = usePortalZugangStand(endkundeId);
  const ausgabe = usePortalZugangAusgabe(endkundeId);
  const sperre = usePortalZugangSperre(endkundeId);
  const [brief, setzeBrief] = useState<PortalZugangAusgabe | undefined>(undefined);
  const [ausgabeDialog, setzeAusgabeDialog] = useState(false);
  const [sperrDialog, setzeSperrDialog] = useState(false);

  const gibAus = useCallback((): void => {
    ausgabe.mutate(undefined, {
      onSuccess: (ergebnis) => {
        setzeBrief(ergebnis);
      },
    });
  }, [ausgabe]);

  const vorhanden = stand.data?.vorhanden ?? false;
  const istGesperrt = stand.data?.status === 'gesperrt';

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle as="h2" id={headingId}>
            {t('portal.zugang.titel')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-prose text-sm text-muted-foreground">{t('portal.zugang.beschreibung')}</p>

          {stand.isPending && <p className="text-sm text-muted-foreground">{t('portal.zugang.laedt')}</p>}
          {stand.isError && <StatusRegion ton="fehler" nachricht={t('portal.zugang.ladeFehler')} />}

          {stand.data !== undefined && !vorhanden && (
            <p className="text-sm">{t('portal.zugang.keinZugang')}</p>
          )}

          {stand.data !== undefined && vorhanden && (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <dt className="text-muted-foreground">{t('portal.zugang.kennungLabel')}</dt>
              <dd className="font-medium">{stand.data.kennung}</dd>
              <dt className="text-muted-foreground">{t('portal.zugang.statusLabel')}</dt>
              <dd>{stand.data.status === null ? '—' : statusText(stand.data.status)}</dd>
              <dt className="text-muted-foreground">{t('portal.zugang.passwortGesetztLabel')}</dt>
              <dd>{stand.data.passwortGesetzt ? t('portal.zugang.ja') : t('portal.zugang.nein')}</dd>
              {stand.data.codeOffenBis !== null && (
                <>
                  <dt className="text-muted-foreground">{t('portal.zugang.codeOffenBisLabel')}</dt>
                  <dd>{formatiereZeitpunkt(stand.data.codeOffenBis)}</dd>
                </>
              )}
              {stand.data.gesperrtBis !== null && (
                <>
                  <dt className="text-muted-foreground">{t('portal.zugang.gesperrtBisLabel')}</dt>
                  <dd>{formatiereZeitpunkt(stand.data.gesperrtBis)}</dd>
                </>
              )}
            </dl>
          )}

          <StatusRegion ton="fehler" nachricht={ausgabe.isError ? t('portal.zugang.ausgebenFehler') : undefined} />
          <StatusRegion ton="fehler" nachricht={sperre.isError ? t('portal.zugang.sperrenFehler') : undefined} />

          {brief !== undefined && (
            <ZugangsbriefAnzeige
              ausgabe={brief}
              onSchliessen={() => {
                setzeBrief(undefined);
              }}
            />
          )}

          {stand.data !== undefined && !istGesperrt && brief === undefined && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={ausgabe.isPending}
                onClick={() => {
                  // Beim ERSTEN Mal ohne Rueckfrage: Es geht nichts verloren.
                  // Ab dem zweiten wird ein verschickter Brief ungueltig —
                  // das ist eine Entscheidung, keine Wiederholung.
                  if (vorhanden) {
                    setzeAusgabeDialog(true);
                  } else {
                    gibAus();
                  }
                }}
              >
                {ausgabe.isPending
                  ? t('portal.zugang.ausgebenLaeuft')
                  : vorhanden
                    ? t('portal.zugang.ausgebenErneut')
                    : t('portal.zugang.ausgeben')}
              </Button>

              {vorhanden && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={sperre.isPending}
                  onClick={() => {
                    setzeSperrDialog(true);
                  }}
                >
                  {sperre.isPending ? t('portal.zugang.sperrenLaeuft') : t('portal.zugang.sperren')}
                </Button>
              )}
            </div>
          )}

          <ConfirmDialog
            offen={ausgabeDialog}
            titel={t('portal.zugang.bestaetigenTitel')}
            beschreibung={t('portal.zugang.bestaetigenText')}
            bestaetigenLabel={t('portal.zugang.bestaetigenJa')}
            abbrechenLabel={t('portal.zugang.bestaetigenAbbrechen')}
            onSchliessen={() => {
              setzeAusgabeDialog(false);
            }}
            onBestaetigen={() => {
              setzeAusgabeDialog(false);
              gibAus();
            }}
          />

          <ConfirmDialog
            offen={sperrDialog}
            variant="destructive"
            titel={t('portal.zugang.sperrenTitel')}
            beschreibung={t('portal.zugang.sperrenText')}
            bestaetigenLabel={t('portal.zugang.sperrenJa')}
            abbrechenLabel={t('portal.zugang.bestaetigenAbbrechen')}
            onSchliessen={() => {
              setzeSperrDialog(false);
            }}
            onBestaetigen={() => {
              setzeSperrDialog(false);
              sperre.mutate();
            }}
          />
        </CardContent>
      </Card>
    </section>
  );
}

interface ZugangsbriefAnzeigeProps {
  readonly ausgabe: PortalZugangAusgabe;
  readonly onSchliessen: () => void;
}

/**
 * Der Code und der fertige Brief — der einzige Augenblick, in dem beides
 * existiert.
 *
 * Der Code steht auch im Klartext daneben, nicht nur im Brief: Wer ihn
 * telefonisch durchgibt oder in ein anderes Anschreiben übernimmt, soll ihn
 * nicht aus einer Druckvorschau abschreiben müssen.
 */
function ZugangsbriefAnzeige({ ausgabe, onSchliessen }: ZugangsbriefAnzeigeProps): ReactNode {
  const rahmenRef = useRef<HTMLIFrameElement>(null);

  const drucken = useCallback((): void => {
    const fenster = rahmenRef.current?.contentWindow;
    if (fenster !== null && fenster !== undefined && typeof fenster.print === 'function') {
      fenster.print();
    }
  }, []);

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
      <h3 className="text-sm font-semibold">{t('portal.zugang.briefTitel')}</h3>

      {ausgabe.portalUrlIstStandard && (
        <StatusRegion ton="fehler" nachricht={t('portal.zugang.briefWarnungStandardUrl')} />
      )}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <dt className="text-muted-foreground">{t('portal.zugang.briefKennungLabel')}</dt>
        <dd className="font-mono font-medium">{ausgabe.kennung}</dd>
        <dt className="text-muted-foreground">{t('portal.zugang.briefCodeLabel')}</dt>
        <dd className="font-mono text-base font-semibold">{ausgabe.code}</dd>
        <dt className="text-muted-foreground">{t('portal.zugang.briefGueltigBisLabel')}</dt>
        <dd>{formatiereZeitpunkt(ausgabe.gueltigBis)}</dd>
      </dl>

      <p className="max-w-prose text-xs text-muted-foreground">{t('portal.zugang.ausgebenHinweis')}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={drucken}>
          {t('portal.zugang.briefDrucken')}
        </Button>
        <Button type="button" variant="outline" onClick={onSchliessen}>
          {t('portal.zugang.briefSchliessen')}
        </Button>
      </div>

      {/* Wie im Kundenbereich: gerendert, aber ausserhalb des Blickfelds — ein
          nicht gerenderter Rahmen druckt in mehreren Browsern nicht. */}
      <iframe
        ref={rahmenRef}
        title={t('portal.zugang.briefRahmenTitel')}
        srcDoc={ausgabe.brief}
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 border-0 opacity-0"
      />
    </div>
  );
}
