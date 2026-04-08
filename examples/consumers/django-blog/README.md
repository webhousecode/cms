# django-blog — @webhouse/cms consumer example

Django 5 + Python 3.12 reading @webhouse/cms JSON content.

**Stack:**
- Django 5.x
- Python 3.10+ (3.12 recommended)
- python-markdown for richtext rendering
- No database — content is JSON files

## Quick start

```bash
cd examples/consumers/django-blog
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 8000 --insecure
```

Open http://localhost:8000 (EN) or http://localhost:8000/da/ (DA).

### Run with Docker

```bash
docker build -t django-blog .
docker run -p 8000:8000 django-blog
```

## How it works

```
content/
  globals/site.json
  posts/
    hello-world.json + hello-world-da.json
    why-django.json  + why-django-da.json

mysite/
  settings.py            ← Django settings (no database)
  urls.py                ← URL routing
blog/
  webhouse.py            ← reader (~120 LOC, stdlib only)
  views.py               ← Django views
  context_processors.py  ← injects globals into all templates
  templatetags/
    webhouse_filters.py  ← {{ post|wh_string:"title" }}
  templates/blog/
    _layout.html
    home.html
    post.html
```

```python
from blog import webhouse

posts = webhouse.collection("posts", locale="en")
post = webhouse.document("posts", "hello-world")
translation = webhouse.find_translation(post, "posts")
```

## Connecting CMS admin

1. Run CMS admin (Docker on port 3010)
2. In CMS admin → Sites → Add new site
3. **Config path:** absolute path to this folder's `cms.config.ts`
4. **Content directory:** absolute path to this folder's `content/`
5. Click "Validate site" → ✓ All good
6. Edit content → reload http://localhost:8000 → live changes

## Security

`webhouse._validate()` rejects collection names and slugs that don't match `^[a-z0-9][a-z0-9-]*$`. The resolved path is also checked against the content directory prefix to prevent traversal.

## FastAPI variant

The same `webhouse.py` module works in FastAPI — just remove `from django.conf import settings` and pass `content_dir` explicitly. Move `lru_cache` for globals to a startup event.

## Related

- **F125** — Framework-Agnostic Content Platform
- [docs.webhouse.app/docs/consume-django](https://docs.webhouse.app/docs/consume-django)
