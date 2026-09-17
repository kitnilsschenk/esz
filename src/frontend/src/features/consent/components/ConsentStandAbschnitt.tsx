import { useId, useState, type ReactNode } from 'react';
import type { SubjektTyp } from '@edms/shared';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { StatusRegion } from '../../../shared/ui/status-region';
import { Badge } from '../../../shared/ui/badge';
import { t } from '../../../shared/i18n/t';
import { useConsentStandView, type ErklaerungAngaben, type ZweckStandView } from '../hooks/useConsentStandView';

export interface ConsentStandAbschnittProps {
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly headingId: string;
}

/**
 * Der Consent-Stand einer Person (ADR-0012 B2).
 *
 * **Was diese Ansicht bewusst NICHT verschweigt.**
 *
 * 1. Sie zeigt jeden Zweck des Katalogs — auch die, zu denen nie
 *    eingewilligt wurde. „Hierzu liegt keine Einwilligung vor" ist eine
 *    Aussage, die eine Auskunft nach Art. 15 DSGVO treffen muss; sie darf
 *    nicht aus dem Fehlen einer Zeile erraten werden.
 * 2. Sie benennt je Zweck, ob die Verweigerung die Leistung kostet
 *    (Art. 7 Abs. 4 DSGVO). Ohne diese Angabe kann niemand beurteilen, was
 *    von seiner Antwort abhängt.
 * 3. Sie führt den Verlauf, nicht nur den aktuellen Stand. Eine widerrufene
 *    Einwilligung ist der Nachweis, dass die Verarbeitung rechtmäßig war,
 *    solange sie galt.
 *
 * **Kein digitales Opt-in.** Die Betriebssicht trägt immer eine anderswo
 * erteilte Einwilligung nach; sie bietet den digitalen Weg deshalb gar nicht
 * erst an. Die einzige hier verfügbare IP wäre die des Bearbeiters, und sie
 * als die der betroffenen Person zu protokollieren wäre eine Fälschung des
 * Nachweises.
 *
 * **Die Rechtsgrundlage wird nicht gewählt, sondern angezeigt** (A12-1). Sie
 * steht je (Zweck, Subjektart) in der Matrix aus V0047 — ein Auswahlfeld
 * dafür hätte die Entscheidung an die falsche Stelle gelegt, und der
 * häufigste Fehler wäre gewesen, dem Endkunden ein Häkchen für die
 * Verbrauchsmessung vorzulegen, wo ein Vertrag trägt. Angezeigt wird sie
 * trotzdem, samt Begründung: Eine Grundlage, die der Bediener nicht sieht,
 * kann er auch nicht hinterfragen.
 */
