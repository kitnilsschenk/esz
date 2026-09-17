-- V0021__seed_analytics_einfluss_events.sql
--
-- ADR-Bezug: docs/adr/ADR-0006-baseline-bereinigung.md Teil B, B10
-- ("Neue Audit-Event-Codes", woertliche Katalog-Liste + Kontext-Key-
-- Whitelists). Design-Owner der fachlichen Spezifikation: technical-director
-- (Teil-B-Autor). Migrations-Entwurf: database-lead (direkter
-- Arbeitsauftrag). Vorlage/Muster: V0006/V0009/V0015 (Katalog-Seed-
-- Konventionen), SCD2-DDL/Seal-Trigger unveraendert aus V0003.
--
-- Setzt A9 (compliance-director-Auflage, Phase-3-Votum ADR-0006) um:
--   - `synthetic` ist in JEDER der zwoelf Kontext-Key-Whitelists enthalten.
--   - KEIN Wert-Key (kWh-Mengen, Baseline-/Temperatur-/GTZ-Werte,
--     Einflussgroessen-Werte wert_num/wert_code, anlass_code, exakte
--     Ueberschreitungsprozentsaetze) ist Bestandteil irgendeiner Whitelist
--     -- der Seal-Trigger (audit.event_seal(), V0003 Schritt (3)) erzwingt
--     das strukturell: ein Kontext-Key ausserhalb der Whitelist wird
--     fail-closed abgelehnt.
--
-- =====================================================================
-- ZWOELF Codes (KANONISCH, wortgleich vom Backend zu emittieren) -- ALLE
-- RESERVIERT (ADR-0006 ist Status "proposed", KEIN Emitter/Endpoint im Repo
-- -- diese Migration ist Design-Entwurf, s. V0019-Kopf "NUR ENTWERFEN").
-- Katalog-Eintrag TROTZDEM jetzt angelegt (Praezedenzfall V0006/V0009/V0015:
-- Katalog steht bereit, damit eine kuenftige Backend-Implementierung ohne
-- weitere Schema-Migration auskommt).
-- =====================================================================
--
-- (1)-(4) berechnungslauf.bereinigung.{angefordert,abgeschlossen,
--   fehlgeschlagen,ersetzt} -- objekt_typ='berechnungslauf',
--   objekt_ref=analytics.berechnungslauf.id (bzw. bei .angefordert ggf.
--   NULL, solange nur ein lauf_auftrag existiert, VOR erfolgreichem
--   Abschluss -- D1: "es gibt keinen laufenden/fehlgeschlagenen Lauf im
--   Nachweisartefakt"). aktion_kategorie folgt dem letzten Code-Segment-Verb
--   (Praezedenz V0006/V0015): anfordern|abschliessen|fehlschlagen|ersetzen.
--   PolicyAction create:berechnungslauf (B10) deckt alle vier Lebenszyklus-
--   Ereignisse ab. Kontext-Whitelist WOERTLICH aus B10 uebernommen (fuer
--   ALLE VIER Codes identisch, "berechnungslauf.*"):
--     synthetic, lauf_id, endkunde_id, energietraeger, verfahren_code,
--     verfahren_version, periode_von, periode_bis, monate_anzahl,
--     qualitaets_stufe, ersetzt_lauf_id, fehler_code
--   rolle_erfassen=false (reversible/erwartete Betriebsvorgaenge, kein
--   hochprivilegiertes Klartext-PII-Lesen -- analog den nicht-privilegierten
--   Stammdaten-Codes aus V0006).
--
-- (5)-(6) klimadaten.import.{durchgefuehrt,revision_erkannt} --
--   objekt_typ='klimadaten_import' (KEINE eigene Entitaets-Tabelle fuer
--   Importvorgaenge in diesem Schema-Entwurf, daher objekt_ref stets NULL --
--   analog audit_retention_freigabe-Praezedenz, wo objekt_typ ebenfalls ohne
--   FK-Ziel beschreibend bleibt). PolicyAction create:klima_import (B10).
--   aktion_kategorie: durchfuehren|erkennen. Kontext-Whitelist WOERTLICH aus
--   B10 ("klimadaten.import.*"):
--     synthetic, station_ref, von, bis, quelle, zeilen_anzahl,
--     revision_anzahl, betroffene_laeufe_anzahl
--   rolle_erfassen=false. `.revision_erkannt` ist der in B4 beschriebene
--   Ausloeser fuer eine Neuberechnung nach F7(b) -- "nie eine stille
--   Aenderung" (ADR-Wortlaut).
--
-- (7) verfahren.katalog.aktiviert -- objekt_typ='verfahren_version',
--   objekt_ref=analytics.verfahren_version.id. KEIN PolicyAction in der
--   B10-Tabelle (Verfahrenskatalog wird gemaess D3/B3 AUSSCHLIESSLICH ueber
--   Migrationen gepflegt, s. V0019 D-A6-VERFAHREN-REVOKE) -- dieses Event
--   ist fuer einen NACHGELAGERTEN, menschlich ausgefuehrten operativen
--   Prozess reserviert, der eine neue Katalog-Version-Migration begleitet
--   (analog `audit.katalog.geaendert` in V0003, dort ebenfalls ohne
--   Laufzeit-Emitter). aktion_kategorie='aktivieren'. Kontext-Whitelist
--   WOERTLICH aus B10: synthetic, verfahren_code, verfahren_version.
--   rolle_erfassen=false.
--
-- (8) baseline.periode.erfasst -- objekt_typ='baseline_periode',
--   objekt_ref=energy.baseline_periode.id. PolicyAction
--   create:messkonzept_version (B10: "Baseline-Perioden brauchen KEINE
--   eigene Aktion -- sie sind Bestandteil der Messkonzept-Version").
--   aktion_kategorie='erfassen'. Kontext-Whitelist WOERTLICH aus B10:
--     synthetic, endkunde_id, energietraeger, von, bis, einheit
--   AUSDRUECKLICH KEIN `menge`-Key (A9/B10: "Verbrauchsmengen ... nur
--   einheit, nie menge"). rolle_erfassen=false.
--
-- (9)-(11) einflussgroesse.stammdaten.{erfasst,geaendert,einsicht} --
--   objekt_typ='einflussgroesse', objekt_ref=einfluss.intervall.id.
--   PolicyActions create:einflussgroesse/update:einflussgroesse (erfasst/
--   geaendert) bzw. read:einflussgroesse (einsicht, B10: "Klartext-PII-
--   Leseaktion", deny-by-default + eigene Defense-in-Depth-Deny-Regel fuer
--   die Auditor-Rolle -- DB-seitig hier NUR die Katalog-Zeile, die
--   eigentliche Haertung ist ABAC-/App-Scope). aktion_kategorie:
--   erfassen|aendern|einsehen. Kontext-Whitelist WOERTLICH aus B10
--   ("einflussgroesse.stammdaten.*", fuer ALLE DREI Codes identisch):
--     synthetic, einflussgroesse_id, endkunde_id, system_id, groesse_code,
--     gueltig_ab_monat, gueltig_bis_monat, betroffener_typ, quelle_typ,
--     rechtsgrundlage, anzahl_saetze
--   AUSDRUECKLICH KEIN wert_num/wert_code/anlass_code-Key (A9 -- Personenzahl
--   und Nutzflaeche sind der PII-Wert selbst, s. V0020-Spaltenkommentar).
--   rolle_erfassen=true NUR fuer (11) `.einsicht` (Klartext-PII-Lesen, B10
--   woertlich: "analog stammdaten.verbrauch_detail.einsicht", V0006 (17));
--   (9)/(10) bleiben rolle_erfassen=false (reversible Stammdaten-Mutation).
--
-- (12) einflussgroesse.schwellwert.ueberschritten -- objekt_typ=
--   'einflussgroesse_befund', objekt_ref=einfluss.befund.id. Laeuft
--   PolicyAction-seitig unter read:einflussgroesse (B10: "Der
--   Schwellwert-Report ... unter derselben Aktion"). aktion_kategorie=
--   'ueberschreiten'. Kontext-Whitelist WOERTLICH aus B10:
--     synthetic, system_id, groesse_code, schwellwert_code, zeitraum_von,
--     zeitraum_bis, ueberschreitung_klasse
--   AUSDRUECKLICH klassiert (ueberschreitung_klasse), KEIN exakter
--   Rohprozentsatz im Kontext (A9/B10, B12.5). rolle_erfassen=false (der
--   Befund selbst ist kein Klartext-PII-Lesevorgang -- das eigentliche
--   Klartext-Lesen laeuft ueber Code (11)).
--
-- pflichtereignis=false fuer ALLE ZWOELF Codes: Praezedenzfall-Uebernahme
-- aus V0003/V0004/V0006/V0009/V0015 (pflichtereignis=true bleibt
-- AUSSCHLIESSLICH fuer die STRIDE-Selbstpruef-Ereignisse des Audit-
-- Subsystems reserviert -- kein neuer Praezedenzfall in dieser Migration).
--
-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert, s.
-- V0006/V0007/V0009/V0015-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
--
-- Diese Migration emittiert -- wie V0003/V0004/V0006/V0007/V0009/V0015 --
-- KEINE eigene Zeile in `audit.event`. Pruefung, unabhaengig von den
-- Vorgaenger-Migrationen fuer DIESEN Zeitpunkt hergeleitet:
--   1. ADR-0006 traegt selbst den Status "proposed" (ADR-Kopf) -- Freigabe
--      des Users steht noch aus (diese Migration ist Design-Entwurf, s.
--      V0019-Kopf: KEIN edms-migrate up gegen die Dev-DB).
--   2. KEINER der zwoelf hier geseedeten Codes hat einen Emitter im Repo --
--      strukturell (noch) keine Moeglichkeit, dass ein `audit.event` dieser
--      Codes reale Endkunden-/Einflussgroessen-Daten traegt.
--   3. Der rein mechanische Grund aus V0003/V0004/V0006/V0009/V0015 gilt
--      unveraendert: ein SQL-Migrationsskript kann keinen validierten
--      `actor_*`-Principal herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission durch diese
-- Migration. VERBINDLICHER HINWEIS fuer Folge-Migrationen: erneut zu
-- pruefen, sobald ADR-0006 die User-Freigabe erhaelt UND die Phase-4-
-- Backend-Implementierung der Berechnungslauf-/Einflussgroessen-Routen live
-- geht -- dann sollte die naechste Katalog-Migration bzw. ein begleitender
-- operativer Prozess eine ECHTE, menschlich ausgefuehrte
-- `audit.append_event('audit.katalog.geaendert', ...)` fuer GENAU DIESE
-- Aenderung nachtragen.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Header (dieser Kommentar) -> event_typ-Header-Zeilen (12x) ->
-- event_typ_version-Zeilen (12x, Reihenfolge = B10-Reihenfolge:
-- berechnungslauf.* (4) -> klimadaten.import.* (2) ->
-- verfahren.katalog.aktiviert (1) -> baseline.periode.erfasst (1) ->
-- einflussgroesse.stammdaten.* (3) -> einflussgroesse.schwellwert.
-- ueberschritten (1)).

INSERT INTO audit.event_typ (code) VALUES
    ('berechnungslauf.bereinigung.angefordert'),
    ('berechnungslauf.bereinigung.abgeschlossen'),
    ('berechnungslauf.bereinigung.fehlgeschlagen'),
    ('berechnungslauf.bereinigung.ersetzt'),
    ('klimadaten.import.durchgefuehrt'),
    ('klimadaten.import.revision_erkannt'),
    ('verfahren.katalog.aktiviert'),
    ('baseline.periode.erfasst'),
    ('einflussgroesse.stammdaten.erfasst'),
    ('einflussgroesse.stammdaten.geaendert'),
    ('einflussgroesse.stammdaten.einsicht'),
    ('einflussgroesse.schwellwert.ueberschritten');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1)-(4) berechnungslauf.bereinigung.*
    (gen_random_uuid(), 'berechnungslauf.bereinigung.angefordert', 'berechnungslauf', 'anfordern',
     ARRAY['synthetic','lauf_id','endkunde_id','energietraeger','verfahren_code','verfahren_version',
           'periode_von','periode_bis','monate_anzahl','qualitaets_stufe','ersetzt_lauf_id','fehler_code'],
     false, false, true,
     'Berechnungslauf angefordert (PolicyAction create:berechnungslauf, ADR-0006 D1/B10). RESERVIERT: ADR-0006 Status proposed, kein Emitter im Repo. objekt_ref=analytics.berechnungslauf.id, ggf. NULL vor Abschluss (D1: kein Status im Nachweisartefakt). kontext.synthetic Pflicht-Tag (A9). KEIN Wert-Key (kWh/Temperatur/GTZ/Baseline) im Kontext (A9).',
     now()),
    (gen_random_uuid(), 'berechnungslauf.bereinigung.abgeschlossen', 'berechnungslauf', 'abschliessen',
     ARRAY['synthetic','lauf_id','endkunde_id','energietraeger','verfahren_code','verfahren_version',
           'periode_von','periode_bis','monate_anzahl','qualitaets_stufe','ersetzt_lauf_id','fehler_code'],
     false, false, true,
     'Berechnungslauf erfolgreich abgeschlossen -- der Lauf ENTSTEHT genau hier (D1, ADR-0006). RESERVIERT: kein Emitter im Repo. objekt_ref=analytics.berechnungslauf.id. kontext.synthetic Pflicht-Tag. KEIN Wert-Key im Kontext (A9).',
     now()),
    (gen_random_uuid(), 'berechnungslauf.bereinigung.fehlgeschlagen', 'berechnungslauf', 'fehlschlagen',
     ARRAY['synthetic','lauf_id','endkunde_id','energietraeger','verfahren_code','verfahren_version',
           'periode_von','periode_bis','monate_anzahl','qualitaets_stufe','ersetzt_lauf_id','fehler_code'],
     false, false, true,
     'Berechnungslauf fehlgeschlagen -- KEIN Nachweis-Artefakt entstanden (analytics.lauf_auftrag traegt fehler_code, D1). RESERVIERT: kein Emitter im Repo. objekt_ref i. d. R. NULL (kein berechnungslauf.id vorhanden). kontext.synthetic Pflicht-Tag. KEIN Wert-Key im Kontext (A9).',
     now()),
    (gen_random_uuid(), 'berechnungslauf.bereinigung.ersetzt', 'berechnungslauf', 'ersetzen',
     ARRAY['synthetic','lauf_id','endkunde_id','energietraeger','verfahren_code','verfahren_version',
           'periode_von','periode_bis','monate_anzahl','qualitaets_stufe','ersetzt_lauf_id','fehler_code'],
     false, false, true,
     'Neuberechnung: neuer Lauf ersetzt einen aelteren (F7b, ersetzt_lauf_id, D1: "der alte bleibt unangetastet"). RESERVIERT: kein Emitter im Repo. objekt_ref=analytics.berechnungslauf.id des NEUEN Laufs; kontext.ersetzt_lauf_id=Pseudonym-Verweis auf den ersetzten Lauf. kontext.synthetic Pflicht-Tag. KEIN Wert-Key im Kontext (A9).',
     now()),

    -- (5)-(6) klimadaten.import.*
    (gen_random_uuid(), 'klimadaten.import.durchgefuehrt', 'klimadaten_import', 'durchfuehren',
     ARRAY['synthetic','station_ref','von','bis','quelle','zeilen_anzahl','revision_anzahl','betroffene_laeufe_anzahl'],
     false, false, true,
     'Klimadaten-Import durchgefuehrt, schreibt/erweitert analytics.klima_tag (D4, PolicyAction create:klima_import). RESERVIERT: kein Emitter im Repo (Adapter-Lizenzfrage O-B1 geschlossen, DWD Open Data/CC BY 4.0 -- Implementierung steht aus). objekt_typ=klimadaten_import, KEIN objekt_ref (kein eigenes Entitaets-UUID in diesem Schema-Entwurf). kontext.synthetic Pflicht-Tag. KEIN Temperatur-/GTZ-Wert im Kontext (A9).',
     now()),
    (gen_random_uuid(), 'klimadaten.import.revision_erkannt', 'klimadaten_import', 'erkennen',
     ARRAY['synthetic','station_ref','von','bis','quelle','zeilen_anzahl','revision_anzahl','betroffene_laeufe_anzahl'],
     false, false, true,
     'Revisionsunterschied bei importierten Klimadaten erkannt (B4: "erzeugt ... einen Report betroffene Laeufe -- Ausloeser fuer eine Neuberechnung nach F7(b), NIE eine stille Aenderung"). RESERVIERT: kein Emitter im Repo. objekt_typ=klimadaten_import, KEIN objekt_ref. kontext.synthetic Pflicht-Tag. KEIN Temperatur-/GTZ-Wert im Kontext (A9).',
     now()),

    -- (7) verfahren.katalog.aktiviert
    (gen_random_uuid(), 'verfahren.katalog.aktiviert', 'verfahren_version', 'aktivieren',
     ARRAY['synthetic','verfahren_code','verfahren_version'],
     false, false, true,
     'Neue Verfahrens-Version im Katalog aktiviert (D3/B3: "gepflegt ausschliesslich ueber Migrationen" -- KEIN Laufzeit-Emitter vorgesehen, analog audit.katalog.geaendert V0003). RESERVIERT, begleitet kuenftig eine Katalog-Migration operativ. objekt_ref=analytics.verfahren_version.id. kontext.synthetic Pflicht-Tag.',
     now()),

    -- (8) baseline.periode.erfasst
    (gen_random_uuid(), 'baseline.periode.erfasst', 'baseline_periode', 'erfassen',
     ARRAY['synthetic','endkunde_id','energietraeger','von','bis','einheit'],
     false, false, true,
     'Baseline-Bezugszeitraum erfasst (energy.baseline_periode, D5/B12.1 -- GTZ_base-Grundlage). PolicyAction create:messkonzept_version (B10: keine eigene Aktion). RESERVIERT: kein Emitter im Repo. objekt_ref=energy.baseline_periode.id. kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN menge-Key im Kontext (nur einheit, A9/B10 woertlich).',
     now()),

    -- (9)-(11) einflussgroesse.stammdaten.*
    (gen_random_uuid(), 'einflussgroesse.stammdaten.erfasst', 'einflussgroesse', 'erfassen',
     ARRAY['synthetic','einflussgroesse_id','endkunde_id','system_id','groesse_code',
           'gueltig_ab_monat','gueltig_bis_monat','betroffener_typ','quelle_typ','rechtsgrundlage','anzahl_saetze'],
     false, false, true,
     'Einflussgroesse erfasst (einfluss.intervall, PolicyAction create:einflussgroesse, D8.2/D8.3, ADR-0006 B8/B10). RESERVIERT: kein Emitter im Repo. objekt_ref=einfluss.intervall.id. kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN wert_num/wert_code/anlass_code im Kontext (A9 -- Personenzahl/Nutzflaeche sind der PII-Wert selbst, s. V0020-Spaltenkommentar). rolle_erfassen=false: reversible Stammdaten-Mutation.',
     now()),
    (gen_random_uuid(), 'einflussgroesse.stammdaten.geaendert', 'einflussgroesse', 'aendern',
     ARRAY['synthetic','einflussgroesse_id','endkunde_id','system_id','groesse_code',
           'gueltig_ab_monat','gueltig_bis_monat','betroffener_typ','quelle_typ','rechtsgrundlage','anzahl_saetze'],
     false, false, true,
     'Einflussgroesse geaendert -- PATCH .../einflussgroessen/{id} (Korrektur/gueltigBisMonat setzen, PolicyAction update:einflussgroesse, D8.1 D-UPDATE-SCOPE: ausschliesslich Intervall-Schliessen; eine fachliche Korrektur legt zusaetzlich eine NEUE Zeile an, die dann Code (9) emittiert). RESERVIERT: kein Emitter im Repo. objekt_ref=einfluss.intervall.id. kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN wert_num/wert_code/anlass_code im Kontext (A9). rolle_erfassen=false.',
     now()),
    (gen_random_uuid(), 'einflussgroesse.stammdaten.einsicht', 'einflussgroesse', 'einsehen',
     ARRAY['synthetic','einflussgroesse_id','endkunde_id','system_id','groesse_code',
           'gueltig_ab_monat','gueltig_bis_monat','betroffener_typ','quelle_typ','rechtsgrundlage','anzahl_saetze'],
     true, false, true,
     'Klartext-PII-Einsicht einer/mehrerer Einflussgroessen -- GET .../einflussgroessen[/befunde] (PolicyAction read:einflussgroesse, B10: "eigene Defense-in-Depth-Deny-Regel fuer die Auditor-Rolle", "immer audit-pflichtig"). JEDE Einsicht wird auditiert, AUCH permit (analog stammdaten.verbrauch_detail.einsicht, V0006 (17)). RESERVIERT: kein Emitter im Repo. objekt_ref=einfluss.intervall.id (bei Batch-Einsicht: kontext.anzahl_saetze zusaetzlich). kontext.synthetic Pflicht-Tag. AUSDRUECKLICH KEIN wert_num/wert_code/anlass_code im Kontext (A9). rolle_erfassen=true: Klartext-PII-Lesen, woertlich aus B10 uebernommen.',
     now()),

    -- (12) einflussgroesse.schwellwert.ueberschritten
    (gen_random_uuid(), 'einflussgroesse.schwellwert.ueberschritten', 'einflussgroesse_befund', 'ueberschreiten',
     ARRAY['synthetic','system_id','groesse_code','schwellwert_code','zeitraum_von','zeitraum_bis','ueberschreitung_klasse'],
     false, false, true,
     'TB-03-Schwellwertueberschreitung erkannt (einfluss.befund, B10: "Der Schwellwert-Report laeuft unter derselben Aktion" wie read:einflussgroesse). RESERVIERT: kein Emitter im Repo (D6-Schwellwerte selbst noch nicht final durch compliance-director bestaetigt, s. V0020-Kopf D-KATALOG-SEED). objekt_ref=einfluss.befund.id. kontext.synthetic Pflicht-Tag. AUSDRUECKLICH klassiert (ueberschreitung_klasse) statt Rohprozentsatz im Kontext (A9/B12.5). rolle_erfassen=false: der Befund selbst ist kein Klartext-PII-Lesevorgang (dafuer Code (11)).',
     now());
