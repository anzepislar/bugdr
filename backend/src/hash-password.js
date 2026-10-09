// `npm run hash-password`: asks for the admin password (twice, hidden) and prints the line for backend/.env (D48).
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { hashPassword } from "./modules/auth/auth.service.js";

const MIN = 12;
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
// Hide typing in a terminal; piped input (scripts) has nothing to hide.
const echo = (on) => process.stdin.isTTY && spawnSync("stty", [on ? "echo" : "-echo"], { stdio: "inherit" });
const ask = async (q) => {
  process.stdout.write(q);
  echo(false);
  const { value = "" } = await lines.next();
  echo(true);
  process.stdout.write("\n");
  return value;
};

const password = await ask("Admin password: ");
const again = await ask("Repeat it: ");
rl.close();
if (password !== again) {
  console.error("The passwords do not match.");
  process.exit(1);
}
if (password.length < MIN || password.length > 200) {
  console.error(`Use ${MIN}-200 characters.`);
  process.exit(1);
}
console.log(`\nPaste this line into backend/.env:\nADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
process.exit(0);
