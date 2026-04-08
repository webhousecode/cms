// go-gin: F125 reference consumer example for @webhouse/cms.
//
// Reads flat JSON files from content/ via the webhouse package and renders
// a bilingual blog with Gin + html/template + goldmark markdown.
package main

import (
	"bytes"
	"html/template"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/yuin/goldmark"

	"github.com/webhousecode/cms-example-go-gin/internal/webhouse"
)

type pageData struct {
	Globals     *webhouse.Document
	Locale      string
	Posts       []webhouse.Document
	Post        *webhouse.Document
	Translation *webhouse.Document
	ContentHTML template.HTML
	StatusCode  int
	StatusText  string
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	cms := webhouse.New("content")

	// Load globals once on startup. In production, invalidate via webhook.
	globals, err := cms.Document("globals", "site")
	if err != nil {
		log.Printf("warning: could not load globals/site: %v", err)
	}

	r := gin.Default()
	r.SetFuncMap(template.FuncMap{
		"markdown": renderMarkdown,
	})
	r.LoadHTMLGlob("templates/*.html")
	r.Static("/uploads", "./public/uploads")

	// Health check (HEAD /) — used by CMS admin's site-health endpoint.
	// Gin doesn't auto-route HEAD to GET handlers, so we register it explicitly.
	r.HEAD("/", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.HEAD("/da/", func(c *gin.Context) { c.Status(http.StatusOK) })

	r.GET("/", func(c *gin.Context) {
		posts, err := cms.Collection("posts", "en")
		if err != nil {
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}
		c.HTML(http.StatusOK, "home.html", pageData{Globals: globals, Locale: "en", Posts: posts})
	})

	r.GET("/da/", func(c *gin.Context) {
		posts, err := cms.Collection("posts", "da")
		if err != nil {
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}
		c.HTML(http.StatusOK, "home.html", pageData{Globals: globals, Locale: "da", Posts: posts})
	})

	r.GET("/blog/:slug", func(c *gin.Context) {
		slug := c.Param("slug")
		post, err := cms.Document("posts", slug)
		if err != nil {
			if err == webhouse.ErrInvalidName {
				c.HTML(http.StatusBadRequest, "error.html", pageData{Globals: globals, StatusCode: 400, StatusText: "Invalid slug"})
				return
			}
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}
		if post == nil {
			c.HTML(http.StatusNotFound, "error.html", pageData{Globals: globals, StatusCode: 404, StatusText: "Post not found"})
			return
		}
		translation, _ := cms.FindTranslation(post, "posts")
		contentHTML := template.HTML(renderMarkdownString(post.String("content")))
		c.HTML(http.StatusOK, "post.html", pageData{
			Globals:     globals,
			Post:        post,
			Translation: translation,
			ContentHTML: contentHTML,
		})
	})

	log.Printf("go-gin blog listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func renderMarkdownString(md string) string {
	if md == "" {
		return ""
	}
	var buf bytes.Buffer
	if err := goldmark.Convert([]byte(md), &buf); err != nil {
		return md
	}
	return buf.String()
}

func renderMarkdown(md string) template.HTML {
	return template.HTML(renderMarkdownString(md))
}
