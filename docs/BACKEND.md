# Backend guide

ASP.NET Core 8 (`net8.0`), EF Core 9 + Npgsql, PostgreSQL 17. Solution layout:

```
HCMUSSupportV2.Backend/
  Program.cs                    one line per module
  Infrastructure/               host-wide setup: local config, Serilog, OpenTelemetry, DB, health, rate limiter, ProblemDetails
  Data/AppDbContext.cs          the single DbContext (no DbSet properties, see "Add an entity")
  Migrations/                   EF migrations, one per delivery: D<NN>_<Name>
  Modules/<Module>/<Feature>/   controller, service, DTO records, entity + <Entity>Configuration.cs
  Modules/Platform/             system info, jobs, files, audit (D01)
  Modules/Identity/             people, roles, groups schema, sign-in, policies (D03)
HCMUSSupportV2.Backend.Tests/   xUnit + WebApplicationFactory against a throw-away PostgreSQL database
```

## Configure a dev machine

1. Create your database (per branch, see PLAN §8). With the tools in `D:\tools\pgsql\bin`:
   `psql -h 10.0.0.11 -p 65432 -U sa -d postgres -c "CREATE DATABASE hcmus_support_dev_d01"`.
2. Copy `HCMUSSupportV2.Backend/appsettings.Development.local.json.example` to
   `appsettings.Development.local.json` (git-ignored via `*.local.json`) and fill in the connection string and, later,
   the `Auth:Google:*` keys. Never commit this file.
3. `Program.cs` loads `appsettings.{Environment}.local.json` as an optional file *after* `appsettings.{Environment}.json`;
   environment variables and command-line arguments still win (e.g. `ConnectionStrings__Default`).

Note the local file only loads for the matching environment: `dotnet run` without a launch profile runs as
`Production`, so set `ASPNETCORE_ENVIRONMENT=Development` (the `http`/`https` launch profiles already do).

Key settings (defaults in `appsettings.json`):

| Key | Meaning |
|---|---|
| `ConnectionStrings:Default` | PostgreSQL connection string (required) |
| `Database:MigrateOnStartup` | apply pending migrations at startup; default `true` in Development, `false` otherwise |
| `Storage:LocalRoot` / `MaxBytes` / `AllowedContentTypes` | local file store root (default `App_Data/files`, git-ignored), size limit, MIME allowlist (`type/*` allowed) |
| `Jobs:Enabled` / `WorkerCount` / `PollIntervalMs` / `LeaseSeconds` / `BackoffBaseSeconds` / `BackoffMaxSeconds` | job worker |
| `RateLimiting:Auth` / `RateLimiting:Integration` | `PermitLimit` and `WindowSeconds` per client IP for the `auth` and `integration` policies |
| `Auth:Google:ClientId` / `ClientSecret` | Google OAuth web client (local file or env only; never committed). Without them `GET /api/auth/login` answers 503 |
| `Auth:DevLogin:Enabled` | enables `POST /api/auth/dev-login`; honoured only when the environment is `Development` |
| `Auth:RevalidateSeconds` | how often the session is re-checked against the database (default 300; 0 = every request) |
| `Admin:BootstrapEmails` | array of emails that become `admin` while no active admin exists (see Bootstrap) |
| `Dev:SeedEmployees` | Development only: seed the synthetic roster `T0001`..`T0010` at startup (default true in Development) |
| `OpenTelemetry:Endpoint` | OTLP collector URL; traces and metrics are exported only when set (`OpenTelemetry:Protocol`: `grpc` or `http/protobuf`) |
| `Logging:File:*` | rolling file sink (`logs/hcmus-support-.log`, git-ignored); log levels live under `Serilog:MinimumLevel` |
| `ReverseProxy:KnownProxies` / `KnownNetworks` | forwarded-headers trust |

## Run

```
cd HCMUSSupportV2.Backend
dotnet run --launch-profile http          # http://localhost:5161, Development, migrates the database
curl http://localhost:5161/healthz        # Healthy (also checks the database)
curl http://localhost:5161/api/system/info
```

