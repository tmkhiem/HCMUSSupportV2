namespace HCMUSSupportV2.Backend.Modules.Identity.Authentication;

/// <summary>Bound from the <c>Auth</c> configuration section.</summary>
public class AuthOptions
{
    public const string SectionName = "Auth";

    public GoogleAuthOptions Google { get; set; } = new();
    public DevLoginOptions DevLogin { get; set; } = new();

    /// <summary>
    /// How often (seconds) the session cookie's principal is re-checked against the database (employee still active,
    /// current roles). 0 re-checks on every request.
    /// </summary>
    public int RevalidateSeconds { get; set; } = 300;
}

public class GoogleAuthOptions
{
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}

public class DevLoginOptions
{
    /// <summary>
    /// Enables <c>POST /api/auth/dev-login</c>. Honoured only when the environment is Development; anywhere else
    /// the endpoint answers 404 whatever this says.
    /// </summary>
    public bool Enabled { get; set; }
}

/// <summary>Bound from the <c>Admin</c> configuration section.</summary>
public class AdminOptions
{
    public const string SectionName = "Admin";

    /// <summary>
    /// Emails that become <c>admin</c> when the database has no admin yet and the email maps to an employee
    /// (checked at startup and again at every sign-in).
    /// </summary>
    public string[] BootstrapEmails { get; set; } = [];
}

/// <summary>Development-only synthetic data (<c>Dev:SeedEmployees</c>, default on in Development).</summary>
public class DevSeedOptions
{
    public const string SectionName = "Dev";

    public bool? SeedEmployees { get; set; }
}
