using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>Endpoints that exist only in tests (registered with <see cref="TestControllers.Add"/>), one per policy.</summary>
[ApiController]
[Route("api/test")]
public class TestPolicyController(ICurrentUser user) : ControllerBase
{
    [HttpGet("employee"), Authorize(Policy = Policies.Employee)]
    public IActionResult Employee() => Ok(new { user.Code });

    [HttpGet("editor"), Authorize(Policy = Policies.Editor)]
    public IActionResult Editor() => Ok(new { user.Code, user.IsEditor, user.IsAdmin });

    [HttpGet("admin"), Authorize(Policy = Policies.Admin)]
    public IActionResult Admin() => Ok(new { user.Code, user.IsEditor, user.IsAdmin });

    [HttpGet("capability/notifications"), Authorize(Policy = Policies.ManageNotifications)]
    public IActionResult ManageNotifications() => Ok();

    [HttpGet("capability/roles"), Authorize(Policy = Policies.GrantRoles)]
    public IActionResult GrantRoles() => Ok();

    /// <summary>An unsafe, cookie-authenticated request: subject to the antiforgery check.</summary>
    [HttpPost("write"), Authorize(Policy = Policies.Employee)]
    public IActionResult Write() => Ok();

    /// <summary>Signs in as any active employee in any environment (dev-login only exists in Development).</summary>
    [HttpPost("sign-in/{code}"), AllowAnonymous]
    public async Task<IActionResult> SignIn(string code, [FromServices] PrincipalFactory principals)
    {
        var principal = await principals.CreateAsync(code);
        if (principal is null) return NotFound();
        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal);
        return NoContent();
    }

    /// <summary>Stands in for the future ApiKey endpoints: anonymous here, exempt from antiforgery by path.</summary>
    [HttpPost("/api/integration/ping"), AllowAnonymous]
    public IActionResult IntegrationPing() => Ok();
}

public static class TestControllers
{
    public static void Add(IServiceCollection services) =>
        services.AddControllers().AddApplicationPart(typeof(TestPolicyController).Assembly);
}
