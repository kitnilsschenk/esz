import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ZodType } from 'zod';
import { Button } from '../../../../shared/ui/button';
import { Input } from '../../../../shared/ui/input';
import { Label } from '../../../../shared/ui/label';
import { Select } from '../../../../shared/ui/select';
import { Textarea } from '../../../../shared/ui/textarea';
import { StatusRegion } from '../../../../shared/ui/status-region';
import { t } from '../../../../shared/i18n/t';

// `select`/`date` (ADR-0008 §23 / D11, Pass 1 System/Zähler/Messkanal/
// Nutzungsverhältnis): `select` deckt sowohl feste Enums (Energieträger,
// Messgrößen-Art, Datenklasse, Nutzungsrolle) als auch Fremdschlüssel-Auswahl
// (endkundeId/systemId/anschlussnutzerId) ab — die Optionsliste liefert der
// Aufrufer über `options` (statisch ODER aus einer Liste-Query abgeleitet,
// siehe `hooks/system/useSystemAnlegenView.ts`). `date` rendert ein natives
// `<input type="date">` (Wert bereits als ISO-Datumsstring, kompatibel mit
// `class-validator`s `@IsDateString()`, `.claude/rules/backend-nestjs.md`).
// Beide speichern ihren Wert weiterhin als `string` im lokalen Formular-State
// (wie `text`) — die Feldwert-Domäne bleibt dadurch `string | boolean`, keine
// Erweiterung des generischen `TValues`-Constraints nötig.
//
// `number` (nachgereicht — `.claude/skills/edms-frontend/SKILL.md` führte den
// Typ bereits, `EntityForm` hatte ihn nie): rendert ein
// `<input type="number">` (numerische Tastatur mobil, Schrittpfeile), hält den
// Wert aber BEWUSST weiterhin als `string` — keine `Number()`-Wandlung. Grund
// ist derselbe wie bei `einflussgroesse.wertNum` (ADR-0008 A8/B10, s.
// `einflussgroesseFormat.ts`): Ein durch `Number()` geschickter Dezimalwert
// verliert Präzision und Nachkommastellen-Darstellung ("1.50" -> "1.5"), was
// bei Baseline-/Verbrauchswerten nicht hinnehmbar ist. Die Zod-Schemata prüfen
// numerische Felder deshalb als `z.string()` mit `.regex(...)`, nicht als
// `z.number()` — `FormFieldValue` bleibt unverändert `string | boolean`.
//
// `datetime` (nachgereicht für den Nachweis-Kontext): rendert ein
// `<input type="datetime-local">` für Zeitpunkte, die eine PERSON angibt
// statt der Server (erklärter Übermittlungszeitpunkt einer BAFA-Einreichung,
// ADR-0007 D7). `date` allein reicht dort nicht — ein auf Mitternacht
// gerundeter Zeitpunkt in einem append-only Beurkundungs-Datensatz wäre
// schlicht falsch. Der Feldwert ist Berliner Wanduhr-Zeit ohne Zeitzone
// ("2026-08-26T16:32"); die Umrechnung nach UTC macht der Payload-Mapper der
// jeweiligen Entität über `shared/format/datum.ts` — dieselbe Arbeitsteilung
// wie bei `number` (Wandlung im Mapper, nicht im Feld).
export type EntityFormFieldKind =
  | 'text'
  | 'password'
  | 'textarea'
  | 'checkbox'
  | 'select'
  | 'date'
  | 'number'
  | 'datetime';

export interface EntityFormSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface EntityFormFieldConfig {
  readonly name: string;
  readonly label: string;
  readonly kind: EntityFormFieldKind;
  readonly autoComplete?: string;
  readonly hint?: string;
  /** Pflicht bei `kind: 'select'` — erste (Platzhalter-)Option ergänzt `EntityForm` selbst. */
  readonly options?: readonly EntityFormSelectOption[];
  /** Nur bei `kind: 'select'`: sichtbarer Platzhalter der leeren Auswahl (Default aus Aufrufer-`t()`). */
  readonly placeholder?: string;
  /** Nur bei `kind: 'number'`: an das `<input>` durchgereichte Eingabehilfen — verbindlich prüft weiterhin das Zod-Schema. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | 'any';
  /**
   * Pflichtfeld-Kennzeichnung (WCAG 2.2 AA 3.3.2 „Labels or Instructions").
   * Default `true` — die meisten Stammdaten-Felder sind serverseitig Pflicht
   * (siehe die jeweiligen `*FormSchema.ts`: `.min(1, …)`). Aufrufer mit einem
   * tatsächlich optionalen Feld (kein `.min(1)` im Zod-Schema, z. B.
   * `kontakt`/`systembeschreibung`/`obisKennzahl`) setzen explizit
   * `required: false`. Bei `kind: 'checkbox'` wird NIE ein Pflichtfeld-Hinweis
   * angezeigt — eine Checkbox hat immer einen definierten Wert (an/aus), das
   * Konzept „Pflichtfeld" passt dort nicht.
   */
  readonly required?: boolean;
}

