export type TicketFinderState = "disabled" | "preview" | "beta" | "live";

const requestedState = import.meta.env.SFZ_TICKET_DATA_MODE;
export const TICKET_FINDER_STATE: TicketFinderState = ["disabled", "preview", "beta", "live"].includes(requestedState) ? requestedState : "preview";
export type TicketPriceHistoryState = "disabled" | "preview" | "live";

// Separate launch gate. Production remains disabled until approved provider
// retention terms exist and enough daily points have accumulated.
export const TICKET_PRICE_HISTORY_STATE: TicketPriceHistoryState = "disabled";
export const TICKET_PRICE_HISTORY_MINIMUM_POINTS = 7;
