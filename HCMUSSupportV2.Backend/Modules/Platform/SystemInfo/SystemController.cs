using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace HCMUSSupportV2.Backend.Modules.Platform.SystemInfo;

public record SystemInfoDto(string Version, string Environment);

[ApiController]
[Route("api/system")]
public class SystemController(IHostEnvironment env) : ControllerBase
{
    private static readonly string Version = ResolveVersion();

    /// <summary>Build version and runtime environment. Anonymous: safe to expose, used by monitoring and the SPA footer.</summary>
    [HttpGet("info")]
    [ProducesResponseType<SystemInfoDto>(StatusCodes.Status200OK)]
    public SystemInfoDto Info() => new(Version, env.EnvironmentName);

    private static string ResolveVersion()
    {
        var informational = typeof(SystemController).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        var version = informational ?? typeof(SystemController).Assembly.GetName().Version?.ToString() ?? "unknown";
        // Drop the "+<commit>" build metadata appended by SourceLink.
        var plus = version.IndexOf('+');
        return plus > 0 ? version[..plus] : version;
    }
}
