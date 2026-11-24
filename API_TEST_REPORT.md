# Backend API Test Report

- Generated (UTC): `2026-11-24T04:12:48.642729+00:00`
- Base URL: `http://localhost:5000`
- Backend process observed: PID `25536`, `node ... tsx .../server.ts`, listening on port `5000`
- Agent process observed: PID `24825`, `python agent.py dev`
- Test cases: **77** — passed **77**, failed **0**

> `PASS` means the observed HTTP status matched the expected behavior. Many cases are intentional negative tests, so an expected `400`, `401`, `403`, `404`, or `429` is still a PASS.

## Summary by endpoint

| Group | Endpoint | Auth | Cases | Result |
|---|---|---|---:|---|
| Health | `GET /` | None | 1 | PASS |
| Health | `GET /health` | None | 1 | PASS |
| Auth | `POST /api/auth/register` | None | 5 | PASS |
| Auth | `POST /api/auth/login` | None | 4 | PASS |
| Auth | `POST /api/auth/google` | None | 2 | PASS |
| Auth | `POST /api/auth/forgot-password` | None | 3 | PASS |
| Auth | `POST /api/auth/reset-password` | None, but requires the one-time token returned by /api/auth/forgot-password | 3 | PASS |
| Auth | `GET /api/auth/me` | Bearer JWT required | 3 | PASS |
| Auth | `PUT /api/auth/profile` | Bearer JWT required | 2 | PASS |
| Rooms | `POST /api/rooms` | Bearer JWT required (or x-service-token) | 5 | PASS |
| Rooms | `POST /api/rooms/join` | Bearer JWT required (or x-service-token) | 4 | PASS |
| Rooms | `GET /api/rooms/my` | Bearer JWT required (or x-service-token) | 1 | PASS |
| Rooms | `GET /api/rooms/:identifier` | Bearer JWT required (or x-service-token) | 3 | PASS |
| Rooms | `PUT /api/rooms/:id` | Bearer JWT required; only the room creator/host may update | 2 | PASS |
| Rooms | `DELETE /api/rooms/:id` | Bearer JWT required; only the room creator/host may delete | 5 | PASS |
| Rooms | `POST /api/rooms/token` | Bearer JWT required (or x-service-token) | 4 | PASS |
| Calls | `POST /api/calls/start` | Bearer JWT required (or x-service-token) | 6 | PASS |
| Calls | `POST /api/calls/join` | Bearer JWT required (or x-service-token) | 3 | PASS |
| Calls | `POST /api/calls/leave` | Bearer JWT required (or x-service-token) | 2 | PASS |
| Calls | `PUT /api/calls/:id/end` | Bearer JWT required (or x-service-token) | 2 | PASS |
| Calls | `GET /api/calls/:id` | Bearer JWT required (or x-service-token) | 2 | PASS |
| Calls | `POST /api/calls/transcript/segment` | Bearer JWT or x-service-token | 4 | PASS |
| Calls | `GET /api/calls/:callId/transcript` | Bearer JWT required (or x-service-token) | 2 | PASS |
| Calls | `POST /api/calls/summary` | Bearer JWT required (or x-service-token) | 2 | PASS |
| Calls | `POST /api/calls/:id/generate-summary` | Bearer JWT required (or x-service-token) | 2 | PASS |
| Users | `GET /api/users/analytics` | Bearer JWT required (or x-service-token) | 2 | PASS |
| LiveKit | `POST /api/livekit/webhook` | LiveKit signature in Authorization header | 2 | PASS |

## Configuration and integration findings

These are not API handler failures; they are environment/config issues found while testing the running processes.

1. **Agent cannot currently write transcripts to the backend.** `agent/.env` sets `BACKEND_SERVICE_TOKEN=your_internal_service_secret`, but the backend process has no `INTERNAL_SERVICE_KEY`, so it uses the code default `lexis_internal_service_secret_2026`. Test result: agent token -> `401`, backend default token -> `201`.
2. **LiveKit config is mismatched.** Backend has no `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET`, so `/api/rooms/token` returned `serverUrl: ws://127.0.0.1:7880` and issues tokens with the code-default `devkey`/`secret`. The agent is configured for `wss://lewis-o1dr3sxd.livekit.cloud` with different credentials. Clients and agent are unlikely to join the same LiveKit room until these are aligned.
3. **LiveKit webhooks cannot be verified.** The webhook receiver is constructed with empty API key/secret because those env vars are unset in the backend process. Unsigned requests correctly returned `401 Webhook signature invalid`, but valid LiveKit Cloud signatures would also fail until the backend is given matching `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`.
4. **Summary generation is running in offline fallback mode.** No `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `OPENAI_API_KEY` is set in the backend process. `/api/calls/:id/generate-summary` succeeded with `model: offline-fallback`.
5. **CORS origin is the default** `http://localhost:3000` because `FRONTEND_URL` is unset. Browser requests from other origins will be blocked; curl/API clients are unaffected.
6. **JWT_SECRET is unset**, so the code-default secret is in use. Tokens work, but this should be set explicitly outside local development.

## Test data cleanup

- Test users created: `apitest.a.1795493533@example.com`, `apitest.b.1795493533@example.com` — deleted after the run with Prisma `deleteMany`.
- All test rooms were deleted via `DELETE /api/rooms/:id`. Cascaded calls/transcripts/summaries/AI usage rows were removed with them.
- Token strings and reset tokens are redacted in this report.

## Detailed results

### Health

#### `GET /`

- **Auth:** None
- **Input format:**

```text
No headers, body, query params, or path params.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `health.root` | 200 | 200 | PASS | 3 |

<details>
<summary><code>health.root</code> — 200 — PASS</summary>

- **Method/path:** `GET /`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `3 ms`
- **Response:**

```json
{
  "status": "success",
  "message": "Lexis API is running"
}
```

</details>

#### `GET /health`

- **Auth:** None
- **Input format:**

```text
No headers, body, query params, or path params.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `health.health` | 200 | 200 | PASS | 1 |

<details>
<summary><code>health.health</code> — 200 — PASS</summary>

