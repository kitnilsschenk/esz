import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '../../../../shared/ui/button';
import { useDocumentTitle } from '../../../../shared/hooks/useDocumentTitle';

export interface PageHeaderCreateAction {
  readonly to: string;
  readonly label: string;
}

export interface PageHeaderProps {
  readonly headingId: string;
  readonly title: string;
  /**
   * Primär-Aktion rechts (üblicherweise „…anlegen"). Weglassen/`undefined`
   * blendet sie vollständig aus — Aufrufer entscheiden selbst, OB sie
   * überhaupt übergeben wird (z. B. Rollen-Gating via
   * `useKannStammdatenAnlegen`, siehe `AnschlussnutzerListePage`); diese
   * Komponente selbst trifft KEINE Autorisierungsentscheidung.
   */
  readonly createAction?: PageHeaderCreateAction;
}

/**
 * Wiederverwendbares Seiten-Kopf-Muster der Stammdaten-Listen-Seiten
 * (Phase 4c-Feinschliff, Design-System): Titel (`<h1>`) links, optional ein
 * primärer „…anlegen"-Link rechts — ersetzt die bisherigen zwei gestapelten
 * Roh-Zeilen (`<h1>` + `<p><Link>…</Link></p>`).
 *
 * Der Link wird bewusst NICHT über `Button asChild` gerendert — das
 * `Button`-Primitive unterstützt aus Lizenzgründen kein Slot-Polymorphismus
 * (kein `@radix-ui/react-slot`, s. `shared/ui/button.tsx`). Stattdessen
 * färbt `buttonVariants()` einen echten `react-router-dom`-`Link` ein
 * („Link-Button") — echte Navigations-Semantik (Statusleiste/Mittelklick/
 * Screenreader „Link", nicht „Schaltfläche") bei identischer Optik.
 *
 * Setzt zusätzlich `document.title` aus `title` (`useDocumentTitle`,
 * A11y-Härtung WCAG 2.2 AA 2.4.2 „Page Titled") — deckt damit ALLE
 * Listen-Seiten zentral ab, ohne dass jede `*ListePage.tsx` das selbst
 * wiederholen muss.
 */
export function PageHeader({ headingId, title, createAction }: PageHeaderProps): ReactNode {
  useDocumentTitle(title);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 id={headingId} className="text-xl font-bold text-foreground">
        {title}
      </h1>
      {createAction !== undefined && (
        <Link to={createAction.to} className={buttonVariants({ variant: 'default' })}>
          {createAction.label}
        </Link>
      )}
    </div>
  );
}
