#!/usr/bin/env node
// Generiert die geteilten OpenAPI-Client-Typen für `@edms/shared` aus
// `schemas/openapi/*.openapi.yaml` via `openapi-typescript` (Node-API).
//
// Generator-Entscheidung: openapi-typescript + openapi-fetch (frontend-lead,
// ADR-0001 §10.7 / AP5, offener Punkt 13.1(2) final entschieden).
//
// Aufruf (Root-Script, siehe package.json): `pnpm generate:api`
//   - Iteriert über jede `schemas/openapi/*.openapi.yaml`-Datei.
//   - Schreibt `src/shared/src/api/generated/<Dateiname ohne ".openapi.yaml">.ts`.
//   - Setzt den verbindlichen Header
//     "AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`." vor den von
//     openapi-typescript erzeugten Inhalt.
//
// `--check`: schreibt NICHT, sondern vergleicht den frisch generierten Stand
// gegen die im Repo committeten Dateien und bricht mit Exit-Code 1 ab, falls
// sie fehlen oder abweichen (Drift-Check). Gedacht als Baustein für einen
// künftigen CI-Job (`pnpm generate:api --check`, Übergabe an devops-lead) —
// hier bereits nutzbar, ohne dass diese AP CI-Dateien (`.github/**`) anfasst.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// src/shared/scripts/ -> Repo-Root ist drei Ebenen höher.
const REPO_ROOT = join(SCRIPT_DIR, '..', '..', '..');
const SCHEMAS_DIR = join(REPO_ROOT, 'schemas', 'openapi');
const OUTPUT_DIR = join(REPO_ROOT, 'src', 'shared', 'src', 'api', 'generated');
const SCHEMA_SUFFIX = '.openapi.yaml';

const HEADER = [
  '/**',
  ' * AUTO-GENERATED — DO NOT EDIT. Run `pnpm generate:api`.',
  ' */',
  '',
  '',
].join('\n');

function listSchemaFiles() {
  if (!existsSync(SCHEMAS_DIR)) {
    return [];
  }
  return readdirSync(SCHEMAS_DIR)
    .filter((file) => file.endsWith(SCHEMA_SUFFIX))
    .sort();
}

async function renderSchema(schemaFile) {
  const stem = schemaFile.slice(0, -SCHEMA_SUFFIX.length);
  const inputPath = join(SCHEMAS_DIR, schemaFile);
  const outputPath = join(OUTPUT_DIR, `${stem}.ts`);

  const ast = await openapiTS(pathToFileURL(inputPath));
  const body = astToString(ast);

  return { inputPath, outputPath, contents: `${HEADER}${body}` };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const schemaFiles = listSchemaFiles();

  if (schemaFiles.length === 0) {
    console.warn(
      `generate:api — keine ${SCHEMA_SUFFIX}-Dateien unter ${relative(REPO_ROOT, SCHEMAS_DIR)} gefunden.`,
    );
    return;
  }

  if (!checkOnly) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let drifted = false;

  for (const schemaFile of schemaFiles) {
    const { inputPath, outputPath, contents } = await renderSchema(schemaFile);
    const relIn = relative(REPO_ROOT, inputPath);
    const relOut = relative(REPO_ROOT, outputPath);

    if (checkOnly) {
      const existing = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : null;
      if (existing !== contents) {
        console.error(`generate:api --check: Drift erkannt für ${relOut} (Quelle: ${relIn}).`);
        drifted = true;
      } else {
        console.log(`generate:api --check: ${relOut} ist aktuell.`);
      }
      continue;
    }

    writeFileSync(outputPath, contents, 'utf-8');
    console.log(`generate:api: ${relIn} -> ${relOut}`);
  }

  if (checkOnly && drifted) {
    console.error(
      'generate:api --check: mindestens eine generierte Datei ist veraltet — `pnpm generate:api` ausführen und committen.',
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