- **Method/path:** `GET /health`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1 ms`
- **Response:**

```json
{
  "status": "200",
  "message": "Server is running",
  "Database": "Connected"
}
```

</details>

### Auth

#### `POST /api/auth/register`

- **Auth:** None. Shared rate limiter: 10 requests/minute per IP with /api/auth/login.
- **Input format:**

```text
{
  "name": "string, required, trimmed",
  "email": "string, required, lowercased/trimmed",
  "password": "string, required, min 6 chars"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.register.success` | 201 | 201 | PASS | 2061 |
| `auth.register.validation` | 400 | 400 | PASS | 2 |
| `auth.register.duplicate` | 400 | 400 | PASS | 75 |
| `auth.register.second_user` | 201 | 201 | PASS | 368 |
| `auth.rate_limit.register` | 429 | 429 | PASS | 1 |

<details>
<summary><code>auth.register.success</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/auth/register`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `2061 ms`
- **Request body:**

```json
{
  "name": "API Tester A",
  "email": "apitest.a.1795493533@example.com",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "name": "API Tester A",
    "email": "apitest.a.1795493533@example.com",
    "avatar": null,
    "createdAt": "2026-11-24T04:12:15.729Z"
  },
  "token": "<redacted>"
}
```

</details>

<details>
<summary><code>auth.register.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/register`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `2 ms`
- **Request body:**

```json
{
  "name": "",
  "email": "bad",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "error": "Name, email, and password are required"
}
```

</details>

<details>
<summary><code>auth.register.duplicate</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/register`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `75 ms`
- **Request body:**

```json
{
  "name": "API Tester A",
  "email": "apitest.a.1795493533@example.com",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "error": "Email is already registered"
}
```

</details>

<details>
<summary><code>auth.register.second_user</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/auth/register`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `368 ms`
- **Request body:**

```json
{
  "name": "API Tester B",
  "email": "apitest.b.1795493533@example.com",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "006fd5db-1676-45c6-a579-bbaac0039ded",
    "name": "API Tester B",
    "email": "apitest.b.1795493533@example.com",
    "avatar": null,
    "createdAt": "2026-11-24T04:12:18.939Z"
  },
  "token": "<redacted>"
}
```

</details>

<details>
<summary><code>auth.rate_limit.register</code> — 429 — PASS</summary>

- **Method/path:** `POST /api/auth/register`
- **Expected status:** `429`
- **Actual status:** `429`
- **Duration:** `1 ms`
- **Note:** Observed status sequence over 12 rapid requests: [400, 400, 429, 429, 429, 429, 429, 429, 429, 429, 429, 429]
- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "Too Many Requests",
  "message": "Too many attempts. Please try again in a minute."
}
```

</details>

#### `POST /api/auth/login`

- **Auth:** None. Shared rate limiter: 10 requests/minute per IP with /api/auth/register.
- **Input format:**

```text
{
  "email": "string, required",
  "password": "string, required"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.login.success` | 200 | 200 | PASS | 208 |
| `auth.login.wrong_password` | 401 | 401 | PASS | 224 |
| `auth.login.validation` | 400 | 400 | PASS | 3 |
| `auth.login.after_reset` | 200 | 200 | PASS | 167 |

<details>
<summary><code>auth.login.success</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/auth/login`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `208 ms`
- **Request body:**

```json
{
  "email": "apitest.a.1795493533@example.com",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "message": "Login successful",
  "user": {
    "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "name": "API Tester A",
    "email": "apitest.a.1795493533@example.com",
    "avatar": null,
    "googleId": null,
    "createdAt": "2026-11-24T04:12:15.729Z"
  },
  "token": "<redacted>"
}
```

</details>

<details>
<summary><code>auth.login.wrong_password</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/auth/login`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `224 ms`
- **Request body:**

```json
{
  "email": "apitest.a.1795493533@example.com",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "error": "Invalid credentials"
}
```

</details>

<details>
<summary><code>auth.login.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/login`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `3 ms`
- **Request body:**

```json
{
  "email": "apitest.a.1795493533@example.com"
}
```

- **Response:**

```json
{
  "error": "Email and password are required"
}
```

</details>

<details>
<summary><code>auth.login.after_reset</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/auth/login`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `167 ms`
- **Request body:**

```json
{
  "email": "apitest.a.1795493533@example.com",
  "password": "<redacted>"
}
```

- **Response:**

```json
{
  "message": "Login successful",
  "user": {
    "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "name": "API Tester A",
    "email": "apitest.a.1795493533@example.com",
    "avatar": null,
    "googleId": null,
    "createdAt": "2026-11-24T04:12:15.729Z"
  },
  "token": "<redacted>"
}
```

</details>

#### `POST /api/auth/google`

- **Auth:** None
- **Input format:**

```text
{
  "credential": "string, required, Google Identity Services ID token"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.google.validation` | 400 | 400 | PASS | 2 |
| `auth.google.invalid_credential` | 401 | 401 | PASS | 156 |

<details>
<summary><code>auth.google.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/google`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `2 ms`
- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "Google credential token is required"
}
```

</details>

<details>
<summary><code>auth.google.invalid_credential</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/auth/google`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `156 ms`
- **Request body:**

```json
{
  "credential": "<redacted>"
}
```

- **Response:**

```json
{
  "error": "Invalid Google credential token"
}
```

</details>

#### `POST /api/auth/forgot-password`

- **Auth:** None
- **Input format:**

```text
{
  "email": "string, required"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.forgot.validation` | 400 | 400 | PASS | 2 |
| `auth.forgot.unknown_email` | 200 | 200 | PASS | 76 |
| `auth.forgot.known_email` | 200 | 200 | PASS | 352 |

<details>
<summary><code>auth.forgot.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/forgot-password`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `2 ms`
- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "Email is required"
}
```

</details>

<details>
<summary><code>auth.forgot.unknown_email</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/auth/forgot-password`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `76 ms`
- **Request body:**

```json
{
  "email": "missing.1795493533@example.com"
}
```

- **Response:**

```json
{
  "message": "If an account with that email exists, a password reset link has been generated."
}
```

</details>

