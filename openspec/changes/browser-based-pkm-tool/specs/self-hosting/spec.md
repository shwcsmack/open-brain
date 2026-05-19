## ADDED Requirements

### Requirement: Docker Compose deployment
The system SHALL ship a `docker-compose.yml` at the repository root that starts the application with a single `docker compose up` command. The compose file SHALL define a `app` service (Next.js) and mount a named volume for the SQLite database file. No external services (Redis, separate DB container) SHALL be required for the default SQLite configuration.

#### Scenario: Application starts with docker compose up
- **WHEN** the user runs `docker compose up` in a directory containing the repo
- **THEN** the application is accessible at `http://localhost:3000` within 30 seconds

#### Scenario: Data persists across container restarts
- **WHEN** the user creates notes, stops the container, and restarts it
- **THEN** all previously created notes are still present

### Requirement: Environment-based configuration
The system SHALL read all runtime configuration from environment variables. A `.env.example` file SHALL document every supported variable with descriptions and default values. Required variables without defaults SHALL cause the application to fail fast at startup with a descriptive error.

Supported variables:
- `DATABASE_URL` — Prisma connection string; defaults to `file:./data/pkm.db` (SQLite)
- `SESSION_SECRET` — 32+ character secret for `iron-session` cookie encryption; **required**
- `INITIAL_PASSWORD` — plaintext password set on first boot if no user exists; optional (triggers setup wizard if absent)
- `PORT` — HTTP port; defaults to `3000`
- `BASE_URL` — public-facing URL used for generating links; defaults to `http://localhost:${PORT}`

#### Scenario: Missing SESSION_SECRET causes startup failure
- **WHEN** the application starts without `SESSION_SECRET` set
- **THEN** the process exits immediately with a message: "SESSION_SECRET environment variable is required"

#### Scenario: Switching to Postgres via DATABASE_URL
- **WHEN** `DATABASE_URL` is set to a `postgresql://` connection string and migrations are run
- **THEN** the application uses Postgres instead of SQLite with no code changes

### Requirement: First-boot setup wizard
The system SHALL detect when no user account exists in the database and redirect all unauthenticated requests to `/setup`. The setup page SHALL accept a new password and confirm-password field. On successful submission the password SHALL be hashed with bcrypt (cost factor 12) and stored, and the user SHALL be redirected to the login page.

#### Scenario: Fresh install redirects to setup
- **WHEN** the application starts with an empty database and the user visits `/`
- **THEN** the user is redirected to `/setup`

#### Scenario: Setup creates user account
- **WHEN** the user submits matching passwords on the setup page
- **THEN** a user record is created with a bcrypt-hashed password and the user is redirected to `/login`

#### Scenario: Setup is inaccessible after account exists
- **WHEN** a user account already exists and someone navigates to `/setup`
- **THEN** the system redirects to `/login`

### Requirement: Authentication and session management
The system SHALL protect all application routes (except `/login` and `/setup`) behind session authentication using `iron-session` (encrypted HTTP-only cookie). Sessions SHALL expire after 30 days of inactivity. The login page SHALL accept the configured password; failed attempts SHALL show a generic "Invalid password" message.

#### Scenario: Unauthenticated user is redirected to login
- **WHEN** an unauthenticated user visits any protected route
- **THEN** the system redirects to `/login` with a `redirect` query parameter

#### Scenario: Successful login creates session and redirects
- **WHEN** the user submits the correct password on the login page
- **THEN** an encrypted session cookie is set and the user is redirected to the originally requested URL or `/`

#### Scenario: Incorrect password shows error
- **WHEN** the user submits an incorrect password
- **THEN** the login page displays "Invalid password" without revealing whether the account exists

### Requirement: Database migrations on startup
The system SHALL run `prisma migrate deploy` automatically during the Docker entrypoint script before the Next.js server starts. This ensures the schema is always up to date without manual intervention.

#### Scenario: Migration runs before server start
- **WHEN** the Docker container starts
- **THEN** Prisma migrations are applied before the Next.js server begins accepting requests

#### Scenario: Already-applied migrations are skipped
- **WHEN** all migrations have already been applied to the database
- **THEN** `prisma migrate deploy` completes without error and the server starts normally
