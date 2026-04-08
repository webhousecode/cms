using DotnetBlog.Services;
using Markdig;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace DotnetBlog.Pages.Blog;

public class PostModel : PageModel
{
    private static readonly MarkdownPipeline MarkdownPipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    private readonly WebhouseReader _cms;

    public WebhouseDocument? Post { get; private set; }
    public WebhouseDocument? Translation { get; private set; }
    public string ContentHtml { get; private set; } = string.Empty;

    public PostModel(WebhouseReader cms) => _cms = cms;

    public IActionResult OnGet(string slug)
    {
        try
        {
            Post = _cms.Document("posts", slug);
        }
        catch (ArgumentException)
        {
            // Slug failed validation (path traversal attempt, invalid chars, etc.)
            return BadRequest();
        }

        if (Post is null) return NotFound();

        Translation = _cms.FindTranslation(Post, "posts");

        var markdown = Post.GetString("content") ?? string.Empty;
        ContentHtml = Markdown.ToHtml(markdown, MarkdownPipeline);

        return Page();
    }
}
