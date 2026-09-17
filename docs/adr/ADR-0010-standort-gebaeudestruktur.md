# ADR-0010: Standort-/Gebäudestruktur (räumliche Verortung)

- **Status:** **proposed**
- **Datum:** 2026-07-21
- **Autor:** technical-director
- **Reviewer:** `compliance-director` — **Kurzvotum 2026-07-21: kein Veto, keine neue DSFA, keine neue Verarbeitungsart** (Art. 6 Abs. 1 lit. b trägt mit), **vier bindende Auflagen** (A1–A4, in D1/D4/D5/D6 eingearbeitet, nicht als offene Punkte weitergereicht). Ausstehend: `database-lead` (D2/D6 Pfad-Pflege, Reparent-Kosten), `access-control-engineer` (D5).
- **Freigabe:** ausstehend (User). Grundentscheidungen 1–4 der Ausgangslage sind bereits vom User gesetzt und werden hier nicht neu aufgerollt.
- **Bezug:** ADR-0004 (Kern-Datenmodell, rote Linien 1/5), ADR-0008 (Stammdaten-/Betriebs-UI, ABAC), ADR-0009 (Krypto-Shredding), ADR-0005 §26 (Shred-Dimension GB-C als Muster)

> **Reifegrad:** Design-Dokument. Keine Migration, kein Code. DDL/API sind Skizzen für die Impl.-Phase (nächste freie Migrationsnummer: `V0017`).

---

## 1. Kontext

`energy.system` ist die **fachliche** BAFA-Klammer (Systemgrenze, Messkonzept, Baseline, Einsparung). Es fehlt die **räumliche** Achse: wo steht ein Zähler physisch? Ohne sie sind Betriebsführung, Auswertungen je Gebäude/Einheit, die Klimastations-Zuordnung für die Witterungsbereinigung und die Nutzerinformation je Mieteinheit nicht sauber abbildbar.

Gesetzt (User): kein Multi-Tenancy — `energy.endkunde` ist der Mandant; fachliche und räumliche Achse bleiben getrennt, ein System darf gebäudeübergreifend sein; der Baum ist beliebig tief; Standorte tragen eigene, feld-verschlüsselte Adressen.

## 2. Rote Linien

- **RL-1: `energy.standort` ist vollständig PII-frei.** Keine Klartext-Semantik — auch kein „unverfängliches" Label. `energy` muss in Analytics-, Export- und Debug-Pfaden ohne PII-Prüfung nutzbar bleiben; das ist die tragende TOM (compliance-director A1).
- **RL-2: Kein geteilter Standort-Record über Endkundengrenzen.** Ein Gebäude, das mehreren Endkunden dient, wird als **zwei** Standort-Datensätze modelliert (je Mandant einer). Keine mandantenübergreifende Adress-Deduplizierung, kein gemeinsamer Gebäudekatalog. Damit ist der Shred-Kaskaden-Konflikt konstruktiv ausgeschlossen (A3).
- **RL-3: Standort-PII erscheint nicht in Exporten, Logs oder Suchindex.** BAFA-Exporte referenzieren ausschließlich Standort-Pseudonyme (A4).

## 3. Entscheidungen

### D1 — Eine rekursive Entität mit `typ`-Diskriminator

`energy.standort`, self-referencing über `parent_id`, `typ ∈ {liegenschaft, gebaeude, bauteil, etage, einheit, raum}` (CHECK-Whitelist, additiv erweiterbar). Wurzeln haben `parent_id IS NULL`; `endkunde_id` wird auf **jedem** Knoten geführt (s. D2.1).

Die Entität trägt **keinerlei Freitext**: `id`, `endkunde_id`, `parent_id`, `typ`, `pfad`, `ebene`, `sortierung`, `status`, Zeitstempel. Bezeichnung und Adresse liegen ausschließlich in `identity.standort_pii` (D4, A1). `sortierung` (int) ersetzt die alphabetische Label-Sortierung, die in `energy` nicht mehr möglich ist.

*Warum eine Tabelle:* Alle Ebenen haben dieselben Attribute. Getrennte Tabellen je Ebene erzwingen eine feste Tiefe — genau das, was ausgeschlossen wurde — und kosten pro Auswertung 5–6 Joins statt eines Subtree-Prädikats. Ein Diskriminator liefert *einen* ABAC-Ressourcentyp, *einen* Endpoint-Satz, *eine* Audit-Event-Familie.

