import { Injectable } from '@nestjs/common';
import type { SecurityContext } from '../../common/security/security-context';
import { classifyAction } from './classify-action';
import { BREAK_GLASS_ZWECK_WHITELIST, MAX_FENSTER_TAGE } from './break-glass.constants';
import { isGeraetReverseZweckCode, isValidTicketRef } from './geraet-reverse.constants';
import type { PolicyAction, PolicyDecision, PolicyDecisionPort, ResourceAttributes } from './policy-decision-port';

/**
 * v1-PDP-Adapter (ADR-0002 Teil B §13, D3 Entscheidung (a); ADR-0008 §14/§16,
 * D2/D4 — zwei PDP-Blocker behoben, §30 Änderungsprotokoll): in-code
 * RBAC+ABAC-Auswertung, KEINE neue Dependency, KEIN Drittsystem.
 *
 * ADR-0006 Teil B (B8/B10, Einflussgrößen) ergänzt eine WEITERE
 * EIGENSTÄNDIGE DS-01-Verstärkung, GENAU ANALOG `read:standort_pii`
 * (ADR-0010 D5): `read:einflussgroesse` — `einfluss.intervall.wert_num`/
 * `.wert_code` sind Klartext-PII OHNE Verschlüsselung/Pseudonymisierung
 * (`migrations/V0020` D-ROLLE) — s. Reihenfolge-Schritt 1d unten.
 *
 * Grobgranulares RBAC (`@Roles`) ist bereits VOR diesem Aufruf durch den
 * `PolicyInterceptor` geprüft — dieser Adapter deckt das ABAC-Fundament
 * (Ressourcen-Attribute aus ADR-0004 §13.2/ADR-0008 §15) sowie:
 *   - eine DS-01-Verstärkung (Auditor bleibt strikt lesend, auch ABAC-seitig,
 *     Defense-in-Depth) — UNCONDITIONAL, auch ohne `resource` (ADR-0008 §14
 *     Pflicht-Regressionstest: "compliance-auditor × jede create/update/
 *     delete/shred-Aktion → deny"),
 *   - eine EIGENSTÄNDIGE DS-01-Verstärkung SPEZIELL für
 *     `read:geraet_zuordnung` (ADR-0005 §26.4 SEC-5): `classifyAction()`
 *     ordnet diese Aktion als `read` ein (die generische Regel oben greift
 *     also NICHT), die Reverse-DevEUI-Auflösung ist aber ein privilegierter
 *     Krypto-Zugriff, kein gewöhnliches Lesen — compliance-auditor bekommt
 *     daher eine EIGENE, explizite Deny-Regel (s. `policy-decision-port.ts`-
 *     Kommentar zur Wahl: eigene Regel statt `classifyAction()`-Änderung),
 *   - die break-glass-deny-by-default-Regel für `read:verbrauch_detail`
 *     (ADR-0008 §16, D4/PDP-Blocker 2) — VOR dem generischen
 *     `resource===undefined`-Permit-Kurzschluss, damit ein unvollständig
 *     aufgelöstes Zweck-Attribut NIE durchrutscht, und
 *   - die EIGENSTÄNDIGE break-glass-Härtung für `read:geraet_zuordnung`
 *     (ADR-0005 §26.4 SEC-5 — bewusst NICHT das `read:verbrauch_detail`-
 *     Muster wiederverwendet: eigene Rolle `geraete-support`, Ticket-Pflicht
 *     statt Zweck-Code, eigene Zweck-Whitelist, Punkt-Auflösung + Velocity/
 *     Quota statt Zeitraum-Fenster, s. `geraet-reverse.constants.ts`).
 *
 * Reihenfolge der Prüfungen ist FACHLICH BINDEND (ADR-0008 §14/§16/§30,
 * ADR-0009 §2.2, ADR-0005 §26.4 SEC-5) und darf nicht vertauscht werden:
 *   1. DS-01 (Auditor + Schreib-/Shred-Kategorie) → deny, IMMER zuerst.
 *   1b. SEC-5-DS-01: Auditor × `read:geraet_zuordnung` → deny, EBENFALLS vor
 *       jedem generischen Kurzschluss (selbst wenn — Fehlkonfiguration —
 *       zusätzlich `geraete-support` zugewiesen wäre).
 *   1c. ADR-0010 D5: Auditor × `read:standort_pii` → deny.
 *   1d. ADR-0006 Teil B (B8/B10): Auditor × `read:einflussgroesse` → deny,
 *       GENAU ANALOG 1c (resource-los, kein Break-glass).
 *   1e. ADR-0007 Teil B (B10) STUFE 2: Auditor × `read:nachweis_export` →
 *       deny, GENAU ANALOG 1c/1d (resource-los, kein Break-glass).
 *       `read:einreichung` bekommt AUSDRUECKLICH KEINE analoge Regel.
 *   2. break-glass-Deny-by-default für `read:verbrauch_detail` → deny/permit,
 *      VOR dem generischen `resource===undefined`-Kurzschluss.
 *   3. ADR-0009 §2.2 — Vier-Augen-Deny-by-default für
 *      `shred:endkunde:freigeben`/`shred:endkunde:ablehnen` → deny/permit,
 *      EBENFALLS vor dem generischen `resource===undefined`-Kurzschluss
 *      (analog break-glass — ein fehlendes/unvollständig aufgelöstes
 *      Shred-Antrag-Attribut darf NIE als "kein Ressourcenbezug" durchrutschen).
 *   3b. SEC-5 — break-glass-Deny-by-default für `read:geraet_zuordnung` →
 *       deny/permit, EBENFALLS vor dem generischen Kurzschluss.
 *   4. `resource === undefined` → permit (kein Fach-Endpoint ohne
 *      `StammdatenResourceAttributesProvider` liefert in v1 reale Attribute
 *      für Auth-Routen, A2 aus ADR-0002).
 *   5. DE-04 (`vonWissAuswertungAusgenommen`).
 *   6. genereller Permit-Fallback.
 */
