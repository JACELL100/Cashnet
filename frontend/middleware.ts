import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware that ensures every response includes Cross-Origin-Opener-Policy.
 *
 * Coinbase Wallet SDK (`@coinbase/wallet-sdk`) performs a HEAD request against
 * `window.location.href` to read the COOP header. Next.js dev server returns
 * 404 for HEAD requests on app-router pages, causing:
 *   "Error checking Cross-Origin-Opener-Policy: HTTP error! status: 404"
 *
 * This middleware:
 *  1. For HEAD requests → returns a 200 with the COOP header immediately,
 *     short-circuiting the app router entirely.
 *  2. For all other requests → adds the COOP header to the response so
 *     WalletConnect's verify SDK is also satisfied.
 * 
 * IMPORTANT: Using 'unsafe-none' for COOP to allow Google Sign-In popups to work.
 * Google Sign-In requires the ability to communicate across origins.
 */
export function middleware(request: NextRequest) {
  // HEAD requests: respond immediately with the required header
  if (request.method === 'HEAD') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    });
  }

  // All other requests: add the header to the normal response
  const response = NextResponse.next();
  response.headers.set('Cross-Origin-Opener-Policy', 'unsafe-none');
  response.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
  return response;
}

// Run on every route
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
