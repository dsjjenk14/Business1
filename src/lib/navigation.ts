import type { Href, useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** Go back if there's a screen to go back to (not the case when opened from a link); otherwise go to `fallback`. */
export function goBackOr(router: Router, fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