@Injectable()
export class InCodePolicyAdapter implements PolicyDecisionPort {
  evaluate(subject: SecurityContext, action: PolicyAction, resource?: ResourceAttributes): PolicyDecision {
    // (1) DS-01-Verstärkung: compliance-auditor bleibt strikt lesend, auch
    // wenn eine RBAC-Rollenprüfung das (fehlerhaft) zugelassen hätte. NIE
    // per Literalvergleich (PDP-Blocker 1, ADR-0008 §14) — `classifyAction()`
    // erkennt auch die additiven Fachaktionen (`create:*`/`update:*`/
    // `delete:*`/`shred:*`) korrekt als Nicht-`read`.
    if (subject.roles.includes('compliance-auditor') && classifyAction(action) !== 'read') {
      return { effect: 'deny', reason: 'auditor_schreibzugriff_verboten' };
    }

    // (1b) SEC-5 (ADR-0005 §26.4) — EIGENSTÄNDIGE DS-01-Verstärkung für
    // `read:geraet_zuordnung`: `classifyAction()` stuft dies als `read` ein,
    // die generische Regel (1) greift daher NICHT. Explizite, eigene Regel
    // statt einer Änderung an `classifyAction()`/der generischen DS-01-Regel
    // (die würde ALLE `read:*`-Aktionen für den Auditor mit-blockieren, s.
    // `policy-decision-port.ts`-Kommentar zur Entscheidung).
    if (subject.roles.includes('compliance-auditor') && action === 'read:geraet_zuordnung') {
      return { effect: 'deny', reason: 'geraet_reverse_auditor_verboten' };
    }

    // (1c) ADR-0010 D5 — EIGENSTAENDIGE DS-01-Verstaerkung fuer
    // `read:standort_pii`: `classifyAction()` stuft dies als `read` ein, die
    // generische Regel (1) greift daher NICHT. `compliance-auditor` soll
    // Standort-PII-Klartext (Label/Adresse) strukturell NIE sehen —
    // konsistent mit `PiiProjektionsPolicy` (dort ebenfalls IMMER maskiert
    // fuer diese Rolle). Anders als bei `read:geraet_zuordnung` (SEC-5) ist
    // dies laut ADR-0010 D5 AUSDRUECKLICH KEIN Break-glass ("Adresslesen ist
    // Alltagsbetrieb") — trotzdem bleibt die Rolle strukturell ausgeschlossen
    // (RBAC `@Roles('betrieb')` am Controller UND diese PDP-Verstaerkung,
    // Defense-in-Depth).
    if (subject.roles.includes('compliance-auditor') && action === 'read:standort_pii') {
      return { effect: 'deny', reason: 'standort_pii_auditor_verboten' };
    }

    // (1c') ADR-0008 D12 Auflage A5 — EIGENSTAENDIGE DS-01-Verstaerkung fuer
    // `read:endkunde_pii`, exakt nach dem Muster von (1c): `classifyAction()`
    // stuft dies als `read` ein, die generische Regel (1) greift daher NICHT.
    // `compliance-auditor` soll Endkunden-Klartextnamen strukturell NIE sehen
    // — konsistent mit `PiiProjektionsPolicy`, die fuer diese Rolle IMMER
    // maskiert. Wie bei (1c) AUSDRUECKLICH KEIN Break-glass (A8: der Name ist
    // ein Stammdatum, das `betrieb` als Dauerrecht hat), aber die Rolle bleibt
    // strukturell ausgeschlossen: RBAC `@Roles('betrieb')` am Controller UND
    // diese PDP-Verstaerkung.
    //
    // A5 zaehlt zu den NICHT verhandelbaren Auflagen, weil das Versagen hier
    // binaer ist: Ohne diese Regel laesst ein vergessenes `@Roles` den Auditor
    // auf die Route.
    if (subject.roles.includes('compliance-auditor') && action === 'read:endkunde_pii') {
      return { effect: 'deny', reason: 'endkunde_pii_auditor_verboten' };
    }

    // (1d) ADR-0006 Teil B (B8/B10) — EIGENSTAENDIGE DS-01-Verstaerkung fuer
    // `read:einflussgroesse`: `classifyAction()` stuft dies als `read` ein,
    // die generische Regel (1) greift daher NICHT. GENAU ANALOG (1c)
    // `read:standort_pii` — `wert_num`/`wert_code` (`einfluss.intervall`)
    // sind Klartext-PII OHNE Verschluesselung/Pseudonymisierung (V0020
    // D-ROLLE) und sollen `compliance-auditor` strukturell NIE erreichen
    // (RBAC `@Roles('betrieb')` an BEIDEN `read:einflussgroesse`-Routen UND
    // diese PDP-Verstaerkung, Defense-in-Depth). Resource-LOS (kein
    // `resource.einflussgroesse`-Zugriff noetig) — B10 verlangt hier KEIN
    // Break-glass/keine Zweckpflicht, nur ein hartes Auditor-Deny.
    if (subject.roles.includes('compliance-auditor') && action === 'read:einflussgroesse') {
      return { effect: 'deny', reason: 'einflussgroesse_auditor_verboten' };
    }

    // (1e) ADR-0007 Teil B (B10) STUFE 2 — EIGENSTAENDIGE DS-01-Verstaerkung
    // fuer `read:nachweis_export`: `classifyAction()` stuft dies als `read`
    // ein, die generische Regel (1) greift daher NICHT. GENAU ANALOG (1c)/
    // (1d) — die ausgelieferten Dateien tragen Tages-Detailwerte
    // (`read:verbrauch_detail`-Niveau) UND die Einflussgroessen-Projektion;
    // `compliance-auditor` soll sie strukturell NIE sehen (RBAC
    // `@Roles('betrieb')` an BEIDEN `read:nachweis_export`-Routen UND diese
    // PDP-Verstaerkung, Defense-in-Depth). Resource-los (kein
    // `resource.nachweisExport`-Zugriff noetig). `read:einreichung`
    // bekommt AUSDRUECKLICH KEINE analoge Regel — B10: „die Metadaten sind
    // sein Pruefgegenstand, nicht sein Risiko".
    if (subject.roles.includes('compliance-auditor') && action === 'read:nachweis_export') {
      return { effect: 'deny', reason: 'nachweis_export_auditor_verboten' };
    }

    // (2) PDP-Blocker 2 (ADR-0008 §16/§30): deny-by-default für
    // read:verbrauch_detail VOR dem generischen permit-Fallback/-Kurzschluss.
    if (this.istVerbrauchDetailZugriff(action, resource)) {
      return this.evaluateBreakGlass(resource);
    }

    // (3) ADR-0009 §2.2 — Vier-Augen-Deny-by-default für
    // shred:endkunde:freigeben/:ablehnen, EBENFALLS vor dem generischen
    // resource===undefined-Kurzschluss (s. Klassen-Dok oben).
    if (this.istShredFreigabeOderAblehnung(action)) {
      return this.evaluateShredFreigabe(subject, resource);
    }

    // (3b) SEC-5 (ADR-0005 §26.4) — EIGENSTÄNDIGE break-glass-Härtung für
    // read:geraet_zuordnung, EBENFALLS vor dem generischen
    // resource===undefined-Kurzschluss.
    if (action === 'read:geraet_zuordnung') {
      return this.evaluateGeraetReverse(subject, resource);
    }

    if (resource === undefined) {
      return { effect: 'permit', reason: 'kein_ressourcenbezug' };
    }

    // (5) ADR-0004 §13.2 Fundament (DE-04): Detailverbrauch, von
    // wissenschaftlicher Auswertung ausgenommen, Zugreifender ist weder
    // Owner noch betrieb/admin -> deny. `classifyAction()` statt
    // `action==='read'` (PDP-Blocker 1) — feuert jetzt korrekt auch für
    // `read:stammdaten`/`read:monitoring` (ADR-0008 §14 Pflicht-Regressionstest).
    if (
      resource.vonWissAuswertungAusgenommen === true &&
      classifyAction(action) === 'read' &&
      resource.ownerSub !== subject.sub &&
      !subject.roles.includes('betrieb') &&
      !subject.roles.includes('admin')
    ) {
      return { effect: 'deny', reason: 'auswertung_ausgenommen' };
    }

    return { effect: 'permit', reason: 'default_permit_v1' };
  }

