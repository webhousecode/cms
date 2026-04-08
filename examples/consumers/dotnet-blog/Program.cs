using DotnetBlog.Services;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

// Single shared reader pointing at the content/ directory.
builder.Services.AddSingleton(new WebhouseReader(
    Path.Combine(builder.Environment.ContentRootPath, "content")
));
// Globals service — loads content/globals/site.json once and exposes brand text, footer, etc.
builder.Services.AddScoped<WebhouseGlobals>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

// Also serve uploaded media from public/uploads at /uploads
var uploadsPath = Path.Combine(builder.Environment.ContentRootPath, "public", "uploads");
if (Directory.Exists(uploadsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(uploadsPath),
        RequestPath = "/uploads",
    });
}

app.UseRouting();
app.MapRazorPages();

app.Run();
