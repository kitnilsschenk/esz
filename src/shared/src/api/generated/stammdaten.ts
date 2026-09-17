/**
 * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.
 */

export interface paths {
    "/stammdaten/endkunden/labels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Endkunden-Labels batch-entschlüsseln (Listen/Auswahlfelder, PII-Lesestufe)
         * @description ABAC-Aktion `read:endkunde_pii`. Rolle `betrieb` NUR (`compliance-auditor` bleibt strukturell ausgeschlossen — RBAC UND eine eigenständige PDP-Regel `endkunde_pii_auditor_verboten`, Defense-in-Depth). ADR-0008 D12, AUSDRÜCKLICH KEIN Break-glass (A8 — der Name ist ein Stammdatum, das dieselbe Rolle als Dauerrecht hat), aber IMMER auditiert: GENAU EIN Audit-Event `endkunde.pii.einsicht` je Aufruf (kontext={synthetic,anzahl_angefragt,anzahl_endkunden}), NICHT eines je Endkunde. Die Antwort trägt AUSSCHLIESSLICH `{id, name}` — KEINE Anschrift, KEIN Kontakt (A1, bewusste Abweichung vom Standort-Vorbild). Endkunden-Ids, die nicht existieren oder deren `PiiProjektionsPolicy` je Datensatz `false` liefert (Art.-18-Sperre, Art.-17-Shredding, nicht-aktiver Verarbeitungsstatus), werden STILL aus dem Ergebnis gefiltert (kein Fehler, kein Existenz-Leak, A4). Die Antwort ist ein blankes Array und NICHT paginiert: die Mengengrenze 100 (A2) macht 1 Aufruf = 1 dargestellte Seite = 1 Audit-Event. KEIN `Idempotency-Key` (N1): Der Header ist für schreibende Operationen vorgesehen; POST ist hier nur gewählt, weil eine Id-Menge nicht in den Query-String gehört. Seine Semantik ("Wiederholung ohne den Effekt zu duplizieren") legte zudem nahe, das Audit-Event bei Wiederholung zu unterdrücken — ein A6-Bruch, denn jede Einsicht ist eine Einsicht. Synthetic-only.
         */
        post: operations["endkundeLabelsBatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Endkunden auflisten (PII-frei, Cursor-Pagination)
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb`/`compliance-auditor`. Liefert AUSSCHLIESSLICH Pseudonym-Surrogate + Nicht-PII (Linie 2) — kein Name/keine Anschrift.
         */
        get: operations["endkundenListe"];
        put?: never;
        /**
         * Endkunde anlegen (PII feldverschlüsselt)
         * @description ABAC-Aktion `create:endkunde`. Rolle `betrieb`. Der PII-Block wird app-seitig envelope-verschlüsselt (AES-256-GCM, per-Subjekt-DEK, D7) und nach identity.endkunde_pii geschrieben; energy.endkunde erhält den Pseudonym-Anker. consent_status bleibt Slot (Default `fehlt`, nicht setzbar — Consent-ADR). Synthetic-only (D10). Audit `endkunde.stammdaten.angelegt` (objektRef=Pseudonym-id).
         */
        post: operations["endkundeAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        /**
         * Endkunde-Detail (PII rollen-/status-maskiert)
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb`/`compliance-auditor` (D2/D6-Auflösung: beide erreichen die Route, `PiiProjektionsPolicy` maskiert fail-closed). `stammdatenPii` ist nur für Rolle `betrieb` bei verarbeitungsStatus=aktiv befüllt; für `compliance-auditor` und gesperrte/geschredderte Subjekte => null (DS-07-Innensicht, D6).
         */
        get: operations["endkundeLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Endkunde ändern (PII feldverschlüsselt)
         * @description ABAC-Aktion `update:endkunde`. Rolle `betrieb`. Teil-Update; gesetzte PII-Felder werden neu envelope-verschlüsselt. Audit `endkunde.stammdaten.geaendert`.
         */
        patch: operations["endkundeAendern"];
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/sperren": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Endkunde sperren (Art. 18 — kein Hard-Delete, Grund ist Pflicht)
         * @description ABAC-Aktion `sperren:endkunde`. Rolle `betrieb`. Setzt verarbeitungsStatus=gesperrt (energy) + pii_status=gesperrt (identity) sowie `einschraenkungGrundCode` und `gesperrtSeit` (letzteres serverseitig, kein Client-Wert). Daten bleiben vollständig erhalten (Schlüssel intakt); die Verarbeitung wird durch die ABAC-Policy blockiert (ADR-0004 §16).
         *
         *     Der Grund ist PFLICHT und stammt aus der geschlossenen Liste des Art. 18 Abs. 1 — ohne ihn ist Art. 18 Abs. 2 nicht anwendbar, und das System müsste die betroffene Person fail-closed aus dem Nachweis ausschließen, obwohl bei 1a/1c der Ausweis MIT Kennzeichnung der richtige Weg wäre.
         *
         *     IDEMPOTENZ ist an den Grund gebunden: gleicher Grund => 200, unveränderter Zustand. ABWEICHENDER Grund => 409, kein Schreibvorgang (ein bestehender Grund wird über diesen Pfad NIE überschrieben). Bereits gesperrt OHNE Grund (Bestandsdaten) => 409, die nachträgliche Erfassung ist ein eigener Vorgang. Bereits nach Art. 17 gelöscht => 409, keine stille Quittung.
         *
         *     Für die endgültige Löschung (Art. 17) siehe den Vier-Augen-Workflow unter `.../shred-antraege` (ADR-0009). Audit `endkunde.stammdaten.gesperrt` (kontext={synthetic,einschraenkung_grund_code}, V0032).
         */
        post: operations["endkundeSperren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/einschraenkung-unterrichtung": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Unterrichtung nach Art. 18 Abs. 3 dokumentieren (Schritt 1 von 2)
         * @description ABAC-Aktion `entsperren:endkunde`. Rolle `betrieb`. Dokumentiert, dass die betroffene Person über die bevorstehende Aufhebung der Verarbeitungseinschränkung unterrichtet wurde.
         *
         *     Art. 18 Abs. 3 DSGVO ist eine Ordnungsvorschrift MIT Reihenfolge — unterrichten, dann aufheben. Eine eigene Route statt eines Feldes am Entsperren, weil sich die Reihenfolge nur so belegen lässt.
         *
         *     Der Nachweis wird an GENAU DIESE Einschränkung gebunden (über den Sperrzeitpunkt). Ein Nachweis aus einer früheren Einschränkung desselben Subjekts hebt eine spätere NICHT auf. Nur im Zustand `gesperrt` zulässig (409 sonst). Audit `endkunde.stammdaten.einschraenkung_unterrichtet` (kontext={synthetic,kanal}, V0036).
         */
        post: operations["endkundeUnterrichten"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/entsperren": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verarbeitungseinschränkung aufheben (Art. 18, Schritt 2 von 2)
         * @description ABAC-Aktion `entsperren:endkunde`. Rolle `betrieb`. Setzt in EINER Transaktion verarbeitungsStatus=aktiv, einschraenkungGrundCode=NULL, gesperrtSeit=NULL sowie pii_status=aktiv — der Kohärenz-CHECK aus V0024 lässt nichts anderes zu.
         *
         *     FAIL-CLOSED: wird abgelehnt (409), solange keine an dieselbe Einschränkung gebundene Unterrichtung dokumentiert ist.
         *
         *     NUR aus dem Zustand `gesperrt`. Bereits `aktiv` => 200 idempotent. Nach Art. 17 gelöscht => 409, ausdrücklich KEINE stille Quittung.
         *
         *     NACH der Aufhebung ist in `energy.*` keine Spur des Art.-18-Vorgangs mehr vorhanden — die Audit-Zeile `endkunde.stammdaten.entsperrt` (kontext={synthetic,einschraenkung_grund_code}, V0036) und `energy.einschraenkung_unterrichtung` (V0035) sind die einzigen Belege.
         */
        post: operations["endkundeEntsperren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/shred-antraege": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        /**
         * Shred-Anträge auflisten (offene + historische, Cursor-Pagination)
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb`/`compliance-auditor` (Auditor bleibt strikt lesend, DS-01). Liefert alle Anträge des Endkunden (jeder Status), älteste zuerst über die gemeinsame Cursor-Konvention.
         */
        get: operations["shredAntraegeListe"];
        put?: never;
        /**
         * Krypto-Shredding beantragen (Art. 17 — Vier-Augen-Antrag, harmlos)
         * @description ABAC-Aktion `shred:endkunde` (unverändert gegenüber dem vormaligen Direkt-Endpoint — dieser Schritt selbst ist harmlos, die eigentliche Kontrolle liegt bei der Freigabe, ADR-0009 §2.2). Rolle `betrieb`. Legt einen neuen Antrag im Status `beantragt` an (`gueltigBis` = jetzt + Verfallsfrist, ADR-0009 §2.1/§5/§8). Höchstens EIN offener Antrag je Endkunde (Pflicht-Unique-Index, §2.1/§5) — ein Retry mit demselben Antragsteller liefert den bestehenden offenen Antrag zurück (Idempotency-Replay, kein Duplikat, kein 500 über den Unique-Index); ein ANDERER Antragsteller erhält `409`. Audit `endkunde.stammdaten.shred_beantragt`.
         */
        post: operations["shredAntragBeantragen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/shred-antraege/{antragId}/freigeben": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
                /** @description Shred-Antrag-ID (ADR-0009). */
                antragId: components["parameters"]["AntragIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Shred-Antrag freigeben (Vier-Augen — löst die Ausführung UNWIDERRUFLICH aus)
         * @description ABAC-Aktion `shred:endkunde:freigeben` (NEU, ADR-0009 §2.2). Rolle `betrieb`. Deny-by-default: NUR eine ZWEITE Person (`sub` ≠ Antragsteller-`sub`) darf freigeben, NUR wenn der Antrag noch im Status `beantragt` ist — sonst `403` (`vier_augen_selbstfreigabe_verboten`/`shred_antrag_ungueltig`). Die zweite Person bestätigt bewusst über ein EIGENES Type-to-confirm (`bestaetigung`), nicht durch bloßes Anklicken der Antragsentscheidung. Freigabe + Ausführung sind ATOMAR in EINER Transaktion gekoppelt (ADR-0009 §2.1): vernichtet den per-Subjekt-DEK (unwiderruflich), neutralisiert die PII-Zeile, `verarbeitungsStatus=geloescht`. Audit `endkunde.stammdaten.shred_freigegeben` DANN `endkunde.stammdaten.geschreddert` (logische Reihenfolge, MANUELL emittiert — KEIN `@AuditAction` auf dieser Route, ADR-0009 §2.3 Finding P2).
         */
        post: operations["shredAntragFreigeben"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/shred-antraege/{antragId}/ablehnen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
                /** @description Shred-Antrag-ID (ADR-0009). */
                antragId: components["parameters"]["AntragIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Shred-Antrag ablehnen (Vier-Augen, terminal)
         * @description ABAC-Aktion `shred:endkunde:ablehnen` (NEU, ADR-0009 §2.2). Rolle `betrieb`. Deny-by-default analog `freigeben` (zweite Person, Status `beantragt`). Terminal — der Antragsteller kann erneut beantragen. Audit `endkunde.stammdaten.shred_abgelehnt` (`kontext.ablehnungsgrund`).
         */
        post: operations["shredAntragAblehnen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/systeme": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Systeme/Messstellen auflisten
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb`/`compliance-auditor`. Optionaler Filter nach Endkunde.
         */
        get: operations["systemeListe"];
        put?: never;
        /**
         * System/Messstelle anlegen
         * @description ABAC-Aktion `create:system`. Rolle `betrieb`.
         */
        post: operations["systemAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/systeme/{systemId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        /**
         * System-Detail
         * @description ABAC-Aktion `read:stammdaten`.
         */
        get: operations["systemLesen"];
        put?: never;
        post?: never;
        /**
         * System/Messstelle stilllegen (status=stillgelegt — kein Hard-Delete, idempotent)
         * @description ABAC-Aktion `delete:system`. Rolle `betrieb`. Setzt status=stillgelegt (nie hart löschen — sonst würden Zähler/Messkanäle referenzielle Waisen, ADR-0004 §14). IDEMPOTENT. Audit `system.stammdaten.stillgelegt`.
         */
        delete: operations["systemStilllegen"];
        options?: never;
        head?: never;
        /**
         * System/Messstelle ändern
         * @description ABAC-Aktion `update:system`. Rolle `betrieb`.
         */
        patch: operations["systemAendern"];
        trace?: never;
    };
    "/stammdaten/zaehler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Zähler auflisten
         * @description ABAC-Aktion `read:stammdaten`. Optionaler Filter nach System. Kein geraeteReferenz-Feld (V0002, §12).
         */
        get: operations["zaehlerListe"];
        put?: never;
        /**
         * Zähler anlegen
         * @description ABAC-Aktion `create:zaehler`. Rolle `betrieb`.
         */
        post: operations["zaehlerAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/zaehler/{zaehlerId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        /**
         * Zähler-Detail
         * @description ABAC-Aktion `read:stammdaten`.
         */
        get: operations["zaehlerLesen"];
        put?: never;
        post?: never;
        /**
         * Zähler stilllegen (status=stillgelegt — kein Hard-Delete, idempotent)
         * @description ABAC-Aktion `delete:zaehler`. Rolle `betrieb`. Setzt status=stillgelegt (nie hart löschen — sonst würden Messwerte referenzielle Waisen, ADR-0004 §14). IDEMPOTENT. Audit `zaehler.stammdaten.stillgelegt`.
         */
        delete: operations["zaehlerStilllegen"];
        options?: never;
        head?: never;
        /**
         * Zähler ändern
         * @description ABAC-Aktion `update:zaehler`. Rolle `betrieb`.
         */
        patch: operations["zaehlerAendern"];
        trace?: never;
    };
    "/stammdaten/zaehler/{zaehlerId}/freshness": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        /**
         * Freshness je Messkanal dieses Zählers (Betriebs-Metadatum, KEIN break-glass)
         * @description ABAC-Aktion `read:monitoring` — BEWUSST NICHT `read:verbrauch_detail`: „wann kam zuletzt etwas an" ist ein Betriebs-Metadatum (Freshness- Zeitstempel aus `ingest.kanal_status`), KEIN Verbrauchsinhalt (kein Messwert, kein Lastgang) — ein break-glass-Zwang würde schlichtes Betriebsmonitoring praktisch unbenutzbar machen. Rollen `betrieb`/ `compliance-auditor`. Liefert je Messkanal (ALLE, unabhängig vom Status — ergänzt die bestehende Messkanäle-Tabelle um „Letzte Übertragung") `letzteUebertragung` (`null` = noch nie empfangen, EMPTY-STATE) und `ueberfaellig` (gegen dieselbe TB-04-Schwelle wie `/monitoring/ausfaelle` berechnet).
         */
        get: operations["zaehlerFreshness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/zaehler/{zaehlerId}/messkanaele": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        /**
         * Messkanäle eines Zählers auflisten
         * @description ABAC-Aktion `read:stammdaten`. kanal_key (int-Surrogat) wird NICHT exponiert (§12) — Außenschlüssel ist die UUID `id`.
         */
        get: operations["messkanaeleListe"];
        put?: never;
        /**
         * Messkanal anlegen
         * @description ABAC-Aktion `create:messkanal`. Rolle `betrieb`. Natürliche Eindeutigkeit (zaehler_id, messgroesse, obis_kennzahl) => Doppelanlage liefert 409.
         */
        post: operations["messkanalAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/messkanaele/{messkanalId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                messkanalId: components["parameters"]["MesskanalIdPath"];
            };
            cookie?: never;
        };
        /**
         * Messkanal-Detail
         * @description ABAC-Aktion `read:stammdaten`.
         */
        get: operations["messkanalLesen"];
        put?: never;
        post?: never;
        /**
         * Messkanal stilllegen (status=stillgelegt — idempotent)
         * @description ABAC-Aktion `delete:messkanal`. Rolle `betrieb`. IDEMPOTENT. Audit `messkanal.stammdaten.stillgelegt`.
         */
        delete: operations["messkanalStilllegen"];
        options?: never;
        head?: never;
        /**
         * Messkanal ändern
         * @description ABAC-Aktion `update:messkanal`. Rolle `betrieb`.
         */
        patch: operations["messkanalAendern"];
        trace?: never;
    };
    "/stammdaten/zaehler/{zaehlerId}/geraet-zuordnungen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Geraete-Zuordnung provisionieren (DevEUI<->Zaehler-Erstanlage)
         * @description ABAC-Aktion `create:geraet_zuordnung`. Rolle `betrieb`. Synthetic-only (ADR-0005 §0/§19 — Ingest-Gate bleibt ZU). `devEui` wird AES-256-GCM feldverschlüsselt (AAD=zaehlerId||'deveui') + als Blind-Index (HMAC-SHA256, systemweiter Pepper) abgelegt — NIE im Klartext zurückgegeben oder geloggt (O4 Design-Prinzip 1). Höchstens EINE aktive Zuordnung je Zähler gleichzeitig (D-EXCL) => 409 bei Verstoß; dieselbe DevEUI darf nicht gleichzeitig aktiv zwei Zählern zugeordnet sein (partieller Unique-Index) => ebenfalls 409. Audit `geraet_zuordnung.stammdaten.provisioniert` (kontext={synthetic,zaehler_id,pepper_version}, RL-2: kein DevEUI-Klartext/Blind-Index im Kontext).
         */
        post: operations["geraetZuordnungAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/geraet-zuordnungen/{geraetZuordnungId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Geraete-Zuordnungs-ID (device.geraet_zuordnung.id, ADR-0005 §26). */
                geraetZuordnungId: components["parameters"]["GeraetZuordnungIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Geraete-Zuordnung deaktivieren (v1 minimal)
         * @description ABAC-Aktion `update:geraet_zuordnung`. Rolle `betrieb`. v1 MINIMAL: `aktion=deaktivieren` (status=inaktiv, gueltig_bis=now(), IDEMPOTENT). Ein Geräte-Tausch am selben Zähler ist v1 ZWEI Aufrufe (dieses PATCH + anschließendes POST auf die Create-Route mit der neuen DevEUI). Bereits krypto-geschredderte Zuordnungen (Art. 17) liefern 409. Audit `geraet_zuordnung.stammdaten.aktualisiert` (kontext={synthetic,zaehler_id}).
         */
        patch: operations["geraetZuordnungAendern"];
        trace?: never;
    };
    "/stammdaten/geraet-zuordnungen/{geraetZuordnungId}/reverse-aufloesung": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Geraete-Zuordnungs-ID (device.geraet_zuordnung.id, ADR-0005 §26). */
                geraetZuordnungId: components["parameters"]["GeraetZuordnungIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reverse-Aufloesung — Blind-Index/Zeile zu Klartext-DevEUI (break-glass)
         * @description ABAC-Aktion `read:geraet_zuordnung`. **EIGENSTAENDIGE break-glass- Haertung** (ADR-0005 §26.4 SEC-5, NICHT das `read:verbrauch_detail`- Muster): Rolle **`geraete-support`** (NICHT `betrieb`, eigene, rezertifizierungspflichtige Rolle) UND `zweck` aus einer eigenen Whitelist (unabhängig von `read:verbrauch_detail`) UND strukturiertes `ticketRef` (Format `^[A-Z]+-[0-9]+$`, kein Freitext) UND Velocity/ Quota (höchstens N erfolgreiche Aufloesungen je Subjekt im gleitenden 24h-Fenster, gezaehlt ueber den Audit-Trail selbst) → `permit`; sonst `deny` (403). `compliance-auditor` erhaelt UNBEDINGT `deny` (eigene PDP-Regel, unabhaengig von einer eventuell zusaetzlich zugewiesenen `geraete-support`-Rolle). Bei `permit`: Klartext-`devEui` in der Response (das EINZIGE Schema im gesamten Contract mit Klartext-DevEUI) + Echtzeit-Alert (`actorSub`, `zaehlerId`, `zweck`, `ticketRef`, `zeitpunkt` — NIEMALS DevEUI) + Audit `geraet_zuordnung.stammdaten.reverse_aufgeloest` (kontext={synthetic,zaehler_id,zweck,ticket_ref}), **auch bei `deny`** auditiert (ADR-0005 §26.4: "jede Auflösung wird auditiert"). Bewusst KEIN `Idempotency-Key` (reine, wiederholbare Lese-Operation, keine State-Aenderung an `device.*`).
         */
        post: operations["geraetZuordnungReverseAufloesen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/messkonzept/versionen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        /**
         * Messkonzept-Versionen auflisten
         * @description ABAC-Aktion `read:stammdaten`. Liefert die (append-only) Versionen des Messkonzepts des Endkunden, neueste zuerst.
         */
        get: operations["messkonzeptVersionenListe"];
        put?: never;
        /**
         * Neue Messkonzept-Version anlegen (append-only, 7 TB-01-Pflichtinhalte)
         * @description ABAC-Aktion `create:messkonzept_version`. Rolle `betrieb`. Legt eine NEUE Version an (kein Editieren bestehender Versionen — Linie 3); der Server vergibt version_nr aufsteigend und schließt die bisherige aktuelle Version (gueltig_bis). Existiert noch kein Messkonzept-Header für den Endkunden, wird er implizit angelegt. Audit `messkonzept.version.angelegt`.
         */
        post: operations["messkonzeptVersionAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/messkonzept/versionen/{versionNr}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
                /** @description Fortlaufende Versionsnummer der Messkonzept-Version. */
                versionNr: components["parameters"]["VersionNrPath"];
            };
            cookie?: never;
        };
        /**
         * Messkonzept-Version lesen (inkl. Energieträger/Baseline)
         * @description ABAC-Aktion `read:stammdaten`.
         */
        get: operations["messkonzeptVersionLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/messkonzept-energietraeger/{mvetId}/systeme": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Kennung des Messkonzept-Energieträgers (`MesskonzeptVersionDetail.energietraeger[].mvetId`). */
                mvetId: string;
            };
            cookie?: never;
        };
        /**
         * Systemgrenze eines Messkonzept-Energieträgers lesen
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb` und `compliance-auditor`.
         *     Die Systemgrenze bestimmt, WELCHE Systeme — und damit welche Zähler — ein Berechnungslauf umfasst. Die Antwort trägt zusätzlich die wählbaren Systeme des Endkunden, weil eine Oberfläche, die eine Menge bearbeiten lässt, beides in einem Zug braucht.
         *     `greiftFallback: true` heißt: Es ist NICHTS zugeordnet, und der Berechnungslauf nimmt alle aktiven Zähler des Endkunden mit passendem Energieträger (`endkunde_fallback`). Bei einem Kunden mit mehreren Messkonzepten fließt dabei fremder Verbrauch ein — deshalb steht es ausdrücklich in der Antwort, statt sich still auszuwirken.
         */
        get: operations["systemgrenzeLesen"];
        /**
         * Systemgrenze setzen (ganze Menge, idempotent)
         * @description ABAC-Aktion `update:messkonzept_version`. Rolle `betrieb`.
         *     `PUT` und nicht POST/DELETE je Eintrag: Die Systemgrenze ist eine Menge, und wer sie ändert, meint den neuen Zustand. Ein zweiter Aufruf mit demselben Inhalt ändert nichts.
         *     Ein LEERES Array ist zulässig und bedeutet „zurück zum Fallback" — sonst käme man aus einer falsch gesetzten Grenze nicht mehr heraus. Systeme, die nicht zu diesem Endkunden gehören oder stillgelegt sind, werden mit **400** abgewiesen.
         *     Audit `messkonzept.systemgrenze.zugeordnet` (mit Anzahl vorher/nachher).
         */
        put: operations["systemgrenzeSetzen"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/messkonzept-energietraeger/{mvetId}/baseline-perioden": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Kennung des Messkonzept-Energieträgers (`MesskonzeptVersionDetail.energietraeger[].mvetId`). */
                mvetId: string;
            };
            cookie?: never;
        };
        /**
         * Baseline-Bezugszeiträume eines Messkonzept-Energieträgers lesen
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb` und `compliance-auditor`.
         *     Die Perioden sind die Zeiträume der Jahresabrechnungen, aus denen die Baseline gemittelt wurde (TB-02, [Q3] Kap. 2.1.2). Aus ihnen bildet der Berechnungslauf **GTZ_base** als Mittelwert der Gradtagzahl-Summen je Periode — den Nenner der Witterungsbereinigung.
         *     Ist `gtzBaseErmittelbar: false`, weist der Berechnungslauf mit `GTZ_BASE_NICHT_ERMITTELBAR` ab, sofern kein `gtzBaseOverride` gesetzt ist und der Grundlastanteil unter 1 liegt. Ein `gtzBaseOverride` ist eine von Hand gesetzte Gradtagzahl — er macht die Rechnung nicht richtiger, sondern nur möglich.
         *     Die Antwort trägt die Baseline-Kopfdaten mit, damit sichtbar ist, ob die Perioden zu dem passen, was sie belegen sollen.
         */
        get: operations["baselinePeriodenLesen"];
        /**
         * Baseline-Bezugszeiträume setzen (ganze Menge, idempotent)
         * @description ABAC-Aktion `update:messkonzept_version`. Rolle `betrieb`.
         *     `PUT` und nicht POST/DELETE je Periode: Die Perioden wirken nur gemeinsam — der Lauf mittelt über alle. Wer eine ändert, verschiebt den Nenner der Witterungsbereinigung und soll dabei den ganzen Satz sehen. Ein zweiter Aufruf mit demselben Inhalt ändert nichts.
         *     **`bis` ist AUSSCHLIESSLICH.** Eine Abrechnung über das Kalenderjahr 2023 wird als `von: 2023-01-01, bis: 2024-01-01` erfasst. Die Antwort gibt je Periode `tage` und `letzterTag` zurück, damit dieser Unterschied nicht erst in der Einsparzahl auffällt.
         *     Mit **400** abgewiesen werden `bis <= von` und ÜBERSCHNEIDUNGEN — überschneidende Tage zählen doppelt in den Mittelwert, und zwei Jahresabrechnungen desselben Versorgers überschneiden sich nicht. Eine ungewöhnliche LÄNGE wird NICHT abgewiesen (ein unterjähriger Abrechnungszeitraum ist ein echter Fall), sondern über `laengeAuffaellig` ausgewiesen.
         *     Audit `messkonzept.baseline_periode.erfasst` (mit Anzahl vorher/nachher).
         */
        put: operations["baselinePeriodenSetzen"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/anschlussnutzer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Anschlussnutzer auflisten (PII-frei)
         * @description ABAC-Aktion `read:stammdaten`. Nur Pseudonym + Nicht-PII (Linie 2). Optionaler Filter nach Endkunde.
         */
        get: operations["anschlussnutzerListe"];
        put?: never;
        /**
         * Anschlussnutzer anlegen (PII feldverschlüsselt, DS-07)
         * @description ABAC-Aktion `create:anschlussnutzer`. Rolle `betrieb`. PII (Name/Kontakt) des Datensubjekts der Verbrauchsdaten wird envelope-verschlüsselt nach identity.anschlussnutzer_pii geschrieben. Audit `anschlussnutzer.stammdaten.angelegt`.
         */
        post: operations["anschlussnutzerAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/anschlussnutzer/{anschlussnutzerId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        /**
         * Anschlussnutzer-Detail (PII DS-07-Innensicht-maskiert)
         * @description ABAC-Aktion `read:stammdaten`. Rollen `betrieb`/`compliance-auditor` (D2/D6-Auflösung). `stammdatenPii` nur soweit für Zuordnung/Pflege erforderlich und rollen-/status-erlaubt (D6 fail-closed, §6.5) — `compliance-auditor` => null.
         */
        get: operations["anschlussnutzerLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/anschlussnutzer/{anschlussnutzerId}/sperren": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Anschlussnutzer sperren (Art. 18 — kein Hard-Delete, Grund ist Pflicht)
         * @description ABAC-Aktion `sperren:anschlussnutzer`. Rolle `betrieb`. Setzt verarbeitungsStatus=gesperrt (energy) + pii_status=gesperrt (identity) sowie `einschraenkungGrundCode` und `gesperrtSeit` (letzteres serverseitig, kein Client-Wert).
         *
         *     Der Anschlussnutzer ist eine EIGENE betroffene Person mit eigenen Betroffenenrechten — seine Einschränkung ist unabhängig von der des Endkunden und wird im Nachweis unter FJ-11a/b/c ausgewertet (ADR-0006 P4 / ADR-0007 A12), während die Endkunden-Sperre unter FJ-07a/b/c läuft.
         *
         *     Semantik identisch zu `POST /stammdaten/endkunden/{id}/sperren`: gleicher Grund => 200 unverändert; ABWEICHENDER Grund => 409 ohne Schreibvorgang (ein bestehender Grund wird nie überschrieben); bereits gesperrt OHNE Grund => 409 (Nacherfassung ist ein eigener Vorgang); bereits nach Art. 17 gelöscht => 409.
         *
         *     Audit `anschlussnutzer.stammdaten.gesperrt` (kontext={synthetic,einschraenkung_grund_code}, V0033).
         */
        post: operations["anschlussnutzerSperren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/anschlussnutzer/{anschlussnutzerId}/einschraenkung-unterrichtung": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Unterrichtung nach Art. 18 Abs. 3 dokumentieren (Schritt 1 von 2)
         * @description ABAC-Aktion `entsperren:anschlussnutzer`. Rolle `betrieb`. Dokumentiert, dass die betroffene Person über die bevorstehende Aufhebung der Verarbeitungseinschränkung unterrichtet wurde.
         *
         *     Art. 18 Abs. 3 DSGVO ist eine Ordnungsvorschrift MIT Reihenfolge — unterrichten, dann aufheben. Eine eigene Route statt eines Feldes am Entsperren, weil sich die Reihenfolge nur so belegen lässt.
         *
         *     Der Nachweis wird an GENAU DIESE Einschränkung gebunden (über den Sperrzeitpunkt). Ein Nachweis aus einer früheren Einschränkung desselben Subjekts hebt eine spätere NICHT auf. Nur im Zustand `gesperrt` zulässig (409 sonst). Audit `anschlussnutzer.stammdaten.einschraenkung_unterrichtet` (kontext={synthetic,kanal}, V0036).
         */
        post: operations["anschlussnutzerUnterrichten"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/anschlussnutzer/{anschlussnutzerId}/entsperren": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verarbeitungseinschränkung aufheben (Art. 18, Schritt 2 von 2)
         * @description ABAC-Aktion `entsperren:anschlussnutzer`. Rolle `betrieb`. Setzt in EINER Transaktion verarbeitungsStatus=aktiv, einschraenkungGrundCode=NULL, gesperrtSeit=NULL sowie pii_status=aktiv — der Kohärenz-CHECK aus V0024 lässt nichts anderes zu.
         *
         *     FAIL-CLOSED: wird abgelehnt (409), solange keine an dieselbe Einschränkung gebundene Unterrichtung dokumentiert ist.
         *
         *     NUR aus dem Zustand `gesperrt`. Bereits `aktiv` => 200 idempotent. Nach Art. 17 gelöscht => 409, ausdrücklich KEINE stille Quittung.
         *
         *     NACH der Aufhebung ist in `energy.*` keine Spur des Art.-18-Vorgangs mehr vorhanden — die Audit-Zeile `anschlussnutzer.stammdaten.entsperrt` (kontext={synthetic,einschraenkung_grund_code}, V0036) und `energy.einschraenkung_unterrichtung` (V0035) sind die einzigen Belege.
         */
        post: operations["anschlussnutzerEntsperren"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/nutzungsverhaeltnisse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Nutzungsverhältnisse auflisten (DS-07-Beziehung, strukturell)
         * @description ABAC-Aktion `read:stammdaten`. Liefert die Beziehungs-Attribute (datenklasse/rolle/Temporalität) — die ABAC-Steuergrößen (N2), keine PII. Filter nach Endkunde/Anschlussnutzer/System.
         */
        get: operations["nutzungsverhaeltnisseListe"];
        put?: never;
        /**
         * Nutzungsverhältnis anlegen (Endkunde↔Anschlussnutzer↔System)
         * @description ABAC-Aktion `create:nutzungsverhaeltnis`. Rolle `betrieb`. Legt die DS-07-Beziehung mit datenklasse/rolle/gueltig_von an. Zeitlicher Overlap je (anschlussnutzer, system) ist per EXCLUDE-Constraint ausgeschlossen => 409. Audit `nutzungsverhaeltnis.angelegt`.
         */
        post: operations["nutzungsverhaeltnisAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/nutzungsverhaeltnisse/{nutzungsverhaeltnisId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                nutzungsverhaeltnisId: components["parameters"]["NutzungsverhaeltnisIdPath"];
            };
            cookie?: never;
        };
        /**
         * Nutzungsverhältnis-Detail
         * @description ABAC-Aktion `read:stammdaten`.
         */
        get: operations["nutzungsverhaeltnisLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Nutzungsverhältnis beenden (gueltig_bis setzen — Mieterwechsel)
         * @description ABAC-Aktion `update:nutzungsverhaeltnis`. Rolle `betrieb`. Setzt gueltig_bis (temporaler Abschluss, kein Delete). IDEMPOTENT bezüglich desselben Endzeitpunkts. Audit `nutzungsverhaeltnis.beendet`.
         */
        patch: operations["nutzungsverhaeltnisBeenden"];
        trace?: never;
    };
    "/monitoring/einschraenkung-fristen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Wiedervorlage der befristeten Art.-18-Einschränkungen
         * @description ABAC-Aktion `read:monitoring`. Rollen `betrieb`/`compliance-auditor`.
         *
         *     Listet die offenen Verarbeitungseinschränkungen mit einem der beiden BEFRISTETEN Tatbestände des Art. 18 Abs. 1 — `art18_1a_richtigkeit` („für eine Dauer, die es dem Verantwortlichen ermöglicht, die Richtigkeit zu überprüfen") und `art18_1d_widerspruch` („solange noch nicht feststeht …").
         *
         *     `art18_1b_unrechtmaessig` und `art18_1c_rechtsverteidigung_betroffener` erscheinen NICHT: sie enden nicht von selbst. 1b besteht auf Wunsch der betroffenen Person, die die Löschung abgelehnt hat; 1c endet mit dem Rechtsstreit, nicht mit einer Prüffrist. Sie mitzuführen würde regelkonform fortbestehende Vorgänge als überfällig melden.
         *
         *     Der Report MELDET, er entscheidet nicht — eine überfällige Einschränkung wird nicht automatisch aufgehoben (Art. 18 Abs. 3 verlangt die Unterrichtung vorher, und der Wegfall des Grundes ist eine fachliche Feststellung, keine Zeitfunktion).
         *
         *     Enthält KEINE PII: nur Pseudonym-UUIDs, den geschlossenen Grund-Code und Zeitangaben.
         */
        get: operations["einschraenkungFristen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/erhebungs-entscheidungen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Entscheidungen über die weitere Messdaten-Erhebung (Auflage C-8)
         * @description ABAC-Aktion `read:monitoring`. Rollen `betrieb`/`compliance-auditor`.
         *
         *     Listet alle bestehenden Art.-18-Einschränkungen mit Sperrgrund `art18_1b_unrechtmaessig` oder `art18_1d_widerspruch` — die beiden Tatbestände, bei denen ausdrücklich zu entscheiden ist, ob WEITER ERHOBEN wird (Auflage C-8, Spalte `neuerhebung_fortsetzen`, V0087).
         *
         *     Eigener Endpunkt neben `/monitoring/einschraenkung-fristen`: Jener fragt „läuft diese Einschränkung länger als vorgesehen?", dieser „wirkt hier eine Entscheidung über die Messung, und hat sie jemand getroffen?". Die Gründe überschneiden sich zufällig bei lit. d, die Fragen nicht.
         *
         *     Zwei Zustände brauchen Aufmerksamkeit, aus entgegengesetzten Gründen: `entscheidung_offen` — eine Bestandssperre aus der Zeit vor V0087, bei der niemand entschieden hat (das Gate misst weiter, und niemand hat das je so beschlossen); `erhebung_gestoppt` — eine korrekte, dokumentierte Lage, die aber niemand von selbst beendet und die jeden Tag eine nicht nachfüllbare Messlücke erzeugt.
         *
         *     Der Report MELDET, er entscheidet nicht — weder das Nachtragen einer Entscheidung noch das Wiederaufnehmen der Messung geschieht automatisch.
         *
         *     Enthält KEINE PII: Pseudonym-UUIDs, geschlossener Grund-Code, Zeitangaben, ein Zustand aus drei Werten.
         */
        get: operations["erhebungsEntscheidungen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/vollstaendigkeit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Vollständigkeits-/Lücken-Report (DE-02, nur Metadaten)
         * @description ABAC-Aktion `read:monitoring`. Rollen `betrieb`/`compliance-auditor`. Liefert je Endkunde/System/Zähler die fehlenden Stammdaten (Lücken-Metadaten) — KEIN Verbrauchsinhalt, KEINE PII (§6.5).
         */
        get: operations["vollstaendigkeitListe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ausfaelle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kanäle mit TB-04-Ausfall oder überfälliger Freshness (nur Metadaten)
         * @description ABAC-Aktion `read:monitoring` — DIESELBE Aktion wie `/monitoring/vollstaendigkeit` (ADR-0005 §27 bestätigt ausdrücklich „kein neuer PDP-Fall nötig", da DE-02 und TB-04 innerhalb derselben Aktion laufen). Rollen `betrieb`/`compliance-auditor`. Liefert Kanäle, deren `ingest.kanal_status.letzter_ts` die Überfälligkeits-Schwelle überschreitet (60 h = 24 h TB-09- Mindestkadenz + 36 h Puffer, ADR-0005 §27 — benannte Konstante `TB04_FRESHNESS_SCHWELLE_STUNDEN`), ODER die bereits einen dokumentierten, NICHT behobenen `ingest.ausfall_vorgang`-Eintrag tragen. Kanäle, die noch NIE Daten geliefert haben (kein `ingest.kanal_status`-Eintrag — das ist der strukturell getrennte DE-02-Fall, `/monitoring/vollstaendigkeit`), und stillgelegte Zähler/Messkanäle sind AUSGESCHLOSSEN. PII-frei, Cursor-Pagination (Sortierung `letzter_ts ASC` — am längsten ausgefallene Kanäle zuerst).
         */
        get: operations["ausfaelleListe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/geraetetypen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Bekannte Geraetetypen samt der Messkanaele, die sie liefern
         * @description ABAC-Aktion `read:stammdaten`, Rollen `betrieb`/`compliance-auditor`. PII-frei, keine Pagination (der Katalog ist eine kurze, code-getragene Liste, keine Datenmenge).
         *     **Wozu:** `energy.messkanal.messgroesse`/`.einheit`/`.art` sind Freitext bzw. Werteliste und muessen ZEICHENGENAU zu dem passen, was der Decoder des jeweiligen Geraetetyps liefert — sonst landet jeder Uplink in der Quarantaene (`kanal_unbekannt` bzw. `einheit_inkonsistent`). Bisher stand dieses Wissen ausschliesslich im Backend-Code, waehrend ein Mensch die Felder beim Anlegen abtippte. Dieser Katalog macht es sichtbar; die Oberflaeche bietet daraus die passende Kanal-Vorlage an.
         *     Die Liste kommt AUS der Decoder-Registry, nicht aus einer daneben gepflegten Tabelle — eine zweite Liste waere frueher oder spaeter abgewichen, ohne dass es jemand bemerkt haette.
         *     `erwarteteKanaele` darf LEER sein: Der synthetische Referenz-Decoder etwa liest Messgroesse und Einheit aus dem Payload und legt sie nicht fest.
         */
        get: operations["geraetetypKatalogLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ingest/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Betriebszustand der Messdaten-Aufnahme (aus der Datenbank abgeleitet)
         * @description ABAC-Aktion `read:monitoring` — DIESELBE Aktion wie `/monitoring/vollstaendigkeit` und `/monitoring/ausfaelle` (kein neuer PDP-Fall: derselbe Betriebs-Blick auf dieselben Ingest-Tabellen). Rollen `betrieb`/`compliance-auditor`. PII-frei.
         *     Liefert `quellen` — EINE Zeile je Netzserver, der sich je gemeldet hat (ADR-0011 D8) — sowie die über alle Quellen zusammengefassten Zeitpunkte und Quarantäne-Zahlen. Beides ist nötig: Die Summe beantwortet „kommt überhaupt etwas an?", die Aufschlüsselung „von welchem Netz nicht mehr?".
         *     **Zum Verbindungszustand:** Der Ingest-Worker ist ein eigener Prozess; er schreibt seinen Zustand regelmäßig in `ingest.quelle_status` (V0039). Maßgeblich ist `lebendig` — es verlangt BEIDES: eine gemeldete Verbindung UND einen frischen Herzschlag. `verbunden` allein wäre eine Falschaussage, sobald der Prozess abstürzt: Er kann das Flag dann nicht mehr zurücksetzen, und die Zeile bliebe für immer grün.
         *     Eine leere `quellen`-Liste heißt: Es lief noch nie ein Worker.
         */
        get: operations["ingestStatusLesen"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ingest/quarantaene": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liegengebliebene Uplinks mit Grund (Cursor-paginiert, PII-frei)
         * @description ABAC-Aktion `read:monitoring`, Rollen `betrieb`/`compliance-auditor`. Jeder Uplink, den die Aufnahme nicht schreiben konnte, steht hier mit seinem Grund — der Arbeitsvorrat beim Anschließen eines Zählers. Sortierung `empfangen_at DESC` (neueste zuerst), optionaler Filter `grund`.
         *     **Bewusst NICHT ausgegeben:** der DevEUI-Blind-Index (stabiler Korrelations-Schlüssel über alle Uplinks eines Geräts — RL-2 verbietet die Klartext-DevEUI, und ein dauerhaft gleicher Ersatzschlüssel wäre an einer Betriebsliste dasselbe Problem in Grün), der `payload_hash` und der Rohpayload selbst. Aus dem redigierten Envelope wird EIN Feld übernommen — `fPort` —, weil sich ohne die Portnummer ein `decode_fehler` nicht einordnen lässt.
         */
        get: operations["ingestQuarantaeneListe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ingest/herkunft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Herkunfts-Zuordnungen auflisten (Netzserver-Kennung → EDMS-Standort, PII-frei)
         * @description ABAC-Aktion `read:monitoring`, Rollen `betrieb`/`compliance-auditor`. Übersetzt die opaken ChirpStack-Kennungen in EDMS-Stammdaten: Tenant → Endkunde (n:1), Application → Standort (1:1).
         *     **Bewusst OHNE Pagination:** eine Zeile je ChirpStack-Application, also die Größenordnung „Gebäude im Bestand"; die Pflege-Sicht will ohnehin alles auf einmal sehen, um Lücken zu erkennen.
         *     **Bewusst OHNE Namen — auf beiden Seiten.** Die ChirpStack-Namen (`tenantName`, `applicationName`) werden gar nicht erst gelesen (ADR-0011 D1: Freitext aus einem fremden System, im Beleg faktisch eine Anschrift). Der EDMS-Standortname liegt feldverschlüsselt in `identity.standort_pii` und ist PII — `/monitoring/ingest` ist eine PII-freie Fläche (ADR-0011 O12).
         */
        get: operations["herkunftMappingListe"];
        put?: never;
        /**
         * ChirpStack-Application einem EDMS-Standort zuordnen
         * @description ABAC-Aktion `create:herkunft_mapping`. Rolle `betrieb` — NICHT `compliance-auditor` (DS-01, strikt lesend). Die Route liegt unter `/monitoring`, ist aber keine Monitoring-Handlung: Seit ADR-0011 B3 entscheidet die Zuordnung mit darüber, WESSEN Messwerte eingespeist werden.
         *     Drei Regeln setzt die Datenbank durch (V0042), nicht der Anwendungscode: eine Application gehört zu genau einem Standort (409), ein Tenant zu genau einem Endkunden (409), und der Standort muss dem angegebenen Endkunden gehören (400).
         *     Audit `herkunft_mapping.ingest.zugeordnet` (kontext={synthetic, chirpstack_tenant_id, chirpstack_application_id, endkunde_id, standort_id, quelle_code}).
         */
        post: operations["herkunftMappingAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ingest/herkunft/{herkunftId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                herkunftId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Herkunfts-Zuordnung entfernen
         * @description ABAC-Aktion `delete:herkunft_mapping`. Rolle `betrieb`.
         *     **Folge, die in der Oberfläche zu benennen ist:** Für diesen Tenant greift der Herkunfts-Abgleich (ADR-0011 B3/D4) danach nicht mehr — Uplinks werden wieder ungeprüft eingespeist.
         *     Antwortet mit der ENTFERNTEN Zeile statt mit `204`: Der Audit-Kontext braucht die Kennungen einer Zeile, die es danach nicht mehr gibt. Idempotent im Sinne der Zustandswirkung — ein zweiter Aufruf ändert nichts mehr und antwortet `404`.
         *     Es gibt bewusst KEIN Ändern: Umhängen läuft als Entfernen + Neuzuordnung, damit der Übergang lückenlos aus zwei Audit-Zeilen hervorgeht statt aus einem `geändert` ohne Vorzustand.
         *     Audit `herkunft_mapping.ingest.entfernt`.
         */
        delete: operations["herkunftMappingEntfernen"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ingest/quellen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Datenquellen (Broker) auflisten — OHNE Zugangsdaten
         * @description ABAC-Aktion `read:monitoring`, Rollen `betrieb`/`compliance-auditor`.
         *     Die gepflegte Konfiguration der Messdaten-Quellen (`ingest.quelle`, V0059) — das Gegenstück zu `/monitoring/ingest/status`, das den Laufzeit-Zustand des Workers zeigt.
         *     **Ohne Pagination:** Ein Betrieb führt eine Handvoll Netze.
         *     **Geheimnisse werden NIE ausgegeben** — weder Klartext noch maskiert noch gehasht. Ein maskierter Wert verriete Länge und Ränder, ein Hash wäre ein Orakel für schwache Passwörter. Stattdessen nennt `hinterlegteGeheimnisse`, WELCHE Felder belegt sind.
         */
        get: operations["ingestQuellenListe"];
        put?: never;
        /**
         * Datenquelle anlegen (inkl. Zugangsdaten/Zertifikat)
         * @description ABAC-Aktion `create:ingest_quelle`. Rolle `betrieb` — NICHT `compliance-auditor` (DS-01, strikt lesend).
         *     Wer eine Quelle anlegt, bestimmt, WOHER dieses System Messwerte bezieht. Deshalb eine eigene Aktion statt einer Ausweitung von `read:monitoring`.
         *     Zugangsdaten und Zertifikate werden feldverschlüsselt abgelegt (AES-256-GCM, Schlüssel je Quelle) und verlassen die Datenbank nur Richtung Ingest-Worker. Die Antwort trägt sie nicht.
         *     `brokerHost` ist NUR Host[:Port] — Zugangsdaten in der Adresse werden abgewiesen (400), auf Datenbank-Ebene zusätzlich durch einen CHECK.
         *     Bei `tlsModus: mtls` sind `clientZertifikat` UND `clientSchluessel` Pflicht: Ohne sie scheitert erst der Verbindungsaufbau, und zwar unbemerkt im Worker-Protokoll.
         *     Audit `quelle.ingest.angelegt`; wurden Geheimnisse hinterlegt, zusätzlich `quelle.ingest.zugangsdaten_hinterlegt`.
         */
        post: operations["ingestQuelleAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/monitoring/ingest/quellen/{quelleId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quelleId: string;
            };
            cookie?: never;
        };
        /**
         * Datenquelle lesen — OHNE Zugangsdaten
         * @description ABAC-Aktion `read:monitoring`, Rollen `betrieb`/`compliance-auditor`.
         */
        get: operations["ingestQuelleDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Datenquelle ändern, deaktivieren oder Zugangsdaten ersetzen
         * @description ABAC-Aktion `update:ingest_quelle`. Rolle `betrieb`.
         *     Ein weggelassenes Feld bleibt unverändert — insbesondere bei den Geheimnissen: Wer eine Quelle umbenennt, löscht damit nicht ihr Passwort. Ein LEERER String entfernt ein hinterlegtes Geheimnis; das ist die einzige Art, es ohne Neuanlage loszuwerden.
         *     `quelleCode` lässt sich NICHT ändern: Über ihn lädt ein Worker seine Konfiguration, und bereits protokollierte Quarantäne-Zeilen zeigten danach auf nichts mehr.
         *     Deaktivieren (`status: inaktiv`) ist kein Löschen — die Kennung bleibt in Quarantäne-Zeilen und im Herkunfts-Abgleich referenziert. Ein Worker, dessen Quelle inaktiv ist, startet NICHT (fail-closed).
         *     Audit `quelle.ingest.geaendert`; wurden Geheimnisse gesetzt, zusätzlich `quelle.ingest.zugangsdaten_hinterlegt`.
         */
        patch: operations["ingestQuelleAendern"];
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/standorte": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        /**
         * Standort-Baum auflisten (PII-frei, Struktur-Lesestufe)
         * @description ABAC-Aktion `read:standort`. Rollen `betrieb`/`compliance-auditor` (Auswerte-Rollen). Liefert AUSSCHLIESSLICH Pseudonyme/typ/ebene/pfad/ status/hatAdresse/zaehlerAnzahl (Linie 2, D5) — NIEMALS Bezeichnung oder Adresse. Kommt strukturell OHNE jeden `identity`-Zugriff zustande. Bewusst KEINE Cursor-Pagination (das harte Tiefenlimit 0-9, D2.3, begrenzt die Knotenzahl je Endkunde strukturell).
         */
        get: operations["standorteListe"];
        put?: never;
        /**
         * Standort anlegen (Struktur + PII in einer Transaktion)
         * @description ABAC-Aktion `create:standort`. Rolle `betrieb`. `bezeichnung` ist PFLICHT (D4: `identity.standort_pii.bezeichnung_enc` existiert auf JEDER Ebene) und wird feldverschlüsselt — mit dem WIEDERVERWENDETEN Endkunden-DEK (D4/A2: "Standort-DEK == Endkunden-DEK", KEIN neuer Schlüssel). `adresse` ist Pflicht auf Wurzelknoten, optional auf `gebaeude`, sonst unzulässig (D4). Die Antwort ist AUSSCHLIESSLICH `StandortStruktur` (D5-Trennung: auch die Create-Antwort trägt NIEMALS das soeben übermittelte Label zurück — Label-Lesen bleibt `read:standort_pii` vorbehalten). Synthetic-only. Audit `standort.stammdaten.angelegt` (kontext={synthetic,endkunde_id,typ,ebene,parent_id_neu}).
         */
        post: operations["standortAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/standorte/labels": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Standort-Labels batch-entschlüsseln (Baum-UI, PII-Lesestufe)
         * @description ABAC-Aktion `read:standort_pii`. Rolle `betrieb` NUR (`compliance-auditor` bleibt strukturell ausgeschlossen — RBAC UND eine eigenständige PDP-Regel, Defense-in-Depth). ADR-0010 D5, AUSDRÜCKLICH KEIN Break-glass ("Adresslesen ist Alltagsbetrieb"), aber IMMER auditiert: GENAU EIN Audit-Event `standort.pii.einsicht` je Aufruf (kontext={synthetic,endkunde_id,anzahl_knoten}), NICHT eines je Knoten. Standort-Ids, die nicht zum angegebenen `endkundeId` gehören oder nicht existieren, werden STILL aus dem Ergebnis gefiltert (kein Fehler, kein Existenz-Leak). Synthetic-only.
         */
        post: operations["standortLabelsBatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/standorte/{standortId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Standort hart löschen (D2.6 — nur Blattknoten ohne Verortungshistorie)
         * @description ABAC-Aktion `delete:standort`. Rolle `betrieb`. Echtes Hard-DELETE — "Korrektur von Fehlanlagen", NUR zulässig für Blattknoten OHNE JEDE (auch historische) Verortungshistorie; sonst 409. Löscht in derselben Transaktion die zugehörige `identity.standort_pii`-Zeile (verhindert eine verwaiste PII-Zeile). IDEMPOTENT im HTTP-Sinn: der erste Aufruf liefert 200, ein wiederholter Aufruf auf die (nun nicht mehr existierende) Ressource liefert 404 — der Endzustand ("Ressource existiert nicht") ist in beiden Fällen identisch. Audit `standort.stammdaten.geloescht` (kontext={synthetic,endkunde_id,typ,parent_id_alt}).
         */
        delete: operations["standortLoeschen"];
        options?: never;
        head?: never;
        /**
         * Standort-Struktur ändern (typ/sortierung — NICHT status/PII)
         * @description ABAC-Aktion `update:standort`. Rolle `betrieb`. AUSDRÜCKLICH NICHT für `status` (eigene Aktion `.../stilllegen`, D2.6) und NICHT für Label/Adresse (eigene Route `.../pii`, D5-Trennung). Audit `standort.stammdaten.geaendert` (kontext={synthetic,endkunde_id,typ}).
         */
        patch: operations["standortAendern"];
        trace?: never;
    };
    "/stammdaten/standorte/{standortId}/pii": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Standort-Label/Adresse ändern (Vollersatz, feldverschlüsselt)
         * @description ABAC-Aktion `update:standort` (Schreiben ist kein Lesen, D5 — `read:standort_pii` bleibt der Batch-Lese-Route vorbehalten). `bezeichnung` PFLICHT, Vollersatz (kein Feld-Teil-Update: ein weggelassenes `adresse` LÖSCHT die hinterlegte Adresse). Adressregeln wie beim Anlegen (D4). Antwort ECHOT den soeben geschriebenen Klartext (keine erneute Entschlüsselung nötig — der Aufrufer kennt den Wert bereits, keine zusätzliche Offenlegung). Audit `standort.pii.geaendert` (kontext={synthetic,endkunde_id,pii_felder} — `pii_felder` = kommagetrennte Feldnamen, KEINE Werte). Synthetic-only.
         */
        put: operations["standortPiiAendern"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/standorte/{standortId}/verschieben": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Standort verschieben (Reparent, D6)
         * @description ABAC-Aktion `update:standort`. Rolle `betrieb`. `neuerParentId=null` verschiebt an die Wurzel (nur zulässig für `typ` `liegenschaft`/`gebaeude`, D2.4). Lehnt Zyklen (Ziel-Parent ist Nachfahre oder der Knoten selbst, D2.2), Tiefenlimit-Verletzungen (D2.3) und Mandanten-Fremdzugriff (D2.1) ab. Aktualisiert `pfad`/ `ebene` ALLER Nachfahren in derselben DB-Anweisung (D6) — Response `nachfahrenAktualisiert` belegt die Reichweite. Audit `standort.stammdaten.verschoben` (kontext={synthetic,endkunde_id,parent_id_alt,parent_id_neu,ebene,nachfahren_anzahl}).
         */
        post: operations["standortVerschieben"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/standorte/{standortId}/stilllegen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Standort stilllegen (Zustandswechsel, KEIN Hard-Delete, D2.6)
         * @description ABAC-Aktion `update:standort`. Rolle `betrieb`. Nur zulässig ohne aktive Kinder UND ohne offene Zähler-Verortungen am Knoten selbst (409 sonst). IDEMPOTENT. Audit `standort.stammdaten.stillgelegt` (kontext={synthetic,endkunde_id,status_alt,status_neu}).
         */
        post: operations["standortStilllegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/standorte/{standortId}/zaehler": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        /**
         * Kern-Query — alle Zähler unter diesem Knoten zum Stichtag T (D6)
         * @description ABAC-Aktion `read:standort`. Rollen `betrieb`/`compliance-auditor`. PII-frei, vollständig innerhalb `energy.*` (kein `identity`-Zugriff). `stichtag` Default `now()`; `inklusiveUnterknoten` Default `true` (gesamter Teilbaum via `pfad @> ARRAY[:knoten]`, D6).
         */
        get: operations["zaehlerUnterKnoten"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/zaehler/{zaehlerId}/verortung": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        /**
         * Aktuelle Verortung eines Zählers inkl. Breadcrumb-Pfad (D6, Wurzel zuerst)
         * @description ABAC-Aktion `read:standort` — dieselbe Struktur-Lesestufe wie die Baum-/Kern-Query-Routen (D5): liefert AUSSCHLIESSLICH `id`/`typ`/ `ebene`/`status` je Pfadknoten, NIEMALS Bezeichnung/Adresse. Rollen `betrieb`/`compliance-auditor`. Schließt die bislang fehlende Umkehrrichtung zu `GET .../standorte/{id}/zaehler` (D6): „Wo hängt dieser Zähler?" (Betriebs-UI-Konzept). `pfad` ist die Vorfahrenkette (materialisierter Pfad, D6) INKLUSIVE des eigenen Standort-Knotens, WURZEL ZUERST (Breadcrumb-Reihenfolge) — Labels holt die UI wie gewohnt über den bestehenden Batch-Endpunkt `POST .../standorte/labels` (`read:standort_pii`); dieser Lesepfad führt KEINEN neuen Weg zu Bezeichnungen ein. `verortet=false` (EMPTY-STATE, 200 statt 404) sowohl bei einem Zähler OHNE jede Verortung als auch bei einem Zähler mit AUSSCHLIESSLICH historischen (bereits beendeten) Verortungen — nur die aktuell OFFENE Zeitscheibe (`gueltig_bis IS NULL`) zählt als "aktuell".
         */
        get: operations["zaehlerAktuelleVerortung"];
        put?: never;
        /**
         * Zähler verorten ("Umsetzen" — beendet die offene Vorgänger-Verortung atomar)
         * @description ABAC-Aktion `create:zaehler_standort`. Rolle `betrieb`. Öffnet eine neue Zeitscheibe (`gueltig_bis IS NULL`) UND schließt — sofern vorhanden — die aktuell offene Vorgänger-Verortung dieses Zählers GENAU an `gueltigVon` (D3, "Umsetzen") in DERSELBEN Transaktion: zwei Zeitscheiben ohne Lücke, ohne Overlap. `EXCLUDE`-Constraint (D-EXCL) bleibt der atomare Garant gegen Races. Audit `zaehler.standort.zugeordnet` (kontext={synthetic,zaehler_id,standort_id,gueltig_von}).
         */
        post: operations["zaehlerVerortungAnlegen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/zaehler/{zaehlerId}/verortung/beenden": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Aktuell offene Zähler-Verortung beenden
         * @description ABAC-Aktion `update:zaehler_standort`. Rolle `betrieb`. IDEMPOTENT bezüglich desselben Endzeitpunkts. Audit `zaehler.standort.beendet` (kontext={synthetic,zaehler_id,standort_id,gueltig_bis}).
         */
        post: operations["zaehlerVerortungBeenden"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/systeme/{systemId}/einflussgroessen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        /**
         * Einflussgrößen eines Systems auflisten (Klartext, PII-Lesestufe)
         * @description ABAC-Aktion `read:einflussgroesse`. Rolle `betrieb` NUR (`compliance-auditor` bleibt strukturell ausgeschlossen — RBAC UND eine eigenständige PDP-Regel, Defense-in-Depth, B10: "Klartext-PII- Leseaktion"). Liefert die VOLLSTÄNDIGEN Intervall-Zeilen inkl. `wertNum`/`wertCode` — KEINE Verschlüsselung/Pseudonymisierung (`migrations/V0020` D-ROLLE). IMMER auditiert (auch bei Ablehnung), EIN Audit-Event je Aufruf (`einflussgroesse.stammdaten.einsicht`, kontext={synthetic,system_id,endkunde_id,anzahl_saetze}), NICHT eines je Zeile. Synthetic-only. Bewusst UNPAGINIERT (fachlich bounded: fünf Katalog-Codes je System).
         */
        get: operations["einflussgroesseListe"];
        put?: never;
        /**
         * Einflussgröße erfassen (Zustands-Zeitreihe, D8.2/D8.3)
         * @description ABAC-Aktion `create:einflussgroesse`. Rolle `betrieb`. `endkundeId` wird AUSSCHLIESSLICH aus dem System abgeleitet (RL-B1) — der Request-Body trägt bewusst KEIN `endkundeId`-Feld. `groesseCode` muss ein AKTIVER `einfluss.katalog`-Code sein; `wertNum` XOR `wertCode` je nach `wert_art` des Katalog-Eintrags. Bei `betroffenerTyp=anschlussnutzer` sind `rechtsgrundlage=art6_1f`, `abwaegungRef` und `art14InformationAt` zwingend (Art. 14 DSGVO). Bei gesetztem `standortId`: an/unter diesem Knoten muss im angegebenen Zeitraum eine Zähler-Verortung bestehen (RL-B1, ADR-0010 D3), sonst 400. Ein offenes Vorgänger-Intervall derselben (`systemId`,`groesseCode`) wird atomar geschlossen ("Umsetzen", analog Zähler-Verortung); ein ECHTER zeitlicher Overlap liefert 409 (`ex_einfluss_no_overlap`). Synthetic-only. Audit `einflussgroesse.stammdaten.erfasst` (kontext={synthetic,einflussgroesse_id,endkunde_id,system_id,groesse_code,gueltig_ab_monat,gueltig_bis_monat,betroffener_typ,quelle_typ,rechtsgrundlage} — AUSDRÜCKLICH KEIN wert_num/wert_code/anlass_code, A9).
         */
        post: operations["einflussgroesseErfassen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stammdaten/einflussgroessen/{einflussgroesseId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Einflussgrößen-Intervall-ID (einfluss.intervall.id, ADR-0006 Teil B). */
                einflussgroesseId: components["parameters"]["EinflussgroesseIdPath"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Einflussgröße korrigieren (schließt + legt optional eine neue Zeile an)
         * @description ABAC-Aktion `update:einflussgroesse`. Rolle `betrieb`. Schließt IMMER das adressierte Intervall (`gueltigBisMonat` — die EINZIGE erlaubte UPDATE-Spalte, `migrations/V0020` D-UPDATE-SCOPE, spaltenscharfer GRANT). `korrektur` (optional) legt zusätzlich, in DERSELBEN Transaktion, eine NEUE Zeile mit `anlassCode=korrektur` an (append-only — Werte werden NIE überschrieben); `groesseCode` wird dabei vom ursprünglichen Intervall GEERBT (keine Änderung der Einflussgröße über diese Route). Emittiert BIS ZU ZWEI Audit-Events: IMMER `einflussgroesse.stammdaten.geaendert` (das Schließen, kontext wie beim Erfassen) UND — nur bei begleitender Korrektur-Zeile — ZUSÄTZLICH `einflussgroesse.stammdaten.erfasst` für die neue Zeile. Synthetic-only.
         */
        patch: operations["einflussgroesseKorrigieren"];
        trace?: never;
    };
    "/stammdaten/endkunden/{endkundeId}/einflussgroessen/befunde": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        /**
         * TB-03-Schwellwertüberschreitungen eines Endkunden auflisten
         * @description ABAC-Aktion `read:einflussgroesse`. Rolle `betrieb` NUR (Auditor- Deny, analog der Liste je System). v1 NUR LESEND — die Schwellwert- **Erkennung** (schreibt `einfluss.befund`) ist NICHT Teil dieser Version (`tb03_schwellwert` im Katalog noch überall `NULL`). Liefert AUSSCHLIESSLICH klassierte Überschreitungen (`ueberschreitungKlasse`), NIEMALS einen Rohprozentsatz (B12.5). KEIN eigenes Audit-Event (kein Klartext-PII-Zugriff — `einfluss.befund` trägt keinen Einflussgrößen-Wert). Bewusst UNPAGINIERT.
         */
        get: operations["einflussgroesseBefunde"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Fehlerobjekt nach RFC 9457 (application/problem+json). */
        Problem: {
            /**
             * Format: uri
             * @default about:blank
             */
            type: string;
            title: string;
            status: number;
            /** @description Menschenlesbare, PII-freie Detailbeschreibung. NIEMALS roher DB-/ Krypto-/IdP-Fehlertext, kein Stacktrace, keine Tokens/Secrets/PII. */
            detail?: string;
            /** Format: uri */
            instance?: string;
        };
        /** @description Cursor-Pagination-Metadaten. */
        SeitenInfo: {
            /** @description Opaker Cursor der nächsten Seite; null = letzte Seite. */
            naechsterCursor?: string | null;
            limit: number;
        };
        /**
         * @description aktiv | gesperrt (Art. 18) | geloescht/anonym (Art. 17).
         * @enum {string}
         */
        VerarbeitungsStatus: "aktiv" | "gesperrt" | "geloescht";
        /**
         * @description Geschlossene Liste der vier Tatbestaende des Art. 18 Abs. 1 DSGVO (`energy.endkunde.einschraenkung_grund_code` / `energy.anschlussnutzer.einschraenkung_grund_code`, V0024, per CHECK erzwungen). Art. 18 Abs. 1 kennt KEINE Auffangklausel — es gibt daher bewusst keinen fuenften Code „sonstiges": ein solcher waere binnen Wochen der Sammeleimer und stellte den mit Auflage A11 beseitigten Pauschal-Blocker ueber die Hintertuer wieder her.
         *
         *     WIRKUNG im Nachweis (ADR-0007 C4/A11): `art18_1a_richtigkeit` und `art18_1c_rechtsverteidigung_betroffener` => Ausweis MIT Kennzeichnung (Preflight-Regel FJ-07b bzw. FJ-11b beim Anschlussnutzer). `art18_1b_unrechtmaessig` und `art18_1d_widerspruch` => PAAR-Ausschluss (FJ-07c/FJ-11c) — hier wuerde die Uebermittlung genau den Zustand ausweiten, den die Einschraenkung einfrieren soll. 1a und 1d sind ihrem Wortlaut nach BEFRISTET (vgl. `gesperrtSeit`).
         *
         *     Nicht-Art.-18-Verarbeitungsstopps — Einwilligungswiderruf (Art. 7 Abs. 3, separat ueber `consentStatus`), betrieblicher Legal-Hold, Incident-bedingtes Einfrieren — werden hierueber NICHT abgebildet.
         * @enum {string}
         */
        EinschraenkungGrund: "art18_1a_richtigkeit" | "art18_1b_unrechtmaessig" | "art18_1c_rechtsverteidigung_betroffener" | "art18_1d_widerspruch";
        /** @description Request-Body von `POST /stammdaten/anschlussnutzer/{anschlussnutzerId}/sperren`. Inhaltlich identisch zu `EndkundeSperren` — bewusst ein EIGENES Schema, weil es eine eigenstaendige Ressource mit eigener betroffener Person ist; die gemeinsame Substanz steckt im geteilten `EinschraenkungGrund`-Enum. */
        AnschlussnutzerSperren: {
            /** @description PFLICHT — s. `EndkundeSperren.grund`. */
            grund: components["schemas"]["EinschraenkungGrund"];
            /**
             * @description Auflage C-8 (ADR-0012 Stufe C) — die Entscheidung, ob die Messdaten-Erhebung waehrend der Einschraenkung FORTGESETZT wird.
             *     PFLICHT bei `art18_1b_unrechtmaessig` und `art18_1d_widerspruch`, UNZULAESSIG bei `art18_1a_richtigkeit` und `art18_1c_rechtsverteidigung_betroffener` — beides wird mit 400 beantwortet. Grund fuer die Asymmetrie: Art. 18 Abs. 2 nimmt die SPEICHERUNG aus der Einschraenkung aus, die Frage stellt sich deshalb nur dort, wo die Rechtmaessigkeit des Erhebens selbst in Frage steht. Bei lit. a/lit. c waere eine Angabe eine Aussage, die niemand getroffen hat.
             *     KEIN Default: `true` hiesse weitermessen, obwohl die Rechtmaessigkeit bestritten ist; `false` hiesse eine Messluecke erzeugen, die sich nachtraeglich nicht schliessen laesst. Eine abweichende Wiederholung bei gleichem Grund wird mit 409 abgelehnt statt still verworfen — die Aenderung der Entscheidung ist ein eigener dokumentierter Vorgang.
             */
            neuerhebungFortsetzen?: boolean;
        };
        EinschraenkungFristItem: {
            /** @enum {string} */
            subjektTyp: "endkunde" | "anschlussnutzer";
            /** Format: uuid */
            subjektId: string;
            /**
             * Format: uuid
             * @description Bezugs-Endkunde — beim Endkunden er selbst, beim Anschlussnutzer sein Endkunde. Einstieg für die Sachbearbeitung.
             */
            endkundeId: string;
            einschraenkungGrundCode: components["schemas"]["EinschraenkungGrund"];
            /** Format: date-time */
            gesperrtSeit: string;
            /** @description Tage seit `gesperrtSeit`, in der Datenbank gerechnet (eine Zeitbasis). */
            tageOffen: number;
            /** @description `tageOffen >= schwelleTage`. Markiert, löst nichts aus. */
            ueberfaellig: boolean;
        };
        EinschraenkungFristReport: {
            schwelleTage: number;
            items: components["schemas"]["EinschraenkungFristItem"][];
            ueberfaelligAnzahl: number;
        };
        /** @description Auflage C-8 — Stand der Entscheidungen ueber die weitere Messdaten-Erhebung. */
        ErhebungsEntscheidungReport: {
            items: components["schemas"]["ErhebungsEntscheidungItem"][];
            /** @description Sperren mit lit. b / lit. d, bei denen niemand entschieden hat. */
            entscheidungOffenAnzahl: number;
            /** @description Sperren, bei denen die Messung ausdruecklich gestoppt wurde. */
            erhebungGestopptAnzahl: number;
        };
        ErhebungsEntscheidungItem: {
            /** @enum {string} */
            subjektTyp: "endkunde" | "anschlussnutzer";
            /** Format: uuid */
            subjektId: string;
            /**
             * Format: uuid
             * @description Bezugs-Endkunde — beim Endkunden er selbst, beim Anschlussnutzer sein Endkunde.
             */
            endkundeId: string;
            einschraenkungGrundCode: components["schemas"]["EinschraenkungGrund"];
            /** Format: date-time */
            gesperrtSeit: string;
            tageOffen: number;
            /**
             * @description `entscheidung_offen` heisst „nicht entschieden", NICHT „entschieden, nicht zu erheben". Die Unterscheidung ist der Zweck dieses Berichts — sie zu verwischen waere derselbe Fehler, den die Spalte ohne Default vermeidet.
             * @enum {string}
             */
            lage: "entscheidung_offen" | "erhebung_gestoppt" | "erhebung_laeuft";
        };
        /**
         * @description Body der Unterrichtungs-Route (Art. 18 Abs. 3 DSGVO). Geteilt von Endkunde und Anschlussnutzer — der Vorgang ist für beide identisch.
         *
         *     Kein Feld für den Zeitpunkt und keines für den Ausführenden: beides wird serverseitig gesetzt. Sonst wäre der Nachweis rückdatierbar bzw. einem Dritten zuschreibbar — und genau das soll er belegen.
         */
        EinschraenkungUnterrichtung: {
            /**
             * @description Auf welchem Weg unterrichtet wurde. GESCHLOSSENE Liste, bewusst KEIN Freitext: ein Freitextfeld enthielte binnen Wochen Kontaktdaten („Mail an …") und trüge damit PII in eine Tabelle und ein Audit-Log, die beide bewusst keine führen.
             * @enum {string}
             */
            kanal: "postalisch" | "elektronisch" | "telefonisch" | "persoenlich";
        };
        /**
         * @description Request-Body von `POST /stammdaten/endkunden/{endkundeId}/sperren`. Whitelisted Grund, kein Freitext (Linie 2, Muster `StandortStilllegen`).
         *
         *     `gesperrtSeit` ist bewusst KEIN Feld: der Zeitpunkt wird serverseitig gesetzt, damit er nicht rueckdatiert werden kann (A11.3).
         */
        EndkundeSperren: {
            /** @description PFLICHT. Ohne den Grund ist Art. 18 Abs. 2 nicht anwendbar — welcher der vier abschliessenden Erlaubnistatbestaende die Uebermittlung traegt, haengt am Sperrgrund. Fehlt er, muss fail-closed ausgeschlossen werden, was die betroffene Person SCHLECHTER stellt. Rechtsgrundlage der Speicherung: Art. 6 Abs. 1 lit. c i. V. m. Art. 18/Art. 12 und Art. 5 Abs. 2. */
            grund: components["schemas"]["EinschraenkungGrund"];
            /**
             * @description Auflage C-8 (ADR-0012 Stufe C) — die Entscheidung, ob die Messdaten-Erhebung waehrend der Einschraenkung FORTGESETZT wird.
             *     PFLICHT bei `art18_1b_unrechtmaessig` und `art18_1d_widerspruch`, UNZULAESSIG bei `art18_1a_richtigkeit` und `art18_1c_rechtsverteidigung_betroffener` — beides wird mit 400 beantwortet. Grund fuer die Asymmetrie: Art. 18 Abs. 2 nimmt die SPEICHERUNG aus der Einschraenkung aus, die Frage stellt sich deshalb nur dort, wo die Rechtmaessigkeit des Erhebens selbst in Frage steht. Bei lit. a/lit. c waere eine Angabe eine Aussage, die niemand getroffen hat.
             *     KEIN Default: `true` hiesse weitermessen, obwohl die Rechtmaessigkeit bestritten ist; `false` hiesse eine Messluecke erzeugen, die sich nachtraeglich nicht schliessen laesst. Eine abweichende Wiederholung bei gleichem Grund wird mit 409 abgelehnt statt still verworfen — die Aenderung der Entscheidung ist ein eigener dokumentierter Vorgang.
             */
            neuerhebungFortsetzen?: boolean;
        };
        /**
         * @description Consent-Slot — nur anzeigen/respektieren, nicht erfassen (Consent-ADR).
         * @enum {string}
         */
        ConsentStatus: "aktiv" | "fehlt" | "widerrufen";
        /**
         * @description ESZ-Energieträger (F7); Wasser NICHT in v1.
         * @enum {string}
         */
        Energietraeger: "strom" | "waerme" | "kaelte" | "gas" | "oel" | "biomasse";
        /**
         * @description aktiv | stillgelegt (nie hart löschen).
         * @enum {string}
         */
        BetriebsStatus: "aktiv" | "stillgelegt";
        /** @enum {string} */
        MessgroesseArt: "kumulativ_zaehlerstand" | "intervall_verbrauch";
        /** @enum {string} */
        MesskonzeptTyp: "vereinfacht" | "standard" | "alternativ";
        /**
         * @description ABAC-Steuergröße (DS-07); Default abrechnungsminimum.
         * @enum {string}
         */
        Datenklasse: "abrechnungsminimum" | "detailverbrauch";
        /**
         * @description Rolle des Anschlussnutzers im Verhältnis. Enum-Set v1; Erweiterung mit dem ersten Mieter-Projekt (ADR-0004 §8.2/O3).
         * @enum {string}
         */
        NutzungsRolle: "mieter" | "eigentuemer_selbstnutzer" | "gewerbe_nutzer" | "sonstige";
        /**
         * @description Fehlende Stammdaten je Entität (DE-02).
         * @enum {string}
         */
        LueckenTyp: "kein_messkonzept" | "kein_zaehler" | "kein_messkanal" | "kein_aktiver_consent" | "keine_mindestaufloesungs_zusage";
        EndkundeLabelsAnfrage: {
            /** @description Obergrenze 100 (A2) — bewusst NICHT 500 wie beim Standort-Batch: dieser Endpunkt liegt nicht unter `{endkundeId}` und hat keine Mandantengrenze als natürlichen Deckel. 100 = `limit`-Maximum aus `api-contracts.md`; die aufrufende Seitengröße MUSS ≤ 100 bleiben (A2-Korollar K4). `uniqueItems` ist nicht bloß Hygiene (N2): ohne sie liessen sich 100 identische Ids senden und `anzahl_angefragt` gegenüber `anzahl_endkunden` aufblähen — das verfälschte genau die Differenz, mit der A4 nachgewiesen wird. */
            endkundeIds: string[];
        };
        /** @description `read:endkunde_pii`-Lesestufe — pii=true. AUSSCHLIESSLICH `{id, name}` (A1). Dediziertes Schema, NICHT wiederverwenden und NICHT um Felder erweitern (Erweiterung = neues `compliance-director`-Votum). */
        EndkundeLabelItem: {
            /**
             * Format: uuid
             * @description Pseudonym-Surrogat.
             */
            id: string;
            /** @description pii=true; grundlage=Art.6(1)(b)/(a); ADR-0004 Anhang B P1. */
            name: string;
        };
        /** @description Listen-Projektion — PII-FREI (Linie 2). */
        EndkundeListItem: {
            /**
             * Format: uuid
             * @description Pseudonym-Surrogat (energy.endkunde.id, UUIDv7). pii=false.
             */
            id: string;
            verarbeitungsStatus: components["schemas"]["VerarbeitungsStatus"];
            /**
             * @deprecated
             * @description UEBERHOLT. Spiegelt `energy.endkunde.consent_status` — einen Slot aus V0002, den V0044 abgeloest hat. Die Einwilligung ist seither ein Ereignis (`consent.einwilligung`) und je Zweck und Subjektart zu beurteilen (`consent.zweck_subjekt`, V0047); ein einzelner Status am Endkunden kann das nicht abbilden. Das Feld steht dauerhaft auf `fehlt` und wird von keiner Schreibroute mehr gepflegt. Die belastbare Auskunft liefert `GET /consent/einwilligungen`. Bleibt vorerst im Vertrag (Entfernen waere ein Breaking Change), wird aber in der Oberflaeche nicht mehr angezeigt.
             */
            consentStatus: components["schemas"]["ConsentStatus"];
            /** @description DE-04-Flag (Nicht-PII, ABAC-Eingabe). */
            vonWissAuswertungAusgenommen: boolean;
            /**
             * @description Endkundengruppe/Branche für den LK-Nachweis (V0074) — z. B. „Kreditinstitut". Trägt die Blätter 1, 6b und 7 des Einsparungsnachweises und das BAFA-Formular „Nachweis der leistungsabhängigen Komponente".
             *     FREITEXT: Die maßgebliche Werteliste ist die des LK-Formulars und liegt dem Projekt nicht vor; eine erfundene Kategorienliste sähe verbindlich aus und müsste beim ersten echten Nachweis umgeschlüsselt werden. Erweiterung zur Katalogtabelle ist additiv vorgesehen.
             *     NICHT zu verwechseln mit der Rechtsform (natürliche/juristische Person). Der Wert verlässt das System im pseudonymisierten Nachweis — das ist sein Zweck.
             */
            endkundengruppe: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        EndkundeListe: {
            daten: components["schemas"]["EndkundeListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /** @description Direkt-PII des Vertragspartners (identity.endkunde_pii.*_enc, AES-256-GCM). pii=true. Nur im Detail, nur projektions-erlaubt (D6). */
        EndkundePii: {
            /** @description pii=true; grundlage=Art.6(1)(b)/(a); ADR-0004 Anhang B P1. */
            name: string;
            /** @description pii=true; grundlage=Art.6(1)(b); ADR-0004 Anhang B P2. */
            anschrift: string;
            /** @description pii=true; grundlage=Art.6(1)(a) (TB-06); ADR-0004 Anhang B P3. */
            kontakt?: string | null;
        };
        EndkundeDetail: {
            /**
             * Format: uuid
             * @description Pseudonym-Surrogat.
             */
            id: string;
            verarbeitungsStatus: components["schemas"]["VerarbeitungsStatus"];
            /**
             * @deprecated
             * @description UEBERHOLT. Spiegelt `energy.endkunde.consent_status` — einen Slot aus V0002, den V0044 abgeloest hat. Die Einwilligung ist seither ein Ereignis (`consent.einwilligung`) und je Zweck und Subjektart zu beurteilen (`consent.zweck_subjekt`, V0047); ein einzelner Status am Endkunden kann das nicht abbilden. Das Feld steht dauerhaft auf `fehlt` und wird von keiner Schreibroute mehr gepflegt. Die belastbare Auskunft liefert `GET /consent/einwilligungen`. Bleibt vorerst im Vertrag (Entfernen waere ein Breaking Change), wird aber in der Oberflaeche nicht mehr angezeigt.
             */
            consentStatus: components["schemas"]["ConsentStatus"];
            consentTextVersion?: string | null;
            vonWissAuswertungAusgenommen: boolean;
            /**
             * @description Endkundengruppe/Branche für den LK-Nachweis (V0074) — z. B. „Kreditinstitut". Trägt die Blätter 1, 6b und 7 des Einsparungsnachweises und das BAFA-Formular „Nachweis der leistungsabhängigen Komponente".
             *     FREITEXT: Die maßgebliche Werteliste ist die des LK-Formulars und liegt dem Projekt nicht vor; eine erfundene Kategorienliste sähe verbindlich aus und müsste beim ersten echten Nachweis umgeschlüsselt werden. Erweiterung zur Katalogtabelle ist additiv vorgesehen.
             *     NICHT zu verwechseln mit der Rechtsform (natürliche/juristische Person). Der Wert verlässt das System im pseudonymisierten Nachweis — das ist sein Zweck.
             */
            endkundengruppe: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @description Art.-18-Grund der Verarbeitungseinschraenkung; `null`, solange der Endkunde nicht gesperrt ist — `ck_endkunde_einschraenkung_kohaerenz` (V0024) laesst den Grund ausschliesslich bei verarbeitungsStatus=gesperrt zu. INTERN (ADR-0007 C4 Punkt 6): verlaesst das System nur als neutraler Sammelcode `datenschutzrechtliche_einschraenkung` — BAFA-Export, Nutzerinformation und Mehrwertdienste sehen den differenzierten Grund NIE. Sichtbar fuer `betrieb` UND `compliance-auditor` (A11.4): `betrieb` setzt die Sperre und braucht den Grund zur Fristenkontrolle (Art. 18 Abs. 1 lit. a/d sind befristet); der Auditor prueft, ob die Preflight-Einstufung (FJ-07b vs. FJ-07c) zum dokumentierten Grund passt — ohne Sicht darauf ist genau diese Kontrolle nicht auditierbar. BEWUSST NICHT ueber `PiiProjektionsPolicy` maskiert: die liefert `null` fuer jeden nicht-aktiven Status, der Grund existiert aber nur bei `gesperrt` — er waere also nie sichtbar. NICHT filter-/sortierbar und NICHT im `EndkundeListItem`, sonst wuerde aus einem Zustandsfeld eine abfragbare Betroffenenrechts-Kartei. */
            einschraenkungGrundCode?: components["schemas"]["EinschraenkungGrund"] | null;
            /**
             * Format: date-time
             * @description Zeitpunkt der Verarbeitungseinschraenkung (UTC, serverseitig gesetzt — kein Client-Wert, A11.3: kein Rueckdatieren; ein abweichendes Antragseingangsdatum gehoert in die Vorgangsakte). Grundlage der Fristenueberwachung fuer Art. 18 Abs. 1 lit. a/d.
             */
            gesperrtSeit?: string | null;
            /** @description Auflage C-8 — die am Sperrvorgang festgehaltene Entscheidung ueber die WEITERE ERHEBUNG. `null` heisst „Frage stellt sich nicht" (lit. a/lit. c) oder „keine Einschraenkung"; NICHT „entschieden, nicht weiterzuerheben". Wird beim Aufheben der Einschraenkung zusammen mit Grund und Zeitpunkt genullt — sie gehoert zu GENAU DIESER Einschraenkung. Sichtbarkeit wie `einschraenkungGrundCode`: wer den Grund sehen darf, muss auch sehen, was daraus fuer die Messung folgt. */
            neuerhebungFortsetzen?: boolean | null;
            /** @description PII-Block. NULL, wenn die aufrufende Rolle/der Zustand keinen PII-Zugriff erlaubt (compliance-auditor, gesperrt, geschreddert) — Laufzeit-Maskierung (D6). Für Rolle `betrieb` bei aktivem Subjekt befüllt. */
            stammdatenPii?: components["schemas"]["EndkundePii"] | null;
        };
        EndkundeAnlegen: {
            stammdatenPii: components["schemas"]["EndkundePii"];
            /** @description Branche für den LK-Nachweis (V0074). S. `EndkundeDetail.endkundengruppe`. */
            endkundengruppe?: string;
            /**
             * @deprecated
             * @description WIRD ABGEWIESEN (**400**). Das DE-04-Ausnahme-Attribut wird seit AW-27 (V0052) AUSSCHLIESSLICH über eine Erklärung gesetzt: `POST /consent/widersprueche` mit `zweckCode: wiss_auswertung`. Ein von Hand gesetztes Flag behauptet einen Vorgang, den niemand belegen kann — für eine Auskunft nach Art. 15 und den Nachweis nach Art. 5 Abs. 2 ist aber genau die Frage, wer wann auf welchem Weg widersprochen hat.
             *     Das Feld bleibt im Vertrag, damit ein Aufruf mit ihm einen erklärten Fehler bekommt statt der generischen `forbidNonWhitelisted`-Meldung. Gelesen wird es weiterhin (`EndkundeDetail`, `EndkundeListItem`) — dort ist es die Durchsetzungsstelle.
             */
            vonWissAuswertungAusgenommen?: boolean;
        };
        /** @description Teil-Update; consent_status ist NICHT setzbar (Consent-ADR). */
        EndkundeAendern: {
            stammdatenPii?: components["schemas"]["EndkundePii"];
            /** @description Branche für den LK-Nachweis (V0074), nachträglich setzbar oder korrigierbar. S. `EndkundeDetail.endkundengruppe`. */
            endkundengruppe?: string;
            /**
             * @deprecated
             * @description WIRD ABGEWIESEN (**400**). Das DE-04-Ausnahme-Attribut wird seit AW-27 (V0052) AUSSCHLIESSLICH über eine Erklärung gesetzt: `POST /consent/widersprueche` mit `zweckCode: wiss_auswertung`. Ein von Hand gesetztes Flag behauptet einen Vorgang, den niemand belegen kann — für eine Auskunft nach Art. 15 und den Nachweis nach Art. 5 Abs. 2 ist aber genau die Frage, wer wann auf welchem Weg widersprochen hat.
             *     Das Feld bleibt im Vertrag, damit ein Aufruf mit ihm einen erklärten Fehler bekommt statt der generischen `forbidNonWhitelisted`-Meldung. Gelesen wird es weiterhin (`EndkundeDetail`, `EndkundeListItem`) — dort ist es die Durchsetzungsstelle.
             */
            vonWissAuswertungAusgenommen?: boolean;
        };
        /** @description Expliziter Vorsatz für die irreversible Art.-17-Löschung. */
        KryptoShreddingAnweisung: {
            /**
             * @description Muss exakt `ENDGUELTIG_LOESCHEN` sein (Fehlbedienungsschutz).
             * @enum {string}
             */
            bestaetigung: "ENDGUELTIG_LOESCHEN";
            /**
             * @description Whitelisted Löschgrund (kein Freitext, Linie 2).
             * @enum {string}
             */
            grund: "betroffenenantrag_art17" | "aufbewahrung_abgelaufen" | "sonstige_rechtsgrundlage";
        };
        ShreddingErgebnis: {
            /** Format: uuid */
            id: string;
            verarbeitungsStatus: components["schemas"]["VerarbeitungsStatus"];
            /** @description true = DEK vernichtet (unwiderruflich). */
            geschreddert: boolean;
            /** @description ADR-0010 D4 (neue Shred-Dimension "Standort-PII", analog ADR-0005 §26 GB-C) — Anzahl der in DIESEM Aufruf neutralisierten identity.standort_pii-Zeilen (Reichweiten-Nachweis). Der Endkunden-DEK (== Standort-DEK) wird ohnehin nur einmal vernichtet; dieses Feld belegt zusätzlich die Reichweite. `0` bei einem idempotenten Wiederholungsaufruf. */
            standortPiiNeutralisiert: number;
            /** @description ADR-0006 P5b/A7 — Anzahl der pseudonymen analytics.berechnungslauf-Zeilen des Endkunden, die den Shred BEWUSST überleben (Art. 17(3)(b), BAFA-Nachweispflicht) und NICHT gelöscht werden. Ausweis der tatsächlich verbliebenen Bestände, damit der Report keine Vollständigkeit behauptet, die nicht besteht. Spiegelt den Bestand zum Shred-Zeitpunkt (auch beim idempotenten Wiederholungsaufruf). */
            analyticsLaeufeUnveraendert: number;
            /** @description ADR-0006 P5b/A7 — analog zu analyticsLaeufeUnveraendert für die Einflussgrößen-Intervalle (einfluss.intervall) des Endkunden, die den Shred bewusst überleben (Art. 17(3)(b)). In v1 typischerweise 0 (Einflussgrößen-Modul noch nicht implementiert, ADR-0006 C4/P3). */
            einflussIntervalleUnveraendert: number;
        };
        /**
         * @description Zustandsautomat (ADR-0009 §2.1): beantragt -> (Freigabe durch zweite Person) -> ausgefuehrt; beantragt -> abgelehnt (terminal); beantragt -> abgelaufen (gueltigBis überschritten, terminal).
         * @enum {string}
         */
        ShredAntragStatus: "beantragt" | "freigegeben" | "abgelehnt" | "ausgefuehrt" | "abgelaufen";
        /**
         * @description Whitelisted Ablehnungsgrund (kein Freitext, Linie 2). PROVISORISCHE v1-Liste (ADR-0009 §2.1/§8) — finale Bestätigung durch access-control-engineer/compliance-director steht aus.
         * @enum {string}
         */
        ShredAblehnungsgrund: "kein_rechtsgrund" | "endkunde_widerspruch" | "fehlbedienung" | "sonstiges";
        /** @description `components/schemas/ShredAntrag` — EIN Schema für Listen-Item UND Einzel-Detail (ADR-0009 §2.1): keine PII zu maskieren, `beantragtVonSub`/`freigeberSub` sind opake, personenbeziehbare (pii=false) Principals, die das Frontend für die Vier-Augen-UX ohnehin immer benötigt (z. B. Freigeben-Button ausblenden, wenn `beantragtVonSub` === aktuelle Session-`sub`, ADR-0009 §2.5). */
        ShredAntrag: {
            /**
             * Format: uuid
             * @description Antrags-ID.
             */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            status: components["schemas"]["ShredAntragStatus"];
            /**
             * @description Whitelisted Löschgrund aus dem ursprünglichen Antrag (kein Freitext, Linie 2).
             * @enum {string}
             */
            grund: "betroffenenantrag_art17" | "aufbewahrung_abgelaufen" | "sonstige_rechtsgrundlage";
            /** @description Opaker Principal (kein FK). personenbeziehbar=true; pii=false; Vier-Augen-Workflow, analog audit.retention_freigabe.antragsteller (ADR-0009 §2.1/§2.6). */
            beantragtVonSub: string;
            /** Format: date-time */
            beantragtAm: string;
            /** @description Opaker Principal, gesetzt bei Freigabe/Ablehnung. Muss != beantragtVonSub sein (Vier-Augen, App-ABAC + DB-CHECK Integritäts-Guard, ADR-0009 §2.1/§2.7). */
            freigeberSub?: string | null;
            /** Format: date-time */
            entschiedenAm?: string | null;
            /** @description Whitelisted Ablehnungsgrund; NULL solange nicht abgelehnt. */
            ablehnungsgrund?: components["schemas"]["ShredAblehnungsgrund"] | null;
            /**
             * Format: date-time
             * @description Verfallsfenster (beantragtAm + Frist, ADR-0009 §2.1/§5/§8).
             */
            gueltigBis: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ShredAntragListe: {
            daten: components["schemas"]["ShredAntrag"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /** @description Eigenständiges Type-to-confirm der ZWEITEN Person (ADR-0009 §2.4) — bewusst getrennt von der Antragsentscheidung, kein `grund` (der steht bereits im ursprünglichen Antrag). */
        ShredFreigebenAnweisung: {
            /**
             * @description Muss exakt `ENDGUELTIG_LOESCHEN` sein (Fehlbedienungsschutz).
             * @enum {string}
             */
            bestaetigung: "ENDGUELTIG_LOESCHEN";
        };
        ShredAblehnenAnweisung: {
            ablehnungsgrund: components["schemas"]["ShredAblehnungsgrund"];
        };
        /** @description Antwort der `freigeben`-Route — aktualisierter Antrag + Shredding-Ergebnis (ADR-0009 §2.4). */
        ShredFreigebenErgebnis: {
            antrag: components["schemas"]["ShredAntrag"];
            shredding: components["schemas"]["ShreddingErgebnis"];
        };
        SystemListItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            bezeichnung: string;
            status: components["schemas"]["BetriebsStatus"];
            /** Format: date-time */
            createdAt: string;
        };
        SystemListe: {
            daten: components["schemas"]["SystemListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        SystemDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            bezeichnung: string;
            /** @description Strukturelle/operative Grenze (TB-01 dokumentiert im Messkonzept). */
            systemgrenze: string;
            systembeschreibung?: string | null;
            /**
             * Format: uuid
             * @description Standort (Liegenschaft/Gebäude) dieser Berechnungseinheit (V0074). Der Einsparungsnachweis definiert ein System als „1 Energieträger an 1 Standort eines Endkunden" und führt den Standort je System im Systemregister.
             *     NICHT dasselbe wie die Zähler-Verortung (`POST /stammdaten/zaehler/{id}/verortung`): die ist feiner (Raum/Etage) und temporal und sagt, wo ein GERÄT hängt. `null` = nicht erfasst; der Nachweis weist das aus, statt es zu erfinden. Der Standort muss DEMSELBEN Endkunden gehören (**400**).
             */
            standortId: string | null;
            status: components["schemas"]["BetriebsStatus"];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        SystemAnlegen: {
            /** Format: uuid */
            endkundeId: string;
            bezeichnung: string;
            systemgrenze: string;
            systembeschreibung?: string;
            /**
             * Format: uuid
             * @description Optional; muss demselben Endkunden gehören (**400**). S. `SystemDetail.standortId`.
             */
            standortId?: string;
        };
        SystemAendern: {
            bezeichnung?: string;
            systemgrenze?: string;
            systembeschreibung?: string;
            /**
             * Format: uuid
             * @description Nachträglich setzbar oder korrigierbar; muss demselben Endkunden gehören (**400**).
             */
            standortId?: string;
        };
        ZaehlerListItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            systemId: string;
            /** @description Name des Systems, an dem der Zaehler haengt. Ohne ihn steht in der Liste nur eine Kennung, die erst nachgeschlagen werden muss. Kein Personenbezug — dieselbe Angabe fuehrt bereits die Systemliste. */
            systemBezeichnung: string;
            energietraeger: components["schemas"]["Energietraeger"];
            status: components["schemas"]["BetriebsStatus"];
            /** Format: date-time */
            createdAt: string;
            /** @description Ob dem Zaehler derzeit ein Geraet aktiv zugeordnet ist. Sagt DASS, nicht welches — DevEUI und Blind-Index verlassen den Ingest-Pfad nicht (ADR-0005 §26.6). */
            angebunden: boolean;
            /**
             * Format: date-time
             * @description Juengster Empfangszeitpunkt ueber alle Kanaele des Zaehlers; `null` = noch nie etwas empfangen. Betriebs-Metadatum, KEIN Messwert (dieselbe Zusage wie `MesskanalFreshnessItem`).
             */
            letzteUebertragung: string | null;
        };
        ZaehlerListe: {
            daten: components["schemas"]["ZaehlerListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        ZaehlerDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            systemId: string;
            /** @description Messgeräte-Wahl (TB-01). */
            geraetetyp: string;
            energietraeger: components["schemas"]["Energietraeger"];
            status: components["schemas"]["BetriebsStatus"];
            /** @description Aktuell aktive Geraete-Zuordnung dieses Zaehlers, `null` wenn keine besteht (ADR-0011 D7). Bewusst ein FELD statt einer eigenen Lese-Route: `read:geraet_zuordnung` ist break-glass-gehaertet (Rolle `geraete-support`, Zweck-Whitelist, Ticket, Quota, ADR-0005 §26.4 SEC-5) und waere fuer einen Statusblick der falsche Schluessel. Hier greift die ohnehin geltende `read:stammdaten`. Enthaelt KEINE DevEUI und keinen Blind-Index (RL-2) — nur den Lebenszyklus-Zustand. Historie wird NICHT ausgegeben: beendete und geschredderte Zuordnungen erscheinen als `null`. */
            geraetAnbindung: components["schemas"]["GeraetAnbindung"] | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description Ausschnitt aus `GeraetZuordnungDetail` fuer die Anzeige am Zaehler (ADR-0011 D7). `zaehlerId` fehlt bewusst — sie ist der Zaehler, an dem dieses Objekt haengt. Wie `GeraetZuordnungDetail` OHNE DevEUI/ Blind-Index (O4 Design-Prinzip 1). */
        GeraetAnbindung: {
            /** Format: uuid */
            id: string;
            status: components["schemas"]["GeraetZuordnungStatus"];
            /** Format: date-time */
            gueltigVon: string;
            /**
             * Format: date-time
             * @description null = aktuell aktiv.
             */
            gueltigBis: string | null;
            pepperVersion: number;
        };
        ZaehlerAnlegen: {
            /** Format: uuid */
            systemId: string;
            geraetetyp: string;
            energietraeger: components["schemas"]["Energietraeger"];
        };
        ZaehlerAendern: {
            geraetetyp?: string;
        };
        /**
         * @description Energierichtung des Messpunkts (V0074). Der Einsparungsnachweis rechnet `Ist-Verbrauch = Σ bezug + eigenerzeugung − einspeisung` ([Q3] Kap. 9) und verlangt, dass selbst erzeugte Energie GETRENNT vom Netzbezug ausgewiesen wird — selbsterzeugter Strom ist keine Einsparung.
         *     Default `bezug`. Bei Bestandskanälen ist das eine ANNAHME aus der Migration, keine Messung: Ein fälschlich als `bezug` geführter Einspeisekanal erhöht den ausgewiesenen Verbrauch und senkt die Einsparung. Vor dem ersten Verwendungsnachweis je Kanal zu bestätigen.
         * @enum {string}
         */
        Messrichtung: "bezug" | "eigenerzeugung" | "einspeisung";
        MesskanalListItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            zaehlerId: string;
            /** @description z. B. wirkarbeit, thermische_energie, volumen, temperatur. */
            messgroesse: string;
            /** @description z. B. kWh, m3, degC. */
            einheit: string;
            art: components["schemas"]["MessgroesseArt"];
            status: components["schemas"]["BetriebsStatus"];
            /** @description Nur Strom */
            obisKennzahl?: string | null;
            /** @description `true` = Untermessung (V0058); von der Einsparberechnung ausgelassen. */
            istUntermessung: boolean;
            richtung: components["schemas"]["Messrichtung"];
            /** Format: date-time */
            createdAt: string;
        };
        MesskanalListe: {
            daten: components["schemas"]["MesskanalListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        MesskanalDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            zaehlerId: string;
            messgroesse: string;
            einheit: string;
            art: components["schemas"]["MessgroesseArt"];
            status: components["schemas"]["BetriebsStatus"];
            obisKennzahl?: string | null;
            /** @description `true` = dieser Kanal misst eine TEILMENGE dessen, was ein anderer Kanal desselben Systems bereits erfasst (Untermessung, V0058). Die Einsparberechnung laesst solche Kanaele aus — ohne die Angabe zaehlt sie denselben Verbrauch mehrfach und weist eine falsche Einsparung aus. Die Zuordnungsquote (TB-05) nimmt sie in den ZAEHLER, aber nicht in den NENNER. */
            istUntermessung: boolean;
            richtung: components["schemas"]["Messrichtung"];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        MesskanalAnlegen: {
            messgroesse: string;
            einheit: string;
            art: components["schemas"]["MessgroesseArt"];
            /** @description Nur bei Strom setzen. */
            obisKennzahl?: string;
            /**
             * @description `true` = dieser Kanal misst eine TEILMENGE dessen, was ein anderer Kanal desselben Systems bereits erfasst (Untermessung, V0058). Die Einsparberechnung laesst solche Kanaele aus — ohne die Angabe zaehlt sie denselben Verbrauch mehrfach und weist eine falsche Einsparung aus. Die Zuordnungsquote (TB-05) nimmt sie in den ZAEHLER, aber nicht in den NENNER.
             * @default false
             */
            istUntermessung: boolean;
            /**
             * @description Weglassen setzt `bezug` — der Verbrauchszähler ist der Regelfall. Ein still auf `einspeisung` gesetzter Kanal würde vom Ist-Verbrauch ABGEZOGEN und die Einsparung rechnerisch erhöhen; das darf nie unbemerkt passieren.
             * @default bezug
             */
            richtung: components["schemas"]["Messrichtung"];
        };
        MesskanalAendern: {
            einheit?: string;
            obisKennzahl?: string;
            /** @description Korrigierbar, weil eine Messstelle falsch erfasst worden sein kann. Wirkt auf KUENFTIGE Berechnungslaeufe; bereits gerechnete bleiben unveraendert (append-only). */
            istUntermessung?: boolean;
            /** @description Korrigierbar aus demselben Grund — und weil der Default `bezug` für Bestandskanäle eine Annahme der Migration ist, keine Messung. */
            richtung?: components["schemas"]["Messrichtung"];
        };
        /**
         * @description aktiv=aktuell gueltig (hoechstens eine je Zaehler, D-EXCL); inaktiv=deaktiviert/abgeloest (Geraete-Tausch); geschreddert=Art.-17- Krypto-Shredding (irreversibel, ADR-0005 §26.5).
         * @enum {string}
         */
        GeraetZuordnungStatus: "aktiv" | "inaktiv" | "geschreddert";
        /** @description `zaehlerId` kommt aus dem Pfad (analog MesskanalAnlegen), NICHT Teil des Bodys. */
        GeraetZuordnungAnlegen: {
            /** @description IEEE EUI-64, 16 Hex-Zeichen, optional je Byte-Paar getrennt durch ':' oder '-'. Wird NIE gespeichert oder geloggt (O4 Design-Prinzip 1) — nur feldverschlüsselt (deveui_enc) + als deterministischer Blind-Index abgelegt. */
            devEui: string;
        };
        GeraetZuordnungAendern: {
            /**
             * @description v1 minimal — Deaktivierung (Geraete-Tausch = deaktivieren + separate Neu-Provisionierung, ADR-0005 §26.4).
             * @enum {string}
             */
            aktion: "deaktivieren";
        };
        /** @description KEIN devEui-/Blind-Index-Feld (O4 Design-Prinzip 1, ADR-0005 §11/§26.2) — die Klartext-DevEUI wird nach der Provisionierung NIE erneut über dieses Schema exponiert; Reverse-Auflösung ist der eigenständige, break-glass-gehärtete Endpunkt `POST .../reverse-aufloesung` (`read:geraet_zuordnung`, ADR-0005 §26.4 SEC-5, `GeraetReverseAufloesungErgebnis`). */
        GeraetZuordnungDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            zaehlerId: string;
            status: components["schemas"]["GeraetZuordnungStatus"];
            /** @description Blind-Index-Pepper-Rotationsversion (ADR-0005 §26.3). */
            pepperVersion: number;
            /** Format: date-time */
            gueltigVon: string;
            /**
             * Format: date-time
             * @description null = aktuell aktiv.
             */
            gueltigBis?: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description ADR-0005 §26.4 SEC-5 — strukturierte Begründungs-/Ticket-Pflicht, kein Freitext-Zweck-Code (rote Linie 2). Eigene Zweck-Whitelist, UNABHÄNGIG von der `read:verbrauch_detail`-Whitelist. */
        GeraetReverseAufloesungAnfrage: {
            /**
             * @description PROVISORISCHE Whitelist (final `security-lead`/ `access-control-engineer`/`compliance-director`).
             * @enum {string}
             */
            zweck: "geraete_stoerungsdiagnose";
            /** @description Strukturierter Vorgangs-Verweis (z. B. `HD-1234`), KEIN Freitext. Format PROVISORISCH (final `security-lead`/ `access-control-engineer`). */
            ticketRef: string;
        };
        /** @description Das EINZIGE Response-Schema im gesamten Contract mit Klartext- `devEui` (ADR-0005 §26.4 SEC-5, RL-2) — verlässt das System AUSSCHLIESSLICH über diesen einen, break-glass-gehärteten Endpunkt. */
        GeraetReverseAufloesungErgebnis: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            zaehlerId: string;
            /** @description Klartext-DevEUI (IEEE EUI-64), NIEMALS geloggt/gecacht. */
            devEui: string;
        };
        /** @description Energieträger + Baseline-Slot (TB-01/TB-02) je Träger einer Version. */
        EnergietraegerBaseline: {
            energietraeger: components["schemas"]["Energietraeger"];
            baselineWert?: number | null;
            baselineEinheit?: string | null;
            baselineMethode?: string | null;
            /** @description Pflicht wenn < 3 Jahresabrechnungen (TB-02). Seit V0065 wird das per DB-CHECK erzwungen, sobald `baselineAbrechnungenAnzahl` gesetzt ist — vorher stand die Pflicht nur als Schema-Kommentar, weil die Anzahl nirgends erfasst war. */
            baselineBegruendung?: string | null;
            /**
             * Format: uuid
             * @description RESERVIERT und unbenutzt — Slot für die spätere Beleg-Ablage (Beleg-ADR). Der externe Verweis läuft über `baselineBelegAktenzeichen`/`baselineBelegAblageort`.
             */
            baselineBelegRef?: string | null;
            /** @description TB-02 ([Q3] Kap. 2.1.2): Zahl der Jahresabrechnungen, aus denen die Baseline gemittelt wurde. Bei einem Wert < 3 verlangt der Server eine `baselineBegruendung` (409/DB-CHECK). */
            baselineAbrechnungenAnzahl?: number | null;
            /** @description Kennung, unter der die Jahresabrechnungen AUSSERHALB des Systems geführt werden (ADR-0006 O4). Die Dokumente selbst liegen bewusst nicht im System: sie sind voller Personendaten, und eine Dokumentenablage wäre ein neues Drittsystem mit eigenem ADR- und Security-Review. Verlässt das System nicht (kein BAFA-Export, kein Kundendokument). */
            baselineBelegAktenzeichen?: string | null;
            /** @description Wo die Abrechnungen liegen (Aktenordner, DMS, Laufwerk). Getrennt vom Aktenzeichen, weil ein Umzug der Ablage das Aktenzeichen nicht ändert. Verlässt das System nicht. */
            baselineBelegAblageort?: string | null;
            /**
             * @description ADR-0007 B13.4/B14/O-B3b (Auflage O-B3b) — explizites, vom Betriebs-Team gesetztes Kennzeichen: für dieses (Endkunde, Energieträger)-Paar liegt ein Energieträger-Wechsel (Substitution, z. B. Öl → Wärmepumpe) vor. NICHT automatisch erkannt. Ein gesetztes Kennzeichen führt im Einspar-Lauf zu status=ausgeschlossen MIT Ausweis (DE-02), NICHT zu einer abweichenden Berechnung (Merkblatt Technik v2.2 Kap. 3 verlangt in jedem Substitutionsfall das alternative/Standardmesskonzept).
             * @default false
             */
            energietraegerSubstitution: boolean;
        };
        MesskonzeptVersionListItem: {
            versionNr: number;
            typ: components["schemas"]["MesskonzeptTyp"];
            /** Format: date-time */
            gueltigVon: string;
            /**
             * Format: date-time
             * @description null = aktuelle Version.
             */
            gueltigBis?: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        MesskonzeptVersionListe: {
            daten: components["schemas"]["MesskonzeptVersionListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /**
         * @description Wie `EnergietraegerBaseline`, aber MIT der Kennung des Eintrags — das Antwort-Gegenstück.
         *     Die beiden sind bewusst getrennt: Beim ANLEGEN gibt es die Kennung noch nicht, und ein gemeinsames Schema mit `additionalProperties: false` würde sie im Request stillschweigend zulassen, obwohl das DTO sie abweist. `mvetId` ist zugleich der Schlüssel, den `BerechnungslaufAnlegen.mvetId` erwartet und über den die Systemgrenze adressiert wird.
         */
        EnergietraegerBaselineDetail: {
            /** Format: uuid */
            mvetId: string;
            energietraeger: components["schemas"]["Energietraeger"];
            baselineWert?: number | null;
            baselineEinheit?: string | null;
            baselineMethode?: string | null;
            baselineBegruendung?: string | null;
            /** Format: uuid */
            baselineBelegRef?: string | null;
            baselineAbrechnungenAnzahl?: number | null;
            baselineBelegAktenzeichen?: string | null;
            baselineBelegAblageort?: string | null;
            energietraegerSubstitution: boolean;
        };
        SystemgrenzeSystem: {
            /** Format: uuid */
            systemId: string;
            bezeichnung: string;
        };
        Systemgrenze: {
            /** Format: uuid */
            mvetId: string;
            energietraeger: components["schemas"]["Energietraeger"];
            /** @description Die Systeme IN der Grenze. */
            systeme: components["schemas"]["SystemgrenzeSystem"][];
            /** @description Alle aktiven Systeme des Endkunden — die Auswahl, aus der die Grenze gebildet wird. */
            waehlbar: components["schemas"]["SystemgrenzeSystem"][];
            /** @description `true`, solange nichts zugeordnet ist. Der Berechnungslauf nimmt dann alle aktiven Zähler des Endkunden. */
            greiftFallback: boolean;
        };
        SystemgrenzeSetzen: {
            /** @description Die Systeme, die die Grenze künftig umfasst. Leer = zurück zum Fallback. */
            systemIds: string[];
        };
        /**
         * @description Geschlossene Liste, obwohl `baselineEinheit` an der mvet selbst Freitext ist. Weiter als das, was der Rechenweg verträgt (er weist alles außer `kWh` mit `BASELINE_EINHEIT_UNGUELTIG` ab) — die Menge einer Periode geht in KEINE Rechnung ein, sie belegt die Abrechnung. Eine Gasrechnung weist m³ aus.
         * @enum {string}
         */
        BaselineEinheit: "kWh" | "MWh" | "GJ" | "m³" | "l" | "kg" | "t";
        BaselinePeriode: {
            /** Format: uuid */
            id: string;
            /**
             * Format: date
             * @description Erster Tag des Abrechnungszeitraums (einschließlich).
             */
            von: string;
            /**
             * Format: date
             * @description Erster Tag NACH dem Abrechnungszeitraum (AUSSCHLIESSLICH).
             */
            bis: string;
            /** @description Kalendertage */
            tage: number;
            /**
             * Format: date
             * @description Der letzte Tag, der noch DAZUGEHÖRT (`bis` minus ein Tag). Steht mit in der Antwort, weil `bis` ausschließlich ist und genau dieser Unterschied sich sonst erst in der Einsparzahl zeigt.
             */
            letzterTag: string;
            /** @description `true`, wenn die Länge um mehr als 40 Tage von einem Jahr abweicht. GTZ_base ist der ARITHMETISCHE Mittelwert der Gradtagzahl-Summen — nicht der auf ein Jahr normierte. Eine Halbjahres-Periode schleppt deshalb eine halbe Jahressumme in den Mittelwert und zieht ihn nach unten; der Rechenweg gleicht das NICHT aus. */
            laengeAuffaellig: boolean;
            /** @description Die abgerechnete Menge (Beleg */
            menge: number | null;
            einheit: components["schemas"]["BaselineEinheit"] | null;
        };
        BaselinePerioden: {
            /** Format: uuid */
            mvetId: string;
            energietraeger: components["schemas"]["Energietraeger"];
            perioden: components["schemas"]["BaselinePeriode"][];
            /** @description Die Baseline */
            baselineWert: number | null;
            baselineEinheit: string | null;
            /** @description TB-02 (V0065): die an der mvet DEKLARIERTE Zahl der Jahresabrechnungen. */
            abrechnungenAnzahlDeklariert: number | null;
            /** @description `true`, wenn die deklarierte Zahl nicht zur Zahl der erfassten Perioden passt. Beides beschreibt dieselben Abrechnungen — weichen sie ab, ist eine der beiden Angaben falsch. */
            anzahlWeichtAb: boolean;
            /** @description `true`, sobald mindestens eine Periode erfasst ist. Sonst weist der Berechnungslauf mit `GTZ_BASE_NICHT_ERMITTELBAR` ab (außer bei `gtzBaseOverride` oder Grundlastanteil 1). */
            gtzBaseErmittelbar: boolean;
            /** @description Mittelwert der erfassten Mengen — NUR, wenn alle Perioden eine Menge in derselben Einheit wie die Baseline tragen, sonst `null`. TB-02 verlangt diesen Mittelwert als Baseline: Steht hier eine andere Zahl als in `baselineWert`, stimmt eines von beiden nicht. */
            mengeMittel: number | null;
        };
        BaselinePeriodeSetzen: {
            /** Format: date */
            von: string;
            /**
             * Format: date
             * @description AUSSCHLIESSLICH — erster Tag NACH dem Zeitraum.
             */
            bis: string;
            menge?: number;
            einheit?: components["schemas"]["BaselineEinheit"];
        };
        BaselinePeriodenSetzen: {
            /** @description Die Bezugszeiträume, die künftig gelten. Leer = keine erfasst; GTZ_base ist dann nicht herleitbar. TB-02 erwartet drei Jahresabrechnungen. */
            perioden: components["schemas"]["BaselinePeriodeSetzen"][];
        };
        /** @description Alle 7 TB-01-Pflichtinhalte (5 versionsweit + Energieträger/Baseline-Liste). */
        MesskonzeptVersionDetail: {
            versionNr: number;
            typ: components["schemas"]["MesskonzeptTyp"];
            /** @description TB-01 (2). */
            systemgrenze: string;
            /** @description TB-01 (3). */
            systembeschreibung: string;
            /** @description TB-01 (5). */
            bereinigungsverfahren: string;
            /** @description TB-01 (6). */
            messgeraeteWahl: string;
            /** @description TB-01 (7). */
            geraeteerkennungsVerfahren: string;
            aenderungsgrund?: string | null;
            /** @description Slot Anzeige-Workflow (späterer ADR). */
            anzeigeStatus?: string | null;
            /** Format: date-time */
            gueltigVon: string;
            /** Format: date-time */
            gueltigBis?: string | null;
            /** @description TB-01 (1) Energieträger + (4) Baseline je Träger. */
            energietraeger: components["schemas"]["EnergietraegerBaselineDetail"][];
            /** Format: date-time */
            createdAt: string;
        };
        /** @description Neue (append-only) Version. version_nr, gueltig_von und der Abschluss der Vorgänger-Version setzt der Server. Editieren bestehender Versionen ist nicht möglich (Linie 3). */
        MesskonzeptVersionAnlegen: {
            typ: components["schemas"]["MesskonzeptTyp"];
            systemgrenze: string;
            systembeschreibung: string;
            bereinigungsverfahren: string;
            messgeraeteWahl: string;
            geraeteerkennungsVerfahren: string;
            /** @description TB-01: Änderungen darlegen. */
            aenderungsgrund?: string;
            energietraeger: components["schemas"]["EnergietraegerBaseline"][];
        };
        /** @description Listen-Projektion — PII-FREI (Linie 2). */
        AnschlussnutzerListItem: {
            /**
             * Format: uuid
             * @description Pseudonym-Surrogat des Datensubjekts.
             */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            verarbeitungsStatus: components["schemas"]["VerarbeitungsStatus"];
            /** Format: date-time */
            createdAt: string;
        };
        AnschlussnutzerListe: {
            daten: components["schemas"]["AnschlussnutzerListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /** @description Direkt-PII Datensubjekt (DS-07, identity.anschlussnutzer_pii). pii=true. */
        AnschlussnutzerPii: {
            /** @description pii=true; grundlage=Art.6(1)(f)/(a) DS-07; ADR-0004 Anhang B P5. */
            name: string;
            /** @description pii=true; grundlage=Art.6(1)(a); ADR-0004 Anhang B P6. */
            kontakt?: string | null;
        };
        AnschlussnutzerDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            verarbeitungsStatus: components["schemas"]["VerarbeitungsStatus"];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @description Art.-18-Grund; `null`, solange der Anschlussnutzer nicht gesperrt ist (`ck_anschlussnutzer_einschraenkung_kohaerenz`, V0024). Dieselben Grenzen wie bei `EndkundeDetail`: sichtbar fuer `betrieb` und `compliance-auditor`, NICHT ueber die PII-Projektion gefuehrt, NICHT im Listen-Item, kein Filter/Sort. Nach aussen verlaesst nur der neutrale Sammelcode `datenschutzrechtliche_einschraenkung` das System (ADR-0007 C4 Punkt 6). */
            einschraenkungGrundCode?: components["schemas"]["EinschraenkungGrund"] | null;
            /**
             * Format: date-time
             * @description Zeitpunkt der Einschraenkung (UTC, serverseitig gesetzt, A11.3). Grundlage der Fristenueberwachung fuer Art. 18 Abs. 1 lit. a/d.
             */
            gesperrtSeit?: string | null;
            /** @description Auflage C-8 — die am Sperrvorgang festgehaltene Entscheidung ueber die WEITERE ERHEBUNG. `null` heisst „Frage stellt sich nicht" (lit. a/lit. c) oder „keine Einschraenkung"; NICHT „entschieden, nicht weiterzuerheben". Wird beim Aufheben der Einschraenkung zusammen mit Grund und Zeitpunkt genullt — sie gehoert zu GENAU DIESER Einschraenkung. Sichtbarkeit wie `einschraenkungGrundCode`: wer den Grund sehen darf, muss auch sehen, was daraus fuer die Messung folgt. */
            neuerhebungFortsetzen?: boolean | null;
            /** @description PII-Block; NULL bei fehlender Berechtigung (DS-07-Innensicht, D6). */
            stammdatenPii?: components["schemas"]["AnschlussnutzerPii"] | null;
        };
        AnschlussnutzerAnlegen: {
            /** Format: uuid */
            endkundeId: string;
            stammdatenPii: components["schemas"]["AnschlussnutzerPii"];
        };
        NutzungsverhaeltnisListItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            anschlussnutzerId: string;
            /** Format: uuid */
            systemId: string;
            datenklasse: components["schemas"]["Datenklasse"];
            rolle: components["schemas"]["NutzungsRolle"];
            /** Format: date-time */
            gueltigVon: string;
            /**
             * Format: date-time
             * @description null = aktuell.
             */
            gueltigBis?: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        NutzungsverhaeltnisListe: {
            daten: components["schemas"]["NutzungsverhaeltnisListItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        NutzungsverhaeltnisDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            anschlussnutzerId: string;
            /** Format: uuid */
            systemId: string;
            datenklasse: components["schemas"]["Datenklasse"];
            rolle: components["schemas"]["NutzungsRolle"];
            /** Format: date-time */
            gueltigVon: string;
            /** Format: date-time */
            gueltigBis?: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        NutzungsverhaeltnisAnlegen: {
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            anschlussnutzerId: string;
            /** Format: uuid */
            systemId: string;
            /** @default abrechnungsminimum */
            datenklasse: components["schemas"]["Datenklasse"];
            rolle: components["schemas"]["NutzungsRolle"];
            /** Format: date-time */
            gueltigVon: string;
        };
        NutzungsverhaeltnisBeenden: {
            /**
             * Format: date-time
             * @description Endzeitpunkt (UTC); muss >= gueltigVon liegen.
             */
            gueltigBis: string;
        };
        /** @description Lücken-Metadaten je Entität — KEINE PII, KEIN Verbrauchsinhalt. */
        VollstaendigkeitItem: {
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            systemId?: string | null;
            /** Format: uuid */
            zaehlerId?: string | null;
            /**
             * @description Aggregationsebene des Eintrags.
             * @enum {string}
             */
            ebene: "endkunde" | "system" | "zaehler";
            /** @description Menge der fehlenden Stammdaten (leer = vollständig). */
            luecken: components["schemas"]["LueckenTyp"][];
            /** Format: date-time */
            geprueftAm: string;
        };
        VollstaendigkeitListe: {
            daten: components["schemas"]["VollstaendigkeitItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /**
         * @description Additiv erweiterbare Typ-Whitelist (D1). Wurzelknoten (kein `parentId`) müssen `liegenschaft` oder `gebaeude` sein (D2.4).
         * @enum {string}
         */
        StandortTyp: "liegenschaft" | "gebaeude" | "bauteil" | "etage" | "einheit" | "raum";
        /**
         * @description Zustandswechsel, KEIN Hard-Delete (D2.6) — Ausnahme s. `delete:standort`.
         * @enum {string}
         */
        StandortStatus: "aktiv" | "stillgelegt";
        /**
         * @description Whitelisted Grund (kein Freitext, Linie 2). PROVISORISCHE v1-Liste (ADR-0010 §5 nennt keine konkreten Werte) — finale Bestätigung nach Review `access-control-engineer`/`compliance-director`.
         * @enum {string}
         */
        StandortStilllegenGrund: "fehlanlage_korrektur" | "gebaeude_ausser_betrieb" | "nutzung_beendet" | "sonstige";
        /** @description `read:standort`-Lesestufe — PII-FREI (RL-1/D5). NIEMALS `bezeichnung`/`anschrift`/`geo`. Einheitliche Projektion für die Baum-Liste UND jede strukturelle Mutation (anlegen/ändern/ verschieben/stilllegen) — bewusste Design-Entscheidung: auch die Create-Antwort trägt kein Klartext-Label zurück (D5-Trennung, kein literales ADR-Zitat). */
        StandortStruktur: {
            /**
             * Format: uuid
             * @description Pseudonym-Surrogat (energy.standort.id).
             */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            parentId: string | null;
            typ: components["schemas"]["StandortTyp"];
            /** @description Materialisierter Pfad (D6) — Vorfahrenkette INKLUSIVE eigener `id`. */
            pfad: string[];
            ebene: number;
            /** @description Geschwisterreihenfolge (D1 */
            sortierung: number;
            status: components["schemas"]["StandortStatus"];
            /** @description Klimastation dieses Standorts (ADR-0010), `null` = keine hinterlegt. Steht in der Antwort, damit ein Änderungsformular den aktuellen Wert vorbelegen kann — ohne das löschte eine Änderung an `typ` oder `sortierung` die Station beiläufig mit. */
            klimareferenz: string | null;
            /** @description STRUKTURELL berechnet (D4-Adressfähigkeit: Wurzelknoten oder `gebaeude`) — NICHT ob tatsächlich eine Adresse hinterlegt ist (ein echter Presence-Check wäre ein `identity`-Zugriff, den diese Lesestufe ausdrücklich ausschließt). */
            hatAdresse: boolean;
            /** @description Anzahl aktuell (gueltig_bis IS NULL) verorteter Zähler. */
            zaehlerAnzahl: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        StandortAnlegen: {
            typ: components["schemas"]["StandortTyp"];
            /** Format: uuid */
            parentId?: string;
            /** @default 0 */
            sortierung: number;
            /**
             * @description Klimastation dieses Standorts (ADR-0010), z. B. `DWD-04094`. Sie gehört fachlich zum OBJEKT, nicht zum einzelnen Rechenlauf.
             *     Der Berechnungslauf löst sie NICHT zur Laufzeit auf (ADR-0006 D4: eingefrorene `stationRef` je Lauf) — der Parametervorschlag bietet sie an, und der Bediener übernimmt sie bewusst.
             *     Zeichen-Whitelist wie bei `stationRef`: Der DWD-Adapter setzt die Kennung in Pfade auf `opendata.dwd.de` ein.
             */
            klimareferenz?: string;
            /** @description pii=true; grundlage=Art.6(1)(b); wird feldverschlüsselt (identity.standort_pii.bezeichnung_enc, D4). */
            bezeichnung: string;
            /** @description pii=true; grundlage=Art.6(1)(b); Pflicht auf Wurzelknoten, optional auf gebaeude, sonst unzulässig (D4). */
            adresse?: string;
        };
        /** @description Struktur NUR — NICHT status (eigene Aktion stilllegen) und NICHT Label/Adresse (eigene Route .../pii). */
        StandortAendern: {
            typ?: components["schemas"]["StandortTyp"];
            sortierung?: number;
            /**
             * @description Klimastation dieses Standorts (ADR-0010), z. B. `DWD-04094`. Sie gehört fachlich zum OBJEKT, nicht zum einzelnen Rechenlauf.
             *     Der Berechnungslauf löst sie NICHT zur Laufzeit auf (ADR-0006 D4: eingefrorene `stationRef` je Lauf) — der Parametervorschlag bietet sie an, und der Bediener übernimmt sie bewusst.
             *     Zeichen-Whitelist wie bei `stationRef`: Der DWD-Adapter setzt die Kennung in Pfade auf `opendata.dwd.de` ein.
             */
            klimareferenz?: string;
        };
        /** @description Vollersatz (kein Feld-Teil-Update) — ein weggelassenes `adresse` löscht die hinterlegte Adresse. */
        StandortPiiAendern: {
            /** @description pii=true; grundlage=Art.6(1)(b). */
            bezeichnung: string;
            /** @description pii=true; grundlage=Art.6(1)(b). */
            adresse?: string;
            /** @description pii=true; grundlage=Art.6(1)(b); NIEMALS nach energy gespiegelt (RL-1/RL-3). */
            geo?: string;
        };
        /** @description Echo des soeben geschriebenen Labels (`PUT .../pii`) — pii=true. */
        StandortPiiDetail: {
            /** Format: uuid */
            id: string;
            bezeichnung: string;
            anschrift: string | null;
            geo: string | null;
        };
        StandortLabelsAnfrage: {
            standortIds: string[];
        };
        /** @description `read:standort_pii`-Lesestufe — pii=true. */
        StandortLabelItem: {
            /** Format: uuid */
            id: string;
            bezeichnung: string;
            anschrift: string | null;
        };
        StandortVerschieben: {
            /**
             * Format: uuid
             * @description `null` = an die Wurzel verschieben (nur zulässig für typ liegenschaft/gebaeude, D2.4).
             */
            neuerParentId: string | null;
        };
        StandortVerschobenErgebnis: {
            standort: components["schemas"]["StandortStruktur"];
            /**
             * Format: uuid
             * @description Parent VOR dem Verschieben.
             */
            parentIdAlt: string | null;
            /** @description Anzahl der vom rekursiven Nachfahren-Pfad-Update mitaktualisierten Zeilen (D6, Reichweiten-Nachweis). */
            nachfahrenAktualisiert: number;
        };
        StandortStilllegen: {
            grund: components["schemas"]["StandortStilllegenGrund"];
        };
        StandortStillgelegtErgebnis: {
            standort: components["schemas"]["StandortStruktur"];
            statusAlt: components["schemas"]["StandortStatus"];
        };
        StandortLoeschErgebnis: {
            /** Format: uuid */
            id: string;
            geloescht: boolean;
            /** Format: uuid */
            endkundeId: string;
            typ: components["schemas"]["StandortTyp"];
            /**
             * Format: uuid
             * @description Letzter bekannter Parent vor der Löschung.
             */
            parentIdAlt: string | null;
        };
        ZaehlerVerortungAnlegen: {
            /** Format: uuid */
            standortId: string;
            /** Format: date-time */
            gueltigVon: string;
        };
        ZaehlerVerortungBeenden: {
            /** Format: date-time */
            gueltigBis: string;
        };
        ZaehlerStandortDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            zaehlerId: string;
            /** Format: uuid */
            standortId: string;
            /** Format: date-time */
            gueltigVon: string;
            /**
             * Format: date-time
             * @description NULL = aktuell (offene Zeitscheibe).
             */
            gueltigBis: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description 1:1-Projektion von energy.zaehler (PII-frei, kein geraeteReferenz, §12) — Ergebnis der Kern-Query (D6). */
        ZaehlerUnterKnotenItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            systemId: string;
            geraetetyp: string;
            energietraeger: components["schemas"]["Energietraeger"];
            status: components["schemas"]["BetriebsStatus"];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description EIN Knoten der Breadcrumb-Vorfahrenkette (`GET .../zaehler/{zaehlerId}/verortung`, D6) — PII-FREI (D5, `read:standort`-Lesestufe): NIEMALS `bezeichnung`/`anschrift`. */
        StandortPfadEintrag: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            parentId: string | null;
            typ: components["schemas"]["StandortTyp"];
            ebene: number;
            status: components["schemas"]["StandortStatus"];
        };
        /** @description `GET /stammdaten/zaehler/{zaehlerId}/verortung` — aktuelle Verortung (`gueltig_bis IS NULL`) inklusive Breadcrumb-Pfad (D6, Wurzel zuerst), PII-frei (D5). `verortet=false` ist der EMPTY-STATE (kein Standort ODER nur historische Verortungen) — KEIN Fehler. */
        ZaehlerStandortAktuellDetail: {
            /** Format: uuid */
            zaehlerId: string;
            verortet: boolean;
            /** Format: uuid */
            standortId: string | null;
            /** Format: date-time */
            verortetSeit: string | null;
            /** @description Vorfahrenkette INKLUSIVE des eigenen Standort-Knotens, WURZEL ZUERST. Leer, wenn `verortet=false`. */
            pfad: components["schemas"]["StandortPfadEintrag"][];
        };
        /**
         * @description `ingest.ausfall_vorgang.status`. Aktuell schreibt KEIN Job diese Tabelle (periodischer TB-04-Freshness-Check ist offener Punkt, ADR-0005 §31) — `ausfallStatus` ist daher in der Praxis überwiegend `null`; die Listen stützen sich auf die query-zeit-berechnete `ueberfaellig`-Ableitung aus `ingest.kanal_status.letzter_ts`.
         * @enum {string}
         */
        AusfallVorgangStatus: "offen" | "andauernd" | "behoben";
        /** @description TB-04 (ADR-0005 §27) — Kanal mit überfälliger Freshness oder dokumentiertem, nicht behobenem Ausfall. PII-frei (Pseudonym- Surrogate NUR). */
        AusfallListeItem: {
            /** Format: uuid */
            messkanalId: string;
            /** Format: uuid */
            zaehlerId: string;
            /** Format: date-time */
            letzteUebertragung: string;
            ueberfaellig: boolean;
            ausfallStatus: components["schemas"]["AusfallVorgangStatus"] | null;
            /** Format: date-time */
            ausfallSeit: string | null;
        };
        /** @description Vorlage fuer EINEN Messkanal. Die drei erstgenannten Felder sind zeichengenau so anzulegen; `beschreibung` ist reiner Anzeigetext. */
        ErwarteterMesskanal: {
            messgroesse: string;
            einheit: string;
            art: components["schemas"]["MessgroesseArt"];
            beschreibung: string;
        };
        GeraetetypKatalogItem: {
            /** @description In der Schreibweise des Decoders. Beim Anlegen eines Zaehlers wird der Gerätetyp ohne Ruecksicht auf Gross-/Kleinschreibung und Randleerzeichen zugeordnet. */
            geraetetyp: string;
            /** @description Version der Feldabbildung. */
            version: number;
            /** @description Kann leer sein — s. Pfad-Beschreibung. */
            erwarteteKanaele: components["schemas"]["ErwarteterMesskanal"][];
        };
        GeraetetypKatalog: {
            daten: components["schemas"]["GeraetetypKatalogItem"][];
        };
        /** @description Zustand EINES Netzservers, wie sein Worker ihn zuletzt gemeldet hat. Enthaelt KEINE Zugangsdaten (`brokerHost` ist auf Host[:Port] reduziert, DB-CHECK als Backstop, V0039). */
        IngestQuelle: {
            /** @description Kennung des Netzservers (`EDMS_INGEST_QUELLE_CODE`). */
            quelleCode: string;
            /** @description Host[:Port] — ohne Benutzer und Passwort. */
            brokerHost: string;
            /** @description Abonniertes Uplink-Topic. */
            topic: string;
            /** @description MQTT-Client-Id — macht doppelt vergebene Sitzungen sichtbar. */
            clientId: string;
            /** @description Selbstauskunft des Workers. ALLEIN nicht aussagekraeftig — s. `lebendig`. */
            verbunden: boolean;
            /** @description `verbunden` UND frischer Herzschlag. Die einzige Angabe, auf die man sich verlassen sollte. */
            lebendig: boolean;
            /**
             * Format: date-time
             * @description null = seit Prozessstart nie verbunden.
             */
            letzteVerbindungAt: string | null;
            /** Format: date-time */
            letzterHerzschlagAt: string;
            /** @description Ob es zu dieser Kennung eine gepflegte Quelle gibt (`ingest.quelle`, V0059). `false` = hier laeuft ein Worker, dessen Konfiguration aus Umgebungsvariablen kommt (zulaessig, Verhalten vor V0059) — in der Plattform steht dann nichts, woran sich jemand orientieren koennte. */
            gepflegt: boolean;
            /** @description Die gepflegte Quelle steht auf `inaktiv`, der Prozess laeuft aber noch. Kein Widerspruch, sondern der Normalfall direkt nach dem Deaktivieren: Ein laufender Worker liest nicht neu. Beim naechsten Start bleibt er stehen (fail-closed). */
            gepflegtInaktiv: boolean;
            /** @description Felder, in denen der LAUFENDE Prozess von der gepflegten Konfiguration abweicht (`brokerHost`, `topic`, `clientId`). Der Worker laedt seine Quelle nur beim Start; wird sie danach geaendert, faehrt er mit der alten weiter. Ohne diese Angabe zeigte die Oberflaeche die gepflegten Werte, waehrend er andere benutzt — also das Gegenteil dessen, wofuer man sie aufruft. */
            abweichendeFelder: string[];
        };
        /** @description Eine Herkunfts-Zuordnung (ADR-0011 B2/D3). AUSSCHLIESSLICH Kennungen, keine Namen — s. die Beschreibung von `GET /monitoring/ingest/herkunft`. */
        HerkunftMapping: {
            /** Format: uuid */
            id: string;
            /** @description Aus welchem Netz die Zuordnung stammt (ADR-0011 D8). */
            quelleCode: string;
            /** Format: uuid */
            chirpstackTenantId: string;
            /** Format: uuid */
            chirpstackApplicationId: string;
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            standortId: string;
            /**
             * @description `energy.standort.typ` — die einzige beschreibende Angabe, die ohne PII zu haben ist. Beantwortet die Plausibilitätsfrage „ist das überhaupt ein Gebäude?".
             * @enum {string}
             */
            standortTyp: "liegenschaft" | "gebaeude" | "bauteil" | "etage" | "einheit" | "raum";
            /** Format: date-time */
            createdAt: string;
        };
        HerkunftMappingAnlegen: {
            /** @description Ohne Angabe die Kennung dieses Deployments (`EDMS_INGEST_QUELLE_CODE`, Default `standard`). Bei genau einem Netzserver muss sie damit niemand tippen; ab dem zweiten ist sie die Angabe, die den Unterschied macht. */
            quelleCode?: string;
            /** Format: uuid */
            chirpstackTenantId: string;
            /** Format: uuid */
            chirpstackApplicationId: string;
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            standortId: string;
        };
        /**
         * @description Geschlossene Liste, gespiegelt aus `ck_quarantaene_grund` (V0011, erweitert um `herkunft_widerspruechlich` in V0042 und `skalensprung_verdacht` in V0049). Jeder Wert benennt die Stufe, an der ein Uplink liegen blieb.
         * @enum {string}
         */
        IngestQuarantaeneGrund: "envelope_parse_fehler" | "devEUI_unbekannt" | "unbekannter_geraetetyp" | "decode_fehler" | "kanal_unbekannt" | "unplausibel_monotonie_verletzt" | "einheit_inkonsistent" | "zeitstempel_fehlt" | "herkunft_widerspruechlich" | "skalensprung_verdacht";
        IngestQuarantaeneGrundAnzahl: {
            grund: components["schemas"]["IngestQuarantaeneGrund"];
            /** @description Anzahl als String (`bigint`-Herkunft). */
            anzahl: string;
        };
        /** @description Aus der Datenbank abgeleiteter Betriebszustand. */
        IngestStatus: {
            /** @description Leer = es lief noch nie ein Worker. */
            quellen: components["schemas"]["IngestQuelle"][];
            /**
             * Format: date-time
             * @description Juengster MESSZEITPUNKT ueber alle Kanaele (`MAX(ingest.kanal_status.letzter_ts)`). `null` = es wurde noch nie ein Messwert geschrieben.
             */
            letzterMesswertAt: string | null;
            /**
             * Format: date-time
             * @description Juengster SCHREIB-Zeitpunkt (`MAX(ingest.kanal_status.updated_at)`), ueber ALLE Quellen. Unterscheidet sich vom Messzeitpunkt bei Backfill. Bei mehreren Quellen sagt dieser Wert NICHT, ob eine einzelne ausgefallen ist — dafuer ist `quellen` da.
             */
            letzteSchreibungAt: string | null;
            /**
             * Format: date-time
             * @description Juengster liegengebliebener Uplink (`MAX(empfangen_at)`).
             */
            letzteQuarantaeneAt: string | null;
            /** @description Gesamtzahl als String (`bigint`-Herkunft). */
            quarantaeneGesamt: string;
            /** @description Nur Gruende mit Anzahl > 0, absteigend nach Anzahl. */
            quarantaeneJeGrund: components["schemas"]["IngestQuarantaeneGrundAnzahl"][];
            /**
             * @description Auflage C-6 — VERWORFENE Uplinks je Kalendertag und Grund, die letzten 14 Tage (`ingest.verwurf_tagesaggregat`, V0085).
             *     Der Gegenpart zur Quarantaene: Ein Uplink ohne Rechtsgrundlage wird verworfen und hinterlaesst BEWUSST keine Quarantaene-Zeile (A12-13) — ohne diese Zahlen haette die Betriebssicht eine Luecke genau dort, wo Daten verschwinden.
             *     SUBJEKTFREI: kein Zaehler, kein Geraet, keine Uhrzeit unterhalb des Tages. Ein Verwurfsprotokoll mit Subjektbezug waere selbst eine Verarbeitung genau der Daten, deren Grundlage gerade fehlt.
             */
            verwurfTage: components["schemas"]["IngestVerwurfTag"][];
            /** @description Summe ueber das 14-Tage-Fenster als String (`bigint`-Herkunft). `"0"` heisst „nichts verworfen" — und ist damit etwas anderes als eine fehlende Angabe, die offen liesse, ob niemand nachgesehen hat. */
            verwurfSumme: string;
        };
        /** @description Verworfene Uplinks EINES Kalendertages zu EINEM Grund (V0085). */
        IngestVerwurfTag: {
            /**
             * Format: date
             * @description Kalendertag (UTC). Bewusst grob — eine feinere Aufloesung waere in einer kleinen Anlage ein Zeitprofil.
             */
            tag: string;
            /**
             * @description Geschlossene Werteliste; Erweiterung nur per Migration.
             * @enum {string}
             */
            grund: "rechtsgrundlage_fehlt";
            /** @description Anzahl als String (`bigint`-Herkunft). */
            anzahl: string;
        };
        /**
         * @description `kein_tls` ist nur fuer den lokalen Dev-Broker vertretbar. Vor Real-Ingest ist mTLS vorgesehen (ADR-0005 §31 SA-3).
         * @enum {string}
         */
        TlsModus: "kein_tls" | "tls" | "mtls";
        /** @enum {string} */
        IngestQuelleGeheimnisFeld: "benutzername" | "passwort" | "ca_zertifikat" | "client_zertifikat" | "client_schluessel";
        /** @description Die gepflegte Konfiguration einer Datenquelle. Was hier FEHLT, fehlt mit Absicht: kein Benutzername, kein Passwort, kein Zertifikat und kein privater Schluessel — auch nicht gekuerzt, maskiert oder gehasht. `hinterlegteGeheimnisse` nennt stattdessen, welche Felder belegt sind. */
        IngestQuelleKonfig: {
            /** Format: uuid */
            id: string;
            /** @description Kennung, ueber die ein Worker seine Konfiguration laedt. Nicht aenderbar. */
            quelleCode: string;
            /** @description Klartext fuer Menschen. */
            bezeichnung: string;
            /** @description NUR Host[:Port] — niemals Zugangsdaten. */
            brokerHost: string;
            topic: string;
            clientId: string;
            tlsModus: components["schemas"]["TlsModus"];
            /** @enum {string} */
            status: "aktiv" | "inaktiv";
            notiz: string | null;
            /** @description Feldnamen der hinterlegten Geheimnisse — niemals deren Werte. */
            hinterlegteGeheimnisse: components["schemas"]["IngestQuelleGeheimnisFeld"][];
            /**
             * Format: date-time
             * @description `notAfter` des hinterlegten CA-Zertifikats; `null` = keines hinterlegt (NICHT: unbegrenzt gueltig). Kein Geheimnis — steht im oeffentlichen Teil des Zertifikats.
             */
            caZertifikatGueltigBis: string | null;
            /**
             * Format: date-time
             * @description `notAfter` des Client-Zertifikats. Laeuft es ab, verweigert der Broker die Verbindung und die Datenaufnahme steht still — die Betriebssicht warnt daher vorher. Ein bereits abgelaufenes Zertifikat wird beim Anlegen/Aendern mit 400 abgewiesen.
             */
            clientZertifikatGueltigBis: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        IngestQuelleAnlegen: {
            quelleCode: string;
            bezeichnung: string;
            /** @description NUR Host[:Port]. Zugangsdaten gehoeren in benutzername/passwort. */
            brokerHost: string;
            topic: string;
            clientId: string;
            tlsModus: components["schemas"]["TlsModus"];
            benutzername?: string;
            /** @description Wird feldverschluesselt abgelegt und nie wieder ausgegeben. */
            passwort?: string;
            /** @description PEM-Block. */
            caZertifikat?: string;
            /** @description PEM-Block. Pflicht bei tlsModus=mtls. */
            clientZertifikat?: string;
            /** @description PEM-Block, privater Schluessel. Pflicht bei tlsModus=mtls. */
            clientSchluessel?: string;
            notiz?: string;
        };
        /** @description Ein weggelassenes Feld bleibt unveraendert; ein LEERER String bei einem Geheimnis ENTFERNT es. `quelleCode` fehlt bewusst — er ist nicht aenderbar. */
        IngestQuelleAendern: {
            bezeichnung?: string;
            brokerHost?: string;
            topic?: string;
            clientId?: string;
            tlsModus?: components["schemas"]["TlsModus"];
            /** @enum {string} */
            status?: "aktiv" | "inaktiv";
            notiz?: string;
            benutzername?: string;
            passwort?: string;
            caZertifikat?: string;
            clientZertifikat?: string;
            clientSchluessel?: string;
        };
        /** @description OHNE DevEUI-Blind-Index, `payload_hash` und Rohpayload — s. Pfad-Beschreibung. Die Herkunfts-Felder sind NUR opake Kennungen; die Namen aus dem Netzserver (`tenantName`, `applicationName`, `deviceName`, `tags`) werden bewusst weder gespeichert noch ausgegeben (ADR-0011 D1). */
        IngestQuarantaeneItem: {
            /** Format: uuid */
            id: string;
            grund: components["schemas"]["IngestQuarantaeneGrund"];
            /**
             * Format: uuid
             * @description Pseudonym; `null`, wenn das Geraet nicht aufloesbar war.
             */
            zaehlerId: string | null;
            messkanalKey: number | null;
            /** @description Aus dem redigierten Envelope; `null` bei `envelope_parse_fehler` (dort gibt es keinen). */
            fPort: number | null;
            /** @description Welcher Worker-Prozess die Nachricht empfangen hat (ADR-0011 D8). `null` bei Zeilen aus der Zeit vor V0041 — ein Default waere eine Behauptung ueber Vergangenes. */
            quelleCode: string | null;
            /**
             * Format: uuid
             * @description Opake Mandanten-Kennung des Netzservers; beim Betreiber ein Endkunde. `null`, wenn der Envelope sie nicht trug.
             */
            chirpstackTenantId: string | null;
            /**
             * Format: uuid
             * @description Opake Application-Kennung; beim Betreiber ein Gebaeude.
             */
            chirpstackApplicationId: string | null;
            /** @description MQTT-Topic mit redigiertem Geraete-Segment (RL-2). */
            topicRedacted: string;
            /** Format: date-time */
            empfangenAt: string;
            /** @description Die Messgroessen, die der betroffene Zaehler TATSAECHLICH fuehrt, als `messgroesse (einheit)`-Liste; `null` ohne aufloesbaren Zaehler oder ohne Kanaele. Technische Groessen, kein Personenbezug. Sie steht hier, weil der Kanal-Lookup der Aufnahme `messgroesse` EXAKT vergleicht: Weicht die Schreibweise am Zaehler von dem ab, was der Decoder liefert, faellt jeder Uplink als `kanal_unbekannt` in Quarantaene — ohne diese Liste war die Ursache nur zu finden, indem man die Nutzlast von Hand dekodierte. */
            zaehlerMessgroessen: string | null;
        };
        IngestQuarantaeneListe: {
            daten: components["schemas"]["IngestQuarantaeneItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        AusfallListe: {
            daten: components["schemas"]["AusfallListeItem"][];
            seite: components["schemas"]["SeitenInfo"];
        };
        /** @description Betriebs-Metadatum (letzte Übertragung je Messkanal) — KEIN Messwert, KEIN break-glass. */
        MesskanalFreshnessItem: {
            /** Format: uuid */
            messkanalId: string;
            /**
             * Format: date-time
             * @description null = noch nie empfangen.
             */
            letzteUebertragung: string | null;
            ueberfaellig: boolean;
            ausfallStatus: components["schemas"]["AusfallVorgangStatus"] | null;
            /** Format: date-time */
            ausfallSeit: string | null;
        };
        /**
         * @description Bei anschlussnutzer: rechtsgrundlage=art6_1f, abwaegungRef und art14InformationAt zwingend (Art. 14 DSGVO, V0020-CHECK).
         * @enum {string}
         */
        EinflussBetroffenerTyp: "endkunde" | "anschlussnutzer";
        /** @enum {string} */
        EinflussQuelleTyp: "endkunde" | "anschlussnutzer" | "betriebsteam" | "vor_ort";
        /** @enum {string} */
        EinflussRechtsgrundlage: "art6_1b" | "art6_1f";
        /**
         * @description Geschlossene Liste (B12.5), KEIN Freitext. `korrektur` wird bei `PATCH .../einflussgroessen/{id}` server-seitig gesetzt, nicht client-wählbar.
         * @enum {string}
         */
        EinflussAnlassCode: "ersterfassung" | "turnusaktualisierung" | "korrektur" | "systemgrenzenaenderung" | "meldung_aenderung" | "sonstige";
        /**
         * @description Klassiert (B10/B12.5) — KEIN Rohprozentsatz im Report.
         * @enum {string}
         */
        EinflussUeberschreitungKlasse: "schwelle_ueberschritten" | "deutlich_ueberschritten" | "stark_ueberschritten";
        /** @description `endkundeId` ist BEWUSST NICHT Teil dieses Schemas — wird server-seitig aus `systemId` (Pfad) abgeleitet (RL-B1). `wertNum` XOR `wertCode`, abhängig von `wert_art` des `groesseCode`-Katalog- Eintrags (Service-seitig geprüft, nicht statisch im Schema). */
        EinflussgroesseErfassen: {
            /**
             * Format: uuid
             * @description Nur wo gemessen wird (A1) — Vorbedingung RL-B1 (aktive Zähler-Verortung im Zeitraum).
             */
            standortId?: string;
            /** @description einfluss.katalog.code (governt, erweiterbar) — z. B. personenanzahl/nutzflaeche/nutzungszweck/energietraeger_mix/geraeteabschaffung. */
            groesseCode: string;
            /** @description pii=true — Personenzahl/Nutzflaeche sind der PII-Wert selbst (A8). NIE in Logs/Audit-Kontext. */
            wertNum?: number;
            /** @description pii=true. Bei groesseCode=nutzungszweck aus der B12.5-Liste (wohnen/buero/handel/produktion/lager/sonstige). */
            wertCode?: string;
            /** @description Monatsanfang (YYYY-MM-01). */
            gueltigAbMonat: string;
            /** @description Monatsanfang */
            gueltigBisMonat?: string;
            betroffenerTyp: components["schemas"]["EinflussBetroffenerTyp"];
            quelleTyp: components["schemas"]["EinflussQuelleTyp"];
            rechtsgrundlage: components["schemas"]["EinflussRechtsgrundlage"];
            /** @description Verweis auf die dokumentierte Interessenabwägung (LIA) — Pflicht bei betroffenerTyp=anschlussnutzer. */
            abwaegungRef?: string;
            /**
             * Format: date-time
             * @description Zeitpunkt der Art.-14-Information — Pflicht bei betroffenerTyp=anschlussnutzer.
             */
            art14InformationAt?: string;
            anlassCode?: components["schemas"]["EinflussAnlassCode"];
        };
        /** @description Vollständige Felder der NEUEN Korrektur-Zeile (append-only). `groesseCode` ist NICHT Teil dieses Schemas — wird vom ursprünglichen Intervall GEERBT. `anlassCode` ist EBENFALLS nicht Teil dieses Schemas — der Server setzt ihn HART auf `korrektur`. */
        EinflussgroesseKorrekturWerte: {
            /** Format: uuid */
            standortId?: string;
            /** @description pii=true. */
            wertNum?: number;
            /** @description pii=true. */
            wertCode?: string;
            gueltigAbMonat: string;
            gueltigBisMonat?: string;
            betroffenerTyp: components["schemas"]["EinflussBetroffenerTyp"];
            quelleTyp: components["schemas"]["EinflussQuelleTyp"];
            rechtsgrundlage: components["schemas"]["EinflussRechtsgrundlage"];
            abwaegungRef?: string;
            /** Format: date-time */
            art14InformationAt?: string;
        };
        EinflussgroesseKorrigieren: {
            /** @description Schließt das adressierte Intervall — PFLICHT bei jedem Aufruf. */
            gueltigBisMonat: string;
            korrektur?: components["schemas"]["EinflussgroesseKorrekturWerte"];
        };
        /** @description `read:einflussgroesse`-Lesestufe — KLARTEXT-PII (A8/B10). `wertNum` ist ein STRING (numeric(18,3)-Präzisionserhalt), NIEMALS in `number` gewandelt. */
        EinflussgroesseDetail: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            endkundeId: string;
            /** Format: uuid */
            systemId: string;
            /** Format: uuid */
            standortId: string | null;
            groesseCode: string;
            /** @description pii=true; numeric(18,3) als String. */
            wertNum: string | null;
            /** @description pii=true. */
            wertCode: string | null;
            gueltigAbMonat: string;
            gueltigBisMonat: string | null;
            betroffenerTyp: components["schemas"]["EinflussBetroffenerTyp"];
            quelleTyp: components["schemas"]["EinflussQuelleTyp"];
            rechtsgrundlage: components["schemas"]["EinflussRechtsgrundlage"];
            abwaegungRef: string | null;
            /** Format: date-time */
            art14InformationAt: string | null;
            anlassCode: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        EinflussgroesseKorrekturErgebnis: {
            geschlossen: components["schemas"]["EinflussgroesseDetail"];
            /** @description null, wenn der Aufruf NUR geschlossen hat (kein korrektur-Feld im Request). */
            neu: components["schemas"]["EinflussgroesseDetail"] | null;
        };
        /** @description v1 NUR lesend — die Schwellwert-Erkennung selbst ist NICHT Teil dieser Version. */
        EinflussgroesseBefundItem: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            systemId: string;
            groesseCode: string;
            zeitraumVon: string;
            /** @description Monat, AB DEM die TB-03-Anzeigepflicht entsteht (Beginn der Änderung + Mindestdauer) — NICHT das Ende des auslösenden Zustands. Bei offenen Intervallen (z. B. dauerhafter Belegungswechsel ohne bekanntes Enddatum) besteht die Lage über diesen Monat hinaus fort. */
            zeitraumBis: string;
            ueberschreitungKlasse: components["schemas"]["EinflussUeberschreitungKlasse"];
            /** Format: date-time */
            erkanntAt: string;
        };
    };
    responses: {
        /** @description Ungültige Eingabe (Validierung fehlgeschlagen). PII-frei. */
        UngueltigeEingabe: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Kein/ungültiges/abgelaufenes Access-Token (AuthN, JwtAuthGuard). */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description AuthZ-Ablehnung (RBAC/ABAC, PolicyInterceptor) — Rolle fehlt, Datenklasse/ Zustand nicht erlaubt, oder break-glass-Grenzen verletzt. Wird auditiert (`authz.zugriff.verweigert`, M2). PII-frei, strukturierter Grund. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Ressource nicht gefunden. */
        NichtGefunden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Konflikt (z. B. Eindeutigkeits-/Overlap-Verletzung, oder Version bereits vorhanden). PII-frei. */
        Konflikt: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Unerwarteter Fehler. PII-/stacktrace-frei (DS-10). */
        Unerwartet: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /** @description Filtert auf EINEN Netzserver (ADR-0011 D8). */
        IngestQuelleQuery: string;
        /** @description Filtert auf EINEN Quarantaene-Grund. */
        IngestGrundQuery: components["schemas"]["IngestQuarantaeneGrund"];
        /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
        CursorParam: string;
        /** @description Seitengröße, max. 100 (api-contracts.md). */
        LimitParam: number;
        /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
        IdempotencyKey: string;
        EndkundeIdPath: string;
        SystemIdPath: string;
        ZaehlerIdPath: string;
        MesskanalIdPath: string;
        AnschlussnutzerIdPath: string;
        NutzungsverhaeltnisIdPath: string;
        /** @description Fortlaufende Versionsnummer der Messkonzept-Version. */
        VersionNrPath: number;
        /** @description Shred-Antrag-ID (ADR-0009). */
        AntragIdPath: string;
        /** @description Geraete-Zuordnungs-ID (device.geraet_zuordnung.id, ADR-0005 §26). */
        GeraetZuordnungIdPath: string;
        /** @description Standort-ID (energy.standort.id, ADR-0010). */
        StandortIdPath: string;
        /** @description Einflussgrößen-Intervall-ID (einfluss.intervall.id, ADR-0006 Teil B). */
        EinflussgroesseIdPath: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    endkundeLabelsBatch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndkundeLabelsAnfrage"];
            };
        };
        responses: {
            /** @description Batch-entschlüsselte Labels (nur auflösbare/berechtigte Ids). Die Antwortmenge kann kleiner sein als die Anfragemenge; die Differenz wird NICHT begründet (A4). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeLabelItem"][];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundenListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Endkunden (PII-frei). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundeAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndkundeAnlegen"];
            };
        };
        responses: {
            /** @description Endkunde angelegt. */
            201: {
                headers: {
                    /** @description Ressourcen-URI des neuen Endkunden. */
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundeLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Endkunde-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundeAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndkundeAendern"];
            };
        };
        responses: {
            /** @description Endkunde geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundeSperren: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndkundeSperren"];
            };
        };
        responses: {
            /** @description Endkunde gesperrt (oder war mit demselben Grund bereits gesperrt). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundeUnterrichten: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinschraenkungUnterrichtung"];
            };
        };
        responses: {
            /** @description Unterrichtung dokumentiert; Antwort ist das unveränderte Subjekt-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    endkundeEntsperren: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Einschränkung aufgehoben (oder das Subjekt war bereits aktiv). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EndkundeDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    shredAntraegeListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
            };
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Shred-Anträgen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShredAntragListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    shredAntragBeantragen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["KryptoShreddingAnweisung"];
            };
        };
        responses: {
            /** @description Antrag gestellt (oder bereits offener Antrag desselben Antragstellers zurückgegeben). */
            201: {
                headers: {
                    /** @description Ressourcen-URI des Antrags. */
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShredAntrag"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    shredAntragFreigeben: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
                /** @description Shred-Antrag-ID (ADR-0009). */
                antragId: components["parameters"]["AntragIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShredFreigebenAnweisung"];
            };
        };
        responses: {
            /** @description Antrag freigegeben, Endkunde krypto-geschreddert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShredFreigebenErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    shredAntragAblehnen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
                /** @description Shred-Antrag-ID (ADR-0009). */
                antragId: components["parameters"]["AntragIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ShredAblehnenAnweisung"];
            };
        };
        responses: {
            /** @description Antrag abgelehnt. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShredAntrag"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemeListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
                /** @description Filtert auf Systeme dieses Endkunden. */
                endkundeId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Systemen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SystemAnlegen"];
            };
        };
        responses: {
            /** @description System angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description System-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemStilllegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description System stillgelegt (oder war es bereits). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SystemAendern"];
            };
        };
        responses: {
            /** @description System geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
                /** @description Filtert auf Zähler dieser Messstelle. */
                systemId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Zählern. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZaehlerAnlegen"];
            };
        };
        responses: {
            /** @description Zähler angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zähler-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerStilllegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zähler stillgelegt (oder war es bereits). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZaehlerAendern"];
            };
        };
        responses: {
            /** @description Zähler geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerFreshness: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Freshness je Messkanal (leere Liste bei einem Zähler ohne Messkanäle). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskanalFreshnessItem"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkanaeleListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
            };
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Messkanälen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskanalListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkanalAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MesskanalAnlegen"];
            };
        };
        responses: {
            /** @description Messkanal angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskanalDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkanalLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                messkanalId: components["parameters"]["MesskanalIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Messkanal-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskanalDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkanalStilllegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                messkanalId: components["parameters"]["MesskanalIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Messkanal stillgelegt (oder war es bereits). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskanalDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkanalAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                messkanalId: components["parameters"]["MesskanalIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MesskanalAendern"];
            };
        };
        responses: {
            /** @description Messkanal geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskanalDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraetZuordnungAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeraetZuordnungAnlegen"];
            };
        };
        responses: {
            /** @description Geraete-Zuordnung angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeraetZuordnungDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraetZuordnungAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Geraete-Zuordnungs-ID (device.geraet_zuordnung.id, ADR-0005 §26). */
                geraetZuordnungId: components["parameters"]["GeraetZuordnungIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeraetZuordnungAendern"];
            };
        };
        responses: {
            /** @description Geraete-Zuordnung deaktiviert (oder war es bereits). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeraetZuordnungDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraetZuordnungReverseAufloesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Geraete-Zuordnungs-ID (device.geraet_zuordnung.id, ADR-0005 §26). */
                geraetZuordnungId: components["parameters"]["GeraetZuordnungIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeraetReverseAufloesungAnfrage"];
            };
        };
        responses: {
            /** @description Reverse-Aufloesung erfolgreich (Klartext-DevEUI in der Response). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeraetReverseAufloesungErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkonzeptVersionenListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
            };
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Messkonzept-Versionen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskonzeptVersionListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkonzeptVersionAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MesskonzeptVersionAnlegen"];
            };
        };
        responses: {
            /** @description Neue Messkonzept-Version angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskonzeptVersionDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    messkonzeptVersionLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
                /** @description Fortlaufende Versionsnummer der Messkonzept-Version. */
                versionNr: components["parameters"]["VersionNrPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Messkonzept-Version-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MesskonzeptVersionDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemgrenzeLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Kennung des Messkonzept-Energieträgers (`MesskonzeptVersionDetail.energietraeger[].mvetId`). */
                mvetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Systemgrenze samt Auswahl. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Systemgrenze"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    systemgrenzeSetzen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Kennung des Messkonzept-Energieträgers (`MesskonzeptVersionDetail.energietraeger[].mvetId`). */
                mvetId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SystemgrenzeSetzen"];
            };
        };
        responses: {
            /** @description Die neue Systemgrenze. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Systemgrenze"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    baselinePeriodenLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Kennung des Messkonzept-Energieträgers (`MesskonzeptVersionDetail.energietraeger[].mvetId`). */
                mvetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Die erfassten Perioden samt Baseline-Bezug. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BaselinePerioden"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    baselinePeriodenSetzen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Kennung des Messkonzept-Energieträgers (`MesskonzeptVersionDetail.energietraeger[].mvetId`). */
                mvetId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BaselinePeriodenSetzen"];
            };
        };
        responses: {
            /** @description Die neuen Perioden samt Baseline-Bezug. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BaselinePerioden"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    anschlussnutzerListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
                endkundeId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Anschlussnutzern. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnschlussnutzerListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    anschlussnutzerAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnschlussnutzerAnlegen"];
            };
        };
        responses: {
            /** @description Anschlussnutzer angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnschlussnutzerDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    anschlussnutzerLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Anschlussnutzer-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnschlussnutzerDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    anschlussnutzerSperren: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnschlussnutzerSperren"];
            };
        };
        responses: {
            /** @description Anschlussnutzer gesperrt (oder war mit demselben Grund bereits gesperrt). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnschlussnutzerDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    anschlussnutzerUnterrichten: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinschraenkungUnterrichtung"];
            };
        };
        responses: {
            /** @description Unterrichtung dokumentiert; Antwort ist das unveränderte Subjekt-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnschlussnutzerDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    anschlussnutzerEntsperren: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                anschlussnutzerId: components["parameters"]["AnschlussnutzerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Einschränkung aufgehoben (oder das Subjekt war bereits aktiv). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnschlussnutzerDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzungsverhaeltnisseListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
                endkundeId?: string;
                anschlussnutzerId?: string;
                systemId?: string;
                /** @description Nur aktuell gültige Verhältnisse (gueltig_bis IS NULL). */
                nurAktuelle?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Nutzungsverhältnissen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzungsverhaeltnisListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzungsverhaeltnisAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NutzungsverhaeltnisAnlegen"];
            };
        };
        responses: {
            /** @description Nutzungsverhältnis angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzungsverhaeltnisDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzungsverhaeltnisLesen: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                nutzungsverhaeltnisId: components["parameters"]["NutzungsverhaeltnisIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nutzungsverhältnis-Detail. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzungsverhaeltnisDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    nutzungsverhaeltnisBeenden: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                nutzungsverhaeltnisId: components["parameters"]["NutzungsverhaeltnisIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NutzungsverhaeltnisBeenden"];
            };
        };
        responses: {
            /** @description Nutzungsverhältnis beendet. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NutzungsverhaeltnisDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einschraenkungFristen: {
        parameters: {
            query?: {
                /** @description Ab wie vielen Tagen ein Vorgang als überfällig markiert wird. Art. 18 nennt KEINE Zahl; die Vorgabe 30 ist an die Art.-12-Abs.-3-Reaktionsfrist angelehnt und eine betriebliche Setzung, keine Rechtsfolge — die organisatorische Bestätigung steht aus (analog A16). */
                schwelleTage?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Wiedervorlage-Report. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinschraenkungFristReport"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    erhebungsEntscheidungen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Bericht über die Erhebungs-Entscheidungen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErhebungsEntscheidungReport"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    vollstaendigkeitListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
                endkundeId?: string;
                /** @description Nur Einträge mit mindestens einer Lücke. */
                nurMitLuecken?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Vollständigkeits-Einträgen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VollstaendigkeitListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ausfaelleListe: {
        parameters: {
            query?: {
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite von Kanälen mit Ausfall/überfälliger Freshness. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AusfallListe"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    geraetetypKatalogLesen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Katalog der bekannten Geraetetypen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GeraetetypKatalog"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ingestStatusLesen: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Betriebszustand der Aufnahme. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestStatus"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ingestQuarantaeneListe: {
        parameters: {
            query?: {
                /** @description Filtert auf EINEN Quarantaene-Grund. */
                grund?: components["parameters"]["IngestGrundQuery"];
                /** @description Filtert auf EINEN Netzserver (ADR-0011 D8). */
                quelle?: components["parameters"]["IngestQuelleQuery"];
                /** @description Opaker Cursor der Vorseite (aus `seite.naechsterCursor`). Cursor-basiert, kein offset (api-contracts.md). */
                cursor?: components["parameters"]["CursorParam"];
                /** @description Seitengröße, max. 100 (api-contracts.md). */
                limit?: components["parameters"]["LimitParam"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite liegengebliebener Uplinks. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestQuarantaeneListe"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    herkunftMappingListe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Alle Herkunfts-Zuordnungen, neueste zuerst. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HerkunftMapping"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    herkunftMappingAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HerkunftMappingAnlegen"];
            };
        };
        responses: {
            /** @description Zuordnung angelegt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HerkunftMapping"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    herkunftMappingEntfernen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                herkunftId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zuordnung entfernt; ausgegeben wird die entfernte Zeile. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HerkunftMapping"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ingestQuellenListe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Liste der Datenquellen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestQuelleKonfig"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ingestQuelleAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IngestQuelleAnlegen"];
            };
        };
        responses: {
            /** @description Datenquelle angelegt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestQuelleKonfig"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ingestQuelleDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quelleId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Die Datenquelle. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestQuelleKonfig"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    ingestQuelleAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                quelleId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IngestQuelleAendern"];
            };
        };
        responses: {
            /** @description Datenquelle geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IngestQuelleKonfig"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standorteListe: {
        parameters: {
            query?: {
                /** @description Subtree-Filter (D6) — nur dieser Knoten + Nachfahren. */
                wurzelId?: string;
                /** @description Relative Tiefe ab `wurzelId` (bzw. absolut ohne `wurzelId`). */
                maxTiefe?: number;
                nurAktive?: boolean;
            };
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Standort-Baum (flache Liste, Client rekonstruiert die Hierarchie über `parentId`/`pfad`). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortStruktur"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StandortAnlegen"];
            };
        };
        responses: {
            /** @description Standort angelegt. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortStruktur"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortLabelsBatch: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StandortLabelsAnfrage"];
            };
        };
        responses: {
            /** @description Batch-entschlüsselte Labels (nur auflösbare/berechtigte Ids). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortLabelItem"][];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortLoeschen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Standort gelöscht. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortLoeschErgebnis"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StandortAendern"];
            };
        };
        responses: {
            /** @description Standort geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortStruktur"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortPiiAendern: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StandortPiiAendern"];
            };
        };
        responses: {
            /** @description Standort-PII geändert. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortPiiDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortVerschieben: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StandortVerschieben"];
            };
        };
        responses: {
            /** @description Standort verschoben. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortVerschobenErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    standortStilllegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StandortStilllegen"];
            };
        };
        responses: {
            /** @description Standort stillgelegt (oder war es bereits). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StandortStillgelegtErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerUnterKnoten: {
        parameters: {
            query?: {
                stichtag?: string;
                inklusiveUnterknoten?: boolean;
            };
            header?: never;
            path: {
                /** @description Standort-ID (energy.standort.id, ADR-0010). */
                standortId: components["parameters"]["StandortIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zähler, die zum Stichtag an diesem Knoten (bzw. Teilbaum) verortet waren. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerUnterKnotenItem"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerAktuelleVerortung: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aktuelle Verortung (ggf. `verortet=false`, Empty-State — kein Fehler). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerStandortAktuellDetail"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerVerortungAnlegen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZaehlerVerortungAnlegen"];
            };
        };
        responses: {
            /** @description Verortung angelegt. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerStandortDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    zaehlerVerortungBeenden: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                zaehlerId: components["parameters"]["ZaehlerIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZaehlerVerortungBeenden"];
            };
        };
        responses: {
            /** @description Verortung beendet. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZaehlerStandortDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einflussgroesseListe: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Einflussgrößen-Intervalle des Systems (Klartext). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinflussgroesseDetail"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einflussgroesseErfassen: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                systemId: components["parameters"]["SystemIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinflussgroesseErfassen"];
            };
        };
        responses: {
            /** @description Einflussgröße erfasst. */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinflussgroesseDetail"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einflussgroesseKorrigieren: {
        parameters: {
            query?: never;
            header: {
                /** @description Client-erzeugter Idempotenz-Schlüssel (UUID empfohlen) je schreibender Operation. Wiederholung mit gleichem Schlüssel liefert dasselbe Ergebnis, ohne den Effekt zu duplizieren. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                /** @description Einflussgrößen-Intervall-ID (einfluss.intervall.id, ADR-0006 Teil B). */
                einflussgroesseId: components["parameters"]["EinflussgroesseIdPath"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EinflussgroesseKorrigieren"];
            };
        };
        responses: {
            /** @description Intervall geschlossen (ggf. inkl. neuer Korrektur-Zeile). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinflussgroesseKorrekturErgebnis"];
                };
            };
            400: components["responses"]["UngueltigeEingabe"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            409: components["responses"]["Konflikt"];
            default: components["responses"]["Unerwartet"];
        };
    };
    einflussgroesseBefunde: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                endkundeId: components["parameters"]["EndkundeIdPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description TB-03-Befunde (ggf. leer). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EinflussgroesseBefundItem"][];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NichtGefunden"];
            default: components["responses"]["Unerwartet"];
        };
    };
}
