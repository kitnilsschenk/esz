import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiProblemError } from '@edms/shared';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { StatusRegion } from '../../../shared/ui/status-region';
import { Tabs } from '../../../shared/ui/tabs';
import { t } from '../../../shared/i18n/t';
import { usePortalAnmeldung, usePortalEinloesen } from '../api';
import { usePortalTitel } from '../hooks/usePortalTitel';

/** Dieselbe Grenze, die der Server zieht — hier nur, um den Weg dorthin zu ersparen. */
const PASSWORT_MINDESTLAENGE = 12;

/**
 * Die Anmeldemaske des Endkunden — zugleich die erste Seite, die er vom
 * System überhaupt sieht.
 *
 * **Zwei Wege, sichtbar nebeneinander.** Wer zum ersten Mal kommt, hat einen
 * Brief mit einem Zugangscode; wer wiederkommt, hat eine Kennung und ein
 * Passwort. Die Verwechslung dieser beiden ist der häufigste Grund, aus dem
 * eine Erstanmeldung scheitert — deshalb stehen sie als beschriftete Tabs da
 * und nicht als ein Formular mit einem kleinen Link darunter.
 *
 * **Die Fehlermeldung des Servers wird durchgereicht, wo sie etwas sagt.**
 * Beim Einlösen ist sie konkret („Passwort zu kurz"); beim Anmelden ist sie
 * absichtlich nichtssagend, weil jede Auskunft eine Auskunft über fremde
 * Kennungen wäre. Diese Ansicht erfindet in beiden Fällen nichts dazu.
 */
export function PortalAnmeldeSeite(): ReactNode {
  usePortalTitel(t('portal.anmeldung.titel'));

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h1">{t('portal.anmeldung.titel')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('portal.anmeldung.beschreibung')}</p>
        </CardHeader>
        <CardContent>
          <Tabs
            ariaLabel={t('portal.anmeldung.titel')}
            items={[
              { id: 'anmelden', label: t('portal.anmeldung.tabAnmelden'), content: <AnmeldeFormular /> },
              { id: 'einloesen', label: t('portal.anmeldung.tabEinloesen'), content: <EinloeseFormular /> },
            ]}
          />
        </CardContent>
      </Card>
      <p className="max-w-prose text-xs text-muted-foreground">{t('portal.anmeldung.keinBrief')}</p>
    </div>
  );
}

function AnmeldeFormular(): ReactNode {
  const [kennung, setzeKennung] = useState('');
  const [passwort, setzePasswort] = useState('');
  const [eingabeFehler, setzeEingabeFehler] = useState<string | undefined>(undefined);
  const mutation = usePortalAnmeldung();

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    if (kennung.trim().length === 0) {
      setzeEingabeFehler(t('portal.anmeldung.kennungFehlt'));
      return;
    }
    setzeEingabeFehler(undefined);
    mutation.mutate({ kennung: kennung.trim(), passwort });
  }

  return (
    <form className="space-y-4" onSubmit={absenden}>
      <StatusRegion ton="fehler" nachricht={eingabeFehler ?? serverMeldung(mutation.error)} />

      <div className="space-y-1">
        <Label htmlFor="portal-kennung">{t('portal.anmeldung.kennungLabel')}</Label>
        <Input
          id="portal-kennung"
          name="kennung"
          autoComplete="username"
          value={kennung}
          aria-describedby="portal-kennung-hinweis"
          onChange={(ereignis) => {
            setzeKennung(ereignis.target.value);
          }}
        />
        <p id="portal-kennung-hinweis" className="text-xs text-muted-foreground">
          {t('portal.anmeldung.kennungHinweis')}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="portal-passwort">{t('portal.anmeldung.passwortLabel')}</Label>
        <Input
          id="portal-passwort"
          name="passwort"
          type="password"
          autoComplete="current-password"
          value={passwort}
          onChange={(ereignis) => {
            setzePasswort(ereignis.target.value);
          }}
        />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? t('portal.anmeldung.laeuft') : t('portal.anmeldung.absendenAnmelden')}
      </Button>
    </form>
  );
}