<details>
<summary><code>auth.forgot.known_email</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/auth/forgot-password`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `352 ms`
- **Request body:**

```json
{
  "email": "apitest.a.1795493533@example.com"
}
```

- **Response:**

```json
{
  "message": "If an account with that email exists, a password reset link has been generated.",
  "resetToken": "3c98757d5b58897b274aec9edc513b494e01722f62f2ecf16764ffbda5bdcb7e"
}
```

</details>

#### `POST /api/auth/reset-password`

- **Auth:** None, but requires the one-time token returned by /api/auth/forgot-password.
- **Input format:**

```text
{
  "token": "string, required, from forgot-password response",
  "newPassword": "string, required, min 6 chars"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.reset.validation` | 400 | 400 | PASS | 3 |
| `auth.reset.invalid_token` | 400 | 400 | PASS | 203 |
| `auth.reset.success` | 200 | 200 | PASS | 440 |

<details>
<summary><code>auth.reset.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/reset-password`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `3 ms`
- **Request body:**

```json
{
  "token": "<redacted>"
}
```

- **Response:**

```json
{
  "error": "Reset token and new password are required"
}
```

</details>

<details>
<summary><code>auth.reset.invalid_token</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/auth/reset-password`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `203 ms`
- **Request body:**

```json
{
  "token": "<redacted>",
  "newPassword": "<redacted>"
}
```

- **Response:**

```json
{
  "error": "Invalid or expired reset token"
}
```

</details>

<details>
<summary><code>auth.reset.success</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/auth/reset-password`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `440 ms`
- **Request body:**

```json
{
  "token": "<redacted>",
  "newPassword": "<redacted>"
}
```

- **Response:**

```json
{
  "message": "Password has been successfully reset. You can now log in."
}
```

</details>

#### `GET /api/auth/me`

- **Auth:** Bearer JWT required.
- **Input format:**

```text
No body. Header: Authorization: Bearer <jwt>
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.me.no_token` | 401 | 401 | PASS | 1 |
| `auth.me.invalid_token` | 401 | 401 | PASS | 1 |
| `auth.me.success` | 200 | 200 | PASS | 491 |

<details>
<summary><code>auth.me.no_token</code> — 401 — PASS</summary>

- **Method/path:** `GET /api/auth/me`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `1 ms`
- **Response:**

```json
{
  "error": "Access denied. No token provided."
}
```

</details>

<details>
<summary><code>auth.me.invalid_token</code> — 401 — PASS</summary>

- **Method/path:** `GET /api/auth/me`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `1 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Invalid or expired token."
}
```

</details>

<details>
<summary><code>auth.me.success</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/auth/me`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `491 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "user": {
    "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "name": "API Tester A",
    "email": "apitest.a.1795493533@example.com",
    "avatar": null,
    "createdAt": "2026-11-24T04:12:15.729Z"
  }
}
```

</details>

#### `PUT /api/auth/profile`

- **Auth:** Bearer JWT required.
- **Input format:**

```text
{
  "name?": "string",
  "avatar?": "string | null"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `auth.profile.no_token` | 401 | 401 | PASS | 2 |
| `auth.profile.success` | 200 | 200 | PASS | 290 |

<details>
<summary><code>auth.profile.no_token</code> — 401 — PASS</summary>

- **Method/path:** `PUT /api/auth/profile`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `2 ms`
- **Request body:**

```json
{
  "name": "Nope"
}
```

- **Response:**

```json
{
  "error": "Access denied. No token provided."
}
```

</details>

<details>
<summary><code>auth.profile.success</code> — 200 — PASS</summary>

- **Method/path:** `PUT /api/auth/profile`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `290 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "API Tester A Updated",
  "avatar": null
}
```

- **Response:**

```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "name": "API Tester A Updated",
    "email": "apitest.a.1795493533@example.com",
    "avatar": null,
    "createdAt": "2026-11-24T04:12:15.729Z"
  }
}
```

</details>

### Rooms

#### `POST /api/rooms`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
{
  "name": "string, required",
  "isPrivate?": "boolean, default false",
  "aiEnabled?": "boolean, default true",
  "aiPrompt?": "string | null"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.create.no_token` | 401 | 401 | PASS | 2 |
| `rooms.create.validation` | 400 | 400 | PASS | 75 |
| `rooms.create.success` | 201 | 201 | PASS | 1024 |
| `rooms.create.no_transcript_room` | 201 | 201 | PASS | 798 |
| `rooms.delete.success` | 201 | 201 | PASS | 661 |

<details>
<summary><code>rooms.create.no_token</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/rooms`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `2 ms`
- **Request body:**

```json
{
  "name": "Nope"
}
```

- **Response:**

```json
{
  "error": "Access denied. No token provided."
}
```

</details>

<details>
<summary><code>rooms.create.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/rooms`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `75 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "  "
}
```

- **Response:**

```json
{
  "error": "Room name is required"
}
```

</details>

<details>
<summary><code>rooms.create.success</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/rooms`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `1024 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "API Test Room",
  "isPrivate": false,
  "aiEnabled": true,
  "aiPrompt": "Keep answers short."
}
```

- **Response:**

```json
{
  "message": "Room created successfully",
  "room": {
    "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "name": "API Test Room",
    "code": "lex-272-a116",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-272-a116",
    "isPrivate": false,
    "aiEnabled": true,
    "aiPrompt": "Keep answers short.",
    "createdAt": "2026-11-24T04:12:19.599Z"
  }
}
```

</details>

<details>
<summary><code>rooms.create.no_transcript_room</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/rooms`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `798 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "API No Transcript Room",
  "aiEnabled": false
}
```

- **Response:**

```json
{
  "message": "Room created successfully",
  "room": {
    "id": "33cf1d56-d2bc-4234-94d5-5b2b99e9ebe6",
    "name": "API No Transcript Room",
    "code": "lex-455-bcae",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-455-bcae",
    "isPrivate": false,
    "aiEnabled": false,
    "aiPrompt": null,
    "createdAt": "2026-11-24T04:12:41.769Z"
  }
}
```

</details>

<details>
<summary><code>rooms.delete.success</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/rooms`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `661 ms`
- **Note:** Setup step: creates the temporary room used by rooms.delete.success_execute.
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "API Delete Me",
  "aiEnabled": false
}
```

- **Response:**

```json
{
  "message": "Room created successfully",
  "room": {
    "id": "181043d8-46bf-4f31-b399-8fc351a6c2ae",
    "name": "API Delete Me",
    "code": "lex-143-bf5e",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-143-bf5e",
    "isPrivate": false,
    "aiEnabled": false,
    "aiPrompt": null,
    "createdAt": "2026-11-24T04:12:28.332Z"
  }
}
```

</details>

#### `POST /api/rooms/join`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
{
  "code": "string, required, e.g. lex-894-a1b2; case-insensitive"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.join.success_second_user` | 200 | 200 | PASS | 1034 |
| `rooms.join.success_host` | 200 | 200 | PASS | 788 |
| `rooms.join.validation` | 400 | 400 | PASS | 76 |
| `rooms.join.not_found` | 404 | 404 | PASS | 216 |

<details>
<summary><code>rooms.join.success_second_user</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/rooms/join`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1034 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "code": "lex-272-a116"
}
```

- **Response:**

