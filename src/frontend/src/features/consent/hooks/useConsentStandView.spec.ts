import { describe, expect, it, vi } from 'vitest';
import { useConsentStandView } from './useConsentStandView';

const { standMock, widersprucheMock, erteilenMock, widerrufenMock, widersprechenMock, ruecknahmeMock } = vi.hoisted(
  () => ({
    standMock: vi.fn(),
    widersprucheMock: vi.fn(),
    erteilenMock: vi.fn(),
    widerrufenMock: vi.fn(),
    widersprechenMock: vi.fn(),
    ruecknahmeMock: vi.fn(),
  }),
);

vi.mock('../api', () => ({
  useConsentStand: standMock,
  useWidersprueche: widersprucheMock,
  useEinwilligungErteilen: erteilenMock,
  useEinwilligungWiderrufen: widerrufenMock,
  useWiderspruchErklaeren: widersprechenMock,
  useWiderspruchZuruecknehmen: ruecknahmeMock,
}));

const SUBJEKT_ID = '018f1e2d-0000-7000-8000-00000000000e';

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null, ...overrides };
}

/** Die monatliche Nutzerinformation beim Endkunden: `opt_out` (TB-06). */
const NUTZERINFO_ZWECK = {
  zweckCode: 'nutzerinformation',
  bezeichnung: 'Monatliche Nutzerinformation',
  verweigerbar: false,
  rechtsgrundlage: 'vertrag_art6_1b',
  erlaubnismodus: 'opt_out',
  begruendung: 'TB-06 schuldet sie; abwaehlbar.',
  wirksameEinwilligung: null,
  verlauf: [],
};

/** Beim Anschlussnutzer beruht heute JEDER Zweck auf einer Einwilligung. */
const OPT_IN_ZWECK = {
  ...NUTZERINFO_ZWECK,
  rechtsgrundlage: 'einwilligung_art6_1a',
  erlaubnismodus: 'opt_in',
  verweigerbar: true,
};

const WIDERSPRUCH = {
  id: '018f1e2d-0000-7000-8000-0000000000d1',
  subjektTyp: 'endkunde',
  subjektId: SUBJEKT_ID,
  zweckCode: 'nutzerinformation',
  erlaubnismodus: 'opt_out',
  erklaertAt: '2026-04-02T00:00:00.000Z',
  erfassungsweg: 'vertrag_schriftlich',
  quelleRef: 'AZ-2026-1234',
  zurueckgenommenAt: null,
  ruecknahmeErfassungsweg: null,
  ruecknahmeQuelleRef: null,
  wirksam: true,
};

function mockAlles(
  zwecke: readonly Record<string, unknown>[],
  widersprueche: readonly Record<string, unknown>[] = [],
  zustand: Record<string, unknown> = {},
  mutationen: Record<string, Record<string, unknown>> = {},
): void {
  standMock.mockReturnValue({ data: { zwecke }, isPending: false, isError: false, ...zustand });
  widersprucheMock.mockReturnValue({ data: widersprueche, isPending: false, isError: false });
  erteilenMock.mockReturnValue(mutationen['erteilen'] ?? mutation());
  widerrufenMock.mockReturnValue(mutationen['widerrufen'] ?? mutation());
  widersprechenMock.mockReturnValue(mutationen['widersprechen'] ?? mutation());
  ruecknahmeMock.mockReturnValue(mutationen['ruecknahme'] ?? mutation());
}

