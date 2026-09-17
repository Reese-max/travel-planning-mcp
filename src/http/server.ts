import { timingSafeEqual } from 'node:crypto';
import { createServer as createNodeServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { placeProvider } from '../adapters/demo-place-provider.js';
import type { ChangeOperation, TransportMode } from '../domain/types.js';
import { idempotencyService, IdempotencyConflictError } from '../services/idempotency-service.js';
import { proposalService } from '../services/proposal-service.js';
import { routeService } from '../services/route-service.js';
import { tripContextService } from '../services/trip-context-service.js';
import { store } from '../store/memory-store.js';

const MAX_BODY_BYTES = 1024 * 1024;

const operationSchema = z.object({
  operation: z.enum(['add', 'remove', 'move', 'update', 'replace']),
  target_type: z.enum(['trip_item', 'place', 'reservation', 'constraint']),
  target_id: z.string().nullable().optional(),
  from: z.record(z.string(), z.unknown()).nullable().optional(),
  to: z.record(z.string(), z.unknown()).nullable().optional(),
  reason: z.string().nullable().optional()
});

const createProposalSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  reason: z.string().optional(),
  model: z.string().optional(),
  actor_id: z.string().optional(),
  operations: z.array(operationSchema).min(1)
});

const routeEstimateSchema = z.object({
  from_place_id: z.string().uuid(),
  to_place_id: z.string().uuid(),
  mode: z.enum(['walking', 'transit', 'rail', 'taxi', 'car', 'bike'])
});

const approveSchema = z.object({
  actor_id: z.string().min(1),
  note: z.string().max(2000).optional()
});

const rejectSchema = z.object({
  actor_id: z.string().min(1),
  reason: z.string().max(2000).optional()
});

const rollbackSchema = z.object({
  target_version: z.number().int().positive(),
  actor_id: z.string().min(1)
});

export interface HttpServerOptions {
  host?: string;
  port?: number;
  travelApiKey?: string;
  approvalApiKey?: string;
}

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function bearerToken(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization;
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length);
}

function stringHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

function idempotencyKey(req: IncomingMessage): string | undefined {
  const value = stringHeader(req, 'idempotency-key')?.trim();
  return value || undefined;
}

