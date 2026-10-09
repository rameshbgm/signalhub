// SignalHub's branded operator command. `statusctl` remains available as a
// compatibility alias for existing automation and upgrade workflows.
//
// Settings saved by the setup wizard are loaded into the environment first, so
// every command works beside a wizard-configured server. `setup` loads its own
// module: it runs before a database exists, and statusctl connects to the
// database as soon as it is imported.
import { loadRuntimeConfigIntoEnv } from "@/lib/setup/config-file";

async function main() {
  await loadRuntimeConfigIntoEnv();
  if (process.argv[2] === "setup") {
    const { setupCli } = await import("./setup-cli");
    await setupCli();
  } else {
    await import("./statusctl");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
