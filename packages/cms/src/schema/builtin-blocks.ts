import type { BlockConfig } from './types.js';

export const builtinBlocks: BlockConfig[] = [
  {
    name: 'columns',
    label: 'Columns',
    propertyFields: ['label'],
    fields: [
      { name: 'label', type: 'text', label: 'Label (internal)' },
      {
        name: 'layout',
        type: 'select',
        label: 'Layout',
        defaultValue: '1-1',
        options: [
          { label: '50 / 50', value: '1-1' },
          { label: '66 / 33', value: '2-1' },
          { label: '33 / 66', value: '1-2' },
          { label: '3 equal', value: '1-1-1' },
          { label: '4 equal', value: '1-1-1-1' },
        ],
      },
      { name: 'columns', type: 'column-slots' as const, label: 'Columns' },
    ],
  },
  {
    name: 'video',
    label: 'Video',
    fields: [
      { name: 'src', type: 'video', label: 'Video URL', required: true },
      { name: 'caption', type: 'text', label: 'Caption' },
    ],
  },
  {
    name: 'audio',
    label: 'Audio',
    fields: [
      { name: 'src', type: 'audio', label: 'Audio File', required: true },
      { name: 'caption', type: 'text', label: 'Caption' },
    ],
  },
  {
    name: 'file',
    label: 'File',
    fields: [
      { name: 'src', type: 'file' as const, label: 'File', required: true },
      { name: 'filename', type: 'text', label: 'Display Name' },
    ],
  },
  {
    name: 'interactive',
    label: 'Interactive',
    propertyFields: ['scale', 'allowFullscreen', 'fullscreenLabel'],
    fields: [
      { name: 'interactiveId', type: 'interactive' as const, label: 'Interactive', required: true },
      { name: 'caption', type: 'text', label: 'Caption' },
      { name: 'scale', type: 'number', label: 'Scale (%)' },
      { name: 'allowFullscreen', type: 'boolean', label: 'Fullscreen button' },
      { name: 'fullscreenLabel', type: 'text', label: 'Fullscreen button label' },
    ],
  },
  // ── Field-type wrapper blocks ──────────────────────────────
  // These allow inserting any field type as a block in the editor.
  {
    name: 'text',
    label: 'Text',
    fields: [
      { name: 'content', type: 'text', label: 'Text' },
    ],
  },
  {
    name: 'textarea',
    label: 'Text Area',
    fields: [
      { name: 'content', type: 'textarea', label: 'Text' },
    ],
  },
  {
    name: 'richtext',
    label: 'Rich Text',
    fields: [
      { name: 'content', type: 'richtext', label: 'Content' },
    ],
  },
  {
    name: 'image',
    label: 'Image',
    fields: [
      { name: 'src', type: 'image', label: 'Image', required: true },
      { name: 'alt', type: 'text', label: 'Alt text' },
      { name: 'caption', type: 'text', label: 'Caption' },
    ],
  },
  {
    name: 'image-gallery',
    label: 'Image Gallery',
    fields: [
      { name: 'images', type: 'image-gallery' as const, label: 'Images' },
      { name: 'caption', type: 'text', label: 'Caption' },
    ],
  },
  {
    name: 'number',
    label: 'Number',
    fields: [
      { name: 'value', type: 'number', label: 'Value' },
      { name: 'label', type: 'text', label: 'Label' },
    ],
  },
  {
    name: 'boolean',
    label: 'Toggle',
    fields: [
      { name: 'value', type: 'boolean', label: 'Value' },
      { name: 'label', type: 'text', label: 'Label' },
    ],
  },
  {
    name: 'date',
    label: 'Date',
    fields: [
      { name: 'value', type: 'date', label: 'Date' },
      { name: 'label', type: 'text', label: 'Label' },
    ],
  },
  {
    name: 'select',
    label: 'Select',
    fields: [
      { name: 'value', type: 'text', label: 'Value' },
      { name: 'label', type: 'text', label: 'Label' },
    ],
  },
  {
    name: 'tags',
    label: 'Tags',
    fields: [
      { name: 'tags', type: 'tags', label: 'Tags' },
    ],
  },
  {
    name: 'htmldoc',
    label: 'HTML Document',
    fields: [
      { name: 'content', type: 'htmldoc' as const, label: 'HTML' },
    ],
  },
  {
    name: 'relation',
    label: 'Relation',
    fields: [
      { name: 'ref', type: 'text', label: 'Reference (slug)' },
      { name: 'collection', type: 'text', label: 'Collection' },
    ],
  },
];