function EinloeseFormular(): ReactNode {
  const [code, setzeCode] = useState('');
  const [passwort, setzePasswort] = useState('');
  const [wiederholung, setzeWiederholung] = useState('');
  const [eingabeFehler, setzeEingabeFehler] = useState<string | undefined>(undefined);
  const mutation = usePortalEinloesen();

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();

    if (code.trim().length === 0) {
      setzeEingabeFehler(t('portal.anmeldung.codeFehlt'));
      return;
    }
    // Die Laengenpruefung steht auch im Server — hier nur, damit der Kunde
    // nicht erst nach einem Serverlauf erfaehrt, was er ohnehin sieht.
    if (passwort.normalize('NFC').length < PASSWORT_MINDESTLAENGE) {
      setzeEingabeFehler(t('portal.anmeldung.passwortZuKurz'));
      return;
    }
    if (passwort !== wiederholung) {
      // Die Wiederholung gibt es NUR hier: Wer sich beim Setzen vertippt,
      // sperrt sich aus einem Zugang aus, den er nur einmal bekommt.
      setzeEingabeFehler(t('portal.anmeldung.passwortUngleich'));
      return;
    }

    setzeEingabeFehler(undefined);
    mutation.mutate({ code: code.trim(), passwort });
  }

  return (
    <form className="space-y-4" onSubmit={absenden}>
      <StatusRegion ton="fehler" nachricht={eingabeFehler ?? serverMeldung(mutation.error)} />

      <div className="space-y-1">
        <Label htmlFor="portal-code">{t('portal.anmeldung.codeLabel')}</Label>
        <Input
          id="portal-code"
          name="code"
          autoComplete="one-time-code"
          value={code}
          aria-describedby="portal-code-hinweis"
          onChange={(ereignis) => {
            setzeCode(ereignis.target.value);
          }}
        />
        <p id="portal-code-hinweis" className="text-xs text-muted-foreground">
          {t('portal.anmeldung.codeHinweis')}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="portal-neues-passwort">{t('portal.anmeldung.neuesPasswortLabel')}</Label>
        <Input
          id="portal-neues-passwort"
          name="neuesPasswort"
          type="password"
          autoComplete="new-password"
          value={passwort}
          aria-describedby="portal-neues-passwort-hinweis"
          onChange={(ereignis) => {
            setzePasswort(ereignis.target.value);
          }}
        />
        <p id="portal-neues-passwort-hinweis" className="text-xs text-muted-foreground">
          {t('portal.anmeldung.neuesPasswortHinweis')}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="portal-passwort-wiederholen">{t('portal.anmeldung.passwortWiederholenLabel')}</Label>
        <Input
          id="portal-passwort-wiederholen"
          name="passwortWiederholen"
          type="password"
          autoComplete="new-password"
          value={wiederholung}
          onChange={(ereignis) => {
            setzeWiederholung(ereignis.target.value);
          }}
        />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? t('portal.anmeldung.laeuft') : t('portal.anmeldung.absendenEinloesen')}
      </Button>
    </form>
  );
}

/**
 * Die Meldung des Servers, wo sie etwas sagt — sonst der allgemeine Satz.
 *
 * Beim Anmelden antwortet der Server bewusst einheitlich; diese Ansicht macht
 * daraus nichts Konkreteres. Beim Einlösen ist `detail` dagegen eine echte
 * Auskunft (etwa zur Passwortlänge), und die gehört dem Kunden.
 */
function serverMeldung(fehler: unknown): string | undefined {
  if (fehler === null || fehler === undefined) {
    return undefined;
  }
  if (fehler instanceof ApiProblemError && fehler.detail !== undefined) {
    return fehler.detail;
  }
  return t('portal.anmeldung.fehler');
}
