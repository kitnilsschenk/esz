import type { NachweisExportAntwort } from '@edms/shared';
import { createAnlegenMutation, createDetailQuery } from '../../stammdaten/api/shared';
import { nachweisExportKeys } from './nachweisKeys';
import {
  fetchNachweisExportDetail,
  postNachweisExportErzeugen,
  type NachweisExportErzeugenInput,
} from './nachweisExportApi';

/** `operationId: nachweisExportLesen` — Kopf + Datei-Manifest (Rolle `betrieb`, A19). */
export const useNachweisExportDetail = createDetailQuery<NachweisExportAntwort>({
  queryKeys: nachweisExportKeys,
  fetchDetail: fetchNachweisExportDetail,
});

/** `operationId: nachweisExportErzeugen` — frischer `Idempotency-Key` je Submit (Fabrik). */
export const useNachweisExportErzeugen = createAnlegenMutation<NachweisExportErzeugenInput, NachweisExportAntwort>({
  queryKeys: nachweisExportKeys,
  anlegen: postNachweisExportErzeugen,
});

export type { NachweisExportErzeugenInput };
