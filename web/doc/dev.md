# Web Module Documentation

This document provides an overview of the web module's architecture and
implementation details.

## Authentication

The authentication is handled by the `web/routes/api/auth` and `web/routes/auth`
directories.

### Password-based Authentication

- **Registration**: `POST /api/auth/register` - Creates a new user with a hashed
  password.
- **Login**: `POST /api/auth/login` - Verifies the user's credentials and
  creates a session.

Password hashing is implemented in `web/auth/password.ts` using the Web Crypto
API (`PBKDF2`).

### OAuth

- **GitHub**: The application supports GitHub OAuth.
- **Login**: `GET /auth/github` - Redirects the user to GitHub for
  authentication.
- **Callback**: `GET /auth/github/callback` - Handles the callback from GitHub,
  creates the user if it doesn't exist, and creates a session.

## Session Management

Session management is handled by the middleware in
`web/routes/app/_middleware.ts`.

- A session cookie `q_session` is used to store the session token.
- The middleware verifies the session token and retrieves the user from the
  database.
- The user object is then available in `ctx.state.user`.

## Database

The database models are defined in `web/db/models.ts` using `valibot` for schema
validation. The database connection is handled by `web/db/mongo.ts`.

The main models are:

- **User**: Stores user information, including email, password, and roles.
- **UserProfile**: Stores user profile information, including name and plan.
- **Plan**: Stores plan information, including quotas.
- **Session**: Stores session information.

## API Routes

- **`web/routes/api/auth`**: Handles authentication-related API calls.
- **`web/routes/app/api`**: Handles application-specific API calls, such as
  managing API keys.

### API Keys

The API for managing API keys is in `web/routes/app/api/keys.ts`.

- `POST /app/api/keys`: Creates a new API key.
- `DELETE /app/api/keys`: Deletes an API key.
- `PATCH /app/api/keys`: Updates an API key.

Ownership is checked for `DELETE` and `PATCH` operations.

## Frontend

The frontend is built with Fresh and Preact.

- **Layouts**: The main layouts are in `web/routes/_layout.tsx` and
  `web/routes/app/_layout.tsx`.
- **Components**: Reusable components are in `web/components`.
- **Islands**: Interactive components (islands) are in `web/islands`.
