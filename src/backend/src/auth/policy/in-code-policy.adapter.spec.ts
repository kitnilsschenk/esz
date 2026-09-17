import { describe, expect, it } from 'vitest';
import { InCodePolicyAdapter } from './in-code-policy.adapter';
import type { SecurityContext } from '../../common/security/security-context';

function subject(overrides: Partial<SecurityContext> = {}): SecurityContext {
  return {
    sub: 'sub-1',
    actorTyp: 'benutzer',
    roles: ['betrieb'],
    azp: 'edms-bff',
    ...overrides,
  };
}

/**
 * M6 (ADR-0002): "Policy-Interface + Attribut-Durchleitung nachgewiesen" —
 * dieser Test belegt, dass der v1-PDP die ADR-0004-§13.2-Attribute
 * (`nutzungsverhaeltnis`, `datenklasse`, `von_wiss_auswertung_ausgenommen`)
 * konsumiert und unit-testbar ist, AUCH OHNE einen scharfen
 * Portal-Enforcement-Point (A2).
 */
describe('InCodePolicyAdapter (ADR-0002 Teil B §13, D3 — v1-Fundament)', () => {
  const adapter = new InCodePolicyAdapter();

  it('erlaubt ohne Ressourcenbezug (kein Fach-Endpoint liefert in v1 reale Attribute)', () => {
    const decision = adapter.evaluate(subject(), 'read');
    expect(decision).toEqual({ effect: 'permit', reason: 'kein_ressourcenbezug' });
  });

  it('DS-01: compliance-auditor bleibt strikt lesend, auch ABAC-seitig verstärkt', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'write', {
      datenklasse: 'abrechnungsminimum',
    });
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toBe('auditor_schreibzugriff_verboten');
  });

  it('compliance-auditor darf weiterhin lesen', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read', {
      datenklasse: 'abrechnungsminimum',
    });
    expect(decision.effect).toBe('permit');
  });

  it('DS-07-Fundament: Detailverbrauch mit Auswertungsausschluss wird für Fremde ohne Rolle abgelehnt', () => {
    const decision = adapter.evaluate(subject({ sub: 'anderer-sub', roles: [] }), 'read', {
      datenklasse: 'detailverbrauch',
      vonWissAuswertungAusgenommen: true,
      ownerSub: 'owner-sub',
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'auswertung_ausgenommen' });
  });

  it('DS-07-Fundament: der Owner selbst darf trotz Auswertungsausschluss lesen', () => {
    const decision = adapter.evaluate(subject({ sub: 'owner-sub', roles: [] }), 'read', {
      datenklasse: 'detailverbrauch',
      vonWissAuswertungAusgenommen: true,
      ownerSub: 'owner-sub',
    });
    expect(decision.effect).toBe('permit');
  });

  it('DS-07-Fundament: betrieb/admin dürfen trotz Auswertungsausschluss lesen (operativer Zugriff)', () => {
    const decision = adapter.evaluate(subject({ sub: 'anderer-sub', roles: ['betrieb'] }), 'read', {
      datenklasse: 'detailverbrauch',
      vonWissAuswertungAusgenommen: true,
      ownerSub: 'owner-sub',
    });
    expect(decision.effect).toBe('permit');
  });

  it('Abrechnungsminimum ohne Auswertungsausschluss bleibt erlaubt', () => {
    const decision = adapter.evaluate(subject({ roles: [] }), 'read', {
      datenklasse: 'abrechnungsminimum',
      vonWissAuswertungAusgenommen: false,
    });
    expect(decision.effect).toBe('permit');
  });
});

/**
 * ADR-0008 §14/§30 — PDP-Blocker 1 (Literalvergleich-Falle) behoben:
 * Pflicht-Regressionstests laut ADR-Wortlaut.
 */
