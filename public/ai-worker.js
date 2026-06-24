// AI Proxy Service Worker
// Intercepts requests to /__ai_proxy__ and forwards them to the actual AI API endpoint.
// This avoids CORS issues by making the fetch from the service worker context.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === "/__ai_proxy__") {
    event.respondWith(handleProxy(event.request));
  }
});

async function handleProxy(request) {
  try {
    const { targetUrl, method, headers, body } = await request.json();

    const fetchOptions = {
      method: method || "POST",
      headers: headers || {},
    };
    if (body) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Clone and forward the response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${error.message}` }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
