-- V0015__seed_geraet_zuordnung_events.sql
--
--
-- ADR-Bezug: docs/adr/ADR-0005-messdaten-ingestion.md §26.4 ("ABAC-Kontrolle
-- + Audit (Vorgabe-Punkt 4) -- drei getrennte Aktionen", O4-Audit-
-- Drei-Wege-Split: Provisioning voll auditiert / Reverse-Read
-- break-glass-auditiert / Worker-Vorwaerts-Lookup OHNE Einzel-Audit-Event)
-- + §26.5 ("Krypto-Shredding-Kopplung", DeviceKryptoShreddingService als
-- begleitender Schritt von EndkundeService.shred()) + §26.6 ("Der
-- Worker-Fluss im Detail") + §19 Punkt 3 ("kontext.synthetic=true als
-- Pflicht-Tag auf jedem ... Provisioning-/Aufloesungs-Audit-Ereignis").
-- Der Drei-Wege-Split ist gemaess ADR-0005-Kopf (Zeile 9) UND §32 (TD-9/SEC)
-- durch `compliance-director` bereits **woertlich bestaetigt** -- diese
-- Migration setzt eine bereits abgenommene Policy in Katalog-Zeilen um,
-- KEIN neuer Compliance-Entwurf.
--
-- Design-Owner dieser Migration (Migrations-Entwurf): database-lead
-- (direkter Arbeitsauftrag). Fachliche Spezifikation der vier Event-Codes,
-- ihrer Kontext-Key-Whitelist und der roten Linie RL-2 (kein DevEUI-
-- Klartext/kein deveui_blind_index im Kontext) ist durch ADR-0005 §22/§26
-- VORGEGEBEN, nicht in dieser Migration neu entworfen. Review vor Merge
-- (ausstehend): audit-trail-engineer (Katalog-Konsistenz zu V0006/V0009),
-- access-control-engineer (Abgleich gegen die drei PDP-Aktionen
-- `create:geraet_zuordnung`/`update:geraet_zuordnung`/`read:geraet_zuordnung`,
-- ADR-0005 §26.4-Tabelle), compliance-director (PII-/DSFA-0001-Bezug,
-- TD-9/SEC-Bestaetigung bereits vorliegend), security-lead (SEC-5-
-- Haertungs-Konsistenz fuer `reverse_aufgeloest`).
--
-- Vorlage/Muster: migrations/V0006__seed_stammdaten_event_typen.sql (Seed-
-- Konventionen: event_typ-Header + event_typ_version, gen_random_uuid() fuer
-- Migrations-Seed-Zeilen, RESERVIERT-Praezedenzfall fuer Codes ohne
-- v1-Emitter) und migrations/V0009__seed_shred_workflow_events.sql (Vier-
-- Augen-/rolle_erfassen-Praezedenz, kontext.antrag_id-Verkettungsmuster).
-- SCD2-Tabellen-DDL/Seal-Trigger unveraendert aus
-- migrations/V0003__audit_log_schema.sql (Tabellen `audit.event_typ` +
-- `audit.event_typ_version`, EXCLUDE-Constraint Zeile 261-263, Trigger
-- `audit.event_seal()` Schritt (2)/(3) Zeilen 683-695).
--
-- =====================================================================
-- NUMMERIERUNG
-- =====================================================================
-- `migrations/` enthaelt zum Zeitpunkt dieses Entwurfs lueckenlos
-- V0001..V0014 (hoechste vorhandene Datei:
-- V0014__messwert_qualitaet_herkunft_wertebereich.sql, laut Arbeitsauftrag
-- bereits angewendet). V0015 ist die naechste freie Nummer -- reine
-- Katalog-/Vokabular-Erweiterung, UNABHAENGIG von V0010
-- (device.geraet_zuordnung-Tabelle selbst, bereits gemergt) anwendbar
-- (Kontext-Werte in `audit.event.kontext` sind grundsaetzlich FK-frei,
-- ADR-0003 "KEIN FK (Linie 2)" -- `kontext.zaehler_id`/`kontext.antrag_id`
-- unten sind Text-Skalare, KEIN Cross-Tabellen-FK).
--
-- =====================================================================
-- VIER Codes (KANONISCH, wortgleich vom Backend zu emittieren) --
-- ALLE RESERVIERT (kein Emitter im Repo, Grep-Befund 2026-07-16: weder
-- Controller noch Service fuer device.geraet_zuordnung existieren bislang --
-- nur `blind-index.service.ts`/`blind-index-pepper.port.ts` erwaehnen die
-- Zieltabelle in Kommentaren). Katalog-Eintrag TROTZDEM jetzt angelegt
-- (Praezedenzfall V0006 fuer `stammdaten.verbrauch_detail.einsicht` und
-- V0009 fuer die drei shred_*-Workflow-Codes: Katalog steht bereit, damit
-- die Phase-4-Backend-Implementierung ohne weitere Schema-Migration
-- auskommt).
-- =====================================================================
--
-- objekt_typ='geraet_zuordnung' fuer ALLE VIER Codes (ein Schutzobjekt,
-- analog 'endkunde' fuer alle endkunde.*-Codes in V0006/V0009).
--
-- objekt_ref (fuer alle vier, nicht Teil der Katalog-Tabelle selbst, aber
-- hier dokumentiert fuer den kuenftigen Emitter): `device.geraet_zuordnung.id`
-- -- die EIGENE Entitaets-UUID der Zuordnungs-Zeile, NICHT `zaehler_id`.
-- Analog zum bereits etablierten Praezedenzfall `messkanal.stammdaten.
-- angelegt` (V0006 (10): "objekt_ref=Messkanal-UUID (eigene Entitaets-ID,
-- nicht Zaehler-ID)") -- `device.geraet_zuordnung` hat, anders als
-- `messkonzept`-Versionen (V0006 (13)), eine EIGENE Primaerschluessel-UUID
-- (V0010), daher KEIN Grund, auf `zaehler_id` als Objekt-Referenz
-- auszuweichen.
--
-- kontext.zaehler_id (Codes 1-3, NICHT Objekt-Referenz, sondern zusaetzlicher
-- Kontext-Key): O4 IST die DevEUI<->Zaehler-Korrelation -- die Kernaussage
-- jedes dieser Ereignisse ("fuer WELCHEN Zaehler wurde eine Geraete-Zuordnung
-- provisioniert/aktualisiert/geschreddert") waere ohne diesen Kontext-Key nur
-- ueber einen Zusatz-Join auf die (fuer den Zeitpunkt des Ereignisses ggf.
-- bereits ueberschriebene oder geshredderte) `device.geraet_zuordnung`-Zeile
-- selbst rekonstruierbar. `zaehler_id` ist ein Pseudonym (LOGISCHER Verweis
-- auf `energy.zaehler.id`, KEIN FK, ADR-0005 §26.1 rote Linie) -- KEIN
-- DevEUI-Bezug, daher unbedenklich fuer die Kontext-Whitelist (RL-2, s. u.).
--
-- ROTE LINIE RL-2 (ADR-0005 §22/§26, VERBINDLICH, hier durchgaengig
-- eingehalten): KEINER der vier Kontext-Key-Saetze enthaelt DevEUI-Klartext
-- oder `deveui_blind_index` -- ausschliesslich Pseudonyme (`zaehler_id`),
-- Metadaten (`pepper_version`, `zweck`, `ticket_ref`, `antrag_id`) und der
-- `synthetic`-Marker. Der Seal-Trigger (V0003 Schritt (3)) erzwingt diese
-- Whitelist strukturell -- ein Emitter, der versehentlich `deveui`/
-- `deveui_blind_index` als Kontext-Key mitgeben wollte, wuerde fail-closed
-- mit "kontext-key(s) nicht in Whitelist" abgelehnt.
--
-- kontext.synthetic (alle vier, Pflicht-Tag): ADR-0005 §19 Punkt 3, WOERTLICH:
-- "kontext.synthetic=true als Pflicht-Tag auf jedem ... Provisioning-/
-- Aufloesungs-Audit-Ereignis (§26.6) -- spiegelt SyntheticOnlyInterceptor's
-- Verhalten, aber im Worker-Kontext ohne HTTP-Request". Gilt hier fuer alle
-- vier Codes (Provisionierung/Aktualisierung/Schredding/Reverse-Aufloesung),
-- analog kontext.synthetic bei allen PII-Schreibrouten in V0006/V0009.
--
-- KEIN fuenfter Code fuer den Worker-eigenen Vorwaerts-Lookup: ADR-0005
-- §26.4-Tabelle, dritte Zeile, WOERTLICH: "(kein PolicyAction noetig) --
-- Worker-eigener Vorwaerts-Lookup ... kein Einzel-Event; Metrik/Zaehler
-- (Erfolg/Fehlschlag-Rate) statt Audit-Zeile" -- bewusste, vom
-- Drei-Wege-Split ausdruecklich vorgesehene Abwesenheit, KEIN Versehen
-- dieser Migration (>= 50.000 Uplinks/s waeren als Einzel-Audit-Ereignisse
-- operativ nicht tragbar, §26.4 Einleitung).
--
-- (1) `geraet_zuordnung.stammdaten.provisioniert` -- Provisioning-Create
--     (PolicyAction `create:geraet_zuordnung`, ADR-0005 §26.4-Tabelle:
--     Akteur `betrieb`, "Provisioning bei Geraete-Installation/-Tausch,
--     Phase-4-Erweiterung des Zaehler-Moduls"). aktion_kategorie=
--     'provisionieren' (NICHT 'anlegen' -- der Code selbst nennt den
--     Fachbegriff "provisioniert", nicht "angelegt"; aktion_kategorie
--     spiegelt durchgaengig den letzten Code-Segment-Verb, s. Praezedenz
--     V0006 'schreddern'/'stilllegen'/'einsehen'). kontext.pepper_version
--     zusaetzlich (NUR hier, nicht bei (2)): Pepper-Rotations-Version zum
--     Provisionierungszeitpunkt (device.geraet_zuordnung.pepper_version,
--     ADR-0005 §26.3) -- fachlich nur beim Erstanlegen einer Zuordnung
--     relevant (welcher Pepper wurde fuer den urspruenglichen Blind-Index
--     verwendet), nicht bei einer spaeteren Aktualisierung, die den
--     Blind-Index i. d. R. unveraendert laesst. rolle_erfassen=false:
--     reversible Stammdaten-Mutation, kein hochfolgenreicher/irreversibler
--     Vorgang (analog den 15 nicht-privilegierten Stammdaten-Codes, V0006).
--
-- (2) `geraet_zuordnung.stammdaten.aktualisiert` -- Provisioning-Update
--     (PolicyAction `update:geraet_zuordnung`, z. B. Geraete-Tausch am
--     selben Zaehler). aktion_kategorie='aktualisieren'. KEIN
--     kontext.pepper_version (s. Begruendung (1) -- bewusst schmalere
--     Whitelist als bei provisioniert; sollte sich das kuenftig als falsch
--     herausstellen, ist das eine neue SCD2-Version dieser Zeile, KEIN Edit).
--     rolle_erfassen=false, analog (1).
--
-- (3) `geraet_zuordnung.stammdaten.geschreddert` -- Device-Krypto-Shred
--     (DeviceKryptoShreddingService.shred(crypto_key_id), begleitender
--     Schritt INNERHALB der bereits akzeptierten Vier-Augen-
--     `EndkundeService.shred()` (ADR-0009), ADR-0005 §26.5). Art. 17 DSGVO,
--     IRREVERSIBEL: device.schluessel.wrapped_dek vernichtet; die
--     zugehoerige device.geraet_zuordnung-Zeile bekommt in DERSELBEN
--     Operation status='geschreddert' + gueltig_bis (kanonisches Praedikat
--     D-KANON, V0010) UND deveui_blind_index genullt (GB-C/D-GB, V0010,
--     compliance-director-Freigabe 2026-07-16). aktion_kategorie=
--     'schreddern' (identisch zu endkunde.stammdaten.geschreddert, V0006).
--     kontext.antrag_id=energy.endkunde_shred_antrag.id -- verkettet DIESE
--     Geraete-Shred-Zeile mit dem uebergeordneten Vier-Augen-Antrag des
--     zugehoerigen Endkunden, WORTGLEICHES Muster wie kontext.antrag_id bei
--     endkunde.stammdaten.geschreddert (seit V0009 Teil 2) und den drei
--     shred_*-Workflow-Codes (V0009 Teil 1) -- Text-Skalar, KEIN FK aus dem
--     Kontext heraus. kontext.zaehler_id bleibt AUCH nach dem Nullen des
--     Blind-Index als Audit-Spur erhalten (Pseudonym, KEIN Geraete-Korrelat,
--     ADR-0005 §26.5 GB-C: "bleibt allenfalls die zaehler_id-Historie stehen
--     ... bis sie eigenstaendig gelöscht/anonymisiert wird"). rolle_erfassen=
--     true: Teil DERSELBEN Vier-Augen-Kontrollspur wie endkunde.stammdaten.
--     geschreddert/shred_beantragt/shred_freigegeben/shred_abgelehnt
--     (V0006/V0009) -- identische Abwaegung Rechenschaft (Art. 5(2)) vor
--     Datensparsamkeit (Art. 5(1)(c)) fuer einen seltenen, irreversiblen
--     Vorgang.
--
-- (4) `geraet_zuordnung.stammdaten.reverse_aufgeloest` -- break-glass
--     Reverse-Auflösung (Zeile -> Klartext-DevEUI, PolicyAction
--     `read:geraet_zuordnung`, ADR-0005 §26.4 SEC-5-Auflage: EIGENSTAENDIGE
--     Haertung, NICHT die pauschale Uebernahme der read:verbrauch_detail-
--     Haertung aus ADR-0008 §16 -- eigene, eng geschnittene Rolle
--     "geraete-support", Begruendungs-/Ticket-Pflicht statt nur Zweck-Code,
--     eigene Zweck-Whitelist unabhaengig von BREAK_GLASS_ZWECK_WHITELIST,
--     Punkt- statt Zeitraum-Aufloesung, Echtzeit-Alert bei JEDEM permit).
--     aktion_kategorie='aufloesen' (bewusst OHNE 'reverse_'-Praefix im
--     Wert selbst -- "reverse" ist bereits im Code-Segment/objekt_typ-Kontext
--     hinreichend erfasst; aktion_kategorie folgt damit dem etablierten
--     Einzelwort-Stil, s. 'einsehen'/'ablehnen'/'freigeben'). JEDE
--     Aufloesung wird auditiert, AUCH permit (analog stammdaten.
--     verbrauch_detail.einsicht, V0006 (17)). kontext.zweck=whitelisted
--     Begruendungscode (eigene, von BREAK_GLASS_ZWECK_WHITELIST unabhaengige
--     Whitelist, ADR-0005 §26.4 SEC-5 Punkt 3 -- konkrete Werte final durch
--     security-lead/access-control-engineer; die DB-seitige Kontext-
--     Whitelist unten prueft NUR den Schluessel-Namen, NICHT den Wert,
--     analog zweck_code/ablehnungsgrund-Praezedenz V0006/V0009).
--     kontext.ticket_ref=strukturierter Vorgangs-Verweis (Begruendungs-/
--     Ticket-Pflicht, ADR-0005 §26.4 SEC-5 Punkt 2 -- rote Linie 2,
--     ADR-0008-Muster: KEIN Freitext). rolle_erfassen=true: WOERTLICH aus
--     ADR-0005 §26.4 SEC-5 Punkt 5 uebernommen ("Echtzeit-Alert bei JEDEM
--     permit ... periodischer Audit-Review als Pflichtprozess"), identische
--     Konvention wie stammdaten.verbrauch_detail.einsicht (V0006 (17)).
--
-- pflichtereignis=false fuer ALLE VIER Codes: Praezedenzfall-Uebernahme aus
-- V0003/V0004/V0006/V0009 (pflichtereignis=true bleibt AUSSCHLIESSLICH fuer
-- die STRIDE-Selbstpruef-Ereignisse des Audit-Subsystems reserviert -- kein
-- neuer Praezedenzfall in dieser Migration).
--
-- =====================================================================
-- BOOTSTRAP-AUSNAHME (fuer V0015 NEU geprueft, wie bei jeder Katalog-
-- Migration gefordert, s. V0006/V0007/V0009-Kopf "VERBINDLICHER HINWEIS")
-- =====================================================================
--
-- Diese Migration emittiert -- wie V0003/V0004/V0006/V0007/V0009 -- KEINE
-- eigene Zeile in `audit.event`. Pruefung, unabhaengig von den
-- Vorgaenger-Migrationen fuer DIESEN Zeitpunkt hergeleitet:
--   1. ADR-0005 traegt selbst den Status "accepted (v1 synthetic-only)"
--      (ADR-Kopf Zeile 3) -- das ADR-0004-Ingest-Gate bleibt unveraendert
--      ZU (§0/§19), v1 bleibt synthetic-only/pre-go-live.
--   2. KEINER der vier hier geseedeten Codes hat einen Emitter im Repo
--      (Grep-Befund oben) -- strukturell (noch) keine Moeglichkeit, dass
--      ein `audit.event` dieser Codes reale Geraete-/Personendaten traegt.
--   3. Der rein mechanische Grund aus V0003/V0004/V0006/V0009 gilt
--      unveraendert: ein SQL-Migrationsskript kann keinen validierten
--      `actor_*`-Principal herstellen (rote Linie 1).
-- ENTSCHEIDUNG: keine `audit.katalog.geaendert`-Selbst-Emission durch diese
-- Migration. VERBINDLICHER HINWEIS fuer V0016+: erneut zu pruefen, sobald
-- die Phase-4-Backend-Implementierung der Geraete-Zuordnungs-Routen
-- (Provisioning-Controller, DeviceKryptoShreddingService-Anschluss an
-- EndkundeService.shred(), Reverse-Aufloesungs-Route) live geht -- dann
-- sollte die naechste Katalog-Migration bzw. ein begleitender operativer
-- Prozess eine ECHTE, menschlich ausgefuehrte
-- `audit.append_event('audit.katalog.geaendert', ...)` fuer GENAU DIESE
-- Aenderung nachtragen.
--
-- =====================================================================
-- Reihenfolge dieser Datei
-- =====================================================================
-- Header (dieser Kommentar) -> event_typ-Header-Zeilen (4x) ->
-- event_typ_version-Zeilen (4x, Reihenfolge = kanonische ADR-0005
-- §26.4-Reihenfolge: Provisioning-Create -> Provisioning-Update ->
-- Shred-Kopplung (§26.5) -> Reverse-Read (§26.4 SEC-5)).

INSERT INTO audit.event_typ (code) VALUES
    ('geraet_zuordnung.stammdaten.provisioniert'),
    ('geraet_zuordnung.stammdaten.aktualisiert'),
    ('geraet_zuordnung.stammdaten.geschreddert'),
    ('geraet_zuordnung.stammdaten.reverse_aufgeloest');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    -- (1) Provisioning-Create. RESERVIERT (kein v1-Endpoint/Emitter).
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.provisioniert', 'geraet_zuordnung', 'provisionieren',
     ARRAY['synthetic','zaehler_id','pepper_version'], false, false, true,
     'Geraete-Zuordnung provisioniert = DevEUI<->Zaehler-Erstanlage, O4-Kernkorrelation (PolicyAction create:geraet_zuordnung, Akteur betrieb, ADR-0005 §26.4). RESERVIERT: kein v1-Endpoint/Emitter im Repo (Phase-4-Backend-Implementierung steht aus). objekt_ref=device.geraet_zuordnung.id (eigene Entitaets-UUID, analog messkanal.stammdaten.angelegt V0006), NICHT zaehler_id. kontext.synthetic Pflicht-Tag (ADR-0005 §19 Punkt 3/§26.6), kontext.zaehler_id=Pseudonym-Referenz auf energy.zaehler.id (LOGISCHER Verweis, kein FK), kontext.pepper_version=Pepper-Rotations-Version zum Provisionierungszeitpunkt (ADR-0005 §26.3). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (rote Linie RL-2, ADR-0005 §22/§26). rolle_erfassen=false: reversible Stammdaten-Mutation.',
     now()),

    -- (2) Provisioning-Update. RESERVIERT, analog (1).
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.aktualisiert', 'geraet_zuordnung', 'aktualisieren',
     ARRAY['synthetic','zaehler_id'], false, false, true,
     'Geraete-Zuordnung aktualisiert = z. B. Geraete-Tausch am selben Zaehler (PolicyAction update:geraet_zuordnung, Akteur betrieb, ADR-0005 §26.4). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=device.geraet_zuordnung.id, NICHT zaehler_id. kontext.synthetic Pflicht-Tag, kontext.zaehler_id=Pseudonym-Referenz auf energy.zaehler.id. KEIN kontext.pepper_version (bewusst schmalere Whitelist als provisioniert -- Aktualisierung aendert den urspruenglichen Blind-Index-Pepper i. d. R. nicht). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (RL-2). rolle_erfassen=false: reversible Stammdaten-Mutation.',
     now()),

    -- (3) Device-Krypto-Shred. Begleitender Schritt innerhalb der bereits
    -- akzeptierten Vier-Augen-EndkundeService.shred() (ADR-0009), ADR-0005
    -- §26.5. RESERVIERT: DeviceKryptoShreddingService noch nicht implementiert.
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.geschreddert', 'geraet_zuordnung', 'schreddern',
     ARRAY['synthetic','zaehler_id','antrag_id'], true, false, true,
     'Geraete-Zuordnung krypto-geschreddert = Art. 17 DSGVO, IRREVERSIBEL (DeviceKryptoShreddingService.shred, begleitender Schritt innerhalb EndkundeService.shred(), ADR-0005 §26.5). device.schluessel.wrapped_dek vernichtet; die Zeile bekommt in derselben Operation status=geschreddert+gueltig_bis (D-KANON) UND deveui_blind_index genullt (GB-C/D-GB, V0010). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=device.geraet_zuordnung.id. kontext.synthetic Pflicht-Tag, kontext.zaehler_id=Pseudonym-Referenz (bleibt nach Blind-Index-Nullung als Audit-Spur erhalten, ADR-0005 §26.5 GB-C), kontext.antrag_id=energy.endkunde_shred_antrag.id (verkettet mit dem uebergeordneten Vier-Augen-Antrag des Endkunden, wortgleiches Muster wie endkunde.stammdaten.geschreddert seit V0009 Teil 2 und den drei shred_*-Workflow-Codes, V0009 Teil 1). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (RL-2). rolle_erfassen=true: Teil derselben Vier-Augen-Kontrollspur wie endkunde.stammdaten.geschreddert/shred_beantragt/shred_freigegeben/shred_abgelehnt (V0006/V0009).',
     now()),

    -- (4) break-glass Reverse-Auflösung. EIGENSTAENDIGE Haertung (ADR-0005
    -- §26.4 SEC-5), NICHT Uebernahme der read:verbrauch_detail-Haertung.
    -- RESERVIERT: Reverse-Aufloesungs-Route noch nicht implementiert.
    (gen_random_uuid(), 'geraet_zuordnung.stammdaten.reverse_aufgeloest', 'geraet_zuordnung', 'aufloesen',
     ARRAY['synthetic','zaehler_id','zweck','ticket_ref'], true, false, true,
     'break-glass Reverse-Auflösung einer Geraete-Zuordnung = Zeile -> Klartext-DevEUI (PolicyAction read:geraet_zuordnung, EIGENSTAENDIGE Haertung: eigene Rolle geraete-support, Ticket-Pflicht, eigene Zweck-Whitelist, Punkt- statt Zeitraum-Aufloesung, ADR-0005 §26.4 SEC-5). JEDE Aufloesung wird auditiert, AUCH permit (analog stammdaten.verbrauch_detail.einsicht, V0006). RESERVIERT: kein v1-Endpoint/Emitter im Repo. objekt_ref=device.geraet_zuordnung.id. kontext.synthetic Pflicht-Tag, kontext.zaehler_id=Pseudonym-Referenz, kontext.zweck=whitelisted Begruendungscode (eigene, von BREAK_GLASS_ZWECK_WHITELIST unabhaengige Whitelist, ADR-0005 §26.4 SEC-5 Punkt 3 -- DB prueft nur den Schluessel-Namen, nicht den Wert), kontext.ticket_ref=strukturierter Vorgangs-Verweis (SEC-5 Punkt 2, kein Freitext). KEIN DevEUI-Klartext/deveui_blind_index im Kontext (RL-2). rolle_erfassen=true: woertlich aus ADR-0005 §26.4 SEC-5 Punkt 5 (Echtzeit-Alert bei jedem permit + periodischer Audit-Review als Pflichtprozess), analog stammdaten.verbrauch_detail.einsicht (V0006).',
     now());
