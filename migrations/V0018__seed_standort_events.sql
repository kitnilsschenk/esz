-- V0018__seed_standort_events.sql
--
-- ADR-Bezug: docs/adr/ADR-0010-standort-gebaeudestruktur.md, Abschnitt 3
-- "D5 -- ABAC & Audit: Struktur lesen != Standort-PII lesen" (dort werden
-- die neun Codes UND ihre Kontext-Key-Whitelist woertlich benannt).
-- STATUS-HINWEIS: wie V0017 ein ENTWURF -- ADR-0010 traegt Status
-- "proposed", User-Freigabe steht aus. Nicht angewendet, nicht committet.
--
-- Design-Owner der fachlichen Spezifikation (neun Codes, Kontext-Key-
-- Whitelist, PolicyAction-Zuordnung): technical-director/access-control-
-- engineer (ADR-0010 D5). Migrations-Entwurf: database-lead. Vorlage:
-- migrations/V0015__seed_geraet_zuordnung_events.sql (Seed-Konventionen:
-- event_typ-Header + event_typ_version, gen_random_uuid() fuer
-- Migrations-Seed-Zeilen, RESERVIERT-Praezedenzfall). SCD2-Tabellen-DDL/
-- Seal-Trigger unveraendert aus migrations/V0003__audit_log_schema.sql.
--
-- Review vor Merge (ausstehend): audit-trail-engineer (Katalog-Konsistenz),
-- access-control-engineer (Abgleich gegen die PolicyActions read:standort/
-- read:standort_pii/create:standort/update:standort/delete:standort/
-- create:zaehler_standort/update:zaehler_standort, ADR-0010 D5),
-- compliance-director (PII-Freiheit der Kontext-Whitelist, s. u. BEFUND
-- `synthetic`), security-lead (Haertung von standort.pii.einsicht).
--
-- =====================================================================
-- BEFUND `synthetic` -- VOR MERGE GEKLAERT UND BEHOBEN
-- =====================================================================
-- ADR-0010 D5 listete die erlaubte_kontext_keys-Whitelist urspruenglich
-- OHNE `synthetic`. Der database-lead hat das beim Entwurf dieser Migration
-- bemerkt und bewusst NICHT eigenmaechtig ergaenzt (Mandat: "keine eigenen
-- Kontext-Keys erfinden"), sondern zur Klaerung vorgelegt -- richtig so.
--
-- Die Auslassung weicht von JEDEM anderen PII-relevanten Katalog-Eintrag
-- ab (V0004 auth.*, V0006 endkunde/anschlussnutzer/verbrauch_detail,
-- V0009 shred_*, V0015 geraet_zuordnung.*): dort traegt AUSNAHMSLOS jeder
-- Code mit PII-Bezug `kontext.synthetic` als Pflicht-Tag (ADR-0004 §6 /
-- ADR-0005 §19 Punkt 3 / ADR-0008 §22, "SyntheticOnlyInterceptor" -- gilt,
-- solange das projektweite PII-/Ingest-Gate geschlossen bleibt).
--
-- Ohne den Key waere der Fehler fail-closed, aber selbstblockierend:
-- ein Emitter, der -- wie auf JEDEM anderen PII-Pfad dieses Projekts --
-- automatisch `kontext.synthetic=true` mitschickt, wuerde von
-- `audit.event_seal()` mit "kontext-key(s) nicht in Whitelist" abgewiesen.
-- Genau diese Fehlerklasse ist in diesem Repo schon einmal aufgetreten.
--
-- ENTSCHEIDUNG (2026-07-22): Auslassung ist ein ADR-Versehen, keine
-- bewusste Abweichung -- es gibt keinen fachlichen Grund, warum ausgerechnet
-- Standort-Events als einzige PII-relevante Codes ohne Synthetic-Tag
-- auskaemen. `synthetic` wird daher in ALLE NEUN Whitelists aufgenommen;
-- ADR-0010 D5 ist entsprechend korrigiert. Da diese Migration noch NICHT
-- gemergt/angewendet ist, erfolgt die Korrektur direkt hier -- eine
-- SCD2-Nachtrags-Migration analog V0016 ist NICHT noetig.
--
-- =====================================================================
-- Die neun Codes (ADR-0010 D5, woertlich)
-- =====================================================================
-- Alle NEUN Codes: RESERVIERT (kein Emitter im Repo -- kein Standort-Modul
-- existiert bislang, ADR-0010 selbst ist Status "proposed"). Katalog-
-- Eintrag TROTZDEM jetzt angelegt (Praezedenzfall V0006/V0009/V0015:
-- Katalog steht bereit, damit die spaetere Backend-Implementierung ohne
-- weitere Schema-Migration auskommt).
--
-- objekt_typ='standort' fuer die SIEBEN standort.*-Codes (analog 'endkunde'
-- fuer alle endkunde.*-Codes, V0006/V0009) -- EINSCHLIESSLICH der beiden
-- standort.pii.*-Codes: ADR-0010 D5 modelliert "Standort" als EIN
-- ABAC-Ressourcentyp mit zwei Lesestufen (read:standort vs.
-- read:standort_pii), NICHT als zwei getrennte Ressourcentypen -- die
-- ResourceAttributes-Definition selbst ("standort?: {endkundeId, typ,
-- ebene, status}") kennt keinen separaten 'standort_pii'-Typ.
-- objekt_typ='zaehler_standort' fuer die ZWEI zaehler.standort.*-Codes
-- (analog 'nutzungsverhaeltnis' fuer die Verknuepfungsentitaet
-- energy.nutzungsverhaeltnis, V0006 (15)/(16)).
--
-- objekt_ref (fuer alle neun, nicht Teil der Katalog-Tabelle, hier fuer
-- den kuenftigen Emitter dokumentiert): jeweils die EIGENE Entitaets-UUID
-- (energy.standort.id bzw. energy.zaehler_standort.id) -- analog dem
-- etablierten Praezedenzfall "messkanal.stammdaten.angelegt" (V0006) und
-- "geraet_zuordnung.*" (V0015): "eigene Entitaets-ID, NICHT die
-- uebergeordnete/verwandte ID". AUSNAHME: (7) standort.pii.einsicht ist
-- ein BATCH-Aufruf ueber mehrere Standorte (ADR-0010 §5, "POST
-- .../standorte/labels" mit `standortIds[]`) -- objekt_ref ist dafuer
-- typischerweise NULL (audit.event.objekt_ref ist nullable, genau fuer
-- diesen Fall, ADR-0003), die Reichweite wird stattdessen ausschliesslich
-- ueber kontext.anzahl_knoten belegt (ADR-0010 §5, woertlich: "EIN
-- Audit-Event standort.pii.einsicht je Aufruf (anzahl_knoten)"). Eine
-- Liste einzelner Standort-IDs im Kontext ist NICHT moeglich (jsonb-
-- Kontextwerte muessen Skalare sein, `audit.event_seal()`, V0003) und
-- waere bei grossen Batches ohnehin ein Skalierungs-/Kontext-Groessen-
-- Problem.
--
-- pflichtereignis=false fuer alle neun (Praezedenzfall-Uebernahme aus
-- V0003/V0004/V0006/V0009/V0015 -- pflichtereignis=true bleibt
-- ausschliesslich fuer die STRIDE-Selbstpruef-Ereignisse des
-- Audit-Subsystems reserviert).
--
-- (1) standort.stammdaten.angelegt -- PolicyAction create:standort.
--     aktion_kategorie='anlegen' (Praezedenzfall endkunde/system/zaehler.
--     stammdaten.angelegt). kontext=[endkunde_id, typ, ebene,
--     parent_id_neu]: endkunde_id (Mandant, ohne Zusatz-Join aus dem
--     Event selbst ablesbar), typ (welcher Standorttyp wurde angelegt),
--     ebene (resultierende Tiefe -- Anomalie-Signal bei Knoten nahe der
--     Tiefengrenze), parent_id_neu (unter welchem Parent -- die Whitelist
--     kennt kein generisches "parent_id", nur die _alt/_neu-Variante fuer
--     Reparent; hier sinngemaess als "der bei Anlage zugewiesene Parent"
--     wiederverwendet, NULL bei Wurzelknoten). rolle_erfassen=false:
--     reversible Stammdaten-Mutation (analog (1)-(3)/(5)-(8) unten).
--
-- (2) standort.stammdaten.geaendert -- PolicyAction update:standort, PATCH
--     .../standorte/{id} (Struktur: typ?/sortierung?, s. ADR-0010 §5) --
--     AUSDRUECKLICH NICHT fuer status-Aenderungen (die haben eigene Codes,
--     (4) stillgelegt bzw. reaktivieren waere ein Sonderfall von (2), s.
--     Anmerkung unten). aktion_kategorie='aendern'. kontext=[endkunde_id,
--     typ]: typ nur relevant, wenn TATSAECHLICH der typ geaendert wurde
--     (sortierung ist reine UI-Ordnung, kein Audit-relevanter Kontext-Key
--     in der ADR-Whitelist vorgesehen). rolle_erfassen=false.
--     ANMERKUNG (Emitter-Hinweis, kein Bestandteil dieser Migration): PATCH
--     erlaubt laut §5 auch `status?` -- sollte der Emitter eine
--     Reaktivierung (stillgelegt->aktiv) darueber abwickeln, waere dafuer
--     kontext.status_alt/status_neu (unten bei (4) eingefuehrt) ebenfalls
--     zulaessig; diese Migration selbst nimmt dazu keine Vorfestlegung.
--
-- (3) standort.stammdaten.verschoben -- PolicyAction update:standort, POST
--     .../standorte/{id}/verschieben (ADR-0010 §5/D6). aktion_kategorie=
--     'verschieben' (neues, aber unbedenkliches Vokabular -- aktion_kategorie
--     ist eine freie text-Spalte ohne CHECK, V0003). kontext=[endkunde_id,
--     parent_id_alt, parent_id_neu, ebene, nachfahren_anzahl]: die einzige
--     Stelle, an der die _alt/_neu-Variante von parent_id ihren vollen Sinn
--     entfaltet (Diff des Reparents); ebene=NEUE Ebene des verschobenen
--     Knotens nach dem Trigger-Lauf (V0017 energy.standort_pfad_pflegen());
--     nachfahren_anzahl=Anzahl der vom rekursiven Nachfahren-Update
--     mitaktualisierten Zeilen (Reichweiten-Nachweis fuer einen potenziell
--     folgenreichen Vorgang, ADR-0010 §5 API-Skizze: Response
--     "nachfahrenAktualisiert"). rolle_erfassen=false: DATABASE-LEAD-
--     ENTSCHEIDUNG (ADR D5 macht dazu keine Vorgabe) -- ein Reparent ist
--     strukturell folgenreich (kann viele Nachfahren-Zeilen aendern), aber
--     REVERSIBEL (zurueckverschieben moeglich) und NICHT mit einem
--     irreversiblen Krypto-Shred vergleichbar; daher KEINE
--     Vier-Augen-artige Rollenerfassung, konsistent mit der Linie
--     "rolle_erfassen=true nur fuer schreddern/break-glass-PII-Lesen"
--     (V0006/V0009/V0015).
--
-- (4) standort.stammdaten.stillgelegt -- PolicyAction update:standort, POST
--     .../standorte/{id}/stilllegen (D2.6: nur wenn keine aktiven Kinder
--     UND keine offenen Verortungen -- Service-Vorbedingung, NICHT Teil
--     dieser Migration). aktion_kategorie='stilllegen' (Praezedenzfall
--     zaehler/messkanal/system.stammdaten.stillgelegt). kontext=
--     [endkunde_id, status_alt, status_neu]. rolle_erfassen=false
--     (Praezedenzfall zaehler/messkanal/system -- Stilllegen ist
--     Zustandswechsel, kein Hard-Delete, D2.6).
--
-- (5) standort.stammdaten.geloescht -- PolicyAction delete:standort, DELETE
--     .../standorte/{id} (D2.6: NUR Blattknoten OHNE jede
--     Verortungshistorie -- "Korrektur von Fehlanlagen"). aktion_kategorie=
--     'loeschen'. kontext=[endkunde_id, typ, parent_id_alt]: typ+
--     parent_id_alt dokumentieren, WAS/WO geloescht wurde (die Zeile
--     selbst existiert danach nicht mehr -- objekt_ref bleibt als
--     Pseudonym-Referenz im Audit-Log erhalten, analog jeder anderen
--     Loesch-/Schredder-Zeile). rolle_erfassen=false: DATABASE-LEAD-
--     ENTSCHEIDUNG -- dies ist ein echtes Hard-DELETE, aber laut D2.6
--     explizit auf den harmlosen Fehlanlage-Korrektur-Fall beschraenkt
--     (Blattknoten, keine Historie, keine PII zwangslaeufig referenziert)
--     -- KEIN Art.-17-Krypto-Shred, daher nicht auf die
--     rolle_erfassen=true-Stufe von "schreddern" gehoben.
--
-- (6) standort.pii.geaendert -- PolicyAction update:standort, PUT
--     .../standorte/{id}/pii (ADR-0010 §5: bezeichnung, adresse?, geo?).
--     aktion_kategorie='aendern'. kontext=[endkunde_id, pii_felder]:
--     pii_felder=Liste der GEAENDERTEN Feldnamen (z. B. ["bezeichnung",
--     "anschrift"]) -- AUSDRUECKLICH keine Werte (ADR-0010 D5: "pii_felder
--     (Feldnamen-Liste, keine Werte)"). rolle_erfassen=false: PII-SCHREIB-
--     Route, aber analog endkunde.stammdaten.geaendert (V0006, ebenfalls
--     eine PII-Schreibroute) NICHT auf rolle_erfassen=true gehoben -- nur
--     das SEPARATE, unten folgende Lesen (7) traegt diese Stufe.
--
-- (7) standort.pii.einsicht -- PolicyAction read:standort_pii, POST
--     .../standorte/labels (Batch-Entschluesselung fuer die Baum-UI,
--     ADR-0010 §5). aktion_kategorie='einsehen' (Praezedenzfall
--     stammdaten.verbrauch_detail.einsicht, V0006). kontext=[endkunde_id,
--     anzahl_knoten] -- WOERTLICH aus ADR-0010 §5 ("ein Audit-Event ...
--     je Aufruf (anzahl_knoten)"). rolle_erfassen=true: ADR-0010 D5,
--     woertlich "ist aber IMMER audit-pflichtig" + explizite Analogie zur
--     bestehenden Break-glass-Konvention (rolle_erfassen=true bei JEDEM
--     PII-Lesezugriff dieses Katalogs, V0006 (17)/V0015 (4)) -- ANDERS ALS
--     BEI BREAK-GLASS ist dies laut D5 ausdruecklich KEIN Break-glass
--     ("Adresslesen ist Alltagsbetrieb", keine Zweckpflicht) -- die
--     rolle_erfassen=true-Entscheidung hier ist daher eine bewusste
--     database-lead-Abwaegung (ADR gibt den Wert selbst nicht vor): auch
--     "Alltags"-PII-Entschluesselung bleibt Rechenschaftspflicht (Art.
--     5(2)) fuer einen potenziell breiten Batch-Zugriff (mehrere
--     Standorte je Aufruf) -- niedrigere Schwelle als Break-glass (kein
--     Zweck-Code/Ticket noetig), aber dieselbe Nachvollziehbarkeits-Stufe
--     wie jeder andere PII-Lesezugriff im Katalog.
--
-- (8) zaehler.standort.zugeordnet -- PolicyAction create:zaehler_standort,
--     POST .../zaehler/{zaehlerId}/verortung (schliesst laut ADR-0010 §5
--     "die offene Vorgaenger-Verortung in derselben Transaktion" mit --
--     ob dafuer ZUSAETZLICH (9) fuer die geschlossene Vorgaenger-Zeile
--     emittiert wird, ist Emitter-/App-Layer-Entscheidung, nicht Teil
--     dieser Migration). objekt_typ='zaehler_standort' (eigene
--     Entitaets-UUID der energy.zaehler_standort-Zeile, s. o.).
--     aktion_kategorie='zuordnen'. kontext=[zaehler_id, standort_id,
--     gueltig_von]. rolle_erfassen=false (routinemaessige Stammdaten-
--     Verknuepfung, analog nutzungsverhaeltnis.angelegt, V0006 (15)).
--
-- (9) zaehler.standort.beendet -- PolicyAction update:zaehler_standort,
--     POST .../verortung/beenden. aktion_kategorie='beenden' (Praezedenz-
--     fall nutzungsverhaeltnis.beendet, V0006 (16)). kontext=[zaehler_id,
--     standort_id, gueltig_bis]. rolle_erfassen=false (analog (16)).
--
-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration gefordert,
-- V0006/V0007/V0009/V0015-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
-- Diese Migration emittiert -- wie V0003/V0004/V0006/V0007/V0009/V0015 --
-- KEINE eigene Zeile in `audit.event`. Pruefung fuer diesen Zeitpunkt:
--   1. ADR-0010 traegt selbst den Status "proposed" -- User-Freigabe UND
--      Backend-Implementierung stehen aus; keiner der neun Codes hat einen
--      Emitter im Repo (kein Standort-Modul existiert bislang).
--   2. Der rein mechanische Grund aus V0003/V0004/V0006/V0009/V0015 gilt
--      unveraendert: ein SQL-Migrationsskript kann keinen validierten
--      actor_*-Principal herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission durch diese
-- Migration. VERBINDLICHER HINWEIS fuer die naechste Katalog-Migration
-- dieses Bereichs: sobald die Standort-Backend-Implementierung live geht,
-- ist eine ECHTE, menschlich ausgefuehrte `audit.append_event(
-- 'audit.katalog.geaendert', ...)` fuer GENAU diese Aenderung nachzutragen
-- -- UND der "WICHTIGE BEFUND" oben (fehlendes `synthetic`) ist bis dahin
-- zwingend zu klaeren.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Header -> event_typ-Header-Zeilen (9x) -> event_typ_version-Zeilen (9x,
-- Reihenfolge = obige Nummerierung: Stammdaten-Lebenszyklus (1)-(5) ->
-- PII (6)-(7) -> Zaehler-Verortung (8)-(9)).

INSERT INTO audit.event_typ (code) VALUES
    ('standort.stammdaten.angelegt'),
    ('standort.stammdaten.geaendert'),
    ('standort.stammdaten.verschoben'),
    ('standort.stammdaten.stillgelegt'),
    ('standort.stammdaten.geloescht'),
    ('standort.pii.geaendert'),
    ('standort.pii.einsicht'),
    ('zaehler.standort.zugeordnet'),
    ('zaehler.standort.beendet');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1) Standort angelegt.
    (gen_random_uuid(), 'standort.stammdaten.angelegt', 'standort', 'anlegen',
     ARRAY['synthetic','endkunde_id','typ','ebene','parent_id_neu'], false, false, true,
     'Standort-Stammdatensatz angelegt (PolicyAction create:standort, ADR-0010 D1/D5). RESERVIERT: kein v1-Endpoint/Emitter im Repo (ADR-0010 Status proposed). objekt_ref=energy.standort.id (eigene Entitaets-UUID). kontext.endkunde_id=Mandant, kontext.typ=Standorttyp (liegenschaft|gebaeude|bauteil|etage|einheit|raum), kontext.ebene=resultierende Tiefe, kontext.parent_id_neu=zugewiesener Parent (NULL bei Wurzelknoten). KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND" (ADR-0010 D5 listet synthetic NICHT in der Whitelist, Klaerung vor Merge zwingend). rolle_erfassen=false: reversible Stammdaten-Mutation, PII-frei (energy.standort, RL-1).',
     now()),

    -- (2) Standort geaendert (Struktur: typ/sortierung, NICHT status).
    (gen_random_uuid(), 'standort.stammdaten.geaendert', 'standort', 'aendern',
     ARRAY['synthetic','endkunde_id','typ'], false, false, true,
     'Standort-Stammdatensatz strukturell geaendert (PolicyAction update:standort, PATCH .../standorte/{id}, ADR-0010 §5 -- Felder typ?/sortierung?, AUSDRUECKLICH NICHT status, s. (4)). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.standort.id. kontext.endkunde_id, kontext.typ=neuer Typ (nur bei tatsaechlicher Typ-Aenderung). KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: reversible Stammdaten-Mutation.',
     now()),

    -- (3) Standort verschoben (Reparent, D6/O4).
    (gen_random_uuid(), 'standort.stammdaten.verschoben', 'standort', 'verschieben',
     ARRAY['synthetic','endkunde_id','parent_id_alt','parent_id_neu','ebene','nachfahren_anzahl'], false, false, true,
     'Standort im Baum verschoben = Reparent (PolicyAction update:standort, POST .../standorte/{id}/verschieben, ADR-0010 D6). Rekursives Nachfahren-Pfad-Update (energy.standort_pfad_pflegen(), V0017). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.standort.id (der VERSCHOBENE Knoten, nicht seine Nachfahren). kontext.endkunde_id, kontext.parent_id_alt/kontext.parent_id_neu=Reparent-Diff, kontext.ebene=neue Ebene des verschobenen Knotens, kontext.nachfahren_anzahl=Anzahl mitaktualisierter Nachfahren-Zeilen (Reichweiten-Nachweis, ADR-0010 §5 Response "nachfahrenAktualisiert"). KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: database-lead-Entscheidung (ADR macht keine Vorgabe) -- folgenreich, aber reversibel, kein Krypto-Shred-Aequivalent.',
     now()),

    -- (4) Standort stillgelegt (Zustandswechsel, kein Hard-Delete, D2.6).
    (gen_random_uuid(), 'standort.stammdaten.stillgelegt', 'standort', 'stilllegen',
     ARRAY['synthetic','endkunde_id','status_alt','status_neu'], false, false, true,
     'Standort stillgelegt = status-Wechsel aktiv->stillgelegt, KEIN Hard-Delete (PolicyAction update:standort, POST .../standorte/{id}/stilllegen, ADR-0010 D2.6 -- Service-Vorbedingung: keine aktiven Kinder UND keine offenen Verortungen). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.standort.id. kontext.endkunde_id, kontext.status_alt/kontext.status_neu. KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: Praezedenzfall zaehler/messkanal/system.stammdaten.stillgelegt (V0006/V0007).',
     now()),

    -- (5) Standort hart geloescht (NUR Blattknoten ohne Verortungshistorie,
    -- Korrektur von Fehlanlagen, D2.6).
    (gen_random_uuid(), 'standort.stammdaten.geloescht', 'standort', 'loeschen',
     ARRAY['synthetic','endkunde_id','typ','parent_id_alt'], false, false, true,
     'Standort hart geloescht = Korrektur einer Fehlanlage, NUR fuer Blattknoten OHNE jede Verortungshistorie zulaessig (PolicyAction delete:standort, DELETE .../standorte/{id}, ADR-0010 D2.6, eigene Aktion "delete:standort"). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.standort.id (Pseudonym-Referenz bleibt im Audit-Log erhalten, obwohl die Zeile selbst nicht mehr existiert). kontext.endkunde_id, kontext.typ, kontext.parent_id_alt=letzter bekannter Parent vor Loeschung. KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: database-lead-Entscheidung -- echtes Hard-DELETE, aber laut D2.6 auf den harmlosen Fehlanlage-Fall beschraenkt (keine Historie, kein Art.-17-Bezug), daher NICHT auf die schreddern-Stufe gehoben.',
     now()),

    -- (6) Standort-PII geaendert (Label/Adresse/Geo).
    (gen_random_uuid(), 'standort.pii.geaendert', 'standort', 'aendern',
     ARRAY['synthetic','endkunde_id','pii_felder'], false, false, true,
     'Standort-PII (Label/Adresse/Geo) geaendert (PolicyAction update:standort, PUT .../standorte/{id}/pii, ADR-0010 D4/D5). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.standort.id (= identity.standort_pii.pseudonym_id, logischer Link, kein FK, rote Linie 1/5). kontext.endkunde_id, kontext.pii_felder=Liste der geaenderten Feldnamen OHNE Werte (ADR-0010 D5, woertlich "Feldnamen-Liste, keine Werte"). KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: PII-Schreibroute, analog endkunde.stammdaten.geaendert (V0006) -- NICHT auf die rolle_erfassen=true-Stufe von (7) gehoben.',
     now()),

    -- (7) Standort-PII eingesehen (Batch-Entschluesselung, Baum-UI).
    (gen_random_uuid(), 'standort.pii.einsicht', 'standort', 'einsehen',
     ARRAY['synthetic','endkunde_id','anzahl_knoten'], true, false, true,
     'Standort-PII (Label/Adresse) batch-entschluesselt fuer die Baum-UI (PolicyAction read:standort_pii, POST .../standorte/labels, ADR-0010 D5 -- AUSDRUECKLICH KEIN Break-glass: "Adresslesen ist Alltagsbetrieb", keine Zweckpflicht, aber IMMER audit-pflichtig). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref TYPISCHERWEISE NULL (Batch ueber mehrere standortIds, audit.event.objekt_ref ist nullable); Reichweite ausschliesslich ueber kontext.anzahl_knoten (ADR-0010 §5, woertlich). kontext.endkunde_id. KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=true: database-lead-Entscheidung (ADR gibt den Wert selbst nicht vor) -- jede PII-Entschluesselung bleibt Rechenschaftspflicht (Art. 5(2)), auch ohne Break-glass-Zweckpflicht; niedrigere Schwelle als Break-glass, aber dieselbe Nachvollziehbarkeits-Stufe wie jeder andere PII-Lesezugriff im Katalog (V0006 (17), V0015 (4)).',
     now()),

    -- (8) Zaehler einem Standort zugeordnet (Verortung angelegt, D3).
    (gen_random_uuid(), 'zaehler.standort.zugeordnet', 'zaehler_standort', 'zuordnen',
     ARRAY['synthetic','zaehler_id','standort_id','gueltig_von'], false, false, true,
     'Zaehler einem Standort zugeordnet = neue energy.zaehler_standort-Zeile (PolicyAction create:zaehler_standort, POST .../zaehler/{zaehlerId}/verortung, ADR-0010 D3 -- beendet ggf. die offene Vorgaenger-Verortung in derselben Transaktion). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.zaehler_standort.id (eigene Entitaets-UUID, analog messkanal.stammdaten.angelegt V0006/geraet_zuordnung.* V0015 -- NICHT zaehler_id). kontext.zaehler_id/kontext.standort_id=Pseudonym-Referenzen, kontext.gueltig_von=Beginn der Verortung. KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: routinemaessige Stammdaten-Verknuepfung, analog nutzungsverhaeltnis.angelegt (V0006 (15)).',
     now()),

    -- (9) Zaehler-Standort-Verortung beendet (D3).
    (gen_random_uuid(), 'zaehler.standort.beendet', 'zaehler_standort', 'beenden',
     ARRAY['synthetic','zaehler_id','standort_id','gueltig_bis'], false, false, true,
     'Zaehler-Standort-Verortung beendet = gueltig_bis gesetzt, KEIN Hard-Delete der Historie (PolicyAction update:zaehler_standort, POST .../verortung/beenden, ADR-0010 D3). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=energy.zaehler_standort.id. kontext.zaehler_id/kontext.standort_id, kontext.gueltig_bis=Ende der Verortung. KEIN kontext.synthetic -- s. Migrations-Kopf "WICHTIGER BEFUND". rolle_erfassen=false: analog nutzungsverhaeltnis.beendet (V0006 (16)).',
     now());