describe('InCodePolicyAdapter — PDP-Blocker 1 (ADR-0008 §14, Literalvergleich-Falle behoben)', () => {
  const adapter = new InCodePolicyAdapter();

  it('compliance-auditor × read:stammdaten (GET /endkunden/{id}) → permit, NICHT als Schreibzugriff abgelehnt', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:stammdaten', {
      entityTyp: 'endkunde',
      verarbeitungsStatus: 'aktiv',
    });
    expect(decision.effect).toBe('permit');
  });

  it('DE-04-Ausnahme feuert bei read:stammdaten (vormals: feuerte nie mehr wegen Literalvergleich)', () => {
    const decision = adapter.evaluate(subject({ sub: 'anderer-sub', roles: [] }), 'read:stammdaten', {
      entityTyp: 'endkunde',
      vonWissAuswertungAusgenommen: true,
      ownerSub: 'owner-sub',
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'auswertung_ausgenommen' });
  });

  it.each([
    'create:endkunde',
    'update:endkunde',
    'sperren:endkunde',
    'shred:endkunde',
    'create:system',
    'update:zaehler',
    'delete:zaehler',
    'create:messkanal',
    'shred:anschlussnutzer',
  ] as const)('compliance-auditor × %s → deny (auditor_schreibzugriff_verboten)', (action) => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), action, {
      entityTyp: 'endkunde',
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'auditor_schreibzugriff_verboten' });
  });

  it('compliance-auditor × create:endkunde OHNE Ressourcen-Attribut → dennoch deny (unconditional, nicht vom resource===undefined-Kurzschluss überholt)', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'create:endkunde');
    expect(decision).toEqual({ effect: 'deny', reason: 'auditor_schreibzugriff_verboten' });
  });
});

/**
 * ADR-0008 §16/§30 — PDP-Blocker 2 (Fallback "permit by default" für
 * break-glass) behoben: deny-by-default für `read:verbrauch_detail` VOR dem
 * generischen permit-Fallback. M2-Pflicht-Unit-Tests laut ADR-Wortlaut:
 * fehlender Zweck → deny; überzogenes Fenster → deny; vollständiger Zweck →
 * permit (+ Audit, Controller-/Interceptor-Verantwortung, hier nicht Teil
 * des PDP-Unit-Tests).
 */
describe('InCodePolicyAdapter — PDP-Blocker 2 (ADR-0008 §16, break-glass deny-by-default)', () => {
  const adapter = new InCodePolicyAdapter();
  const betrieb = subject({ roles: ['betrieb'] });

  it('read:verbrauch_detail OHNE jegliche Ressourcen-Attribute → deny (break_glass_erforderlich, NICHT permit)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail');
    expect(decision).toEqual({ effect: 'deny', reason: 'break_glass_erforderlich' });
  });

  it('read:verbrauch_detail mit fehlendem Zweck-Header (kein zugriffszweck aufgelöst) → deny (zweck_fehlt)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail', { entityTyp: 'verbrauch' });
    expect(decision).toEqual({ effect: 'deny', reason: 'zweck_fehlt' });
  });

  it('read:verbrauch_detail mit nicht-whitelisted Zweck-Code → deny (zweck_fehlt)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail', {
      entityTyp: 'verbrauch',
      zugriffszweck: {
        zweckCode: 'neugier',
        zaehlerId: 'zaehler-1',
        vonTs: '2026-07-01T00:00:00.000Z',
        bisTs: '2026-07-02T00:00:00.000Z',
      },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'zweck_fehlt' });
  });

  it('read:verbrauch_detail mit fehlender zaehlerId → deny (zweck_fehlt)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail', {
      entityTyp: 'verbrauch',
      zugriffszweck: {
        zweckCode: 'stoerungsdiagnose',
        zaehlerId: '   ',
        vonTs: '2026-07-01T00:00:00.000Z',
        bisTs: '2026-07-02T00:00:00.000Z',
      },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'zweck_fehlt' });
  });

  it('read:verbrauch_detail mit überzogenem Zeitfenster (> MAX_FENSTER_TAGE) → deny (break_glass_grenzen_verletzt)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail', {
      entityTyp: 'verbrauch',
      zugriffszweck: {
        zweckCode: 'stoerungsdiagnose',
        zaehlerId: 'zaehler-1',
        vonTs: '2026-07-01T00:00:00.000Z',
        bisTs: '2026-07-10T00:00:00.000Z',
      },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'break_glass_grenzen_verletzt' });
  });

  it('read:verbrauch_detail mit invertiertem Zeitfenster (bis < von) → deny (break_glass_grenzen_verletzt)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail', {
      entityTyp: 'verbrauch',
      zugriffszweck: {
        zweckCode: 'stoerungsdiagnose',
        zaehlerId: 'zaehler-1',
        vonTs: '2026-07-02T00:00:00.000Z',
        bisTs: '2026-07-01T00:00:00.000Z',
      },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'break_glass_grenzen_verletzt' });
  });

  it('read:verbrauch_detail mit vollständig aufgelöstem, whitelisted, fenster-konformem Zweck → permit (break_glass_permit)', () => {
    const decision = adapter.evaluate(betrieb, 'read:verbrauch_detail', {
      entityTyp: 'verbrauch',
      zugriffszweck: {
        zweckCode: 'stoerungsdiagnose',
        zaehlerId: 'zaehler-1',
        vonTs: '2026-07-01T00:00:00.000Z',
        bisTs: '2026-07-03T00:00:00.000Z',
      },
    });
    expect(decision).toEqual({ effect: 'permit', reason: 'break_glass_permit' });
  });

  it('read:verbrauch_detail via entityTyp==="verbrauch" (nicht das exakte Aktions-Literal) wird ebenfalls als break-glass-pflichtig erkannt', () => {
    // istVerbrauchDetailZugriff() erkennt auch eine generische 'read'-Aktion
    // auf einer als entityTyp==='verbrauch' aufgelösten Ressource.
    const decision = adapter.evaluate(betrieb, 'read', { entityTyp: 'verbrauch' });
    expect(decision.effect).toBe('deny');
  });
});

