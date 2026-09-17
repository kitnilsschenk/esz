-- Down zu V0084 (ADR-0012 E5/Stufe C, A12-11..A12-19 + Nachbesserung
-- C-1..C-5 und C-7).
--
-- Entfernt ausschliesslich den MECHANISMUS (Funktion + Grants + Owner-
-- Rolle). Es gibt hier KEINE Nachweis-/Fachdaten zu verlieren -- die
-- Funktion ist zustandslos (liest nur, schreibt nie), anders als bei einem
-- Rueckbau von V0044/V0047. Kein Datenverlust-Hinweis noetig.

-- =====================================================================
-- (1) Rechte des Workers zurueck
-- =====================================================================
REVOKE EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) FROM edms_ingest_worker;
REVOKE USAGE   ON SCHEMA consent                                       FROM edms_ingest_worker;

-- =====================================================================
-- (2) Funktion
-- =====================================================================
-- Kein `REVOKE CREATE ON SCHEMA consent FROM edms_consent_gate_owner`
-- noetig: Die Up-Migration entzieht dieses Recht bereits selbst wieder,
-- unmittelbar nach der Eigentumsuebertragung (Auflage C-1) -- es ist zum
-- Zeitpunkt dieses Rollbacks bereits weg.
--
-- `DROP FUNCTION` verlangt EIGENTUM (die Objekt-Eigentuemer-Pruefung wertet
-- die AKTUELL WIRKSAME Rolle der Sitzung aus, nicht nur eine gehaltene
-- Mitgliedschaft/ADMIN OPTION) -- die migrations-fuehrende Rolle wechselt
-- deshalb kurz per `SET ROLE` in die Owner-Rolle. Das setzt das `WITH SET
-- TRUE`-Recht aus der Up-Migration voraus (dort bewusst NICHT wieder
-- entzogen, s. dortiger Kommentar). Nach dem `DROP` sofort `RESET ROLE` --
-- alles Weitere in dieser Datei laeuft wieder unter der migrations-
-- fuehrenden Rolle selbst.
SET ROLE edms_consent_gate_owner;
DROP FUNCTION IF EXISTS consent.ingest_rechtsgrundlage_wirksam(uuid);
RESET ROLE;

-- =====================================================================
-- (3) Grants der Owner-Rolle auf FREMDEN Schemata (`energy`, `consent`
-- gehoeren zu V0002/V0044 -- diese Down-Migration droppt diese Schemata
-- NICHT, die USAGE-Grants verschwinden also NICHT von selbst und muessen
-- explizit zurueckgenommen werden, anders als bei einem vollstaendigen
-- Schema-Drop wie in V0019.down.sql)
-- =====================================================================
REVOKE SELECT (id, system_id)   ON energy.zaehler             FROM edms_consent_gate_owner;
REVOKE SELECT (id, endkunde_id) ON energy.system              FROM edms_consent_gate_owner;
-- Auflage C-7: Ein Rueckbau, der ein Leserecht auf PII-Spalten stehen laesst,
-- waere schlechter als gar keiner -- die Rolle haette danach mehr Rechte als
-- vor der Migration, und zwar unbemerkt.
REVOKE SELECT (id, verarbeitungs_status) ON energy.endkunde        FROM edms_consent_gate_owner;
REVOKE SELECT (id, verarbeitungs_status) ON energy.anschlussnutzer FROM edms_consent_gate_owner;
REVOKE SELECT (system_id, anschlussnutzer_id, gueltig_von, gueltig_bis)
                                 ON energy.nutzungsverhaeltnis FROM edms_consent_gate_owner;
REVOKE USAGE  ON SCHEMA energy FROM edms_consent_gate_owner;

REVOKE SELECT (zweck_code, subjekt_typ, erlaubnismodus)
                                 ON consent.zweck_subjekt      FROM edms_consent_gate_owner;
REVOKE SELECT (endkunde_id, anschlussnutzer_id, zweck_code, erteilt_at, widerrufen_at)
                                 ON consent.einwilligung       FROM edms_consent_gate_owner;
REVOKE USAGE  ON SCHEMA consent FROM edms_consent_gate_owner;

-- =====================================================================
-- (4) Rolle bewusst NICHT gedroppt (V0003/V0010/V0019-Praezedenzfall)
-- =====================================================================
-- Cluster-globales Objekt; dieser Rollback kann aus der aktuellen Datenbank
-- heraus nicht sicher pruefen, ob `edms_consent_gate_owner` in einer ANDEREN
-- Datenbank desselben Clusters noch Owner/Grantee ist. Nach Schritt (2)/(3)
-- besitzt die Rolle kein Privileg mehr auf ein konkretes Objekt dieses
-- Features -- die verbleibende Rollen-Huelle ist inert.
--
-- Wer sie auf einer isolierten Dev-/Test-Instanz wirklich vollstaendig
-- entfernen will, tut das bewusst und manuell ausserhalb des Runners:
--   DROP ROLE IF EXISTS edms_consent_gate_owner;
