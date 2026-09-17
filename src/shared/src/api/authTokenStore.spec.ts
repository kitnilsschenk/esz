import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearAccessToken,
  getAccessToken,
  getAccessTokenSnapshot,
  setAccessToken,
  subscribeAccessToken,
} from './authTokenStore';

describe(
  'authTokenStore (ADR-0002 A5 / .claude/rules/frontend-react.md: "Access-Token nur im Memory")',
  () => {
    afterEach(() => {
      clearAccessToken();
    });

    it('liefert undefined, solange kein Access-Token gesetzt wurde', () => {
      expect(getAccessToken()).toBeUndefined();
      expect(getAccessTokenSnapshot()).toEqual({ accessToken: undefined, expiresAt: undefined });
    });

    it('hält den zuletzt gesetzten Access-Token in der Modulvariable und berechnet expiresAt aus expiresInSeconds', () => {
      setAccessToken('token-abc', 300);

      expect(getAccessToken()).toBe('token-abc');
      expect(getAccessTokenSnapshot().expiresAt).toBeGreaterThan(Date.now());
    });

    it('verwirft den Access-Token bei clearAccessToken', () => {
      setAccessToken('token-abc', 300);

      clearAccessToken();

      expect(getAccessToken()).toBeUndefined();
    });

    it('benachrichtigt abonnierte Listener bei jeder Zustandsänderung', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAccessToken(listener);

      setAccessToken('token-abc', 300);
      clearAccessToken();

      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('ruft einen abgemeldeten Listener nach unsubscribe nicht mehr auf', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAccessToken(listener);
      unsubscribe();

      setAccessToken('token-abc', 300);

      expect(listener).not.toHaveBeenCalled();
    });

    it('ruft Listener bei einem wiederholten clearAccessToken auf bereits leerem Zustand nicht erneut auf', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeAccessToken(listener);

      clearAccessToken();

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  },
);
