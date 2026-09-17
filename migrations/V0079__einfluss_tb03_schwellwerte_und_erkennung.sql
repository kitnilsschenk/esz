-- V0079__einfluss_tb03_schwellwerte_und_erkennung.sql
--
-- Schliesst die ERKENNUNGS-Haelfte von E-9 (Projektdokumentation Teil II):
-- die TB-03-Schwellwerte kommen in den Katalog, `einfluss.befund` wird
-- belegfaehig, und der Erkennungslauf bekommt eine eigene Rolle. Der
-- ANZEIGE-Vorgang selbst (Frist, `anzeige_status`, Meldung an die
-- Bewilligungsbehoerde) bleibt ausdruecklich drausssen -- ADR-0006:54:
-- "v1 liefert nur die Datengrundlage und einen Schwellwert-Report, kein
-- Vorgang, keine Frist". Diese Migration aendert daran NICHTS.
--
-- Grundlage: `compliance-director`-Votum vom 2026-09-16 zur TB-03-
-- Schwellwert-Erkennung -- KEIN VETO, 16 bindende Auflagen A11-A26
-- (Fortsetzung der ADR-0006-Zaehlung: A1-A5 Phase 3, A6-A10 Phase 5).
-- Umgesetzt sind hier A11, A12, A13, A20, A23, A25; die uebrigen sind
-- App-/Doku-Scope und stehen im Runner bzw. im Nachtragspaket zu A26.
--
-- User-Entscheidungen vom 2026-09-16 (Anlass dieser Migration):
--   (1) Bezugswert = Wert zum ENDE des Baseline-Erhebungszeitraums,
--       NICHT das unmittelbar vorhergehende Intervall (A16).
--   (2) Auslösung = eigenstaendiger Runner, NICHT `pg_cron`. Grund ist
--       nicht Geschmack, sondern Verfuegbarkeit: `pg_cron` ist im
--       Ziel-Image nicht vorhanden und braucht `shared_preload_libraries`
--       plus Server-Neustart (V0012, Zeilen 65-105). Das Repo hat fuer
--       genau diesen Fall ein Muster -- `retention-main.ts`.
--   (3) Umfang = DREI Groessen (`personenanzahl`, `nutzflaeche`,
--       `nutzungszweck`). S. D-UMFANG.
--   (4) Die Erkennungsrolle wird angelegt UND tatsaechlich verdrahtet
--       (A20), nach dem Muster des Ingest-Workers -- nicht als
--       dokumentierte, aber wirkungslose Rolle.
--
-- Design-Owner: database-lead. Review vor Merge: technical-director,
-- compliance-director (A11/A12/A20/A23-Umsetzung sowie die unter
-- D-GRANT-ERW ueber den Wortlaut von A20 hinaus ergaenzten zwei Grants).
--
-- =====================================================================
-- (D-UMFANG) WARUM NUR DREI DER FUENF TB-03-GROESSEN (A25)
-- =====================================================================
-- `geraeteabschaffung`: TB-03 misst sie an "≥ 10 % des JAHRESVERBRAUCHS".
--   Das ist eine Energiegroesse; sie steht nicht in `einfluss.intervall`,
--   und der Katalog fuehrt die Groesse als `codiert` ohne Einheit (V0020).
--   Maschinelle Ueberwachung braucht hier zuerst eine fachliche Festlegung,
--   WER diesen Anteil bestimmt -- offen, daher `tb03_schwellwert` NULL.
-- `energietraeger_mix`: NICHT unabgedeckt, sondern bewusst ueber einen
--   anderen Pfad abgedeckt -- ADR-0007 B14 hat dafuer das manuelle
--   Kennzeichen am Messkonzept gewaehlt (V0029,
--   `SubstitutionErkennungService`). Eine zweite Erkennung waere genau der
--   "zweite, divergierende Erkennungspfad", den jener Service ausschliesst.
--
-- A25, woertlich und bindend: `tb03_schwellwert IS NULL` bedeutet "NICHT
-- MASCHINELL UEBERWACHT" -- NIEMALS "nie ueberschritten". Jede Auswertung,
-- die aus einer NULL-Schwelle Beschwerdefreiheit ableitet, liest den
-- Katalog falsch.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- (1) A12 `befund.schwellwert_code` -> (2) A11 CHECK auf den Katalog ->
-- (3) A13 Seed der drei Regeln -> (4) A23 Idempotenz-Index ->
-- (5) A20 Rolle + GRANTS.

