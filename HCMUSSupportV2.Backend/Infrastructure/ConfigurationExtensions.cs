namespace HCMUSSupportV2.Backend.Infrastructure;

public static class ConfigurationExtensions
{
    /// <summary>
    /// Adds the optional, git-ignored <c>appsettings.{Environment}.local.json</c> (secrets such as the connection string).
    /// Environment variables and command-line arguments are re-added afterwards so they still take precedence.
    /// </summary>
    public static WebApplicationBuilder AddLocalConfiguration(this WebApplicationBuilder builder, string[] args)
    {
        builder.Configuration.AddJsonFile(
            $"appsettings.{builder.Environment.EnvironmentName}.local.json", optional: true, reloadOnChange: true);
        builder.Configuration.AddEnvironmentVariables();
        if (args.Length > 0) builder.Configuration.AddCommandLine(args);
        return builder;
    }
}
