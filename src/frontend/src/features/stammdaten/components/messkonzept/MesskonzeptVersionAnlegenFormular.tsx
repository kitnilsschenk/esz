import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  messkonzeptEnergietraegerZeileDefaultValues,
  messkonzeptVersionAnlegenFormSchema,
  type MesskonzeptEnergietraegerZeileValues,
  type MesskonzeptVersionAnlegenFormValues,
} from '../../api/messkonzept';
import { useMesskonzeptVersionAnlegenView } from '../../hooks/messkonzept';
import { Button } from '../../../../shared/ui/button';
import { Input } from '../../../../shared/ui/input';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { Textarea } from '../../../../shared/ui/textarea';
import { t } from '../../../../shared/i18n/t';

export interface MesskonzeptVersionAnlegenFormularProps {
  readonly endkundeId: string;
}

interface ScalarValues {
  typ: string;
  systemgrenze: string;
  systembeschreibung: string;
  bereinigungsverfahren: string;
  messgeraeteWahl: string;
  geraeteerkennungsVerfahren: string;
  aenderungsgrund: string;
}

const SCALAR_DEFAULTS: ScalarValues = {
  typ: '',
  systemgrenze: '',
  systembeschreibung: '',
  bereinigungsverfahren: '',
  messgeraeteWahl: '',
  geraeteerkennungsVerfahren: '',
  aenderungsgrund: '',
};

interface EnergietraegerZeileState extends MesskonzeptEnergietraegerZeileValues {
  /** Client-seitiger, stabiler React-Key — NICHT Teil des Request-Payloads (siehe `zumFormWerten`). */
  readonly key: string;
}

type RowErrors = Readonly<Record<string, string>>;

type FocusableFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Render-Reihenfolge der Skalarfelder — bestimmt, welches Feld nach einem fehlgeschlagenen Submit zuerst fokussiert wird. */
const SCALAR_FELD_REIHENFOLGE: readonly (keyof ScalarValues)[] = [
  'typ',
  'systemgrenze',
  'systembeschreibung',
  'bereinigungsverfahren',
  'messgeraeteWahl',
  'geraeteerkennungsVerfahren',
  'aenderungsgrund',
];

/** Render-Reihenfolge der Felder INNERHALB einer Energieträger-Zeile (analog `SCALAR_FELD_REIHENFOLGE`). */
const ZEILE_FELD_REIHENFOLGE: readonly (keyof MesskonzeptEnergietraegerZeileValues)[] = [
  'energietraeger',
  'baselineWert',
  'baselineEinheit',
  'baselineMethode',
  'baselineBegruendung',
  'baselineAbrechnungenAnzahl',
  'baselineBelegAktenzeichen',
  'baselineBelegAblageort',
  'energietraegerSubstitution',
];

function neueZeile(): EnergietraegerZeileState {
  return { ...messkonzeptEnergietraegerZeileDefaultValues, key: crypto.randomUUID() };
}

function zumFormWerten(scalarValues: ScalarValues, zeilen: readonly EnergietraegerZeileState[]): MesskonzeptVersionAnlegenFormValues {
  return {
    ...scalarValues,
    // Explizite Feldliste statt Rest-Destrukturierung — `key` ist NUR der
    // React-Listen-Key, kein Payload-Feld (kein toter Rest-Parameter).
    energietraeger: zeilen.map((zeile) => ({
      energietraeger: zeile.energietraeger,
      baselineWert: zeile.baselineWert,
      baselineEinheit: zeile.baselineEinheit,
      baselineMethode: zeile.baselineMethode,
      baselineBegruendung: zeile.baselineBegruendung,
      baselineAbrechnungenAnzahl: zeile.baselineAbrechnungenAnzahl,
      baselineBelegAktenzeichen: zeile.baselineBelegAktenzeichen,
      baselineBelegAblageort: zeile.baselineBelegAblageort,
      energietraegerSubstitution: zeile.energietraegerSubstitution,
    })),
  };
}

