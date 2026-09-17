import type { ChangeProposal, Constraint, Place, Reservation, Trip } from '../domain/types.js';

export const demoTripId = '11111111-1111-4111-8111-111111111111';

export const seedPlaces: Place[] = [
  {
    place_id: '22222222-2222-4222-8222-222222222222',
    name: 'Tokyo Station',
    localized_names: { 'ja-JP': '東京駅', 'zh-TW': '東京車站' },
    categories: ['train_station', 'transport'],
    location: {
      lat: 35.681236,
      lng: 139.767125,
      address: '1 Chome Marunouchi, Chiyoda City, Tokyo, Japan',
      country_code: 'JP',
      timezone: 'Asia/Tokyo'
    },
    planning: {
      indoor: true,
      reservation_required: false,
      recommended_duration_minutes: 30
    },
    source: { provider: 'demo' }
  },
  {
    place_id: '33333333-3333-4333-8333-333333333333',
    name: 'Senso-ji',
    localized_names: { 'ja-JP': '浅草寺', 'zh-TW': '淺草寺' },
    categories: ['temple', 'tourist_attraction'],
    location: {
      lat: 35.714765,
      lng: 139.796655,
      address: '2 Chome-3-1 Asakusa, Taito City, Tokyo, Japan',
      country_code: 'JP',
      timezone: 'Asia/Tokyo'
    },
    planning: {
      indoor: false,
      reservation_required: false,
      recommended_duration_minutes: 90
    },
    user_metadata: {
      priority: 'must_visit',
      notes: 'Want to photograph Kaminarimon.'
    },
    source: { provider: 'demo' }
  }
];

export const seedReservations: Reservation[] = [
  {
    reservation_id: '44444444-4444-4444-8444-444444444444',
    type: 'flight',
    status: 'confirmed',
    provider: 'Demo Airline',
    title: 'TPE → NRT',
    start_at: '2026-10-20T07:20:00+08:00',
    end_at: '2026-10-20T11:35:00+09:00',
    timezone: 'Asia/Tokyo',
    fixed: true,
    details: {
      flight_number: 'DEMO101',
      origin: 'TPE',
      destination: 'NRT'
    },
    source: {
      type: 'manual',
      provider: 'demo'
    }
  }
];

export const seedConstraints: Constraint[] = [
  {
    constraint_id: '55555555-5555-4555-8555-555555555555',
    type: 'return_by',
    strength: 'hard',
    enabled: true,
    scope: { trip: true },
    parameters: { time: '21:00' },
    reason: 'Return to the hotel by 21:00.',
    created_by: 'user'
  },
  {
    constraint_id: '66666666-6666-4666-8666-666666666666',
    type: 'max_walking_distance',
    strength: 'soft',
    enabled: true,
    scope: { trip: true },
    parameters: { kilometers_per_day: 8 },
    reason: 'Prefer no more than 8 km of walking per day.',
    created_by: 'user'
  }
];

export const seedTrip: Trip = {
  trip_id: demoTripId,
  version: 1,
  title: 'Tokyo 7-day demo trip',
  description: 'Demo data for the Travel Planning MCP safety workflow.',
  start_date: '2026-10-20',
  end_date: '2026-10-26',
  status: 'planned',
  travelers: [
    {
      traveler_id: 'owner',
      display_name: 'Demo Traveler',
      role: 'owner'
    }
  ],
  preferences: {
    pace: 'balanced',
    interests: ['food', 'photography', 'shopping'],
    preferred_transport: ['transit', 'walking']
  },
  place_ids: seedPlaces.map((place) => place.place_id),
  reservation_ids: seedReservations.map((reservation) => reservation.reservation_id),
  constraint_ids: seedConstraints.map((constraint) => constraint.constraint_id),
  days: [
    {
      date: '2026-10-20',
      items: [
        {
          item_id: '77777777-7777-4777-8777-777777777777',
          type: 'reservation',
          reservation_id: seedReservations[0]!.reservation_id,
          title: 'TPE → NRT',
          start_at: seedReservations[0]!.start_at,
          end_at: seedReservations[0]!.end_at ?? null,
          locked: true
        },
        {
          item_id: '88888888-8888-4888-8888-888888888888',
          type: 'place',
          place_id: seedPlaces[1]!.place_id,
          title: 'Senso-ji',
          start_at: '2026-10-20T15:00:00+09:00',
          end_at: '2026-10-20T16:30:00+09:00',
          duration_minutes: 90,
          locked: false
        }
      ]
    }
  ],
  change_proposal_ids: [],
  created_at: '2026-09-17T00:00:00Z',
  updated_at: '2026-09-17T00:00:00Z'
};

export const seedProposals: ChangeProposal[] = [];