export function ConsentStandAbschnitt({ subjektTyp, subjektId, headingId }: ConsentStandAbschnittProps): ReactNode {
  const view = useConsentStandView(subjektTyp, subjektId);
  const [angaben, setAngaben] = useState<Record<string, ErklaerungAngaben>>({});
  const feldId = useId();

  // KEINE Vorbelegung mit dem heutigen Tag. Der Regelfall dieser Ansicht ist
  // das Nachtragen einer Erklärung, die anderswo abgegeben wurde — ein
  // vorausgefülltes Heute wäre die bequemste Falschangabe von allen und
  // erzeugte genau den Fehler, den V0046 abstellt.
  function angabenFuer(zweckCode: string): ErklaerungAngaben {
    return angaben[zweckCode] ?? { erklaertAm: '', quelleRef: '' };
  }

  function setzeAngaben(zweckCode: string, teil: Partial<ErklaerungAngaben>): void {
    setAngaben((bisher) => ({
      ...bisher,
      [zweckCode]: { ...(bisher[zweckCode] ?? { erklaertAm: '', quelleRef: '' }), ...teil },
    }));
  }

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId} as="h2">
            {t('consent.stand.sectionTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-prose text-sm text-muted-foreground">{t('consent.stand.einfuehrung')}</p>

          {view.isPending && <p className="text-sm text-muted-foreground">{t('stammdaten.common.laedt')}</p>}
          {view.isError && (
            <p className="text-sm text-destructive-text" role="alert">
              {t('stammdaten.common.fehler')}
            </p>
          )}

          {!view.isPending && !view.isError && (
            <ul className="space-y-4">
              {view.zwecke.map((zweck) => (
                <li key={zweck.zweckCode} className="rounded-md border border-border p-4">
                  <ZweckZeile
                    zweck={zweck}
                    angaben={angabenFuer(zweck.zweckCode)}
                    feldIdBasis={`${feldId}-${zweck.zweckCode}`}
                    gesperrt={view.isSubmitting}
                    onAngabenChange={(teil) => {
                      setzeAngaben(zweck.zweckCode, teil);
                    }}
                    onErteile={() => {
                      view.erteile(zweck.zweckCode, angabenFuer(zweck.zweckCode));
                    }}
                    onWiderrufe={() => {
                      if (zweck.wirksameId !== undefined) {
                        view.widerrufe(zweck.wirksameId, angabenFuer(zweck.zweckCode));
                      }
                    }}
                    onWidersprich={() => {
                      view.widersprich(zweck.zweckCode, angabenFuer(zweck.zweckCode));
                    }}
                    onWiderspruchZuruecknehmen={() => {
                      if (zweck.wirksamerWiderspruchId !== undefined) {
                        view.nimmWiderspruchZurueck(zweck.wirksamerWiderspruchId, angabenFuer(zweck.zweckCode));
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          <StatusRegion ton="fehler" nachricht={view.submitErrorMessage} />
          <StatusRegion ton="erfolg" nachricht={view.erfolgsMeldung} />
        </CardContent>
      </Card>
    </section>
  );
}

interface ZweckZeileProps {
  readonly zweck: ZweckStandView;
  readonly angaben: ErklaerungAngaben;
  readonly feldIdBasis: string;
  readonly gesperrt: boolean;
  readonly onAngabenChange: (teil: Partial<ErklaerungAngaben>) => void;
  readonly onErteile: () => void;
  readonly onWiderrufe: () => void;
  readonly onWidersprich: () => void;
  readonly onWiderspruchZuruecknehmen: () => void;
}

function ZweckZeile({
  zweck,
  angaben,
  feldIdBasis,
  gesperrt,
  onAngabenChange,
  onErteile,
  onWiderrufe,
  onWidersprich,
  onWiderspruchZuruecknehmen,
}: ZweckZeileProps): ReactNode {
  const vollstaendig = angaben.erklaertAm !== '' && angaben.quelleRef.trim() !== '';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{zweck.bezeichnung}</p>
          {/*
            Der Hinweis haengt an der RECHTSGRUNDLAGE, nicht am
            `verweigerbar`-Flag allein. Vorher stand an einem Zweck, der auf
            Art. 6 Abs. 1 lit. b beruht, "Ohne diese Einwilligung ist die
            Leistung nicht zu erbringen" — und zwei Zeilen darunter, dass
            hier gar keine Einwilligung zu erfassen sei. Eine nicht
            verweigerbare Einwilligung ist aber keine (Art. 7 Abs. 4);
            erforderlich ist der ZWECK, und seine Grundlage ist dann der
            Vertrag.
          */}
          <p className="text-xs text-muted-foreground">
            {zweck.beruhtAufEinwilligung ? t('consent.stand.verweigerbar') : t('consent.stand.erforderlich')}
          </p>
        </div>
        <Badge variant={zweck.istWirksam ? 'default' : 'secondary'}>{zweck.statusLabel}</Badge>
      </div>

      {zweck.detailLabel !== undefined && <p className="text-sm text-muted-foreground">{zweck.detailLabel}</p>}

      {/*
        Die Rechtsgrundlage wird ANGEZEIGT, nicht gewählt (A12-1) — samt
        Begründung: Eine Grundlage, die der Bediener nicht sieht, kann er
        nicht hinterfragen, und eine Matrix, die Eingaben ohne Angabe von
        Gründen ablehnt, wäre eine Blackbox.
      */}
      <div className="rounded-md bg-muted/40 px-3 py-2">
        <p className="text-xs font-medium text-foreground">
          {t('consent.stand.rechtsgrundlageLabel')}: {zweck.rechtsgrundlageLabel}
        </p>
        {/*
          Die Begruendung stammt aus der Matrix (V0047) und ist dort mit voller
          juristischer Herleitung hinterlegt — samt Auflagenkuerzeln und
          Aktenvermerk-Verweisen. Das gehoert nicht in den normalen
          Bedienablauf, aber es darf auch nicht verschwinden: Wer die
          Grundlage hinterfragen will, muss sie nachlesen koennen. Deshalb
          eingeklappt statt gestrichen.
        */}
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
            {t('consent.stand.begruendungToggle')}
          </summary>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">{zweck.begruendung}</p>
        </details>
      </div>

      {/*
        Erklärungsdatum und Fundstelle stehen bei BEIDEN Vorgängen —
        Erteilen wie Widerrufen. Beim Widerruf wiegt der Zeitpunkt sogar
        schwerer: Ein am 1. brieflich erklärter, am 20. erfasster Widerruf
        ließe sonst neunzehn Tage rechtswidriger Verarbeitung rechtmäßig
        aussehen, und das zulasten der betroffenen Person.
      */}
      {/*
        Nur dort, wo ueberhaupt etwas zu erfassen ist. Felder fuer eine
        Erklaerung, die es zu diesem Zweck gar nicht geben kann, sind eine
        Aufforderung ins Leere — und stehen im Widerspruch zu dem Satz
        darunter, der genau das sagt.
      */}
      {(zweck.erteilbar || zweck.istWirksam || zweck.widersprechbar) && (
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${feldIdBasis}-datum`}>{t('consent.stand.erklaertAmLabel')}</Label>
          <Input
            id={`${feldIdBasis}-datum`}
            type="date"
            value={angaben.erklaertAm}
            onChange={(event) => {
              onAngabenChange({ erklaertAm: event.target.value });
            }}
          />
          <p className="max-w-xs text-xs text-muted-foreground">{t('consent.stand.erklaertAmHinweis')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${feldIdBasis}-quelle`}>{t('consent.stand.quelleRefLabel')}</Label>
          <Input
            id={`${feldIdBasis}-quelle`}
            type="text"
            value={angaben.quelleRef}
            onChange={(event) => {
              onAngabenChange({ quelleRef: event.target.value });
            }}
          />
          <p className="max-w-xs text-xs text-muted-foreground">{t('consent.stand.quelleRefHinweis')}</p>
        </div>
      </div>
      )}

      {zweck.istWirksam ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={gesperrt || !vollstaendig}
          onClick={onWiderrufe}
        >
          {t('consent.stand.widerrufenAction')}
        </Button>
      ) : zweck.erteilbar ? (
        <Button type="button" size="sm" disabled={gesperrt || !vollstaendig} onClick={onErteile}>
          {t('consent.stand.erteilenAction')}
        </Button>
      ) : zweck.widersprechbar ? (
        /*
          HIER stand bis zuletzt nur der Satz „hierzu ist nichts zu
          erfassen" — und das war die Luecke. Eine vertragliche oder
          Opt-out-Grundlage wird tatsaechlich nicht ERTEILT, sie gilt. Aber
          ihr kann WIDERSPROCHEN werden (AW-27, V0052), und dafuer gab es in
          der Betriebssicht keinen Weg. Fuer den Anschlussnutzer gab es gar
          keinen: Er hat kein Portal, in dem er selbst handeln koennte.

          Die beiden Rechte schliessen einander aus, deshalb steht der
          Widerspruch genau im `else`-Zweig des Erteilens: Gegen eine
          Einwilligung widerspricht man nicht, man widerruft sie
          (Art. 7 Abs. 3).
        */
        <div className="space-y-2">
          <p className="max-w-prose text-xs text-muted-foreground">
            {zweck.widerspruchWirksam
              ? t('consent.stand.widerspruchWirksamHinweis')
              : zweck.erlaubnismodus === 'vertraglich'
                ? /*
                    Ein Widerspruch gegen eine VERTRAGLICH geschuldete
                    Verarbeitung ist erfassbar — die Datenbank laesst ihn zu
                    (`ck_widerspruch_kein_opt_in` schliesst nur opt_in aus).
                    Er ist aber etwas anderes als die Abwahl einer
                    Zusatzleistung, und der Text sagt das: Wer der Messung
                    widerspricht, widerspricht der Leistung selbst.
                  */
                  t('consent.stand.widerspruchVertraglichHinweis')
                : t('consent.stand.widerspruchMoeglich')}
          </p>
          {zweck.widerspruchDetailLabel !== undefined && (
            <p className="text-sm text-foreground">{zweck.widerspruchDetailLabel}</p>
          )}
          {zweck.widerspruchWirksam ? (
            <Button
              type="button"
              size="sm"
              disabled={gesperrt || !vollstaendig}
              onClick={onWiderspruchZuruecknehmen}
            >
              {t('consent.stand.widerspruchZuruecknehmenAction')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={gesperrt || !vollstaendig}
              onClick={onWidersprich}
            >
              {t('consent.stand.widersprechenAction')}
            </Button>
          )}
        </div>
      ) : null}

      {/*
        Der Widerspruchs-Verlauf steht GETRENNT vom Einwilligungs-Verlauf.
        Beides in eine Liste zu legen hiesse, zwei verschiedene Rechte
        nebeneinander zu stellen, die man ohnehin leicht verwechselt — und
        eine Auskunft nach Art. 15 muesste sie wieder auseinandersortieren.
      */}
      {zweck.widerspruchVerlauf.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-link underline-offset-4 hover:underline">
            {t('consent.stand.widerspruchVerlaufToggle').replace(
              '{anzahl}',
              String(zweck.widerspruchVerlauf.length),
            )}
          </summary>
          <ul className="mt-2 space-y-2 border-l border-border pl-4">
            {zweck.widerspruchVerlauf.map((eintrag) => (
              <li key={eintrag.id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{eintrag.erklaertLabel}</span> · {eintrag.erfassungswegLabel}
                {eintrag.quelleRefLabel !== undefined && <> · {eintrag.quelleRefLabel}</>}
                {eintrag.zurueckgenommenLabel !== undefined && (
                  <>
                    {' '}
                    ·{' '}
                    {t('consent.stand.widerspruchZurueckgenommenAm').replace(
                      '{am}',
                      eintrag.zurueckgenommenLabel,
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {zweck.verlauf.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-link underline-offset-4 hover:underline">
            {t('consent.stand.verlaufToggle').replace('{anzahl}', String(zweck.verlauf.length))}
          </summary>
          <ul className="mt-2 space-y-2 border-l border-border pl-4">
            {zweck.verlauf.map((eintrag) => (
              <li key={eintrag.id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{eintrag.erteiltLabel}</span> · {t('consent.stand.fassungKurz')}{' '}
                {eintrag.fassung} · {eintrag.rechtsgrundlageLabel} · {eintrag.erfassungswegLabel}
                {eintrag.quelleRefLabel !== undefined && <> · {eintrag.quelleRefLabel}</>}
                {eintrag.widerrufenLabel !== undefined && (
                  <> · {t('consent.stand.widerrufenAm').replace('{am}', eintrag.widerrufenLabel)}</>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
