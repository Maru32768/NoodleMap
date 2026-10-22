import { setupServer } from "msw/node";

// Tests register the endpoints they exercise with `server.use(...)`; any other
// request fails the test (see `onUnhandledFrame` in setup.ts).
export const server = setupServer();
