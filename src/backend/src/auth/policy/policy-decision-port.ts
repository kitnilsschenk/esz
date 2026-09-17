import type { SecurityContext } from '../../common/security/security-context';

/**
 * ADR-0008 Teil B §14 (D2) — additive Erweiterung der v1-Aktions-Taxonomie.
 * Der Port-Vertrag `evaluate(subject, action, resource?)` bleibt UNVERÄNDERT
 * (Ports & Adapters) — nur die `PolicyAction`-Union wächst. Die grobe
 * `'read'|'write'|'delete'`-Ableitung aus der HTTP-Methode
 * (`PolicyInterceptor`s `METHOD_ACTION_MAP`) bleibt der FALLBACK für Routen
 * ohne `@Fachaktion(...)` (Auth-Routen, ADR-0002 — unberührt). Fach-Routen
 * (`StammdatenModule`) tragen `@Fachaktion(...)` mit einem der Werte unten.
 *
 * NIEMALS per Literalgleichheit gegen diese Strings prüfen — s.
 * `classifyAction()` (PDP-Blocker 1, ADR-0008 §14/§30).
 */
export type PolicyAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'read:stammdaten'
  | 'read:monitoring'
  | 'read:verbrauch_detail'
  | 'create:endkunde'
  | 'create:system'
  | 'create:zaehler'
  | 'create:messkanal'
  | 'create:messkonzept_version'
  | 'create:anschlussnutzer'
  | 'create:nutzungsverhaeltnis'
  | 'update:endkunde'
  | 'update:system'
  | 'update:zaehler'
  | 'update:messkanal'
  // Die Systemgrenze eines Messkonzept-Energietraegers (V0072). Sie aendert
  // eine bestehende Version, ohne eine neue anzulegen: Welche Zaehler ein
  // Lauf umfasst, ist eine Zuordnung, keine inhaltliche Neufassung des
  // Konzepts.
  | 'update:messkonzept_version'
  | 'update:nutzungsverhaeltnis'
  // ADR-0007 C8/A11.1 — die Art.-18-Sperre ist KEIN Loeschen (die Spec sagte
  // schon immer "kein Hard-Delete", der Audit-Katalog fuehrt sie seit V0006
  // als aktion_kategorie='sperren'). Mit dem Pflicht-Grund wandert sie von
  // `DELETE /stammdaten/endkunden/{id}` auf `POST .../{id}/sperren`; die
  // Fachaktion zieht nach. `classifyAction()` stuft `sperren:*` ueber den
  // Default-Zweig als `write` ein (vorher `delete`) — beides ist NICHT-`read`,
  // die DS-01-Regel (compliance-auditor strikt lesend) entscheidet daher
  // unveraendert. Verifiziert gegen `in-code-policy.adapter.ts`: dort wird
  // ausschliesslich `classifyAction(action) !== 'read'` geprueft, es gibt
  // KEINEN eigenen Zweig fuer die Kategorie `delete`.
  // ADR-0011 B2/D3 -- die Herkunfts-Zuordnung liegt unter `/monitoring`, ist
  // aber KEINE Monitoring-Handlung: Sie entscheidet seit B3 mit darueber,
  // WESSEN Messwerte eingespeist werden. Deshalb eigene Schreib-Aktionen
  // (nur `betrieb`) statt einer Ausweitung von `read:monitoring`;
  // `classifyAction()` stuft beide ueber die Praefixe korrekt als `write`
  // bzw. `delete` ein, `compliance-auditor` bleibt strikt lesend (DS-01).
  | 'create:herkunft_mapping'
  | 'delete:herkunft_mapping'
  // V0059 -- Pflege der Datenquellen. Lesen laeuft ueber `read:monitoring`
  // wie die uebrige Betriebssicht; Schreiben braucht eigene Aktionen aus
  // demselben Grund wie beim Herkunfts-Mapping: Wer eine Quelle anlegt oder
  // ihren Broker-Host aendert, bestimmt, WOHER dieses System Messwerte
  // bezieht -- und wer sie deaktiviert, legt die Datenaufnahme still.
  // `classifyAction()` stuft beide ueber die Praefixe als `write` ein,
  // `compliance-auditor` bleibt strikt lesend (DS-01).
  | 'create:ingest_quelle'
  | 'update:ingest_quelle'
  // ADR-0012 B1 -- Einwilligungsverwaltung. Lesen darf auch
  // `compliance-auditor`: Der Nachweis nach Art. 7 Abs. 1 DSGVO ist Teil
  // seiner Aufgabe. Schreiben nur `betrieb`; `classifyAction()` stuft
  // `create:*` und `widerrufen:*` ueber die Praefixe als `write` ein, die
  // DS-01-Regel greift damit ohne Sonderfall.
  | 'read:consent'
  | 'create:consent_text'
  | 'create:einwilligung'
  | 'widerrufen:einwilligung'
  // AW-27 -- Widerspruch/Abwahl. EIGENE Aktionen, nicht `*:einwilligung`
  // mitbenutzt: Der Widerspruch richtet sich gegen eine Verarbeitung, die
  // auch OHNE Zustimmung laeuft, und die Ruecknahme laesst sie WIEDER
  // anlaufen -- das ist die Handlung mit Missbrauchspotenzial und muss
  // getrennt entziehbar sein (dieselbe Begruendung wie bei der Aufhebung der
  // Art.-18-Einschraenkung unten).
  | 'create:widerspruch'
  | 'zuruecknehmen:widerspruch'
  // TB-06 -- monatliche Nutzerinformation. `zustellen:*` ist eine eigene
  // Aktion und keine Variante von `create:*`: Der Erzeugungslauf leitet ab,
  // die Zustellung erfuellt eine Foerderauflage und ist der Vorgang, dessen
  // Nachweis die Behoerde sehen will. Wer erzeugen darf, muss nicht zustellen
  // duerfen.
  | 'read:nutzerinfo'
  | 'create:nutzerinfo_lauf'
  | 'zustellen:nutzerinfo'
  // TB-05 -- Geraete-/Anlagengruppen-Erkennung. Drei getrennte
  // Schreib-Aktionen, weil sie verschieden folgenreich sind: Zuordnen HEBT
  // die Nachweisquote, Beenden SENKT sie, und `vermerken:*` erklaert eine
  // Foerderauflage fuer ein System als pauschal erfuellt. Wer zuordnen darf,
  // muss das Letzte nicht duerfen.
  | 'read:geraeteerkennung'
  | 'create:geraetegruppe'
  | 'create:geraetegruppe_zuordnung'
  | 'beenden:geraetegruppe_zuordnung'
  | 'vermerken:geraeteerkennung_entbehrlich'
  | 'sperren:endkunde'
  | 'sperren:anschlussnutzer'
  // ADR-0007 A11.10 — Aufhebung der Art.-18-Einschraenkung. EIGENE Aktionen
  // (nicht `sperren:*` mitbenutzt): das Aufheben ist die Handlung mit
  // Missbrauchspotenzial — es gibt die Verarbeitung wieder frei — und muss
  // getrennt entziehbar sein. Der vorgelagerte Unterrichtungs-Schritt laeuft
  // unter derselben Aktion: beide Schritte gehoeren zu EINEM Vorgang, und
  // eine eigene Aktion nur fuer die Dokumentation waere tote RBAC-Flaeche
  // (`nachweis.module.ts`-Konvention), solange keine Aufgabentrennung
  // zwischen Unterrichtendem und Aufhebendem gefordert ist.
  // `classifyAction()` stuft `entsperren:*` ueber den Default-Zweig als
  // `write` ein — NICHT-`read`, DS-01 greift also unveraendert.
  | 'entsperren:endkunde'
  | 'entsperren:anschlussnutzer'
  // ADR-0007 A18/A11.12 — Art.-19-Mitteilungspflichten. Eigene Aktionen statt
  // `read:einreichung`/`create:einreichung` mitbenutzt: das Dokumentieren einer
  // Mitteilung ist KEINE Einreichung, und die Pflichtenliste soll getrennt
  // entziehbar sein. `classifyAction()` stuft `read:*` als `read` ein (Auditor
  // darf lesen) und `create:*` als `write` (Auditor bleibt gesperrt).
  | 'read:art19_pflicht'
  | 'create:art19_mitteilung'
  | 'delete:system'
  | 'delete:zaehler'
  | 'delete:messkanal'
  | 'shred:endkunde'
  | 'shred:anschlussnutzer'
  // ADR-0009 §2.2 — Vier-Augen-/Freigabe-Kontrolle für Krypto-Shredding
  // (Endkunde, Art. 17 DSGVO). Beide Aktionen sind bewusst distinct von
  // `shred:endkunde` (das bleibt der harmlose "Antrag stellen"-Schritt,
  // unveränderter Gate) und klassifizieren über `classifyAction()`
  // (Präfix-Test `startsWith('shred')`) automatisch als Kategorie `shred`
  // (≠ `read`) — DS-01 (compliance-auditor strikt lesend) greift also
  // unverändert, ohne `classifyAction()` anzufassen.
  | 'shred:endkunde:freigeben'
  | 'shred:endkunde:ablehnen'
  // ADR-0005 §26.4 (D14, O4-Audit-Drei-Wege-Split) — Provisioning (Anlage/
  // Aktualisierung einer DevEUI<->Zaehler-Korrelation, `device.
  // geraet_zuordnung`). Klassifizieren automatisch ueber die bestehende
  // `classifyAction()`-Fallback-Regel (nicht read/shred/delete-praefigiert)
  // als Kategorie `write` — KEIN Sonderfall in `classifyAction()` noetig, s.
  // dortigen Kommentar "NIE per Literalvergleich".
  | 'create:geraet_zuordnung'
  | 'update:geraet_zuordnung'
  // ADR-0005 §26.4 SEC-5 — Reverse-Aufloesung (Blind-Index/Zeile -> Klartext-
  // DevEUI). Klassifiziert ueber `classifyAction()` als Kategorie `read`
  // (Praefix-Test `startsWith('read')`, KEIN Sonderfall dort noetig) — ABER:
  // die generische DS-01-Regel (1) im `InCodePolicyAdapter` prueft NUR
  // `classifyAction(action) !== 'read'`, wuerde also `compliance-auditor`
  // fuer eine READ-klassifizierte Aktion NICHT automatisch ablehnen. SEC-5
  // verlangt trotzdem striktes Auditor-Deny fuer GENAU diese Aktion (die
  // Reverse-Aufloesung ist keine gewoehnliche Lese-Aktion, sondern ein
  // privilegierter Krypto-Zugriff) — der `InCodePolicyAdapter` traegt dafuer
  // eine EIGENE, explizite Regel (`geraet_reverse_auditor_verboten`), NICHT
  // eine Aenderung an `classifyAction()`/der generischen DS-01-Regel (die
  // wuerde alle anderen `read:*`-Aktionen fuer den Auditor mit-blockieren).
  | 'read:geraet_zuordnung'
  // ADR-0010 D5 — Standort-/Gebaeudestruktur (raeumliche Verortung). ZWEI
  // Lesestufen, STRIKT getrennt (kritischer Punkt des Arbeitsauftrags):
  // `read:standort` (Baum/Struktur: Pseudonyme, typ, ebene, pfad, status —
  // NIEMALS Bezeichnung/Adresse, fuer Auswerte-Rollen) vs. `read:standort_pii`
  // (entschluesseltes Label/Adresse, IMMER auditiert, KEIN Break-glass/keine
  // Zweckpflicht laut ADR — "Adresslesen ist Alltagsbetrieb"). Beide
  // klassifizieren automatisch ueber `classifyAction()`
  // (Praefix-Test `startsWith('read')`) als Kategorie `read` — KEIN
  // Sonderfall dort noetig. `read:standort_pii` bekommt dennoch (analog
  // `read:geraet_zuordnung`) eine EIGENE Defense-in-Depth-Auditor-Deny-Regel
  // im `InCodePolicyAdapter` (`standort_pii_auditor_verboten`): die
  // generische DS-01-Regel (1) greift NICHT (klassifiziert als `read`), PII-
  // Klartext soll `compliance-auditor` aber strukturell nie erreichen
  // (konsistent mit `PiiProjektionsPolicy`, die fuer diese Rolle ebenfalls
  // IMMER maskiert).
  // ADR-0008 D12 (Auflage A5) — Batch-Aufloesung von Endkunden-Klartext-
  // namen fuer Listen/Auswahlfelder (`POST /stammdaten/endkunden/labels`).
  // GENAU ANALOG `read:standort_pii`: eigene Lesestufe NEBEN dem PII-freien
  // Listenpfad, klassifiziert ueber `classifyAction()` als `read`, und mit
  // einer EIGENEN Auditor-Deny-Regel im `InCodePolicyAdapter`
  // (`endkunde_pii_auditor_verboten`) verstaerkt. KEIN Break-glass (A8) --
  // der Name ist ein Stammdatum, das `betrieb` ohnehin als Dauerrecht auf der
  // Detailseite hat; auditiert wird trotzdem IMMER (A6).
  | 'read:endkunde_pii'
  | 'read:standort'
  | 'read:standort_pii'
  | 'create:standort'
  | 'update:standort'
  | 'delete:standort'
  | 'create:zaehler_standort'
  | 'update:zaehler_standort'
  // Verbrauchs-/Messwert-Endpoint (`MesswerteModule`, letztes fehlendes
  // Ausliefer-Stück nach ADR-0005/-0010) — ZWEI strikt getrennte Aktionen,
  // ANALOG zur `read:standort`/`read:standort_pii`-Trennung (D5), hier aber
  // entlang der Detailtiefe statt PII:
  // `read:verbrauch_aggregat` (NEU) — aggregierte Verbrauchs-Zeitreihe je
  // Standortknoten (`GET .../standorte/{id}/verbrauch`), PII-frei,
  // normales `betrieb`-Recht OHNE break-glass (DS-07 schützt die
  // Detailtiefe des Lastgangs, nicht die Existenz einer Summe). Klassifiziert
  // automatisch über `classifyAction()` (Präfix-Test `startsWith('read')`)
  // als Kategorie `read` — KEIN Sonderfall im `InCodePolicyAdapter` nötig:
  // `resolveViaStandort()` liefert `resource.standort` OHNE `entityTyp`, die
  // `istVerbrauchDetailZugriff()`-Prüfung (§16) greift daher NICHT.
  // `read:verbrauch_detail` (bestehend, ADR-0008 §16/D4) wird für die
  // Roh-Zeitreihe je Messkanal (`GET .../messkanaele/{id}`) WIEDERVERWENDET —
  // NICHT aufgeweicht, NICHT neu erfunden: genau dafür wurde die
  // break-glass-Härtung gebaut (ADR-0008 §16 "erster realer Konsument =
  // Verbrauchs-/Lastgang-Endpoint").
  | 'read:verbrauch_aggregat'
  // ADR-0006 Teil B (Baseline & Witterungsbereinigung, `BerechnungModule`,
  // eigener Top-Level-Kontext analog `MesswerteModule`) — `create:
  // berechnungslauf` (`POST /berechnung/laeufe`) UND `read:berechnungslauf`
  // (`GET /berechnung/laeufe/{laufId}`) sind BEIDE endkunde-scoped, OHNE
  // eigene PDP-Sonderregel (kein `evaluate*()`-Zweig im
  // `InCodePolicyAdapter` nötig — analog `create:standort`/`create:system`):
  // beide klassifizieren automatisch über `classifyAction()`
  // (`create:*`→`write`, `read:*`→`read`) und laufen über den generischen
  // `default_permit_v1`-Pfad bzw. die bestehende DE-04-Prüfung
  // (`vonWissAuswertungAusgenommen`). Ressourcen-Auflösung (s.
  // `StammdatenResourceAttributesProvider`):
  //   `create:berechnungslauf` — KEIN Pfad-Parameter (die Ressource
  //     existiert vor dem Request noch nicht) — `endkundeId` kommt
  //     redundant aus dem Request-BODY (analog `analytics.berechnungslauf.
  //     endkunde_id` selbst, V0019-Kommentar "redundant, ABAC-Filter ohne
  //     Join") und wird darüber exakt wie `resolveViaEndkunde()` für
  //     `create:standort` aufgelöst.
  //   `read:berechnungslauf` — Pfad-Parameter `laufId`, löst über
  //     `AnalyticsBerechnungslaufRepository.findEndkundeIdById()` (NEU,
  //     `berechnung/persistence/**`) zu `endkundeId` auf, DANN identisch zu
  //     `resolveViaEndkunde()` (entityTyp `'berechnungslauf'`, NEU in
  //     `ResourceAttributes.entityTyp`, s. dort).
  | 'create:berechnungslauf'
  | 'read:berechnungslauf'
  // ADR-0006 Teil B (B8/B10, Einflussgrößen, `EinflussgroesseModule`
  // innerhalb `stammdaten/**`, `migrations/V0020`/`V0021`) — DREI Aktionen,
  // analog `create:/update:standort`/`read:standort_pii` (D5-Muster):
  // `create:einflussgroesse` (`POST .../systeme/{systemId}/einflussgroessen`)
  // und `update:einflussgroesse` (`PATCH .../einflussgroessen/{id}`)
  // klassifizieren automatisch über `classifyAction()` als `write` (KEIN
  // Sonderfall dort nötig). `read:einflussgroesse` (Klartext-Liste je System
  // UND der Befund-Report je Endkunde) klassifiziert automatisch als `read`
  // — B10 verlangt dafür ABER eine STRIKTE Auditor-Härtung ("Klartext-PII-
  // Leseaktion, immer audit-pflichtig, Auditor-Deny"): `wert_num`/`wert_code`
  // (`einfluss.intervall`, A8) sind Klartext-PII OHNE Verschlüsselung/
  // Pseudonymisierung (V0020 D-ROLLE) — die generische DS-01-Regel (1) im
  // `InCodePolicyAdapter` prüft NUR `classifyAction(action) !== 'read'` und
  // würde den Auditor daher NICHT automatisch ablehnen. Der
  // `InCodePolicyAdapter` trägt dafür — GENAU ANALOG `read:standort_pii`/
  // `read:geraet_zuordnung` — eine EIGENE, explizite Deny-Regel
  // (`einflussgroesse_auditor_verboten`), NICHT eine Änderung an
  // `classifyAction()`/der generischen DS-01-Regel (die würde alle anderen
  // `read:*`-Aktionen für den Auditor mit-blockieren).
  | 'create:einflussgroesse'
  | 'read:einflussgroesse'
  | 'update:einflussgroesse'
  // ADR-0007 Teil B (B10, Nachweis/BAFA-Export — STUFE 1 dieses ADR: NUR
  // Förderjahr/Preflight/Einsparlauf, NICHT Export/Einreichung). FÜNF
  // Aktionen, ALLE klassifizieren automatisch über `classifyAction()`
  // (`create:*`→`write`, `read:*`→`read`) — KEIN Sonderfall dort nötig.
  //
  // `create:foerderjahr` (`POST /nachweis/foerderjahre`) — Lesen läuft laut
  // B10-Tabelle über die BESTEHENDE `read:stammdaten` (KEIN eigenes
  // `read:foerderjahr`).
  //
  // `create:nachweis_preflight`/`read:nachweis_preflight` UND
  // `create:einsparlauf`/`read:einsparlauf` sind — B10 wörtlich —
  // PORTFOLIOWEITE Aktionen OHNE `endkundeId`: „Ihr Schutz ist RBAC
  // (`betrieb`, ggf. eigene Rolle `nachweis` → O-B11) plus die fail-closed-
  // Vorbedingungen aus D4/D7, NICHT ABAC-Scoping. Das ist eine bewusste
  // Abweichung vom Stammdaten-Muster und keine Lücke, die man später 'noch
  // schließt' — wer einen Förderjahr-Nachweis erzeugen darf, sieht das
  // Portfolio." Für die BEIDEN Lese-Aktionen mit Pfad-ID
  // (`preflightId`/`einsparlaufId`) liefert der
  // `StammdatenResourceAttributesProvider` einen Resolver-Zweig ANALOG
  // `resolveViaBerechnungslauf()` — EXISTENZ-Check (404 statt eines
  // maskierten 403 bei falscher ID, `nichtGefunden()` im jeweiligen
  // `NachweisXyzRepository`), AUSDRÜCKLICH KEINE `endkundeId`-Auflösung
  // (keine Ressource, über die `evaluate()` heute entscheidet — `resource
  // === undefined`-Kurzschluss/`kein_ressourcenbezug` trägt den Zugriff, RBAC
  // ist die eigentliche Kontrolle, s. `PolicyAction`-Kommentar oben zu
  // `create:berechnungslauf` für das etablierte Vorbild dieses Musters).
  //
  // O-B11 (User-Beschluss B14): eine eigene App-Rolle `nachweis` wird in v1
  // NICHT eingeführt — alle fünf Aktionen laufen über die bestehenden Rollen
  // `betrieb` (schreibend) und `betrieb`/`compliance-auditor` (lesend).
  | 'create:foerderjahr'
  | 'create:nachweis_preflight'
  | 'read:nachweis_preflight'
  | 'create:einsparlauf'
  | 'read:einsparlauf'
  // ADR-0007 Teil B (B10) STUFE 2 (Export/Einreichung, Teil C A13/A14/A15/
  // A19/A20/A21/A23) — VIER weitere Aktionen, ALLE klassifizieren automatisch
  // über `classifyAction()` (`create:*`→`write`, `read:*`→`read`) — KEIN
  // Sonderfall dort nötig.
  //
  // `create:nachweis_export`/`create:einreichung` sind ENDKUNDE-LOS wie
  // `create:einsparlauf` (Pfad-ID ist `einsparlaufId` bzw. `exportId`, KEIN
  // `endkundeId`) — RBAC (`betrieb`) trägt den Schutz, ABAC liefert nur ein
  // Existenz-Signal (`resolveViaNachweisExport()`/`resolveViaEinreichung()`,
  // Muster `resolveViaEinsparlauf()`).
  //
  // `read:nachweis_export` ist — B10 wörtlich — „die schutzwürdigste
  // Leseaktion dieses ADR" (Tages-Detailwerte UND Einflussgrößen-Projektion
  // im ausgelieferten Dateiinhalt): `classifyAction()` stuft sie als `read`
  // ein, die generische DS-01-Regel (1) im `InCodePolicyAdapter` greift
  // daher NICHT automatisch. Der Adapter trägt dafür — GENAU ANALOG
  // `read:standort_pii`/`read:einflussgroesse` — eine EIGENE, explizite
  // Deny-Regel (`nachweis_export_auditor_verboten`), NICHT eine Änderung an
  // `classifyAction()`/der generischen DS-01-Regel.
  //
  // `read:einreichung` bekommt AUSDRÜCKLICH KEINE solche Sonderregel — B10:
  // „die Metadaten sind sein [des Auditors] Prüfgegenstand, nicht sein
  // Risiko" — sie bleibt bei der generischen `read`-Klassifikation und dem
  // Standard-Permit-Pfad, GENAU wie `read:einsparlauf`/`read:
  // nachweis_preflight`. Diese Asymmetrie ist der Kern von B10/A19 und
  // bewusst NICHT symmetrisch gebaut.
  | 'create:nachweis_export'
  | 'read:nachweis_export'
  | 'create:einreichung'
  | 'read:einreichung';

