import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, useTheme } from './useTheme';

function setSystemPrefersDark(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    // @ts-expect-error — jsdom kennt `matchMedia` nativ nicht; Testdopplung entfernen.
    delete window.matchMedia;
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('startet mit `light`, wenn weder eine gespeicherte Wahl noch `matchMedia` verfügbar ist (jsdom-Fallback)', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('respektiert eine dunkle System-Preference, wenn keine gespeicherte Wahl vorliegt', () => {
    setSystemPrefersDark(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('bevorzugt eine gespeicherte Wahl gegenüber der System-Preference', () => {
    setSystemPrefersDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('togglet die `.dark`-Klasse auf `<html>` und persistiert die Wahl in `localStorage`', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
