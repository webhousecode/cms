# Sinatra app reading @webhouse/cms content via webhouse.rb.
#
# Drop the Webhouse module into app/lib/webhouse.rb in a Rails app and the
# same patterns work — the reader is framework-agnostic.

require 'sinatra/base'
require 'redcarpet'
require_relative 'webhouse'

class WebhouseBlog < Sinatra::Base
  configure do
    set :content_dir, File.expand_path('content', __dir__)
    set :views, File.expand_path('views', __dir__)
    set :public_folder, File.expand_path('public', __dir__)
    set :bind, '0.0.0.0'
    # Allow CMS admin to iframe this site for preview
    set :protection, except: :frame_options

    cms = Webhouse::Reader.new(settings.content_dir)
    set :cms, cms
    set :globals, cms.globals
    set :markdown_renderer, Redcarpet::Markdown.new(
      Redcarpet::Render::HTML.new(hard_wrap: true),
      fenced_code_blocks: true,
      tables: true
    )
  end

  helpers do
    def cms; settings.cms; end
    def globals; settings.globals; end
    def render_markdown(text); settings.markdown_renderer.render(text || ''); end
    def wh_string(doc, key, default = ''); Webhouse.string(doc, key, default); end
    def brand_prefix; Webhouse.string(globals, 'brandPrefix', '@webhouse/cms'); end
    def brand_suffix; Webhouse.string(globals, 'brandSuffix', ''); end
    def footer_text; Webhouse.string(globals, 'footerText', 'Powered by @webhouse/cms'); end
  end

  get '/' do
    @posts = cms.collection('posts', locale: 'en')
    @locale = 'en'
    erb :home
  end

  get '/da/' do
    @posts = cms.collection('posts', locale: 'da')
    @locale = 'da'
    erb :home
  end

  get '/blog/:slug' do
    begin
      @post = cms.document('posts', params[:slug])
    rescue Webhouse::InvalidName
      halt 400, 'Invalid slug'
    end
    halt 404, 'Post not found' unless @post
    @translation = cms.find_translation(@post, 'posts')
    @content_html = render_markdown(wh_string(@post, 'content'))
    erb :post
  end

  not_found do
    @status_code = 404
    @status_text = 'Not found'
    erb :error
  end

  error do
    @status_code = 500
    @status_text = 'Server error'
    erb :error
  end
end

WebhouseBlog.run! if __FILE__ == $PROGRAM_NAME
