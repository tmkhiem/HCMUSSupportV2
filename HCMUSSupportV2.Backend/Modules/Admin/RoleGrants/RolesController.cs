using HCMUSSupportV2.Backend.Modules.Admin.Common;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Admin.RoleGrants;

/// <summary>Grant or revoke any role for any employee (admin only).</summary>
[ApiController]
[Route("api/admin/roles")]
[Authorize(Policy = Policies.GrantRoles)]
public class RolesController(RoleAdminService roles, ICurrentUser user) : ControllerBase
{
    /// <summary>
    /// Employees with their assigned roles, ordered by code. <c>q</c> matches code, name (accent-insensitive) or email;
    /// <c>role</c> is <c>editor</c>, <c>admin</c> or <c>employee</c> (no assigned role).
    /// </summary>
    [HttpGet]
    [ProducesResponseType<AdminPage<RoleRowDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] string? role, [FromQuery] string? cursor,
        [FromQuery] int? limit, CancellationToken ct) =>
        Ok(await roles.ListAsync(q, role, cursor, limit, ct));

    [HttpGet("{code}")]
    [ProducesResponseType<RoleDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(string code, CancellationToken ct) =>
        await roles.GetAsync(code, ct) is { } detail ? Ok(detail) : NotFound();

    /// <summary>
    /// Sets the complete role list of an employee (<c>editor</c>, <c>admin</c>). 409 when it would remove the last
    /// active admin; 400 for an unknown role; 404 for an unknown employee. Takes effect on the employee's next request.
    /// </summary>
    [HttpPut("{code}")]
    [ProducesResponseType<RoleDetailDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Put(string code, [FromBody] SetRolesRequest request, CancellationToken ct)
    {
        var result = await roles.SetRolesAsync(code, request.Roles ?? [], user.RequireCode(), ct);
        return result switch
        {
            RoleAdminService.SetRolesResult.Ok => Ok(await roles.GetAsync(code, ct)),
            RoleAdminService.SetRolesResult.NotFound => NotFound(),
            RoleAdminService.SetRolesResult.InvalidRole => Problem(title: "Unknown role",
                detail: "Vai trò không hợp lệ (chỉ có editor và admin).", statusCode: StatusCodes.Status400BadRequest),
            _ => Problem(title: "Cannot remove the last admin",
                detail: "Không thể gỡ quản trị viên cuối cùng của hệ thống.", statusCode: StatusCodes.Status409Conflict),
        };
    }
}
