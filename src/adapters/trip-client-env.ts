import { TripReadClient, TripReadError } from './trip-read-client.js';

/**
 * Builds the read-only TRIP client from operator environment configuration.
 * Returns undefined when the external integration is not configured at all.
 */
export function tripClientFromEnv(env: NodeJS.ProcessEnv = process.env): TripReadClient | undefined {
  const values = [env.TRIP_API_URL, env.TRIP_API_TOKEN, env.TRIP_INSTANCE_ID];
  if (values.every((value) => !value)) return undefined;
  if (values.some((value) => !value)) throw new TripReadError('CONFIG',
    'Set TRIP_API_URL, TRIP_API_TOKEN and TRIP_INSTANCE_ID together, or leave all unset.');
  return new TripReadClient({
    baseUrl: env.TRIP_API_URL!, apiToken: env.TRIP_API_TOKEN!, instanceId: env.TRIP_INSTANCE_ID!
  });
}