/**
 * ADR-0009 §2.2 — Vier-Augen-Deny-by-default für
 * `shred:endkunde:freigeben`/`shred:endkunde:ablehnen`. Pflicht-Unit-Tests
 * laut ADR-Wortlaut: resource/shredAntrag fehlt → deny (fail-closed
 * Backstop); Status ≠ 'beantragt' → deny; Selbstfreigabe → deny; sonst
 * permit. Symmetrisch für beide Aktionen (dieselbe PDP-Prüfung).
 */
describe('InCodePolicyAdapter — ADR-0009 §2.2 (Vier-Augen-Krypto-Shredding-Freigabe/-Ablehnung)', () => {
  const adapter = new InCodePolicyAdapter();
  const antragsteller = subject({ sub: 'antragsteller-sub', roles: ['betrieb'] });
  const zweitePerson = subject({ sub: 'zweite-person-sub', roles: ['betrieb'] });

  it.each(['shred:endkunde:freigeben', 'shred:endkunde:ablehnen'] as const)(
    '%s OHNE jegliche Ressourcen-Attribute → deny (shred_antrag_ungueltig, Fail-closed-Backstop, NICHT permit)',
    (action) => {
      const decision = adapter.evaluate(zweitePerson, action);
      expect(decision).toEqual({ effect: 'deny', reason: 'shred_antrag_ungueltig' });
    },
  );

  it.each(['shred:endkunde:freigeben', 'shred:endkunde:ablehnen'] as const)(
    '%s mit resource OHNE shredAntrag-Attribut → deny (shred_antrag_ungueltig)',
    (action) => {
      const decision = adapter.evaluate(zweitePerson, action, { entityTyp: 'endkunde' });
      expect(decision).toEqual({ effect: 'deny', reason: 'shred_antrag_ungueltig' });
    },
  );

  it.each(['shred:endkunde:freigeben', 'shred:endkunde:ablehnen'] as const)(
    '%s auf einem bereits entschiedenen/abgelaufenen Antrag (status != beantragt) → deny (shred_antrag_ungueltig)',
    (action) => {
      const decision = adapter.evaluate(zweitePerson, action, {
        shredAntrag: { beantragtVonSub: 'antragsteller-sub', status: 'ausgefuehrt' },
      });
      expect(decision).toEqual({ effect: 'deny', reason: 'shred_antrag_ungueltig' });
    },
  );

  it.each(['shred:endkunde:freigeben', 'shred:endkunde:ablehnen'] as const)(
    '%s: Selbstfreigabe/-ablehnung (beantragtVonSub === subject.sub) → deny (vier_augen_selbstfreigabe_verboten)',
    (action) => {
      const decision = adapter.evaluate(antragsteller, action, {
        shredAntrag: { beantragtVonSub: 'antragsteller-sub', status: 'beantragt' },
      });
      expect(decision).toEqual({ effect: 'deny', reason: 'vier_augen_selbstfreigabe_verboten' });
    },
  );

  it.each(['shred:endkunde:freigeben', 'shred:endkunde:ablehnen'] as const)(
    '%s: eine ANDERE Person als der Antragsteller, Antrag im Status beantragt → permit',
    (action) => {
      const decision = adapter.evaluate(zweitePerson, action, {
        shredAntrag: { beantragtVonSub: 'antragsteller-sub', status: 'beantragt' },
      });
      expect(decision).toEqual({ effect: 'permit', reason: 'default_permit_v1' });
    },
  );

  it('DS-01 greift weiterhin zuerst: compliance-auditor × shred:endkunde:freigeben → deny (auditor_schreibzugriff_verboten), NICHT shred_antrag_ungueltig', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'shred:endkunde:freigeben', {
      shredAntrag: { beantragtVonSub: 'antragsteller-sub', status: 'beantragt' },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'auditor_schreibzugriff_verboten' });
  });
});