```json
{
  "message": "Joined room successfully",
  "room": {
    "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "name": "API Test Room",
    "code": "lex-272-a116",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-272-a116",
    "isPrivate": false,
    "aiEnabled": true,
    "aiPrompt": "Keep answers short.",
    "createdAt": "2026-11-24T04:12:19.599Z",
    "creator": {
      "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
      "name": "API Tester A Updated",
      "avatar": null
    },
    "members": [
      {
        "id": "19d4be0c-6e14-49cd-8695-19314b1804fc",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "host",
        "joinedAt": "2026-11-24T04:12:19.815Z",
        "user": {
          "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "name": "API Tester A Updated",
          "avatar": null
        }
      }
    ]
  },
  "membership": {
    "id": "21df0991-b370-41c1-a688-830437ab1ef1",
    "userId": "006fd5db-1676-45c6-a579-bbaac0039ded",
    "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "role": "member",
    "joinedAt": "2026-11-24T04:12:21.573Z"
  }
}
```

</details>

<details>
<summary><code>rooms.join.success_host</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/rooms/join`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `788 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "code": "LEX-272-A116"
}
```

- **Response:**

```json
{
  "message": "Joined room successfully",
  "room": {
    "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "name": "API Test Room",
    "code": "lex-272-a116",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-272-a116",
    "isPrivate": false,
    "aiEnabled": true,
    "aiPrompt": "Keep answers short.",
    "createdAt": "2026-11-24T04:12:19.599Z",
    "creator": {
      "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
      "name": "API Tester A Updated",
      "avatar": null
    },
    "members": [
      {
        "id": "19d4be0c-6e14-49cd-8695-19314b1804fc",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "host",
        "joinedAt": "2026-11-24T04:12:19.815Z",
        "user": {
          "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "name": "API Tester A Updated",
          "avatar": null
        }
      },
      {
        "id": "21df0991-b370-41c1-a688-830437ab1ef1",
        "userId": "006fd5db-1676-45c6-a579-bbaac0039ded",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "member",
        "joinedAt": "2026-11-24T04:12:21.573Z",
        "user": {
          "id": "006fd5db-1676-45c6-a579-bbaac0039ded",
          "name": "API Tester B",
          "avatar": null
        }
      }
    ]
  },
  "membership": {
    "id": "19d4be0c-6e14-49cd-8695-19314b1804fc",
    "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "role": "host",
    "joinedAt": "2026-11-24T04:12:19.815Z"
  }
}
```

</details>

<details>
<summary><code>rooms.join.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/rooms/join`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `76 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "Room code is required"
}
```

</details>

<details>
<summary><code>rooms.join.not_found</code> — 404 — PASS</summary>

- **Method/path:** `POST /api/rooms/join`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `216 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "code": "lex-000-dead"
}
```

- **Response:**

```json
{
  "error": "Room not found with this code"
}
```

</details>

#### `GET /api/rooms/my`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
No body, query params, or path params.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.my.success` | 200 | 200 | PASS | 601 |

<details>
<summary><code>rooms.my.success</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/rooms/my`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `601 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "rooms": [
    {
      "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
      "name": "API Test Room",
      "code": "lex-272-a116",
      "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
      "liveKitRoomId": "room-lex-272-a116",
      "isPrivate": false,
      "aiEnabled": true,
      "aiPrompt": "Keep answers short.",
      "createdAt": "2026-11-24T04:12:19.599Z",
      "creator": {
        "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "name": "API Tester A Updated",
        "avatar": null
      },
      "_count": {
        "members": 2
      }
    }
  ]
}
```

</details>

