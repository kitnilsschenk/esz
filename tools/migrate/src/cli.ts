#!/usr/bin/env node
import { loadConfig } from './config.js';
import { connect } from './db.js';
import { runDown } from './commands/down.js';
import { runStatus } from './commands/status.js';
import { runUp } from './commands/up.js';
import { logger } from './logger.js';

const COMMANDS = ['up', 'down', 'status'] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

function printUsage(): void {
  logger.error(
    'Nutzung: edms-migrate <up|down|status> [--yes]\n' +
      '  up      wendet ausstehende Migrationen aus migrations/ an\n' +
      '  down    rollt GENAU die letzte angewendete Migration zurück (erfordert --yes)\n' +
      '  status  zeigt angewendete vs. ausstehende Migrationen (rein lesend)\n' +
      '\n' +
      'Verbindung ausschließlich über ENV: DATABASE_URL oder POSTGRES_HOST/POSTGRES_PORT/' +
      'POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD (siehe .env.example). ' +
      'Optional: MIGRATIONS_DIR (Default: <cwd>/migrations).',
  );
}

async function main(): Promise<void> {
  const [, , commandArg, ...rest] = process.argv;

  if (commandArg === undefined || !isCommand(commandArg)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const client = await connect(config.db);

  try {
    switch (commandArg) {
      case 'up':
        await runUp(client, config.migrationsDir);
        break;
      case 'down':
        await runDown(client, config.migrationsDir, rest.includes('--yes'));
        break;
      case 'status':
        await runStatus(client, config.migrationsDir);
        break;
    }
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler.';
  logger.error(message);
  process.exitCode = 1;
});
