/**
 * Audit-Event-Codes der monatlichen Nutzerinformation (V0055, TB-06).
 *
 * WORTGLEICH mit den in `migrations/V0055__audit_nutzerinfo_events.sql`
 * eingetragenen Codes und deren `erlaubte_kontext_keys`:
 *   - ERZEUGT:    { synthetic, monat, modus, anzahl_erzeugt,
 *                   anzahl_uebersprungen_widerspruch,
 *                   anzahl_uebersprungen_gesperrt, anzahl_ohne_berechnung }
 *   - ZUGESTELLT: { synthetic, monat, zustellweg }
 *
 * Der Unterschied im Zuschnitt ist Absicht: `ERZEUGT` ist ein Aggregat je
 * Lauf (sonst schriebe ein Monatslauf ueber tausend Kunden mehr ins Log als
 * der Betrieb davor), `ZUGESTELLT` ist ein Ereignis JE INFORMATION — denn die
 * Frage, auf die es ankommt, ist eine ueber EINEN Kunden.
 *
 * NIRGENDS enthalten: Endkunden-Kennung, Verbrauchswert, Einsparbetrag. Sie
 * sind ueber `objekt_ref` auffindbar; im Audit-Log waeren es
 * personenbeziehbare Verbrauchsdaten in einer breit gelesenen Hypertable, die
 * der Krypto-Shred nicht erreicht.
 */
export const NUTZERINFO_EVENT_CODES = {
  ERZEUGT: 'nutzerinfo.information.erzeugt',
  ZUGESTELLT: 'nutzerinfo.information.zugestellt',
} as const;
