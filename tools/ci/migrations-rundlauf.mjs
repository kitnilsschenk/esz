#!/usr/bin/env node
// Rueckbau-Rundlauf fuer Migrationen: hoch -> die letzten N runter -> wieder
// hoch, und danach der Beweis, dass dabei nichts verloren ging.
//
// WARUM ES DAS GIBT
// -----------------
// `.claude/rules/database-migrations.md` verlangt zu jeder Migration eine
// Down-Migration. Bis zum 2026-09-17 wurde keine einzige davon je
// ausgefuehrt — sie wurden geschrieben und gereviewt, und niemand hat je
// geprueft, ob sie laufen. Eine Zusage ohne Deckung. Das ISO-Control A.8.32
// fuehrt genau das als Luecke; dieses Skript schliesst sie.
//
// WAS GEPRUEFT WIRD — UND WAS NICHT
// ---------------------------------
// Verglichen wird ein SCHEMA-Fingerabdruck vor dem Rueckbau und nach dem
// Wiederaufbau: Tabellen, Spalten samt Typ/NULL/Default, Constraints samt
// Definition und Validierungsstand, Indizes, Funktionen samt Signatur,
// Volatilitaet, Eigentuemer und Rechten, dazu die Tabellen- und
// Spalten-Grants. Weicht auch nur eines ab, schlaegt der Lauf fehl und
// nennt die Differenz zeilenweise.
//
// NICHT geprueft werden DATEN. Ein Rundlauf kann Zeilen veraendern, die
// fachlich zum Schema gehoeren (der SCD2-gefuehrte Audit-Ereigniskatalog
// etwa bekommt bei jedem Durchlauf neue Zeilen mit neuen Zeitstempeln) —
// ein Datenvergleich wuerde daran scheitern, ohne dass etwas kaputt waere.
// Diese Grenze ist bewusst gezogen und keine Nachlaessigkeit: Wer eine
// Down-Migration schreibt, die Daten verliert, faellt hier NICHT auf. Dafuer
// gibt es die Pflicht, in jeder Down-Datei auszuschreiben, was der Rueckbau
// fachlich bedeutet (Muster V0087/V0088/V0090).
//
// AUFRUF
//   node tools/ci/migrations-rundlauf.mjs [--anzahl N] [--alle]
//
// Verbindung ueber dieselben Umgebungsvariablen wie der Runner
// (DATABASE_URL oder POSTGRES_*). Das Skript arbeitet AUSSCHLIESSLICH gegen
// die konfigurierte Datenbank und legt selbst keine an — in CI ist das ein
// Wegwerf-Service-Container, lokal sollte es eine Wegwerf-Datenbank sein.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '..', '..');
const CLI = path.join(REPO, 'tools', 'migrate', 'dist', 'cli.js');

function argWert(name, vorgabe) {
  const i = process.argv.indexOf(name);
  return i === -1 || i === process.argv.length - 1 ? vorgabe : process.argv[i + 1];
}

const ALLE = process.argv.includes('--alle');
const ANZAHL = Number.parseInt(argWert('--anzahl', '10'), 10);

if (!ALLE && (!Number.isInteger(ANZAHL) || ANZAHL < 1)) {
  console.error('--anzahl braucht eine positive ganze Zahl.');
  process.exit(2);
}

function runner(...args) {
  const ergebnis = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: process.env,
  });
  if (ergebnis.status !== 0) {
    console.error(ergebnis.stdout ?? '');
    console.error(ergebnis.stderr ?? '');
    throw new Error(`Migrations-Runner "${args.join(' ')}" endete mit Status ${String(ergebnis.status)}.`);
  }
  return `${ergebnis.stdout ?? ''}${ergebnis.stderr ?? ''}`;
}

