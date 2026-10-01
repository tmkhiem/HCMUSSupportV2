using System.Security.Claims;
using System.Security.Cryptography;
using HCMUSSupportV2.Backend.Modules.Identity.Authentication;
using HCMUSSupportV2.Backend.Tests.Infrastructure;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using static HCMUSSupportV2.Backend.Tests.Infrastructure.IdentityTestSupport;

namespace HCMUSSupportV2.Backend.Tests.Identity;

/// <summary>
/// The Google OIDC scheme: which id tokens the handler's validation parameters accept (issuer, audience, expiry) and what
/// the login challenge asks Google for.
/// </summary>
[Collection(PostgresCollection.Name)]
public class OidcConfigurationTests(PostgresFixture database) : IAsyncLifetime
{
    private const string ClientId = "test-client-id.apps.googleusercontent.com";
    private static readonly SymmetricSecurityKey SigningKey = new(RandomNumberGenerator.GetBytes(32));

    private readonly TestApiFactory _factory = new(database, configureServices: services =>
        services.PostConfigure<OpenIdConnectOptions>("Google", o =>
        {
            // Stand-in for Google's discovery document so the challenge needs no network.
            o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(new OpenIdConnectConfiguration
            {
                Issuer = "https://accounts.google.com",
                AuthorizationEndpoint = "https://accounts.example.test/o/oauth2/v2/auth",
            });
        }));

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    private TokenValidationParameters Parameters()
    {
        var options = _factory.Services.GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>().Get("Google");
        var parameters = options.TokenValidationParameters.Clone();
        parameters.IssuerSigningKey = SigningKey; // the test signs its own tokens instead of fetching Google's keys
        return parameters;
    }

    private static string Token(string issuer, string audience, DateTime? expires = null)
    {
        var now = DateTime.UtcNow;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Subject = new ClaimsIdentity([new Claim("email", "x@hcmus.edu.vn"), new Claim("email_verified", "true")]),
            NotBefore = now.AddMinutes(-5),
            Expires = expires ?? now.AddMinutes(5),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256),
        });
    }

    private async Task<TokenValidationResult> ValidateAsync(string token) =>
        await new JsonWebTokenHandler().ValidateTokenAsync(token, Parameters());

    [Theory]
    [InlineData("https://accounts.google.com")]
    [InlineData("accounts.google.com")]
    public async Task Token_for_this_client_from_google_is_accepted(string issuer) =>
        Assert.True((await ValidateAsync(Token(issuer, ClientId))).IsValid);

    [Fact]
    public async Task Token_for_another_client_audience_is_rejected() =>
        Assert.False((await ValidateAsync(Token("https://accounts.google.com", "someone-elses-client"))).IsValid);

    [Fact]
    public async Task Token_from_another_issuer_is_rejected() =>
        Assert.False((await ValidateAsync(Token("https://evil.example.test", ClientId))).IsValid);

    [Fact]
    public async Task Expired_token_is_rejected() =>
        Assert.False((await ValidateAsync(Token("https://accounts.google.com", ClientId, DateTime.UtcNow.AddHours(-1)))).IsValid);

    [Fact]
    public void Scheme_uses_the_code_flow_with_pkce_the_documented_scopes_and_keeps_no_google_tokens()
    {
        var o = _factory.Services.GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>().Get("Google");

        Assert.Equal("https://accounts.google.com", o.Authority);
        Assert.Equal("code", o.ResponseType);
        Assert.True(o.UsePkce);
        Assert.Equal(["openid", "email", "profile"], o.Scope.ToArray());
        Assert.Equal("/api/auth/callback", o.CallbackPath.Value);
        Assert.False(o.SaveTokens);
        Assert.Equal(ClientId, o.ClientId);
    }

    [Fact]
    public async Task Login_redirects_to_google_with_the_account_chooser_and_the_callback()
    {
        var client = _factory.CreateSessionClient();

        var response = await client.GetAsync("/api/auth/login?returnUrl=/hoso");

        Assert.Equal(System.Net.HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!;
        Assert.StartsWith("https://accounts.example.test/o/oauth2/v2/auth?", location.ToString());
        var query = System.Web.HttpUtility.ParseQueryString(location.Query);
        Assert.Equal(ClientId, query["client_id"]);
        Assert.Equal("https://localhost/api/auth/callback", query["redirect_uri"]);
        Assert.Equal("code", query["response_type"]);
        Assert.Equal("openid email profile", query["scope"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.False(string.IsNullOrEmpty(query["code_challenge"]));
        Assert.False(string.IsNullOrEmpty(query["nonce"]));
        Assert.Equal("select_account", query["prompt"]);
        Assert.DoesNotContain("client_secret", location.ToString());
    }

    [Fact]
    public async Task Login_answers_503_when_google_is_not_configured()
    {
        await using var factory = new TestApiFactory(database, new() { ["Auth:Google:ClientId"] = "", ["Auth:Google:ClientSecret"] = "" });

        var response = await factory.CreateSessionClient().GetAsync("/api/auth/login");

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Theory]
    [InlineData(null, "/")]
    [InlineData("", "/")]
    [InlineData("/", "/")]
    [InlineData("/tin-tuc?x=1", "/tin-tuc?x=1")]
    [InlineData("//evil.example.test", "/")]
    [InlineData("/\\evil.example.test", "/")]
    [InlineData("https://evil.example.test/", "/")]
    [InlineData("evil", "/")]
    [InlineData("/\t/evil.example.test", "/")]
    public void Only_local_return_urls_are_allowed(string? input, string expected) =>
        Assert.Equal(expected, AuthController.SafeReturnUrl(input));
}
