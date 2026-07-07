import { setupServer } from "msw/node";

import { gammaHandlers } from "./handlers";

/**
 * Shared MSW server for anything that would talk to Gamma.
 *
 * Usage in a spec file:
 *
 *   import { gammaServer } from "../../test/helpers/gamma/server";
 *
 *   beforeAll(() => gammaServer.listen({ onUnhandledRequest: "error" }));
 *   afterEach(() => gammaServer.resetHandlers());
 *   afterAll(() => gammaServer.close());
 *
 * `onUnhandledRequest: "error"` is the enforcement of the product rule that
 * the Gamma API is only ever reached through the server-side cached proxy —
 * and never at all from tests.
 */
export const gammaServer = setupServer(...gammaHandlers);
