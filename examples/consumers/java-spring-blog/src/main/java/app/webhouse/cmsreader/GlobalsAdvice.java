package app.webhouse.cmsreader;

import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

/**
 * Injects the WebhouseGlobals bean into every Thymeleaf template as ${globals}.
 *
 * This means any template can reference site-wide settings without each
 * controller having to add them to the model:
 *
 *   <a th:text="${globals.brandPrefix} + ' · ' + ${globals.brandSuffix}">@webhouse/cms</a>
 *   <footer th:text="${globals.footerText}">...</footer>
 */
@ControllerAdvice
public class GlobalsAdvice {

    private final WebhouseGlobals globals;

    public GlobalsAdvice(WebhouseGlobals globals) {
        this.globals = globals;
    }

    @ModelAttribute("globals")
    public WebhouseGlobals globals() {
        return globals;
    }
}
