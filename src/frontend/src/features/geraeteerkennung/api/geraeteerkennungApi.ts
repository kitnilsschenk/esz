// Einzige Stelle, die fuer den Geraeteerkennungs-Kontext `apiClient.*`
// aufruft (`.claude/rules/frontend-react.md`).

import {
  apiClient,
  toApiProblemError,
  type Entbehrlichkeit,
  type EntbehrlichVermerken,
  type Geraetegruppe,
  type GeraetegruppeAnlegen,
  type GeraeteZuordnung,
  type GeraeteZuordnungAnlegen,
  type GeraeteZuordnungBeenden,
  type ZuordnungsQuote,
} from '@edms/shared';

/** `GET /geraeteerkennung/gruppen` */
export async function fetchGruppen(endkundeId: string): Promise<readonly Geraetegruppe[]> {
  const { data, error } = await apiClient.GET('/geraeteerkennung/gruppen', {
    params: { query: { endkundeId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /geraeteerkennung/zuordnungen` — einschliesslich beendeter. */
export async function fetchZuordnungen(endkundeId: string): Promise<readonly GeraeteZuordnung[]> {
  const { data, error } = await apiClient.GET('/geraeteerkennung/zuordnungen', {
    params: { query: { endkundeId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /geraeteerkennung/quote` */
export async function fetchQuote(
  endkundeId: string,
  energietraeger: string,
  foerderjahrId: string,
): Promise<ZuordnungsQuote> {
  const { data, error } = await apiClient.GET('/geraeteerkennung/quote', {
    params: { query: { endkundeId, energietraeger, foerderjahrId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /geraeteerkennung/gruppen` */
export async function legeGruppeAn(
  input: GeraetegruppeAnlegen,
  idempotencyKey: string,
): Promise<Geraetegruppe> {
  const { data, error } = await apiClient.POST('/geraeteerkennung/gruppen', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /geraeteerkennung/zuordnungen` */
export async function legeZuordnungAn(
  input: GeraeteZuordnungAnlegen,
  idempotencyKey: string,
): Promise<GeraeteZuordnung> {
  const { data, error } = await apiClient.POST('/geraeteerkennung/zuordnungen', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /geraeteerkennung/zuordnungen/beenden` */
export async function beendeZuordnung(
  input: GeraeteZuordnungBeenden,
  idempotencyKey: string,
): Promise<GeraeteZuordnung> {
  const { data, error } = await apiClient.POST('/geraeteerkennung/zuordnungen/beenden', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /geraeteerkennung/systeme/{systemId}/entbehrlich` */
export async function fetchEntbehrlichkeit(systemId: string): Promise<Entbehrlichkeit> {
  const { data, error } = await apiClient.GET('/geraeteerkennung/systeme/{systemId}/entbehrlich', {
    params: { path: { systemId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /geraeteerkennung/systeme/{systemId}/entbehrlich` */
export async function vermerkeEntbehrlich(
  systemId: string,
  input: EntbehrlichVermerken,
  idempotencyKey: string,
): Promise<void> {
  const { error } = await apiClient.POST('/geraeteerkennung/systeme/{systemId}/entbehrlich', {
    params: { path: { systemId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
}
