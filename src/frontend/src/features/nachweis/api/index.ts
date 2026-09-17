// Öffentliche Oberfläche der Nachweis-API-Schicht (ADR-0007 Teil B/C).
// Die Hook-/Query-Key-Fabriken selbst liegen in `stammdaten/api/shared` und
// werden hier NUR aufgerufen, nicht kopiert.

export {
  foerderjahrKeys,
  preflightKeys,
  preflightBefundKeys,
  einsparlaufKeys,
  einsparlaufErgebnisKeys,
  einsparlaufBindungKeys,
  nachweisExportKeys,
  einreichungKeys,
  einreichungDifferenzKeys,
} from './nachweisKeys';

export { fetchFoerderjahreSeite, fetchFoerderjahrDetail, postFoerderjahrAnlegen } from './foerderjahrApi';
export { useFoerderjahreListe, useFoerderjahrDetail, useFoerderjahrAnlegen } from './useFoerderjahre';
export {
  foerderjahrAnlegenFormSchema,
  foerderjahrAnlegenFormDefaultValues,
  toFoerderjahrAnlegenPayload,
  DEFINITION_QUELLE_WERTE,
} from './foerderjahrFormSchema';
export type { FoerderjahrAnlegenFormValues } from './foerderjahrFormSchema';

export { PREFLIGHT_PROFIL_CODE, fetchPreflightDetail, fetchPreflightBefundeSeite, postPreflightAusfuehren } from './preflightApi';
export { usePreflightDetail, usePreflightBefundeListe, usePreflightAusfuehren } from './usePreflight';
export type { PreflightAusfuehrenInput, PreflightBefundeListenFilter } from './usePreflight';

export {
  fetchEinsparlaeufeSeite,
  fetchEinsparlaufDetail,
  fetchEinsparlaufErgebnisseSeite,
  fetchEinsparlaufBindungenSeite,
  postEinsparlaufAnlegen,
} from './einsparlaufApi';
export {
  useEinsparlaeufeListe,
  useEinsparlaufDetail,
  useEinsparlaufErgebnisseListe,
  useEinsparlaufBindungenListe,
  useEinsparlaufAnlegen,
} from './useEinsparlauf';
export type { EinsparlaeufeListenFilter, EinsparlaufKindListenFilter } from './useEinsparlauf';
export {
  einsparlaufAnlegenFormSchema,
  einsparlaufAnlegenFormDefaultValues,
  toEinsparlaufAnlegenPayload,
  EINSPARLAUF_ART_WERTE,
  EINSPARLAUF_AUSLOESER_WERTE,
} from './einsparlaufFormSchema';
export type { EinsparlaufAnlegenFormValues, EinsparlaufAnlegenKontext } from './einsparlaufFormSchema';

export { fetchNachweisExportDetail, fetchNachweisExportDatei, postNachweisExportErzeugen } from './nachweisExportApi';
export { useNachweisExportDetail, useNachweisExportErzeugen } from './useNachweisExport';
export type { NachweisExportErzeugenInput } from './useNachweisExport';
export {
  nachweisExportErzeugenFormSchema,
  nachweisExportErzeugenFormDefaultValues,
  toNachweisExportErzeugenPayload,
  NACHWEIS_EXPORT_ZWECK_WERTE,
} from './nachweisExportFormSchema';
export type { NachweisExportErzeugenFormValues } from './nachweisExportFormSchema';

export { fetchEinreichungDetail, fetchEinreichungDifferenzenSeite, postEinreichungVermerken } from './einreichungApi';
export { useEinreichungDetail, useEinreichungDifferenzenListe, useEinreichungVermerken } from './useEinreichung';
export type { EinreichungDifferenzenListenFilter, EinreichungVermerkenInput } from './useEinreichung';
export {
  einreichungVermerkenFormSchema,
  einreichungVermerkenFormDefaultValues,
  toEinreichungVermerkenPayload,
  EINREICHUNG_ART_WERTE,
  UEBERMITTLUNGSWEG_WERTE,
  KORREKTUR_GRUND_CODE_WERTE,
} from './einreichungFormSchema';
export type { EinreichungVermerkenFormValues } from './einreichungFormSchema';
