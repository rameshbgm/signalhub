// SignalHub's branded operator command. `statusctl` remains available as a
// compatibility alias for existing automation and upgrade workflows.
// `setup` loads separately: it runs before a database exists, and statusctl
// connects to the database as soon as it is imported.
if (process.argv[2] === "setup") {
  import("./setup-cli")
    .then(({ setupCli }) => setupCli())
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
} else {
  import("./statusctl");
}
