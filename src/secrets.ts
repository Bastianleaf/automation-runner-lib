import fs from "node:fs";

/** Parses a dotenv-style file (KEY=value, optional quotes, # comments). A missing file is `{}`. */
export function loadDotEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Returns a lookup that reads the environment first and falls back to the secrets file. Missing is `""`. */
export function createSecrets(envFile?: string): (name: string) => string {
  return (name) => process.env[name] ?? (envFile ? loadDotEnv(envFile)[name] : undefined) ?? "";
}