#### `GET /api/rooms/:identifier`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
Path param: identifier = room id or room code. No body.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.details.by_id` | 200 | 200 | PASS | 1139 |
| `rooms.details.by_code` | 200 | 200 | PASS | 1349 |
| `rooms.details.not_found` | 404 | 404 | PASS | 232 |

<details>
<summary><code>rooms.details.by_id</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/rooms/450016c4-6968-4d63-b867-0a0c80cd335b`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1139 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "room": {
    "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "name": "API Test Room",
    "code": "lex-272-a116",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-272-a116",
    "isPrivate": false,
    "aiEnabled": true,
    "aiPrompt": "Keep answers short.",
    "createdAt": "2026-11-24T04:12:19.599Z",
    "creator": {
      "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
      "name": "API Tester A Updated",
      "avatar": null
    },
    "members": [
      {
        "id": "19d4be0c-6e14-49cd-8695-19314b1804fc",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "host",
        "joinedAt": "2026-11-24T04:12:19.815Z",
        "user": {
          "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "name": "API Tester A Updated",
          "avatar": null
        }
      },
      {
        "id": "21df0991-b370-41c1-a688-830437ab1ef1",
        "userId": "006fd5db-1676-45c6-a579-bbaac0039ded",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "member",
        "joinedAt": "2026-11-24T04:12:21.573Z",
        "user": {
          "id": "006fd5db-1676-45c6-a579-bbaac0039ded",
          "name": "API Tester B",
          "avatar": null
        }
      }
    ],
    "calls": []
  }
}
```

</details>

<details>
<summary><code>rooms.details.by_code</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/rooms/lex-272-a116`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1349 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "room": {
    "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "name": "API Test Room",
    "code": "lex-272-a116",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-272-a116",
    "isPrivate": false,
    "aiEnabled": true,
    "aiPrompt": "Keep answers short.",
    "createdAt": "2026-11-24T04:12:19.599Z",
    "creator": {
      "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
      "name": "API Tester A Updated",
      "avatar": null
    },
    "members": [
      {
        "id": "19d4be0c-6e14-49cd-8695-19314b1804fc",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "host",
        "joinedAt": "2026-11-24T04:12:19.815Z",
        "user": {
          "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "name": "API Tester A Updated",
          "avatar": null
        }
      },
      {
        "id": "21df0991-b370-41c1-a688-830437ab1ef1",
        "userId": "006fd5db-1676-45c6-a579-bbaac0039ded",
        "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
        "role": "member",
        "joinedAt": "2026-11-24T04:12:21.573Z",
        "user": {
          "id": "006fd5db-1676-45c6-a579-bbaac0039ded",
          "name": "API Tester B",
          "avatar": null
        }
      }
    ],
    "calls": []
  }
}
```

</details>

<details>
<summary><code>rooms.details.not_found</code> — 404 — PASS</summary>

- **Method/path:** `GET /api/rooms/does-not-exist`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `232 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Room not found"
}
```

</details>

#### `PUT /api/rooms/:id`

- **Auth:** Bearer JWT required; only the room creator/host may update.
- **Input format:**

```text
Path param: id = room UUID. Body (all optional):
{
  "name?": "string",
  "isPrivate?": "boolean",
  "aiEnabled?": "boolean",
  "aiPrompt?": "string | null"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.update.non_host` | 403 | 403 | PASS | 285 |
| `rooms.update.success` | 200 | 200 | PASS | 569 |

<details>
<summary><code>rooms.update.non_host</code> — 403 — PASS</summary>

- **Method/path:** `PUT /api/rooms/450016c4-6968-4d63-b867-0a0c80cd335b`
- **Expected status:** `403`
- **Actual status:** `403`
- **Duration:** `285 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "Hacked"
}
```

- **Response:**

```json
{
  "error": "Only the room host can update settings"
}
```

</details>

<details>
<summary><code>rooms.update.success</code> — 200 — PASS</summary>

- **Method/path:** `PUT /api/rooms/450016c4-6968-4d63-b867-0a0c80cd335b`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `569 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "name": "API Test Room Renamed",
  "aiPrompt": "Be brief."
}
```

- **Response:**

```json
{
  "message": "Room updated successfully",
  "room": {
    "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "name": "API Test Room Renamed",
    "code": "lex-272-a116",
    "createdBy": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "liveKitRoomId": "room-lex-272-a116",
    "isPrivate": false,
    "aiEnabled": true,
    "aiPrompt": "Be brief.",
    "createdAt": "2026-11-24T04:12:19.599Z"
  }
}
```

</details>

#### `DELETE /api/rooms/:id`

- **Auth:** Bearer JWT required; only the room creator/host may delete.
- **Input format:**

```text
Path param: id = room UUID. No body.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.delete.non_host` | 403 | 403 | PASS | 245 |
| `rooms.delete.success_execute` | 200 | 200 | PASS | 428 |
| `rooms.delete.not_found` | 404 | 404 | PASS | 231 |
| `rooms.delete.no_transcript_cleanup` | 200 | 200 | PASS | 356 |
| `rooms.delete.main_cleanup` | 200 | 200 | PASS | 859 |

<details>
<summary><code>rooms.delete.non_host</code> — 403 — PASS</summary>

- **Method/path:** `DELETE /api/rooms/450016c4-6968-4d63-b867-0a0c80cd335b`
- **Expected status:** `403`
- **Actual status:** `403`
- **Duration:** `245 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Only the room host can delete this room"
}
```

</details>

<details>
<summary><code>rooms.delete.success_execute</code> — 200 — PASS</summary>

- **Method/path:** `DELETE /api/rooms/181043d8-46bf-4f31-b399-8fc351a6c2ae`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `428 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "message": "Room deleted successfully"
}
```

</details>

<details>
<summary><code>rooms.delete.not_found</code> — 404 — PASS</summary>

- **Method/path:** `DELETE /api/rooms/181043d8-46bf-4f31-b399-8fc351a6c2ae`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `231 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Room not found"
}
```

</details>

<details>
<summary><code>rooms.delete.no_transcript_cleanup</code> — 200 — PASS</summary>

- **Method/path:** `DELETE /api/rooms/33cf1d56-d2bc-4234-94d5-5b2b99e9ebe6`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `356 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "message": "Room deleted successfully"
}
```

</details>

<details>
<summary><code>rooms.delete.main_cleanup</code> — 200 — PASS</summary>

- **Method/path:** `DELETE /api/rooms/450016c4-6968-4d63-b867-0a0c80cd335b`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `859 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "message": "Room deleted successfully"
}
```

</details>

#### `POST /api/rooms/token`

- **Auth:** Bearer JWT required (or x-service-token). User must be a room member.
- **Input format:**

```text
{
  "roomId": "string, required, room UUID or room code"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `rooms.token.not_member` | 403 | 403 | PASS | 510 |
| `rooms.token.success` | 200 | 200 | PASS | 320 |
| `rooms.token.validation` | 400 | 400 | PASS | 169 |
| `rooms.token.room_not_found` | 404 | 404 | PASS | 255 |

<details>
<summary><code>rooms.token.not_member</code> — 403 — PASS</summary>

- **Method/path:** `POST /api/rooms/token`
- **Expected status:** `403`
- **Actual status:** `403`
- **Duration:** `510 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b"
}
```

- **Response:**

```json
{
  "error": "You must join this room before connecting to the call"
}
```

</details>

<details>
<summary><code>rooms.token.success</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/rooms/token`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `320 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b"
}
```

- **Response:**

```json
{
  "token": "<redacted>",
  "serverUrl": "ws://127.0.0.1:7880",
  "roomName": "room-lex-272-a116"
}
```

</details>

<details>
<summary><code>rooms.token.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/rooms/token`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `169 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "roomId is required"
}
```

</details>

<details>
<summary><code>rooms.token.room_not_found</code> — 404 — PASS</summary>

- **Method/path:** `POST /api/rooms/token`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `255 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "missing-room"
}
```

- **Response:**

```json
{
  "error": "Room not found"
}
```

</details>

### Calls

#### `POST /api/calls/start`

- **Auth:** Bearer JWT required (or x-service-token). User must be a room member.
- **Input format:**

```text
{
  "roomId": "string, required, room UUID or room code"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.start.validation` | 400 | 400 | PASS | 170 |
| `calls.start.room_not_found` | 404 | 404 | PASS | 261 |
| `calls.start.no_token` | 401 | 401 | PASS | 1 |
| `calls.start.success` | 200 | 200 | PASS | 2122 |
| `calls.start.existing_active` | 200 | 200 | PASS | 1156 |
| `calls.start.no_transcript` | 200 | 200 | PASS | 1532 |

<details>
<summary><code>calls.start.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/calls/start`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `170 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "roomId is required"
}
```

</details>

<details>
<summary><code>calls.start.room_not_found</code> — 404 — PASS</summary>

- **Method/path:** `POST /api/calls/start`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `261 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "missing-room"
}
```

- **Response:**

```json
{
  "error": "Room not found"
}
```

</details>

<details>
<summary><code>calls.start.no_token</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/calls/start`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `1 ms`
- **Request body:**

```json
{
  "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b"
}
```

- **Response:**

```json
{
  "error": "Access denied. No token provided."
}
```

</details>