type FormFieldValue = string | boolean;
type FormValuesRecord = Record<string, FormFieldValue>;
type FocusableFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface EntityFormProps<TValues extends FormValuesRecord> {
  /** Validiert bei Submit (`schema.safeParse`) — kein Live-Validieren pro Tastenanschlag. */
  readonly schema: ZodType<TValues>;
  readonly fields: readonly EntityFormFieldConfig[];
  readonly defaultValues: TValues;
  readonly submitLabel: string;
  readonly isSubmitting: boolean;
  /** Server-/Submit-Fehler (z. B. `ApiProblemError.detail`), NICHT feldbezogen. */
  readonly submitErrorMessage?: string;
  /**
   * Bestätigung nach erfolgreichem Submit (`MutationViewBasis.erfolgsMeldung`).
   * Formulare, die nach Erfolg WEGNAVIGIEREN, lassen das weg — dort ist die
   * neue Seite die Rückmeldung. Formulare, die stehen bleiben (Ändern-
   * Abschnitte in Detail-Ansichten), MÜSSEN sie setzen: sonst passiert für
   * den Nutzer nach dem Absenden sichtbar nichts.
   */
  readonly submitSuccessMessage?: string;
  readonly onValidSubmit: (values: TValues) => void;
}

/**
 * Generisches, Zod-validiertes Formular (`.claude/rules/frontend-react.md`:
 * Form-Validierung mit Zod, semantisches HTML, Tastatur-Flow, sichtbarer
 * Fokus-Ring). Bewusst OHNE Formular-Bibliothek (react-hook-form u. ä. sind
 * nicht Teil des freigegebenen Dependency-Plans) — lokaler `useState` reicht
 * für die aktuelle Feldanzahl. Rendert die Felder über die
 * `shared/ui/*`-Primitives (Input/Label/Textarea/Select/Button,
 * Phase 4c-Feinschliff, Design-System) statt roher Elemente —
 * `aria-invalid` (bei Feldfehlern gesetzt) schaltet automatisch auf die
 * destructive-Optik der jeweiligen Primitive um.
 *
 * Jede neue Stammdaten-Entität liefert nur `schema` + `fields` +
 * `defaultValues` — die ÖFFENTLICHE API dieser Datei (Props/Verhalten)
 * bleibt dabei UNVERÄNDERT (geteiltes Fundament, ADR-0008 §23 / D11).
 *
 * A11y-Härtung (WCAG 2.2 AA 2.4.3/3.3.1/3.3.2): bei fehlgeschlagenem Submit
 * wandert der Fokus automatisch auf das ERSTE fehlerhafte Feld (in
 * Render-Reihenfolge von `fields`, nicht in Zod-Issue-Reihenfolge) — dafür
 * hält `fieldElementRefs` je Feldname einen Ref auf das native
 * Input/Textarea/Select-Element. Pflichtfelder (Default `true`, s.
 * `EntityFormFieldConfig.required`) bekommen sichtbar ein `*` (separates,
 * `aria-hidden`-Element NEBEN dem `<Label>` — NICHT innerhalb, damit sich
 * der über `htmlFor` berechnete Accessible Name des Felds NICHT ändert) plus
 * `aria-required` und eine sr-only „Pflichtfeld"-Beschreibung
 * (`aria-describedby`, zusammen mit der Fehlermeldungs-ID verkettet).
 */
