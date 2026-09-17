import { useId, useState, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  Contact,
  FileCheck,
  Gauge,
  Radio,
  LayoutDashboard,
  Link2,
  Mail,
  MapPin,
  Sigma,
  TrendingDown,
  Users,
  type LucideProps,
} from 'lucide-react';
import { useIstAdmin } from '../features/auth/hooks/useIstAdmin';
import { Tooltip } from '../shared/ui/tooltip';
import { t } from '../shared/i18n/t';
import { cn } from '../shared/lib/cn';
import { istNavEintragAktiv } from './navAktiv';

type NavIconComponent = ComponentType<LucideProps>;

// Icon je Nav-Ziel (Design-System „Icons": Lucide React, 16x16 in der
// Navigation).
const NAV_ICON_BY_PATH: Readonly<Record<string, NavIconComponent>> = {
  '/': LayoutDashboard,
  '/stammdaten/endkunden': Users,
  '/stammdaten/nutzungsverhaeltnisse': Link2,
  '/stammdaten/anschlussnutzer': Contact,
  '/stammdaten/zaehler': Gauge,
  '/stammdaten/systeme': Boxes,
  '/stammdaten/standorte': MapPin,
  '/monitoring/vollstaendigkeit': ClipboardCheck,
  '/monitoring/ingest': Radio,
  '/berechnung/laeufe': TrendingDown,
  '/nutzerinfo/laeufe': Mail,
  '/nachweis/foerderjahre': FileCheck,
  '/nachweis/einsparlaeufe': Sigma,
  '/verwaltung/systemstatus': Activity,
};

interface NavLinkEintrag {
  readonly kind: 'link';
  readonly to: string;
  readonly label: string;
  /** Betriebs-UI-Konzept Punkt 4/5 „Begriffserklärungen" — Info-Tooltip direkt am Nav-Eintrag. */
  readonly tooltip?: string;
  /** Nur exakte Pfad-Übereinstimmung markiert diesen Eintrag als aktiv (s. `navAktiv.ts`). */
  readonly exakt?: boolean;
  /** Weitere Pfad-Präfixe, die diesen Eintrag ebenfalls aktiv setzen (s. `navAktiv.ts`). */
  readonly weiterePfade?: readonly string[];
  /**
   * Untergeordnete Einträge. Rendern als ECHTE verschachtelte `<ul>` im
   * `<li>` des Elternteils — nicht bloß eingerückt: Zuvor war die
   * Unterordnung reine Optik (`ml-3`) auf einem Geschwister-`<li>`, die
   * Hierarchie war für Screenreader also gar nicht vorhanden.
   */
  readonly kinder?: readonly NavLinkEintrag[];
}

/**
 * Die Navigation kennt nur noch EINE Zeilenart: Links. Zuvor stand zwischen
 * „Systemgrenzen" und „Gebäude & Räume" ein Erklär-Absatz („Systemgrenzen =
 * wofür · Gebäude/Räume = wo"). Eine Navigation ist eine Liste von Zielen;
 * Fließtext dazwischen unterbricht das Überfliegen genau dort, wo man nach
 * einem Ziel sucht. Die Abgrenzung steht jetzt vollständig in den Tooltips
 * BEIDER Einträge — dort, wo man sie sucht, wenn man sie braucht.
 */
type NavZeile = NavLinkEintrag;

interface NavGruppe {
  readonly label: string;
  readonly zeilen: readonly NavZeile[];
}

