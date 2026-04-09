import { error } from '@sveltejs/kit';
import { cms, getString, InvalidName } from '$lib/server/webhouse';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  let post;
  try {
    post = cms.document('posts', params.slug);
  } catch (e) {
    if (e instanceof InvalidName) {
      throw error(400, 'Invalid slug');
    }
    throw e;
  }
  if (!post) throw error(404, 'Post not found');

  const translation = cms.findTranslation(post, 'posts');
  return { post, translation };
};