<details>
<summary><code>calls.start.success</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/start`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `2122 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b"
}
```

- **Response:**

```json
{
  "message": "Call started / active",
  "call": {
    "id": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "startedAt": "2026-11-24T04:12:30.304Z",
    "endedAt": null,
    "status": "active",
    "recordingUrl": null,
    "participants": []
  }
}
```

</details>

<details>
<summary><code>calls.start.existing_active</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/start`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1156 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "lex-272-a116"
}
```

- **Response:**

```json
{
  "message": "Call started / active",
  "call": {
    "id": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "startedAt": "2026-11-24T04:12:30.304Z",
    "endedAt": null,
    "status": "active",
    "recordingUrl": null,
    "participants": [
      {
        "id": "0b733c95-ad5e-4e84-a9fd-c1b55eca3e42",
        "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "joinedAt": "2026-11-24T04:12:31.617Z",
        "leftAt": null,
        "speakingSeconds": 0,
        "wordsSpoken": 0,
        "aiInteractions": 0,
        "user": {
          "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "name": "API Tester A Updated",
          "avatar": null
        }
      }
    ]
  }
}
```

</details>

<details>
<summary><code>calls.start.no_transcript</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/start`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1532 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "roomId": "33cf1d56-d2bc-4234-94d5-5b2b99e9ebe6"
}
```

- **Response:**

```json
{
  "message": "Call started / active",
  "call": {
    "id": "31013874-bf56-4f0a-978c-02a71ba7171e",
    "roomId": "33cf1d56-d2bc-4234-94d5-5b2b99e9ebe6",
    "startedAt": "2026-11-24T04:12:42.627Z",
    "endedAt": null,
    "status": "active",
    "recordingUrl": null,
    "participants": []
  }
}
```

</details>

#### `POST /api/calls/join`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
{
  "callId": "string, required, call UUID"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.join.success` | 200 | 200 | PASS | 608 |
| `calls.join.validation` | 400 | 400 | PASS | 91 |
| `calls.join.not_found` | 404 | 404 | PASS | 211 |

<details>
<summary><code>calls.join.success</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/join`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `608 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810"
}
```

- **Response:**

```json
{
  "message": "Joined call successfully",
  "participant": {
    "id": "8fe36547-a019-4491-9802-61bb5d177cc1",
    "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "userId": "006fd5db-1676-45c6-a579-bbaac0039ded",
    "joinedAt": "2026-11-24T04:12:33.466Z",
    "leftAt": null,
    "speakingSeconds": 0,
    "wordsSpoken": 0,
    "aiInteractions": 0
  }
}
```

</details>

<details>
<summary><code>calls.join.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/calls/join`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `91 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "callId is required"
}
```

</details>

<details>
<summary><code>calls.join.not_found</code> — 404 — PASS</summary>

- **Method/path:** `POST /api/calls/join`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `211 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "missing-call"
}
```

- **Response:**

```json
{
  "error": "Active call not found"
}
```

</details>

#### `POST /api/calls/leave`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
{
  "callId": "string, required, call UUID"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.leave.success` | 200 | 200 | PASS | 661 |
| `calls.leave.validation` | 400 | 400 | PASS | 81 |

<details>
<summary><code>calls.leave.success</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/leave`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `661 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810"
}
```

- **Response:**

```json
{
  "message": "Left call successfully"
}
```

</details>

<details>
<summary><code>calls.leave.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/calls/leave`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `81 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "callId is required"
}
```

</details>

#### `PUT /api/calls/:id/end`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
Path param: id = call UUID. No body.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.end.not_found` | 404 | 404 | PASS | 220 |
| `calls.end.success` | 200 | 200 | PASS | 1105 |

<details>
<summary><code>calls.end.not_found</code> — 404 — PASS</summary>

- **Method/path:** `PUT /api/calls/missing-call/end`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `220 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Call not found"
}
```

</details>

<details>
<summary><code>calls.end.success</code> — 200 — PASS</summary>

- **Method/path:** `PUT /api/calls/90aebf8f-8933-445b-8b86-f2b593f29810/end`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1105 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "message": "Call ended successfully",
  "call": {
    "id": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "startedAt": "2026-11-24T04:12:30.304Z",
    "endedAt": "2026-11-24T04:12:45.268Z",
    "status": "completed",
    "recordingUrl": null
  }
}
```

</details>

#### `GET /api/calls/:id`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
Path param: id = call UUID. No body.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.details.success` | 200 | 200 | PASS | 1534 |
| `calls.details.not_found` | 404 | 404 | PASS | 228 |

<details>
<summary><code>calls.details.success</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/calls/90aebf8f-8933-445b-8b86-f2b593f29810`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1534 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "call": {
    "id": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "roomId": "450016c4-6968-4d63-b867-0a0c80cd335b",
    "startedAt": "2026-11-24T04:12:30.304Z",
    "endedAt": null,
    "status": "active",
    "recordingUrl": null,
    "room": {
      "id": "450016c4-6968-4d63-b867-0a0c80cd335b",
      "name": "API Test Room Renamed",
      "code": "lex-272-a116"
    },
    "participants": [
      {
        "id": "8fe36547-a019-4491-9802-61bb5d177cc1",
        "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
        "userId": "006fd5db-1676-45c6-a579-bbaac0039ded",
        "joinedAt": "2026-11-24T04:12:33.466Z",
        "leftAt": null,
        "speakingSeconds": 0,
        "wordsSpoken": 0,
        "aiInteractions": 0,
        "user": {
          "id": "006fd5db-1676-45c6-a579-bbaac0039ded",
          "name": "API Tester B",
          "avatar": null
        }
      },
      {
        "id": "0b733c95-ad5e-4e84-a9fd-c1b55eca3e42",
        "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "joinedAt": "2026-11-24T04:12:31.617Z",
        "leftAt": null,
        "speakingSeconds": 3,
        "wordsSpoken": 7,
        "aiInteractions": 0,
        "user": {
          "id": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "name": "API Tester A Updated",
          "avatar": null
        }
      }
    ],
    "transcript": {
      "id": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
      "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
      "fullText": "API Tester A Updated: We will ship the API report today.\nLexis AI: I can help with that.",
      "summary": null,
      "createdAt": "2026-11-24T04:12:34.485Z",
      "segments": [
        {
          "id": "9c5e81d2-9643-4abf-80a8-5d96f0c07c1d",
          "transcriptId": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
          "speakerId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
          "speakerName": "API Tester A Updated",
          "content": "We will ship the API report today.",
          "startTime": 0,
          "endTime": 3,
          "sequence": 1,
          "isAi": false
        },
        {
          "id": "09cc5123-c16d-4360-acb4-6fcfa00a0676",
          "transcriptId": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
          "speakerId": "ai_agent",
          "speakerName": "Lexis AI",
          "content": "I can help with that.",
          "startTime": 3,
          "endTime": 5,
          "sequence": 2,
          "isAi": true
        }
      ]
    },
    "meetingSummary": {
      "id": "a158882e-2729-4233-83c2-53f21ea8ee48",
      "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
      "overview": "Meeting concluded with discussions across all participants. (Generated via offline developer mode)",
      "decisions": [
        "Adopted modular microservice architecture",
        "Used PostgreSQL for persistence"
      ],
      "actionItems": [
        {
          "task": "Set up API keys in .env",
          "assignee": "API Tester B",
          "deadline": "ASAP"
        }
      ],
      "participantNotes": {
        "API Tester B": "Participated in call discussions.",
        "API Tester A Updated": "Participated in call discussions."
      },
      "createdAt": "2026-11-24T04:12:37.205Z"
    },
    "aiUsages": [
      {
        "id": "ec593628-22b2-4405-a14f-a437cd86bfc6",
        "userId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
        "model": "offline-fallback",
        "inputTokens": 0,
        "outputTokens": 0,
        "sttDuration": 0,
        "ttsDuration": 0,
        "estimatedCost": 0,
        "createdAt": "2026-11-24T04:12:38.310Z"
      }
    ]
  }
}
```

