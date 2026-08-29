export type TicketFinderState = "disabled" | "preview" | "live";

export const TICKET_FINDER_STATE: TicketFinderState = "preview";
export type TicketPriceHistoryState = "disabled" | "preview" | "live";

// Separate launch gate. Production remains disabled until approved provider
// retention terms exist and enough daily points have accumulated.
export const TICKET_PRICE_HISTORY_STATE: TicketPriceHistoryState = "disabled";
export const TICKET_PRICE_HISTORY_MINIMUM_POINTS = 7;
