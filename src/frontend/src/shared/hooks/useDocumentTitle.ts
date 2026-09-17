import { useEffect } from 'react';
import { t } from '../i18n/t';
import { setzeSeitentitel } from '../routing/seitentitelStore';

/**
 * Setzt `document.title` je Seite (WCAG 2.2 AA 2.4.2 „Page Titled") und
 * spiegelt denselben Text in den `seitentitelStore` — von dort liest
 * `app/RouteAnnouncer.tsx` ihn für eine visuell versteckte
 * `aria-live="polite"`-Ansage nach einem Routenwechsel (4.1.3 „Status
 * Messages"). Aufrufer übergeben NUR den seitenspezifischen Teil (z. B.
 * "Endkunden", "Endkunde-Detail") — das `"<App-Titel> — "`-Präfix (identisch
 * zum statischen Fallback-Titel in `index.html`) setzt dieser Hook zentral,
 * damit es nicht an jeder Aufrufstelle wiederholt werden muss.
 *
 * Eingebunden in den geteilten Bausteinen `DetailView`/`PageHeader` (deckt
 * alle Detail-/Listen-Seiten ab) sowie einzeln in den übrigen Seiten
 * (Anlegen-/Beenden-Formulare, Dashboard, Systemstatus, 404) — siehe
 * Abschlussbericht des A11y-Härtungsauftrags.
 */
export function useDocumentTitle(titel: string): void {
  useEffect(() => {
    const vollstaendigerTitel = `${t('app.title')} — ${titel}`;
    document.title = vollstaendigerTitel;
    setzeSeitentitel(vollstaendigerTitel);
  }, [titel]);
}
