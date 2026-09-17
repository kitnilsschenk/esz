// Minimaler Logger für den Migrations-Runner.
//
// Regel (Arbeitsauftrag / .claude/rules/backend-nestjs.md sinngemäß): keine
// PII in Logs. Der Runner loggt ausschließlich Dateinamen, Versionsnummern
// und generische Statustexte — niemals SQL-Inhalte, Verbindungs-Strings oder
// Datenbank-Fehlermeldungen im Rohformat (die könnten Tabellendaten/Query-
// Fragmente enthalten). Zeitstempel sind immer UTC (ISO-8601, "Z"-Suffix).

type LogLevel = 'info' | 'warn' | 'error';

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, message: string): void {
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  info: (message: string): void => {
    write('info', message);
  },
  warn: (message: string): void => {
    write('warn', message);
  },
  error: (message: string): void => {
    write('error', message);
  },
};
