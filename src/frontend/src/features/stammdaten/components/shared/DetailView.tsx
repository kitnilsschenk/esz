import type { ReactNode } from 'react';
import { Card, CardContent } from '../../../../shared/ui/card';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';

export interface DetailField {
  readonly key: string;
  readonly label: string;
  readonly value: ReactNode;
}

export interface DetailViewProps {
  readonly headingId: string;
  readonly title: string;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly loadingMessage: string;
  readonly errorMessage: string;
  /** Nicht-PII-Kernfelder (Status, Datumsangaben, Pseudonym-IDs, …). */
  readonly fields?: readonly DetailField[];
  /** Zusätzliche Abschnitte (z. B. der PII-Block via `PiiMaskedField`, spätere Unter-Listen). */
  readonly children?: ReactNode;
}

/**
 * Generische Detail-Ansicht mit Lade-/Fehlerzustand. `fields` rendert als
 * `<dl>` in einer Card (Phase 4c-Feinschliff, Design-System); `children` ist
 * der Slot für alles, was darüber hinausgeht (insb. der PII-Block,
 * `PiiMaskedField` — bewusst GETRENNT vom generischen `fields`-Array, damit
 * PII niemals versehentlich über den generischen Feld-Renderer läuft,
 * ADR-0008 §11 Linie 2). Die ÖFFENTLICHE API (Props/Verhalten/Rollen)
 * bleibt bei neuen Entitäten UNVERÄNDERT (geteiltes Fundament,
 * ADR-0008 §23 / D11).
 *
 * Setzt zusätzlich `document.title` aus `title` (`useDocumentTitle`,
 * A11y-Härtung WCAG 2.2 AA 2.4.2 „Page Titled") — deckt damit ALLE
 * Detail-Seiten zentral ab, ohne dass jede `*DetailPage.tsx` das selbst
 * wiederholen muss.
 */
export function DetailView(props: DetailViewProps): ReactNode {
  const { headingId, title, isPending, isError, loadingMessage, errorMessage, fields, children } = props;
  useDocumentTitle(title);

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <h1 id={headingId} className="text-xl font-bold text-foreground">
        {title}
      </h1>
      {isPending && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {loadingMessage}
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm font-medium text-destructive-text">
          {errorMessage}
        </p>
      )}
      {!isPending && !isError && (
        <>
          {fields && fields.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
                      <dd className="text-sm text-foreground">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
          {children}
        </>
      )}
    </section>
  );
}