/**
 * Aufgabenorientierte Nav-Struktur (Betriebs-UI-Konzept Punkt 2) — ersetzt
 * die vormals sieben gleichrangigen, datenmodell-benannten Einträge durch
 * DREI sichtbare Gruppen + eine admin-only Gruppe. Gruppierung, Umbenennung
 * UND Zusammenlegung sind QUERSCHNITTLICHE UI-Entscheidungen, die ein
 * per-Entität-additives `<entität>Nav.ts`-Muster (1 Datei → 1 flacher
 * Eintrag) grundsätzlich nicht abbilden kann. Genau daran ist die frühere
 * `features/stammdaten/nav`-Aggregation gescheitert: Sie wurde weiter
 * gepflegt und exportiert, aber von niemandem mehr gerendert. Sie ist
 * entfernt; DIESE Datei ist die einzige Quelle der Navigation.
 *
 * Korrekturen aus dem Navigations-Review:
 *
 * - **Arbeitsplatz aufgenommen.** Die Startseite war zuvor aus der laufenden
 *   Anwendung ÜBERHAUPT NICHT erreichbar: kein Nav-Eintrag, und der Titel in
 *   der Sidebar war ein `<span>` statt eines Links (`AppShell.tsx`). Wer
 *   einmal wegnavigierte, kam nur über den Zurück-Button oder die URL
 *   zurück. `exakt: true` ist hier zwingend — `/` als Präfix würde sonst auf
 *   jeder Route passen.
 * - **„Systemgrenzen (Messkonzept)" → „Systemgrenzen".** Der Klammerzusatz
 *   war eine Falschbeschriftung: Messkonzept-Versionen liegen unter
 *   `/stammdaten/endkunden/:id/messkonzept/…`, also beim ENDKUNDEN, nicht
 *   unter den Systemen. Wer auf „Messkonzept" klickte, landete bei den
 *   Systemen und fand dort keines. Was eine Systemgrenze ist, erklärt der
 *   Tooltip — dafür braucht es den irreführenden Zusatz nicht.
 * - **„Anschlussnutzer & Verträge" aufgeteilt.** Das Label nannte zwei
 *   Dinge, hatte aber nur für die Verträge ein Ziel; die
 *   Anschlussnutzer-Liste war über die Navigation gar nicht erreichbar (nur
 *   per URL). Jetzt zwei untergeordnete Einträge mit je eigenem, korrektem
 *   Ziel. Der Haupt-Einstieg bleibt die Endkunde-Detailseite, die beide
 *   Listen eingebettet zeigt — deshalb sind sie hier untergeordnet und nicht
 *   gleichrangig.
 * - **Platzhalter entfernt.** „Baseline & Einsparung" und „BAFA-Export"
 *   standen als nicht klickbare `bald`-Zeilen in der Navigation UND als
 *   Kacheln auf dem Dashboard — zweimal dieselbe Nicht-Funktion. Ein
 *   Nav-Eintrag ist ein Navigationsversprechen; die Roadmap gehört auf das
 *   Dashboard, wo sie bereits steht.
 * - **Beide Bereiche sind inzwischen echt** und stehen deshalb wieder in der
 *   Gruppe „Betrieb" — jetzt aber als gewöhnliche Einträge mit Ziel:
 *   „Baseline & Einsparung" auf die globale Lauf-Übersicht, „Förderjahre" auf
 *   den Einstieg der Nachweis-Kette. Der Eintrag heißt „Förderjahre" und
 *   nicht „BAFA-Export": Er führt auf die Förderjahr-Liste, und der Export
 *   ist nur eine Station weiter hinten in derselben Kette — ein Label, das
 *   das Ende verspricht und am Anfang landet, wäre wieder eine
 *   Falschbeschriftung. Was dahinter liegt, sagt der Tooltip.
 */