/**
 * ADR-0005 §26.4 SEC-5 — EIGENSTÄNDIGE break-glass-Härtung für
 * `read:geraet_zuordnung` (Reverse-Auflösung Blind-Index/Zeile → Klartext-
 * DevEUI). Pflicht-Regressionstests je Einzelbedingung (a)-(d) + Auditor-
 * Backstop + Ressourcen-Scoping.
 */
describe('InCodePolicyAdapter — ADR-0005 §26.4 SEC-5 (read:geraet_zuordnung, Reverse-Aufloesung)', () => {
  const adapter = new InCodePolicyAdapter();
  const geraeteSupport = subject({ sub: 'support-sub', roles: ['geraete-support'] });

  function vollstaendigeRessource(overrides: {
    readonly zweck?: string;
    readonly ticketRef?: string;
    readonly quotaUeberschritten?: boolean;
  } = {}) {
    return {
      geraetZuordnung: { zaehlerId: 'zaehler-1' },
      geraetReverse: {
        zweck: overrides.zweck ?? 'geraete_stoerungsdiagnose',
        ticketRef: overrides.ticketRef ?? 'HD-1234',
        quotaUeberschritten: overrides.quotaUeberschritten ?? false,
      },
    };
  }

  it('vollstaendig gueltig (Rolle geraete-support + whitelisted Zweck + gueltiges Ticket + Quota frei) → permit (geraet_reverse_permit)', () => {
    const decision = adapter.evaluate(geraeteSupport, 'read:geraet_zuordnung', vollstaendigeRessource());
    expect(decision).toEqual({ effect: 'permit', reason: 'geraet_reverse_permit' });
  });

  it('(a) OHNE Rolle geraete-support (z. B. betrieb) → deny (geraet_reverse_rolle_fehlt), auch mit sonst vollstaendiger Ressource', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:geraet_zuordnung', vollstaendigeRessource());
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_rolle_fehlt' });
  });

  it('Ressourcen-Scoping: resource===undefined → deny (geraet_reverse_ressource_ungueltig), NICHT permit (fail-closed, kein Durchrutschen zu kein_ressourcenbezug)', () => {
    const decision = adapter.evaluate(geraeteSupport, 'read:geraet_zuordnung');
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_ressource_ungueltig' });
  });

  it('Ressourcen-Scoping: resource.geraetZuordnung fehlt (Zuordnung nicht gefunden) → deny (geraet_reverse_ressource_ungueltig)', () => {
    const decision = adapter.evaluate(geraeteSupport, 'read:geraet_zuordnung', { entityTyp: 'zaehler' });
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_ressource_ungueltig' });
  });

  it('(c) fehlender Zweck (geraetReverse nicht aufgeloest) → deny (geraet_reverse_zweck_fehlt)', () => {
    const decision = adapter.evaluate(geraeteSupport, 'read:geraet_zuordnung', {
      geraetZuordnung: { zaehlerId: 'zaehler-1' },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_zweck_fehlt' });
  });

  it('(c) nicht-whitelisted Zweck (z. B. "neugier", unabhaengig von BREAK_GLASS_ZWECK_WHITELIST) → deny (geraet_reverse_zweck_fehlt)', () => {
    const decision = adapter.evaluate(
      geraeteSupport,
      'read:geraet_zuordnung',
      vollstaendigeRessource({ zweck: 'stoerungsdiagnose' }), // gehoert zu BREAK_GLASS_ZWECK_WHITELIST, NICHT zu GERAET_REVERSE_ZWECK_WHITELIST
    );
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_zweck_fehlt' });
  });

  it('(b) fehlendes ticketRef → deny (geraet_reverse_ticket_fehlt)', () => {
    const decision = adapter.evaluate(geraeteSupport, 'read:geraet_zuordnung', {
      geraetZuordnung: { zaehlerId: 'zaehler-1' },
      geraetReverse: { zweck: 'geraete_stoerungsdiagnose', quotaUeberschritten: false },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_ticket_fehlt' });
  });

  it('(b) ungueltiges ticketRef-Format (Freitext statt GROSSBUCHSTABEN-ZIFFERN) → deny (geraet_reverse_ticket_fehlt)', () => {
    const decision = adapter.evaluate(
      geraeteSupport,
      'read:geraet_zuordnung',
      vollstaendigeRessource({ ticketRef: 'bitte kurz nachschauen' }),
    );
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_ticket_fehlt' });
  });

  it('(d) Quota ueberschritten (vom Provider bereits berechnet) → deny (geraet_reverse_quota_ueberschritten)', () => {
    const decision = adapter.evaluate(
      geraeteSupport,
      'read:geraet_zuordnung',
      vollstaendigeRessource({ quotaUeberschritten: true }),
    );
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_quota_ueberschritten' });
  });

  it('compliance-auditor → deny (geraet_reverse_auditor_verboten), IMMER, auch mit sonst vollstaendiger Ressource', () => {
    const decision = adapter.evaluate(
      subject({ roles: ['compliance-auditor'] }),
      'read:geraet_zuordnung',
      vollstaendigeRessource(),
    );
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_auditor_verboten' });
  });

  it('Defense-in-Depth-Backstop: compliance-auditor MIT zusaetzlich geraete-support (Fehlkonfiguration) → dennoch deny (geraet_reverse_auditor_verboten)', () => {
    const decision = adapter.evaluate(
      subject({ roles: ['compliance-auditor', 'geraete-support'] }),
      'read:geraet_zuordnung',
      vollstaendigeRessource(),
    );
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_auditor_verboten' });
  });

  it('betrieb → deny (geraet_reverse_rolle_fehlt), betrieb ist NICHT geraete-support', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:geraet_zuordnung', vollstaendigeRessource());
    expect(decision).toEqual({ effect: 'deny', reason: 'geraet_reverse_rolle_fehlt' });
  });
});

describe('InCodePolicyAdapter — ADR-0010 D5 (read:standort_pii, eigenstaendige Auditor-Defense-in-Depth)', () => {
  const adapter = new InCodePolicyAdapter();

  it('compliance-auditor × read:standort_pii → deny (standort_pii_auditor_verboten), obwohl classifyAction() dies als "read" einstuft', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:standort_pii', {
      standort: { endkundeId: 'ek-1', typ: 'gebaeude', ebene: 0, status: 'aktiv' },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'standort_pii_auditor_verboten' });
  });

  it('compliance-auditor × read:standort_pii OHNE jegliches Ressourcen-Attribut → dennoch deny (unconditional)', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:standort_pii');
    expect(decision).toEqual({ effect: 'deny', reason: 'standort_pii_auditor_verboten' });
  });

  it('betrieb × read:standort_pii → permit (default_permit_v1), Rolle ist nicht auditor', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:standort_pii', {
      standort: { endkundeId: 'ek-1', typ: 'gebaeude', ebene: 0, status: 'aktiv' },
    });
    expect(decision.effect).toBe('permit');
  });

  it('compliance-auditor × read:standort (Baum/Struktur-Lesestufe) bleibt erlaubt — NUR read:standort_pii ist gesperrt', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:standort', {
      standort: { endkundeId: 'ek-1', typ: 'gebaeude', ebene: 0, status: 'aktiv' },
    });
    expect(decision.effect).toBe('permit');
  });
});

