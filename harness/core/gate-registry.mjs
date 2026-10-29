import { readFile } from "node:fs/promises";
export async function assertRegisteredGates(labels) {
  const map = JSON.parse(
    await readFile(
      new URL("../registries/requirement-map.json", import.meta.url),
      "utf8",
    ),
  );
  const registered = new Set(
    map.requirements.flatMap((item) => item.externalGates),
  );
  const unknown = labels.filter((label) => !registered.has(label));
  if (unknown.length)
    throw Error("Unregistered evidence gate: " + unknown.join(", "));
}
