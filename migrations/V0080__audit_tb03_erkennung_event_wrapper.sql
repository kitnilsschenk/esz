-- V0080__audit_tb03_erkennung_event_wrapper.sql
--
-- Nachbesserung eines High-Befunds aus dem `security-lead`-Review zu V0079
-- (2026-09-16). Der Befund ist bereits verifiziert -- diese Migration behebt
-- ihn, sie weist ihn nicht erneut nach.
--
-- Teil 1 von 3. Die Nachbesserung zerfaellt in drei Aenderungen mit drei
-- verschiedenen Pruef-Zustaendigkeiten, und sie stehen deshalb in drei
-- Dateien:
--   V0080 (diese) -- Sicherheit: der zu breite Audit-Schreibpfad.
--   V0081         -- Least Privilege: spaltenscharfes SELECT auf
--                    `einfluss.befund`, ueber den Befund hinausgehend.
--   V0082         -- Dokumentation: Semantik von `zeitraum_bis`.
-- Wer den Sicherheitsbefund zurueckbauen will, soll nicht gleichzeitig eine
-- Dokumentationsverbesserung verlieren.
--
-- =====================================================================
-- DER BEFUND
-- =====================================================================
-- V0079 (D-GRANT-ERW (b)) erteilte `edms_einfluss_erkennung` `EXECUTE ON
-- audit.append_event(text, text, text, text, text, uuid, jsonb, uuid, uuid,
-- smallint)` -- der generischen, `SECURITY DEFINER`-Funktion aus V0003:767,
-- die JEDEN aktiven Event-Typ mit JEDEM `actor_sub`/`actor_typ`/`objekt_ref`/
-- `ergebnis` schreiben kann. PostgreSQL kennt keine argumentscharfen GRANTs:
-- die Rolle konnte damit -- entgegen der Absicht, ihr genau ZWEI TB-03-
-- Event-Codes zu erlauben (V0021 (11)/(12)) -- z. B. auch
-- `endkunde.pii.einsicht` mit einem FREI GEWAEHLTEN `actor_sub` schreiben.
-- Der DB-Trigger (`audit.event_seal()`, V0003:632) prueft Event-Typ,
-- Kontext-Whitelist und Zeitfenster, aber NICHT, ob die aufrufende DB-Rolle
-- zu diesem Event-Typ passt -- das war nie seine Aufgabe, und nichts anderes
-- hat sie uebernommen.
--
-- Der Code (`Tb03BefundRepository`) ruft diese Funktion heute nur mit den
-- zwei zulaessigen Codes auf -- aber das GRANT ist die Sicherheitsgrenze,
-- nicht der Code. Wird der Host kompromittiert, der `tb03-erkennung-main.js`
-- ausfuehrt (ein unbeaufsichtigter Batch, V0079-Kopf: "die exponierteste
-- Komponente"), kann ein Angreifer beliebige Audit-Ereignisse faelschen.
-- `event_seal()` versiegelt die Faelschung unwiderruflich in der Hash-Kette;
-- `audit.event` hat `REVOKE UPDATE, DELETE` (V0003:1067). Sie waere danach so
-- vertrauenswuerdig wie jedes echte Ereignis und NIE korrigierbar -- das
-- untergraebt die Rechenschaftsfunktion, fuer die V0003 den Aufwand getrieben
-- hat (Art. 5 Abs. 2 DSGVO, ISO 27001 A.8.15).
--
-- =====================================================================
-- DIE KORREKTUR
-- =====================================================================
-- Zwei schmale `SECURITY DEFINER`-Wrapper-Funktionen ersetzen das generische
-- Grant -- eine je zulaessigem TB-03-Event-Code. `event_typ`, `actor_typ`,
-- `actor_sub` UND `ergebnis` sind im Funktionskoerper FEST VERDRAHTET, nicht
-- Parameter: der Aufrufer kann sie nicht mehr waehlen, nur noch die
-- fachlichen Werte liefern, die die beiden Kontext-Whitelists aus V0021
-- ohnehin verlangen. `ergebnis='ok'` ist mit verdrahtet, weil beide
-- Aufrufstellen in `Tb03BefundRepository` diesen Wert schon heute hart
-- codiert uebergeben (`tb03-erkennung.service.ts` kennt keinen Fehlerpfad,
-- der ein Audit-Ereignis schreibt) -- eine Verengung ohne Verhaltensaenderung.
--
-- Das Muster ist NICHT neu in diesem Schema: `edms_audit_betrieb` bekommt seit
-- V0003:1109 ebenfalls nur EXECUTE auf schmale Wrapper
-- (`audit.versiegle`/`audit.retention_drop`), nie direkten Zugriff auf
-- `audit.event`. Diese Migration wendet exakt dasselbe Prinzip auf
-- `edms_einfluss_erkennung` an, das V0079 fuer sie ausgelassen hatte.
--
-- A19(b) bleibt gewahrt: Beide Wrapper rufen `audit.append_event(...)` intern
-- auf derselben Verbindung/Transaktion auf wie der `INSERT INTO
-- einfluss.befund` -- der Grund, warum `AuditService`/`edms_app` hier von
-- Anfang an nicht in Frage kam (eine Transaktion kann nicht ueber zwei
-- Verbindungen reichen), aendert sich nicht.

-- =====================================================================
-- (1) Wrapper-Funktionen
-- =====================================================================

-- Deckt `einflussgroesse.stammdaten.einsicht` (V0021 (11)) -- EIN Ereignis
-- je Lauf, unabhaengig vom Ergebnis (A19a, `Tb03BefundRepository.
-- protokolliereEinsicht`). `objekt_ref` bleibt NULL: der Lauf liest ueber
-- mehrere Systeme hinweg, es gibt kein einzelnes Objekt, auf das sich diese
-- Einsicht bezieht (V0021 (11)-Kommentar: "bei Batch-Einsicht:
-- kontext.anzahl_saetze zusaetzlich" -- genau das bildet `p_anzahl_saetze` ab).
CREATE FUNCTION audit.append_tb03_einsicht_event(
    p_anzahl_saetze integer,
    p_synthetic     boolean
) RETURNS audit.event
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    v_row audit.event%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM audit.append_event(
        'einflussgroesse.stammdaten.einsicht',  -- p_event_typ  -- FEST VERDRAHTET
        'system',                               -- p_actor_typ  -- FEST VERDRAHTET (A19)
        'ok',                                   -- p_ergebnis   -- FEST VERDRAHTET (kein Fehlerpfad im Aufrufer)
        'tb03-erkennung-runner',                -- p_actor_sub  -- FEST VERDRAHTET (A19)
        NULL,                                   -- p_actor_rolle -- der Lauf hat keine (V0067)
        NULL,                                   -- p_objekt_ref -- kein Einzelobjekt je Lauf
        jsonb_build_object('synthetic', p_synthetic, 'anzahl_saetze', p_anzahl_saetze),
        NULL,                                   -- p_korrelations_id
        NULL,                                   -- p_event_id
        1::smallint                             -- p_format_version
    );
    RETURN v_row;
END;
$$;

-- Deckt `einflussgroesse.schwellwert.ueberschritten` (V0021 (12)) -- EIN
-- Ereignis je TATSAECHLICH geschriebenem Befund (A19b/A23,
-- `Tb03BefundRepository.schreibeBefunde`). `p_befund_id` wird `objekt_ref`;
-- die uebrigen Parameter bilden GENAU die Kontext-Whitelist aus V0021 (12)
-- ab -- kein Feld mehr, kein Feld weniger. `p_ueberschreitung_klasse` wird
-- zusaetzlich gegen die drei Werte aus dem CHECK auf `einfluss.befund`
-- (V0020:209) geprueft: ein zweiter, hier bewusst redundanter Fail-Closed,
-- weil dieser Wert -- anders als `event_typ`/`actor_typ`/`actor_sub` -- KEIN
-- fest verdrahteter Bestandteil sein kann (er unterscheidet die drei
-- Eskalationsstufen aus B12.5).
CREATE FUNCTION audit.append_tb03_ueberschreitung_event(
    p_befund_id              uuid,
    p_system_id              uuid,
    p_groesse_code           text,
    p_schwellwert_code       text,
    p_zeitraum_von           date,
    p_zeitraum_bis           date,
    p_ueberschreitung_klasse text,
    p_synthetic              boolean
) RETURNS audit.event
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = audit, pg_temp AS $$
DECLARE
    v_row audit.event%ROWTYPE;
BEGIN
    IF p_ueberschreitung_klasse NOT IN
        ('schwelle_ueberschritten', 'deutlich_ueberschritten', 'stark_ueberschritten') THEN
        RAISE EXCEPTION
            'audit.append_tb03_ueberschreitung_event: unzulaessige ueberschreitung_klasse %',
            p_ueberschreitung_klasse;
    END IF;

    SELECT * INTO v_row FROM audit.append_event(
        'einflussgroesse.schwellwert.ueberschritten',  -- p_event_typ -- FEST VERDRAHTET
        'system',                                      -- p_actor_typ -- FEST VERDRAHTET (A19)
        'ok',                                           -- p_ergebnis  -- FEST VERDRAHTET
        'tb03-erkennung-runner',                        -- p_actor_sub -- FEST VERDRAHTET (A19)
        NULL,                                           -- p_actor_rolle
        p_befund_id,                                    -- p_objekt_ref = einfluss.befund.id
        jsonb_build_object(
            'synthetic',              p_synthetic,
            'system_id',              p_system_id,
            'groesse_code',           p_groesse_code,
            'schwellwert_code',       p_schwellwert_code,
            'zeitraum_von',           p_zeitraum_von,
            'zeitraum_bis',           p_zeitraum_bis,
            'ueberschreitung_klasse', p_ueberschreitung_klasse
        ),
        NULL,                                           -- p_korrelations_id
        NULL,                                           -- p_event_id
        1::smallint                                      -- p_format_version
    );
    RETURN v_row;
END;
$$;

-- =====================================================================
-- (2) Ownership -- wie jede SECURITY-DEFINER-Funktion in diesem Schema
-- (Muster V0003:1040-1053): Owner = `edms_audit_owner`, NICHT Superuser.
-- =====================================================================

ALTER FUNCTION audit.append_tb03_einsicht_event(integer, boolean) OWNER TO edms_audit_owner;
ALTER FUNCTION audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean)
    OWNER TO edms_audit_owner;

-- =====================================================================
-- (3) Haertung + Grant-Tausch
-- =====================================================================

-- PostgreSQL vergibt EXECUTE auf neue Funktionen standardmaessig an PUBLIC
-- (V0003:1071-1073 -- ohne dieses REVOKE waeren die folgenden selektiven
-- GRANTs wirkungslos).
REVOKE EXECUTE ON FUNCTION audit.append_tb03_einsicht_event(integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean)
    FROM PUBLIC;

-- Der eigentliche Grant-Tausch: das generische EXECUTE auf `append_event`
-- weicht den beiden Wrappern. `USAGE ON SCHEMA audit` (V0079:281) bleibt
-- unangetastet -- die Rolle braucht es weiterhin, um die Wrapper ueberhaupt
-- aufzurufen.
REVOKE EXECUTE ON FUNCTION audit.append_event(text, text, text, text, text, uuid,
    jsonb, uuid, uuid, smallint) FROM edms_einfluss_erkennung;

GRANT EXECUTE ON FUNCTION audit.append_tb03_einsicht_event(integer, boolean)
    TO edms_einfluss_erkennung;
GRANT EXECUTE ON FUNCTION audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean)
    TO edms_einfluss_erkennung;
