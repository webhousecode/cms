import path from 'path';

const adminModules = '/Users/cb/Apps/webhouse/cms-engine/packages/cms-admin/node_modules';

export default {
  resolve: {
    alias: {
      'react': path.join(adminModules, 'react'),
      'react-dom': path.join(adminModules, 'react-dom'),
      'lucide-react': path.join(adminModules, 'lucide-react'),
    },
  },
  esbuild: { jsx: 'automatic' },
};
