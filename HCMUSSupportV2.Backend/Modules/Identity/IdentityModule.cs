using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Modules.Identity.Authorization;
using HCMUSSupportV2.Backend.Modules.Identity.Seed;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace HCMUSSupportV2.Backend.Modules.Identity;

/// <summary>
/// Identity module: org units, employees, emails, roles and groups (schema), Google sign-in with a cookie session,
/// antiforgery, authorization policies, admin bootstrap and the Development roster.
/// </summary>
public static class IdentityModule
{
    public const string GoogleAuthority = "https://accounts.google.com";
    public const string CallbackPath = "/api/auth/callback";

    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AuthOptions>(configuration.GetSection(AuthOptions.SectionName));
        services.Configure<AdminOptions>(configuration.GetSection(AdminOptions.SectionName));
        services.Configure<DevSeedOptions>(configuration.GetSection(DevSeedOptions.SectionName));
        services.TryAddSingleton(TimeProvider.System);

        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddScoped<PrincipalFactory>();
        services.AddScoped<GoogleSignInService>();
        services.AddScoped<LastAdminGuard>();
        services.AddScoped<AdminBootstrapper>();
        services.AddScoped<DevDataSeeder>();
        services.AddHostedService<IdentityStartupService>();

        services.AddAuthentication(o =>
            {
                o.DefaultScheme = AuthSchemes.Cookie;
                o.DefaultChallengeScheme = AuthSchemes.Cookie;
            })
            .AddCookie(AuthSchemes.Cookie, o =>
            {
                o.ExpireTimeSpan = TimeSpan.FromHours(12);
                o.SlidingExpiration = true;
                o.Events.OnValidatePrincipal = SessionCookieEvents.ValidatePrincipal;
                o.Events.OnRedirectToLogin = SessionCookieEvents.RedirectToLogin;
                o.Events.OnRedirectToAccessDenied = SessionCookieEvents.RedirectToAccessDenied;
            })
            .AddOpenIdConnect(AuthSchemes.Google, o =>
            {
                o.Authority = GoogleAuthority;
                o.ResponseType = OpenIdConnectResponseType.Code;
                o.ResponseMode = OpenIdConnectResponseMode.Query;
                o.UsePkce = true;
                o.Scope.Clear();
                o.Scope.Add("openid");
                o.Scope.Add("email");
                o.Scope.Add("profile");
                o.CallbackPath = CallbackPath;
                o.SignInScheme = AuthSchemes.Cookie;
                o.SaveTokens = false; // Google tokens are never persisted
                o.GetClaimsFromUserInfoEndpoint = false;
                o.MapInboundClaims = false; // keep "email", "email_verified", "picture" as named in the id token
                o.TokenValidationParameters.NameClaimType = "name";
                o.TokenValidationParameters.ValidateIssuer = true;
                o.TokenValidationParameters.ValidIssuers = [GoogleAuthority, "accounts.google.com"];
                o.TokenValidationParameters.ValidateAudience = true;
                o.TokenValidationParameters.ValidateLifetime = true;
                o.Events.OnTokenValidated = GoogleOidcEvents.OnTokenValidated;
                o.Events.OnRemoteFailure = GoogleOidcEvents.OnRemoteFailure;
                o.Events.OnAccessDenied = GoogleOidcEvents.OnAccessDenied;
                o.Events.OnRedirectToIdentityProvider = GoogleOidcEvents.OnRedirectToIdentityProvider;
            });

        // Environment- and configuration-dependent settings are resolved lazily, so test hosts can override them.
        services.AddOptions<OpenIdConnectOptions>(AuthSchemes.Google).Configure<IOptions<AuthOptions>>((o, auth) =>
        {
            // The handler validates its options on first use, so keep placeholders when Google is not configured;
            // /api/auth/login answers 503 in that case and never reaches Google.
            o.ClientId = auth.Value.Google.ClientId is { Length: > 0 } id ? id : "not-configured";
            o.ClientSecret = auth.Value.Google.ClientSecret is { Length: > 0 } secret ? secret : "not-configured";
            o.TokenValidationParameters.ValidAudience = o.ClientId;
        });

        services.AddOptions<CookieAuthenticationOptions>(AuthSchemes.Cookie).Configure<IHostEnvironment>((o, env) =>
        {
            // "__Host-" requires Secure + Path=/ + no Domain, so plain-http Development uses a plain name.
            var dev = env.IsDevelopment();
            o.Cookie.Name = dev ? AuthSchemes.DevelopmentCookieName : AuthSchemes.ProductionCookieName;
            o.Cookie.HttpOnly = true;
            o.Cookie.SameSite = SameSiteMode.Lax;
            o.Cookie.Path = "/";
            o.Cookie.IsEssential = true;
            o.Cookie.SecurePolicy = dev ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        });

        services.AddAntiforgery();
        services.AddOptions<AntiforgeryOptions>().Configure<IHostEnvironment>((o, env) =>
        {
            var dev = env.IsDevelopment();
            o.HeaderName = AuthSchemes.XsrfHeaderName;
            o.Cookie.Name = dev ? AuthSchemes.DevelopmentAntiforgeryCookieName : AuthSchemes.ProductionAntiforgeryCookieName;
            o.Cookie.Path = "/";
            o.Cookie.HttpOnly = true;
            o.Cookie.SecurePolicy = dev ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        });

        services.AddAuthorization(Policies.Register);
        return services;
    }

    /// <summary>Authentication (session cookie) followed by the antiforgery check. Place before <c>UseAuthorization</c>.</summary>
    public static WebApplication UseIdentityPipeline(this WebApplication app)
    {
        app.UseAuthentication();
        app.UseMiddleware<AntiforgeryMiddleware>();
        return app;
    }
}
