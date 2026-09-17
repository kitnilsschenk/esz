import { describe, expect, it } from 'vitest';
import { ApiProblemError } from '@edms/shared';
import { sollWiederholen } from './retryPolicy';

function problem(status: number): ApiProblemError {
  return new ApiProblemError({ type: 'about:blank', title: 'Fehler', status });
}

describe('sollWiederholen (Retry-Regel des Query-Clients)', () => {
  it('wiederholt einen Server-Fehler einmal', () => {
    expect(sollWiederholen(0, problem(503))).toBe(true);
  });

  it('wiederholt einen Netzfehler ohne HTTP-Status einmal', () => {
    expect(sollWiederholen(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it.each([400, 403, 404, 409, 422])('wiederholt %i NICHT — ein Retry ändert an der Anfrage nichts', (status) => {
    // Zuvor galt `retry: 1` unbedingt: Jeder dieser Fälle löste einen zweiten,
    // garantiert ebenso scheiternden Request aus — reine Latenz plus ein
    // zweiter Eintrag im Audit-Log für denselben Nutzerklick.
    expect(sollWiederholen(0, problem(status))).toBe(false);
  });

  it('wiederholt 401 NICHT über die Retry-Regel — dafür ist der stille Refresh zuständig', () => {
    expect(sollWiederholen(0, problem(401))).toBe(false);
  });

  it('gibt nach dem ersten Wiederholungsversuch auf', () => {
    expect(sollWiederholen(1, problem(503))).toBe(false);
  });
});
