// Barrierefreier Bestätigungsdialog (Feature-Pass B, Endkunde
// Sperren/Kryptoshredding, `.claude/rules/frontend-react.md`: semantisches
// HTML, sichtbarer Fokus-Ring, Tastatur-Flow). Nutzt bewusst das NATIVE
// `<dialog>`-Element statt einer Dialog-Bibliothek (z. B.
// `@radix-ui/react-dialog`, keine freigegebene Abhängigkeit für diesen
// Auftrag) — `showModal()` liefert in echten Browsern kostenlos einen
// Fokus-Trap, Esc-zu-Schließen (`cancel`-Event) und einen `::backdrop`.
//
// jsdom (Testumgebung) implementiert `HTMLDialogElement.prototype.showModal`/
// `.close()` NICHT (Stand jsdom 25 — nur das reflektierte `open`-Attribut ist
// vorhanden). Diese Komponente erkennt das zur Laufzeit (`typeof
// dialog.showModal === 'function'`) und fällt in Tests auf das `open`-
// Attribut zurück; Esc- und Backdrop-Verhalten werden zusätzlich IMMER über
// eigene Handler nachgebildet (`onKeyDown`/`onClick` mit Ziel-Prüfung) — so
// bleibt das Verhalten in Tests deterministisch UND in echten Browsern bleibt
// die native Semantik (Fokus-Trap, `::backdrop`) erhalten (die eigenen
// Handler laufen dort redundant, aber idempotent nebenher).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Button, type ButtonProps } from './button';
import { Input } from './input';
import { Label } from './label';
import { cn } from '../lib/cn';

export type ConfirmDialogVariant = 'default' | 'destructive';

interface ConfirmDialogSharedProps {
  readonly titel: string;
  /** ReactNode (nicht nur `string`), damit z. B. eine hervorgehobene Warnung (`<strong>`) innerhalb der Beschreibung möglich ist (Kryptoshredding, Art. 17). */
  readonly beschreibung: ReactNode;
  readonly bestaetigenLabel: string;
  readonly abbrechenLabel: string;
  /** Default `'default'`. */
  readonly variant?: ConfirmDialogVariant;
  readonly offen: boolean;
  /** Wird bei Abbrechen, Esc UND Backdrop-Klick aufgerufen (identische Semantik). */
  readonly onSchliessen: () => void;
  /** Wird NUR aufgerufen, wenn kein `bestaetigungstext` gesetzt ist ODER der Nutzer ihn exakt eingegeben hat. */
  readonly onBestaetigen: () => void;
}

/**
 * `bestaetigungstext`/`bestaetigungstextLabel` sind wechselseitig Pflicht
 * (Type-to-confirm braucht IMMER ein beschriftetes Eingabefeld,
 * `.claude/rules/frontend-react.md`: „Deutsche UI-Strings aus de.json" —
 * dieser Baustein selbst ist wie alle `shared/ui/*`-Primitives string-frei,
 * der Aufrufer liefert das Label aus `de.json`). TypeScript kann die
 * wechselseitige Pflicht zweier optionaler Felder nur über eine
 * Diskriminanten-Union ausdrücken, nicht über zwei unabhängige `?`-Props.
 */
export type ConfirmDialogProps = ConfirmDialogSharedProps &
  (
    | { readonly bestaetigungstext?: undefined; readonly bestaetigungstextLabel?: undefined }
    | { readonly bestaetigungstext: string; readonly bestaetigungstextLabel: string }
  );

function oeffneDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    // jsdom-Fallback (s. Datei-Kommentar oben) — kein echter Modal-Zustand,
    // reicht aber für Verhaltenstests (Fokus/Esc/Backdrop werden ohnehin
    // manuell nachgebildet).
    dialog.open = true;
  }
}

function schliesseDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.open = false;
  }
}

/**
 * Barrierefreier Bestätigungsdialog. A11y:
 * - `aria-labelledby`/`aria-describedby` auf Titel/Beschreibung, `aria-modal`
 *   explizit gesetzt (nicht auf die UA-Ableitung aus `showModal()` verlassen
 *   — die greift im jsdom-Fallback ohnehin nicht).
 * - Fokus initial auf den Abbrechen-Button (bei `variant="destructive"`
 *   PFLICHT gegen Fehlbedienung — ein versehentliches Enter darf niemals die
 *   destruktive Aktion auslösen; hier bewusst EINHEITLICH für beide
 *   Varianten übernommen, da ein sicherer Default auch im Normalfall nicht
 *   schadet).
 * - Esc/Backdrop-Klick = Abbrechen (`onSchliessen`, NICHT `onBestaetigen`).
 * - Type-to-confirm (`bestaetigungstext`): `bestaetigenLabel`-Button bleibt
 *   `disabled`, bis der eingegebene Text EXAKT übereinstimmt.
 */
