// Page context interceptor for Snapp Express API requests
// This script runs in the page context (not content script context)
// to intercept fetch and XMLHttpRequest calls

(function() {
  'use strict';

  const API_BASE_URL = 'https://api.snapp.express';

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    let urlString = null;
    
    if (typeof url === 'string') {
      urlString = url;
    } else if (url instanceof Request) {
      urlString = url.url;
    }
    
    if (urlString && urlString.startsWith(API_BASE_URL)) {
      extractAndSendParams(urlString);
    }
    
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (typeof url === 'string' && url.startsWith(API_BASE_URL)) {
      extractAndSendParams(url);
    }
    
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  function extractAndSendParams(urlString) {
    try {
      const url = new URL(urlString);
      const lat = url.searchParams.get('lat');
      const long = url.searchParams.get('long');
      const pro_discount = url.searchParams.get('pro_discount');
      const pro_client = url.searchParams.get('pro_client');
      const client = url.searchParams.get('client');
      const deviceType = url.searchParams.get('deviceType');
      const appVersion = url.searchParams.get('appVersion');
      const UDID = url.searchParams.get('UDID');

      if (lat && long) {
        window.postMessage({
          source: 'SNAPP_EXT',
          type: 'SEARCH_CONTEXT',
          payload: {
            lat: lat,
            long: long,
            pro_discount: pro_discount,
            pro_client: pro_client,
            client: client,
            deviceType: deviceType,
            appVersion: appVersion,
            UDID: UDID
          }
        }, '*');
      }
    } catch (error) {
      console.error('Snapp Extension: Error extracting params from URL:', error);
    }
  }
})();