export function EntityForm<TValues extends FormValuesRecord>(props: EntityFormProps<TValues>): ReactNode {
  const { schema, fields, defaultValues, submitLabel, isSubmitting, submitErrorMessage, submitSuccessMessage, onValidSubmit } =
    props;
  const formId = useId();
  const [values, setValues] = useState<FormValuesRecord>(defaultValues);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const fieldElementRefs = useRef<Map<string, FocusableFieldElement>>(new Map());

  function registerFieldRef(name: string) {
    return (element: FocusableFieldElement | null): void => {
      if (element) {
        fieldElementRefs.current.set(name, element);
      } else {
        fieldElementRefs.current.delete(name);
      }
    };
  }

  function handleChange(name: string, value: FormFieldValue): void {
    setValues((previous) => ({ ...previous, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // `safeParse` nimmt bewusst `unknown` entgegen — ob `values` (lokal nur
    // als `FormValuesRecord` geführt) tatsächlich `TValues` entspricht,
    // entscheidet Zod hier zur Laufzeit (kein zusätzlicher Cast nötig).
    const result = schema.safeParse(values);

    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !(key in nextErrors)) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);

      // Fokus auf das erste fehlerhafte Feld in VISUELLER Reihenfolge
      // (`fields`, nicht `Object.keys(nextErrors)` — deren Reihenfolge hängt
      // von der Zod-Issue-Reihenfolge ab).
      const erstesFehlerhaftesFeld = fields.find((field) => field.name in nextErrors);
      if (erstesFehlerhaftesFeld !== undefined) {
        fieldElementRefs.current.get(erstesFehlerhaftesFeld.name)?.focus();
      }
      return;
    }

    setFieldErrors({});
    onValidSubmit(result.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <StatusRegion ton="fehler" nachricht={submitErrorMessage} />
      <StatusRegion ton="erfolg" nachricht={submitSuccessMessage} />
      {fields.map((field) => {
        const fieldId = `${formId}-${field.name}`;
        const errorId = `${fieldId}-error`;
        const requiredHintId = `${fieldId}-required-hint`;
        const error = fieldErrors[field.name];
        const hasError = error !== undefined;
        const rawValue = values[field.name];
        const textValue = typeof rawValue === 'string' ? rawValue : '';
        // Checkboxen bekommen NIE einen Pflichtfeld-Hinweis — sie haben immer
        // einen definierten Wert (an/aus), „Pflichtfeld" passt dort nicht.
        const istPflichtfeld = field.kind !== 'checkbox' && field.required !== false;
        const describedByIds = [hasError ? errorId : undefined, istPflichtfeld ? requiredHintId : undefined]
          .filter((id): id is string => id !== undefined)
          .join(' ');
        const invalidProps = hasError ? { 'aria-invalid': true as const } : {};
        const requiredProps = istPflichtfeld ? { 'aria-required': true as const } : {};
        const describedByProps = describedByIds.length > 0 ? { 'aria-describedby': describedByIds } : {};

        if (field.kind === 'checkbox') {
          return (
            <div key={field.name} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id={fieldId}
                  type="checkbox"
                  ref={registerFieldRef(field.name)}
                  className="h-4 w-4 rounded border-input text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  checked={typeof rawValue === 'boolean' ? rawValue : false}
                  {...invalidProps}
                  {...describedByProps}
                  onChange={(event) => handleChange(field.name, event.target.checked)}
                />
                <Label htmlFor={fieldId} className="font-normal">
                  {field.label}
                </Label>
              </div>
              {field.hint !== undefined && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              {hasError && (
                <p id={errorId} role="alert" className="text-xs font-medium text-destructive-text">
                  {error}
                </p>
              )}
            </div>
          );
        }

        return (
          <div key={field.name} className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor={fieldId}>{field.label}</Label>
              {istPflichtfeld && (
                <span aria-hidden="true" className="text-destructive-text">
                  *
                </span>
              )}
            </div>
            {istPflichtfeld && (
              <span id={requiredHintId} className="sr-only">
                {t('stammdaten.common.form.pflichtfeld')}
              </span>
            )}
            {field.kind === 'textarea' && (
              <Textarea
                id={fieldId}
                ref={registerFieldRef(field.name)}
                {...(field.autoComplete !== undefined ? { autoComplete: field.autoComplete } : {})}
                value={textValue}
                {...invalidProps}
                {...requiredProps}
                {...describedByProps}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            )}
            {/*
              `password` unterscheidet sich von `text` NUR in der Maskierung —
              die Verarbeitung ist dieselbe. Es gibt ihn, weil ein
              Broker-Passwort sonst offen auf dem Bildschirm stuende, waehrend
              jemand daneben steht. Der Aufrufer setzt dazu
              `autoComplete: 'new-password'`, damit der Browser es nicht als
              Anmeldedaten der Anwendung merkt.
            */}
            {(field.kind === 'text' || field.kind === 'password') && (
              <Input
                id={fieldId}
                type={field.kind === 'password' ? 'password' : 'text'}
                ref={registerFieldRef(field.name)}
                {...(field.autoComplete !== undefined ? { autoComplete: field.autoComplete } : {})}
                value={textValue}
                {...invalidProps}
                {...requiredProps}
                {...describedByProps}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            )}
            {field.kind === 'date' && (
              <Input
                id={fieldId}
                type="date"
                ref={registerFieldRef(field.name)}
                value={textValue}
                {...invalidProps}
                {...requiredProps}
                {...describedByProps}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            )}
            {field.kind === 'datetime' && (
              <Input
                id={fieldId}
                type="datetime-local"
                ref={registerFieldRef(field.name)}
                value={textValue}
                {...invalidProps}
                {...requiredProps}
                {...describedByProps}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            )}
            {field.kind === 'number' && (
              <Input
                id={fieldId}
                type="number"
                inputMode="decimal"
                ref={registerFieldRef(field.name)}
                {...(field.min !== undefined ? { min: field.min } : {})}
                {...(field.max !== undefined ? { max: field.max } : {})}
                {...(field.step !== undefined ? { step: field.step } : {})}
                value={textValue}
                {...invalidProps}
                {...requiredProps}
                {...describedByProps}
                onChange={(event) => handleChange(field.name, event.target.value)}
              />
            )}
            {field.kind === 'select' && (
              <Select
                id={fieldId}
                ref={registerFieldRef(field.name)}
                value={textValue}
                {...invalidProps}
                {...requiredProps}
                {...describedByProps}
                onChange={(event) => handleChange(field.name, event.target.value)}
              >
                <option value="">{field.placeholder ?? ''}</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
            {field.hint !== undefined && <p className="text-xs text-muted-foreground">{field.hint}</p>}
            {hasError && (
              <p id={errorId} role="alert" className="text-xs font-medium text-destructive-text">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <Button type="submit" disabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
