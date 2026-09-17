// Response-Typen exakt nach schemas/openapi/health.openapi.yaml (Contract-first,
// ADR-0001 §10.7). Der Contract ist maßgeblich — Änderungen hier erfordern
// zuerst eine Contract-Änderung, nicht umgekehrt.

export type DependencyCheckStatus = 'up' | 'down';
export type DependencyCheckDetail = 'ready' | 'not_ready';

export interface DependencyCheck {
  status: DependencyCheckStatus;
  detail?: DependencyCheckDetail;
}

export interface LivenessResult {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ok' | 'error';
  checks: {
    database: DependencyCheck;
  };
  timestamp: string;
}
