import { describe, expect, it } from 'vitest';
import { t } from './t';

describe('t (i18n-Schlüssel-Auflösung, .claude/rules/frontend-react.md: "Deutsche UI-Strings aus de.json")', () => {
  it('löst einen flachen Schlüssel zu seinem deutschen String auf', () => {
    expect(t('health.title')).toBe('Systemstatus');
  });

  it('löst einen verschachtelten Schlüssel korrekt auf', () => {
    expect(t('health.readiness.notReady')).toBe('Datenbank nicht bereit');
  });

  it('wirft bei einem nicht existierenden Schlüssel eine Fehlermeldung statt undefined zurückzugeben', () => {
    expect(() =>
      // @ts-expect-error — bewusst ein ungültiger Schlüssel für den Fehlerfall-Test;
      // MessageKey lässt diesen String zur Compile-Zeit gar nicht erst zu.
      t('health.doesNotExist'),
    ).toThrow(/fehlender Schlüssel/);
  });
});