// Der Fingerabdruck. Jede Abfrage liefert Zeilen der Form "<gruppe>|<text>";
// zusammen ergeben sie eine sortierte, deterministische Beschreibung des
// Schemas. Systemschemata bleiben aussen vor, ebenso die
// Migrations-Buchhaltung selbst (sie AENDERT sich per Definition).
const FINGERABDRUCK_SQL = `
WITH relevante_schemas AS (
  SELECT nspname FROM pg_namespace
   WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
     AND nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast_temp%'
     AND nspname NOT LIKE '\\_timescaledb%' AND nspname NOT LIKE 'timescaledb%'
)
SELECT 'SPALTE|'||c.table_schema||'.'||c.table_name||'.'||c.column_name||' '||c.data_type
       ||' null='||c.is_nullable||' default='||COALESCE(c.column_default,'-') AS zeile
  FROM information_schema.columns c
 WHERE c.table_schema IN (SELECT nspname FROM relevante_schemas)
   AND c.table_name <> 'schema_migrations'
UNION ALL
SELECT 'CONSTRAINT|'||n.nspname||'.'||rel.relname||'.'||con.conname||' '
       ||pg_get_constraintdef(con.oid)||' validated='||con.convalidated
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
 WHERE n.nspname IN (SELECT nspname FROM relevante_schemas)
   AND rel.relname <> 'schema_migrations'
UNION ALL
SELECT 'INDEX|'||schemaname||'.'||indexname||' '||indexdef
  FROM pg_indexes
 WHERE schemaname IN (SELECT nspname FROM relevante_schemas)
   AND tablename <> 'schema_migrations'
UNION ALL
SELECT 'FUNKTION|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
       ||' vol='||p.provolatile::text||' secdef='||p.prosecdef::text
       ||' owner='||pg_get_userbyid(p.proowner)
       ||' acl='||COALESCE(p.proacl::text,'DEFAULT')
       -- pg_get_functiondef wirft bei Aggregat- und Fensterfunktionen
       -- ("... is an aggregate function"). TimescaleDB bringt solche mit
       -- (first, last), deshalb nur fuer gewoehnliche Funktionen den
       -- Koerper hashen -- bei den uebrigen genuegen Signatur, Eigentuemer
       -- und Rechte, denn ihr Koerper stammt ohnehin nicht aus unseren
       -- Migrationen.
       ||' md5='||CASE WHEN p.prokind = 'f' THEN md5(pg_get_functiondef(p.oid)) ELSE 'n/a:'||p.prokind::text END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN (SELECT nspname FROM relevante_schemas)
UNION ALL
SELECT 'TABELLENRECHT|'||table_schema||'.'||table_name||' '||grantee||' '||privilege_type
  FROM information_schema.table_privileges
 WHERE table_schema IN (SELECT nspname FROM relevante_schemas)
   AND table_name <> 'schema_migrations'
UNION ALL
SELECT 'SPALTENRECHT|'||table_schema||'.'||table_name||'.'||column_name||' '||grantee||' '||privilege_type
  FROM information_schema.column_privileges
 WHERE table_schema IN (SELECT nspname FROM relevante_schemas)
   AND table_name <> 'schema_migrations'
UNION ALL
SELECT 'SCHEMA|'||nspname||' owner='||pg_get_userbyid(nspowner)||' acl='||COALESCE(nspacl::text,'DEFAULT')
  FROM pg_namespace WHERE nspname IN (SELECT nspname FROM relevante_schemas)
ORDER BY 1
`;

async function fingerabdruck(client) {
  const ergebnis = await client.query(FINGERABDRUCK_SQL);
  return ergebnis.rows.map((row) => row.zeile);
}

function differenz(vorher, nachher) {
  const a = new Set(vorher);
  const b = new Set(nachher);
  const verloren = vorher.filter((z) => !b.has(z));
  const hinzugekommen = nachher.filter((z) => !a.has(z));
  return { verloren, hinzugekommen };
}

async function main() {
  const { connect } = await import(path.join(REPO, 'tools', 'migrate', 'dist', 'db.js'));
  const { loadConfig } = await import(path.join(REPO, 'tools', 'migrate', 'dist', 'config.js'));

  console.log('Migrations-Rundlauf — hoch, zurueck, wieder hoch.\n');

  runner('up', '--yes');

  const konfiguration = loadConfig();
  const client = await connect(konfiguration.db);
  let vorher;
  let angewendet;
  try {
    vorher = await fingerabdruck(client);
    const stand = await client.query('SELECT count(*)::int AS anzahl FROM schema_migrations');
    angewendet = stand.rows[0]?.anzahl ?? 0;
  } finally {
    await client.end();
  }

  const schritte = ALLE ? angewendet : Math.min(ANZAHL, angewendet);
  console.log(`Schema-Fingerabdruck: ${String(vorher.length)} Zeilen bei ${String(angewendet)} angewendeten Migrationen.`);
  console.log(`Rueckbau: ${String(schritte)} Migration(en).\n`);

  for (let i = 0; i < schritte; i += 1) {
    runner('down', '--yes');
  }
  runner('up', '--yes');

  const client2 = await connect(konfiguration.db);
  let nachher;
  try {
    nachher = await fingerabdruck(client2);
  } finally {
    await client2.end();
  }

  const { verloren, hinzugekommen } = differenz(vorher, nachher);
  if (verloren.length === 0 && hinzugekommen.length === 0) {
    console.log(`OK — Rundlauf ueber ${String(schritte)} Migration(en) ist verlustfrei.`);
    console.log(`     ${String(vorher.length)} Fingerabdruck-Zeilen vorher wie nachher identisch.`);
    return;
  }

  console.error('FEHLER — der Rundlauf hat den Schema-Zustand veraendert.\n');
  if (verloren.length > 0) {
    console.error(`Nach dem Wiederaufbau FEHLEN ${String(verloren.length)} Merkmal(e):`);
    for (const zeile of verloren.slice(0, 40)) {
      console.error(`  - ${zeile}`);
    }
    if (verloren.length > 40) {
      console.error(`  ... und ${String(verloren.length - 40)} weitere.`);
    }
  }
  if (hinzugekommen.length > 0) {
    console.error(`\nNach dem Wiederaufbau sind ${String(hinzugekommen.length)} Merkmal(e) NEU:`);
    for (const zeile of hinzugekommen.slice(0, 40)) {
      console.error(`  + ${zeile}`);
    }
    if (hinzugekommen.length > 40) {
      console.error(`  ... und ${String(hinzugekommen.length - 40)} weitere.`);
    }
  }
  console.error(
    '\nEine Down-Migration stellt den Vorzustand nicht her. Das ist kein Schoenheitsfehler:\n' +
      'ein Rollback im Ernstfall laesst die Datenbank dann in einem Zustand zurueck, den\n' +
      'niemand beschrieben hat.',
  );
  process.exitCode = 1;
}

main().catch((fehler) => {
  console.error(fehler instanceof Error ? fehler.message : String(fehler));
  process.exitCode = 1;
});
