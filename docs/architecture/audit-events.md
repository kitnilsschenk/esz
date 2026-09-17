# Audit-Event-Katalog

- **Owner:** audit-trail-engineer (Fachschema) / database-lead (Migration) / security-lead (Review)
- **Erstellt:** 2026-07-13 — `/add-audit-event`-Arbeitspaket für die AuthN/AuthZ-Event-Typen (ADR-0002 Teil B, Phase 4)
- **Referenz:** `docs/adr/ADR-0002-auth-modul.md` §15 (D5 — Audit-Emitter), `docs/adr/ADR-0003-audit-log.md` §13.2 (kontrolliertes Vokabular), `migrations/V0003__audit_log_schema.sql` (Katalog-Schema), `migrations/V0004__seed_auth_event_typen.sql` (Auth-Seed)

Dieses Dokument ist das **lebendige Register** des Event-Typ-Katalogs
(`audit.event_typ` + `audit.event_typ_version`, SCD2, append-only). Jeder
künftige `/add-audit-event`-Lauf **ergänzt** diese Tabelle (neue Zeile/n),
**editiert nicht** rückwirkend fachliche Entscheidungen bereits gültiger
Versionen — Änderungen an einem bestehenden Code (z. B. neue erlaubte
Kontext-Keys) werden als **neue Katalog-Version** (neue `event_typ_version`-
Zeile mit `gueltig_ab`) migriert und hier als neue Tabellenzeile bzw.
Änderungsvermerk nachgetragen, niemals durch Löschen/Überschreiben der alten
Zeile. Der Katalog selbst ist **kein** `audit.event`-Beweismittel-Objekt
(`audit.event_typ`/`_version` stehen nicht unter `REVOKE UPDATE, DELETE`,
V0003-Migrations-Kopf, Abweichung (f)) — dieses Dokument beschreibt die
fachliche, nicht die technische Unveränderlichkeit.

## Event-Typen (Stand: V0006)

