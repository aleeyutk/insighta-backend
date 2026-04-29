# Insighta Labs+ (Stage 3) - Core Backend

## System Architecture
Insighta Labs+ is structured as a unified platform leveraging a Service-Oriented Architecture (SOA) composed of three independent repositories:
1. **Backend Server**: An Express/SQLite engine handling data aggregation (Genderize, Agify, Nationalize), enforcing Role-Based Access Control (RBAC), and generating JWT access/refresh tokens.
2. **CLI Client**: A secure Commander.js interface handling native OAuth flows and proxying requests securely to the API.
3. **Web Portal (BFF)**: A Backend-For-Frontend Node.js app serving EJS templates, abstracting all JWT tokens into HTTP-Only cookies with CSRF protection to prevent client-side script vulnerabilities.

## Authentication Flow
We utilize a unified **GitHub OAuth 2.0 Flow**:
- **Web Navigation**: The browser redirects the user to GitHub. GitHub calls back the backend `GET /auth/github/callback` endpoint, where an `access_token` and `refresh_token` are injected directly into standard HTTP-Only cookies, keeping the session blind to JavaScript.
- **CLI Navigation**: The CLI spawns a temporary web socket (`http://localhost:3456`) and opens the default browser securely mapping internal state parameters. Once authorized, the CLI natively captures the authentication `code` and proxies it to the Backend via `POST /auth/github/cli` in exchange for JSON-packaged tokens cached at `~/.insighta/credentials.json`.

## Token Handling Approach
JSON Web Tokens (JWT) manage the active authorization matrix safely.
- **Access Tokens**: Expire strictly after 3 minutes. Intercepted dynamically via HTTP Headers (`Bearer`) by the CLI or parsed securely via signed HTTP-Only cookies by the Web Portal.
- **Refresh Tokens**: Expire logically after 5 minutes globally. Stored centrally in a backend `refresh_tokens` matrix to allow arbitrary invalidation upon Logout. The CLI features an intelligent Axios-Interceptor that automatically silently regenerates your `access_token` when an API responds with `401 Unauthorized` without requiring user interaction.

## Role Enforcement Logic
Upon authenticating a user via GitHub for the first time, our database evaluates user population scaling. The very first user is formally elevated to an `admin` automatically, while all subsequent users fallback identically to an `analyst`.
The `requireAdmin` middleware actively blocks mutable routes (such as `POST /api/profiles`), rendering `403 Forbidden` if your parsed JWT role restricts modifications.

## Natural Language Parsing Approach
The `/api/profiles/search?q=...` endpoint uses algorithmic token evaluation to decipher commands.
Our logic segments inputs by semantic boundaries iteratively:
- Captures nouns like `males/men/women/females` translating statically to explicit `gender` filters.
- Matches associative adjectives like `child/teenager/adult/senior` directly mapping an `age_group`.
- Detects geographical references intelligently following the `from [Country]` pattern, iterating over standard `country-list` mapping structures to extrapolate ISO-2 codes automatically.
- Recursively matches numerical age limits dynamically, catching preceding operator strings like `over [number]`, `above [number]`, `under [number]`.

## CLI Usage (Reference)
The CLI operates strictly via the `insighta` executable globally.
- `insighta login` — Initializes GitHub Auth.
- `insighta logout` — Invalidates tokens on the server & destroys local credentials.
- `insighta profiles list --gender female --limit 5` — Generates formatted rich-cli tables dynamically querying constraints!
- `insighta profiles search "young females from nigeria"` — Natively interfaces our Natural Language algorithms.
- `insighta profiles create --name "John Doe"` — Restricted (Admin Only) API creation mapping natively.
- `insighta profiles export --format csv` — Securely fetches raw CSV buffers to your CWD safely.

---
*Developed for Insighta Labs+ Stage 3*

@Aliyu TK