  /**
   * ADR-0008 §16: `read:verbrauch_detail` selbst ODER jede `read`-kategorisierte
   * Aktion auf einer als `entityTyp==='verbrauch'` aufgelösten Ressource
   * (Verteidigung gegen künftige, anders benannte Fachaktionen auf demselben
   * Entitätstyp — s. `StammdatenResourceAttributesProvider`).
   */
  private istVerbrauchDetailZugriff(action: PolicyAction, resource?: ResourceAttributes): boolean {
    if (action === 'read:verbrauch_detail') {
      return true;
    }

    return classifyAction(action) === 'read' && resource?.entityTyp === 'verbrauch';
  }

  /**
   * ADR-0008 §16 (D4, PDP-Blocker 2). Default = deny
   * (`break_glass_erforderlich`, wenn gar keine Ressourcen-Attribute
   * vorliegen — kein Provider-Treffer). Ein unvollständig aufgelöstes
   * Zweck-Attribut (fehlender/kaputter Header, Zweck-Code außerhalb der
   * Whitelist, fehlende `zaehlerId`) → `zweck_fehlt`. Ein vollständig
   * aufgelöster, aber zu weites Zeitfenster überschreitender Zweck →
   * `break_glass_grenzen_verletzt`. NUR ein vollständig aufgelöster,
   * whitelisted, fenster-konformer Zweck → `permit` (der Aufrufer/Controller
   * ist dafür verantwortlich, den `permit`-Fall ZUSÄTZLICH zu auditieren,
   * §16: "Auch der permit-Fall wird auditiert").
   */
  private evaluateBreakGlass(resource?: ResourceAttributes): PolicyDecision {
    if (resource === undefined) {
      return { effect: 'deny', reason: 'break_glass_erforderlich' };
    }

    const zweck = resource.zugriffszweck;
    if (
      zweck === undefined ||
      !(BREAK_GLASS_ZWECK_WHITELIST as readonly string[]).includes(zweck.zweckCode) ||
      zweck.zaehlerId.trim().length === 0
    ) {
      return { effect: 'deny', reason: 'zweck_fehlt' };
    }

    const fensterTage = this.berechneFensterTage(zweck.vonTs, zweck.bisTs);
    if (fensterTage === undefined || fensterTage < 0 || fensterTage > MAX_FENSTER_TAGE) {
      return { effect: 'deny', reason: 'break_glass_grenzen_verletzt' };
    }

    return { effect: 'permit', reason: 'break_glass_permit' };
  }