describe('InCodePolicyAdapter — ADR-0006 Teil B (B8/B10, read:einflussgroesse, eigenstaendige Auditor-Defense-in-Depth)', () => {
  const adapter = new InCodePolicyAdapter();

  it('compliance-auditor × read:einflussgroesse → deny (einflussgroesse_auditor_verboten), obwohl classifyAction() dies als "read" einstuft', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:einflussgroesse', {
      einflussgroesse: { endkundeId: 'ek-1', systemId: 'sys-1' },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'einflussgroesse_auditor_verboten' });
  });

  it('compliance-auditor × read:einflussgroesse OHNE jegliches Ressourcen-Attribut → dennoch deny (unconditional, resource-los)', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:einflussgroesse');
    expect(decision).toEqual({ effect: 'deny', reason: 'einflussgroesse_auditor_verboten' });
  });

  it('betrieb × read:einflussgroesse → permit (default_permit_v1), Rolle ist nicht auditor', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:einflussgroesse', {
      einflussgroesse: { endkundeId: 'ek-1', systemId: 'sys-1' },
    });
    expect(decision.effect).toBe('permit');
  });

  it('compliance-auditor × create:einflussgroesse → deny bereits ueber die GENERISCHE DS-01-Regel (1), NICHT ueber die eigenstaendige (1d) — beide fuehren aber zu deny', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'create:einflussgroesse', {
      einflussgroesse: { endkundeId: 'ek-1', systemId: 'sys-1' },
    });
    expect(decision).toEqual({ effect: 'deny', reason: 'auditor_schreibzugriff_verboten' });
  });
});

