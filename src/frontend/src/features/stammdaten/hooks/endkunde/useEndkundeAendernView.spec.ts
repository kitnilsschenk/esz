import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEndkundeAendernView } from './useEndkundeAendernView';

const { useEndkundeDetailMock, useEndkundeAendernMock, navigateMock } = vi.hoisted(() => ({
  useEndkundeDetailMock: vi.fn(),
  useEndkundeAendernMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('../../api/endkunde', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useEndkundeDetail: useEndkundeDetailMock,
  useEndkundeAendern: useEndkundeAendernMock,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const DETAIL_MIT_PII = {
  id: ENDKUNDE_ID,
  verarbeitungsStatus: 'aktiv' as const,
  consentStatus: 'erteilt' as const,
  vonWissAuswertungAusgenommen: false,
  stammdatenPii: { name: 'Musterfirma GmbH', anschrift: 'Musterweg 1\n76131 Karlsruhe', kontakt: 'kontakt@example.invalid' },
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
};

function mockDetail(detail: unknown): void {
  useEndkundeDetailMock.mockReturnValue({ data: detail });
  useEndkundeAendernMock.mockReturnValue({ isPending: false, isSuccess: false, error: null, mutate: vi.fn() });
}

describe('useEndkundeAendernView', () => {
  afterEach(() => {
    useEndkundeDetailMock.mockReset();
    useEndkundeAendernMock.mockReset();
    navigateMock.mockReset();
  });

  it('ist erst bereit, wenn das Detail für die Vorbefüllung geladen ist', () => {
    mockDetail(undefined);

    expect(renderHook(() => useEndkundeAendernView(ENDKUNDE_ID)).result.current.isReady).toBe(false);
  });

  it('befüllt die PII-Felder aus dem geladenen Detail vor', () => {
    mockDetail(DETAIL_MIT_PII);

    const { defaultValues, piiMaskiert } = renderHook(() => useEndkundeAendernView(ENDKUNDE_ID)).result.current;
    expect(piiMaskiert).toBe(false);
    expect(defaultValues.name).toBe('Musterfirma GmbH');
    expect(defaultValues.kontakt).toBe('kontakt@example.invalid');
  });

  it('befüllt bei serverseitig MASKIERTER PII leer und meldet die Maskierung', () => {
    // Kern-Compliance-Regel (ADR-0008 §11 Linie 2 / D6): Liefert der Server
    // `stammdatenPii: null`, darf das Formular den Nullwert NICHT als
    // Leerstring in den Payload übernehmen — ein Submit ohne erneute Eingabe
    // würde sonst echten Klartext still mit "" überschreiben. `piiMaskiert`
    // macht das für den Nutzer sichtbar, BEVOR er das Formular ausfüllt.
    mockDetail({ ...DETAIL_MIT_PII, verarbeitungsStatus: 'gesperrt' as const, stammdatenPii: null });

    const { defaultValues, piiMaskiert } = renderHook(() => useEndkundeAendernView(ENDKUNDE_ID)).result.current;
    expect(piiMaskiert).toBe(true);
    expect(defaultValues.name).toBe('');
    expect(defaultValues.anschrift).toBe('');
    expect(defaultValues.kontakt).toBe('');
  });

  it('schickt das DE-04-Flag NICHT mit — der Dienst weist es ab (AW-27)', () => {
    // Der Regressionstest zu einem stillen Totalausfall: Der Mapper hat
    // `vonWissAuswertungAusgenommen` IMMER mitgeschickt (ein `boolean` ist
    // nie `undefined`), und `endkunde.service.ts` wirft bei jedem gesetzten
    // Wert `DE04_UEBER_WIDERSPRUCH`. Damit scheiterte JEDER Aufruf des
    // Aendern-Formulars an einem 400 — nicht nur das Haekchen.
    const mutate = vi.fn((_variables: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    useEndkundeDetailMock.mockReturnValue({ data: { ...DETAIL_MIT_PII, vonWissAuswertungAusgenommen: true } });
    useEndkundeAendernMock.mockReturnValue({ isPending: false, isSuccess: false, error: null, mutate });

    const { result } = renderHook(() => useEndkundeAendernView(ENDKUNDE_ID));
    result.current.submit({ name: 'Neu GmbH', anschrift: 'Neuweg 2', kontakt: '', endkundengruppe: '' });

    const argumente = mutate.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(argumente.input).not.toHaveProperty('vonWissAuswertungAusgenommen');
  });

  it('navigiert nach erfolgreichem Submit zurück auf die Detailseite', () => {
    const mutate = vi.fn((_variables: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    useEndkundeDetailMock.mockReturnValue({ data: DETAIL_MIT_PII });
    useEndkundeAendernMock.mockReturnValue({ isPending: false, isSuccess: false, error: null, mutate });

    const { result } = renderHook(() => useEndkundeAendernView(ENDKUNDE_ID));
    result.current.submit({ name: 'Neu GmbH', anschrift: 'Neuweg 2', kontakt: '', endkundengruppe: '' });

    expect(navigateMock).toHaveBeenCalledWith(`/stammdaten/endkunden/${ENDKUNDE_ID}`);
  });
});
