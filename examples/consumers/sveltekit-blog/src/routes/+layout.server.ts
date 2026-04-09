import { cms, getString } from '$lib/server/webhouse';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
  const globals = cms.globals();
  return {
    globals: {
      brandPrefix: getString(globals, 'brandPrefix', '@webhouse/cms'),
      brandSuffix: getString(globals, 'brandSuffix', 'SvelteKit'),
      footerText: getString(globals, 'footerText', 'Powered by @webhouse/cms'),
    },
  };
};