describe('InCodePolicyAdapter — ADR-0007 Teil B (B10) STUFE 2, read:nachweis_export/read:einreichung Asymmetrie (Auflage A19)', () => {
  const adapter = new InCodePolicyAdapter();

  it('compliance-auditor × read:nachweis_export → deny (nachweis_export_auditor_verboten), obwohl classifyAction() dies als "read" einstuft', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:nachweis_export', { entityTyp: 'nachweisExport' });
    expect(decision).toEqual({ effect: 'deny', reason: 'nachweis_export_auditor_verboten' });
  });

  it('compliance-auditor × read:nachweis_export OHNE jegliches Ressourcen-Attribut → dennoch deny (unconditional, resource-los)', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:nachweis_export');
    expect(decision).toEqual({ effect: 'deny', reason: 'nachweis_export_auditor_verboten' });
  });

  it('betrieb × read:nachweis_export → permit (default_permit_v1), Rolle ist nicht auditor', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:nachweis_export', { entityTyp: 'nachweisExport' });
    expect(decision.effect).toBe('permit');
  });

  it('compliance-auditor × read:einreichung → BLEIBT ERLAUBT (B10: "die Metadaten sind sein Pruefgegenstand, nicht sein Risiko") — bewusste Asymmetrie zu read:nachweis_export', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:einreichung', { entityTyp: 'einreichung' });
    expect(decision.effect).toBe('permit');
  });

  it('compliance-auditor × create:einreichung → deny bereits ueber die generische DS-01-Regel (1) — read:nachweis_export/read:einreichung bleiben davon unberuehrt', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'create:einreichung');
    expect(decision).toEqual({ effect: 'deny', reason: 'auditor_schreibzugriff_verboten' });
  });
});

/**
 * Verbrauchs-/Messwert-Endpoint (`MesswerteModule`) — `read:verbrauch_aggregat`
 * ist EXPLIZIT kein break-glass (im Gegensatz zu `read:verbrauch_detail`):
 * normales `betrieb`-Recht, KEINE Zweckpflicht, `compliance-auditor` erhält
 * dieselbe aggregierte, PII-freie Sicht (analog `read:monitoring`).
 */
describe('InCodePolicyAdapter — Verbrauchs-Endpoint (read:verbrauch_aggregat, KEIN break-glass)', () => {
  const adapter = new InCodePolicyAdapter();

  it('betrieb × read:verbrauch_aggregat MIT resource.standort (kein zugriffszweck) → permit, break-glass greift NICHT', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:verbrauch_aggregat', {
      standort: { endkundeId: 'ek-1', typ: 'gebaeude', ebene: 0, status: 'aktiv' },
    });
    expect(decision).toEqual({ effect: 'permit', reason: 'default_permit_v1' });
  });

  it('compliance-auditor × read:verbrauch_aggregat → permit (analog read:monitoring, aggregiert/PII-frei, KEINE eigenständige Deny-Regel)', () => {
    const decision = adapter.evaluate(subject({ roles: ['compliance-auditor'] }), 'read:verbrauch_aggregat', {
      standort: { endkundeId: 'ek-1', typ: 'gebaeude', ebene: 0, status: 'aktiv' },
    });
    expect(decision.effect).toBe('permit');
  });

  it('read:verbrauch_aggregat OHNE jegliches Ressourcen-Attribut → permit (kein_ressourcenbezug, KEIN break-glass-Deny-by-default wie bei read:verbrauch_detail)', () => {
    const decision = adapter.evaluate(subject({ roles: ['betrieb'] }), 'read:verbrauch_aggregat');
    expect(decision).toEqual({ effect: 'permit', reason: 'kein_ressourcenbezug' });
  });
});

