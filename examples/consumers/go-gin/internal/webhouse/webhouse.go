// Package webhouse is the F125 reference reader for @webhouse/cms file-based content.
//
// It reads JSON documents from content/{collection}/ and exposes them as
// Document instances. Designed to be thin (stdlib + zero deps), and safe —
// slugs and collection names are validated to prevent path traversal.
//
// Reference implementation for the future github.com/webhousecode/cms-reader-go
// module.
package webhouse

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// Document mirrors a single @webhouse/cms JSON file.
type Document struct {
	ID               string                 `json:"id"`
	Slug             string                 `json:"slug"`
	Status           string                 `json:"status"`
	Locale           string                 `json:"locale,omitempty"`
	TranslationGroup string                 `json:"translationGroup,omitempty"`
	Data             map[string]interface{} `json:"data"`
	CreatedAt        string                 `json:"createdAt,omitempty"`
	UpdatedAt        string                 `json:"updatedAt,omitempty"`
}

// IsPublished returns true when the document status is "published".
func (d *Document) IsPublished() bool { return d.Status == "published" }

// String safely extracts a string field from data.
func (d *Document) String(key string) string {
	if d.Data == nil {
		return ""
	}
	if v, ok := d.Data[key].(string); ok {
		return v
	}
	return ""
}

// StringOr returns the string field or a fallback default.
func (d *Document) StringOr(key, fallback string) string {
	if v := d.String(key); v != "" {
		return v
	}
	return fallback
}

// StringSlice extracts an array of strings (e.g. tags).
func (d *Document) StringSlice(key string) []string {
	if d.Data == nil {
		return nil
	}
	raw, ok := d.Data[key].([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// Reader provides typed access to a content/ directory.
type Reader struct {
	contentDir string

	mu    sync.RWMutex
	cache map[string][]Document // collection:locale -> documents
}

// safeName matches the same pattern enforced by CMS admin and other readers.
var safeName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

// ErrInvalidName is returned when a collection name or slug fails validation.
var ErrInvalidName = errors.New("webhouse: invalid name (must match ^[a-z0-9][a-z0-9-]*$)")

// New constructs a Reader pointed at the given content directory.
func New(contentDir string) *Reader {
	abs, _ := filepath.Abs(contentDir)
	return &Reader{
		contentDir: abs,
		cache:      make(map[string][]Document),
	}
}

func validate(name string) error {
	if !safeName.MatchString(name) {
		return ErrInvalidName
	}
	return nil
}

// Collection lists all published documents in a collection. If locale is
// empty, all locales are returned. Sorted by data.date descending.
func (r *Reader) Collection(collection, locale string) ([]Document, error) {
	if err := validate(collection); err != nil {
		return nil, err
	}

	dir := filepath.Join(r.contentDir, collection)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var docs []Document
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var d Document
		if err := json.Unmarshal(raw, &d); err != nil {
			continue
		}
		if !d.IsPublished() {
			continue
		}
		if locale != "" && d.Locale != locale {
			continue
		}
		docs = append(docs, d)
	}

	sort.SliceStable(docs, func(i, j int) bool {
		return docs[i].StringOr("date", "") > docs[j].StringOr("date", "")
	})
	return docs, nil
}

// Document loads a single published document by collection and slug.
func (r *Reader) Document(collection, slug string) (*Document, error) {
	if err := validate(collection); err != nil {
		return nil, err
	}
	if err := validate(slug); err != nil {
		return nil, err
	}

	path := filepath.Join(r.contentDir, collection, slug+".json")
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(abs, r.contentDir) {
		return nil, ErrInvalidName
	}

	raw, err := os.ReadFile(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var d Document
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	if !d.IsPublished() {
		return nil, nil
	}
	return &d, nil
}

// FindTranslation resolves the sibling translation of a document via its
// translationGroup. Returns nil if there is none in another locale.
func (r *Reader) FindTranslation(doc *Document, collection string) (*Document, error) {
	if doc == nil || doc.TranslationGroup == "" {
		return nil, nil
	}
	all, err := r.Collection(collection, "")
	if err != nil {
		return nil, err
	}
	for i := range all {
		o := &all[i]
		if o.TranslationGroup == doc.TranslationGroup && o.Locale != doc.Locale {
			return o, nil
		}
	}
	return nil, nil
}