describe('useConsentStandView — Widerspruch (AW-27)', () => {
  it('macht einen NICHT auf Einwilligung beruhenden Zweck widersprechbar', () => {
    // Die exakte Umkehrung von `erteilbar`, und das ist kein Zufall: Gegen
    // eine Einwilligung widerspricht man nicht, man widerruft sie.
    mockAlles([NUTZERINFO_ZWECK]);

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.zwecke[0]?.widersprechbar).toBe(true);
    expect(view.zwecke[0]?.erteilbar).toBe(false);
  });

  it('macht einen Opt-in-Zweck NICHT widersprechbar', () => {
    mockAlles([OPT_IN_ZWECK]);

    const view = useConsentStandView('anschlussnutzer', SUBJEKT_ID);

    expect(view.zwecke[0]?.widersprechbar).toBe(false);
    expect(view.zwecke[0]?.erteilbar).toBe(true);
  });

  it('setzt den STATUS auf „Widersprochen", sobald ein Widerspruch wirksam ist', () => {
    // Stuende hier weiter „Gilt ueber den Vertrag", behauptete die Ansicht
    // eine laufende Verarbeitung, der die betroffene Person widersprochen
    // hat — und danach richtet sich, wer als Naechstes auf die Zeile schaut.
    mockAlles([NUTZERINFO_ZWECK], [WIDERSPRUCH]);

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.zwecke[0]?.statusLabel).toBe('Widersprochen');
    expect(view.zwecke[0]?.widerspruchWirksam).toBe(true);
    expect(view.zwecke[0]?.wirksamerWiderspruchId).toBe(WIDERSPRUCH.id);
  });

  it('zaehlt einen ZURUECKGENOMMENEN Widerspruch nicht als wirksam, behaelt ihn aber im Verlauf', () => {
    // Der Zeitraum, in dem widersprochen war, entscheidet, ob eine
    // Verarbeitung in dieser Zeit zulaessig war — er darf nicht verschwinden.
    mockAlles(
      [NUTZERINFO_ZWECK],
      [{ ...WIDERSPRUCH, zurueckgenommenAt: '2026-06-01T00:00:00.000Z', wirksam: false }],
    );

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.zwecke[0]?.widerspruchWirksam).toBe(false);
    expect(view.zwecke[0]?.statusLabel).not.toBe('Widersprochen');
    expect(view.zwecke[0]?.widerspruchVerlauf).toHaveLength(1);
    expect(view.zwecke[0]?.widerspruchVerlauf[0]?.zurueckgenommenLabel).toBeDefined();
  });

  it('ordnet Widersprueche dem RICHTIGEN Zweck zu', () => {
    // Der Server liefert eine Liste ueber alle Zwecke; zugeordnet wird hier.
    mockAlles(
      [NUTZERINFO_ZWECK, { ...NUTZERINFO_ZWECK, zweckCode: 'messdaten_verarbeitung', erlaubnismodus: 'vertraglich' }],
      [WIDERSPRUCH],
    );

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.zwecke[0]?.widerspruchWirksam).toBe(true);
    expect(view.zwecke[1]?.widerspruchWirksam).toBe(false);
  });

  it('sendet den Widerspruch mit dem ERKLAERUNGS-Tag, nicht mit dem heutigen', () => {
    const widersprechen = mutation();
    mockAlles([NUTZERINFO_ZWECK], [], {}, { widersprechen });

    const view = useConsentStandView('endkunde', SUBJEKT_ID);
    view.widersprich('nutzerinformation', { erklaertAm: '2026-04-02', quelleRef: 'AZ-2026-1234' });

    expect(widersprechen['mutate']).toHaveBeenCalledWith({
      subjektTyp: 'endkunde',
      subjektId: SUBJEKT_ID,
      zweckCode: 'nutzerinformation',
      erklaertAt: '2026-04-02T00:00:00.000Z',
      erfassungsweg: 'vertrag_schriftlich',
      quelleRef: 'AZ-2026-1234',
    });
  });

  it('erfasst den Widerspruch NIE als digitales Opt-in', () => {
    // Die einzige hier verfuegbare IP waere die des Bearbeiters. Sie als die
    // der betroffenen Person zu protokollieren, waere eine Faelschung des
    // Nachweises (`erklaerung.policy.ts`).
    const widersprechen = mutation();
    mockAlles([NUTZERINFO_ZWECK], [], {}, { widersprechen });

    const view = useConsentStandView('endkunde', SUBJEKT_ID);
    view.widersprich('nutzerinformation', { erklaertAm: '2026-04-02', quelleRef: 'AZ-1' });

    const argumente = (widersprechen['mutate'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      erfassungsweg: string;
    };
    expect(argumente.erfassungsweg).not.toBe('digital_opt_in');
  });

  it('sendet die Ruecknahme mit eigenem Zeitpunkt und eigener Fundstelle', () => {
    // Eigener Vorgang, nicht das Loeschen des ersten.
    const ruecknahme = mutation();
    mockAlles([NUTZERINFO_ZWECK], [WIDERSPRUCH], {}, { ruecknahme });

    const view = useConsentStandView('endkunde', SUBJEKT_ID);
    view.nimmWiderspruchZurueck(WIDERSPRUCH.id, { erklaertAm: '2026-06-01', quelleRef: 'AZ-2026-2222' });

    expect(ruecknahme['mutate']).toHaveBeenCalledWith({
      widerspruchId: WIDERSPRUCH.id,
      subjektTyp: 'endkunde',
      subjektId: SUBJEKT_ID,
      eingabe: {
        zurueckgenommenAt: '2026-06-01T00:00:00.000Z',
        erfassungsweg: 'vertrag_schriftlich',
        quelleRef: 'AZ-2026-2222',
      },
    });
  });

  it('weist die ganze Ansicht als fehlerhaft aus, wenn nur der Widerspruchs-Verlauf faellt', () => {
    // Fiele er still aus, stuende an einem Zweck weiter „Gilt ueber den
    // Vertrag", obwohl widersprochen wurde.
    standMock.mockReturnValue({ data: { zwecke: [NUTZERINFO_ZWECK] }, isPending: false, isError: false });
    widersprucheMock.mockReturnValue({ data: undefined, isPending: false, isError: true });
    erteilenMock.mockReturnValue(mutation());
    widerrufenMock.mockReturnValue(mutation());
    widersprechenMock.mockReturnValue(mutation());
    ruecknahmeMock.mockReturnValue(mutation());

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.isError).toBe(true);
  });

  it('zeigt die Erfolgsmeldung der Mutation, die tatsaechlich gelaufen ist', () => {
    mockAlles([NUTZERINFO_ZWECK], [], {}, { widersprechen: mutation({ isSuccess: true }) });

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.erfolgsMeldung).toContain('Widerspruch ist erfasst');
  });

  it('zeigt den Serverfehler im Wortlaut — er nennt den Grund', () => {
    // Etwa: „Zu \"nutzerinformation\" besteht bereits ein wirksamer
    // Widerspruch." Der allgemeine Satz verschluckt genau das.
    mockAlles(
      [NUTZERINFO_ZWECK],
      [],
      {},
      { widersprechen: mutation({ isError: true, error: { detail: 'besteht bereits ein wirksamer Widerspruch' } }) },
    );

    const view = useConsentStandView('endkunde', SUBJEKT_ID);

    expect(view.submitErrorMessage).toContain('besteht bereits ein wirksamer Widerspruch');
  });
});
