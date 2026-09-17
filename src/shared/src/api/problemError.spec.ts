import { describe, expect, it } from 'vitest';
import { ApiProblemError, toApiProblemError } from './problemError';

describe('toApiProblemError', () => {
  it('mappt eine gültige RFC-9457-Problem-Antwort unverändert auf ApiProblemError', () => {
    const problem = {
      type: 'https://edms.example/problems/dependency-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: 'A required dependency is not ready.',
    };

    const error = toApiProblemError(problem);

    expect(error).toBeInstanceOf(ApiProblemError);
    expect(error.type).toBe(problem.type);
    expect(error.status).toBe(503);
    expect(error.detail).toBe(problem.detail);
    expect(error.message).toBe('Service Unavailable');
  });

  it('mappt einen Verbindungsabbruch ohne Problem-Body auf ein generisches Netzwerkfehler-Problem (status 0)', () => {
    const error = toApiProblemError(new TypeError('Failed to fetch'));

    expect(error).toBeInstanceOf(ApiProblemError);
    expect(error.status).toBe(0);
    expect(error.type).toBe('about:blank');
    expect(error.message).toBe('Network Error');
  });

  it('behandelt undefined/null als generischen Netzwerkfehler statt zu werfen', () => {
    expect(toApiProblemError(undefined).status).toBe(0);
    expect(toApiProblemError(null).status).toBe(0);
  });
});
