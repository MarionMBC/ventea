import { useEffect } from 'react';

import { canonicalUrl, routeMeta } from '@/seo/meta';

/**
 * Título, description y canonical de la ruta actual. El HTML de cada ruta ya los trae del
 * build (seo-plugin); esto los mantiene correctos en desarrollo y si la vista cambia en cliente.
 */
export function useRouteMeta(pathname: string): void {
  useEffect(() => {
    const route = routeMeta(pathname);
    document.title = route.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', route.description);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrl(route));
  }, [pathname]);
}
