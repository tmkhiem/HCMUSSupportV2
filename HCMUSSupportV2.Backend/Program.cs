using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace HCMUSSupportV2.Backend;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // Add services to the container.

        builder.Services.AddControllers();

        // Registered so the NSwag CLI (generate-api.cmd) can resolve the OpenAPI document
        // generator at design time. No UseOpenApi()/UseSwaggerUi() call, so nothing is
        // exposed at runtime.
        builder.Services.AddOpenApiDocument();

        var knownNetworks = builder.Configuration.GetSection("ReverseProxy:KnownNetworks").Get<string[]>() ?? [];
        var knownProxies = builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [];
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // KnownNetworks takes Microsoft.AspNetCore.HttpOverrides.IPNetwork (CIDR prefix
            // + length), not the System.Net.IPNetwork struct - parse the "a.b.c.d/n" form manually.
            foreach (var network in knownNetworks)
            {
                var parts = network.Split('/');
                options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse(parts[0]), int.Parse(parts[1])));
            }
            foreach (var proxy in knownProxies) options.KnownProxies.Add(IPAddress.Parse(proxy));
        });


        // Add your DbContext once you have models (see Data/AppDbContext.cs), then
        // scaffold an existing database into Models/ with:
        //   dotnet ef dbcontext scaffold "<connection-string>" Microsoft.EntityFrameworkCore.SqlServer -o Models
        // builder.Services.AddDbContext<AppDbContext>(options =>
        //     options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

        var app = builder.Build();

        // Configure the HTTP request pipeline.

        app.UseForwardedHeaders();

        app.UseHttpsRedirection();

        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.UseAuthorization();


        app.MapControllers();
        app.MapFallbackToFile("index.html");

        app.Run();
    }
}
