-- V0084__consent_ingest_rechtsgrundlage_gate.sql
--
-- ADR-0012 E5 / Stufe C — der MECHANISMUS fuer das Rechtsgrundlagen-Gate im
-- Ingest-Schreibpfad. Umsetzung der Auflagen A12-11 bis A12-19
-- (`compliance-director`-Votum vom 2026-09-05 zu ADR-0012 O1/E5) sowie der
-- Nachbesserungs-Auflagen C-1 bis C-5 und C-7 aus dem
-- `compliance-director`-Votum zur ersten Fassung dieser Migration (damals
-- fälschlich als V0080 nummeriert — V0080-V0083 sind inzwischen an anderer
-- Stelle vergeben und angewendet).
--
-- **DIESE MIGRATION SCHALTET NICHTS SCHARF.** Sie legt die Datenbank-Seite
-- des Mechanismus an: eine `SECURITY DEFINER`-Funktion, die dem Ingest-
-- Worker GENAU EIN `boolean` beantwortet. Ob der Worker sie tatsaechlich
-- aufruft, entscheidet ausschliesslich die Anwendungsseite
-- (`ConsentEnforcementConfig`, `src/backend/src/ingest-worker/config/
-- consent-enforcement.config.ts) — ein Schalter, der standardmaessig AUS
-- ist. Die Scharfschaltung selbst braucht weiterhin die **User-Freigabe**
-- (ADR-0012 §9, Nachtrag 2026-09-07: "faellt unter das fortbestehende Veto
-- gegen die Oeffnung des Ingest-Gates").
--
-- =====================================================================
-- KORREKTUR GEGENUEBER DER ERSTEN FASSUNG (Auflage C-2/B-1) — BLOCKIEREND
-- =====================================================================
-- Die urspruengliche Funktion nahm `p_verarbeitungszeitpunkt` als Parameter
-- entgegen. Der Kommentar dort behauptete, die Funktion pruefe "nie gegen
-- einen vom Aufrufer frei waehlbaren historischen Wert" — das war FALSCH:
-- genau das WAR der Parameter. `edms_ingest_worker` haelt `SELECT` auf die
-- volle Zeile von `energy.zaehler` (V0010) und kann damit jede Zaehler-ID
-- aufzaehlen; mit einem frei waehlbaren Zeitpunkt-Parameter waere der
-- exakte Widerrufszeitpunkt jedes Anschlussnutzers per Binaersuche auf die
-- Sekunde rekonstruierbar gewesen — fuer jeden Zaehler im System. Das ist
-- nicht "eine Erlaubnis statt einer Historie", das ist die Historie, nur
-- langsamer ausgelesen. A12-11 war damit in der Sache unterlaufen, trotz
-- korrekter Grant-Struktur (die Lehre aus dem Security-Review zu V0079 —
-- das GRANT ist die Sicherheitsgrenze, nicht der Code — galt fuer den
-- Zweck-Parameter, aber nicht konsequent fuer den Zeit-Parameter).
--
-- ABHILFE: Der Parameter ist ENTFERNT. Die Funktion bildet `now()` SELBST
-- im Funktionskoerper. Signatur ist jetzt `(uuid) RETURNS boolean`. Der
-- App-seitig eingefrorene Zeitpunkt (`IngestFlowService.
-- verarbeiteUplink`) bleibt fuer `empfangenAt` (Zeitstempel-Fallback)
-- erhalten, wird aber NICHT MEHR an diese Funktion durchgereicht. `now()`
-- ist zudem STRIKTER als der vorherige Parameter: Ein Widerruf, der
-- zwischen Pipeline-Eintritt und diesem Aufruf erklaert wird, wirkt sofort
-- — beim alten Entwurf haette der eingefrorene App-Zeitpunkt (knapp) davor
-- gelegen und die Verarbeitung faelschlich zugelassen. A12-12 ("bewertet
-- gegen den Verarbeitungszeitpunkt, nicht gegen `ts`") ist damit eine
-- SCHEMA-Eigenschaft: Es gibt schlicht keinen Parameter mehr, ueber den ein
-- anderer Zeitpunkt hereinkommen koennte — keine Zusicherung, die nur in
-- einem TypeScript-Kommentar lebt.
--
-- =====================================================================
-- A12-11 — KEIN Tabellen-Grant auf `consent.*` fuer den Worker
-- =====================================================================
-- Der Worker (`edms_ingest_worker`) bekommt in dieser Migration KEIN
-- SELECT/INSERT/UPDATE/DELETE auf irgendeine Tabelle in `consent.*` oder auf
-- `energy.nutzungsverhaeltnis` (die fuer die DS-07-Subjekt-Aufloesung noetig
-- waere). Stattdessen bekommt er EXECUTE auf GENAU EINE Funktion, die
-- `boolean` zurueckgibt — er erfaehrt eine Erlaubnis, keine Historie (und,
-- nach der C-2-Korrektur oben, auch keine ueber die Zeitachse abgeleitete
-- Historie mehr).
--
-- Damit die Funktion trotzdem lesen kann, braucht sie eine EIGENE,
-- dedizierte Owner-Rolle mit eigenen, minimalen Grants (`SECURITY DEFINER`
-- laeuft mit den Rechten des FUNKTIONS-Eigentuemers, nicht des Aufrufers) --
-- exakt das Muster aus V0023 (`analytics.pruefe_endkunde_sperre()`,
-- D-MUSTER/D-GRANT-ENERGY) und V0019 (D-A6-OWNER): eigene NOLOGIN-Rolle,
-- spaltenscharfe SELECT-Grants NUR auf das, was die Funktion tatsaechlich
-- liest, `REVOKE EXECUTE ... FROM PUBLIC`, Owner-Wechsel per `ALTER
-- FUNCTION ... OWNER TO`.
--
-- =====================================================================
-- Auflage C-1 — Eigentumsuebertragung braucht CREATE auf dem Schema
-- =====================================================================
-- Befund aus dem Votum: `ALTER FUNCTION ... OWNER TO edms_consent_gate_owner`
-- verlangt, dass die NEUE Owner-Rolle **CREATE-Recht auf dem Schema**
-- `consent` besitzt (PostgreSQL-Doku zu ALTER ... OWNER TO: der aktuelle
-- Session-User muss per SET ROLE auf die neue Owner-Rolle wechseln koennen
-- UND diese Rolle braucht CREATE auf dem Zielschema — sonst waere die
-- Eigentumsuebertragung ein Weg, etwas zu tun, das ein direktes
-- DROP+CREATE unter der neuen Rolle nicht koennte). `consent` wurde in
-- V0044 per `CREATE SCHEMA consent;` angelegt, OHNE Eigentum an eine
-- dedizierte Rolle zu uebertragen (anders als V0019, das `ALTER SCHEMA
-- analytics OWNER TO edms_analytics_owner` setzt) — das Schema gehoert also
-- weiterhin der Rolle, die V0044 angewendet hat (in der Dev-Compose der
-- Superuser-Bootstrap-User). Ein SUPERUSER umgeht die CREATE-Pruefung bei
-- ALTER ... OWNER TO vollstaendig — deshalb lief die erste Fassung in der
-- Dev-Compose durch, waere aber unter einer echten, nicht-superuser
-- Migrations-Rolle mit "permission denied for schema consent"
-- fehlgeschlagen.
--
-- ABHILFE (minimal-invasiv, KEIN Eigentumswechsel des gesamten Schemas):
-- `edms_consent_gate_owner` bekommt CREATE auf `consent` NUR fuer den
-- Moment der Eigentumsuebertragung und verliert es unmittelbar danach
-- wieder (`REVOKE CREATE ... ` direkt nach `ALTER FUNCTION ... OWNER TO`,
-- s. Abschnitt (2) unten). Das Schema selbst bleibt Eigentum der
-- migrations-fuehrenden Rolle -- `edms_consent_gate_owner` bekommt zu
-- keinem Zeitpunkt staendiges CREATE-Recht auf `consent` und kann damit
-- (anders als bei `ALTER SCHEMA ... OWNER TO`) keine weiteren Objekte im
-- Schema anlegen, wenn die SECURITY-DEFINER-Funktion irgendwann kompromit-
-- tiert wuerde.
--
-- =====================================================================
-- Auflage C-1, ZWEITER (bei der Verifikation zusaetzlich gefundener)
-- Befund — ADMIN OPTION ist NICHT SET-Recht
-- =====================================================================
-- Die eigentliche Verifikation (s. u.) deckte einen ZWEITEN, vom Votum noch
-- nicht benannten Blocker auf: PostgreSQL 16 macht die erzeugende Rolle
-- beim `CREATE ROLE` automatisch zum Mitglied DER NEUEN Rolle MIT ADMIN
-- OPTION -- aber OHNE INHERIT und OHNE SET (empirisch verifiziert, s.
-- Verifikationsnotiz). `ALTER ... OWNER TO` verlangt jedoch ausdruecklich
-- die Faehigkeit, per `SET ROLE` auf die neue Owner-Rolle zu wechseln --
-- ADMIN OPTION allein (das Recht, die Mitgliedschaft ANDERER an dieser
-- Rolle zu verwalten) reicht dafuer NICHT. Ohne eine zusaetzliche
-- explizite Rechtevergabe waere die Eigentumsuebertragung also SELBST MIT
-- dem C-1-Schema-Fix aus dem vorherigen Abschnitt unter einer echten,
-- nicht-superuser Migrationsrolle gescheitert -- diesmal mit "must be able
-- to SET ROLE edms_consent_gate_owner".
--
-- ABHILFE: `GRANT edms_consent_gate_owner TO CURRENT_USER WITH SET TRUE;`
-- unmittelbar vor der Eigentumsuebertragung (Abschnitt (2)). `CURRENT_USER`
-- ist dabei die migrations-fuehrende Rolle selbst -- zur Autorenzeit dieser
-- Migration nicht bekannt (und nicht bekannt sein muss: die erzeugende
-- Rolle hat ADMIN OPTION auf jede von ihr erzeugte Rolle und darf sich
-- damit selbst zusaetzliche Optionen auf dieselbe Mitgliedschaft gewaehren).
--
-- ANDERS ALS DAS CREATE-RECHT AUS DEM VORHERIGEN ABSCHNITT WIRD DIESES
-- SET-RECHT NICHT WIEDER ENTZOGEN: Der Sicherheitsgewinn eines Entzugs waere
-- hier gering (die migrations-fuehrende Rolle ist ohnehin bereits maechtiger
-- als `edms_consent_gate_owner` selbst -- sie hat es per CREATEROLE
-- erzeugt und kann es jederzeit per ADMIN OPTION aendern/droppen), waehrend
-- ein Entzug die DOWN-Migration erschweren wuerde: `DROP FUNCTION` verlangt
-- EIGENTUM (nicht nur Mitgliedschaft), was einen `SET ROLE
-- edms_consent_gate_owner`-Schritt im Rueckbau voraussetzt (s. `.down.sql`).
-- Das ist ein ANDERER Rechte-Typ als das CREATE-Recht auf dem Schema: Jenes
-- beschraenkt, was der FUNKTIONSKOERPER selbst (potenziell kompromittiert,
-- laeuft SECURITY DEFINER) anrichten kann, waehrend dieses SET-Recht nur
-- die ohnehin schon voll vertrauenswuerdige Migrations-/Betriebsrolle
-- betrifft.
--
-- VERIFIKATION: Diese Migration ist gegen einen ECHTEN PostgreSQL-16-
-- Testcontainer angewendet UND zurueckgebaut worden, unter einer eigens
-- angelegten, NICHT-superuser Migrations-Rolle (mit CREATEROLE, Eigentuemer
-- der Test-Datenbank -- realistisches Minimum fuer die gesamte Migrations-
-- kette V0001..V0084, NICHT nur fuer diese Datei). Verifikationsnotiz am
-- Dateiende (Muster V0023), Test:
-- `src/backend/src/ingest-worker/persistence/
-- consent-ingest-rechtsgrundlage-gate.integration.spec.ts`.
--
-- =====================================================================
-- A12-12 — Bewertung gegen `now()`, nicht gegen `ts`, nicht gegen einen
-- Parameter (verschaerft durch C-2, s. oben)
-- =====================================================================
--
-- =====================================================================
-- A12-13 — abgewiesene Uplinks werden VERWORFEN, nicht quarantaeniert
-- =====================================================================
-- Diese Migration legt dafuer KEINE neue Tabelle und KEINEN neuen
-- `ck_quarantaene_grund`-Wert an (bewusst NICHT `ingest.eingang_quarantaene`
-- erweitert, s. `ingest-flow.service.ts`/`reason-code.ts`). Eine Zeile in
-- einer Tabelle mit offener Loeschfrist wuerde die Wirkung des Widerrufs
-- umkehren: Die Daten der Person, die widerrufen hat, laegen weiterhin im
-- System, nur an einer anderen Stelle. Der Verwurf bleibt AUSSERHALB der
-- Datenbank (Metrik + Structured-Log ohne Subjekt-Korrelat,
-- `IngestMetricsService`/`IngestLoggerService`, A12-14, verschaerft durch
-- Auflage C-5 — der Log-Log traegt seit dieser Fassung nicht einmal mehr
-- `zaehlerId`) — diese Migration traegt dazu nichts bei, ausser der
-- Funktion, die das Ergebnis liefert, auf dem der Worker seine Entscheidung
-- trifft.
--
-- AUSDRUECKLICH BENANNTE AUSNAHME (Auflage C-4b): Der Herkunfts-Abgleich
-- (ADR-0011 B3/D4, `IngestFlowService` Schritt 4a) laeuft VOR diesem Gate
-- (Schritt 4b) und schreibt bei einem Widerspruch weiterhin eine
-- Quarantaene-Zeile MIT `zaehlerId` — auch fuer ein Subjekt ohne wirksame
-- Rechtsgrundlage. Das ist vertretbar (anderes Schutzziel, muss laut
-- ADR-0011 vor allem Weiteren greifen), aber eine bewusste Ausnahme von
-- A12-13 und wird im Anwendungscode als solche benannt, nicht verschwiegen.
--
-- Aus demselben Grund (Rechenschaft haengt an den EINGANGSGROESSEN, nicht
-- am Verwurf selbst — Auflage C-4c) schreibt der Verwurf auch KEIN
-- `audit.event`: Das Gate ist eine REINE FUNKTION ueber `consent.
-- einwilligung`, `consent.zweck_subjekt` und `energy.nutzungsverhaeltnis`.
-- Erteilung und Widerruf einer Einwilligung sind bereits eigenstaendig
-- audit-pflichtig (A2, `migrations/V0045__audit_einwilligung_events.sql`).
-- Jede Gate-Entscheidung ist damit fuer jeden vergangenen Zeitpunkt
-- deterministisch aus dem bereits vorhandenen, manipulationsfesten
-- Audit-Log rekonstruierbar — ein Zusatz-Ereignis je Uplink haette nur
-- denselben, bereits belegten Sachverhalt ein zweites Mal festgehalten,
-- diesmal subjektkorreliert und dauerhaft.
--
-- =====================================================================
-- A12-15 — Zweck ist FEST `messdaten_verarbeitung`, nicht wahlbar
-- =====================================================================
-- Der Aufrufer kann den Zweck NICHT als Parameter waehlen (anders als z. B.
-- `audit.append_event`, dessen `p_event_typ`/`p_actor_sub` frei waehlbar
-- sind — ein Befund aus dem Security-Review zu V0079, das genau diese Form
-- als Schwachstelle markiert hat: eine Rolle mit EXECUTE auf eine generische
-- Funktion kann beliebige Ereignisse/Zwecke vortaeuschen). Diese Funktion
-- haelt den Zweck als Konstante im Funktionskoerper (`c_zweck_code`) fest.
-- Wird Stufe C je auf einen zweiten Zweck ausgeweitet, braucht das eine neue,
-- eigens gepruefte Migration — keine Parametererweiterung dieser Funktion.
--
-- Ebenso waehlt der Aufrufer KEIN Subjekt direkt: Der einzige verbleibende
-- Eingabe-Parameter ist `p_zaehler_id` — ein Wert, ueber den der Worker im
-- normalen Ingest-Pfad ohnehin bereits verfuegt (Schritt 4, Forward-Lookup).
-- Er kann damit weder einen beliebigen Endkunden noch einen beliebigen
-- Anschlussnutzer erfragen, sondern ausschliesslich "gilt fuer DIESEN
-- (bereits korrelierten) Zaehler GERADE JETZT eine Rechtsgrundlage" — eine
-- Erlaubnis, keine Identitaet, kein Zeitpunkt.
--
-- =====================================================================
-- A12-16/A12-17 — Subjekt-Aufloesung folgt DS-07 NUR TEILWEISE (Auflage
-- C-4a — Richtigstellung, KEIN Fix in dieser Migration)
-- =====================================================================
-- Zaehler -> System -> (aktives energy.nutzungsverhaeltnis? Anschlussnutzer
-- : Endkunde). Die Rechtsgrundlage selbst liest die Funktion NICHT als
-- Hardcode, sondern aus `consent.zweck_subjekt` (V0047) — derselben Zeile,
-- aus der auch die Anwendung sie bestimmt (A12-1).
--
-- **RICHTIGSTELLUNG (C-4a):** Die erste Fassung dieser Migration behauptete,
-- die Subjekt-Aufloesung "folge DS-07". Das ist nur die HALBE Wahrheit: Die
-- Funktion liest `energy.nutzungsverhaeltnis.rolle` NICHT. Ein aktives
-- Nutzungsverhaeltnis schaltet IMMER auf den Anschlussnutzer-/opt-in-Zweig
-- um — auch fuer `rolle = 'eigentuemer_selbstnutzer'`, obwohl V0047/O1
-- gerade fuer DIESEN Fall (kein Dritter involviert) den lit.-b-Zweig des
-- ENDKUNDEN fuer sachlich richtig haelt. Die Folge: Ein Eigentuemer-
-- Selbstnutzer-Nutzungsverhaeltnis (das laut `stammdaten-resource-
-- attributes.provider.ts` ein aktiv genutztes, First-Class-Datenmuster ist,
-- nicht ein theoretischer Randfall) verlangt nach dieser Funktion eine
-- lit.-a-Einwilligung, wo eigentlich der Endkunden-Vertrag traegt.
--
-- Das ist eine OFFENE Datenmodell-Luecke (Auflage C-11), NICHT in dieser
-- Migration behoben: Weder die Matrix (`consent.zweck_subjekt`) noch
-- `consent.einwilligung` fuehren heute eine `rolle`-Dimension, und eine
-- Erweiterung ist eine eigenstaendige, `database-lead`/
-- `compliance-director`-pruefbeduerftige Entscheidung, kein Nebenprodukt
-- einer Ingest-Gate-Migration.
--
-- WG-FALL (mehrere gleichzeitig aktive Anschlussnutzer an DERSELBEN
-- Messstelle): Das Datenmodell schliesst das nicht aus (die EXCLUDE-
-- Constraint aus V0002 gilt nur je (anschlussnutzer_id, system_id), nicht
-- je system_id allein). Fail-closed heisst hier: JEDER aktive Anschluss-
-- nutzer braucht eine wirksame Rechtsgrundlage, nicht irgendeiner — dasselbe
-- Prinzip, das `stammdaten-resource-attributes.provider.ts` fuer denselben
-- Fall bereits dokumentiert ("MUSS das fail-closed behandeln, KEIN stilles
-- LIMIT 1").
--
-- Fehlt fuer (Zweck, Subjektart) ein Matrix-Eintrag ueberhaupt (sollte nach
-- V0047 nicht vorkommen, ist aber kein struktureller Ausschluss), liefert
-- die Funktion `false` — keine feststellbare Rechtsgrundlage ist das
-- restriktive, nicht das nachsichtige Ergebnis.
--
-- =====================================================================
-- Auflage C-3 — `vertraglich` und `opt_out` sind GETRENNTE Zweige
-- =====================================================================
-- Die erste Fassung fasste beide Erlaubnismodi in einer Bedingung
-- zusammen ("IN ('vertraglich', 'opt_out') THEN true") und nannte das
-- "generisch gehalten". Das war falsch etikettiert: `opt_out` bedeutet
-- "wirkt, BIS widersprochen wird" (V0047, A12-6) — die Funktion muesste
-- dafuer `consent.widerspruch` (V0052) auswerten, tut es aber nicht. Heute
-- ist der Zweig fuer `messdaten_verarbeitung` unerreichbar (die Matrix fuehrt
-- fuer diesen Zweck kein `opt_out`), aber generischer Code, der eine
-- Tabelle stillschweigend uebergeht, wird an dem Tag falsch, an dem jemand
-- die Matrix aendert. Beide Subjekt-Zweige (Anschlussnutzer UND Endkunde)
-- behandeln `opt_out` deshalb JETZT explizit und fail-closed als `false`,
-- mit Verweis auf die fehlende Implementierung — nicht als Synonym fuer
-- `vertraglich`.
--
-- =====================================================================
-- Auflage C-7 — der Verarbeitungsstatus der betroffenen Person
-- =====================================================================
-- Nachgetragen am 2026-09-17. Die erste Fassung gab `true` zurueck, sobald
-- die `energy.endkunde`-Zeile existierte — also auch fuer jemanden, dessen
-- Daten nach Art. 17 bereits krypto-geschreddert sind. Der lit.-b-Zweig
-- besteht kraft VERTRAG, und der endet mit der Loeschung; die Funktion
-- behauptete einen fortbestehenden Vertrag, den sie nie geprueft hat.
-- Einzelheiten an der Pruefstelle im Funktionskoerper.
--
-- =====================================================================
-- A12-18/A12-19 — Review-Stand
-- =====================================================================
-- `.claude/rules/database-migrations.md` verlangt `database-lead` +
-- `compliance-director` vor Merge. Das `compliance-director`-Votum liegt vor
-- (2026-09-16, freigegeben mit Auflagen; C-1 bis C-5 und C-7 sind darin
-- umgesetzt). Das `database-lead`-Review steht zum Zeitpunkt des Merges
-- AUS und ist nachzuholen — festgehalten, statt es durch Schweigen als
-- erteilt erscheinen zu lassen.

-- =====================================================================
-- (1) Owner-Rolle fuer die Gate-Funktion (A12-11, D-A6-OWNER-Muster)
-- =====================================================================
DO $$ BEGIN
    CREATE ROLE edms_consent_gate_owner NOLOGIN;  -- Owner DIESER EINEN Funktion, sonst nichts
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_consent_gate_owner existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

-- Nur lesen, was die Funktion unten tatsaechlich braucht -- spaltenscharf,
-- analog V0023/V0042.
GRANT USAGE ON SCHEMA energy TO edms_consent_gate_owner;
GRANT SELECT (id, system_id)   ON energy.zaehler             TO edms_consent_gate_owner;
GRANT SELECT (id, endkunde_id) ON energy.system              TO edms_consent_gate_owner;
-- Auflage C-7: der Verarbeitungsstatus der betroffenen Person. Spaltenscharf
-- -- die Funktion braucht die Kennung und den Status, sonst nichts aus diesen
-- beiden Tabellen (beide tragen PII).
GRANT SELECT (id, verarbeitungs_status) ON energy.endkunde         TO edms_consent_gate_owner;
GRANT SELECT (id, verarbeitungs_status) ON energy.anschlussnutzer  TO edms_consent_gate_owner;
GRANT SELECT (system_id, anschlussnutzer_id, gueltig_von, gueltig_bis)
                                ON energy.nutzungsverhaeltnis TO edms_consent_gate_owner;

GRANT USAGE ON SCHEMA consent TO edms_consent_gate_owner;
GRANT SELECT (zweck_code, subjekt_typ, erlaubnismodus)
                                ON consent.zweck_subjekt      TO edms_consent_gate_owner;
GRANT SELECT (endkunde_id, anschlussnutzer_id, zweck_code, erteilt_at, widerrufen_at)
                                ON consent.einwilligung       TO edms_consent_gate_owner;

-- Auflage C-1: NUR fuer den Moment der Eigentumsuebertragung unten (Abschnitt
-- (2)) -- unmittelbar danach wieder entzogen. Kein STAENDIGES CREATE-Recht
-- auf `consent` fuer diese Rolle.
GRANT CREATE ON SCHEMA consent TO edms_consent_gate_owner;

-- =====================================================================
-- (2) Die Gate-Funktion selbst
-- =====================================================================
-- Signatur GEAENDERT gegenueber der ersten Fassung (Auflage C-2/B-1):
-- `p_verarbeitungszeitpunkt` ENTFERNT. Die Funktion bildet `now()` selbst.
CREATE FUNCTION consent.ingest_rechtsgrundlage_wirksam(
    p_zaehler_id uuid
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = consent, pg_temp AS $$
DECLARE
    c_zweck_code  CONSTANT text := 'messdaten_verarbeitung';  -- A12-15: fest, kein Parameter
    v_system_id   uuid;
    v_endkunde_id uuid;
    v_modus_an    text;      -- erlaubnismodus fuer (Zweck, anschlussnutzer)
    v_modus_ek    text;      -- erlaubnismodus fuer (Zweck, endkunde)
    v_status_ek   text;      -- energy.endkunde.verarbeitungs_status (Auflage C-7)
    v_hat_nutzer  boolean;
    v_alle_an_ok  boolean;
BEGIN
    SELECT s.id, s.endkunde_id, ek.verarbeitungs_status
      INTO v_system_id, v_endkunde_id, v_status_ek
      FROM energy.zaehler z
      JOIN energy.system s   ON s.id  = z.system_id
      JOIN energy.endkunde ek ON ek.id = s.endkunde_id
     WHERE z.id = p_zaehler_id;

    IF NOT FOUND THEN
        RETURN false;  -- Zaehler nicht aufloesbar: keine Rechtsgrundlage feststellbar (fail-closed).
    END IF;

    -- =================================================================
    -- Auflage C-7 (compliance-director-Votum 2026-09-16)
    -- =================================================================
    -- Ein geloeschter Endkunde hat KEINE Rechtsgrundlage. Bis hierhin gab
    -- die Funktion `true` zurueck, sobald die `energy.endkunde`-Zeile
    -- existierte -- also auch fuer jemanden, dessen Daten nach Art. 17 bereits
    -- krypto-geschreddert sind. Der lit.-b-Zweig besteht kraft VERTRAG, und
    -- der endet mit der Loeschung; die Funktion behauptete einen
    -- fortbestehenden Vertrag, den sie nie geprueft hat.
    --
    -- `gesperrt` ist ausdruecklich KEIN Ausschluss: Art. 18 Abs. 2 nimmt die
    -- SPEICHERUNG von der Einschraenkung aus (Hausposition DSFA-0001 §14.3
    -- Schritt 1). Der Ingest-Schreibpfad ist Erhebung und Speicherung; jede
    -- weitergehende Verarbeitung ist ohnehin gesperrt (Berechnungslauf ueber
    -- den V0023-Trigger, Nachweis ueber FJ-07b/c). Die Messwerte LIEGEN dann
    -- nur, und das ist zulaessig.
    --
    -- Offen und hier bewusst NICHT entschieden: Bei Sperrgrund Art. 18
    -- Abs. 1 lit. b/d ist die fortgesetzte NEUerhebung mehr als die
    -- Speicherung bereits gehaltener Daten. Art. 18 verbietet sie nicht, aber
    -- sie braucht eine bewusste Entscheidung im Einschraenkungs-Vorgang
    -- (Auflage C-8) -- keine stille Fortsetzung durch diese Funktion.
    IF v_status_ek = 'geloescht' THEN
        RETURN false;
    END IF;

    SELECT zs.erlaubnismodus INTO v_modus_an
      FROM consent.zweck_subjekt zs
     WHERE zs.zweck_code = c_zweck_code AND zs.subjekt_typ = 'anschlussnutzer';

    SELECT zs.erlaubnismodus INTO v_modus_ek
      FROM consent.zweck_subjekt zs
     WHERE zs.zweck_code = c_zweck_code AND zs.subjekt_typ = 'endkunde';

    IF v_modus_an IS NULL OR v_modus_ek IS NULL THEN
        RETURN false;  -- kein Matrix-Eintrag -> keine Rechtsgrundlage bekannt (fail-closed).
    END IF;

    -- Aktive Nutzungsverhaeltnisse (Mietfall, DS-07 -- s. aber C-4a-Hinweis
    -- am Dateikopf: `rolle` wird bewusst NICHT gelesen, offene Luecke fuer
    -- `eigentuemer_selbstnutzer`) GENAU JETZT (`now()`, A12-12) -- NIE zu
    -- `ts`, NIE zu einem Parameter. WG-Fall (A12-16/17): `bool_and(...)`
    -- verlangt eine wirksame Rechtsgrundlage fuer JEDEN aktiven
    -- Anschlussnutzer, nicht fuer irgendeinen.
    --
    -- Auflage C-3: `vertraglich` und `opt_out` sind GETRENNTE Zweige.
    -- `opt_out` liefert fail-closed `false` -- NICHT implementiert, s.
    -- `consent.widerspruch`/V0052 (diese Funktion wertet keinen Widerspruch
    -- aus). Fuer `messdaten_verarbeitung` fuehrt die Matrix (V0047) heute
    -- kein `opt_out`; dieser Zweig ist derzeit unerreichbar, bleibt aber
    -- explizit statt stillschweigend uebergangen.
    --
    -- Auflage C-7, zweite Haelfte: Ein GELOESCHTER Anschlussnutzer traegt
    -- keine Rechtsgrundlage, gleich welchen Erlaubnismodus die Matrix fuehrt.
    -- Der `an.verarbeitungs_status <> 'geloescht'`-Term steht INNERHALB des
    -- `bool_and`, nicht als Filter im WHERE: Ein geloeschter Nutzer soll den
    -- Zaehler BLOCKIEREN, nicht aus der Betrachtung fallen. Wuerde er
    -- herausgefiltert, bliebe bei einer WG aus zwei Personen -- einer aktiv,
    -- einer geloescht -- nur der aktive uebrig, und das Gate liesse die
    -- Messung durch, obwohl an derselben Messstelle die Daten einer Person
    -- erhoben wuerden, deren Verarbeitung beendet ist. Dieselbe Fail-closed-
    -- Linie wie beim WG-Fall selbst (A12-16/17).
    SELECT count(*) > 0,
           bool_and(
               an.verarbeitungs_status <> 'geloescht'
               AND CASE v_modus_an
                   WHEN 'vertraglich' THEN true
                   WHEN 'opt_out'     THEN false
                   WHEN 'opt_in'      THEN EXISTS (
                       SELECT 1 FROM consent.einwilligung e
                        WHERE e.anschlussnutzer_id = n.anschlussnutzer_id
                          AND e.zweck_code = c_zweck_code
                          AND e.erteilt_at <= now()
                          AND (e.widerrufen_at IS NULL OR e.widerrufen_at > now())
                   )
               END
           )
      INTO v_hat_nutzer, v_alle_an_ok
      FROM energy.nutzungsverhaeltnis n
      JOIN energy.anschlussnutzer an ON an.id = n.anschlussnutzer_id
     WHERE n.system_id = v_system_id
       AND n.gueltig_von <= now()
       AND (n.gueltig_bis IS NULL OR n.gueltig_bis > now());

    IF v_hat_nutzer THEN
        RETURN COALESCE(v_alle_an_ok, false);
    END IF;

    -- Kein aktives Nutzungsverhaeltnis: der Endkunde selbst ist Subjekt
    -- (V0047: messdaten_verarbeitung/endkunde = vertrag_art6_1b/vertraglich,
    -- nicht widerrufbar -- die Rechtsgrundlage besteht kraft Vertrag, sobald
    -- der Endkunde ueberhaupt existiert, bereits oben durch den JOIN
    -- sichergestellt). Auflage C-3: `opt_out` auch hier EIGENER, fail-closed
    -- Zweig -- nicht mit `vertraglich` zusammengefasst.
    RETURN CASE v_modus_ek
        WHEN 'vertraglich' THEN true
        WHEN 'opt_out'     THEN false
        WHEN 'opt_in'      THEN EXISTS (
            SELECT 1 FROM consent.einwilligung e
             WHERE e.endkunde_id = v_endkunde_id
               AND e.zweck_code = c_zweck_code
               AND e.erteilt_at <= now()
               AND (e.widerrufen_at IS NULL OR e.widerrufen_at > now())
        )
    END;
END;
$$;

-- Auflage C-1 (zweiter Befund): ADMIN OPTION (automatisch seit `CREATE
-- ROLE` oben, PostgreSQL 16) reicht fuer `ALTER ... OWNER TO` NICHT --
-- erforderlich ist zusaetzlich die Faehigkeit, per SET ROLE zu wechseln.
-- CURRENT_USER = die migrations-fuehrende Rolle selbst; sie hat ADMIN
-- OPTION auf die eben erzeugte Rolle und darf sich damit dieses Zusatz-
-- Recht selbst gewaehren. NICHT wieder entzogen, s. Migrations-Kopf.
GRANT edms_consent_gate_owner TO CURRENT_USER WITH SET TRUE;

-- Auflage C-1 (erster Befund): Eigentumsuebertragung -- ERFORDERT zusaetzlich
-- das GRANT CREATE oben.
ALTER FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid)
    OWNER TO edms_consent_gate_owner;

-- Sofort wieder entziehen -- die Rolle braucht CREATE nur fuer den Moment
-- der Eigentumsuebertragung, nicht dauerhaft (Auflage C-1, Haertung ueber
-- das Minimum hinaus: ein kompromittierter Funktionskoerper koennte sonst
-- per `CREATE TABLE consent.irgendwas` weitere Objekte im Schema anlegen).
REVOKE CREATE ON SCHEMA consent FROM edms_consent_gate_owner;

REVOKE EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) FROM PUBLIC;

COMMENT ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) IS
  'ADR-0012 E5/Stufe C, Auflagen A12-11..A12-19 + Nachbesserung C-1..C-5, C-7. Einziger Zugriffsweg des Ingest-Workers auf die Rechtsgrundlagen-Frage: liefert boolean, nie eine Zeile aus consent.*. SECURITY DEFINER (Owner edms_consent_gate_owner) -- der Worker selbst haelt KEIN Tabellen-Grant auf consent.* oder energy.nutzungsverhaeltnis. Bewertet IMMER gegen now() (Funktion nimmt KEINEN Zeitpunkt-Parameter entgegen, C-2) -- ein Backfill ueber einen Widerruf hinweg liefert false, und ein Widerruf zwischen Aufruf-Vorbereitung und Aufruf wirkt sofort. Zweck ist FEST messdaten_verarbeitung (kein Parameter, A12-15). `opt_out` liefert in beiden Subjekt-Zweigen fail-closed false (C-3, nicht implementiert). Ein GELOESCHTER Endkunde oder Anschlussnutzer (verarbeitungs_status) liefert false, ein GESPERRTER nicht -- Art. 18 Abs. 2 nimmt die Speicherung aus (C-7). Liest energy.nutzungsverhaeltnis.rolle NICHT -- bekannte, offene Luecke fuer eigentuemer_selbstnutzer (C-4a/C-11, s. Migrations-Kopf). NICHT scharf geschaltet, solange ConsentEnforcementConfig.enforced=false (Default) -- s. src/backend/src/ingest-worker/config/consent-enforcement.config.ts.';

-- =====================================================================
-- (3) Rechte fuer den Worker (A12-11: NUR EXECUTE, KEIN Tabellen-Grant)
-- =====================================================================
-- USAGE auf dem Schema ist KEIN Tabellen-Grant -- es macht die Funktion nur
-- ueberhaupt namentlich aufrufbar (dasselbe Prinzip wie `GRANT USAGE ON
-- SCHEMA energy` in V0010, das ebenfalls kein einziges Tabellenrecht
-- einschliesst). `edms_ingest_worker` bekommt hier WEDER SELECT noch
-- irgendein anderes Recht auf eine einzige Tabelle in `consent.*` oder auf
-- `energy.nutzungsverhaeltnis`.
GRANT USAGE   ON SCHEMA consent                                     TO edms_ingest_worker;
GRANT EXECUTE ON FUNCTION consent.ingest_rechtsgrundlage_wirksam(uuid) TO edms_ingest_worker;

-- KEIN GRANT auf consent.zweck, consent.zweck_subjekt, consent.text_version,
-- consent.einwilligung oder energy.nutzungsverhaeltnis fuer edms_ingest_worker.
-- KEIN GRANT auf audit.append_event fuer edms_ingest_worker (diese Migration
-- schreibt keine Audit-Ereignisse, s. Datei-Kopf A12-13/C-4c -- und selbst
-- wenn: niemals das generische audit.append_event direkt, s. Security-
-- Review-Befund zu V0079, sondern ausschliesslich ueber eine zweckgebundene
-- Wrapper-Funktion mit im Funktionskoerper fest verdrahtetem event_typ/
-- actor_typ/actor_sub).

-- =====================================================================
-- VERIFIKATIONSNOTIZ (Auflage C-1, Muster V0023) — TATSAECHLICH DURCHGEFUEHRT
-- =====================================================================
-- Angewendet UND zurueckgebaut gegen `timescale/timescaledb:2.15.3-pg16-oss`
-- (Testcontainers, identisches Image wie die uebrigen Integrationstests des
-- Repos) unter einer eigens angelegten Rolle `edms_migration_test_role`
-- (LOGIN, CREATEROLE, Eigentuemerin der Test-Datenbank -- explizit NICHT
-- SUPERUSER), die die GESAMTE Kette V0001..V0084 angewendet hat (nicht nur
-- diese Datei -- die vorherigen Migrationen legen die Tabellen/Rollen an,
-- auf denen diese Datei GRANT-Anweisungen erteilt, und ein GRANT auf eine
-- fremde Tabelle verlangt Eigentum/WITH GRANT OPTION auf ebendiese Tabelle).
-- Ergebnis: alle Up-Migrationen angewendet, V0084 zusaetzlich zurueck- und
-- wieder hochgerollt, alle C-13-/A12-11-/C-7-Testfaelle gruen. Test:
-- `src/backend/src/ingest-worker/persistence/
-- consent-ingest-rechtsgrundlage-gate.integration.spec.ts`.
--
-- ZWEI Befunde dieser Migration BESTAETIGT (beide oben im Dateikopf unter
-- "Auflage C-1" dokumentiert und in dieser Fassung behoben):
--   1. Ohne das `GRANT CREATE ON SCHEMA consent ...`/`REVOKE CREATE ...`-
--      Paar (Abschnitt (1)/(2)) schlaegt `ALTER FUNCTION ... OWNER TO
--      edms_consent_gate_owner` mit "permission denied for schema consent"
--      fehl (der im Votum benannte Befund).
--   2. Ohne das zusaetzliche `GRANT edms_consent_gate_owner TO CURRENT_USER
--      WITH SET TRUE;` (Abschnitt (2), unmittelbar vor der Eigentums-
--      uebertragung) schlaegt dieselbe Anweisung STATTDESSEN mit "must be
--      able to SET ROLE edms_consent_gate_owner" fehl -- ADMIN OPTION
--      (automatisch seit PostgreSQL 16 bei `CREATE ROLE`) deckt das NICHT.
--      Dieser zweite Befund war im urspruenglichen Votum noch nicht benannt
--      und wurde erst bei der tatsaechlichen Testcontainer-Verifikation
--      sichtbar.
--
-- EIN DRITTER, SEPARATER Befund — NICHT durch diese Migration behoben, weil
-- ausserhalb ihres Geltungsbereichs, INZWISCHEN ABER ADRESSIERT: Drei
-- PRE-EXISTIERENDE Migrationen (V0003 `edms_audit_owner`, V0019
-- `edms_analytics_owner`, V0025 `edms_nachweis_owner`) fuehren `ALTER ...
-- OWNER TO <rolle>` aus, OHNE sich selbst das og. SET-Recht zu gewaehren,
-- und wuerden deshalb unter einer echten, nicht-superuser Migrationsrolle
-- EBENFALLS mit "must be able to SET ROLE ..." scheitern. Sie sind
-- angewendet und damit unveraenderlich (Pruefsummen-Drift), und eine
-- SPAETERE Migration kaeme zu spaet: Jede Datei laeuft in EINER Transaktion,
-- ein Fehler rollt das `CREATE ROLE` derselben Datei mit zurueck, und ein
-- nachtraegliches GRANT liefe ins Leere. Die Rechte muessen deshalb VOR dem
-- Lauf stehen -- dafuer gibt es seit dem 2026-09-17
-- `tools/db/bootstrap-owner-rollen.sh` (dokumentiert im `up`-Abschnitt von
-- `tools/migrate/README.md`). Der Test-Support
-- (`ingest-worker/test-support/migration-role.test-support.ts`,
-- `preCreateKnownOwnerRolesWithSetOption`) bildet genau diesen Schritt nach;
-- ein Driftschutz-Test haelt beide Rollenlisten deckungsgleich.
--
-- `bool_and(EXISTS(korrelierte Unterabfrage))` (Abschnitt (2)) ist als
-- Aggregat ueber eine je Zeile ausgewertete korrelierte Unterabfrage
-- gueltiges PostgreSQL (die Unterabfrage referenziert `n` aus der
-- umgebenden `FROM energy.nutzungsverhaeltnis n`-Klausel und wird VOR der
-- Aggregation je Zeile ausgewertet) -- durch das WG-Testszenario (zwei
-- Anschlussnutzer, einer widerruft) im Integrationstest empirisch bestaetigt.
