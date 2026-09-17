import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

/**
 * Minimaler `ExecutionContext`-Test-Double für HTTP-Interceptor-Unit-Tests.
 * Nur die von unseren Interceptoren tatsächlich genutzten Methoden
 * (`switchToHttp().getRequest()`, `getHandler()`, `getClass()`) sind
 * funktional — alles andere wirft, falls es je aufgerufen würde.
 */
export function createFakeExecutionContext(request: unknown): ExecutionContext {
  const handler = (): void => undefined;
  const controllerClass = class {};

  const notImplemented = (): never => {
    throw new Error('Nicht implementiert im Test-Double.');
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => controllerClass,
    getArgs: () => [],
    getArgByIndex: notImplemented,
    switchToRpc: notImplemented,
    switchToWs: notImplemented,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

export function createFakeCallHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

export function createFailingCallHandler(error: unknown): CallHandler {
  return { handle: () => throwError(() => error) };
}
