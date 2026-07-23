const SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function withSecurityHeaders(response) {
  const next = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    next.headers.set(name, value);
  }
  return next;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404) {
      return withSecurityHeaders(assetResponse);
    }

    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if ((request.method === 'GET' || request.method === 'HEAD') && acceptsHtml) {
      const indexUrl = new URL('/index.html', url);
      const indexRequest = new Request(indexUrl, request);
      return withSecurityHeaders(await env.ASSETS.fetch(indexRequest));
    }

    return withSecurityHeaders(assetResponse);
  },
};
