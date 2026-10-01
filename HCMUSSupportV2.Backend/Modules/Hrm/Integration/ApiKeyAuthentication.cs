using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HCMUSSupportV2.Backend.Modules.Hrm.Integration;

public static class ApiKeyDefaults
{
    public const string Scheme = "ApiKey";
    public const string ScopeClaim = "scope";
    public const string ClientIdClaim = "api_client_id";
    public const string ClientNameClaim = "api_client";
}

public static class ApiScopes
{
    public const string HrmIngest = "hrm.ingest";
}

public static class ApiTokens
{
    /// <summary>Lower-case hex SHA-256 of the token: what <c>api_clients.token_hash</c> stores.</summary>
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    /// <summary>A new random token (256 bits, URL-safe base64).</summary>
    public static string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

/// <summary>
/// <c>Authorization: ApiKey &lt;token&gt;</c>. The token is hashed (SHA-256) and looked up in <c>api_clients</c> (not
/// revoked). The principal carries one <c>scope</c> claim per granted scope. Anything else is anonymous (401).
/// </summary>
public class ApiKeyAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, TimeProvider time)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("Authorization", out var header)) return AuthenticateResult.NoResult();
        var value = header.ToString();
        var prefix = ApiKeyDefaults.Scheme + " ";
        if (!value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return AuthenticateResult.NoResult();

        var token = value[prefix.Length..].Trim();
        if (token.Length == 0) return AuthenticateResult.Fail("Empty API key.");

        var db = Context.RequestServices.GetRequiredService<AppDbContext>();
        var hash = ApiTokens.Hash(token);
        var client = await db.Set<ApiClient>().FirstOrDefaultAsync(c => c.TokenHash == hash, Context.RequestAborted);
        if (client is null || client.RevokedAt is not null) return AuthenticateResult.Fail("Invalid API key.");

        var now = time.GetUtcNow();
        if (client.LastUsedAt is null || now - client.LastUsedAt > TimeSpan.FromMinutes(1))
        {
            client.LastUsedAt = now;
            await db.SaveChangesAsync(Context.RequestAborted);
        }

        var claims = new List<Claim>
        {
            new(ApiKeyDefaults.ClientIdClaim, client.Id.ToString()),
            new(ApiKeyDefaults.ClientNameClaim, client.Name),
        };
        claims.AddRange(client.Scopes.Select(s => new Claim(ApiKeyDefaults.ScopeClaim, s)));
        var identity = new ClaimsIdentity(claims, ApiKeyDefaults.Scheme, ApiKeyDefaults.ClientNameClaim, ClaimTypes.Role);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), ApiKeyDefaults.Scheme));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.Headers.WWWAuthenticate = ApiKeyDefaults.Scheme;
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }

    protected override Task HandleForbiddenAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    }
}

/// <summary>Creates and revokes API clients. Admin pages (D14b) and the Development seed use it.</summary>
public class ApiClientService(AppDbContext db, TimeProvider time)
{
    /// <summary>Creates a client and returns the plain token, which is shown once and never stored.</summary>
    public async Task<(ApiClient Client, string Token)> CreateAsync(string name, IEnumerable<string> scopes, string? token = null, CancellationToken ct = default)
    {
        token ??= ApiTokens.NewToken();
        var client = new ApiClient
        {
            Name = name,
            TokenHash = ApiTokens.Hash(token),
            Scopes = scopes.Distinct().ToArray(),
            CreatedAt = time.GetUtcNow(),
        };
        db.Set<ApiClient>().Add(client);
        await db.SaveChangesAsync(ct);
        return (client, token);
    }

    public async Task<bool> RevokeAsync(long id, CancellationToken ct = default)
    {
        var client = await db.Set<ApiClient>().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return false;
        client.RevokedAt ??= time.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return true;
    }
}

/// <summary>
/// Development only: when <c>Hrm:DevApiClient:Token</c> is set (git-ignored local settings), makes sure a client named
/// <c>dev</c> with scope <c>hrm.ingest</c> exists for that token, so the Sync tool can be tried without an admin page.
/// </summary>
public class DevApiClientSeeder(IServiceScopeFactory scopes, IHostEnvironment env, IConfiguration config, ILogger<DevApiClientSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        var token = config["Hrm:DevApiClient:Token"];
        if (!env.IsDevelopment() || string.IsNullOrWhiteSpace(token)) return;
        if (token.Length < 24) { logger.LogWarning("Hrm:DevApiClient:Token is shorter than 24 characters; ignored."); return; }

        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hash = ApiTokens.Hash(token);
            if (await db.Set<ApiClient>().AnyAsync(c => c.TokenHash == hash || c.Name == "dev", ct)) return;
            await scope.ServiceProvider.GetRequiredService<ApiClientService>().CreateAsync("dev", [ApiScopes.HrmIngest], token, ct);
            logger.LogInformation("Dev API client 'dev' (scope {Scope}) created from Hrm:DevApiClient:Token.", ApiScopes.HrmIngest);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not seed the dev API client (database not migrated yet?).");
        }
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
