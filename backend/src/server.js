import { app } from "./app.js";
import { config } from "./config.js";
import { syncInbox } from "./modules/inbox/inbox.service.js";

app.listen(config.port, () => console.log(`API on http://localhost:${config.port}/api/v1`));

// D68: received email reaches /admin/inbox by polling Resend (no public webhook needed). Not in app.js, so tests
// never poll.
if (config.resendApiKey) {
  const sync = () => syncInbox().catch((err) => console.error(`Inbox sync: ${err.message}`));
  sync();
  setInterval(sync, 2 * 60_000);
}
