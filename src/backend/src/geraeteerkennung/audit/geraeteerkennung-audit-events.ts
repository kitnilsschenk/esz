/**
 * Audit-Event-Codes der Geraeteerkennung (V0057, TB-05).
 *
 * WORTGLEICH mit `migrations/V0057__audit_geraeteerkennung_events.sql`:
 *   - ZUORDNUNG_ANGELEGT: { synthetic, methode, im_gesamtverbrauch_enthalten,
 *                           genauigkeit_pct, anteil_prozent }
 *   - ZUORDNUNG_BEENDET:  { synthetic, methode }
 *   - ENTBEHRLICH:        { synthetic, entbehrlich }
 *
 * Alle drei sind PFLICHTEREIGNISSE: Jeder Vorgang veraendert die Zahl, mit
 * der gegenueber der Bewilligungsbehoerde nachgewiesen wird, dass 20 bis 40
 * Prozent des Jahresverbrauchs zugeordnet werden koennen. Anlegen hebt die
 * Quote, Beenden senkt sie, und die Entbehrlichkeit nimmt ein System aus der
 * Wertung.
 *
 * NIRGENDS enthalten: Endkunden-Kennung, Verbrauchswerte und der Freitext-
 * GRUND der Entbehrlichkeit -- er koennte einen Namen tragen und liegt ueber
 * `objekt_ref` auffindbar in `energy.system`.
 */
export const GERAETEERKENNUNG_EVENT_CODES = {
  ZUORDNUNG_ANGELEGT: 'geraetegruppe.zuordnung.angelegt',
  ZUORDNUNG_BEENDET: 'geraetegruppe.zuordnung.beendet',
  ENTBEHRLICH: 'system.geraeteerkennung.entbehrlich_vermerkt',
} as const;
