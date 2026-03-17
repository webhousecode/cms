import type { BlockConfig } from './types.js';

export const builtinBlocks: BlockConfig[] = [
  {
    name: 'columns',
    label: 'Columns',
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
    fields: [
      { name: 'interactiveId', type: 'interactive' as const, label: 'Interactive', required: true },
      { name: 'caption', type: 'text', label: 'Caption' },
      { name: 'scale', type: 'number', label: 'Scale (%)' },
      { name: 'allowFullscreen', type: 'boolean', label: 'Fullscreen button' },
      { name: 'fullscreenLabel', type: 'text', label: 'Fullscreen button label' },
    ],
  },
];
