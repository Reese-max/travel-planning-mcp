export type TransportMode = 'walking' | 'transit' | 'rail' | 'taxi' | 'car' | 'bike';

export interface Money {
  amount: number;
  currency: string;
}

export interface Place {
  place_id: string;
  name: string;
  localized_names?: Record<string, string>;
  categories: string[];
  location: {
    lat: number;
    lng: number;
    address?: string | null;
    country_code?: string | null;
    timezone?: string | null;
  };
  external_ids?: Record<string, string | null>;
  planning?: {
    recommended_duration_minutes?: number | null;
    indoor?: boolean | null;
    reservation_required?: boolean | null;
    accessibility?: string[];
    estimated_cost?: Money | null;
  };
  user_metadata?: {
    priority?: 'must_visit' | 'high' | 'normal' | 'low' | 'avoid';
    visited?: boolean;
    favorite?: boolean;
    notes?: string | null;
    tags?: string[];
  };
  source: {
    provider: string;
    source_id?: string | null;
    retrieved_at?: string | null;
  };
}

export type ReservationType =
  | 'flight'
  | 'hotel'
  | 'rail'
  | 'bus'
  | 'ferry'
  | 'restaurant'
  | 'activity'
  | 'ticket'
  | 'car_rental'
  | 'other';

export interface Reservation {
  reservation_id: string;
  type: ReservationType;
  status: 'tentative' | 'confirmed' | 'cancelled' | 'completed';
  provider?: string | null;
  confirmation_code?: string | null;
  title?: string | null;
  start_at: string;
  end_at?: string | null;
  timezone?: string | null;
  fixed: boolean;
  place_id?: string | null;
  origin_place_id?: string | null;
  destination_place_id?: string | null;
  traveler_ids?: string[];
  price?: Money | null;
  details?: Record<string, unknown>;
  source: {
    type: 'manual' | 'gmail' | 'calendar' | 'api' | 'import';
    provider?: string | null;
    source_id?: string | null;
    retrieved_at?: string | null;
  };
}

export type ConstraintType =
  | 'fixed_item'
  | 'time_window'
  | 'return_by'
  | 'start_after'
  | 'max_places_per_day'
  | 'max_walking_distance'
  | 'max_daily_budget'
  | 'transport_mode'
  | 'accessibility'
  | 'dietary'
  | 'pace'
  | 'must_visit'
  | 'avoid_place'
  | 'avoid_category'
  | 'preferred_area'
  | 'traveler_requirement'
  | 'custom';

export interface Constraint {
  constraint_id: string;
  type: ConstraintType;
  strength: 'hard' | 'soft';
  enabled: boolean;
  scope: {
    trip?: boolean;
    date?: string | null;
    traveler_ids?: string[];
    item_ids?: string[];
  };
  parameters: Record<string, unknown>;
  reason?: string | null;
  created_by: 'user' | 'system' | 'ai' | 'import';
  created_at?: string | null;
}

export interface RouteSnapshot {
  mode: TransportMode;
  duration_minutes: number;
  distance_meters: number;
  source?: string | null;
  calculated_at?: string | null;
}

export interface TripItem {
  item_id: string;
  type: 'place' | 'reservation' | 'transit' | 'meal' | 'free_time' | 'note';
  place_id?: string | null;
  reservation_id?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  duration_minutes?: number | null;
  locked: boolean;
  notes?: string | null;
  route?: RouteSnapshot | null;
}

export interface TripDay {
  date: string;
  base_place_id?: string | null;
  items: TripItem[];
}

export interface Trip {
  trip_id: string;
  version: number;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  status: 'draft' | 'planned' | 'active' | 'completed' | 'archived';
  travelers: Array<{
    traveler_id: string;
    display_name: string;
    role: 'owner' | 'editor' | 'traveler';
  }>;
  preferences?: {
    pace?: 'relaxed' | 'balanced' | 'intensive';
    interests?: string[];
    preferred_transport?: TransportMode[];
    [key: string]: unknown;
  };
  place_ids?: string[];
  reservation_ids?: string[];
  constraint_ids?: string[];
  days: TripDay[];
  change_proposal_ids?: string[];
  created_at: string;
  updated_at: string;
}

export type ChangeOperationType = 'add' | 'remove' | 'move' | 'update' | 'replace';
export type ChangeTargetType = 'trip_item' | 'place' | 'reservation' | 'constraint';

export interface ChangeOperation {
  operation_id: string;
  operation: ChangeOperationType;
  target_type: ChangeTargetType;
  target_id?: string | null;
  from?: Record<string, unknown> | null;
  to?: Record<string, unknown> | null;
  reason?: string | null;
}

export interface ProposalValidation {
  valid: boolean;
  validated_at?: string | null;
  hard_constraint_violations: string[];
  soft_constraint_warnings: string[];
  conflicts: string[];
}

export interface ChangeProposal {
  proposal_id: string;
  trip_id: string;
  base_trip_version: number;
  status:
    | 'draft'
    | 'validating'
    | 'validated'
    | 'needs_review'
    | 'approved'
    | 'rejected'
    | 'applied'
    | 'expired';
  title?: string | null;
  summary?: string | null;
  reason?: string | null;
  operations: ChangeOperation[];
  validation?: ProposalValidation | null;
  impact?: {
    travel_minutes_delta?: number | null;
    walking_km_delta?: number | null;
    estimated_cost_delta?: number | null;
    currency?: string | null;
    affected_days?: string[];
  } | null;
  generated_by: {
    type: 'user' | 'ai' | 'system';
    model?: string | null;
    actor_id?: string | null;
  };
  created_at: string;
  approved_at?: string | null;
  applied_at?: string | null;
  applied_trip_version?: number | null;
}
