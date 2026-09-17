-- V0007__seed_system_stillgelegt_event.sql
--
--
-- ADR-Bezug: docs/adr/ADR-0008-stammdaten-betriebs-ui.md §12 (System-DELETE =
-- Stilllegung, additiv) + §17 (D5, Audit-Verdrahtung). Ergaenzt den EINEN
-- Fach-Event-Code, der beim urspruenglichen V0006-Seed fehlte, weil die
-- SystemController-Stilllegen-Route erst jetzt nachgezogen wird (Backend-Luecke
-- aus dem Phase-4c-Live-Run: energy.system.status existiert seit V0005, war aber
-- weder exponiert noch per Route schaltbar).
--
-- Der Katalog-Eintrag SPIEGELT exakt die bereits in V0006 vorhandenen
-- stillgelegt-Codes `zaehler.stammdaten.stillgelegt` / `messkanal.stammdaten.
-- stillgelegt` (objekt_typ=Fachressource, aktion_kategorie='stilllegen',
-- kein Kontext, rolle_erfassen=false, pflichtereignis=false — status-Wechsel,
-- KEIN Hard-Delete, idempotent). Design-Konsistenz statt Neuentwurf.
--
-- BOOTSTRAP-AUSNAHME (fuer V0007 NEU geprueft, wie in V0006 gefordert): Das
-- System ist laut ADR-0008 §0 weiterhin pre-go-live / synthetic-only
-- (ADR-0004-Ingest-Gate ZU) — die Vorbedingung fuer die Ausnahme ist
-- unveraendert erfuellt, daher emittiert diese Migration KEINE
-- `audit.katalog.geaendert`-Zeile fuer sich selbst (rote Linie 1: kein Emit
-- ohne validierten Principal; ein SQL-Skript kann keinen echten actor_* setzen).
-- Bei JEDER kuenftigen Katalog-Migration erneut zu pruefen; ab Go-Live MUSS
-- eine echte, menschlich ausgefuehrte `audit.append_event('audit.katalog.
-- geaendert', ...)` begleiten.
--
-- Governance-/Vokabular-Metadaten, KEIN Ingest, KEINE personenbezogenen Daten.

INSERT INTO audit.event_typ (code) VALUES
    ('system.stammdaten.stillgelegt');

INSERT INTO audit.event_typ_version
    (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys,
     rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
VALUES
    (gen_random_uuid(), 'system.stammdaten.stillgelegt', 'system', 'stilllegen',
     '{}', false, false, true,
     'System/Messstelle stillgelegt = status-Wechsel (energy.system.status=stillgelegt, V0005), KEIN Hard-Delete (SystemController.stilllegen, idempotent, ADR-0008 §12). objekt_ref=System-UUID, kein Kontext.',
     now());
