export function getEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (value == null) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getOptionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}
