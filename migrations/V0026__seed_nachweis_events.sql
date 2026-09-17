-- V0026__seed_nachweis_events.sql
--
-- ADR-Bezug: docs/adr/ADR-0007-einsparberechnung-bafa-export.md Teil B,
-- B10 ("Neue Audit-Event-Codes", woertliche Katalog-Liste + Kontext-Key-
-- Whitelists), Teil C A19 ("Positivlisten-Test gegen audit.event_seal()").
-- Design-Owner der fachlichen Spezifikation: technical-director (Teil-B-
-- Autor) + compliance-director (A19-Haertung). Migrations-Entwurf:
-- database-lead (direkter Arbeitsauftrag). Vorlage/Muster: V0021 (Katalog-
-- Seed-Konventionen fuer ADR-0006), SCD2-DDL/Seal-Trigger unveraendert aus
-- V0003. Voraussetzung: V0025 (Schema `nachweis`) MUSS angewendet sein --
-- die hier benannten `objekt_ref`-Ziele (nachweis.einsparlauf.id usw.)
-- existieren erst danach; die Katalog-ZEILEN selbst haben aber KEINE FK
-- auf `nachweis.*` (audit.event_typ_version referenziert grundsaetzlich
-- kein Fach-Schema, Muster V0003/V0021).
--
-- =====================================================================
-- ZEHN Codes (KANONISCH, wortgleich vom Backend zu emittieren) -- ALLE
-- RESERVIERT (ADR-0007 ist Status "proposed", KEIN Emitter/Endpoint im
-- Repo -- diese Migration ist Design-Entwurf, s. V0024/V0025-Kopf "NUR
-- ENTWERFEN"). Katalog-Eintrag TROTZDEM jetzt angelegt (Praezedenzfall
-- V0006/V0009/V0015/V0021: Katalog steht bereit, damit eine kuenftige
-- Backend-Implementierung ohne weitere Schema-Migration auskommt).
-- =====================================================================
--
-- (1)-(4) einsparlauf.nachweis.{angefordert,abgeschlossen,fehlgeschlagen,
--   ersetzt} -- objekt_typ='einsparlauf', objekt_ref=nachweis.
--   einsparlauf.id (bei .angefordert ggf. NULL, solange nur ein
--   einsparlauf_auftrag existiert -- D1-Analogie: "kein Status im
--   Nachweisartefakt"). aktion_kategorie folgt dem letzten Code-Segment-
--   Verb (Praezedenz V0006/V0015/V0021): anfordern|abschliessen|
--   fehlschlagen|ersetzen. PolicyActions create:einsparlauf (B10) deckt
--   alle vier Lebenszyklus-Ereignisse ab (portfolioweite Aktion OHNE
--   endkundeId, B10 ausdruecklich: "Ihr Schutz ist RBAC ... NICHT ABAC").
--   Kontext-Whitelist WOERTLICH aus B10 ("einsparlauf.nachweis.*", fuer
--   ALLE VIER Codes identisch):
--     synthetic, einsparlauf_id, foerderjahr_code, art, verfahren_code,
--     verfahren_version, preflight_id, umfang_paare_anzahl,
--     gebundene_laeufe_anzahl, monate_erwartet, monate_gebunden,
--     qualitaets_stufe_min, ersetzt_einsparlauf_id, fehler_code
--   AUSDRUECKLICH KEIN endkunde_id, KEIN Export-Pseudonym (A19 -- die
--   Sammelaktion ist portfolioweit, es gibt bei diesen vier Codes ohnehin
--   keinen einzelnen Endkunden-Bezug). rolle_erfassen=false (reversible/
--   erwartete Betriebsvorgaenge, kein Klartext-PII-Lesen -- analog den
--   nicht-privilegierten berechnungslauf.bereinigung.*-Codes, V0021).
--
-- (5) preflight.nachweis.durchgefuehrt -- objekt_typ='preflight',
--   objekt_ref=nachweis.preflight.id. PolicyAction create:nachweis_
--   preflight (B10). aktion_kategorie='durchfuehren'. Kontext-Whitelist
--   WOERTLICH aus B10:
--     synthetic, preflight_id, foerderjahr_code, profil_code,
--     profil_version, ergebnis, blocker_anzahl, warnung_anzahl,
--     hinweis_anzahl, umfang_paare_anzahl, regel_codes
--   `regel_codes` traegt NUR die AUSGELOESTEN Regel-Codes (z. B. FJ-07c,
--   FJ-08 -- die in V0024 katalogisierten Bezeichner), NIEMALS eine
--   Paar-/Endkunden-Zuordnung -- die liegt strukturiert in
--   `nachweis.preflight_befund` (DB), nicht im Audit-Kontext (A15-Muster:
--   klassiert statt Rohwert). rolle_erfassen=false (der Preflight-Lauf
--   selbst ist kein Klartext-PII-Lesevorgang).
--
-- (6)-(7) export.nachweis.{erzeugt,abgerufen} -- objekt_typ='nachweis_
--   export', objekt_ref=nachweis.export.id. PolicyActions create:
--   nachweis_export (erzeugt) bzw. read:nachweis_export (abgerufen, B10:
--   "die schutzwuerdigste Leseaktion dieses ADR" -- Tages-Detailwerte UND
--   Einflussgroessen-Projektion, eigene Auditor-Deny-Regel, "immer audit-
--   pflichtig"). aktion_kategorie: erzeugen|abrufen. Kontext-Whitelist
--   WOERTLICH aus B10 ("export.nachweis.*", fuer BEIDE Codes identisch,
--   `dateiname` NUR bei .abgerufen):
--     synthetic, export_id, einsparlauf_id, foerderjahr_code, schema_code,
--     schema_version, format, zweck, pseudonym_profil, anfrage_ref,
--     station_darstellung, de04_auszug, dateien_anzahl,
--     zeilen_anzahl_gesamt, manifest_hash, dateiname (NUR .abgerufen)
--   `zweck`/`anfrage_ref` sind gegenueber der woertlichen B10-Liste
--   ERGAENZT (database-lead, ueber den Auftrag hinaus, aber NICHT
--   spekulativ): V0025 hat `de04_auszug` per A14 zu einer von `zweck`
--   ABGELEITETEN Spalte gemacht und `anfrage_ref` NEU auf `nachweis.
--   export` angelegt (A13, s. dortiger Migrations-Kopf D-EXPORT-ANFRAGE-
--   REF) -- beide sind Klassifikations-/Aktenzeichen-Felder, KEIN
--   Personenbezug, KEIN Wert (dieselbe Kategorie wie das bereits
--   erlaubte `korrektur_grund_code` bei einreichung.nachweis.*).
--   `dateiname` ist -- weil V0025s A19-CHECK Dateinamen strukturell
--   entitaetsfrei macht (geschlossene, kategoriebasierte Liste, KEIN
--   Pseudonym-Bestandteil moeglich) -- unbedenklich in der Whitelist:
--   die DB-Ebene verhindert bereits, dass ein Pseudonym ueberhaupt in
--   diese Spalte gelangen koennte, die Audit-Whitelist ist damit KEINE
--   eigenstaendige Kontrolle gegen dieses Risiko, sondern verlaesst sich
--   zu Recht auf die staerkere DB-Garantie (V0025 ck_export_datei_
--   kategorie_dateiname). AUSDRUECKLICH KEIN endkunde_id, KEIN Export-
--   Pseudonym, KEINE kWh-Mengen (A19/B10 Verbotsliste). `manifest_hash`
--   ist zugelassen (A19: "Hashes ... tragen keine Einzelwerte und sind
--   der forensische Anker"). rolle_erfassen=TRUE NUR fuer .abgerufen
--   (Klartext-Detaildaten verlassen das System, analog `standort.pii.
--   einsicht`/`einflussgroesse.stammdaten.einsicht`, V0021); .erzeugt
--   bleibt rolle_erfassen=false.
--
-- (8)-(9) einreichung.nachweis.{vermerkt,korrigiert} -- objekt_typ=
--   'einreichung', objekt_ref=nachweis.einreichung.id. PolicyAction
--   create:einreichung (B10, beide Codes -- eine Korrektur ist strukturell
--   eine NEUE Einreichung, D7). aktion_kategorie: vermerken|korrigieren.
--   Kontext-Whitelist WOERTLICH aus B10 ("einreichung.nachweis.*", fuer
--   BEIDE Codes identisch):
--     synthetic, einreichung_id, export_id, einsparlauf_id,
--     foerderjahr_code, art, anfrage_ref, uebermittlungsweg, empfaenger,
--     manifest_hash, ersetzt_einreichung_id, korrektur_grund_code,
--     differenz_positionen_anzahl, differenz_richtung
--   `differenz_richtung` ist KLASSIERT (hoeher|niedriger|unveraendert),
--   NIEMALS ein Differenzbetrag (A19/B10 Verbotsliste: "kWh-Mengen jeder
--   Art -- einschliesslich Einsparmengen und Differenzbetraegen").
--   AUSDRUECKLICH KEIN endkunde_id (die einzelnen Differenzzeilen liegen
--   strukturiert in `nachweis.einreichung_differenz`, DB, nicht im Audit-
--   Kontext). rolle_erfassen=false: das VERMERKEN einer Einreichung selbst
--   ist -- anders als der Dateiabruf (Code 7) -- kein Klartext-PII-
--   Lesevorgang, sondern ein Schreibvorgang auf Metadaten; `read:
--   einreichung` (Metadaten-Lesen, B10: "ausdruecklich auditor-
--   zugaenglich") hat in v1 bewusst KEIN eigenes Audit-Event (Praezedenz:
--   `read:berechnungslauf`/`read:einsparlauf` haben ebenfalls keines --
--   Lesezugriffe auf NICHT hochprivilegierte Metadaten werden in diesem
--   Repo grundsaetzlich nicht auditiert, nur Klartext-PII-Lesen, A9).
--
-- (10) foerderjahr.stammdaten.definiert -- objekt_typ='foerderjahr',
--   objekt_ref=nachweis.foerderjahr.id. PolicyAction create:foerderjahr
--   (B10). aktion_kategorie='definieren'. Kontext-Whitelist WOERTLICH aus
--   B10:
--     synthetic, foerderjahr_id, foerderjahr_code, nummer, von_monat,
--     bis_monat, definition_quelle
--   rolle_erfassen=false (Stammdaten-Erfassung, kein Klartext-PII-Lesen).
--
-- pflichtereignis=false fuer ALLE ZEHN Codes: Praezedenzfall-Uebernahme
-- aus V0003/V0004/V0006/V0009/V0015/V0021 (pflichtereignis=true bleibt
-- AUSSCHLIESSLICH fuer die STRIDE-Selbstpruef-Ereignisse des Audit-
-- Subsystems reserviert -- kein neuer Praezedenzfall in dieser Migration).
--
-- =====================================================================
-- A19-KRITISCH -- die eigentliche Kontrolle ist die POSITIVLISTE
-- =====================================================================
-- Keine der zehn `erlaubte_kontext_keys`-Arrays unten enthaelt `endkunde_
-- id` ODER `pseudonym`/`export_pseudonym` -- der fail-closed `audit.
-- event_seal()`-Trigger (V0003, Schritt (3): "kontext-key(s) nicht in
-- Whitelist") weist JEDEN Kontext-Key ausserhalb dieser Listen strukturell
-- ab, unabhaengig davon, was ein kuenftiger Emitter versucht mitzugeben.
-- Das ist STAERKER als die im ADR formulierte Verbotsregel ("Pseudonym und
-- endkunde_id nie gemeinsam") -- diese Migration verbietet BEIDE Werte
-- JEWEILS EINZELN vollstaendig, nicht nur ihre Kombination. Ein Test
-- gegen genau diese Eigenschaft ist Teil der Verifikation dieser
-- Migrationsgruppe (s. Antwort an den Auftraggeber, Testmatrix (h)).
--
-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert, s.
-- V0006/V0007/V0009/V0015/V0021-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
--
-- Diese Migration emittiert -- wie V0003/V0004/V0006/V0007/V0009/V0015/
-- V0021 -- KEINE eigene Zeile in `audit.event`. Pruefung, unabhaengig von
-- den Vorgaenger-Migrationen fuer DIESEN Zeitpunkt hergeleitet:
--   1. ADR-0007 traegt selbst den Status "proposed" (ADR-Kopf) -- Freigabe
--      des Users steht noch aus (diese Migration ist Design-Entwurf, s.
--      V0024/V0025-Kopf: KEIN edms-migrate up gegen die Dev-DB).
--   2. KEINER der zehn hier geseedeten Codes hat einen Emitter im Repo --
--      strukturell (noch) keine Moeglichkeit, dass ein `audit.event`
--      dieser Codes reale Endkunden-/Nachweis-Daten traegt.
--   3. Der rein mechanische Grund aus V0003/V0004/V0006/V0009/V0015/V0021
--      gilt unveraendert: ein SQL-Migrationsskript kann keinen validierten
--      `actor_*`-Principal herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission durch
-- diese Migration. VERBINDLICHER HINWEIS fuer Folge-Migrationen: erneut zu
-- pruefen, sobald ADR-0007 die User-Freigabe erhaelt UND die Phase-4-
-- Backend-Implementierung der Nachweis-Routen live geht.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Header (dieser Kommentar) -> event_typ-Header-Zeilen (10x) ->
-- event_typ_version-Zeilen (10x, Reihenfolge = B10-Reihenfolge:
-- einsparlauf.nachweis.* (4) -> preflight.nachweis.durchgefuehrt (1) ->
-- export.nachweis.* (2) -> einreichung.nachweis.* (2) ->
-- foerderjahr.stammdaten.definiert (1)).

INSERT INTO audit.event_typ (code) VALUES
    ('einsparlauf.nachweis.angefordert'),
    ('einsparlauf.nachweis.abgeschlossen'),
    ('einsparlauf.nachweis.fehlgeschlagen'),
    ('einsparlauf.nachweis.ersetzt'),
    ('preflight.nachweis.durchgefuehrt'),
    ('export.nachweis.erzeugt'),
    ('export.nachweis.abgerufen'),
    ('einreichung.nachweis.vermerkt'),
    ('einreichung.nachweis.korrigiert'),
    ('foerderjahr.stammdaten.definiert');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1)-(4) einsparlauf.nachweis.*
    (gen_random_uuid(), 'einsparlauf.nachweis.angefordert', 'einsparlauf', 'anfordern',
     ARRAY['synthetic','einsparlauf_id','foerderjahr_code','art','verfahren_code','verfahren_version',
           'preflight_id','umfang_paare_anzahl','gebundene_laeufe_anzahl','monate_erwartet','monate_gebunden',
           'qualitaets_stufe_min','ersetzt_einsparlauf_id','fehler_code'],
     false, false, true,
     'Einspar-Lauf angefordert (PolicyAction create:einsparlauf, ADR-0007 D1/B1/B10 -- portfolioweite Aktion OHNE endkundeId, RBAC statt ABAC). RESERVIERT: ADR-0007 Status proposed, kein Emitter im Repo. objekt_ref=nachweis.einsparlauf.id, ggf. NULL vor Abschluss (D1: kein Status im Nachweisartefakt). kontext.synthetic Pflicht-Tag (A9-Analogie). KEIN endkunde_id, KEIN Export-Pseudonym, KEIN kWh-Wert im Kontext (A19).',
     now()),
    (gen_random_uuid(), 'einsparlauf.nachweis.abgeschlossen', 'einsparlauf', 'abschliessen',
     ARRAY['synthetic','einsparlauf_id','foerderjahr_code','art','verfahren_code','verfahren_version',
           'preflight_id','umfang_paare_anzahl','gebundene_laeufe_anzahl','monate_erwartet','monate_gebunden',
           'qualitaets_stufe_min','ersetzt_einsparlauf_id','fehler_code'],
     false, false, true,
     'Einspar-Lauf erfolgreich abgeschlossen -- der Lauf ENTSTEHT genau hier (D1). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.einsparlauf.id. kontext.synthetic Pflicht-Tag. KEIN endkunde_id/Export-Pseudonym/kWh-Wert im Kontext (A19).',
     now()),
    (gen_random_uuid(), 'einsparlauf.nachweis.fehlgeschlagen', 'einsparlauf', 'fehlschlagen',
     ARRAY['synthetic','einsparlauf_id','foerderjahr_code','art','verfahren_code','verfahren_version',
           'preflight_id','umfang_paare_anzahl','gebundene_laeufe_anzahl','monate_erwartet','monate_gebunden',
           'qualitaets_stufe_min','ersetzt_einsparlauf_id','fehler_code'],
     false, false, true,
     'Einspar-Lauf fehlgeschlagen -- KEIN Nachweis-Artefakt entstanden (nachweis.einsparlauf_auftrag traegt fehler_code, D1). RESERVIERT: kein Emitter im Repo. objekt_ref i. d. R. NULL. kontext.synthetic Pflicht-Tag. KEIN endkunde_id/Export-Pseudonym/kWh-Wert im Kontext (A19).',
     now()),
    (gen_random_uuid(), 'einsparlauf.nachweis.ersetzt', 'einsparlauf', 'ersetzen',
     ARRAY['synthetic','einsparlauf_id','foerderjahr_code','art','verfahren_code','verfahren_version',
           'preflight_id','umfang_paare_anzahl','gebundene_laeufe_anzahl','monate_erwartet','monate_gebunden',
           'qualitaets_stufe_min','ersetzt_einsparlauf_id','fehler_code'],
     false, false, true,
     'Neuberechnung: neuer Einspar-Lauf ersetzt einen aelteren (D1: "der alte bleibt unangetastet, auch wenn er bereits eingereicht wurde"). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.einsparlauf.id des NEUEN Laufs; kontext.ersetzt_einsparlauf_id=Verweis auf den ersetzten Lauf. kontext.synthetic Pflicht-Tag. KEIN endkunde_id/Export-Pseudonym/kWh-Wert im Kontext (A19).',
     now()),

    -- (5) preflight.nachweis.durchgefuehrt
    (gen_random_uuid(), 'preflight.nachweis.durchgefuehrt', 'preflight', 'durchfuehren',
     ARRAY['synthetic','preflight_id','foerderjahr_code','profil_code','profil_version','ergebnis',
           'blocker_anzahl','warnung_anzahl','hinweis_anzahl','umfang_paare_anzahl','regel_codes'],
     false, false, true,
     'Vollstaendigkeits-Preflight durchgefuehrt (DE-02/M2, PolicyAction create:nachweis_preflight, ADR-0007 D4/B4/B10). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.preflight.id. kontext.regel_codes traegt NUR ausgeloeste Regel-Codes (z. B. FJ-07c, FJ-08 aus V0024), NIEMALS eine Paar-/Endkunden-Zuordnung (die liegt in nachweis.preflight_befund, DB). kontext.synthetic Pflicht-Tag. KEIN endkunde_id/Export-Pseudonym/kWh-Wert im Kontext (A19).',
     now()),

    -- (6)-(7) export.nachweis.*
    (gen_random_uuid(), 'export.nachweis.erzeugt', 'nachweis_export', 'erzeugen',
     ARRAY['synthetic','export_id','einsparlauf_id','foerderjahr_code','schema_code','schema_version',
           'format','zweck','pseudonym_profil','anfrage_ref','station_darstellung','de04_auszug',
           'dateien_anzahl','zeilen_anzahl_gesamt','manifest_hash'],
     false, false, true,
     'Nachweis-Export erzeugt (PolicyAction create:nachweis_export, ADR-0007 D5/B5/B10). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.export.id. kontext.zweck/anfrage_ref sind gegenueber der woertlichen B10-Liste database-lead-ergaenzt (V0025 A13/A14-Schema-Delta) -- Klassifikations-/Aktenzeichen-Felder, kein Personenbezug/Wert. kontext.manifest_hash zugelassen (A19: Hash traegt keinen Einzelwert). kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN endkunde_id, KEIN Export-Pseudonym, KEIN kWh-Wert im Kontext (A19). rolle_erfassen=false: das Erzeugen selbst ist kein Klartext-Lesevorgang (dafuer Code 7).',
     now()),
    (gen_random_uuid(), 'export.nachweis.abgerufen', 'nachweis_export', 'abrufen',
     ARRAY['synthetic','export_id','einsparlauf_id','foerderjahr_code','schema_code','schema_version',
           'format','zweck','pseudonym_profil','anfrage_ref','station_darstellung','de04_auszug',
           'dateien_anzahl','zeilen_anzahl_gesamt','manifest_hash','dateiname'],
     true, false, true,
     'Klartext-Detail-Abruf einer Export-Datei -- GET .../exporte/{id}/dateien/{dateiname} (PolicyAction read:nachweis_export, B10: "die schutzwuerdigste Leseaktion dieses ADR", eigene Auditor-Deny-Regel, "immer audit-pflichtig"). JEDE Auslieferung wird auditiert, AUCH permit (analog einflussgroesse.stammdaten.einsicht, V0021). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.export.id. kontext.dateiname NUR hier (nicht bei .erzeugt) -- unbedenklich, weil V0025s DB-CHECK (ck_export_datei_kategorie_dateiname, A19) Dateinamen strukturell entitaetsfrei haelt; die DB-Garantie traegt dieses Risiko, nicht die Audit-Whitelist. kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN endkunde_id, KEIN Export-Pseudonym, KEIN kWh-Wert im Kontext (A19). rolle_erfassen=true: Klartext-PII-Lesen (Tages-Detailwerte + Einflussgroessen-Projektion), woertlich aus B10 uebernommen.',
     now()),

    -- (8)-(9) einreichung.nachweis.*
    (gen_random_uuid(), 'einreichung.nachweis.vermerkt', 'einreichung', 'vermerken',
     ARRAY['synthetic','einreichung_id','export_id','einsparlauf_id','foerderjahr_code','art','anfrage_ref',
           'uebermittlungsweg','empfaenger','manifest_hash','ersetzt_einreichung_id','korrektur_grund_code',
           'differenz_positionen_anzahl','differenz_richtung'],
     false, false, true,
     'Einreichung vermerkt (PolicyAction create:einreichung, ADR-0007 D7/B7/B10). Ehrlichkeitsklausel (B7): "vermerkt", NICHT "zugestellt" -- das System bezeugt die Erklaerung des Bedieners, nicht den Empfang durch die Behoerde. RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.einreichung.id. kontext.differenz_richtung KLASSIERT (hoeher|niedriger|unveraendert), NIEMALS ein Differenzbetrag (A19/B10 Verbotsliste). kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN endkunde_id im Kontext (die Differenzzeilen liegen in nachweis.einreichung_differenz, DB) -- KEIN Export-Pseudonym, KEIN kWh-Wert (A19). rolle_erfassen=false: Metadaten-Schreibvorgang, kein Klartext-PII-Lesen.',
     now()),
    (gen_random_uuid(), 'einreichung.nachweis.korrigiert', 'einreichung', 'korrigieren',
     ARRAY['synthetic','einreichung_id','export_id','einsparlauf_id','foerderjahr_code','art','anfrage_ref',
           'uebermittlungsweg','empfaenger','manifest_hash','ersetzt_einreichung_id','korrektur_grund_code',
           'differenz_positionen_anzahl','differenz_richtung'],
     false, false, true,
     'Korrektur-Einreichung vermerkt -- eine Korrektur ist strukturell eine NEUE Einreichung mit ersetzt_einreichung_id + Differenz-Report (D7: "nie stilles Ueberschreiben", A18 Art.19-Mitteilungspflicht-Ausloeser). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.einreichung.id der NEUEN (korrigierenden) Einreichung. kontext.differenz_richtung KLASSIERT, NIEMALS ein Differenzbetrag (A19). kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN endkunde_id, KEIN Export-Pseudonym, KEIN kWh-Wert im Kontext (A19). rolle_erfassen=false.',
     now()),

    -- (10) foerderjahr.stammdaten.definiert
    (gen_random_uuid(), 'foerderjahr.stammdaten.definiert', 'foerderjahr', 'definieren',
     ARRAY['synthetic','foerderjahr_id','foerderjahr_code','nummer','von_monat','bis_monat','definition_quelle'],
     false, false, true,
     'Foerderjahr-Stammdaten definiert (PolicyAction create:foerderjahr, ADR-0007 B4/B10, O1: parametrisierte Foerderjahr-Definition). RESERVIERT: kein Emitter im Repo. objekt_ref=nachweis.foerderjahr.id. kontext.synthetic Pflicht-Tag. KEIN endkunde_id/Export-Pseudonym im Kontext (A19).',
     now());