</details>

<details>
<summary><code>calls.details.not_found</code> — 404 — PASS</summary>

- **Method/path:** `GET /api/calls/missing-call`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `228 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Call not found"
}
```

</details>

#### `POST /api/calls/transcript/segment`

- **Auth:** Bearer JWT or x-service-token. The LiveKit agent uses x-service-token.
- **Input format:**

```text
{
  "callId": "string, required, call UUID",
  "content": "string, required, transcript text",
  "speakerId?": "string | null, user UUID or ai_agent",
  "speakerName?": "string",
  "isAi?": "boolean, default false",
  "startTime?": "number, seconds, default 0",
  "endTime?": "number, seconds, default 0",
  "sequence?": "integer, default 0"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.transcript.validation` | 400 | 400 | PASS | 171 |
| `calls.transcript.human` | 201 | 201 | PASS | 1589 |
| `calls.transcript.agent_correct_service_token` | 201 | 201 | PASS | 388 |
| `calls.transcript.agent_env_service_token` | 401 | 401 | PASS | 2 |

<details>
<summary><code>calls.transcript.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/calls/transcript/segment`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `171 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810"
}
```

- **Response:**

```json
{
  "error": "callId and content are required"
}
```

</details>

<details>
<summary><code>calls.transcript.human</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/calls/transcript/segment`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `1589 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
  "speakerId": null,
  "speakerName": "API Tester A Updated",
  "content": "We will ship the API report today.",
  "isAi": false,
  "startTime": 0,
  "endTime": 3,
  "sequence": 1
}
```

- **Response:**

```json
{
  "message": "Transcript segment saved",
  "segment": {
    "id": "9c5e81d2-9643-4abf-80a8-5d96f0c07c1d",
    "transcriptId": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
    "speakerId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
    "speakerName": "API Tester A Updated",
    "content": "We will ship the API report today.",
    "startTime": 0,
    "endTime": 3,
    "sequence": 1,
    "isAi": false
  }
}
```

</details>

<details>
<summary><code>calls.transcript.agent_correct_service_token</code> — 201 — PASS</summary>

- **Method/path:** `POST /api/calls/transcript/segment`
- **Expected status:** `201`
- **Actual status:** `201`
- **Duration:** `388 ms`
- **Request headers:**

```json
{
  "x-service-token": "<service-token>",
  "Content-Type": "application/json"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
  "speakerId": "ai_agent",
  "speakerName": "Lexis AI",
  "content": "I can help with that.",
  "isAi": true,
  "startTime": 3,
  "endTime": 5,
  "sequence": 2
}
```

- **Response:**

```json
{
  "message": "Transcript segment saved",
  "segment": {
    "id": "09cc5123-c16d-4360-acb4-6fcfa00a0676",
    "transcriptId": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
    "speakerId": "ai_agent",
    "speakerName": "Lexis AI",
    "content": "I can help with that.",
    "startTime": 3,
    "endTime": 5,
    "sequence": 2,
    "isAi": true
  }
}
```

</details>

<details>
<summary><code>calls.transcript.agent_env_service_token</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/calls/transcript/segment`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `2 ms`
- **Note:** Integration check: agent/.env service token does not match backend default.
- **Request headers:**

```json
{
  "x-service-token": "<service-token>",
  "Content-Type": "application/json"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
  "speakerId": "ai_agent",
  "speakerName": "Lexis AI",
  "content": "This uses the token currently in agent/.env.",
  "isAi": true,
  "startTime": 5,
  "endTime": 6,
  "sequence": 3
}
```

- **Response:**

```json
{
  "error": "Access denied. No token provided."
}
```

</details>

#### `GET /api/calls/:callId/transcript`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
Path param: callId = call UUID. No body.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.transcript.get` | 200 | 200 | PASS | 479 |
| `calls.transcript.get_not_found` | 404 | 404 | PASS | 385 |

<details>
<summary><code>calls.transcript.get</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/calls/90aebf8f-8933-445b-8b86-f2b593f29810/transcript`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `479 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "transcript": {
    "id": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
    "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "fullText": "API Tester A Updated: We will ship the API report today.\nLexis AI: I can help with that.",
    "summary": null,
    "createdAt": "2026-11-24T04:12:34.485Z",
    "segments": [
      {
        "id": "9c5e81d2-9643-4abf-80a8-5d96f0c07c1d",
        "transcriptId": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
        "speakerId": "c6e3195d-cf94-43f1-991b-a25f3413a3fe",
        "speakerName": "API Tester A Updated",
        "content": "We will ship the API report today.",
        "startTime": 0,
        "endTime": 3,
        "sequence": 1,
        "isAi": false
      },
      {
        "id": "09cc5123-c16d-4360-acb4-6fcfa00a0676",
        "transcriptId": "053fab71-f677-4e8c-9ac2-c1e06aca70ca",
        "speakerId": "ai_agent",
        "speakerName": "Lexis AI",
        "content": "I can help with that.",
        "startTime": 3,
        "endTime": 5,
        "sequence": 2,
        "isAi": true
      }
    ]
  }
}
```

</details>

<details>
<summary><code>calls.transcript.get_not_found</code> — 404 — PASS</summary>

- **Method/path:** `GET /api/calls/missing-call/transcript`
- **Expected status:** `404`
- **Actual status:** `404`
- **Duration:** `385 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "error": "Transcript not found for this call"
}
```

</details>

#### `POST /api/calls/summary`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
{
  "callId": "string, required, call UUID",
  "overview": "string, required",
  "decisions?": "string[]",
  "actionItems?": "array of { task, assignee, deadline? }",
  "participantNotes?": "object keyed by participant name"
}
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.summary.validation` | 400 | 400 | PASS | 204 |
| `calls.summary.save` | 200 | 200 | PASS | 307 |

