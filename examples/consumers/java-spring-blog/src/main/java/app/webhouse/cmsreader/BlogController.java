package app.webhouse.cmsreader;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.ModelAndView;

import java.util.List;
import java.util.Optional;

/**
 * Renders the blog using @webhouse/cms content.
 * Routes:
 *   /            → all English posts
 *   /da/         → all Danish posts
 *   /blog/{slug} → individual post (any locale)
 */
@Controller
public class BlogController {

    private final WebhouseReader cms;
    private final MarkdownService markdown;

    public BlogController(WebhouseReader cms, MarkdownService markdown) {
        this.cms = cms;
        this.markdown = markdown;
    }

    @GetMapping("/")
    public String home(Model model) {
        List<WebhouseDocument> posts = cms.collection("posts", "en");
        model.addAttribute("posts", posts);
        model.addAttribute("locale", "en");
        return "home";
    }

    @GetMapping("/da/")
    public String homeDa(Model model) {
        List<WebhouseDocument> posts = cms.collection("posts", "da");
        model.addAttribute("posts", posts);
        model.addAttribute("locale", "da");
        return "home";
    }

    @GetMapping("/blog/{slug}")
    public ModelAndView post(@PathVariable String slug) {
        WebhouseDocument post;
        try {
            post = cms.document("posts", slug)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Post not found"));
        } catch (IllegalArgumentException e) {
            // Slug failed validation (path traversal attempt, etc.)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slug");
        }

        Optional<WebhouseDocument> translation = cms.findTranslation(post, "posts");

        ModelAndView mv = new ModelAndView("post");
        mv.addObject("post", post);
        mv.addObject("contentHtml", markdown.render(post.getString("content")));
        mv.addObject("translation", translation.orElse(null));
        return mv;
    }

    /** Render a friendly 404 page for missing routes/posts. */
    @ExceptionHandler(ResponseStatusException.class)
    public ModelAndView handleNotFound(ResponseStatusException ex) {
        ModelAndView mv = new ModelAndView("error", ex.getStatusCode());
        mv.addObject("statusCode", ex.getStatusCode().value());
        mv.addObject("reason", ex.getReason() != null ? ex.getReason() : "Not found");
        return mv;
    }
}
