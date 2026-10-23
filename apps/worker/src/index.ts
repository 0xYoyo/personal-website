// Worker entry. Keep this module to a single default export: workerd treats every
// named export of the entry module as an entrypoint. The router lives in app.ts.
import { createApp, type Env } from './app';

const app = createApp();

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
