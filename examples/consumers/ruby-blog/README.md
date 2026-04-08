# ruby-blog — @webhouse/cms consumer example

A Sinatra application reading @webhouse/cms JSON content. The `webhouse.rb` reader is **drop-in compatible with Rails** — copy it to `app/lib/` and the API works identically.

**Stack:** Ruby 3.1+ · Sinatra 4.x · Redcarpet · Puma

**Why Sinatra and not Rails?** Faster bring-up. The reader pattern is the focus — it's identical in both frameworks. To use in Rails, see Rails compatibility below.

## Quick start

```bash
cd examples/consumers/ruby-blog
bundle install
bundle exec rackup -p 4567
```

Open http://localhost:4567 (EN) or http://localhost:4567/da/ (DA).

## How it works

```
content/                    ← @webhouse/cms JSON files
webhouse.rb                 ← reader (~100 LOC, stdlib only)
app.rb                      ← Sinatra routes
config.ru                   ← Rack entry
views/                      ← ERB templates
```

```ruby
cms = Webhouse::Reader.new('content')
posts = cms.collection('posts', locale: 'en')
post  = cms.document('posts', 'hello-world')
trans = cms.find_translation(post, 'posts')
```

## Rails compatibility

Drop `webhouse.rb` into `app/lib/`, then in your controller:

```ruby
class BlogController < ApplicationController
  def index
    cms = Webhouse::Reader.new(Rails.root.join('content'))
    @posts = cms.collection('posts', locale: 'en')
  end
end
```

## Security

`Webhouse::Reader#validate_name!` rejects names not matching `^[a-z0-9][a-z0-9-]*$`. Resolved paths are checked against the content dir prefix.

## Related

- **F125** — Framework-Agnostic Content Platform
- [docs.webhouse.app/docs/consume-rails](https://docs.webhouse.app/docs/consume-rails)