-- =====================================================================
-- (1) A12 -- `einfluss.befund.schwellwert_code`
-- =====================================================================
-- BEFUND des Votums, hier geschlossen: `V0021:241` whitelistet fuer das
-- Audit-Ereignis `einflussgroesse.schwellwert.ueberschritten` den
-- Kontext-Key `schwellwert_code` -- `einfluss.befund` hatte aber nie eine
-- solche Spalte (V0020:200-210). Der Audit-Kontext waere damit nicht aus
-- persistierten Daten belegbar gewesen: das Ereignis haette eine Zahl
-- behauptet, die nirgends steht.
--
-- `NOT NULL` OHNE DEFAULT ist hier Absicht und fail-closed: Die Tabelle ist
-- leer, weil es nie einen Erkennungspfad gab (der einzige Schreibpfad
-- entsteht mit dieser Migration). Existierten wider Erwarten Zeilen, bricht
-- diese Anweisung -- das ist der gewuenschte laute Fehlschlag, nicht ein
-- stilles Auffuellen mit einem erfundenen Code.
ALTER TABLE einfluss.befund
    ADD COLUMN schwellwert_code text NOT NULL;

COMMENT ON COLUMN einfluss.befund.schwellwert_code IS
  'pii=false; A13 -- traegt die FASSUNG im Code selbst (Muster tb03.<groesse>.<regel>.v<jahr>). Ein Befund ist damit dauerhaft der Schwellwertfassung zuordenbar, gegen die er entstanden ist; nach Abschluss von O-3 (Merkblattfassung zum 28.06.2018) entsteht bei Abweichung ein NEUER Code, Altbefunde bleiben unangetastet (A14).';

-- =====================================================================
-- (2) A11 -- Pflichtschluessel in `tb03_schwellwert`
-- =====================================================================
-- Ohne Fassungskennzeichnung waere nach einer Korrektur aus O-3 nicht mehr
-- feststellbar, gegen welche Schwelle ein Altbefund entstanden ist -- ein
-- stilles Umdeuten von Nachweisartefakten. Der CHECK erzwingt deshalb die
-- Herkunft, nicht nur den Wert.
--
-- Bewusst OHNE die jsonb-Operatoren `?`/`?&`: Ein `?` im Migrationstext ist
-- in zu vielen Werkzeugketten ein Parameter-Platzhalter. `->> ... IS NOT
-- NULL` prueft hier dasselbe (Schluessel vorhanden UND nicht JSON-null) und
-- liest sich ohne Kenntnis der Operator-Tabelle.
ALTER TABLE einfluss.katalog
    ADD CONSTRAINT ck_katalog_tb03_schwellwert_herkunft CHECK (
        tb03_schwellwert IS NULL
        OR (
            -- Herkunft (A11/A13) -- ohne diese vier ist die Regel nicht belegbar.
            tb03_schwellwert->>'schwellwert_code'    IS NOT NULL
            AND tb03_schwellwert->>'fassung'         IS NOT NULL
            AND tb03_schwellwert->>'quelle'          IS NOT NULL
            AND tb03_schwellwert->>'kapitel'         IS NOT NULL
            -- Fassungsvorbehalt (A11) -- solange O-3 offen ist, MUSS er mitlaufen.
            AND tb03_schwellwert->>'fassungsvorbehalt' IS NOT NULL
            -- Regelform.
            AND tb03_schwellwert->>'art' IN ('prozent', 'dauer')
            -- Bezugspunkt (A16): in v1 ausschliesslich das Baseline-Ende.
            -- Ein zweiter Bezugsmassstab waere ein zweiter, undokumentierter
            -- Erkennungsbegriff -- der CHECK schliesst ihn strukturell aus.
            AND tb03_schwellwert->>'bezug' = 'baseline_ende'
            -- Dauerbedingung: TB-03 kennt keine Regel ohne Mindestdauer.
            -- `dauer_vergleich` traegt die im Merkblatt WOERTLICH
            -- unterschiedliche Strenge ("ueber > 1/2 Jahr" vs. "≥ 6 Monate").
            AND tb03_schwellwert->>'mindestdauer_monate' IS NOT NULL
            AND tb03_schwellwert->>'dauer_vergleich' IN ('gt', 'gte')
            -- Prozentregeln brauchen zusaetzlich Hoehe, Einheit und Strenge.
            AND (
                tb03_schwellwert->>'art' <> 'prozent'
                OR (
                    tb03_schwellwert->>'wert'      IS NOT NULL
                    AND tb03_schwellwert->>'einheit'  IS NOT NULL
                    AND tb03_schwellwert->>'vergleich' IN ('gt', 'gte')
                )
            )
        )
    );

