// Which database this instance talks to.
// Each clinic's Vercel project has its production DB as DATABASE_URL (all environments)
// and, for clinic acceptance testing, a separate staging DB as STAGING_DATABASE_URL
// that only exists in the Preview environment. When present, staging wins.
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.STAGING_DATABASE_URL || env.DATABASE_URL;
}

// Direct (non-pooled) connection for migrations; falls back to the pooled URL
export function migrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.STAGING_DATABASE_URL
    ? env.STAGING_DATABASE_URL_UNPOOLED || env.STAGING_DATABASE_URL
    : env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
}
