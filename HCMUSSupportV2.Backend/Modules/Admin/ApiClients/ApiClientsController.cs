using HCMUSSupportV2.Backend.Data;
using HCMUSSupportV2.Backend.Modules.Hrm.Domain;
using HCMUSSupportV2.Backend.Modules.Hrm.Integration;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Platform.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HCMUSSupportV2.Backend.Modules.Admin.ApiClients;

/// <summary>An API client as listed. The token (or its hash) is never part of it.</summary>
public record ApiClientDto(long Id, string Name, IReadOnlyList<string> Scopes, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt, DateTimeOffset? RevokedAt);

public record ApiScopeDto(string Scope, string Description);

public record CreateApiClientRequest(string? Name, IReadOnlyList<string>? Scopes);

/// <summary>The one response that carries the plain token. It cannot be read again.</summary>
public record ApiClientCreatedDto(ApiClientDto Client, string Token);

/// <summary>Admin management of the API clients used by <c>/api/integration/v1/*</c> (Sync tool, one-off legacy migration).</summary>
[ApiController]
[Route("api/admin/api-clients")]
[Authorize(Policy = Policies.ManageApiClients)]
public class ApiClientsController(AppDbContext db, ApiClientService clients, IAuditLogger audit) : ControllerBase
{
    public const string CreatedAction = "apiclient.created";
    public const string RevokedAction = "apiclient.revoked";
    public const int MaxNameLength = 100;

    private static ApiClientDto ToDto(ApiClient c) => new(c.Id, c.Name, c.Scopes, c.CreatedAt, c.LastUsedAt, c.RevokedAt);

    /// <summary>All clients, newest first (revoked ones included, so the history stays visible).</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ApiClientDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok((await db.Set<ApiClient>().AsNoTracking().OrderByDescending(c => c.Id).ToListAsync(ct)).Select(ToDto).ToList());

    /// <summary>The scopes the backend knows, with a description each.</summary>
    [HttpGet("scopes")]
    [ProducesResponseType<IReadOnlyList<ApiScopeDto>>(StatusCodes.Status200OK)]
    public IActionResult Scopes() => Ok(ApiScopes.Known.Select(k => new ApiScopeDto(k.Scope, k.Description)).ToList());

    /// <summary>
    /// Creates a client with a server-generated token, stored only as a hash. The plain token is in this response
    /// and nowhere else: it is not logged and not audited. 400 for a blank or too long name, no scope or an unknown scope.
    /// </summary>
    [HttpPost]
    [ProducesResponseType<ApiClientCreatedDto>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateApiClientRequest request, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length == 0 || name.Length > MaxNameLength)
            return Problem(title: "Invalid name", detail: $"Tên không được để trống và tối đa {MaxNameLength} ký tự.", statusCode: StatusCodes.Status400BadRequest);
        var scopes = (request.Scopes ?? []).Distinct().ToArray();
        if (scopes.Length == 0)
            return Problem(title: "No scope", detail: "Cần chọn ít nhất một phạm vi quyền.", statusCode: StatusCodes.Status400BadRequest);
        if (scopes.FirstOrDefault(s => !ApiScopes.IsKnown(s)) is { } unknown)
            return Problem(title: "Unknown scope", detail: $"Phạm vi quyền không hợp lệ: {unknown}.", statusCode: StatusCodes.Status400BadRequest);

        var (client, token) = await clients.CreateAsync(name, scopes, ct: ct);
        await audit.LogAsync(CreatedAction, "api_client", client.Id.ToString(), new { name = client.Name, scopes = client.Scopes }, ct);
        return StatusCode(StatusCodes.Status201Created, new ApiClientCreatedDto(ToDto(client), token));
    }

    /// <summary>Revokes a client: its token stops working immediately. Idempotent (an already revoked client is returned as is). 404 for an unknown id.</summary>
    [HttpPost("{id:long}/revoke")]
    [ProducesResponseType<ApiClientDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Revoke(long id, CancellationToken ct)
    {
        var before = await db.Set<ApiClient>().AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
        if (before is null) return NotFound();
        if (before.RevokedAt is null)
        {
            await clients.RevokeAsync(id, ct);
            await audit.LogAsync(RevokedAction, "api_client", id.ToString(), new { name = before.Name, scopes = before.Scopes }, ct);
        }
        return Ok(ToDto(await db.Set<ApiClient>().AsNoTracking().FirstAsync(c => c.Id == id, ct)));
    }
}