-- =====================================================================
-- (3) A13 -- Seed der drei Regeln
-- =====================================================================
-- FASSUNGSVORBEHALT (A11/A14, Projektdokumentation 0.4 + Teil II O-3):
-- Diese Zahlen stammen aus dem Merkblatt Technik v2.2 (Stand 12.09.2022).
-- Massgeblich ist jedoch die Fassung zum Zeitpunkt der ANTRAGSTELLUNG
-- (28.06.2018) -- sie ist noch nicht beschafft. Der Seed ist dennoch
-- zulaessig (Votum F1), weil ein Befund in v1 KEINE Erklaerung gegenueber
-- der Bewilligungsbehoerde erzeugt (ADR-0006:54): eine falsche Fassung
-- fuehrt zu einem internen Report mit falscher Trefferquote, nicht zu einer
-- Falschangabe im Nachweis. `fassungsvorbehalt: true` und die Fassung im
-- `schwellwert_code` halten das an jeder Ausgabestelle sichtbar.
--
-- WOERTLICHE STRENGE, nicht vereinheitlicht (Merkblatt Technik Kap. 2.1.5/
-- 2.2.5, s. `compliance/foerderauflagen/merkblatt-anforderungen.md` TB-03):
--   Personenanzahl  "> 50 %"  ueber "> 1/2 Jahr"   -> vergleich gt,  dauer gt
--   Nutzflaeche     "≥ 10 %"  ueber "> 1/2 Jahr"   -> vergleich gte, dauer gt
--   Nutzungszweck   Aenderung "≥ 6 Monate"         -> art dauer,     dauer gte
-- Die Asymmetrie zwischen ">" und "≥" ist KEINE Nachlaessigkeit der Quelle
-- und wird hier nicht geglaettet: sie entscheidet im Grenzfall ueber eine
-- Anzeigepflicht.

UPDATE einfluss.katalog SET tb03_schwellwert = jsonb_build_object(
    'schwellwert_code',    'tb03.personenanzahl.50pct_halbjahr.v2022',
    'fassung',             'Merkblatt Technik v2.2, Stand 12.09.2022',
    'quelle',              'compliance/foerderauflagen/quellen/esz_merkblatt_technik_v2.2.pdf',
    'kapitel',             '2.2.5',
    'art',                 'prozent',
    'wert',                50,
    'einheit',             'prozent',
    'vergleich',           'gt',
    'bezug',               'baseline_ende',
    'mindestdauer_monate', 6,
    'dauer_vergleich',     'gt',
    'fassungsvorbehalt',   true
) WHERE code = 'personenanzahl';

UPDATE einfluss.katalog SET tb03_schwellwert = jsonb_build_object(
    'schwellwert_code',    'tb03.nutzflaeche.10pct_halbjahr.v2022',
    'fassung',             'Merkblatt Technik v2.2, Stand 12.09.2022',
    'quelle',              'compliance/foerderauflagen/quellen/esz_merkblatt_technik_v2.2.pdf',
    'kapitel',             '2.2.5',
    'art',                 'prozent',
    'wert',                10,
    'einheit',             'prozent',
    'vergleich',           'gte',
    'bezug',               'baseline_ende',
    'mindestdauer_monate', 6,
    'dauer_vergleich',     'gt',
    'fassungsvorbehalt',   true
) WHERE code = 'nutzflaeche';

