/**
 * Image optimization utilities
 * Implements best practices for reducing payload size
 */

/**
 * Get optimized image URL parameters for Instagram images
 * Reduces payload by requesting appropriate sizes and formats
 */
export function getOptimizedImageParams(mediaUrl: string, type: 'thumbnail' | 'full' = 'full'): string {
  // Instagram Graph API supports size parameters
  const url = new URL(mediaUrl);
  
  if (type === 'thumbnail') {
    // Request smaller thumbnail for previews (150x150)
    url.searchParams.set('size', 't');
  } else {
    // Request medium size for full view (640x640) instead of original
    url.searchParams.set('size', 'm');
  }
  
  return url.toString();
}

/**
 * Determine if an image should be lazy loaded
 * First 6 images load immediately, rest are lazy loaded
 */
export function shouldLazyLoad(index: number): boolean {
  return index >= 6;
}

/**
 * Get cache headers for different resource types
 */
export function getCacheHeaders(resourceType: 'image' | 'data' | 'static'): Record<string, string> {
  const headers: Record<string, string> = {};
  
  switch (resourceType) {
    case 'image':
      // Images cached for 7 days, with stale-while-revalidate for 30 days
      headers['Cache-Control'] = 'public, max-age=604800, stale-while-revalidate=2592000, immutable';
      headers['Vary'] = 'Accept'; // For WebP negotiation
      break;
    case 'data':
      // Data cached for 5 minutes with revalidation
      headers['Cache-Control'] = 'public, max-age=300, must-revalidate';
      headers['ETag'] = generateETag();
      break;
    case 'static':
      // Static resources cached for 1 year
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      break;
  }
  
  return headers;
}

/**
 * Generate ETag for cache validation
 */
function generateETag(): string {
  return `"${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}"`;
}

/**
 * Get compression headers
 */
export function getCompressionHeaders(accept?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Modern browsers support Brotli compression (better than gzip)
  if (accept?.includes('br')) {
    headers['Content-Encoding'] = 'br';
  } else if (accept?.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
  }
  
  return headers;
}

/**
 * PRPL Pattern implementation hints
 * P - Push (or preload) critical resources
 * R - Render initial route
 * P - Pre-cache remaining routes
 * L - Lazy-load remaining routes on demand
 */
export const PRPL_CONFIG = {
  // Critical resources that should be preloaded
  criticalResources: [
    '/app/entry.client.tsx',
    '/app/root.tsx',
  ],
  
  // Routes that should be pre-cached after initial load
  preCacheRoutes: [
    '/app/routes/app.dashboard.tsx',
  ],
  
  // Routes that should be lazy loaded on demand
  lazyRoutes: [
    '/app/routes/app.settings.tsx',
    '/app/routes/instagram.callback.tsx',
  ],
};

/**
 * Calculate optimal image quality based on device capabilities
 * Returns quality setting (1-100) for JPEG compression
 */
export function getOptimalImageQuality(connection?: string): number {
  // Default to 85 as recommended by Google
  const DEFAULT_QUALITY = 85;
  
  // Reduce quality on slow connections
  if (connection === 'slow-2g' || connection === '2g') {
    return 70;
  }
  
  if (connection === '3g') {
    return 80;
  }
  
  return DEFAULT_QUALITY;
}

/**
 * Generate responsive image srcset for better performance
 */
export function generateSrcSet(baseUrl: string): string {
  const sizes = [320, 640, 960, 1280];
  return sizes
    .map(size => `${baseUrl}?w=${size} ${size}w`)
    .join(', ');
}
