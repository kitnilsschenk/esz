// Öffentliche Oberfläche des Nachweis-Features (ADR-0007 Teil B/C).
//
// Eigenes Feature neben `stammdaten` — andere Fachdomäne, eigene OpenAPI-Spec
// und ein eigener Rollenschnitt (der Export ist die einzige Leseaktion des
// Systems, die der Auditor-Rolle verwehrt bleibt). Die geteilten Bausteine
// (Hook-Fabriken, `DataList`/`DetailView`/`EntityForm`, Formate) werden aus
// `stammdaten/*/shared` WIEDERVERWENDET, nicht kopiert.

export { nachweisRoutes } from './routes';