-- Dauerregel: KEIN `wert`/`einheit`/`vergleich`. Der Ausloeser ist der
-- WECHSEL des `wert_code` gegenueber dem Baseline-Ende, die Schwelle ist
-- allein die Dauer. A21 bindet daran die Klassierung: Dauerregeln werden
-- NICHT eskaliert (s. dort).
UPDATE einfluss.katalog SET tb03_schwellwert = jsonb_build_object(
    'schwellwert_code',    'tb03.nutzungszweck.6monate.v2022',
    'fassung',             'Merkblatt Technik v2.2, Stand 12.09.2022',
    'quelle',              'compliance/foerderauflagen/quellen/esz_merkblatt_technik_v2.2.pdf',
    'kapitel',             '2.1.5/2.2.5',
    'art',                 'dauer',
    'bezug',               'baseline_ende',
    'mindestdauer_monate', 6,
    'dauer_vergleich',     'gte',
    'fassungsvorbehalt',   true
) WHERE code = 'nutzungszweck';

-- `geraeteabschaffung` und `energietraeger_mix` behalten bewusst NULL
-- (D-UMFANG, A25). Kein UPDATE -- die Abwesenheit ist die Aussage.

-- =====================================================================
-- (4) A23 -- Idempotenz strukturell, nicht im Service
-- =====================================================================
-- `einfluss.befund` hat weder UPDATE noch DELETE (V0020:251) -- ein
-- monatlich wiederholter Treffer waere daher dauerhafter Datenmuell UND
-- monatlicher Audit-Laerm (Art. 5 Abs. 1 lit. c). Die Sicherung gehoert
-- deshalb in die DB, nicht in eine Service-Pruefung, die ein zweiter
-- Aufrufer umgehen kann.
--
-- Die Klasse ist BEWUSST Teil des Schluessels: A23 laesst einen weiteren
-- Befund ausdruecklich "nur bei Klassenwechsel" zu. Ohne
-- `ueberschreitung_klasse` im Index wuerde der Index genau den Fall
-- blockieren, den die Auflage erlauben will -- eine Lage, die sich
-- verschaerft (schwelle -> stark), bliebe unsichtbar.
--
-- Kein PARTIELLER Index (das Votum sagt "partiell"): alle fuenf Spalten
-- sind NOT NULL, es gibt keine Teilmenge, die auszunehmen waere. Ein
-- `WHERE`-Zusatz waere hier Dekoration ohne Wirkung.
CREATE UNIQUE INDEX ux_einfluss_befund_idempotenz
    ON einfluss.befund (system_id, groesse_code, zeitraum_von, schwellwert_code, ueberschreitung_klasse);

-- =====================================================================
-- (5) A20 -- eigene Erkennungsrolle
-- =====================================================================
-- WARUM NICHT `edms_einfluss`: Jene Rolle traegt seit V0022:90 DELETE auf
-- `einfluss.intervall` UND `einfluss.befund` -- also Loeschrecht auf
-- Klartext-PII. Ein unbeaufsichtigter Batch unter dieser Rolle widerspricht
-- der im Repo bereits gezogenen Linie "die exponierteste Komponente bekommt
-- kein Loeschrecht" (`compliance/dsgvo/retention-matrix.md:291`). Der
-- Erkennungslauf bekommt daher eine EIGENE, engere Rolle: er liest
-- Einflussgroessen und schreibt Befunde -- mehr nicht.
--
-- `NOLOGIN`-Gruppenrolle, wie jede Betriebsrolle in diesem Repo (V0010
-- `edms_ingest_worker`, V0020 `edms_einfluss`). Die LOGIN-Rolle samt
-- Passwort entsteht ausserhalb der Migration: im Test ueber
-- `test-support/einfluss-erkennung-role.test-support.ts` (Muster:
-- `ingest-worker-role.test-support.ts`), im Betrieb ueber ein
-- devops-lead-Skript mit einem Secret aus dem Vault. Credentials gehoeren
-- nicht in eine Migration -- sie stuenden sonst in der Git-Historie.
DO $$ BEGIN
    CREATE ROLE edms_einfluss_erkennung NOLOGIN;   -- TB-03-Erkennungslauf (A20)
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Rolle edms_einfluss_erkennung existiert bereits (cluster-globales Objekt) -- ueberspringe.';
END $$;

