import { cms } from '$lib/server/webhouse';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  return {
    posts: cms.collection('posts', 'da'),
    locale: 'da',
  };
};