| Code | aktion_kategorie | objekt_typ | erlaubte_kontext_keys | ergebnis-Werte (Ist) | rolle_erfassen | pflichtereignis | Auslöser | Seed | ADR |
|---|---|---|---|---|---|---|---|---|---|
| `audit.retention.durchgefuehrt` | loeschen | `audit_retention_freigabe` | `freigabe_id`, `chunk_aelter_als` | ok (geplant) | false | true | `audit.retention_drop()` — Vier-Augen-Freigabe + verifizierter Cold-Export vor `drop_chunks()` | V0003 | ADR-0003 §15.5/§19 |
| `audit.anker.versiegelt` | erstellen | `audit_anker` | `stufe`, `periode_start`, `periode_ende`, `anzahl_gesamt` | ok (geplant) | false | true | `audit.versiegle()` — Stunden-/Tages-Anker | V0003 | ADR-0003 §14.5 |
| `audit.anker.publiziert` | exportieren | `audit_anker_publikation` | `stufe`, `periode_start`, `publikations_ref` | ok (geplant) | false | true | `audit.markiere_publiziert()` — externe signierte Publikation | V0003 | ADR-0003 §14.5/O-E |
| `audit.katalog.geaendert` | aendern | `audit_event_typ_version` | `code`, `version_id` | ok (geplant) | false | true | Neue `audit.event_typ_version`-Zeile (`/add-audit-event`) | V0003 | ADR-0003 §13.2 |
| `audit.ddl.gemeldet` | melden | `pg_ddl_command` | `command_tag`, `object_identity` | reserviert, kein Writer (`melde_ddl()` sendet nur `pg_notify`) | false | true | DDL-Event-Trigger `trg_audit_ddl` (nur bei Superuser aktiv) | V0003 | ADR-0003 §15.5/O-F |
| `auth.anmeldung.erfolg` | anmelden | `auth_sitzung` | `client_id` (reserviert, aktuell nicht befüllt) | ok | false | false | `AuthService.handleCallback()` nach vollständiger ID-Token-Validierung | V0004 | ADR-0002 §15 |
| `auth.anmeldung.fehlschlag` | anmelden | `auth_versuch` | `grund` (Enum, s. u.) | denied | false | false | `AuthService.emitLoginFailure()` — OIDC-Callback-Fehlschlag vor/während Token-Validierung | V0004 | ADR-0002 §15 |
| `auth.token.erneuert` | erneuern | `auth_sitzung` | — | ok | false | false | `AuthService.tryEmitRefreshSuccess()` — Refresh-Rotation, Best-effort `sub`-Attribution | V0004 | ADR-0002 §15 |
| `auth.abmeldung.erfolg` | abmelden | `auth_sitzung` | — | ok | false | false | `AuthService.logout()` — Refresh-Cookie-Löschung + best-effort IdP-End-Session | V0004 | ADR-0002 §15 |
| `authz.zugriff.verweigert` | melden | `authz_entscheidung` | `grund` (Enum, s. u.), `route_muster` | denied | **true** | false | Fallback für AuthZ-Ablehnungen (403) **außerhalb** eines `@AuditAction`-Kontexts — **reserviert, Emitter noch nicht verdrahtet** (s. Entscheidung unten) | V0004 | ADR-0002 §15, M2 |
| `endkunde.stammdaten.angelegt` | anlegen | `endkunde` | `synthetic` | ok/denied/error | false | false | `EndkundeController.anlegen()` (PII-Schreibroute, `SyntheticOnlyInterceptor`) | V0006 | ADR-0008 §17/§22 |
| `endkunde.stammdaten.geaendert` | aendern | `endkunde` | `synthetic` | ok/denied/error | false | false | `EndkundeController.aendern()` | V0006 | ADR-0008 §17/§22 |
| `endkunde.stammdaten.gesperrt` | sperren | `endkunde` | `synthetic` | ok/denied/error | false | false | `EndkundeController.sperren()` — Art. 18 DSGVO, kein Hard-Delete | V0006 | ADR-0008 §11/§17/§22 |
| `endkunde.stammdaten.geschreddert` | schreddern | `endkunde` | `synthetic` | ok/denied/error | **true** | false | `EndkundeController.kryptoShredding()` — Art. 17 DSGVO, irreversibel | V0006 | ADR-0008 §19/§20/§21/§22 |
| `system.stammdaten.angelegt` | anlegen | `system` | — | ok/denied/error | false | false | `SystemController.anlegen()` — nicht-PII (`energy.system`) | V0006 | ADR-0008 §17 |
| `system.stammdaten.geaendert` | aendern | `system` | — | ok/denied/error | false | false | `SystemController.aendern()` | V0006 | ADR-0008 §17 |
| `zaehler.stammdaten.angelegt` | anlegen | `zaehler` | — | ok/denied/error | false | false | `ZaehlerController.anlegen()` | V0006 | ADR-0008 §17 |
| `zaehler.stammdaten.geaendert` | aendern | `zaehler` | — | ok/denied/error | false | false | `ZaehlerController.aendern()` | V0006 | ADR-0008 §17 |
| `zaehler.stammdaten.stillgelegt` | stilllegen | `zaehler` | — | ok/denied/error | false | false | `ZaehlerController.stilllegen()` — status-Wechsel, kein Hard-Delete | V0006 | ADR-0008 §17/§20 |
| `messkanal.stammdaten.angelegt` | anlegen | `messkanal` | — | ok/denied/error | false | false | `MesskanalUnterZaehlerController.anlegen()` | V0006 | ADR-0008 §17 |
| `messkanal.stammdaten.geaendert` | aendern | `messkanal` | — | ok/denied/error | false | false | `MesskanalController.aendern()` | V0006 | ADR-0008 §17 |
| `messkanal.stammdaten.stillgelegt` | stilllegen | `messkanal` | — | ok/denied/error | false | false | `MesskanalController.stilllegen()` | V0006 | ADR-0008 §17/§20 |
| `messkonzept.version.angelegt` | anlegen | `messkonzept` | `version_nr` | ok/denied/error | false | false | `MesskonzeptController.anlegen()` — **objekt_ref = Endkunde-UUID** (Messkonzept-Version hat keine eigene UUID), s. Design-Hinweis unten | V0006 | ADR-0008 §17 |
| `anschlussnutzer.stammdaten.angelegt` | anlegen | `anschlussnutzer` | `synthetic` | ok/denied/error | false | false | `AnschlussnutzerController.anlegen()` — PII-Schreibroute | V0006 | ADR-0008 §17/§22 |
| `nutzungsverhaeltnis.angelegt` | anlegen | `nutzungsverhaeltnis` | — | ok/denied/error | false | false | `NutzungsverhaeltnisController.anlegen()` | V0006 | ADR-0008 §17 |
| `nutzungsverhaeltnis.beendet` | beenden | `nutzungsverhaeltnis` | — | ok/denied/error | false | false | `NutzungsverhaeltnisController.beenden()` — Zustandsende, append-only | V0006 | ADR-0008 §17 |
| `stammdaten.verbrauch_detail.einsicht` | einsehen | `verbrauch_detail` | `zweck_code`, `zaehler_ref`, `fenster_tage` | ok (=`break_glass_permit`) / denied | **true** | false | **RESERVIERT — kein v1-Endpoint/Emitter.** Erster Konsument = Verbrauchs-/Lastgang-Endpoint (ADR-0005). Break-glass, DS-07 | V0006 | ADR-0008 §16 |
| `endkunde.pii.einsicht` | lesen | `endkunde` | `synthetic`, `anzahl_angefragt`, `anzahl_endkunden` | ok / denied | **true** | false | **AKTIV.** Batch-Auflösung von Endkunden-Klartextnamen für Listen/Auswahlfelder (`POST /stammdaten/endkunden/labels`, `read:endkunde_pii`). EIN Event je Aufruf, NICHT je Endkunde; `objekt_ref` bleibt NULL. Die **Differenz** `anzahl_angefragt − anzahl_endkunden` belegt die Per-Datensatz-Filterung (Art.-18-Sperre, Art.-17-Shredding) — Auflage A4/A6. Die Liste der aufgelösten Ids gehört bewusst NICHT in den Kontext. **Zweite Ausprägung RESERVIERT** für Mangel M-1 (Einzelabruf Detailseite: `objekt_ref=endkundeId`, beide Zählwerte 1) — solange offen, deckt der Code NUR den Batch-Pfad ab | V0034 | ADR-0008 **D12** |

