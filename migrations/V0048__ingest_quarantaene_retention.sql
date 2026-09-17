-- V0048 — Rechte und Audit-Ereignis fuer den Quarantaene-Loeschlauf.
-- Umsetzung des `compliance-director`-Votums vom 2026-09-05, Punkt 3
-- (Auflagen Q.1 bis Q.6).
--
-- ANLASS
-- ------
-- `ingest.eingang_quarantaene` traegt seit V0011 den Vermerk „OFFEN — kein
-- Loeschjob existiert" und ist in DSFA-0001 als **harte Gate-Auflage vor
-- Real-Ingest** gefuehrt (Element 12 a). Sie enthaelt `deveui_blind_index` --
-- ein ueber alle Uplinks eines Geraets stabiles, personenbeziehbares
-- Korrelat -- und waechst unbegrenzt.
--
-- Sie war die EINZIGE der vier Element-12-Auflagen, die nicht an Aufwand
-- hing, sondern an einer fehlenden Frist. Die liegt jetzt vor.
--
-- ZWEI FRISTEN AN EINER TABELLE, UND DAS IST KEIN OVERENGINEERING
-- ---------------------------------------------------------------
--   30 TAGE — `deveui_blind_index` wird auf NULL gesetzt (Spalten-UPDATE).
--   90 TAGE — die Zeile wird geloescht.
--
-- Der dokumentierte Zweck des Blind-Index ist „Wiedererkennung derselben
-- fehlerhaften Quelle" (DB-7, DSFA-0001 12.11.4) -- ein Betriebsvorgang mit
-- einer Halbwertszeit von Tagen bis wenigen Wochen. Ein Geraet, das vor drei
-- Monaten unbekannt war, wird heute ueber die inzwischen angelegte Zuordnung
-- korreliert, nicht ueber den Blind-Index. Alles darueber ist Vorratshaltung
-- eines personenbeziehbaren Korrelats.
--
-- Der REST der Zeile (`grund`, `topic_redacted`, `rohpayload_redacted`,
-- `quelle_code`, ChirpStack-IDs, Zeitstempel) traegt den Trendwert („haeuft
-- sich `decode_fehler` bei Quelle B?") und ist OHNE den Blind-Index nicht
-- mehr personenbeziehbar. Deshalb stirbt die Spalte vor der Zeile: Es ist die
-- einzige Konstruktion, die Zweck und Minimierung gleichzeitig bedient.
--
-- KEIN NACHWEISZWECK. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f
-- (Fehlerdiagnose, Datenintegritaet) i. V. m. Art. 32 -- NICHT Art. 17
-- Abs. 3 lit. b. Den TB-04-Nachweis tragen `ingest.ausfall_vorgang` und das
-- Audit-Log; V0011 stellt selbst fest, die Tabelle sei „Diagnose-/
-- Retention-Objekt, NICHT rechtssicherer Nachweis-Anker".
--
-- WARUM DIESER LAUF NICHT UNTER DER A-O6-SPERRE STEHT
-- Seine Fristen haengen NICHT an der F2-Arbeitsfrist (Projektlaufzeit +
-- 5 Jahre) und damit nicht am Zuwendungsbescheid. Er darf gebaut und scharf
-- betrieben werden, bevor A-O6 verifiziert ist (Auflage Q.6). Das ist
-- beabsichtigt und der Unterschied zu allen anderen Loeschlaeufen.
--
-- Review-Bedarf: `database-lead` (Grants) und `compliance-director`
-- (Abnahme seiner eigenen Auflagen).

-- =====================================================================
-- Q.2 — die ausfuehrende Rolle
-- =====================================================================
-- WEDER `edms_ingest_worker` NOCH `edms_app`. Der Worker hat seit V0011
-- `UPDATE` auf diese Tabelle -- technisch wuerde das fuer die Nullung
-- reichen, aber er ist die falsche Identitaet fuer einen Retentionlauf: Er
-- ist die exponierteste Komponente des Systems (RL-1), und ein Loeschrecht
-- in seinen Haenden waere ein Recht, das er fuer seine Aufgabe nie braucht.
--
-- Spaltenscharf wie bei `edms_einfluss`/`edms_ingest_worker`: Die Rolle darf
-- GENAU die eine Spalte nullen, die zu nullen ist. Ein `UPDATE` auf
-- `grund` oder `rohpayload_redacted` -- also ein Verwischen des Befundes --
-- ist ihr verwehrt.
GRANT SELECT                     ON ingest.eingang_quarantaene TO edms_retention;
GRANT UPDATE (deveui_blind_index) ON ingest.eingang_quarantaene TO edms_retention;
GRANT DELETE                     ON ingest.eingang_quarantaene TO edms_retention;

-- Der Lauf muss offene Ausfall-Vorgaenge erkennen koennen (Verlaengerungsfall
-- aus dem Votum). Nur lesend -- er beendet keinen Vorgang, er respektiert ihn.
GRANT SELECT ON ingest.ausfall_vorgang TO edms_retention;
GRANT USAGE  ON SCHEMA ingest         TO edms_retention;

-- =====================================================================
-- Q.3 — ein Audit-Ereignis JE LAUF
-- =====================================================================
-- Nicht je Zeile: Ein Loeschlauf ueber achttausend Quarantaene-Zeilen wuerde
-- sonst mehr ins append-only Log schreiben als der gesamte Betrieb davor.
--
-- KONTEXT-WHITELIST -- und was bewusst fehlt: KEINE Kennungen, KEINE
-- Blind-Indizes, KEINE Topics. Ein Loeschprotokoll, das die geloeschten
-- Korrelate auffuehrt, hebt die Loeschung wieder auf.
--
-- `uebersprungen_offener_vorgang` ist die wichtigste Zahl der drei: Sie
-- macht sichtbar, dass der Lauf gelaufen ist UND etwas stehen gelassen hat.
-- Ohne sie waere ein Lauf, der wegen eines seit Monaten offenen
-- Ausfall-Vorgangs nichts loescht, von einem Lauf ohne Kandidaten nicht zu
-- unterscheiden.
INSERT INTO audit.event_typ (code) VALUES
    ('ingest.quarantaene.retention_lauf');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'ingest.quarantaene.retention_lauf', 'ingest_quarantaene', 'loeschen',
     ARRAY['synthetic','modus','anzahl_genullt','anzahl_geloescht','uebersprungen_offener_vorgang','stichtag_nullung','stichtag_loeschung'],
     true, false, true,
     'Ein Retention-Lauf ueber ingest.eingang_quarantaene (compliance-director-Votum 2026-09-05, Punkt 3). ZWEI Fristen: deveui_blind_index wird nach 30 Tagen genullt (Spalten-UPDATE), die Zeile nach 90 Tagen geloescht; Zeilen zu einem offenen ingest.ausfall_vorgang bleiben bis 90 Tage nach dessen Abschluss, absolut gedeckelt auf 12 Monate. kontext.modus=probelauf|ausfuehrung -- ein Probelauf zaehlt, loescht aber nicht. AGGREGAT je Lauf, NICHT je Zeile: ein Lauf ueber achttausend Zeilen wuerde sonst mehr ins append-only Log schreiben als der Betrieb davor. BEWUSST OHNE Kennungen, Blind-Indizes und Topics -- ein Loeschprotokoll, das die geloeschten Korrelate auffuehrt, hebt die Loeschung wieder auf. uebersprungen_offener_vorgang macht sichtbar, dass der Lauf etwas STEHEN GELASSEN hat; ohne diese Zahl waere ein blockierter Lauf von einem leeren nicht zu unterscheiden. Dieser Lauf unterliegt NICHT der A-O6-Ausfuehrungssperre: seine Fristen haengen nicht an der F2-Arbeitsfrist.',
     now());

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen (rote Linie 1). Der
-- Emitter entsteht im selben Commit.
-- VERBINDLICHER HINWEIS: A11.5 verlangt dieses Ereignis. Es ist VERSCHOBEN,
-- nicht erledigt -- mit echtem Principal nachzutragen, spaetestens bei
-- Oeffnung des ADR-0004-Gates. V0032, V0033, V0036, V0038, V0043, V0045 und
-- V0048 sind dabei GEMEINSAM zu behandeln.