export function ConfirmDialog(props: ConfirmDialogProps): ReactNode {
  const {
    titel,
    beschreibung,
    bestaetigenLabel,
    abbrechenLabel,
    variant = 'default',
    offen,
    onSchliessen,
    onBestaetigen,
    bestaetigungstext,
    bestaetigungstextLabel,
  } = props;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const abbrechenRef = useRef<HTMLButtonElement>(null);
  const [eingabe, setEingabe] = useState('');
  const titelId = useId();
  const beschreibungId = useId();
  const eingabeId = useId();

  // Öffnen/Schließen des nativen Elements synchron zum `offen`-Prop nachführen.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (offen && !dialog.open) {
      oeffneDialog(dialog);
      setEingabe('');
      abbrechenRef.current?.focus();
    } else if (!offen && dialog.open) {
      schliesseDialog(dialog);
    }
  }, [offen]);

  // Deckt echte Browser ab, in denen `showModal()`s native Esc-Behandlung
  // (`cancel`-Event) den Dialog selbst schließt, BEVOR unser eigener
  // `onKeyDown`-Handler unten greifen könnte — synct den React-State in
  // jedem Fall zurück. Im jsdom-Fallback feuert dieses Event nie (kein
  // `close()` verfügbar) — dort übernimmt ausschließlich `onKeyDown` unten.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    function handleNativeClose(): void {
      onSchliessen();
    }
    dialog.addEventListener('close', handleNativeClose);
    return () => dialog.removeEventListener('close', handleNativeClose);
  }, [onSchliessen]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    // Klick auf das <dialog>-Element SELBST (nicht auf ein Kind-Element im
    // Inhaltsbereich) = Klick auf den Backdrop — `::backdrop` lässt sich in
    // React nicht separat adressieren, der Klick auf die Dialog-Box läuft
    // aber immer über ein Kind-Element (`<div>` unten), daher ist diese
    // Ziel-Prüfung eindeutig.
    if (event.target === dialogRef.current) {
      onSchliessen();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === 'Escape') {
      onSchliessen();
    }
  }

  const eingabeStimmtNichtUeberein = bestaetigungstext !== undefined && eingabe !== bestaetigungstext;

  function handleBestaetigenClick(): void {
    if (eingabeStimmtNichtUeberein) {
      return;
    }
    onBestaetigen();
  }

  const bestaetigenVariant: ButtonProps['variant'] = variant === 'destructive' ? 'destructive' : 'default';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titelId}
      aria-describedby={beschreibungId}
      aria-modal="true"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className={cn(
        // `m-auto` ist NICHT kosmetisch: Ein `<dialog>` wird vom
        // UA-Stylesheet ueber `margin: auto` mittig gesetzt — und Tailwinds
        // Preflight setzt `margin: 0` auf alle Elemente und hebt das auf.
        // Ohne diese Klasse klebt jeder Bestaetigungsdialog der Anwendung in
        // der oberen linken Ecke, weit weg vom Knopf, der ihn geoeffnet hat.
        'm-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-card-foreground shadow-lg',
        'backdrop:bg-foreground/50',
      )}
    >
      <div className="space-y-4 p-6">
        <h2 id={titelId} className="text-base font-bold text-foreground">
          {titel}
        </h2>
        <div id={beschreibungId} className="space-y-2 text-sm text-foreground">
          {beschreibung}
        </div>
        {bestaetigungstext !== undefined && (
          <div className="space-y-2">
            <Label htmlFor={eingabeId}>{bestaetigungstextLabel}</Label>
            <Input
              id={eingabeId}
              type="text"
              autoComplete="off"
              value={eingabe}
              onChange={(event) => setEingabe(event.target.value)}
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" ref={abbrechenRef} onClick={onSchliessen}>
            {abbrechenLabel}
          </Button>
          <Button type="button" variant={bestaetigenVariant} disabled={eingabeStimmtNichtUeberein} onClick={handleBestaetigenClick}>
            {bestaetigenLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