The first build also runs `npm install` and `npm run build` for the frontend (the Frontend project is a build
dependency that emits into the backend's `wwwroot`), so it is slow once.

## Test

```
dotnet test        # from the repository root
```

The `PostgresFixture` connects to the server named by the `HCMUS_TEST_PG` environment variable (a superuser connection
string), or falls back to `ConnectionStrings:Default` in `HCMUSSupportV2.Backend/appsettings.Development.local.json`
with the database switched to `postgres`. It creates `hcmus_support_test_<guid>`, applies the migrations, and drops the
database when the run ends. `TestApiFactory` boots the real app (environment `Testing`) on that database, with the job
worker off unless a test enables it (`Jobs:Enabled=true`) and file storage in a temp folder. Put test classes in the
`postgres` collection so they share one database sequentially.

Every endpoint needs a happy-path test and a forbidden-role test (PLAN §8). Use synthetic data only.

## Add a module

1. Create `Modules/<Name>/` with feature folders `Modules/<Name>/<Feature>/` holding the controller, service, DTO records,
   entities and `<Entity>Configuration.cs`.
2. Add `Modules/<Name>/<Name>Module.cs`:

   ```csharp
   public static class NotificationsModule
   {
       public static IServiceCollection AddNotificationsModule(this IServiceCollection services, IConfiguration configuration)
       {
           services.AddScoped<INotificationService, NotificationService>();
           services.AddJobHandler<PublishNotificationJob>();   // background work
           // authorization policies, options, ...
           return services;
       }
   }
   ```
3. Add exactly one line to `Program.cs`: `builder.Services.AddNotificationsModule(builder.Configuration);`.
   Controllers are discovered automatically because everything lives in the one assembly.

Shared services you can inject: `IJobQueue`, `IFileStore`, `IAuditLogger`, `AppDbContext` (and
`IDbContextFactory<AppDbContext>` when you need an independent, short-lived context).

### Add an entity

`AppDbContext` has no `DbSet` properties (only `DataProtectionKeys`, which the data-protection store requires). Put
`<Entity>Configuration : IEntityTypeConfiguration<Entity>` next to the entity; `ApplyConfigurationsFromAssembly` picks
it up and registers the entity. Set the table name explicitly (`b.ToTable("employees")`), because without a `DbSet` EF
would use the singular class name. Column names are snake_cased automatically. Query with `db.Set<Entity>()`.
Generate ids with `UUIDNext` (`Uuid.NewDatabaseFriendly(Database.PostgreSql)` gives a v7 uuid), not `Guid.CreateVersion7`
(.NET 9+).

## Authentication and authorization (D03, `Modules/Identity`)

### Sign-in flow

1. The SPA sends the browser to `GET /api/auth/login?returnUrl=/some/local/path` (only local paths are honoured, the
   default is `/`). The backend redirects to Google (authorization-code flow with PKCE, scopes `openid email profile`,
   always the account chooser) and Google returns to **`/api/auth/callback`**.
2. The OIDC handler validates the id token (signature, issuer `https://accounts.google.com`, audience = our client id,
   nonce, lifetime). `OnTokenValidated` then applies the application rules in `GoogleSignInService`:
   `email_verified` must be true, the email must exist in `employee_emails` (case-insensitive) and its employee must be
   `active`. The Google tokens are discarded (`SaveTokens=false`); only an application principal goes into the cookie
   (claims `code`, `name`, `picture`, `role`). A changed Google picture is stored in `employees.photo_url`.
3. Success: the browser lands on `returnUrl`. Failure: it lands on
   `/login?error=not_registered | inactive | unverified_email | oauth_failed | access_denied` (the SPA login page shows
   a Vietnamese message). Every outcome is audited: `auth.login`, `auth.denied` (with `reason` and the email, never a
   token), `auth.logout`, `auth.dev_login`.
4. `GET /api/auth/me` returns the signed-in employee, `POST /api/auth/logout` ends the session.

**Required Google redirect URIs.** The owner must register `http://localhost:5161/api/auth/callback` on the v1 web client
in Google Cloud Console (and the production URL later). Until then a real sign-in cannot complete; everything else is
covered by tests and by dev-login.

### Session cookie

`__Host-hcmus`: HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, sliding 12 h. In the **Development** environment the
cookie is named `hcmus` and Secure is only required over https (the `__Host-` prefix would be rejected on plain
`http://localhost`). API calls never get a redirect to Google or to a login page: anonymous requests answer **401**, and a
signed-in user lacking the role gets **403**. The cookie principal is re-checked against the database every
`Auth:RevalidateSeconds`, so deactivating an employee or changing a role takes effect without a new sign-in.

### `/api/auth` endpoints

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/login?returnUrl=` | redirect to Google; 503 when `Auth:Google` is not configured; rate limited (`auth`) |
| `GET /api/auth/callback` | handled by the OIDC middleware, not a controller; exempt from antiforgery |
| `POST /api/auth/logout` | 204; audited; needs the antiforgery header when a session exists; rate limited (`auth`) |
| `GET /api/auth/me` | `{code, fullName, unit, photoUrl, emails[], roles[], actingAs}`; 401 anonymous. Not rate limited (the SPA calls it on every load and campus users share NAT addresses). Also (re)issues `XSRF-TOKEN` |
| `POST /api/auth/dev-login {employeeCode}` | see below; 404 unless Development **and** `Auth:DevLogin:Enabled=true`; rate limited (`auth`) |

`roles` always contains `employee`, plus `editor` and/or `admin` when assigned (for example `["employee","editor"]`).
An admin has every editor right (the server policies treat admin as a superset), so the frontend should treat
`roles.includes('editor') || roles.includes('admin')` as "can edit". `unit` is the employee org unit name (or null).
`emails` lists the primary address first. `actingAs` is always null until view-as lands (D14a).

### Antiforgery contract (for the frontend)

Double-submit with ASP.NET antiforgery:

- After sign-in, call `GET /api/auth/me`. Its response sets the JS-readable cookie **`XSRF-TOKEN`** (Secure outside
  Development, SameSite=Lax) next to the HttpOnly antiforgery cookie (`__Host-hcmus-af`, `hcmus-af` in Development).
  `me` always refreshes the token, so call it again after any sign-in or user switch.
- Every **unsafe** request (`POST`, `PUT`, `PATCH`, `DELETE`) to `/api/*` made with the session cookie must send the
  cookie value in the header **`X-XSRF-TOKEN`**. Otherwise the backend answers **400**
  (`title: "Antiforgery token missing or invalid"`). The generated NSwag client takes a custom `http: { fetch }` object:
  pass a wrapper that adds the header on unsafe methods.
- The token is bound to the signed-in user: after logout or a login as someone else, fetch a fresh one via `me`.
- Exempt: `GET`/`HEAD`/`OPTIONS`/`TRACE`, `/api/integration/*` (ApiKey, no cookie), `/api/auth/callback`,
  `/api/auth/dev-login`, and requests with no session (they simply get 401 from authorization).

```ts
const token = () => document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1];
const apiFetch = (url: RequestInfo, init: RequestInit = {}) => {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase());
  const t = token();
  return fetch(url, { ...init, credentials: 'same-origin',
    headers: { ...init.headers, ...(unsafe && t ? { 'X-XSRF-TOKEN': decodeURIComponent(t) } : {}) } });
};
// new AuthClient(undefined, { fetch: apiFetch })
```

### Dev-login

`POST /api/auth/dev-login {"employeeCode":"T0001"}` signs the cookie in directly as an existing **active** employee (400
for unknown or inactive codes) and returns the same body as `me`. It exists only when `ASPNETCORE_ENVIRONMENT=Development`
and `Auth:DevLogin:Enabled=true` (put it in `appsettings.Development.local.json`); anywhere else it is a plain 404. In
Development the synthetic roster is seeded at startup (`DevDataSeeder`, idempotent): `T0001`..`T0010` with emails
`t0001@dev.hcmus.local`.., `T0001` is **admin**, `T0002` **editor**, the rest plain employees, all in the unit
"Đơn vị thử nghiệm". Turn the seeding off with `Dev:SeedEmployees=false`. Never enable dev-login outside a developer machine.

### Roles and policies

`Modules/Identity/Authorization/Policies.cs` holds the named policies (PLAN §4): the three base levels `Policies.Employee`
(any signed-in employee), `Policies.Editor` (editor or admin) and `Policies.Admin`, plus one named policy per capability
of the §4 table (`ManageNotifications`, `ManageGroups`, `ManageEmployeeEmails`, `ViewEmployeeDirectory` are editor
level; `GrantRoles`, `ViewAs`, `ManageEmployees`, `ManageDatasets`, `ManageApiClients`, `ViewAuditLog` are admin only).
Use `[Authorize(Policy = Policies.ManageNotifications)]` so a capability can move between roles without touching
controllers; modules add their own policies in their `AddXxxModule`. Inject `ICurrentUser` for the code and roles
(`IsEditor` is true for editors **and** admins, `IsAdmin` only for admins).

**Last admin guard.** `LastAdminGuard.EnsureNotLastAdminAsync(code)` throws `LastAdminException` when `code` is the only
active admin. Call it before revoking the admin role or deactivating an employee (D14a).

**Bootstrap.** `Admin:BootstrapEmails` (array) grants `admin` to the employees behind those emails while the database has
no active admin: at startup, and again when one of those emails signs in (so it also works when the roster is synced
after the first start). The grant is audited as `roles.bootstrap_admin`.

### Tables (migration `D03_Identity`)

`org_units`, `employees` (PK `code` = MSCB; `full_name_unaccent` is a stored generated column `f_unaccent(full_name)`
with a trigram GIN index), `employee_emails` (`email citext` PK), `role_assignments` (role CHECK `editor|admin`),
`groups` and `group_members` (schema only, the engine is D06). `org_units.hrm_id` is required; the Development roster uses
`-1` for its synthetic unit. Query them with `db.Set<Employee>()` etc. (namespaces `Identity.Directory`,
`Identity.Authorization`, `Identity.Groups`).

### Testing auth

`IdentityTestSupport` creates synthetic employees (`CreateEmployeeAsync`), builds fake Google id-token principals and
gives `CreateSessionClient()` (https base address, cookies kept, no redirects). `TestApiFactory` takes an `environment`
(default `Testing`, which behaves like production: `__Host-` cookie, no dev-login) and by default turns the roster seed
off, fakes the Google client id and secret and revalidates the session on every request. `TestControllers.Add` registers
test-only endpoints (`/api/test/employee|editor|admin|write`, `/api/test/sign-in/{code}`) for policy and antiforgery tests.
A Development test host also reads `appsettings.Development.local.json`; settings passed to the factory win.

## Background jobs

```csharp
var id = await jobQueue.EnqueueAsync("notifications.publish", new { notificationId }, runAt: null, maxAttempts: 5);
```

Implement `IJobHandler` (`Type` is the job type string) and register it with `services.AddJobHandler<T>()`. The
hosted `JobWorker` claims one due job at a time with `FOR UPDATE SKIP LOCKED`, so any number of instances can run.
Each claim counts as an attempt and leases the row for `Jobs:LeaseSeconds`; a crashed worker's job becomes due again
after the lease. A handler that throws is retried after `BackoffBaseSeconds * 2^(attempt-1)` seconds (capped) with
`last_error` recorded. After `max_attempts`, the row gets `done_at` and keeps `last_error` (a finished job with a
`last_error` failed for good; a successful job has `last_error = NULL`). `platform.noop` is a built-in handler that
does nothing, handy for smoke tests.

## Add a migration

One migration per delivery, named `D<NN>_<Name>`, generated last, after rebasing onto `main`. If the model snapshot
conflicts, delete your migration, rebase and regenerate it. Never edit a merged migration.

```
cd HCMUSSupportV2.Backend
dotnet ef migrations add D03_Auth -o Migrations
dotnet ef database update
```

The EF tools start the app to read configuration, so `ConnectionStrings:Default` must resolve (the local file is only
loaded when `ASPNETCORE_ENVIRONMENT=Development`, which `dotnet ef` uses by default). Put raw SQL (functions,
`CREATE TEXT SEARCH ...`, generated tsvector columns) in `migrationBuilder.Sql(...)`.

The `D01_Platform` baseline creates the `citext`, `unaccent` and `pg_trgm` extensions, the `public.f_unaccent(text)`
IMMUTABLE wrapper and the `vn_unaccent` text search configuration (`simple` mapped through `unaccent`), so use
`to_tsvector('vn_unaccent', ...)` and `f_unaccent(...)` in generated columns and trigram indexes.

## Regenerate the TypeScript client

Run `generate-api.cmd` from the repository root after changing controllers or DTOs, and commit
`HCMUSSupportV2.Frontend/src/api/generated-client.ts`. Use the controller name for the client (`SystemController`
becomes `SystemClient`).

## Known gaps

- Data-protection keys are stored in `data_protection_keys` unencrypted (ASP.NET Core logs a warning). Protect them
  with a certificate or an OS-level mechanism as part of the deployment kit (D16).
- The `auth` rate-limit policy is applied to `AuthController` (except `me`); `/api/auth/callback` is served by the OIDC
  middleware and is not rate limited. The `integration` policy is still unused until the ingest controllers exist (D04):
  apply it with `[EnableRateLimiting("integration")]`.
- The generated TypeScript client does not add `X-XSRF-TOKEN` by itself; the frontend must wrap `fetch` (see the contract above).
