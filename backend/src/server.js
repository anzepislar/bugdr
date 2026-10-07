import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.port, () => console.log(`API on http://localhost:${config.port}/api/v1`));
