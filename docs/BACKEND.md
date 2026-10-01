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
- Rate-limit policies `auth` and `integration` are registered but not applied to any endpoint yet; apply them with
  `[EnableRateLimiting("auth")]` on the auth and integration controllers.