/**
 * Break-glass-Zugriffszweck (ADR-0008 §16, D4) — Request-Attribut
 * (`X-Edms-Zugriffszweck`), vom `StammdatenResourceAttributesProvider` aus
 * dem Request gelesen und (falls vorhanden) hier abgelegt. NICHT-PII
 * (whitelisted Zweck-Code + Zähler-Pseudonym-Referenz + Zeitfenster).
 */
export interface ZugriffszweckAttribut {
  readonly zweckCode: string;
  readonly zaehlerId: string;
  readonly vonTs: string;
  readonly bisTs: string;
}

/**
 * ABAC-Steuergrößen aus ADR-0004 §13.2 + ADR-0008 §15 (D3)/§16 (D4) —
 * additiv erweitert um die Stammdaten-Fach-Attribute. Der PDP zieht selbst
 * KEINE PII (Linie 2) — alle Attribute stammen ausschließlich aus
 * `energy.*`/Request-Headern.
 */
export interface ResourceAttributes {
  readonly nutzungsverhaeltnis?: string;
  readonly datenklasse?: 'abrechnungsminimum' | 'detailverbrauch';
  readonly vonWissAuswertungAusgenommen?: boolean;
  /** Opake Owner-`sub` (kein FK, ADR-0004 §6/§13.2). */
  readonly ownerSub?: string;
  /** ADR-0008 §15 (D3) — Fach-Entitätstyp der aufgelösten Ressource. */
  readonly entityTyp?:
    | 'endkunde'
    | 'system'
    | 'zaehler'
    | 'messkanal'
    | 'anschlussnutzer'
    | 'nutzungsverhaeltnis'
    | 'verbrauch'
    // ADR-0006 — `read:berechnungslauf` (`resolveViaBerechnungslauf()`).
    | 'berechnungslauf'
    // ADR-0006 Teil B (B8/B10) — `create:/read:einflussgroesse` (Pfad
    // `systemId`, Fachaktion-verzweigt s. `resolveViaSystem()`-Aufrufer) UND
    // `update:einflussgroesse` (Pfad `einflussgroesseId`,
    // `resolveViaEinflussgroesse()`). Trägt — wie jeder `entityTyp` — die
    // generischen DE-04-Attribute (`verarbeitungsStatus`/
    // `vonWissAuswertungAusgenommen`) für Zukunfts-/Konsistenz-Zwecke; die
    // AKTUELL WIRKSAME B10-Härtung (Auditor-Deny) braucht dieses Attribut
    // NICHT (eigene, resource-lose Regel, s. `PolicyAction`-Kommentar oben).
    | 'einflussgroesse'
    // ADR-0007 Teil B (B10) — `read:nachweis_preflight`/`read:einsparlauf`
    // mit Pfad-ID (`resolveViaPreflight()`/`resolveViaEinsparlauf()`,
    // Muster `resolveViaBerechnungslauf()`). AUSDRÜCKLICH OHNE
    // `endkundeId`/`verarbeitungsStatus`/`vonWissAuswertungAusgenommen`
    // (portfolioweite Aktion, KEIN Endkunden-Ressourcenbezug, B1/B10) — der
    // `entityTyp` allein trägt HEUTE keine `evaluate()`-Regel (analog
    // `einflussgroesse`s Kommentar oben: Existenz-/404-Zweck, kein
    // ABAC-Scoping).
    | 'preflight'
    | 'einsparlauf'
    // ADR-0007 Teil B (B10) STUFE 2 — `read:nachweis_export`/`read:
    // einreichung` mit Pfad-ID (`resolveViaNachweisExport()`/
    // `resolveViaEinreichung()`, GENAU ANALOG `preflight`/`einsparlauf`
    // oben: reines Existenz-/404-Signal, KEIN Endkunden-Ressourcenbezug).
    // `nachweisExport` trägt HEUTE keine `evaluate()`-Regel (die B10-
    // Härtung für `read:nachweis_export` ist eine resource-lose
    // Auditor-Deny-Regel, s. `PolicyAction`-Kommentar) — ebenso `einreichung`
    // (dort ist der generische Permit-Fallback die gesamte Kontrolle, RBAC
    // trägt den Rest).
    | 'nachweisExport'
    | 'einreichung';
  /** ADR-0008 §15 (D3) — Verarbeitungsstatus des Endkunden (D6-Eingabe). */
  readonly verarbeitungsStatus?: 'aktiv' | 'gesperrt' | 'geloescht';
  /** ADR-0008 §15 (D3) — DS-07-Innensicht-Signal (Rolle ≠ eigentuemer_selbstnutzer). */
  readonly anschlussnutzerAbweichtEndkunde?: boolean;
  /** ADR-0008 §16 (D4) — break-glass-Zweck, NUR bei `read:verbrauch_detail`. */
  readonly zugriffszweck?: ZugriffszweckAttribut;
  /**
   * ADR-0009 §2.2 — Vier-Augen-Zustand des aufgelösten Shred-Antrags, NUR bei
   * `shred:endkunde:freigeben`/`shred:endkunde:ablehnen`. Aufgelöst durch den
   * `StammdatenResourceAttributesProvider` über `params['antragId']` (höchste
   * Priorität in der Auflösungs-Kaskade) — der Provider verifiziert dabei
   * bereits `antrag.endkundeId === params.endkundeId` (Provider-Scoping,
   * ADR-0009 §2.4/§6); ein Scope-Mismatch erreicht den PDP gar nicht erst
   * (404 VOR der PDP-Auswertung), s. dortigen Kommentar.
   */
  readonly shredAntrag?: {
    readonly beantragtVonSub: string;
    readonly status: 'beantragt' | 'freigegeben' | 'abgelehnt' | 'ausgefuehrt' | 'abgelaufen';
  };
  /**
   * ADR-0005 §26.4 (D14) — Geraete-Zuordnungs-Attribut, NUR bei
   * `create:geraet_zuordnung`/`update:geraet_zuordnung`. `zaehlerId` ist die
   * Pseudonym-Referenz (LOGISCHER Verweis auf `energy.zaehler.id`, KEIN FK,
   * §26.1) — der PDP zieht auch hier KEINE PII (Linie 2). Deny-by-default
   * laeuft ueber die bestehende generische Schreibrecht-Logik (RBAC
   * `@Roles('betrieb')` + ABAC-Permit-Fallback), NICHT ueber ein eigenes
   * PDP-Sonderverfahren wie bei `read:verbrauch_detail`/`shred:endkunde:*`.
   */
  readonly geraetZuordnung?: {
    readonly zaehlerId: string;
  };
  /**
   * ADR-0005 §26.4 SEC-5 — Reverse-Aufloesungs-Attribut, NUR bei
   * `read:geraet_zuordnung`. Von `StammdatenResourceAttributesProvider`
   * ausschliesslich aus dem Request-BODY gelesen (`zweck`/`ticketRef`,
   * analog `zugriffszweck` aus Headern) PLUS der bereits vom Provider
   * berechneten Velocity/Quota-Auswertung (Audit-Trail-Zaehlung,
   * `GeraetReverseQuotaRepository`) — der PDP selbst bleibt dadurch
   * SYNCHRON/rein (kein eigener DB-Zugriff im `InCodePolicyAdapter`,
   * Separation of Concerns: Provider zieht Attribute, PDP entscheidet).
   * `zweck`/`ticketRef` sind bewusst UNGEPRUEFTE Rohwerte (Whitelist-/
   * Format-Pruefung ist PDP-Sache, `evaluateGeraetReverse()`) — NIEMALS
   * DevEUI/Blind-Index in diesem Attribut (RL-2).
   */
  readonly geraetReverse?: {
    readonly zweck?: string;
    readonly ticketRef?: string;
    readonly quotaUeberschritten: boolean;
  };
  /**
   * ADR-0010 D5 — Standort-Attribut, ausschliesslich bei den `standort`-/
   * `zaehler_standort`-Fachaktionen aufgeloest (`params['standortId']`,
   * `StammdatenResourceAttributesProvider.resolveViaStandort()`).
   * AUSSCHLIESSLICH Nicht-PII (`energy.standort`-Spalten) — der PDP zieht
   * auch hier KEINE PII (Linie 2): NIEMALS Label/Adresse in diesem Attribut.
   */
  readonly standort?: {
    readonly endkundeId: string;
    readonly typ: string;
    readonly ebene: number;
    readonly status: string;
  };
  /**
   * ADR-0006 Teil B (B8/B10) — Einflussgrößen-Attribut, NUR bei
   * `create:/read:/update:einflussgroesse` aufgelöst
   * (`StammdatenResourceAttributesProvider.resolveEinflussgroesseAttribut()`).
   * AUSSCHLIESSLICH Nicht-PII (`energy.system.endkunde_id`/`einfluss.
   * intervall.groesse_code`/`.betroffener_typ` — NIE `wert_num`/`wert_code`,
   * Linie 2): der PDP zieht auch hier KEINE PII. `groesseCode`/
   * `betroffenerTyp` sind bei `create:einflussgroesse` NUR verfügbar, wenn
   * der Request-BODY sie trägt (ungeprüfte Rohwerte, analog `geraetReverse.
   * zweck`/`.ticketRef`) — bei der Klartext-LISTE (`read:einflussgroesse`,
   * KEIN Body) und potenziell bei einem unvollständigen Erfassen-Body
   * bleiben sie `undefined`. Aktuell von KEINER `evaluate()`-Regel
   * konsultiert (die B10-Härtung ist eine resource-lose Auditor-Deny-Regel,
   * s. `PolicyAction`-Kommentar) — vorbereitet für eine KÜNFTIGE, feinere
   * ABAC-Policy (z. B. rollenabhängige Einschränkung einzelner
   * `groesseCode`-Werte oder zusätzliche Prüfschärfe bei
   * `betroffenerTyp=anschlussnutzer`), NICHT Teil dieses Arbeitspakets.
   */
  readonly einflussgroesse?: {
    readonly endkundeId: string;
    readonly systemId: string;
    readonly groesseCode?: string;
    readonly betroffenerTyp?: 'endkunde' | 'anschlussnutzer';
  };
}