  /** ADR-0009 §2.2 — trifft NUR auf die beiden neuen Vier-Augen-Aktionen zu. */
  private istShredFreigabeOderAblehnung(action: PolicyAction): boolean {
    return action === 'shred:endkunde:freigeben' || action === 'shred:endkunde:ablehnen';
  }

  /**
   * ADR-0009 §2.2 (verbindliche Prüfreihenfolge):
   *   1. `resource===undefined` oder `resource.shredAntrag===undefined` →
   *      deny (`shred_antrag_ungueltig`). Strukturell sollte dies bei einer
   *      `antragId`-Route NIE eintreten (der `StammdatenResourceAttributes-
   *      Provider` löst `shredAntrag` immer auf oder wirft selbst ein
   *      404-Scope-Mismatch VOR dieser PDP-Auswertung, ADR-0009 §2.4/§6) —
   *      dieser Zweig ist ein reiner Fail-closed-Backstop.
   *   2. `status !== 'beantragt'` → deny (`shred_antrag_ungueltig`, bereits
   *      entschieden/abgelaufen — die eigentliche 409-Behandlung für einen
   *      TOCTOU-Race läuft zusätzlich transaktional im Service, s.
   *      `ShredAntragRepository.freigeben()`/`.ablehnen()`).
   *   3. `beantragtVonSub === subject.sub` → deny
   *      (`vier_augen_selbstfreigabe_verboten`).
   *   4. sonst → permit.
   */
  private evaluateShredFreigabe(subject: SecurityContext, resource?: ResourceAttributes): PolicyDecision {
    const antrag = resource?.shredAntrag;
    if (antrag === undefined) {
      return { effect: 'deny', reason: 'shred_antrag_ungueltig' };
    }

    if (antrag.status !== 'beantragt') {
      return { effect: 'deny', reason: 'shred_antrag_ungueltig' };
    }

    if (antrag.beantragtVonSub === subject.sub) {
      return { effect: 'deny', reason: 'vier_augen_selbstfreigabe_verboten' };
    }

    return { effect: 'permit', reason: 'default_permit_v1' };
  }