**Enum-Werte `auth.anmeldung.fehlschlag.kontext.grund`** (anwendungsseitig als
TS-Union durchgesetzt, DB prüft nur Key-Whitelist + Skalar + 512-Byte-Cap,
kein DB-CHECK auf konkrete Werte): `oidc_fehler_von_keycloak` ·
`state_ungueltig_oder_fehlend` · `code_fehlt` · `nonce_mismatch` ·
`id_token_ohne_sub` · `idp_nicht_erreichbar` · `code_exchange_fehlgeschlagen`.
Quelle: `src/backend/src/auth/auth.service.ts` (`emitLoginFailure`-
Aufrufstellen). Bei Erweiterung dieser Enum-Liste: **keine** Migration nötig
(kein DB-CHECK), aber diese Tabelle **muss** nachgezogen werden (Register-
Pflicht) und ein Contract-Test (`test-engineer`) sollte die TS-Union gegen
diese Liste spiegeln.

**Enum-Werte `authz.zugriff.verweigert.kontext.grund`**: noch **nicht
festgelegt** — abhängig vom PDP-Decision-Contract (`ADR-0002 §13`:
`Decision = { effect, reason: <whitelisted-code> }`). Muss vor der
Emitter-Implementierung (s. u.) ergänzt werden.

## Stammdaten-Fach-Events (V0006) — ergänzende Hinweise

