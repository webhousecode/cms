# F125 reference reader for @webhouse/cms file-based content (Ruby).
#
# Reads JSON documents from content/{collection}/ and exposes them as plain
# Hash instances. Designed to be thin (stdlib only), and safe — slugs and
# collection names are validated against SAFE_NAME to prevent path traversal.
#
# Reference implementation for the future webhouse_cms RubyGems package.
# Drop into a Rails app under app/lib/webhouse.rb — the API is identical.

require 'json'
require 'pathname'

module Webhouse
  SAFE_NAME = /\A[a-z0-9]([a-z0-9-]*[a-z0-9])?\z/

  class InvalidName < StandardError; end

  class Reader
    attr_reader :content_dir

    def initialize(content_dir)
      @content_dir = Pathname.new(content_dir).expand_path
    end

    # List all published documents in a collection.
    # locale: optional locale filter; pass nil for all locales
    # Returns documents sorted by data.date descending.
    def collection(name, locale: nil)
      validate_name!(name)
      dir = @content_dir.join(name)
      return [] unless dir.directory?

      docs = dir.glob('*.json').filter_map do |f|
        doc = JSON.parse(f.read) rescue next
        next unless doc['status'] == 'published'
        next if locale && doc['locale'] != locale
        doc
      end

      docs.sort_by { |d| d.dig('data', 'date') || '' }.reverse
    end

    # Load a single published document by collection and slug.
    # Returns nil if not found, malformed, or unpublished.
    # Raises InvalidName on path traversal attempts.
    def document(collection_name, slug)
      validate_name!(collection_name)
      validate_name!(slug)

      file = @content_dir.join(collection_name, "#{slug}.json").expand_path
      raise InvalidName, "path escapes content dir" unless file.to_s.start_with?(@content_dir.to_s)
      return nil unless file.file?

      doc = JSON.parse(file.read)
      doc['status'] == 'published' ? doc : nil
    rescue JSON::ParserError
      nil
    end

    # Find the sibling translation of a document via translationGroup.
    def find_translation(doc, collection_name)
      tg = doc['translationGroup']
      return nil unless tg
      collection(collection_name).find do |other|
        other['translationGroup'] == tg && other['locale'] != doc['locale']
      end
    end

    # Convenience: returns the singleton globals/site.json doc, cached.
    def globals
      @globals ||= document('globals', 'site') || {}
    end

    private

    def validate_name!(name)
      raise InvalidName, "invalid name '#{name}'" unless name.is_a?(String) && name.match?(SAFE_NAME)
    end
  end

  # Helpers for templates
  def self.string(doc, key, default = '')
    return default unless doc.is_a?(Hash)
    value = doc.dig('data', key)
    value.is_a?(String) ? value : default
  end

  def self.tags(doc)
    return [] unless doc.is_a?(Hash)
    value = doc.dig('data', 'tags')
    value.is_a?(Array) ? value.select { |v| v.is_a?(String) } : []
  end
end
