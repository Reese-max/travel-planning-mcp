import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function suppliedRequestId(req: IncomingMessage): string | undefined {
  const value = req.headers['x-request-id'];
  if (typeof value !== 'string') return undefined;
  return SAFE_REQUEST_ID.test(value) ? value : undefined;
}

export interface RequestContext {
  requestId: string;
  startedAt: bigint;
}

export function attachRequestContext(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): RequestContext {
  const requestId = suppliedRequestId(req) ?? randomUUID();
  const startedAt = process.hrtime.bigint();
  res.setHeader('x-request-id', requestId);

  res.once('finish', () => {
    if (process.env.REQUEST_LOGGING === 'false') return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const entry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      service: 'travel-planning-api',
      request_id: requestId,
      method: req.method ?? 'GET',
      path: pathname,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2))
    };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  });

  return { requestId, startedAt };
}
