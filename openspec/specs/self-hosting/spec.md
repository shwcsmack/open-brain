## Purpose

Self-hosting support allows individuals to run the application on their own infrastructure with a simple Docker Compose setup, password-based authentication, and automatic database migrations.

## Requirements

### Requirement: First-run setup

The system SHALL redirect unauthenticated users to `/setup` when no user record exists, allowing them to set a password that is hashed with bcrypt (cost 12) and stored in the database.

#### Scenario: First boot redirects to setup
- **WHEN** the app boots with no user in the database and the user visits `/`
- **THEN** they are redirected to `/setup`

#### Scenario: Setup blocked after user exists
- **WHEN** a user record already exists and someone visits `/setup`
- **THEN** they are redirected to `/login`

#### Scenario: Password stored as bcrypt hash
- **WHEN** the user submits a password on `/setup`
- **THEN** the password is hashed with bcrypt cost 12 before being stored; the plaintext is never persisted

---

### Requirement: Authentication

The system SHALL authenticate users via a password login form at `/login`, creating an `iron-session` encrypted cookie on success valid for 30 days.

#### Scenario: Correct password grants session
- **WHEN** the user submits the correct password on `/login`
- **THEN** an encrypted session cookie is set and the user is redirected to `/`

#### Scenario: Wrong password rejected
- **WHEN** the user submits an incorrect password
- **THEN** an error message is shown and no session cookie is set

#### Scenario: Logout clears session
- **WHEN** the user clicks logout
- **THEN** the session cookie is cleared and the user is redirected to `/login`

---

### Requirement: Route protection

The system SHALL protect all routes via Next.js middleware, redirecting unauthenticated requests to `/login`, with `/login` and `/setup` exempted.

#### Scenario: Unauthenticated access redirected
- **WHEN** a request without a valid session cookie hits `/notes/some-note`
- **THEN** the request is redirected to `/login`

#### Scenario: Auth pages accessible without session
- **WHEN** an unauthenticated user visits `/login`
- **THEN** the login page is served without redirect

---

### Requirement: Environment variable configuration

The system SHALL document and validate required environment variables (`SESSION_SECRET`, `DATABASE_URL`, `INITIAL_PASSWORD`, `PORT`, `BASE_URL`) and SHALL exit with a descriptive error on startup if `SESSION_SECRET` is absent.

#### Scenario: Missing SESSION_SECRET exits process
- **WHEN** the app starts without `SESSION_SECRET` set
- **THEN** the process exits with a descriptive error message naming the missing variable

#### Scenario: INITIAL_PASSWORD seeds first user
- **WHEN** the app boots with `INITIAL_PASSWORD` set and no user exists
- **THEN** a user record is created with the hashed value of `INITIAL_PASSWORD` without requiring the `/setup` flow

---

### Requirement: Docker Compose deployment

The system SHALL ship a `Dockerfile` (multi-stage: builder + runner) and a `docker-compose.yml` that starts the app with a named volume for database persistence and passes environment variables through.

#### Scenario: docker compose up starts app
- **WHEN** the user runs `docker compose up` in the project root
- **THEN** the app is accessible on the configured port with the database volume mounted

#### Scenario: Data persists across restarts
- **WHEN** the user creates a note, stops the container, and restarts it
- **THEN** the note is still present after restart

---

### Requirement: Automatic database migrations

The system SHALL run `prisma migrate deploy` automatically in the Docker entrypoint before starting the Next.js server.

#### Scenario: Migrations run on startup
- **WHEN** the container starts with a fresh database volume
- **THEN** all Prisma migrations are applied before the app accepts requests