**`kontext.synthetic`** (PII-Schreibrouten Endkunde + Anschlussnutzer): boolean
`true`, gesetzt vom `SyntheticOnlyInterceptor` (ADR-0008 §22, PFLICHT-Tag —
forensischer Nachweis „diese Mutation lief nachweislich gegen synthetische
Daten"). Wird vom `@AuditAction`-`kontextExtractor` in die Audit-Zeile
geschrieben.

**`kontext.version_nr`** (`messkonzept.version.angelegt`): `number`, die neue
Versionsnummer aus `result.versionNr`. Nur auf dem Erfolgspfad gesetzt (auf
Fehlerpfaden liefert der Extraktor `undefined` → Key wird weggelassen; ein
JSON `null` würde am Seal-Trigger brechen, s. ADR-0008 §30.2 / C11).

**`stammdaten.verbrauch_detail.einsicht` (break-glass, reserviert):**
- `kontext.zweck_code`: whitelisted, kein Freitext (`BREAK_GLASS_ZWECK_WHITELIST`,
  `src/backend/src/auth/policy/break-glass.constants.ts`) — aktuell nur
  `stoerungsdiagnose` (provisorisch, Erweiterung nur nach `access-control-engineer`/
  `compliance-director`-Review).
- `kontext.fenster_tage`: Zeitfenster in Tagen (`bisTs − vonTs`), muss
  `≤ MAX_FENSTER_TAGE` sein (=7, **provisorisch** bis `security-lead`/
  `compliance-director`-Bestätigung vor ADR-0005).
- **Bewusste Lücke (wörtlich aus ADR-0008 §16):** kein `grund`-Kontext-Key für
  die PDP-Ablehnungsbegründung (`break_glass_erforderlich` vs. `zweck_fehlt`
  vs. `break_glass_grenzen_verletzt`). Ein künftiger Emitter kann die
  Unterscheidung nur über `ergebnis='denied'` abbilden. Falls unzureichend
  (§16 fordert Echtzeit-Alert + Pflicht-Review), braucht es eine **weitere**
  `/add-audit-event`-Migration mit ergänztem `grund`-Key — **keine**
  rückwirkende Änderung dieser Zeile.

**Design-Hinweis `objekt_ref` bei `messkonzept.version.angelegt`:** trägt die
**Endkunde-UUID** (Messkonzept-Versionen haben keine eigene UUID, natürlicher
Schlüssel `(endkundeId, versionNr)`). Eine „vollständige Endkunden-Historie"-
Abfrage über `audit.ix_event_objekt` (`objekt_typ='endkunde'`) erfasst diese
Zeilen **nicht** automatisch — ein Consumer muss
`objekt_typ IN ('endkunde','messkonzept')` mit demselben `objekt_ref` abfragen.
Alternative (nicht gewählt): `objekt_typ='endkunde'`. Offener Punkt für
`access-control-engineer`/`compliance-director`.

**Bootstrap-Ausnahme V0006:** V0006 emittiert **keine** `audit.katalog.geaendert`-
Zeile für sich selbst. Die V0004-Formulierung („danach nicht mehr automatisch")
wurde für V0006 **eigenständig neu geprüft**: das System ist laut ADR-0008 §0
weiterhin **pre-go-live/synthetic-only** (ADR-0004-Ingest-Gate zu) — Vorbedingung
unverändert erfüllt. **Diese Prüfung ist bei jeder künftigen `/add-audit-event`-
Migration (V0007+) erneut vorzunehmen**, insbesondere sobald das Gate geöffnet
wird.

**Test-Katalog abgelöst:** Der frühere Test-Seed
`stammdaten/test-support/seed-stammdaten-audit-catalog.ts` (grob-uniformer
Katalog für die Integrationstests) ist mit V0006 hinfällig — die Integrationstests
laufen jetzt gegen den echten V0006-Katalog (Drift-Schutz).

## Entscheidung: `authz.zugriff.verweigert` — Scope und Konsequenz für den Decorator-Contract

**Frage (offener Punkt aus dem Arbeitsauftrag):** Braucht es einen
generischen `authz.zugriff.verweigert`-Code, oder reicht es, dass
`denied`/`error`-Fälle denselben `eventTyp` wie der Erfolgsfall der
jeweiligen Route tragen (ein Code = ein `objekt_typ`)?

**Befund im Code (`src/backend/src/common/interceptors/audit-action.
interceptor.ts`):** Für **jede** `@AuditAction`-dekorierte Route ist
Letzteres bereits Konvention — `runWithAudit()` ruft
`this.emit(metadata, 'ok'|'denied'|'error', ...)` **immer** mit
`metadata.eventTyp`. Das funktioniert **ohne** Katalog-Änderung, weil
`audit.event_typ_version` das Feld `ergebnis` nicht einschränkt (der
Seal-Trigger prüft nur Katalog-Gültigkeit + Kontext-Whitelist je `event_typ`,
nicht je `ergebnis`). **Für diesen Fall ist kein zusätzlicher Katalog-Eintrag
nötig** — Konsequenz für den Decorator-Contract: `@AuditAction({eventTyp})`
bleibt bewusst ein Code pro Methode, auch für den Denied-Pfad. Die
`api-developer`-Implementierung ist damit **bestätigt**, keine Änderung
nötig.

**Aber:** `.claude/rules/backend-nestjs.md` verlangt `@AuditAction` nur „auf
allen state-ändernden Methoden" — nicht auf reinen Lese-Routen. Der
`AuditActionInterceptor` reicht Routen **ohne** Decorator-Metadaten
unverändert durch (`if (metadata === undefined) return next.handle();`).
Eine `ForbiddenException` aus dem `PolicyInterceptor` (403, RBAC/ABAC) auf
einer solchen Route durchläuft diesen Interceptor also **ohne jeden
Audit-Emit** — eine strukturelle Lücke gegenüber ADR-0002 M2 („Jede
abgelehnte AuthZ-Entscheidung ist auditiert … 0 stille Ablehnungen"), die
sich **nicht** durch „Route nutzt ihren eigenen Erfolgscode" schließen lässt,
weil dort gar kein Emit-Pfad existiert.

**Entscheidung:** `authz.zugriff.verweigert` **wird** geseedet (Migration
V0004) — aber **ausschließlich** als schmaler Fallback-Code für
AuthZ-Ablehnungen **außerhalb** eines `@AuditAction`-Kontexts.
`objekt_typ='authz_entscheidung'` (kein Bezug zu einer konkreten
Fachressource — bewusster Unterschied zu „ein Code = ein `objekt_typ`" der
Fachrouten: hier ist „eine Autorisierungsentscheidung ohne Fachobjekt" das
Objekt). `rolle_erfassen=true` (einzige Abweichung von den vier reinen
AuthN-Codes) — die Rolle zum Ablehnungszeitpunkt ist unmittelbar
ermittlungsrelevant (RBAC-Fehlkonfiguration? Rolle fehlte erwartungsgemäß?).

**Konsequenz für Folge-Arbeitspakete (nicht Teil dieser Migration, kein
`src/`-Schreibzugriff in diesem AP):**

1. **Emitter fehlt noch.** Der Katalog-Eintrag allein schließt die M2-Lücke
   nicht. `backend-lead`/`api-developer` müssen entscheiden:
   - **(a)** `AuditActionInterceptor` um einen Fallback-Zweig erweitern:
     `metadata === undefined` **und** `error instanceof ForbiddenException`
     → `AuditService.append({ eventTyp: 'authz.zugriff.verweigert',
     ergebnis: 'denied', kontext: { grund, route_muster } })`, **oder**
   - **(b)** `backend-nestjs.md` präzisieren, dass **jede** nicht-öffentliche
     Route (nicht nur state-ändernde) `@AuditAction` trägt — dann bliebe
     dieser Fallback-Code dauerhaft ungenutzt (Kosten-Nutzen-Abwägung bei
     `backend-lead`).
   Bis (a) oder (b) entschieden/umgesetzt ist, bleibt dieser Eintrag
   **reserviert** (analog `audit.ddl.gemeldet` in V0003 — Katalog-Zeile
   vorhanden, Emitter folgt separat).
2. **`actor_rolle`-Ableitung ungeklärt.** `actor_rolle` ist eine einzelne
   `text`-Spalte, `SecurityContext.roles` ist mutmaßlich ein Array — wie eine
   „primäre" Rolle bei mehreren zutreffenden Rollen ermittelt wird, ist beim
   Bau des Emit-Pfads zu klären (`backend-lead`).
3. **`grund`-Enum für `authz.zugriff.verweigert` fehlt noch** — abhängig vom
   PDP-`Decision.reason`-Vokabular (ADR-0002 §13), das laut ADR selbst noch
   nicht abschließend spezifiziert ist. Vor Emitter-Implementierung ergänzen
   und in dieser Tabelle nachtragen.

## Entscheidung: Katalog-Änderung als Pflicht-Event — Bootstrap-Ausnahme V0003/V0004

ADR-0003 nennt jede Änderung des kontrollierten Vokabulars fachlich ein
Pflicht-Audit-Event (`audit.katalog.geaendert`). **V0004 emittiert trotzdem
keine solche Zeile für sich selbst** — aus denselben Gründen, die V0003 für
die eigene Erstseed-Ausnahme dokumentiert:

1. Eine echte Emission bräuchte App-/Job-seitige `event_id` (UUIDv7) **und**
   einen `actor_*`-Kontext (wer/was hat die Migration ausgeführt?) — das ist
   Anwendungs-/Betriebskontext, den ein reines SQL-Migrationsskript nicht
   fälschungssicher selbst herstellen kann. Ein `INSERT` durch die
   Migrations-Runner-Rolle wäre kein echter, attribuierbarer Audit-Beleg,
   sondern ein Systemartefakt mit erfundenem Akteur — Bruch der roten
   Linie 1 („kein Emit ohne validierten Principal").
2. V0004 ist — wie V0003 — eine **Pre-Go-Live-Bootstrap-Erweiterung**: Die
   vier `AUTH_EVENT_CODES` existieren im Backend-Code bereits, jeder Versuch,
   sie zu verwenden, ist bislang am fehlenden Katalog-Eintrag fail-closed
   gescheitert — es gibt also (noch) keine echte Auth-Session, zu der diese
   Erweiterung im Nachhinein eine Änderung wäre.

**Wichtige Abgrenzung:** Diese Bootstrap-Ausnahme gilt **einmalig** für V0003
und V0004. Wird eine künftige `/add-audit-event`-Erweiterung (V0005+) gegen
ein bereits produktiv laufendes System (mit existierenden `audit.event`-
Zeilen) angewendet, **muss** sie von einer echten
`audit.append_event('audit.katalog.geaendert', ...)`-Zeile mit echtem
Betriebs-Akteur begleitet werden — ausgeführt vom Menschen/Prozess, der die
Änderung vornimmt, **nicht** durch die Migration selbst.

## Offene Punkte für Folge-Arbeitspakete

- **backend-lead/api-developer:** Emit-Pfad für `authz.zugriff.verweigert`
  (Fallback für nicht-`@AuditAction`-Routen) implementieren oder Rule-Änderung
  `backend-nestjs.md` entscheiden (s. o.).
- **backend-lead:** `actor_rolle`-Ableitungsregel bei mehreren Rollen klären.
- **security-lead/backend-lead:** `grund`-Enum für `authz.zugriff.verweigert`
  aus dem PDP-`Decision.reason`-Vokabular ableiten und hier nachtragen.
- **test-engineer:** Contract-Test, der die TS-Union
  `AUTH_EVENT_CODES`/Fehlergründe gegen die Katalog-Whitelist (`erlaubte_
  kontext_keys`) UND gegen diese Dokument-Tabelle spiegelt (Drift-Schutz).
- **Beobachtung (keine Korrektur nötig, nur Vermerk):** ADR-0002 §15
  beschreibt `auth.anmeldung.fehlschlag` als „`denied`/`error`" — die
  tatsächliche Implementierung (`auth.service.ts`) verwendet für **alle**
  Fehlschlag-Gründe einheitlich `denied` (auch für infrastrukturelle Gründe
  wie `idp_nicht_erreichbar`). Fachlich vertretbar (kein authentisierter
  Prinzipal in beiden Fällen), aber eine Abweichung vom ADR-Wortlaut — falls
  `backend-lead` eine Unterscheidung `denied` (Client-Ursache) vs. `error`
  (System-Ursache) wünscht, ist das eine Emitter-Änderung, **keine**
  Katalog-Änderung (die Spalte `ergebnis` erlaubt bereits beide Werte).

## Änderungsprotokoll

| Migration | Datum | Codes | Kommentar |
|---|---|---|---|
| V0003 | 2026-07-10 | `audit.retention.durchgefuehrt`, `audit.anker.versiegelt`, `audit.anker.publiziert`, `audit.katalog.geaendert`, `audit.ddl.gemeldet` | Schema-Bootstrap-Seed (Pflicht-Event-Typen, die das Schema selbst für STRIDE-Nachweise braucht) |
| V0004 | 2026-07-13 | `auth.anmeldung.erfolg`, `auth.anmeldung.fehlschlag`, `auth.token.erneuert`, `auth.abmeldung.erfolg`, `authz.zugriff.verweigert` | AuthN/AuthZ-Event-Typen (ADR-0002 Phase 4), `authz.zugriff.verweigert` reserviert (Emitter offen) |
| V0006 | 2026-07-14 | 17 Stammdaten-Fach-Codes (`endkunde.*` [4], `system.*` [2], `zaehler.*` [3], `messkanal.*` [3], `messkonzept.version.angelegt`, `anschlussnutzer.stammdaten.angelegt`, `nutzungsverhaeltnis.*` [2], `stammdaten.verbrauch_detail.einsicht`) | ADR-0008 Phase 4 (§17/§16/§22). `stammdaten.verbrauch_detail.einsicht` reserviert (kein v1-Emitter, §16). Bootstrap-Ausnahme fort (pre-go-live/synthetic-only). Test-Seed `seed-stammdaten-audit-catalog.ts` abgelöst. |
| V0034 | 2026-08-27 | `endkunde.pii.einsicht` | ADR-0008 **D12** (Votum `compliance-director` 2026-08-26, Auflage A6; Gegenzeichnung K1/K5). Erster Code mit ZWEI vorgesehenen Kontextausprägungen unter einem Code: Batch (aktiv) und Einzelabruf (reserviert, Mangel M-1 / `ADR-0005 §31` DS-7). `erlaubte_kontext_keys` deshalb von Anfang an vollständig — eine spätere Erweiterung kostete eine SCD2-Nachtragsmigration (Präzedenzfall V0016). |
