package app.webhouse.cmsreader;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    /** Single shared reader pointing at the content/ directory. */
    @Bean
    public WebhouseReader webhouseReader() {
        return new WebhouseReader("content");
    }
}