/** Whitelisted, PII-freier Ablehnungsgrund (rote Linie 2 — kein Freitext). */
export type PolicyDenyReason =
  | 'rolle_fehlt'
  | 'auditor_schreibzugriff_verboten'
  | 'auswertung_ausgenommen'
  | 'kein_security_context'
  // ADR-0008 §16 (D4, PDP-Blocker 2) — break-glass deny-by-default-Gründe.
  | 'break_glass_erforderlich'
  | 'zweck_fehlt'
  | 'break_glass_grenzen_verletzt'
  // ADR-0009 §2.2 — Vier-Augen deny-by-default-Gründe für
  // `shred:endkunde:freigeben`/`shred:endkunde:ablehnen`.
  | 'vier_augen_selbstfreigabe_verboten'
  | 'shred_antrag_ungueltig'
  // ADR-0005 §26.4 SEC-5 — eigenständige break-glass-deny-by-default-Gründe
  // für `read:geraet_zuordnung` (Reverse-Auflösung). Bewusst EIGENE Codes,
  // keine Wiederverwendung von `zweck_fehlt`/`break_glass_grenzen_verletzt`
  // (SEC-5: eigenständige Härtung, keine Übernahme des verbrauch_detail-
  // Musters).
  | 'geraet_reverse_auditor_verboten'
  | 'geraet_reverse_rolle_fehlt'
  | 'geraet_reverse_ressource_ungueltig'
  | 'geraet_reverse_zweck_fehlt'
  | 'geraet_reverse_ticket_fehlt'
  | 'geraet_reverse_quota_ueberschritten'
  // ADR-0010 D5 — eigenstaendige Defense-in-Depth-Verstaerkung fuer
  // `read:standort_pii` (s. `PolicyAction`-Kommentar oben).
  | 'standort_pii_auditor_verboten'
  // ADR-0008 D12 (A5) — eigenstaendige Defense-in-Depth-Verstaerkung fuer
  // `read:endkunde_pii`, GENAU ANALOG `standort_pii_auditor_verboten`.
  | 'endkunde_pii_auditor_verboten'
  // ADR-0006 Teil B (B8/B10) — eigenstaendige Defense-in-Depth-Verstaerkung
  // fuer `read:einflussgroesse`, GENAU ANALOG `standort_pii_auditor_verboten`
  // (s. `PolicyAction`-Kommentar oben).
  | 'einflussgroesse_auditor_verboten'
  // ADR-0007 Teil B (B10) STUFE 2 — eigenstaendige Defense-in-Depth-
  // Verstaerkung fuer `read:nachweis_export`, GENAU ANALOG
  // `standort_pii_auditor_verboten`/`einflussgroesse_auditor_verboten` (s.
  // `PolicyAction`-Kommentar oben). `read:einreichung` bekommt AUSDRUECKLICH
  // KEINEN eigenen Grund (auditor-zugaenglich, B10).
  | 'nachweis_export_auditor_verboten';