/**
 * Messkonzept-Version-Anlegen-Formular (`ADR-0008 §23 / D11 Phase 4c Pass
 * 2`, append-only — Linie 3). DEDIZIERTES Formular statt `EntityForm`: der
 * Server verlangt ein wiederholbares `energietraeger`-Array
 * (`ArrayMinSize(1)`/`ArrayMaxSize(20)`, `MesskonzeptVersionAnlegenDto`) —
 * `EntityForm`s generischer Feldrenderer kennt nur skalare Felder
 * (`text|textarea|checkbox|select|date`). Übernimmt trotzdem `EntityForm`s
 * A11y-/UX-Konventionen 1:1: Validierung NUR bei Submit (`schema.safeParse`,
 * keine Live-Validierung pro Tastenanschlag), `aria-invalid` +
 * `aria-describedby` je Feld, `role="alert"` je Fehlermeldung, `<fieldset>`/
 * `<legend>` je wiederholter Energieträger-Zeile (semantische Gruppierung
 * wiederholter Formularabschnitte, WCAG 1.3.1) — A11y-Struktur UNVERÄNDERT
 * gegenüber der Vorversion, NUR die Optik ist restylt (Phase 4c-Feinschliff,
 * Design-System): `shared/ui/*`-Primitives statt roher Elemente, jede
 * Energieträger-Zeile als Card-artiger Rahmen.
 *
 * A11y-Härtung (WCAG 2.2 AA 2.4.3/3.3.1): beim Entfernen einer
 * Energieträger-Zeile wandert der Fokus gezielt auf einen Nachfolger (den
 * „Entfernen"-Button der VORHERIGEN Zeile, sonst — wenn die erste Zeile
 * entfernt wurde — auf den „Hinzufügen"-Button), statt ins Leere zu fallen
 * (der entfernte Button existiert nicht mehr). Bei fehlgeschlagenem Submit
 * wandert der Fokus auf das erste fehlerhafte Feld in Render-Reihenfolge
 * (Skalarfelder zuerst, danach je Zeile in `ZEILE_FELD_REIHENFOLGE`) — bei
 * einem rein listenweiten Fehler (kein einzelnes Feld betroffen, z. B. „zu
 * viele Energieträger-Zeilen") auf den „Hinzufügen"-Button als sinnvollsten
 * Rückfallpunkt.
 */
