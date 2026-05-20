export function validateEnv() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error('Fatal: SESSION_SECRET must be set and at least 32 characters long.')
    process.exit(1)
  }
}