function useNavGruppen(istAdmin: boolean): readonly NavGruppe[] {
  const gruppen: NavGruppe[] = [
    {
      label: t('nav.gruppen.stammdaten'),
      zeilen: [
        {
          kind: 'link',
          to: '/stammdaten/endkunden',
          label: t('nav.stammdaten.endkunden'),
          kinder: [
            { kind: 'link', to: '/stammdaten/nutzungsverhaeltnisse', label: t('nav.stammdaten.vertraegeUndNutzung') },
            { kind: 'link', to: '/stammdaten/anschlussnutzer', label: t('nav.stammdaten.anschlussnutzer') },
          ],
        },
        {
          kind: 'link',
          to: '/stammdaten/zaehler',
          label: t('nav.stammdaten.zaehlerMesskanaele'),
          // Messkanal-Details liegen unter einem EIGENEN Top-Level-Präfix,
          // gehören aber zu diesem Eintrag — sonst erlischt die Markierung
          // ausgerechnet bei der Route, die der Eintrag im Namen führt.
          weiterePfade: ['/stammdaten/messkanaele'],
        },
        // Die beiden einzigen verbliebenen Tooltips: „fachliche Bilanzgrenze"
        // vs. „räumliche Struktur" ist eine Unterscheidung der DOMÄNE, kein
        // Benennungsproblem — kein Label der Welt trägt sie von allein.
        { kind: 'link', to: '/stammdaten/systeme', label: t('nav.stammdaten.systemgrenzen'), tooltip: t('nav.tooltips.systemgrenze') },
        { kind: 'link', to: '/stammdaten/standorte', label: t('nav.stammdaten.gebaeudeUndRaeume'), tooltip: t('nav.tooltips.gebaeudeUndRaeume') },
      ],
    },
    {
      label: t('nav.gruppen.messdaten'),
      zeilen: [
        // Aufnahme VOR Vollständigkeit: erst kommt etwas an, dann fällt auf,
        // was fehlt. Vorher war die Aufnahme ein Unterpunkt der
        // Vollständigkeit — sie ist aber keine Teilmenge davon, sondern der
        // Schritt davor.
        { kind: 'link', to: '/monitoring/ingest', label: t('nav.stammdaten.messdatenAufnahme') },
        { kind: 'link', to: '/monitoring/vollstaendigkeit', label: t('nav.stammdaten.datenqualitaet') },
      ],
    },
    {
      label: t('nav.gruppen.auswertung'),
      zeilen: [
        { kind: 'link', to: '/berechnung/laeufe', label: t('nav.nachweis.baselineEinsparung') },
        {
          // Die Monatsinformation steht in „Auswertung" und nicht bei den
          // Kunden: Sie ist ein wiederkehrender Lauf, den jemand auslöst und
          // überwacht — nicht ein Stammdatum, das man pflegt. Der VERLAUF
          // einer einzelnen Person hängt dagegen an der Person und hat
          // bewusst keinen eigenen Nav-Eintrag.
          kind: 'link',
          to: '/nutzerinfo/laeufe',
          label: t('nav.nutzerinfo.laeufe'),
        },
      ],
    },
    {
      label: t('nav.gruppen.nachweis'),
      zeilen: [
        {
          kind: 'link',
          to: '/nachweis/foerderjahre',
          label: t('nav.nachweis.foerderjahre'),
          // Preflight, Export und Einreichung liegen unter eigenen
          // Top-Level-Präfixen, gehören aber zu diesem Eintrag — ohne die
          // Zusatzpfade erlösche die Markierung mitten in der Kette.
          weiterePfade: ['/nachweis/preflights', '/nachweis/exporte', '/nachweis/einreichungen'],
          kinder: [{ kind: 'link', to: '/nachweis/einsparlaeufe', label: t('nav.nachweis.einsparlaeufe') }],
        },
      ],
    },
  ];

  if (istAdmin) {
    gruppen.push({
      label: t('nav.gruppen.system'),
      zeilen: [{ kind: 'link', to: '/verwaltung/systemstatus', label: t('nav.health') }],
    });
  }

  return gruppen;
}

function navIconFor(to: string): NavIconComponent | undefined {
  return NAV_ICON_BY_PATH[to];
}

interface NavLinkZeileProps {
  readonly zeile: NavLinkEintrag;
  /** `true` für untergeordnete Einträge — nur Optik, die Struktur trägt das verschachtelte `<ul>`. */
  readonly untergeordnet?: boolean;
}

/**
 * Bewusst `Link` statt `NavLink`: Der Aktiv-Zustand wird über
 * `istNavEintragAktiv` (`navAktiv.ts`) selbst bestimmt, weil einige Einträge
 * mehrere Pfad-Präfixe abdecken. `aria-current="page"` und die Optik hängen
 * dadurch garantiert an DERSELBEN Entscheidung — bei `NavLink` mit
 * überschriebener Optik würden sie auseinanderlaufen.
 */
