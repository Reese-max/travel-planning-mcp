import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { placeProvider } from '../adapters/demo-place-provider.js';
import type { ChangeOperation, TransportMode } from '../domain/types.js';
import { proposalService } from '../services/proposal-service.js';
import { routeService } from '../services/route-service.js';
import { tripContextService } from '../services/trip-context-service.js';
import { store } from '../store/memory-store.js';

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }]
  };
}

const operationSchema = z.object({
  operation: z.enum(['add', 'remove', 'move', 'update', 'replace']),
  target_type: z.enum(['trip_item', 'place', 'reservation', 'constraint']),
  target_id: z.string().nullable().optional(),
  from: z.record(z.string(), z.unknown()).nullable().optional(),
  to: z.record(z.string(), z.unknown()).nullable().optional(),
  reason: z.string().nullable().optional()
});

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'travel-planning-mcp',
    version: '0.3.0'
  });

  server.registerTool(
    'get_provider_status',
    {
      description: 'Describe the configured place and route providers so AI clients can distinguish demo estimates from live data.',
      inputSchema: {}
    },
    async () =>
      result({
        places: placeProvider.descriptor,
        routes: routeService.descriptor
      })
  );

  server.registerTool(
    'list_trips',
    {
      description: 'List canonical trips visible to the configured store. Returns lightweight trip summaries only.',
      inputSchema: {}
    },
    async () =>
      result({
        trips: store.listTrips().map((trip) => ({
          trip_id: trip.trip_id,
          version: trip.version,
          title: trip.title,
          start_date: trip.start_date,
          end_date: trip.end_date,
          status: trip.status,
          updated_at: trip.updated_at
        }))
      })
  );

  server.registerTool(
    'get_trip',
    {
      description: 'Read the canonical trip and available version numbers. This tool never mutates trip state.',
      inputSchema: {
        trip_id: z.string().uuid(),
        version: z.number().int().positive().optional()
      }
    },
    async ({ trip_id, version }) => {
      const trip = store.getTrip(trip_id, version);
      if (!trip) return failure(`Trip not found: ${trip_id}${version ? ` v${version}` : ''}`);
      return result({ trip, versions: store.listTripVersions(trip_id) });
    }
  );

  server.registerTool(
    'get_trip_context',
    {
      description: 'Read an AI-friendly aggregate containing the trip plus referenced places, reservations, constraints, and available versions.',
      inputSchema: {
        trip_id: z.string().uuid(),
        version: z.number().int().positive().optional()
      }
    },
    async ({ trip_id, version }) => {
      try {
        return result(tripContextService.get(trip_id, version));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'get_place',
    {
      description: 'Read one normalized place through the configured PlaceProvider.',
      inputSchema: { place_id: z.string().uuid() }
    },
    async ({ place_id }) => {
      const place = await placeProvider.get(place_id);
      return place ? result(place) : failure(`Place not found: ${place_id}`);
    }
  );

  server.registerTool(
    'search_places',
    {
      description: 'Search the configured PlaceProvider. Provider metadata is included so clients can distinguish demo vs live data.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(25).default(10)
      }
    },
    async ({ query, limit }) => result(await placeProvider.search({ query, limit }))
  );

  server.registerTool(
    'get_reservation',
    {
      description: 'Read a reservation. Confirmed fixed reservations are protected from direct AI mutation.',
      inputSchema: { reservation_id: z.string().uuid() }
    },
    async ({ reservation_id }) => {
      const reservation = store.getReservation(reservation_id);
      return reservation ? result(reservation) : failure(`Reservation not found: ${reservation_id}`);
    }
  );

  server.registerTool(
    'get_constraints',
    {
      description: 'Read all hard and soft constraints attached to a trip.',
      inputSchema: { trip_id: z.string().uuid() }
    },
    async ({ trip_id }) => {
      const trip = store.getTrip(trip_id);
      if (!trip) return failure(`Trip not found: ${trip_id}`);
      return result({ constraints: store.getConstraintsForTrip(trip) });
    }
  );

  server.registerTool(
    'get_trip_audit',
    {
      description: 'Read the in-memory audit trail for proposal validation, approval, application, rejection, and rollback events.',
      inputSchema: { trip_id: z.string().uuid() }
    },
    async ({ trip_id }) => result({ events: store.listAuditForTrip(trip_id) })
  );

  server.registerTool(
    'calculate_route',
    {
      description: 'Calculate a route through the configured RouteProvider. Provider metadata/source must be inspected before treating the result as live data.',
      inputSchema: {
        from_place_id: z.string().uuid(),
        to_place_id: z.string().uuid(),
        mode: z.enum(['walking', 'transit', 'rail', 'taxi', 'car', 'bike'])
      }
    },
    async ({ from_place_id, to_place_id, mode }) => {
      try {
        return result(await routeService.estimate(from_place_id, to_place_id, mode as TransportMode));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'create_change_proposal',
    {
      description: 'Create an auditable draft proposal against the current trip version. This does not modify the canonical trip.',
      inputSchema: {
        trip_id: z.string().uuid(),
        title: z.string().min(1).optional(),
        summary: z.string().optional(),
        reason: z.string().optional(),
        model: z.string().optional(),
        actor_id: z.string().optional(),
        operations: z.array(operationSchema).min(1)
      }
    },
    async ({ trip_id, title, summary, reason, model, actor_id, operations }) => {
      try {
        const normalized: Array<Omit<ChangeOperation, 'operation_id'>> = operations.map((operation) => ({
          operation: operation.operation,
          target_type: operation.target_type,
          ...(operation.target_id !== undefined ? { target_id: operation.target_id } : {}),
          ...(operation.from !== undefined ? { from: operation.from } : {}),
          ...(operation.to !== undefined ? { to: operation.to } : {}),
          ...(operation.reason !== undefined ? { reason: operation.reason } : {})
        }));

        const proposal = proposalService.create({
          tripId: trip_id,
          operations: normalized,
          ...(title !== undefined ? { title } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(reason !== undefined ? { reason } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(actor_id !== undefined ? { actorId: actor_id } : {})
        });
        return result(proposal);
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'validate_change_proposal',
    {
      description: 'Simulate and validate a proposal against version conflicts, schedule overlaps, locked/fixed items, and supported constraints.',
      inputSchema: { proposal_id: z.string().uuid() }
    },
    async ({ proposal_id }) => {
      try {
        return result(proposalService.validate(proposal_id));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'get_change_proposal',
    {
      description: 'Read one proposal, impact estimate, approval receipt, and validation status.',
      inputSchema: { proposal_id: z.string().uuid() }
    },
    async ({ proposal_id }) => {
      const proposal = store.getProposal(proposal_id);
      return proposal ? result(proposal) : failure(`Proposal not found: ${proposal_id}`);
    }
  );

  server.registerTool(
    'apply_change_proposal',
    {
      description: 'Apply a successfully validated proposal only after an external human-controlled surface has attached an explicit approval receipt. This MCP server cannot approve proposals.',
      inputSchema: { proposal_id: z.string().uuid() }
    },
    async ({ proposal_id }) => {
      try {
        return result(proposalService.apply(proposal_id));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    'rollback_trip',
    {
      description: 'Administrative rollback. Disabled by default. Operators must explicitly enable admin MCP writes in the server environment.',
      inputSchema: {
        trip_id: z.string().uuid(),
        target_version: z.number().int().positive(),
        actor_id: z.string().min(1).default('mcp-admin')
      }
    },
    async ({ trip_id, target_version, actor_id }) => {
      if (process.env.ENABLE_ADMIN_MCP_WRITES !== 'true') {
        return failure('rollback_trip is disabled. Set ENABLE_ADMIN_MCP_WRITES=true in an operator-controlled environment to enable it.');
      }
      try {
        return result(proposalService.rollback(trip_id, target_version, actor_id));
      } catch (error) {
        return failure(error);
      }
    }
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
