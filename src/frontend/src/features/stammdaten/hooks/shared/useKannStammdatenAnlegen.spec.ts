import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKannStammdatenAnlegen } from './useKannStammdatenAnlegen';

const { useAccessTokenSnapshotMock, useSessionQueryMock } = vi.hoisted(() => ({
  useAccessTokenSnapshotMock: vi.fn(),
  useSessionQueryMock: vi.fn(),
}));

vi.mock('../../../auth/hooks/useAccessTokenSnapshot', () => ({ useAccessTokenSnapshot: useAccessTokenSnapshotMock }));
vi.mock('../../../auth/api/useSessionQuery', () => ({ useSessionQuery: useSessionQueryMock }));

function mockSitzung(rollen: readonly string[] | undefined, accessToken: string | undefined = 'token'): void {
  useAccessTokenSnapshotMock.mockReturnValue({ accessToken });
  useSessionQueryMock.mockReturnValue({ data: rollen === undefined ? undefined : { roles: rollen } });
}

describe('useKannStammdatenAnlegen (kosmetisches Rollen-Gating)', () => {
  afterEach(() => {
    useAccessTokenSnapshotMock.mockReset();
    useSessionQueryMock.mockReset();
  });

  it('erlaubt Anlegen für die Rolle `betrieb`', () => {
    mockSitzung(['betrieb']);

    expect(renderHook(() => useKannStammdatenAnlegen()).result.current).toBe(true);
  });

  it('verweigert Anlegen für die strikt lesende Rolle `compliance-auditor`', () => {
    mockSitzung(['compliance-auditor']);

    expect(renderHook(() => useKannStammdatenAnlegen()).result.current).toBe(false);
  });

  it('verweigert Anlegen auch für `admin` — Administration ist keine Fachrolle', () => {
    mockSitzung(['admin']);

    expect(renderHook(() => useKannStammdatenAnlegen()).result.current).toBe(false);
  });

  it('ist konservativ `false`, solange die Sitzung noch lädt', () => {
    // Lieber kurz verstecken als kurz anzeigen und wieder verstecken — ein
    // aufblitzender „Anlegen"-Button, der danach verschwindet, liest sich wie
    // ein Fehler.
    mockSitzung(undefined);

    expect(renderHook(() => useKannStammdatenAnlegen()).result.current).toBe(false);
  });

  it('erkennt `betrieb` auch neben weiteren Rollen', () => {
    mockSitzung(['admin', 'betrieb']);

    expect(renderHook(() => useKannStammdatenAnlegen()).result.current).toBe(true);
  });
});
