using DotnetBlog.Services;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace DotnetBlog.Pages;

public class IndexModel : PageModel
{
    private readonly WebhouseReader _cms;

    public IReadOnlyList<WebhouseDocument> Posts { get; private set; } = Array.Empty<WebhouseDocument>();

    public IndexModel(WebhouseReader cms) => _cms = cms;

    public void OnGet()
    {
        Posts = _cms.Collection("posts", locale: "en");
    }
}
