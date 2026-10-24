import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = resolve(process.env.CAPTURE_SOURCE_DIR || resolve(repo, "docs/captures/estora"));
const output = resolve(repo, "docs/screenshots");
const captured = (await readdir(source)).filter((file) => file.endsWith(".jpg") && !file.startsWith("landing-"));
const refreshed = new Map();

await mkdir(output, { recursive: true });
for (const file of captured) {
  const name = basename(file, ".jpg");
  const input = resolve(source, file);
  const image = sharp(input);
  const metadata = await image.metadata();
  await image.png().toFile(resolve(output, `${name}.png`));
  refreshed.set(name, {
    width: metadata.width,
    height: metadata.height,
    capturedAt: (await stat(input)).mtime.toISOString().slice(0, 10),
  });
}

const expected = (await readdir(output))
  .filter((file) => file.endsWith(".png"))
  .map((file) => basename(file, ".png"))
  .sort();

let index = "# Screenshot index\n\n**All images are for reference only.** Product captures use the Estora development organization and synthetic data. Desktop images preserve the browser’s actual viewport; mobile images retain their phone viewport. Installation and authentication screens are organization-independent. See [reference-data notes](../reference-data.md) and [capture guidance](../../CONTRIBUTING.md#documentation-and-screenshots).\n\n";
index += `This index contains ${expected.length} product screenshots; ${refreshed.size} were refreshed in this batch. Other retained screenshots are unchanged.\n\n| Screenshot | Dimensions | Refresh status |\n|---|---|---|\n`;
for (const name of expected) {
  const item = refreshed.get(name);
  const metadata = item ?? await sharp(resolve(output, `${name}.png`)).metadata();
  index += `| [${name.replaceAll("-", " ")}](${name}.png) | ${metadata.width}×${metadata.height} | ${item ? `Estora · ${item.capturedAt}` : "Not refreshed in this batch"} |\n`;
}
index += "\n[Documentation index](../README.md) · [Feature guide](../features.md)\n";
await writeFile(resolve(output, "README.md"), index);
console.log(`Refreshed ${refreshed.size} product screenshots in docs/screenshots/. No website files were changed.`);