<details>
<summary><code>calls.summary.validation</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/calls/summary`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `204 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810"
}
```

- **Response:**

```json
{
  "error": "callId and overview are required"
}
```

</details>

<details>
<summary><code>calls.summary.save</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/summary`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `307 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{
  "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
  "overview": "The team agreed to ship the API report.",
  "decisions": [
    "Ship the report"
  ],
  "actionItems": [
    {
      "task": "Review report",
      "assignee": "API Tester A Updated",
      "deadline": "Today"
    }
  ],
  "participantNotes": {
    "API Tester A Updated": "Led the discussion."
  }
}
```

- **Response:**

```json
{
  "message": "Meeting summary saved successfully",
  "summary": {
    "id": "a158882e-2729-4233-83c2-53f21ea8ee48",
    "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "overview": "The team agreed to ship the API report.",
    "decisions": [
      "Ship the report"
    ],
    "actionItems": [
      {
        "task": "Review report",
        "assignee": "API Tester A Updated",
        "deadline": "Today"
      }
    ],
    "participantNotes": {
      "API Tester A Updated": "Led the discussion."
    },
    "createdAt": "2026-11-24T04:12:37.205Z"
  }
}
```

</details>

#### `POST /api/calls/:id/generate-summary`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
Path param: id = call UUID. No body. Requires a non-empty transcript.fullText.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `calls.summary.generate` | 200 | 200 | PASS | 1232 |
| `calls.summary.generate_no_transcript` | 400 | 400 | PASS | 748 |

<details>
<summary><code>calls.summary.generate</code> — 200 — PASS</summary>

- **Method/path:** `POST /api/calls/90aebf8f-8933-445b-8b86-f2b593f29810/generate-summary`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1232 ms`
- **Note:** Backend has no Gemini/OpenAI key in process env; offline fallback expected.
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "message": "Meeting summary generated successfully",
  "summary": {
    "id": "a158882e-2729-4233-83c2-53f21ea8ee48",
    "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
    "overview": "Meeting concluded with discussions across all participants. (Generated via offline developer mode)",
    "decisions": [
      "Adopted modular microservice architecture",
      "Used PostgreSQL for persistence"
    ],
    "actionItems": [
      {
        "task": "Set up API keys in .env",
        "assignee": "API Tester B",
        "deadline": "ASAP"
      }
    ],
    "participantNotes": {
      "API Tester B": "Participated in call discussions.",
      "API Tester A Updated": "Participated in call discussions."
    },
    "createdAt": "2026-11-24T04:12:37.205Z"
  },
  "metrics": {
    "model": "offline-fallback",
    "inputTokens": 0,
    "outputTokens": 0,
    "estimatedCost": 0
  }
}
```

</details>

<details>
<summary><code>calls.summary.generate_no_transcript</code> — 400 — PASS</summary>

- **Method/path:** `POST /api/calls/31013874-bf56-4f0a-978c-02a71ba7171e/generate-summary`
- **Expected status:** `400`
- **Actual status:** `400`
- **Duration:** `748 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Request body:**

```json
{}
```

- **Response:**

```json
{
  "error": "Call has no transcript to summarize. Participants must speak before generating a summary."
}
```

</details>

### Users

#### `GET /api/users/analytics`

- **Auth:** Bearer JWT required (or x-service-token).
- **Input format:**

```text
No headers other than auth, no body, no params.
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `users.analytics.success` | 200 | 200 | PASS | 1827 |
| `users.analytics.no_token` | 401 | 401 | PASS | 1 |

<details>
<summary><code>users.analytics.success</code> — 200 — PASS</summary>

- **Method/path:** `GET /api/users/analytics`
- **Expected status:** `200`
- **Actual status:** `200`
- **Duration:** `1827 ms`
- **Request headers:**

```json
{
  "Authorization": "Bearer <jwt>"
}
```

- **Response:**

```json
{
  "lifetime": {
    "totalMeetings": 1,
    "totalSpeakingSeconds": 3,
    "totalSpeakingMinutes": 0,
    "totalWordsSpoken": 7,
    "totalAiInteractions": 0,
    "totalAiCost": 0
  },
  "recentMeetings": [
    {
      "callId": "90aebf8f-8933-445b-8b86-f2b593f29810",
      "roomName": "API Test Room Renamed",
      "roomCode": "lex-272-a116",
      "startedAt": "2026-11-24T04:12:30.304Z",
      "endedAt": "2026-11-24T04:12:45.268Z",
      "status": "completed",
      "durationMinutes": 0,
      "summaryOverview": "Meeting concluded with discussions across all participants. (Generated via offline developer mode)",
      "speakingSeconds": 3,
      "wordsSpoken": 7
    }
  ]
}
```

</details>

<details>
<summary><code>users.analytics.no_token</code> — 401 — PASS</summary>

- **Method/path:** `GET /api/users/analytics`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `1 ms`
- **Response:**

```json
{
  "error": "Access denied. No token provided."
}
```

</details>

### LiveKit

#### `POST /api/livekit/webhook`

- **Auth:** LiveKit signature in Authorization header. Raw JSON body with Content-Type: application/webhook+json.
- **Input format:**

```text
Raw JSON body, e.g.:
{
  "event": "participant_left" | "room_finished",
  "room": { "name": "room-<code>" },
  "participant": { "identity": "<userId>" }
}
Header: Authorization: <LiveKit-signed JWT>
```

| Case | Expected | Actual | Result | ms |
|---|---:|---:|---|---:|
| `webhook.unsigned_webhook_content_type` | 401 | 401 | PASS | 4 |
| `webhook.unsigned_json_content_type` | 401 | 401 | PASS | 2 |

<details>
<summary><code>webhook.unsigned_webhook_content_type</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/livekit/webhook`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `4 ms`
- **Request headers:**

```json
{
  "Content-Type": "application/webhook+json"
}
```

- **Raw request data:**

```text
{"event": "room_finished", "room": {"name": "room-test"}}
```

- **Response:**

```json
{
  "error": "Webhook signature invalid"
}
```

</details>

<details>
<summary><code>webhook.unsigned_json_content_type</code> — 401 — PASS</summary>

- **Method/path:** `POST /api/livekit/webhook`
- **Expected status:** `401`
- **Actual status:** `401`
- **Duration:** `2 ms`
- **Request headers:**

```json
{
  "Content-Type": "application/json"
}
```

- **Raw request data:**

```text
{"event": "room_finished", "room": {"name": "room-test"}}
```

- **Response:**

```json
{
  "error": "Webhook signature invalid"
}
```

</details>

