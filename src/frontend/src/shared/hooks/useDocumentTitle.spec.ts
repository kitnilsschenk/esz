import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { leseSeitentitel } from '../routing/seitentitelStore';
import { useDocumentTitle } from './useDocumentTitle';

describe('useDocumentTitle', () => {
  it('setzt document.title mit dem "EDMS — "-Präfix', () => {
    renderHook(() => {
      useDocumentTitle('Endkunden');
    });

    expect(document.title).toBe('EDMS — Endkunden');
  });

  it('aktualisiert document.title, wenn sich der Titel ändert', () => {
    const { rerender } = renderHook(({ titel }: { titel: string }) => {
      useDocumentTitle(titel);
    }, { initialProps: { titel: 'Endkunden' } });

    expect(document.title).toBe('EDMS — Endkunden');

    rerender({ titel: 'Endkunde-Detail' });

    expect(document.title).toBe('EDMS — Endkunde-Detail');
  });

  it('spiegelt denselben Text in den seitentitelStore (für die Live-Region-Ansage in RouteAnnouncer)', () => {
    renderHook(() => {
      useDocumentTitle('Systeme');
    });

    expect(leseSeitentitel()).toBe('EDMS — Systeme');
  });
});