function secureEqual(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function sendIdempotent(
  res: ServerResponse,
  result: { status: number; body: unknown; replayed: boolean }
): void {
  sendJson(res, result.status, result.body, {
    'idempotent-replayed': result.replayed ? 'true' : 'false'
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error('Request body exceeds 1 MiB limit.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function errorStatus(error: unknown): number {
  if (error instanceof IdempotencyConflictError) return 409;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('not found') || message.includes('not found:')) return 404;
  if (
    message.includes('stale') ||
    message.includes('approved') ||
    message.includes('validated') ||
    message.includes('locked') ||
    message.includes('fixed') ||
    message.includes('approval receipt') ||
    message.includes('Idempotency key')
  ) {
    return 409;
  }
  return 400;
}

function normalizedOperations(
  operations: z.infer<typeof operationSchema>[]
): Array<Omit<ChangeOperation, 'operation_id'>> {
  return operations.map((operation) => ({
    operation: operation.operation,
    target_type: operation.target_type,
    ...(operation.target_id !== undefined ? { target_id: operation.target_id } : {}),
    ...(operation.from !== undefined ? { from: operation.from } : {}),
    ...(operation.to !== undefined ? { to: operation.to } : {}),
    ...(operation.reason !== undefined ? { reason: operation.reason } : {})
  }));
}

function requireApproval(
  req: IncomingMessage,
  res: ServerResponse,
  approvalApiKey: string | undefined
): boolean {
  if (!approvalApiKey) {
    sendJson(res, 503, { error: 'approval_api_disabled' });
    return false;
  }
  if (!secureEqual(stringHeader(req, 'x-approval-key'), approvalApiKey)) {
    sendJson(res, 401, { error: 'approval_unauthorized' });
    return false;
  }
  return true;
}

function requireIdempotencyKey(req: IncomingMessage, res: ServerResponse): string | undefined {
  const key = idempotencyKey(req);
  if (!key) {
    sendJson(res, 400, { error: 'idempotency_key_required' });
    return undefined;
  }
  return key;
}

export function createHttpServer(options: HttpServerOptions = {}) {
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.PORT ?? 8787);
  const travelApiKey = options.travelApiKey ?? process.env.TRAVEL_API_KEY;
  const approvalApiKey = options.approvalApiKey ?? process.env.APPROVAL_API_KEY;

  if (!isLoopback(host) && !travelApiKey) {
    throw new Error('TRAVEL_API_KEY is required when binding the REST API to a non-loopback host.');
  }

  const server = createNodeServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const segments = url.pathname.split('/').filter(Boolean);

      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'travel-planning-api',
          version: '0.3.0',
          approval_enabled: Boolean(approvalApiKey),
          providers: {
            places: placeProvider.descriptor,
            routes: routeService.descriptor
          }
        });
        return;
      }

      if (travelApiKey && !secureEqual(bearerToken(req), travelApiKey)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }

      if (method === 'GET' && url.pathname === '/v1/providers') {
        sendJson(res, 200, {
          places: placeProvider.descriptor,
          routes: routeService.descriptor
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/v1/trips') {
        sendJson(
          res,
          200,
          store.listTrips().map((trip) => ({
            trip_id: trip.trip_id,
            version: trip.version,
            title: trip.title,
            start_date: trip.start_date,
            end_date: trip.end_date,
            status: trip.status,
            updated_at: trip.updated_at
          }))
        );
        return;
      }

      if (method === 'GET' && url.pathname === '/v1/places/search') {
        const query = url.searchParams.get('q')?.trim() ?? '';
        const limitRaw = url.searchParams.get('limit');
        const limit = limitRaw === null ? 10 : parsePositiveInt(limitRaw);
        if (!query) {
          sendJson(res, 400, { error: 'q is required' });
          return;
        }
        if (limit === undefined || limit > 25) {
          sendJson(res, 400, { error: 'limit must be an integer from 1 to 25' });
          return;
        }
        sendJson(res, 200, await placeProvider.search({ query, limit }));
        return;
      }

      if (segments[0] === 'v1' && segments[1] === 'places' && segments[2] && segments.length === 3) {
        const place = await placeProvider.get(segments[2]);
        if (!place) {
          sendJson(res, 404, { error: 'place_not_found' });
          return;
        }
        sendJson(res, 200, place);
        return;
      }

      if (
        method === 'GET' &&
        segments[0] === 'v1' &&
        segments[1] === 'reservations' &&
        segments[2] &&
        segments.length === 3
      ) {
        const reservation = store.getReservation(segments[2]);
        if (!reservation) {
          sendJson(res, 404, { error: 'reservation_not_found' });
          return;
        }
        sendJson(res, 200, reservation);
        return;
      }

      if (method === 'POST' && url.pathname === '/v1/routes/estimate') {
        const body = routeEstimateSchema.parse(await readJson(req));
        sendJson(
          res,
          200,
          await routeService.estimate(body.from_place_id, body.to_place_id, body.mode as TransportMode)
        );
        return;
      }

      if (segments[0] === 'v1' && segments[1] === 'trips' && segments[2]) {
        const tripId = segments[2];

        if (method === 'GET' && segments.length === 3) {
          const versionRaw = url.searchParams.get('version');
          const version = parsePositiveInt(versionRaw);
          if (versionRaw !== null && version === undefined) {
            sendJson(res, 400, { error: 'version must be a positive integer' });
            return;
          }
          const trip = store.getTrip(tripId, version);
          if (!trip) {
            sendJson(res, 404, { error: 'trip_not_found' });
            return;
          }
          sendJson(res, 200, { trip, versions: store.listTripVersions(tripId) });
          return;
        }

        if (method === 'GET' && segments[3] === 'context' && segments.length === 4) {
          const versionRaw = url.searchParams.get('version');
          const version = parsePositiveInt(versionRaw);
          if (versionRaw !== null && version === undefined) {
            sendJson(res, 400, { error: 'version must be a positive integer' });
            return;
          }
          sendJson(res, 200, tripContextService.get(tripId, version));
          return;
        }

        if (method === 'GET' && segments[3] === 'constraints' && segments.length === 4) {
          const trip = store.getTrip(tripId);
          if (!trip) {
            sendJson(res, 404, { error: 'trip_not_found' });
            return;
          }
          sendJson(res, 200, { constraints: store.getConstraintsForTrip(trip) });
          return;
        }

        if (method === 'GET' && segments[3] === 'audit' && segments.length === 4) {
          if (!store.getTrip(tripId)) {
            sendJson(res, 404, { error: 'trip_not_found' });
            return;
          }
          sendJson(res, 200, { events: store.listAuditForTrip(tripId) });
          return;
        }

        if (method === 'POST' && segments[3] === 'proposals' && segments.length === 4) {
          const body = createProposalSchema.parse(await readJson(req));
          const outcome = await idempotencyService.execute(
            `create-proposal:${tripId}`,
            idempotencyKey(req),
            body,
            () => ({
              status: 201,
              body: proposalService.create({
                tripId,
                operations: normalizedOperations(body.operations),
                ...(body.title !== undefined ? { title: body.title } : {}),
                ...(body.summary !== undefined ? { summary: body.summary } : {}),
                ...(body.reason !== undefined ? { reason: body.reason } : {}),
                ...(body.model !== undefined ? { model: body.model } : {}),
                ...(body.actor_id !== undefined ? { actorId: body.actor_id } : {})
              })
            })
          );
          sendIdempotent(res, outcome);
          return;
        }

        if (method === 'POST' && segments[3] === 'rollback' && segments.length === 4) {
          if (!requireApproval(req, res, approvalApiKey)) return;
          const key = requireIdempotencyKey(req, res);
          if (!key) return;
          const body = rollbackSchema.parse(await readJson(req));
          const outcome = await idempotencyService.execute(
            `rollback-trip:${tripId}`,
            key,
            body,
            () => ({
              status: 200,
              body: proposalService.rollback(tripId, body.target_version, body.actor_id)
            })
          );
          sendIdempotent(res, outcome);
          return;
        }
      }

      if (segments[0] === 'v1' && segments[1] === 'proposals' && segments[2]) {
        const proposalId = segments[2];

        if (method === 'GET' && segments.length === 3) {
          const proposal = store.getProposal(proposalId);
          if (!proposal) {
            sendJson(res, 404, { error: 'proposal_not_found' });
            return;
          }
          sendJson(res, 200, proposal);
          return;
        }

        if (method === 'POST' && segments[3] === 'validate' && segments.length === 4) {
          sendJson(res, 200, proposalService.validate(proposalId));
          return;
        }

        if (
          method === 'POST' &&
          ['approve', 'reject', 'apply'].includes(segments[3] ?? '') &&
          segments.length === 4
        ) {
          if (!requireApproval(req, res, approvalApiKey)) return;

          if (segments[3] === 'approve') {
            const body = approveSchema.parse(await readJson(req));
            const outcome = await idempotencyService.execute(
              `approve-proposal:${proposalId}`,
              idempotencyKey(req),
              body,
              () => ({
                status: 200,
                body: proposalService.approve({
                  proposalId,
                  actorId: body.actor_id,
                  channel: 'http',
                  ...(body.note !== undefined ? { note: body.note } : {})
                })
              })
            );
            sendIdempotent(res, outcome);
            return;
          }

          if (segments[3] === 'reject') {
            const body = rejectSchema.parse(await readJson(req));
            const outcome = await idempotencyService.execute(
              `reject-proposal:${proposalId}`,
              idempotencyKey(req),
              body,
              () => ({
                status: 200,
                body: proposalService.reject(proposalId, body.actor_id, body.reason)
              })
            );
            sendIdempotent(res, outcome);
            return;
          }

          const key = requireIdempotencyKey(req, res);
          if (!key) return;
          const outcome = await idempotencyService.execute(
            `apply-proposal:${proposalId}`,
            key,
            { proposal_id: proposalId },
            () => ({ status: 200, body: proposalService.apply(proposalId) })
          );
          sendIdempotent(res, outcome);
          return;
        }
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendJson(res, 400, { error: 'invalid_request', issues: error.issues });
        return;
      }
      sendJson(res, errorStatus(error), {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return { server, host, port };
}

export async function runHttpServer(options: HttpServerOptions = {}): Promise<void> {
  const { server, host, port } = createHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  process.stdout.write(`Travel Planning API listening on http://${host}:${port}\n`);
}