GRANT USAGE ON SCHEMA einfluss TO edms_einfluss_erkennung;

GRANT SELECT ON einfluss.katalog   TO edms_einfluss_erkennung;   -- Regeln lesen
GRANT SELECT ON einfluss.intervall TO edms_einfluss_erkennung;   -- Klartext-PII lesen (A19: je Lauf auditiert)
GRANT INSERT ON einfluss.befund    TO edms_einfluss_erkennung;   -- Befunde schreiben

-- KEIN UPDATE, KEIN DELETE auf irgendeiner Tabelle dieses Schemas -- das ist
-- der eigentliche Zweck dieser Rolle (A20). PostgreSQL vergibt UPDATE-/
-- DELETE-Rechte nicht per Default, das Unterlassen des GRANTs genuegt
-- (V0010-Kommentar zum PUBLIC-Default).

-- ---------------------------------------------------------------------
-- (D-GRANT-ERW) UEBER DEN WOERTLICHEN TEXT VON A20 HINAUS ERGAENZT
-- ---------------------------------------------------------------------
-- A20 listet SELECT auf `katalog`/`intervall` und INSERT auf `befund`. Zwei
-- Grants fehlen dort, ohne die die uebrigen Auflagen nicht erfuellbar sind
-- -- ausdruecklich markiert, damit sie im Review nicht als stille
-- Ausweitung durchlaufen (Muster: V0010 D-GRANT-ERW):
--
--   (a) SELECT auf `einfluss.befund`: A19(b) verlangt EIN Audit-Ereignis JE
--       TATSAECHLICH GESCHRIEBENEM Befund. Mit dem Idempotenz-Index aus (4)
--       heisst das `INSERT ... ON CONFLICT DO NOTHING RETURNING id` -- und
--       `RETURNING` verlangt in PostgreSQL das SELECT-Recht auf die
--       zurueckgegebenen Spalten. Ohne dieses Grant muesste der Lauf
--       entweder blind emittieren (Audit-Ereignisse fuer Befunde, die gar
--       nicht entstanden sind) oder vorher pruefend lesen (dasselbe Recht,
--       nur mit Wettlauf). Es erweitert die Rolle NICHT ueber ihren Zweck
--       hinaus: `befund` traegt laut B10/B12.5 keine Rohwerte, nur die
--       klassierte Ueberschreitung.
--   (b) USAGE auf `audit` + EXECUTE auf `audit.append_event(...)`: A19
--       verlangt die Audit-Ereignisse in DERSELBEN Transaktion wie der
--       INSERT. Bis heute hat nur `edms_app` dieses EXECUTE (V0003:1096).
--       Die Funktion ist `SECURITY DEFINER` (V0003:779), der Aufrufer
--       braucht daher KEIN Recht auf `audit.event` oder `audit.event_typ`
--       -- dieses Grant oeffnet den Schreibpfad, nicht das Log.
GRANT SELECT ON einfluss.befund TO edms_einfluss_erkennung;

GRANT USAGE   ON SCHEMA audit TO edms_einfluss_erkennung;
GRANT EXECUTE ON FUNCTION audit.append_event(text, text, text, text, text, uuid,
    jsonb, uuid, uuid, smallint)                        TO edms_einfluss_erkennung;

-- NICHT gegrantet und nicht vergessen: `energy.*`. Der Baseline-Anker, der
-- Sperr-Vorfilter (A18) und die mvet->System-Aufloesung werden nach A17
-- (Weg 1) ueber die BESTEHENDE App-Verbindung gelesen, nicht ueber diese
-- Rolle. Die Namensraum-Trennung aus V0020 D-ROLLE bleibt damit
-- unangetastet -- der Lauf haelt zwei Verbindungen, statt eine Grenze
-- aufzuweichen.