export type PolicyPermitReason =
  | 'kein_ressourcenbezug'
  | 'default_permit_v1'
  | 'break_glass_permit'
  | 'geraet_reverse_permit';

export interface PolicyDecision {
  readonly effect: 'permit' | 'deny';
  readonly reason: PolicyDenyReason | PolicyPermitReason;
}

/**
 * ABAC-Policy-Decision-Point-Port (ADR-0002 Teil B §13, D3). v1-Adapter =
 * in-code (`InCodePolicyAdapter`); Engine-Wahl/Enforcement-Point-Anschluss
 * bleibt austauschbar (Ports & Adapters), ohne diesen Kontrakt zu ändern.
 * Grobgranulares RBAC (`@Roles`) ist bereits VOR diesem Aufruf im
 * `PolicyInterceptor` geprüft — der PDP deckt das ABAC-Fundament.
 *
 * Funktionswertige PROPERTY (statt Methoden-Kurzschreibweise) — vermeidet
 * `@typescript-eslint/unbound-method`-Rauschen beim Mocken in Tests, ohne
 * die Regel zu unterdrücken (ein PDP-Port hat keine `this`-Semantik).
 */
export interface PolicyDecisionPort {
  readonly evaluate: (
    subject: SecurityContext,
    action: PolicyAction,
    resource?: ResourceAttributes,
  ) => PolicyDecision | Promise<PolicyDecision>;
}
