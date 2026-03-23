<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Field Types

### Complete Field Type Reference

Every field has these common properties:
```typescript
{
  name: string;          // Required: field key in the document data object
  type: FieldType;       // Required: one of the types below
  label?: string;        // Optional: human-readable label for admin UI
  required?: boolean;    // Optional: whether field must have a value
  defaultValue?: unknown; // Optional: default value
  ai?: {                 // Optional: hints for AI content generation
    hint?: string;       // Instruction for the AI, e.g. "Write in a friendly tone"
    maxLength?: number;  // Maximum character count for AI output
    tone?: string;       // Tone instruction, e.g. "professional", "casual"
  };
  aiLock?: {             // Optional: AI lock behavior
    autoLockOnEdit?: boolean;   // Lock field when user edits it (default: true)
    lockable?: boolean;         // Whether field can be locked at all (default: true)
    requireApproval?: boolean;  // Require human approval before AI can write
  };
}
```

#### text
Single-line text input.
```typescript
{ name: 'title', type: 'text', label: 'Title', required: true, maxLength: 120, minLength: 3 }
```

#### textarea
Multi-line plain text.
```typescript
{ name: 'excerpt', type: 'textarea', label: 'Excerpt', maxLength: 300 }
```

#### richtext
Rich text / Markdown content. Rendered as a block editor in the admin UI.
```typescript
{ name: 'content', type: 'richtext', label: 'Content' }
```

#### number
Numeric value.
```typescript
{ name: 'price', type: 'number', label: 'Price' }
```

#### boolean
True/false toggle.
```typescript
{ name: 'featured', type: 'boolean', label: 'Featured' }
```

#### date
ISO date string.
```typescript
{ name: 'publishDate', type: 'date', label: 'Publish Date' }
```

#### image
Single image reference (URL or path).
```typescript
{ name: 'heroImage', type: 'image', label: 'Hero Image' }
```

#### image-gallery
Multiple images. **CRITICAL: Values in JSON must be arrays of `{ url, alt }` objects, NOT plain URL strings.**
```typescript
{ name: 'photos', type: 'image-gallery', label: 'Photo Gallery' }
```
JSON data format — MUST use this exact structure:
```json
"photos": [
  { "url": "https://images.unsplash.com/photo-123?w=800", "alt": "Description of image" },
  { "url": "https://images.unsplash.com/photo-456?w=800", "alt": "Another image" }
]
```
**WRONG** (will show empty black boxes in admin):
```json
"photos": [
  "https://images.unsplash.com/photo-123?w=800",
  "https://images.unsplash.com/photo-456?w=800"
]
```

#### video
Video reference (URL or embed).
```typescript
{ name: 'intro', type: 'video', label: 'Intro Video' }
```

#### audio
Audio reference. Accepts a URL input or file upload in the admin UI. Stores the URL as a string. Renders an HTML5 `<audio>` player in the admin for preview.
```typescript
{ name: 'podcast', type: 'audio', label: 'Episode Audio' }
```

#### htmldoc
Full HTML document editor (visual WYSIWYG). Stores complete HTML as a string. Used for standalone HTML pages, email templates, or landing page sections.
```typescript
{ name: 'template', type: 'htmldoc', label: 'Email Template' }
```

#### file
File attachment. Stores a URL string to the uploaded file.
```typescript
{ name: 'download', type: 'file', label: 'Downloadable PDF' }
```

#### interactive
Reference to an Interactive (standalone HTML component managed in the Interactives library). Stores an interactive ID string.
```typescript
{ name: 'chart', type: 'interactive', label: 'Interactive Chart' }
```

#### column-slots
Multi-column layout with configurable slot count. Each slot contains nested fields.
```typescript
{ name: 'layout', type: 'column-slots', label: 'Two Column Layout' }
```

#### select
Dropdown selection from predefined options. Requires `options` array.
```typescript
{
  name: 'category',
  type: 'select',
  label: 'Category',
  options: [
    { label: 'Web Development', value: 'web' },
    { label: 'Mobile App', value: 'mobile' },
    { label: 'AI Tools', value: 'ai' },
  ],
}
```

#### tags
Free-form tag input. Stored as `string[]`.
```typescript
{ name: 'tags', type: 'tags', label: 'Tags' }
```

#### relation
Reference to documents in another collection. Set `multiple: true` for many-to-many.
```typescript
{ name: 'author', type: 'relation', collection: 'team', label: 'Author' }
{ name: 'relatedPosts', type: 'relation', collection: 'posts', multiple: true, label: 'Related Posts' }
```

#### array
Repeatable list of sub-fields. Each item is an object with the defined fields. If `fields` is omitted, it stores a plain `string[]`.
```typescript
{
  name: 'bullets',
  type: 'array',
  label: 'Bullet Points',
  // No fields = string array
}

{
  name: 'stats',
  type: 'array',
  label: 'Stats',
  fields: [
    { name: 'value', type: 'text', label: 'Value' },
    { name: 'label', type: 'text', label: 'Label' },
  ],
}
```

#### object
A nested group of fields. Stored as a single object.
```typescript
{
  name: 'dropdown',
  type: 'object',
  label: 'Dropdown Menu',
  fields: [
    { name: 'type', type: 'select', options: [
      { label: 'List', value: 'list' },
      { label: 'Columns', value: 'columns' },
    ]},
    { name: 'sections', type: 'array', label: 'Sections', fields: [
      { name: 'heading', type: 'text' },
      { name: 'links', type: 'array', fields: [
        { name: 'label', type: 'text' },
        { name: 'href', type: 'text' },
        { name: 'external', type: 'boolean' },
      ]},
    ]},
  ],
}
```

#### blocks
Dynamic content sections using the block system. Stored as an array of block objects, each with a `_block` discriminator field.
```typescript
{
  name: 'sections',
  type: 'blocks',
  label: 'Page Sections',
  blocks: ['hero', 'features', 'cta'],  // References block names defined in config.blocks
}
```