export function MesskonzeptVersionAnlegenFormular({ endkundeId }: MesskonzeptVersionAnlegenFormularProps): ReactNode {
  const view = useMesskonzeptVersionAnlegenView(endkundeId);
  const formId = useId();

  const [scalarValues, setScalarValues] = useState<ScalarValues>(SCALAR_DEFAULTS);
  const [zeilen, setZeilen] = useState<readonly EnergietraegerZeileState[]>([neueZeile()]);

  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [zeilenFehler, setZeilenFehler] = useState<readonly RowErrors[]>([]);
  const [energietraegerListeFehler, setEnergietraegerListeFehler] = useState<string | undefined>(undefined);

  const scalarFieldRefs = useRef<Map<keyof ScalarValues, FocusableFieldElement>>(new Map());
  const zeilenFieldRefs = useRef<Map<string, FocusableFieldElement>>(new Map());
  const entfernenButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hinzufuegenButtonRef = useRef<HTMLButtonElement>(null);
  /** Nach `zeileEntfernen` gesetzt, von einem `useEffect` (unten) nach dem Re-Render konsumiert. */
  const naechsterFokusNachEntfernenRef = useRef<{ art: 'zeile'; key: string } | { art: 'hinzufuegen' } | undefined>(
    undefined,
  );

  function registriereScalarRef(feld: keyof ScalarValues) {
    return (element: FocusableFieldElement | null): void => {
      if (element) {
        scalarFieldRefs.current.set(feld, element);
      } else {
        scalarFieldRefs.current.delete(feld);
      }
    };
  }

  function registriereZeilenRef(zeileKey: string, feld: keyof MesskonzeptEnergietraegerZeileValues) {
    return (element: FocusableFieldElement | null): void => {
      const compositeKey = `${zeileKey}:${feld}`;
      if (element) {
        zeilenFieldRefs.current.set(compositeKey, element);
      } else {
        zeilenFieldRefs.current.delete(compositeKey);
      }
    };
  }

  function registriereEntfernenButtonRef(zeileKey: string) {
    return (element: HTMLButtonElement | null): void => {
      if (element) {
        entfernenButtonRefs.current.set(zeileKey, element);
      } else {
        entfernenButtonRefs.current.delete(zeileKey);
      }
    };
  }

  // Fokus-Ziel nach `zeileEntfernen` erst NACH dem DOM-Update anwenden (der
  // entfernte Button existiert im selben Tick noch) — reagiert auf
  // Änderungen von `zeilen`, konsumiert das zuvor gemerkte Ziel EINMALIG.
  useEffect(() => {
    const ziel = naechsterFokusNachEntfernenRef.current;
    if (ziel === undefined) {
      return;
    }
    naechsterFokusNachEntfernenRef.current = undefined;

    if (ziel.art === 'hinzufuegen') {
      hinzufuegenButtonRef.current?.focus();
    } else {
      entfernenButtonRefs.current.get(ziel.key)?.focus();
    }
  }, [zeilen]);

  function handleScalarChange(feld: keyof ScalarValues, wert: string): void {
    setScalarValues((vorherige) => ({ ...vorherige, [feld]: wert }));
  }

  function aktualisiereZeile<K extends keyof MesskonzeptEnergietraegerZeileValues>(
    key: string,
    feld: K,
    wert: MesskonzeptEnergietraegerZeileValues[K],
  ): void {
    setZeilen((vorherige) => vorherige.map((zeile) => (zeile.key === key ? { ...zeile, [feld]: wert } : zeile)));
  }

  function zeileHinzufuegen(): void {
    setZeilen((vorherige) => [...vorherige, neueZeile()]);
  }

  function zeileEntfernen(key: string): void {
    setZeilen((vorherige) => {
      if (vorherige.length <= 1) {
        return vorherige;
      }
      const naechste = vorherige.filter((zeile) => zeile.key !== key);

      if (naechste.length <= 1) {
        // Die einzige verbleibende Zeile hat einen deaktivierten
        // „Entfernen"-Button (`ArrayMinSize(1)`, s. `disabled={zeilen.length
        // <= 1}` unten) — dorthin lässt sich kein Fokus setzen. Rückfall auf
        // den „Hinzufügen"-Button.
        naechsterFokusNachEntfernenRef.current = { art: 'hinzufuegen' };
        return naechste;
      }

      const index = vorherige.findIndex((zeile) => zeile.key === key);
      const vorgaengerZeile = index > 0 ? vorherige[index - 1] : undefined;
      naechsterFokusNachEntfernenRef.current =
        vorgaengerZeile !== undefined ? { art: 'zeile', key: vorgaengerZeile.key } : { art: 'hinzufuegen' };
      return naechste;
    });
  }

  /**
   * Fokus auf das erste fehlerhafte Feld nach fehlgeschlagenem Submit (WCAG
   * 2.2 AA 2.4.3/3.3.1) — Skalarfelder zuerst (`SCALAR_FELD_REIHENFOLGE`),
   * danach je Energieträger-Zeile in Render-Reihenfolge
   * (`ZEILE_FELD_REIHENFOLGE`). Bleibt nur ein listenweiter Fehler übrig
   * (kein einzelnes Feld betroffen), ist der „Hinzufügen"-Button der
   * sinnvollste Rückfallpunkt.
   */
  function fokussiereErstesFehlerhaftesFeld(
    naechsteFeldFehler: Readonly<Record<string, string>>,
    naechsteZeilenFehler: readonly RowErrors[],
  ): void {
    for (const feld of SCALAR_FELD_REIHENFOLGE) {
      if (feld in naechsteFeldFehler) {
        scalarFieldRefs.current.get(feld)?.focus();
        return;
      }
    }

    for (let index = 0; index < zeilen.length; index += 1) {
      const zeile = zeilen[index];
      const fehlerFuerZeile = naechsteZeilenFehler[index];
      if (zeile === undefined || fehlerFuerZeile === undefined) {
        continue;
      }
      for (const feld of ZEILE_FELD_REIHENFOLGE) {
        if (feld in fehlerFuerZeile) {
          zeilenFieldRefs.current.get(`${zeile.key}:${feld}`)?.focus();
          return;
        }
      }
    }

    hinzufuegenButtonRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const result = messkonzeptVersionAnlegenFormSchema.safeParse(zumFormWerten(scalarValues, zeilen));

    if (!result.success) {
      const naechsteFeldFehler: Record<string, string> = {};
      const naechsteZeilenFehler: Record<string, string>[] = zeilen.map(() => ({}));
      let naechsterListeFehler: string | undefined;

      for (const issue of result.error.issues) {
        const [erstesSegment, zweitesSegment, drittesSegment] = issue.path;

        if (erstesSegment === 'energietraeger' && typeof zweitesSegment === 'number' && typeof drittesSegment === 'string') {
          const zeileFehlerEintrag = naechsteZeilenFehler[zweitesSegment];
          if (zeileFehlerEintrag !== undefined && !(drittesSegment in zeileFehlerEintrag)) {
            zeileFehlerEintrag[drittesSegment] = issue.message;
          }
          continue;
        }

        if (erstesSegment === 'energietraeger') {
          naechsterListeFehler ??= issue.message;
          continue;
        }

        if (typeof erstesSegment === 'string' && !(erstesSegment in naechsteFeldFehler)) {
          naechsteFeldFehler[erstesSegment] = issue.message;
        }
      }

      setFieldErrors(naechsteFeldFehler);
      setZeilenFehler(naechsteZeilenFehler);
      setEnergietraegerListeFehler(naechsterListeFehler);
      fokussiereErstesFehlerhaftesFeld(naechsteFeldFehler, naechsteZeilenFehler);
      return;
    }

    setFieldErrors({});
    setZeilenFehler([]);
    setEnergietraegerListeFehler(undefined);
    view.submit(result.data);
  }

  const typId = `${formId}-typ`;
  const typErrorId = `${typId}-error`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {view.submitErrorMessage !== undefined && (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
          {view.submitErrorMessage}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor={typId}>{t('stammdaten.messkonzept.form.typ')}</Label>
        <Select
          id={typId}
          ref={registriereScalarRef('typ')}
          value={scalarValues.typ}
          {...(fieldErrors['typ'] !== undefined ? { 'aria-invalid': true, 'aria-describedby': typErrorId } : {})}
          onChange={(event) => handleScalarChange('typ', event.target.value)}
        >
          <option value="">{t('stammdaten.messkonzept.form.typPlatzhalter')}</option>
          {view.typOptionen.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {/*
          Der Typ war bis V0076 eine reine Beschriftung. Jetzt entscheidet er,
          WIE gerechnet wird — und „Standard" ohne erfasste Baseline-Perioden
          laesst den Berechnungslauf fail-closed abbrechen. Das gehoert vor die
          Auswahl, nicht in die Fehlermeldung danach.
        */}
        <p className="text-xs text-muted-foreground">{t('stammdaten.messkonzept.form.typHinweis')}</p>
        {fieldErrors['typ'] !== undefined && (
          <p id={typErrorId} role="alert" className="text-xs font-medium text-destructive-text">
            {fieldErrors['typ']}
          </p>
        )}
      </div>

      {(
        [
          ['systemgrenze', t('stammdaten.messkonzept.form.systemgrenze')],
          ['systembeschreibung', t('stammdaten.messkonzept.form.systembeschreibung')],
          ['bereinigungsverfahren', t('stammdaten.messkonzept.form.bereinigungsverfahren')],
          ['messgeraeteWahl', t('stammdaten.messkonzept.form.messgeraeteWahl')],
          ['geraeteerkennungsVerfahren', t('stammdaten.messkonzept.form.geraeteerkennungsVerfahren')],
        ] as const
      ).map(([feld, label]) => {
        const fieldId = `${formId}-${feld}`;
        const errorId = `${fieldId}-error`;
        const hasError = fieldErrors[feld] !== undefined;

        return (
          <div key={feld} className="space-y-2">
            <Label htmlFor={fieldId}>{label}</Label>
            <Textarea
              id={fieldId}
              ref={registriereScalarRef(feld)}
              value={scalarValues[feld]}
              {...(hasError ? { 'aria-invalid': true, 'aria-describedby': errorId } : {})}
              onChange={(event) => handleScalarChange(feld, event.target.value)}
            />
            {hasError && (
              <p id={errorId} role="alert" className="text-xs font-medium text-destructive-text">
                {fieldErrors[feld]}
              </p>
            )}
          </div>
        );
      })}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-aenderungsgrund`}>{t('stammdaten.messkonzept.form.aenderungsgrund')}</Label>
        <Textarea
          id={`${formId}-aenderungsgrund`}
          ref={registriereScalarRef('aenderungsgrund')}
          value={scalarValues.aenderungsgrund}
          {...(fieldErrors['aenderungsgrund'] !== undefined
            ? { 'aria-invalid': true, 'aria-describedby': `${formId}-aenderungsgrund-error` }
            : {})}
          onChange={(event) => handleScalarChange('aenderungsgrund', event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('stammdaten.messkonzept.form.aenderungsgrundHinweis')}</p>
        {fieldErrors['aenderungsgrund'] !== undefined && (
          <p id={`${formId}-aenderungsgrund-error`} role="alert" className="text-xs font-medium text-destructive-text">
            {fieldErrors['aenderungsgrund']}
          </p>
        )}
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">
          {t('stammdaten.messkonzept.form.energietraegerSectionTitle')}
        </legend>
        <p className="text-xs text-muted-foreground">{t('stammdaten.messkonzept.form.energietraegerHinweis')}</p>
        {energietraegerListeFehler !== undefined && (
          <p role="alert" className="text-xs font-medium text-destructive-text">
            {energietraegerListeFehler}
          </p>
        )}

        {zeilen.map((zeile, index) => {
          const zeileFehler = zeilenFehler[index] ?? {};
          const zeilePrefix = `${formId}-energietraeger-${zeile.key}`;

          return (
            <fieldset
              key={zeile.key}
              className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <legend className="px-1 text-sm font-semibold text-foreground">
                {`${t('stammdaten.messkonzept.form.energietraegerZeileLegend')} ${String(index + 1)}`}
              </legend>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-energietraeger`}>{t('stammdaten.messkonzept.form.energietraeger')}</Label>
                <Select
                  id={`${zeilePrefix}-energietraeger`}
                  ref={registriereZeilenRef(zeile.key, 'energietraeger')}
                  value={zeile.energietraeger}
                  {...(zeileFehler['energietraeger'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-energietraeger-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'energietraeger', event.target.value)}
                >
                  <option value="">{t('stammdaten.messkonzept.form.energietraegerPlatzhalter')}</option>
                  {view.energietraegerOptionen.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                {zeileFehler['energietraeger'] !== undefined && (
                  <p id={`${zeilePrefix}-energietraeger-error`} role="alert" className="text-xs font-medium text-destructive-text">
                    {zeileFehler['energietraeger']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineWert`}>{t('stammdaten.messkonzept.form.baselineWert')}</Label>
                <Input
                  id={`${zeilePrefix}-baselineWert`}
                  ref={registriereZeilenRef(zeile.key, 'baselineWert')}
                  type="number"
                  value={zeile.baselineWert}
                  {...(zeileFehler['baselineWert'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineWert-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineWert', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('stammdaten.messkonzept.form.baselineWertHinweis')}</p>
                {zeileFehler['baselineWert'] !== undefined && (
                  <p id={`${zeilePrefix}-baselineWert-error`} role="alert" className="text-xs font-medium text-destructive-text">
                    {zeileFehler['baselineWert']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineEinheit`}>{t('stammdaten.messkonzept.form.baselineEinheit')}</Label>
                <Input
                  id={`${zeilePrefix}-baselineEinheit`}
                  ref={registriereZeilenRef(zeile.key, 'baselineEinheit')}
                  type="text"
                  value={zeile.baselineEinheit}
                  {...(zeileFehler['baselineEinheit'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineEinheit-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineEinheit', event.target.value)}
                />
                {zeileFehler['baselineEinheit'] !== undefined && (
                  <p id={`${zeilePrefix}-baselineEinheit-error`} role="alert" className="text-xs font-medium text-destructive-text">
                    {zeileFehler['baselineEinheit']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineMethode`}>{t('stammdaten.messkonzept.form.baselineMethode')}</Label>
                <Input
                  id={`${zeilePrefix}-baselineMethode`}
                  ref={registriereZeilenRef(zeile.key, 'baselineMethode')}
                  type="text"
                  value={zeile.baselineMethode}
                  {...(zeileFehler['baselineMethode'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineMethode-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineMethode', event.target.value)}
                />
                {zeileFehler['baselineMethode'] !== undefined && (
                  <p id={`${zeilePrefix}-baselineMethode-error`} role="alert" className="text-xs font-medium text-destructive-text">
                    {zeileFehler['baselineMethode']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineBegruendung`}>
                  {t('stammdaten.messkonzept.form.baselineBegruendung')}
                </Label>
                <Textarea
                  id={`${zeilePrefix}-baselineBegruendung`}
                  ref={registriereZeilenRef(zeile.key, 'baselineBegruendung')}
                  value={zeile.baselineBegruendung}
                  {...(zeileFehler['baselineBegruendung'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineBegruendung-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineBegruendung', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('stammdaten.messkonzept.form.baselineBegruendungHinweis')}</p>
                {zeileFehler['baselineBegruendung'] !== undefined && (
                  <p
                    id={`${zeilePrefix}-baselineBegruendung-error`}
                    role="alert"
                    className="text-xs font-medium text-destructive-text"
                  >
                    {zeileFehler['baselineBegruendung']}
                  </p>
                )}
              </div>

              {/*
                TB-02 ([Q3] Kap. 2.1.2): Die Baseline soll auf mindestens drei
                Jahresabrechnungen beruhen, sonst braucht sie eine Begruendung.
                Die ANZAHL steht deshalb unmittelbar unter der Begruendung —
                sie ist der Wert, der sie faellig macht.

                Frueher stand hier ein UUID-Feld `baselineBelegRef`. Es
                verwies auf eine Beleg-Ablage, die es nicht gibt; wer etwas
                eintrug, glaubte einen Beleg zu hinterlegen. Ersetzt durch den
                externen Verweis (ADR-0006 O4) — die Abrechnungen bleiben, wo
                sie ohnehin liegen, und das System weiss, wo das ist.
              */}
              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineAbrechnungenAnzahl`}>
                  {t('stammdaten.messkonzept.form.baselineAbrechnungenAnzahl')}
                </Label>
                <Input
                  id={`${zeilePrefix}-baselineAbrechnungenAnzahl`}
                  ref={registriereZeilenRef(zeile.key, 'baselineAbrechnungenAnzahl')}
                  type="text"
                  inputMode="numeric"
                  value={zeile.baselineAbrechnungenAnzahl}
                  {...(zeileFehler['baselineAbrechnungenAnzahl'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineAbrechnungenAnzahl-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineAbrechnungenAnzahl', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('stammdaten.messkonzept.form.baselineAbrechnungenAnzahlHinweis')}
                </p>
                {zeileFehler['baselineAbrechnungenAnzahl'] !== undefined && (
                  <p
                    id={`${zeilePrefix}-baselineAbrechnungenAnzahl-error`}
                    role="alert"
                    className="text-xs font-medium text-destructive-text"
                  >
                    {zeileFehler['baselineAbrechnungenAnzahl']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineBelegAktenzeichen`}>
                  {t('stammdaten.messkonzept.form.baselineBelegAktenzeichen')}
                </Label>
                <Input
                  id={`${zeilePrefix}-baselineBelegAktenzeichen`}
                  ref={registriereZeilenRef(zeile.key, 'baselineBelegAktenzeichen')}
                  type="text"
                  value={zeile.baselineBelegAktenzeichen}
                  {...(zeileFehler['baselineBelegAktenzeichen'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineBelegAktenzeichen-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineBelegAktenzeichen', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('stammdaten.messkonzept.form.baselineBelegAktenzeichenHinweis')}
                </p>
                {zeileFehler['baselineBelegAktenzeichen'] !== undefined && (
                  <p
                    id={`${zeilePrefix}-baselineBelegAktenzeichen-error`}
                    role="alert"
                    className="text-xs font-medium text-destructive-text"
                  >
                    {zeileFehler['baselineBelegAktenzeichen']}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zeilePrefix}-baselineBelegAblageort`}>
                  {t('stammdaten.messkonzept.form.baselineBelegAblageort')}
                </Label>
                <Input
                  id={`${zeilePrefix}-baselineBelegAblageort`}
                  ref={registriereZeilenRef(zeile.key, 'baselineBelegAblageort')}
                  type="text"
                  value={zeile.baselineBelegAblageort}
                  {...(zeileFehler['baselineBelegAblageort'] !== undefined
                    ? { 'aria-invalid': true, 'aria-describedby': `${zeilePrefix}-baselineBelegAblageort-error` }
                    : {})}
                  onChange={(event) => aktualisiereZeile(zeile.key, 'baselineBelegAblageort', event.target.value)}
                />
                {zeileFehler['baselineBelegAblageort'] !== undefined && (
                  <p
                    id={`${zeilePrefix}-baselineBelegAblageort-error`}
                    role="alert"
                    className="text-xs font-medium text-destructive-text"
                  >
                    {zeileFehler['baselineBelegAblageort']}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    id={`${zeilePrefix}-energietraegerSubstitution`}
                    ref={registriereZeilenRef(zeile.key, 'energietraegerSubstitution')}
                    type="checkbox"
                    className="h-4 w-4 rounded border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    checked={zeile.energietraegerSubstitution}
                    onChange={(event) => aktualisiereZeile(zeile.key, 'energietraegerSubstitution', event.target.checked)}
                  />
                  <Label htmlFor={`${zeilePrefix}-energietraegerSubstitution`} className="font-normal">
                    {t('stammdaten.messkonzept.form.energietraegerSubstitution')}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('stammdaten.messkonzept.form.energietraegerSubstitutionHinweis')}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                ref={registriereEntfernenButtonRef(zeile.key)}
                onClick={() => zeileEntfernen(zeile.key)}
                disabled={zeilen.length <= 1}
              >
                {`${t('stammdaten.messkonzept.form.energietraegerEntfernenAction')} (${String(index + 1)})`}
              </Button>
            </fieldset>
          );
        })}

        <Button type="button" variant="outline" ref={hinzufuegenButtonRef} onClick={zeileHinzufuegen}>
          {t('stammdaten.messkonzept.form.energietraegerHinzufuegenAction')}
        </Button>
      </fieldset>

      <Button type="submit" disabled={view.isSubmitting}>
        {t('stammdaten.messkonzept.createPage.submitAction')}
      </Button>
    </form>
  );
}
