import pg from "pg";
import { config } from "./config.js";

// TIMESTAMP columns (no zone) hold UTC: now() runs with TimeZone=UTC on every connection. pg would read them, and
// write Date parameters, in the Node process's local time - 2 hours off on a laptop in Ljubljana - so both are UTC too.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value) => new Date(`${value.replace(" ", "T")}Z`));
pg.defaults.parseInputDatesAsUTC = true;

export const pool = new pg.Pool({ connectionString: config.databaseUrl, options: "-c TimeZone=UTC" });
