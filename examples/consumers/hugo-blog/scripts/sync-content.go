// sync-content.go converts @webhouse/cms JSON content to Hugo markdown.
//
// Reads content/posts/*.json and writes content/posts/{slug}.md (English) and
// content-da/posts/{slug}.md (Danish) with TOML front matter, ready for Hugo
// to build.
//
// Run before `hugo build` (or via `hugo --watch` + a file watcher).
//
// Usage: go run scripts/sync-content.go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

type doc struct {
	Slug             string                 `json:"slug"`
	Status           string                 `json:"status"`
	Locale           string                 `json:"locale,omitempty"`
	TranslationGroup string                 `json:"translationGroup,omitempty"`
	Data             map[string]interface{} `json:"data"`
}

func main() {
	srcDir := "_webhouse-content/posts"
	enDir := "content/posts"
	daDir := "content-da/posts"

	if err := os.MkdirAll(enDir, 0755); err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll(daDir, 0755); err != nil {
		log.Fatal(err)
	}

	entries, err := os.ReadDir(srcDir)
	if err != nil {
		log.Fatalf("read %s: %v (run from hugo-blog/ root)", srcDir, err)
	}

	count := 0
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(srcDir, e.Name()))
		if err != nil {
			continue
		}
		var d doc
		if err := json.Unmarshal(raw, &d); err != nil {
			log.Printf("skip %s: %v", e.Name(), err)
			continue
		}
		if d.Status != "published" {
			continue
		}

		title, _ := d.Data["title"].(string)
		excerpt, _ := d.Data["excerpt"].(string)
		date, _ := d.Data["date"].(string)
		author, _ := d.Data["author"].(string)
		content, _ := d.Data["content"].(string)
		var tags []string
		if rawTags, ok := d.Data["tags"].([]interface{}); ok {
			for _, t := range rawTags {
				if s, ok := t.(string); ok {
					tags = append(tags, s)
				}
			}
		}

		// TOML front matter
		fm := fmt.Sprintf(`+++
title = %q
date = %q
description = %q
author = %q
draft = false
translationGroup = %q
`,
			title, date, excerpt, author, d.TranslationGroup)
		if len(tags) > 0 {
			fm += "tags = ["
			for i, t := range tags {
				if i > 0 {
					fm += ", "
				}
				fm += fmt.Sprintf("%q", t)
			}
			fm += "]\n"
		}
		fm += "+++\n\n" + content + "\n"

		// Use the language-specific directory and strip locale suffix from slug
		var outPath string
		cleanSlug := strings.TrimSuffix(d.Slug, "-da")
		if d.Locale == "da" {
			outPath = filepath.Join(daDir, cleanSlug+".md")
		} else {
			outPath = filepath.Join(enDir, cleanSlug+".md")
		}

		if err := os.WriteFile(outPath, []byte(fm), 0644); err != nil {
			log.Printf("write %s: %v", outPath, err)
			continue
		}
		count++
	}

	fmt.Printf("✓ Synced %d posts to Hugo content directories\n", count)
}
