import { useEffect } from 'react';
import { t } from '../../../shared/i18n/t';
import { setzeSeitentitel } from '../../../shared/routing/seitentitelStore';

/**
 * Der Seitentitel im Kundenbereich (WCAG 2.2 AA 2.4.2 „Page Titled").
 *
 * **Eigener Hook statt `useDocumentTitle`.** Der setzt „EDMS — …" davor: eine
 * Betriebsmarke, die dem Endkunden nichts sagt und in seiner Browser-Leiste
 * (und in jedem Lesezeichen) nichts zu suchen hat. Hier steht das, was er
 * aufgerufen hat.
 *
 * Der Titel geht zusätzlich in den `seitentitelStore` — von dort liest ihn
 * der `RouteAnnouncer` für die Ansage nach einem Routenwechsel (4.1.3).
 */
export function usePortalTitel(seite?: string): void {
  useEffect(() => {
    const titel = seite === undefined ? t('portal.titel') : `${t('portal.titel')} — ${seite}`;
    document.title = titel;
    setzeSeitentitel(titel);
  }, [seite]);
}