function NavLinkZeile({ zeile, untergeordnet = false }: NavLinkZeileProps): ReactNode {
  const { pathname } = useLocation();
  const Icon = navIconFor(zeile.to);
  const istAktiv = istNavEintragAktiv(pathname, zeile);
  const kinder = zeile.kinder ?? [];
  const listenId = useId();

  /*
    Unterpunkte sind nicht mehr dauerhaft offen.

    Zuvor stand JEDER Unterpunkt jeder Gruppe immer da — vierzehn Zeilen, von
    denen die meisten nichts mit der aktuellen Aufgabe zu tun hatten. Wer
    etwas sucht, ueberfliegt eine Navigation; je mehr Zeilen dauerhaft
    stehen, desto weniger traegt die Gruppierung.

    Offen ist deshalb GENAU DER ZWEIG, in dem man gerade steht (Elternteil
    oder ein Kind aktiv). Wer einen anderen Zweig aufklappen will, kann das
    ueber den Pfeil — die manuelle Entscheidung hat Vorrang, bis die Route
    wechselt.
  */
  const zweigAktiv = istAktiv || kinder.some((kind) => istNavEintragAktiv(pathname, kind));
  const [offenManuell, setOffenManuell] = useState<boolean | undefined>(undefined);
  const offen = offenManuell ?? zweigAktiv;

  return (
    <li>
      <div className="flex items-center gap-1">
        <Link
          to={zeile.to}
          aria-current={istAktiv ? 'page' : undefined}
          className={cn(
            'flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            untergeordnet && 'py-1.5 text-xs',
            istAktiv ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
          {zeile.label}
        </Link>
        {kinder.length > 0 && (
          <button
            type="button"
            aria-expanded={offen}
            aria-controls={listenId}
            aria-label={`${t('nav.unterpunkteAriaPraefix')} ${zeile.label}`}
            onClick={() => {
              setOffenManuell(!offen);
            }}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight aria-hidden="true" className={cn('h-4 w-4 transition-transform', offen && 'rotate-90')} />
          </button>
        )}
        {zeile.tooltip !== undefined && (
          <Tooltip text={zeile.tooltip} label={`${t('nav.tooltipLabelPraefix')} ${zeile.label}`} />
        )}
      </div>
      {kinder.length > 0 && offen && (
        <ul id={listenId} className="ml-3 mt-1 space-y-1 border-l border-border pl-2">
          {kinder.map((kind) => (
            <NavLinkZeile key={kind.to} zeile={kind} untergeordnet />
          ))}
        </ul>
      )}
    </li>
  );
}

function NavGruppeRenderer({ gruppe }: { readonly gruppe: NavGruppe }): ReactNode {
  const labelId = useId();

  return (
    <div>
      <p id={labelId} className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {gruppe.label}
      </p>
      {/*
        `aria-labelledby` verbindet die sichtbare Gruppen-Beschriftung mit
        ihrer Liste. Zuvor standen `<p>` und `<ul>` unverbunden nebeneinander
        — ein Screenreader kündigte vier NAMENLOSE Listen an, die Gruppierung
        existierte also nur optisch. Bewusst weiterhin KEIN `<h2>`: Das würde
        eine zusätzliche Überschriften-Ebene innerhalb der `<nav>`-Landmark
        einziehen, ohne für die Struktur mehr zu leisten.
      */}
      <ul aria-labelledby={labelId} className="space-y-1">
        {gruppe.zeilen.map((zeile) => (
          <NavLinkZeile key={zeile.to} zeile={zeile} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Globale Nav-Shell des Betriebs-UI.
 *
 * **Die Gruppen folgen dem Weg der Daten durch das Haus**, in genau der
 * Reihenfolge, in der die Plattform arbeitet: Stammdaten (was es gibt) →
 * Messdaten (was hereinkommt) → Auswertung (was es bedeutet) → Nachweis (was
 * das Haus verlässt). Zuvor hiessen die Gruppen „Arbeit / Kunden /
 * Messstellen & Geräte / Betrieb"; „Betrieb" war dabei eine Restekiste, in
 * der Datenqualität, Einsparberechnung, Förderjahre und Nutzerinformation
 * nebeneinander lagen, ohne fachlich zusammenzugehören.
 *
 * Zwei Folgeentscheidungen aus demselben Prinzip:
 *
 * - **Die Datenaufnahme ist kein Unterpunkt der Vollständigkeit mehr.** Sie
 *   ist keine Teilmenge davon, sondern der Schritt DAVOR: erst kommt etwas
 *   an, dann fällt auf, was fehlt. Beide stehen jetzt gleichrangig unter
 *   „Messdaten".
 * - **Vier von sechs Tooltips sind entfallen.** Ein Label, das eine Erklärung
 *   braucht, ist das falsche Label — „Baseline & Einsparung" heisst jetzt
 *   „Verbrauch & Einsparung", „Datenqualität & Störungen" heisst
 *   „Vollständigkeit & Störungen", „Messdaten-Aufnahme" heisst
 *   „Datenaufnahme". Geblieben sind die zwei, die eine Unterscheidung der
 *   DOMÄNE tragen (fachliche Systemgrenze vs. räumliches Gebäude) — die
 *   trägt kein Label von allein.
 *
 * Der Arbeitsplatz steht ohne Gruppenüberschrift ganz oben: Eine Überschrift
 * über einem einzigen Eintrag ordnet nichts, sie kostet nur eine Zeile.
 *
 * Die admin-only Gruppe „System" ist rein kosmetisch — die Route selbst
 * bleibt für jede authentifizierte Rolle erreichbar (s. `useIstAdmin.ts`).
 */
export function AppNav(): ReactNode {
  const istAdmin = useIstAdmin();
  const gruppen = useNavGruppen(istAdmin);

  return (
    <nav aria-label={t('nav.ariaLabel')} className="flex-1 space-y-4 overflow-y-auto p-3">
      <ul className="space-y-1">
        <NavLinkZeile zeile={{ kind: 'link', to: '/', label: t('nav.arbeitsplatz'), exakt: true }} />
      </ul>
      {gruppen.map((gruppe) => (
        <NavGruppeRenderer key={gruppe.label} gruppe={gruppe} />
      ))}
    </nav>
  );
}
