package app.webhouse.cmsreader;

import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Renders @webhouse/cms richtext fields (markdown) to HTML for use in Thymeleaf
 * templates via {@code th:utext}.
 */
@Service
public class MarkdownService {

    private final Parser parser;
    private final HtmlRenderer renderer;

    public MarkdownService() {
        List<TablesExtension> extensions = List.of(TablesExtension.create());
        this.parser = Parser.builder().extensions(extensions).build();
        this.renderer = HtmlRenderer.builder().extensions(extensions).build();
    }

    public String render(String markdown) {
        if (markdown == null || markdown.isEmpty()) return "";
        Node document = parser.parse(markdown);
        return renderer.render(document);
    }
}
