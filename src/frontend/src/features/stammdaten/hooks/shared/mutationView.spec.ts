import { describe, expect, it } from 'vitest';
import { ApiProblemError } from '@edms/shared';
import { mutationViewBasis, toSubmitErrorMessage } from './mutationView';

function problem(status: number, detail?: string): ApiProblemError {
  return new ApiProblemError({
    type: 'about:blank',
    title: 'Fehler',
    status,
    ...(detail !== undefined ? { detail } : {}),
  });
}

const RUHEND = { isPending: false, isSuccess: false, error: null };

describe('toSubmitErrorMessage', () => {
  it('liefert `undefined`, solange kein Fehler vorliegt', () => {
    expect(toSubmitErrorMessage(null)).toBeUndefined();
  });

  it('bevorzugt das fachliche `detail` des Servers', () => {
    expect(toSubmitErrorMessage(problem(409, 'Zähler ist bereits stillgelegt.'))).toBe('Zähler ist bereits stillgelegt.');
  });

  it('fällt auf den generischen Text zurück, wenn der Server kein `detail` sendet', () => {
    expect(toSubmitErrorMessage(problem(500))).toBe('Ein unerwarteter Fehler ist aufgetreten. Bitte später erneut versuchen.');
  });
});

describe('mutationViewBasis', () => {
  it('spiegelt den Lade-Zustand der Mutation', () => {
    expect(mutationViewBasis({ ...RUHEND, isPending: true }).isSubmitting).toBe(true);
  });

  it('zeigt die Erfolgsmeldung NUR nach erfolgreichem Abschluss', () => {
    expect(mutationViewBasis(RUHEND, 'Gespeichert.').erfolgsMeldung).toBeUndefined();
    expect(mutationViewBasis({ ...RUHEND, isSuccess: true }, 'Gespeichert.').erfolgsMeldung).toBe('Gespeichert.');
  });

  it('meldet keinen Erfolg, wenn der Aufrufer bewusst keine Meldung übergibt (View navigiert weg)', () => {
    expect(mutationViewBasis({ ...RUHEND, isSuccess: true }).erfolgsMeldung).toBeUndefined();
  });

  it('meldet Fehler und Erfolg niemals gleichzeitig', () => {
    const basis = mutationViewBasis({ isPending: false, isSuccess: false, error: problem(400, 'Ungültig.') }, 'Gespeichert.');
    expect(basis.submitErrorMessage).toBe('Ungültig.');
    expect(basis.erfolgsMeldung).toBeUndefined();
  });
});
