-- V0086__audit_nutzungsverhaeltnis_pflichtereignis.sql
--
-- Auflage C-9 (`compliance-director`-Votum 2026-09-16 zu ADR-0012 Stufe C):
-- Die EINGANGSGROESSEN der Gate-Entscheidung muessen auditiert oder
-- historisiert sein.
--
-- =====================================================================
-- WARUM DAS AN DIESER AUFLAGE HAENGT
-- =====================================================================
-- Auflage C-4c erlaubt, dass der Verwurf eines Uplinks KEIN Audit-Ereignis
-- schreibt. Das traegt nur unter einer Bedingung: Das Gate ist eine REINE
-- FUNKTION ueber `consent.einwilligung`, `consent.zweck_subjekt` und
-- `energy.nutzungsverhaeltnis`. Sind diese drei Eingangsgroessen
-- nachvollziehbar, ist jede vergangene Gate-Entscheidung rekonstruierbar --
-- ohne einen einzigen Eintrag je Uplink.
--
-- Das Votum hat zu Recht darauf bestanden, diese Bedingung zu pruefen statt
-- sie vorauszusetzen. Die Pruefung ergab:
--
--   * `consent.einwilligung` -- Erteilung und Widerruf sind bereits
--     Pflicht-Audit-Ereignisse (A2, V0045). Erfuellt.
--
--   * `consent.zweck_subjekt` -- `edms_app` haelt ausschliesslich SELECT
--     (V0047:192). Die Matrix ist nur ueber Migrationen aenderbar, und die
--     tragen Pruefsumme, DCO-Signoff und Git-Historie. Das ist eine
--     staerkere Nachvollziehbarkeit als ein Audit-Ereignis, nicht eine
--     schwaechere. Erfuellt, ohne Aenderung.
--
--   * `energy.nutzungsverhaeltnis` -- hier lagen zwei Luecken, und die
--     schliesst diese Migration.
--
-- =====================================================================
-- DIE ZWEI LUECKEN
-- =====================================================================
-- (1) `nutzungsverhaeltnis.angelegt` und `.beendet` existieren und werden
--     vom `NutzungsverhaeltnisController` tatsaechlich emittiert -- aber
--     beide stehen auf `pflichtereignis = false`. Ein optionales Ereignis
--     ist kein Nachweis: Nichts stellt fest, wenn es ausbleibt. Genau
--     darauf stuetzt sich aber die Begruendung, warum der Verwurf selbst
--     nichts schreiben muss.
--
-- (2) Beide fuehren eine LEERE Kontext-Whitelist (`erlaubte_kontext_keys =
--     '{}'`). Das Ereignis sagt damit "hier wurde ein Nutzungsverhaeltnis
--     angelegt" und nennt ueber `objekt_ref` die Zeile -- aber nicht, mit
--     welcher ROLLE und ab wann. Fuer die Rekonstruktion reicht das heute,
--     weil `rolle` und `gueltig_von` nach dem Anlegen unveraenderlich sind
--     (der einzige UPDATE-Pfad im Repository setzt `gueltig_bis`, s.
--     `energy-nutzungsverhaeltnis.repository.ts`) und die Zeile nie
--     geloescht wird. Es reicht aber nur, SOLANGE das so bleibt -- und ein
--     Ereignis, dessen Aussagekraft an einer Eigenschaft haengt, die
--     woanders steht, ist eine Wette auf die Zukunft. Die Werte gehoeren
--     in das Ereignis selbst.
--
-- =====================================================================
-- WAS DIESE MIGRATION NICHT TUT
-- =====================================================================
-- Sie baut KEINEN Trigger, der Aenderungen an diesen Tabellen abfaengt. Ein
-- Trigger kann keinen validierten `actor_*`-Principal herstellen (dieselbe
-- Begruendung wie bei der Bootstrap-Ausnahme jeder Katalog-Migration) und
-- wuerde ein Ereignis ohne Handelnden erzeugen -- eine Spur, die aussieht
-- wie ein Nachweis und keiner ist. Die Ereignisse entstehen dort, wo der
-- Handelnde bekannt ist: im Controller.
--
-- SCD2 wie ueberall in `audit.event_typ_version`: Die alte Version wird
-- geschlossen, eine neue angelegt. Kein UPDATE auf der bestehenden Zeile --
-- was frueher galt, bleibt lesbar.

-- =====================================================================
-- (1) nutzungsverhaeltnis.angelegt
-- =====================================================================
UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'nutzungsverhaeltnis.angelegt'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'nutzungsverhaeltnis.angelegt', 'nutzungsverhaeltnis', 'erstellen',
     ARRAY['synthetic', 'rolle', 'gueltig_von'],
     false, true, true,
     'Nutzungsverhaeltnis zwischen Anschlussnutzer und System angelegt (NutzungsverhaeltnisController). objekt_ref=nutzungsverhaeltnis.id. PFLICHTEREIGNIS seit V0086 (Auflage C-9, ADR-0012 Stufe C): Das Ingest-Gate entscheidet unter anderem anhand dieser Zeile, ob fuer einen Zaehler eine Rechtsgrundlage besteht -- und der Verwurf eines Uplinks schreibt bewusst KEIN eigenes Ereignis (A12-13/C-4c). Die Rekonstruierbarkeit vergangener Gate-Entscheidungen haengt deshalb daran, dass die EINGANGSGROESSEN luekenlos belegt sind. kontext.rolle und kontext.gueltig_von stehen seit V0086 im Ereignis selbst, statt sich auf die Unveraenderlichkeit der Tabellenspalten zu verlassen.',
     now());

-- =====================================================================
-- (2) nutzungsverhaeltnis.beendet
-- =====================================================================
UPDATE audit.event_typ_version
   SET gueltig_bis = now()
 WHERE code = 'nutzungsverhaeltnis.beendet'
   AND gueltig_bis IS NULL;

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'nutzungsverhaeltnis.beendet', 'nutzungsverhaeltnis', 'aendern',
     ARRAY['synthetic', 'gueltig_bis'],
     false, true, true,
     'Nutzungsverhaeltnis beendet -- `gueltig_bis` gesetzt (NutzungsverhaeltnisController). objekt_ref=nutzungsverhaeltnis.id. PFLICHTEREIGNIS seit V0086 (Auflage C-9): Das Ende eines Nutzungsverhaeltnisses verschiebt das SUBJEKT der Rechtsgrundlage vom Anschlussnutzer zurueck zum Endkunden -- eine Gate-Entscheidung faellt danach anders aus als davor. Ohne belegtes Enddatum laesst sich nicht rekonstruieren, ab wann. kontext.gueltig_bis traegt den gesetzten Zeitpunkt seit V0086 im Ereignis selbst.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration, s. V0006-Kopf)
-- =====================================================================
-- Diese Migration emittiert KEINE eigene `audit.katalog.geaendert`-Zeile:
-- Ein SQL-Migrationsskript kann keinen validierten `actor_*`-Principal
-- herstellen. Die Aenderung ist ueber die Migrationshistorie belegt.