  /**
   * ADR-0005 §26.4 SEC-5 — EIGENSTÄNDIGE break-glass-Härtung für
   * `read:geraet_zuordnung` (Reverse-Auflösung Blind-Index/Zeile → Klartext-
   * DevEUI). Verbindliche Prüfreihenfolge (SEC-5 (a)–(d), s.
   * `geraet-reverse.constants.ts`):
   *   (a) `subject.roles` enthält `geraete-support` — PDP-seitige
   *       Verstärkung ZUSÄTZLICH zur RBAC-Gate (`@Roles('geraete-support')`
   *       am Controller) — Defense-in-Depth, PDP ist NIE allein auf die
   *       vorgelagerte Schicht angewiesen (analog `ShredAntragService`).
   *   Ressourcen-Scoping: `resource.geraetZuordnung` fehlt (Zuordnung nicht
   *       gefunden/nicht aufgelöst) → deny (fail-closed, analog
   *       `evaluateBreakGlass` bei fehlender Ressource — KEIN Durchrutschen
   *       zu einem 404-erst-im-Service).
   *   (c) `resource.geraetReverse.zweck` fehlt ODER nicht in
   *       `GERAET_REVERSE_ZWECK_WHITELIST` → deny.
   *   (b) `resource.geraetReverse.ticketRef` fehlt ODER entspricht nicht
   *       `TICKET_REF_FORMAT` → deny.
   *   (d) `resource.geraetReverse.quotaUeberschritten === true` (vom
   *       Provider bereits per Audit-Trail-Zählung berechnet) → deny.
   *   sonst → permit (`geraet_reverse_permit`). Echtzeit-Alert (SEC-5 (e))
   *   ist NICHT PDP-Sache (reine, synchron auswertbare Entscheidungslogik
   *   bleibt hier) — der Aufrufer (`DeviceReverseAufloesungService`, NUR
   *   auf dem `permit`-Pfad erreichbar) feuert den Alert.
   */
  private evaluateGeraetReverse(subject: SecurityContext, resource?: ResourceAttributes): PolicyDecision {
    if (!subject.roles.includes('geraete-support')) {
      return { effect: 'deny', reason: 'geraet_reverse_rolle_fehlt' };
    }

    if (resource?.geraetZuordnung === undefined) {
      return { effect: 'deny', reason: 'geraet_reverse_ressource_ungueltig' };
    }

    const reverse = resource.geraetReverse;
    if (reverse?.zweck === undefined || !isGeraetReverseZweckCode(reverse.zweck)) {
      return { effect: 'deny', reason: 'geraet_reverse_zweck_fehlt' };
    }

    if (reverse.ticketRef === undefined || !isValidTicketRef(reverse.ticketRef)) {
      return { effect: 'deny', reason: 'geraet_reverse_ticket_fehlt' };
    }

    if (reverse.quotaUeberschritten) {
      return { effect: 'deny', reason: 'geraet_reverse_quota_ueberschritten' };
    }

    return { effect: 'permit', reason: 'geraet_reverse_permit' };
  }

  private berechneFensterTage(vonTs: string, bisTs: string): number | undefined {
    const von = Date.parse(vonTs);
    const bis = Date.parse(bisTs);

    if (Number.isNaN(von) || Number.isNaN(bis)) {
      return undefined;
    }

    return (bis - von) / (1000 * 60 * 60 * 24);
  }
}
