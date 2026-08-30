import { ticketFeatureState } from "./feature-state.mjs";
export type TicketFinderState = "disabled" | "preview" | "beta" | "live";
export const TICKET_FEATURE = ticketFeatureState(import.meta.env.SFZ_TICKET_DATA_MODE, import.meta.env.SFZ_TICKET_INDEXING_STATE);
export const TICKET_FINDER_STATE = TICKET_FEATURE.mode as TicketFinderState;
export type TicketPriceHistoryState = "disabled" | "preview" | "live";

// Separate launch gate. Production remains disabled until approved provider
// retention terms exist and enough daily points have accumulated.
export const TICKET_PRICE_HISTORY_STATE: TicketPriceHistoryState = "disabled";
export const TICKET_PRICE_HISTORY_MINIMUM_POINTS = 7;
