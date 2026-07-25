import { ensureIndexes } from "@/lib/ensure-indexes";
import { mongoClient } from "@/lib/db";

ensureIndexes()
  .then(() => {
    console.log("Indexes ensured.");
    return mongoClient.close();
  })
  .catch(async (error) => {
    console.error(error);
    await mongoClient.close().catch(() => undefined);
    process.exitCode = 1;
  });