*Verworfen:* (a) Tabelle je Ebene — feste Tiefe, Join-Explosion, jede neue Ebene = Migration + Endpoint. (b) EAV/JSONB-Baum — keine referenzielle Integrität, nicht auditierbar.

### D2 — Integritätsregeln des Baums

1. **Mandantentreue deklarativ:** `UNIQUE (id, endkunde_id)` plus zusammengesetzter Self-FK `FOREIGN KEY (parent_id, endkunde_id) REFERENCES energy.standort (id, endkunde_id)`. Ein Knoten kann damit **nie** unter einen Standort eines anderen Endkunden gehängt werden — ohne Trigger, ohne Applikationslogik. Die Redundanz von `endkunde_id` ist der bewusste Preis und zugleich der ABAC-Filter.
2. **Zyklen:** verhindert über den materialisierten Pfad (D6) — der Trigger wirft bei `NEW.id = ANY(parent.pfad)`. Ein rekursiver Prüf-Query beim Verschieben entfällt.
3. **Tiefenbegrenzung: ja, hart bei 10** (`CHECK (ebene BETWEEN 0 AND 9)`). Fachlich reichen 6; die Grenze schützt Reparent-Updates (D6) und die Baum-UI. Kein weiches Limit — ein weiches Limit wird nie durchgesetzt.
4. **Wurzel-Typ:** `CHECK (parent_id IS NOT NULL OR typ IN ('liegenschaft','gebaeude'))` — jede Wurzel ist ein adressfähiger Anker (D4).
5. **Typ-Abfolgen unterhalb der Wurzel werden NICHT erzwungen.** Ein Raum darf direkt unter einer Liegenschaft hängen. *Warum:* Trafostationen, Heizzentralen und Freiflächenanlagen kennen kein Gebäude; jede erzwungene Ebenenmatrix erzeugt Dummy-Knoten („Gebäude: entfällt"), die die Daten schlechter machen als die Freiheit. Die UI schlägt die kanonische Abfolge vor und warnt bei Sprüngen — Vorschlag, nicht Constraint.
6. **Löschsemantik: kein Kaskaden-Löschen.** `status ∈ {aktiv, stillgelegt}` analog `energy.zaehler`. *Stilllegen* nur, wenn (a) keine aktiven Kinder und (b) keine offenen Verortungen (`gueltig_bis IS NULL`) am Knoten hängen — Service-Vorbedingung im selben Transaktions-Lock. *Hartes* `DELETE` nur für Blattknoten ohne jede Verortungshistorie (Korrektur von Fehlanlagen), eigene Aktion `delete:standort`. Verortete Zähler werden durch Stilllegung nicht angefasst; ihre Historie bleibt gültig.

### D3 — Verortung des Zählers: eigene Tabelle mit Temporalität

`energy.zaehler_standort (zaehler_id, standort_id, gueltig_von, gueltig_bis)` mit `EXCLUDE`-Overlap-Schutz je `zaehler_id` — dasselbe Muster wie `energy.nutzungsverhaeltnis`.

*Warum temporal:* Zähler werden umgebaut und versetzt. „Verbrauch Gebäude B im Januar" muss den Zähler dort zählen, wo er **im Januar** hing. Eine skalare Spalte `energy.zaehler.standort_id` überschreibt diese Wahrheit lautlos; der Fehler fällt erst im BAFA-Nachweis auf.

*Kardinalität:* Verortung auf **Zähler**-Ebene, nicht auf `messkanal` (Kanäle teilen das physische Gerät).

*Pflicht:* **optional.** Ein Zähler darf vor der Standortpflege existieren (Altdaten-Import, Erstinbetriebnahme). Stattdessen ein Vollständigkeits-Check „unverortete Zähler" in der Betriebs-UI und im BAFA-Export-Preflight. Ein `NOT NULL` blockierte den Import und erzeugte Dummy-Standorte.

*Verworfen:* (a) Spalte auf `energy.zaehler` — Historienverlust. (b) Bitemporalität — für v1 Overkill; Korrekturen sind über das Audit-Log nachvollziehbar.

### D4 — PII: `identity.standort_pii` mit **Adresse UND Bezeichnung**, gebunden an den Endkunden-DEK

Neue Tabelle `identity.standort_pii`: `pseudonym_id` = `energy.standort.id` (logischer Link, **kein** FK), `bezeichnung_enc`, `anschrift_enc`, optional `geo_enc`.

**`bezeichnung_enc` ist der wichtigere der beiden Werte** (A1): die PII-Falle ist nicht die Anschrift, sondern das Label — „Wohnung Müller", „Büro Schenk". Ein Klartext-Label in `energy` gäbe die TOM „`energy` ist PII-frei nutzbar" auf. Deshalb liegt jedes Label verschlüsselt in `identity`, auf **allen** Ebenen.

**DEK-Bindung: der DEK des Endkunden** (A2), kein eigener Schlüssel je Standort. Ein Standort ist kein Datensubjekt, sondern ein Attribut des Subjekts „Endkunde". Konsequenzen — explizit mitentschieden:
- `identity.standort_pii` trägt **kein** `UNIQUE (crypto_key_id)`: das „1 DEK je Subjekt"-Muster aus `endkunde_pii`/`anschlussnutzer_pii` gilt hier bewusst **nicht** (1:n Standorte je DEK). FK auf `identity.subjekt_schluessel` ohne UNIQUE; die Invariante „Standort-DEK == Endkunden-DEK" wird **service-seitig** geprüft (kein Cross-Namespace-FK möglich, rote Linie 1/5).
- **AAD muss `standort_id` enthalten.** Bei gemeinsamem DEK ließe sich ein Chiffrat sonst zwischen zwei Standorten desselben Endkunden umhängen, ohne dass es kryptografisch auffällt. Zentrale Sicherheitsauflage dieses ADR.
- **Neue Shred-Dimension:** `EndkundeService.shred()` erhält die Dimension „Standort-PII" analog zur Geräte-Dimension GB-C (ADR-0005 §26), inklusive Nachweis im Shred-Report (Anzahl neutralisierter Standort-PII-Zeilen). Der DEK selbst wird ohnehin nur einmal vernichtet — der Report muss die Reichweite trotzdem belegen.

**Wo eine Adresse zulässig ist:** Pflicht auf jedem Wurzelknoten; optional auf `gebaeude` unterhalb einer Liegenschaft (abweichende Straße im Campus); **verboten** auf `bauteil`/`etage`/`einheit`/`raum`. Vererbung nach unten ist eine Lese-Operation (nächster Vorfahre mit Adresse), keine Kopie. `bezeichnung_enc` dagegen existiert auf jeder Ebene.

**Klimastations-Ableitung:** aus der Adresse wird einmalig `energy.standort.klimareferenz` abgeleitet (Stations-ID für Gradtagzahlen). Sie ist bewusst **gröber als eine PLZ** (Stationseinzugsgebiet ≥ Kreisebene) und damit kein Ortsbezug im Sinne von RL-1; die Witterungsbereinigung greift dann nie auf die Adresse zu. PLZ wird ausdrücklich **nicht** nach `energy` gespiegelt. Bestätigung der Grobkörnigkeit: O2.

*Verworfen:* Adresse/Label im Klartext in `energy` (bricht RL-1); Adresse nur am Endkunden (deckt Mehr-Liegenschafts-Kunden nicht ab); eigener DEK je Standort (verlagert die Vollständigkeit von Art. 17 in eine Schleife über n Schlüssel — dort entsteht der Fehler „einen vergessen, PII überlebt den Shred").

### D5 — ABAC & Audit: Struktur lesen ≠ Standort-PII lesen

**Neue `PolicyAction`s:**
`read:standort` (Struktur: Baum, Pseudonyme, Typ, Ebene — für Auswerte-Rollen), `read:standort_pii` (entschlüsseltes Label/Adresse), `create:standort`, `update:standort`, `delete:standort`, `create:zaehler_standort`, `update:zaehler_standort`.

Die Trennung ist bindend (A4): der Baum muss **strukturell, ohne Labels**, für Auswertungen nutzbar sein; das Entschlüsseln ist ein eigenes Recht, kein Beifang. Alle Aktionen klassifizieren über die bestehende `classifyAction()`-Präfixlogik korrekt — **kein** Eingriff dort nötig. `read:standort_pii` trägt **keine** break-glass-Zweckpflicht (Adresslesen ist Alltagsbetrieb), ist aber **immer** audit-pflichtig.

**Neue `ResourceAttributes`:** `standort?: { endkundeId, typ, ebene, status }` — ausschließlich Nicht-PII, aufgelöst über `params['standortId']`. Niemals Label oder Adresse im PDP.

**Neue Audit-Event-Codes:**
`standort.stammdaten.angelegt`, `.geaendert`, `.verschoben`, `.stillgelegt`, `.geloescht`, `standort.pii.geaendert`, `standort.pii.einsicht`, `zaehler.standort.zugeordnet`, `zaehler.standort.beendet`.

**`erlaubte_kontext_keys` (Whitelist, PII-frei):** `synthetic`, `standort_id`, `endkunde_id`, `typ`, `ebene`, `parent_id_alt`, `parent_id_neu`, `nachfahren_anzahl`, `zaehler_id`, `gueltig_von`, `gueltig_bis`, `status_alt`, `status_neu`, `pii_felder` (Feldnamen-Liste, keine Werte), `anzahl_knoten` (bei Batch-Einsicht).
**Verboten:** jeder Label- oder Adressbestandteil, Koordinaten.

> **Korrektur 2026-07-22 (Rev. 1):** `synthetic` fehlte in der ursprünglichen Fassung dieser Whitelist — aufgefallen beim Migrations-Entwurf (`database-lead`, V0018). Es ist ein Versehen, keine bewusste Abweichung: **jeder** andere PII-relevante Katalog-Eintrag im Repo (V0004, V0006, V0009, V0015) führt `synthetic` als Pflicht-Tag, solange das PII-/Ingest-Gate geschlossen ist. Ohne den Key hätte der erste Emitter, der ihn — wie auf jedem anderen PII-Pfad — automatisch mitschickt, am Seal-Trigger fail-closed abgewiesen werden müssen.

### D6 — Abfragepfad: materialisierter Pfad (`uuid[]`) + GIN, rein in `energy`

`energy.standort.pfad uuid[] NOT NULL` (Vorfahrenkette **inklusive** eigener `id`) und `ebene int`, per `BEFORE INSERT/UPDATE`-Trigger gepflegt. Subtree-Abfrage:

```sql
WHERE s.pfad @> ARRAY[:knoten_id]::uuid[]   -- GIN-indexgestützt, ein Prädikat
```

*Warum:* „Alle Zähler und Messwerte unterhalb dieses Knotens" ist **die** Query jeder späteren Auswertung. Sie muss (A4/RL-1) **ohne Join nach `identity`** funktionieren — mit verschlüsselten Labels ist jede label-basierte Navigation ohnehin ausgeschlossen. Ein rekursives CTE ist pro Aufruf ein Baum-Walk ohne Index-Unterstützung und kombiniert schlecht mit weiteren Prädikaten (Zeitfenster, Energieträger). Der materialisierte Pfad ist ein einzelnes indexiertes Containment-Prädikat. Preis: `verschieben` aktualisiert die Pfade aller Nachfahren — begrenzt durch die Tiefengrenze (D2.3), selten und explizit auditiert.

*Verworfen:* (a) **Rekursives CTE ad hoc** — kein Index-Support auf dem Hot-Path; bleibt als Konsistenz-Check verfügbar. (b) **`ltree`** — neue Extension; Labels müssten `[A-Za-z0-9_]` sein, also UUID-Transformation, und sprechende Labels sind hier ohnehin verschlüsselt; Mehrwert gegenüber `uuid[]` + GIN marginal, Ops-Abhängigkeit real. (c) **Closure-Table** — quadratische Zeilenzahl, dritte zu pflegende Struktur; lohnt nur bei häufigem Reparenting.

## 4. Schema-Skizze (DDL-nah, keine Migration)

```sql
-- energy: PII-FREI (RL-1) -- keine Bezeichnung, keine Adresse, kein Freitext
CREATE TABLE energy.standort (
    id            uuid PRIMARY KEY,                 -- App-UUIDv7, kein DB-Default
    endkunde_id   uuid NOT NULL REFERENCES energy.endkunde(id),
    parent_id     uuid,
    typ           text NOT NULL,                    -- liegenschaft|gebaeude|bauteil|etage|einheit|raum
    pfad          uuid[] NOT NULL,                  -- Vorfahren inkl. self, Trigger-gepflegt
    ebene         int  NOT NULL,
    sortierung    int  NOT NULL DEFAULT 0,          -- Geschwisterreihenfolge (Label-Sortierung entfaellt)
    klimareferenz text,                             -- grobkoernige Stations-ID (D4, O2)
    status        text NOT NULL DEFAULT 'aktiv',    -- aktiv|stillgelegt
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, endkunde_id),
    FOREIGN KEY (parent_id, endkunde_id)
        REFERENCES energy.standort (id, endkunde_id),                     -- D2.1
    CHECK (typ IN ('liegenschaft','gebaeude','bauteil','etage','einheit','raum')),
    CHECK (parent_id IS NOT NULL OR typ IN ('liegenschaft','gebaeude')),  -- D2.4
    CHECK (ebene BETWEEN 0 AND 9),                                        -- D2.3
    CHECK (parent_id <> id)
);
CREATE INDEX ix_standort_pfad     ON energy.standort USING gin (pfad);
CREATE INDEX ix_standort_endkunde ON energy.standort (endkunde_id) WHERE status = 'aktiv';
CREATE INDEX ix_standort_parent   ON energy.standort (parent_id);
-- Trigger: energy.standort_pfad_pflegen() -- pfad/ebene aus parent, wirft bei
--   Zyklus (NEW.id = ANY(parent.pfad)), propagiert Pfade rekursiv beim Reparent.
-- Trigger: energy.set_updated_at() (bestehend)

CREATE TABLE energy.zaehler_standort (
    id          uuid PRIMARY KEY,
    zaehler_id  uuid NOT NULL REFERENCES energy.zaehler(id),
    standort_id uuid NOT NULL REFERENCES energy.standort(id),
    gueltig_von timestamptz NOT NULL,
    gueltig_bis timestamptz,                         -- NULL = aktuell
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ex_zaehler_standort_no_overlap EXCLUDE USING gist (
        zaehler_id WITH =,
        tstzrange(gueltig_von, gueltig_bis) WITH &&
    )
);
CREATE INDEX ix_zaehler_standort_aktiv ON energy.zaehler_standort (standort_id)
    WHERE gueltig_bis IS NULL;

-- identity: PII, feldverschluesselt, KEIN FK nach energy (rote Linie 1/5)
CREATE TABLE identity.standort_pii (
    id              uuid PRIMARY KEY,
    pseudonym_id    uuid  NOT NULL UNIQUE,           -- = energy.standort.id, KEIN FK
    crypto_key_id   uuid  NOT NULL REFERENCES identity.subjekt_schluessel(id),
        -- BEWUSST OHNE UNIQUE (A2): 1 Endkunden-DEK : n Standorte.
        -- Invariante "Standort-DEK == Endkunden-DEK" service-seitig geprueft.
    bezeichnung_enc bytea NOT NULL,                  -- Label, AAD bindet standort_id
    anschrift_enc   bytea,                           -- nur liegenschaft/gebaeude (D4)
    geo_enc         bytea,
    pii_status      text  NOT NULL DEFAULT 'aktiv',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
-- COMMENT ON COLUMN identity.standort_pii.bezeichnung_enc IS
--   'pii=true; grundlage=Art.6(1)(b); retention=an Endkunde gebunden;
--    Loeschung=Krypto-Shredding des Endkunden-DEK (ADR-0009, Shred-Dimension Standort-PII)';
```

**Kern-Query (Zähler unter Knoten X zum Stichtag T) — ohne `identity`:**

```sql
SELECT z.*
  FROM energy.standort s
  JOIN energy.zaehler_standort zs ON zs.standort_id = s.id
   AND tstzrange(zs.gueltig_von, zs.gueltig_bis) @> :T
  JOIN energy.zaehler z ON z.id = zs.zaehler_id
 WHERE s.pfad @> ARRAY[:knoten_id]::uuid[];
```

## 5. API-Skizze

| Methode | Pfad | Aktion | Wesentliche Felder |
|---|---|---|---|
| `GET` | `/stammdaten/endkunden/{endkundeId}/standorte` | `read:standort` | Query `wurzelId?`, `maxTiefe?`, `nurAktive?`; Response **ohne Labels**: `id,parentId,typ,ebene,sortierung,status,hatAdresse,zaehlerAnzahl` |
| `POST` | `/stammdaten/endkunden/{endkundeId}/standorte/labels` | `read:standort_pii` | Body `{ standortIds[] }` → `{ id, bezeichnung, anschrift? }`; Batch-Entschlüsselung für die Baum-UI, **ein** Audit-Event `standort.pii.einsicht` je Aufruf (`anzahl_knoten`) |
| `POST` | `/stammdaten/endkunden/{endkundeId}/standorte` | `create:standort` | `typ`, `parentId?`, `sortierung?`, `bezeichnung` (→ verschlüsselt), `adresse?` |
| `PATCH` | `/stammdaten/standorte/{id}` | `update:standort` | `typ?`, `sortierung?`, `status?` (Struktur) |
| `PUT` | `/stammdaten/standorte/{id}/pii` | `update:standort` | `bezeichnung`, `adresse?`, `geo?` → `standort.pii.geaendert` |
| `POST` | `/stammdaten/standorte/{id}/verschieben` | `update:standort` | `neuerParentId` (null = Wurzel); Response `nachfahrenAktualisiert` |
| `POST` | `/stammdaten/standorte/{id}/stilllegen` | `update:standort` | `grund` (whitelisted) |
| `DELETE` | `/stammdaten/standorte/{id}` | `delete:standort` | nur Blatt ohne Verortungshistorie |
| `GET` | `/stammdaten/standorte/{id}/zaehler` | `read:standort` | Query `stichtag?` (Default now), `inklusiveUnterknoten=true` |
| `POST` | `/stammdaten/zaehler/{zaehlerId}/verortung` | `create:zaehler_standort` | `standortId`, `gueltigVon` — beendet die offene Vorgänger-Verortung in derselben Transaktion |
| `POST` | `/stammdaten/zaehler/{zaehlerId}/verortung/beenden` | `update:zaehler_standort` | `gueltigBis` |

Alle schreibenden Routen: `Idempotency-Key`, Transaktion, `@Fachaktion(...)`, `@AuditAction(...)`. Zeitstempel UTC. Kein Standort-Label in Fehlermeldungen, Logs oder Problem-Details (RL-3).

## 6. Offene Punkte

- **O1 (`compliance-director`, nicht v1):** Schwellenwert-/k-Anonymitäts-Regel für aggregierte Ausgaben auf Einheits-/Raumebene — kommt gebündelt mit der offenen R-0004-Regel vor dem Real-Ingest.
- **O2 (`compliance-director`):** Bestätigung, dass `energy.standort.klimareferenz` grobkörnig genug ist (Stationseinzugsgebiet ≥ Kreisebene), sonst entfällt die Spalte und die Stationszuordnung wird zur Laufzeit aus `identity` aufgelöst.
- **O3 (`dsgvo-auditor`, nicht v1):** Erweiterung der Re-Identifikations-Testfälle um die Standort-Dimension.
- **O4 (`database-lead`):** Reparent-Trigger — rekursives Nachfahren-Update, Lock-Reihenfolge, Batch-Grenze; Benchmark bei ~10⁴ Knoten je Endkunde.
- **O5 (`baseline-engineer`/`integration-engineer`):** Ableitungsregel Adresse → `klimareferenz` (Aktualisierungsintervall, Fallback ohne Adresse).
- **O6 (`ux-lead`/`frontend-lead`):** Baum-UI (ADR-0008) — Labels kommen aus einem separaten, auditierten Batch-Call; Ladeverhalten, Caching-Grenzen (kein Label-Cache über die Session hinaus), Tastaturbedienbarkeit WCAG 2.2 AA für Tree-Views.
- **O7 (Impl.):** Migrationszuschnitt `V0017` (`energy.standort`, `energy.zaehler_standort`, `identity.standort_pii`) und `V0018` (Audit-Katalog-Seed der neun Event-Codes aus D5); Erweiterung `EndkundeService.shred()` um die Standort-PII-Dimension inkl. Shred-Report-Nachweis.
