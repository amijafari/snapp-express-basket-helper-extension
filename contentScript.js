// Content script for Snapp Express Basket Helper
// Runs on https://express.snapp.market/*

const DEFAULT_LAT = 35.737;
const DEFAULT_LONG = 51.395;
const DEFAULT_PRO_DISCOUNT = '18000';
const DEFAULT_PRO_CLIENT = 'snapp';
const DEFAULT_CLIENT = 'PWA';
const DEFAULT_DEVICE_TYPE = 'PWA';
const DEFAULT_APP_VERSION = '1.333.5';
const DEFAULT_UDID = '3cba87c6-e238-4852-86d7-0352fec57794';

const OVERLAY_ID = 'snapp-basket-helper-overlay';

// Store dynamic values captured from page's API requests
let dynamicSearchContext = {
  lat: null,
  long: null,
  pro_discount: null,
  pro_client: null,
  client: null,
  deviceType: null,
  appVersion: null,
  UDID: null
};

// Inject pageInterceptor.js into the page context
function injectPageInterceptor() {
  // Check if already injected
  if (window.__SNAPP_EXT_INTERCEPTOR_INJECTED__) {
    return;
  }
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageInterceptor.js');
  script.onload = function() {
    this.remove();
    window.__SNAPP_EXT_INTERCEPTOR_INJECTED__ = true;
  };
  script.onerror = function() {
    console.error('Snapp Extension: Failed to inject pageInterceptor.js');
  };
  
  const target = document.head || document.documentElement;
  target.insertBefore(script, target.firstChild);
}

// Listen for messages from page interceptor
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data && event.data.source === 'SNAPP_EXT') {
    const { lat, long, pro_discount, pro_client, client, deviceType, appVersion, UDID } = event.data.payload;
    
    if (event.data.type === 'SEARCH_CONTEXT') {
      const hasChanges = 
        (lat != null && dynamicSearchContext.lat !== lat) ||
        (long != null && dynamicSearchContext.long !== long) ||
        (UDID != null && dynamicSearchContext.UDID !== UDID) ||
        (pro_discount != null && dynamicSearchContext.pro_discount !== pro_discount) ||
        (pro_client != null && dynamicSearchContext.pro_client !== pro_client) ||
        (client != null && dynamicSearchContext.client !== client) ||
        (deviceType != null && dynamicSearchContext.deviceType !== deviceType) ||
        (appVersion != null && dynamicSearchContext.appVersion !== appVersion);
      
      if (hasChanges) {
        dynamicSearchContext = {
          lat: lat != null ? lat : dynamicSearchContext.lat,
          long: long != null ? long : dynamicSearchContext.long,
          pro_discount: pro_discount != null ? pro_discount : dynamicSearchContext.pro_discount,
          pro_client: pro_client != null ? pro_client : dynamicSearchContext.pro_client,
          client: client != null ? client : dynamicSearchContext.client,
          deviceType: deviceType != null ? deviceType : dynamicSearchContext.deviceType,
          appVersion: appVersion != null ? appVersion : dynamicSearchContext.appVersion,
          UDID: UDID != null ? UDID : dynamicSearchContext.UDID
        };
        console.log('Snapp Extension: Updated search context:', dynamicSearchContext);
      }
    }
  }
});

// Inject interceptor when content script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectPageInterceptor);
} else {
  injectPageInterceptor();
}

function isSearchContextInitialized() {
  return dynamicSearchContext.lat !== null && 
         dynamicSearchContext.long !== null && 
         dynamicSearchContext.UDID !== null;
}

function showInitAlert() {
  alert('لطفاً ابتدا یک محصول را در سایت جستجو کنید تا افزونه راه‌اندازی شود.');
}

async function searchProduct(query, lat = null, long = null, pro_discount = null, page = 0) {
  const baseUrl = 'https://api.snapp.express/mobile/v3/search';
  
  // Use provided values or dynamic values from context (no defaults)
  const finalLat = lat || dynamicSearchContext.lat;
  const finalLong = long || dynamicSearchContext.long;
  const finalProDiscount = pro_discount || dynamicSearchContext.pro_discount;
  const finalProClient = dynamicSearchContext.pro_client;
  const finalClient = dynamicSearchContext.client;
  const finalDeviceType = dynamicSearchContext.deviceType;
  const finalAppVersion = dynamicSearchContext.appVersion;
  const finalUDID = dynamicSearchContext.UDID;
  
  // Validate required parameters
  if (!finalLat || !finalLong || !finalProDiscount) {
    throw new Error('Search context not initialized. Please search for an item on the website first.');
  }
  
  const params = new URLSearchParams({
    query: query,
    superType: '[4]',
    new_design: '0',
    lat: finalLat.toString(),
    long: finalLong.toString(),
    new_search: '1',
    page: page.toString(),
    pro_client: finalProClient,
    pro_discount: finalProDiscount.toString(),
    size: '20',
    source: '2',
    client: finalClient,
    deviceType: finalDeviceType,
    appVersion: finalAppVersion,
    UDID: finalUDID
  });

  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'accept': 'application/json, text/plain, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error searching for product "${query}":`, error);
    throw error;
  }
}

function extractVendors(apiResponse) {
  try {
    const items = apiResponse?.data?.vendor_product_variations?.items || [];
    return items;
  } catch (error) {
    console.error('Error extracting vendors:', error);
    return [];
  }
}

async function findVendorsWithAllProducts(productNames) {
  if (!productNames || productNames.length === 0) {
    return [];
  }

  // Map to track vendors: vendorId -> { vendor, products: Map<productName, productObject> }
  const vendorMap = new Map();

  const searchPromises = productNames.map(async (productName) => {
    try {
      const response = await searchProduct(productName);
      const vendors = extractVendors(response);
      
      vendors.forEach(vendor => {
        const vendorId = vendor.id;
        
        if (!vendorMap.has(vendorId)) {
          vendorMap.set(vendorId, {
            vendor: vendor,
            products: new Map()
          });
        }
        
        const matchedProduct = vendor.products && vendor.products.length > 0 
          ? vendor.products[0] 
          : null;
        
        vendorMap.get(vendorId).products.set(productName, matchedProduct);
      });
      
      return { productName, success: true };
    } catch (error) {
      console.error(`Failed to search for "${productName}":`, error);
      return { productName, success: false, error: error.message };
    }
  });

  const results = await Promise.all(searchPromises);
  
  const failedSearches = results.filter(r => !r.success);
  if (failedSearches.length > 0) {
    const failedProducts = failedSearches.map(r => r.productName).join(', ');
    throw new Error(`Failed to search for: ${failedProducts}`);
  }

  const matchingVendors = [];
  const totalProducts = productNames.length;

  vendorMap.forEach(({ vendor, products }) => {
    if (products.size === totalProducts) {
      const matchedProductsData = productNames.map(productName => {
        const productObj = products.get(productName);
        return {
          name: productName,
          product: productObj
        };
      });

      matchingVendors.push({
        vendorId: vendor.id,
        code: vendor.code || null,
        title: vendor.title || 'فروشگاه نامشخص',
        address: vendor.address || 'آدرس در دسترس نیست',
        rating: vendor.rating || null,
        deliveryFee: vendor.deliveryFee || null,
        deliveryTime: vendor.deliveryTime || null,
        featured: vendor.featured || null,
        matchedProducts: matchedProductsData
      });
    }
  });

  matchingVendors.sort((a, b) => {
    const feeA = a.deliveryFee ?? Infinity;
    const feeB = b.deliveryFee ?? Infinity;
    return feeA - feeB;
  });

  return matchingVendors;
}

function formatDeliveryFee(fee) {
  if (fee === null || fee === undefined) {
    return 'نامشخص';
  }
  return fee.toLocaleString('fa-IR') + ' تومان';
}

function formatRating(rating) {
  if (rating === null || rating === undefined) {
    return 'نامشخص';
  }
  return rating.toFixed(1);
}

function getProductImage(product) {
  if (!product || !product.images || !Array.isArray(product.images) || product.images.length === 0) {
    return null;
  }
  const firstImage = product.images[0];
  return firstImage.thumb || firstImage.main || null;
}

function showResultsOverlay(vendors, items) {
  let overlay = document.getElementById(OVERLAY_ID);
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    document.body.appendChild(overlay);
  } else {
    overlay.innerHTML = '';
  }

  const style = document.createElement('style');
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 380px;
      max-height: 70vh;
      overflow-y: auto;
      background-color: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      direction: rtl;
    }
    
    #${OVERLAY_ID} .overlay-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }
    
    #${OVERLAY_ID} .overlay-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    
    #${OVERLAY_ID} .close-btn {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s;
    }
    
    #${OVERLAY_ID} .close-btn:hover {
      background-color: #f0f0f0;
    }
    
    #${OVERLAY_ID} .vendor-card {
      padding: 12px;
      margin-bottom: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background-color: #fafafa;
    }
    
    #${OVERLAY_ID} .vendor-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    
    #${OVERLAY_ID} .vendor-icon {
      width: 50px;
      height: 50px;
      border-radius: 6px;
      object-fit: cover;
      border: 1px solid #e0e0e0;
      flex-shrink: 0;
    }
    
    #${OVERLAY_ID} .vendor-header-text {
      flex: 1;
    }
    
    #${OVERLAY_ID} .vendor-title {
      font-size: 15px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }
    
    #${OVERLAY_ID} .vendor-title-link {
      color: #333;
      text-decoration: none;
      display: block;
    }
    
    #${OVERLAY_ID} .vendor-title-link:hover {
      color: #4CAF50;
    }
    
    #${OVERLAY_ID} .vendor-info {
      font-size: 13px;
      color: #666;
      margin-bottom: 4px;
    }
    
    #${OVERLAY_ID} .vendor-details {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 12px;
      color: #888;
      flex-wrap: wrap;
    }
    
    #${OVERLAY_ID} .product-images {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    
    #${OVERLAY_ID} .product-image {
      width: 50px;
      height: 50px;
      border-radius: 4px;
      object-fit: cover;
      border: 1px solid #e0e0e0;
    }
    
    #${OVERLAY_ID} .no-results {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 14px;
    }
  `;
  
  // Remove existing style if any, then add new one
  const existingStyle = document.getElementById(`${OVERLAY_ID}-style`);
  if (existingStyle) {
    existingStyle.remove();
  }
  style.id = `${OVERLAY_ID}-style`;
  document.head.appendChild(style);

  const header = document.createElement('div');
  header.className = 'overlay-header';
  
  const title = document.createElement('div');
  title.className = 'overlay-title';
  title.textContent = `فروشگاه‌هایی که همه ${items.length} محصول را دارند`;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '×';
  closeBtn.title = 'بستن';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    style.remove();
  });
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  const content = document.createElement('div');
  
  if (vendors.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.textContent = 'هیچ فروشگاهی همه محصولات لیست شما را ندارد.';
    content.appendChild(noResults);
  } else {
    vendors.forEach(vendor => {
      const card = document.createElement('div');
      card.className = 'vendor-card';
      
      const vendorHeader = document.createElement('div');
      vendorHeader.className = 'vendor-header';
      
      if (vendor.featured) {
        const iconImg = document.createElement('img');
        iconImg.className = 'vendor-icon';
        iconImg.src = vendor.featured;
        iconImg.alt = vendor.title;
        iconImg.onerror = function() {
          this.style.display = 'none';
        };
        vendorHeader.appendChild(iconImg);
      }
      
      const headerText = document.createElement('div');
      headerText.className = 'vendor-header-text';
      
      const titleEl = document.createElement('div');
      titleEl.className = 'vendor-title';
      if (vendor.code) {
        const titleLink = document.createElement('a');
        titleLink.className = 'vendor-title-link';
        titleLink.href = `https://express.snapp.market/supermarket/m/${vendor.code}`;
        titleLink.target = '_blank';
        titleLink.textContent = vendor.title;
        titleEl.appendChild(titleLink);
      } else {
        titleEl.textContent = vendor.title;
      }
      
      headerText.appendChild(titleEl);
      vendorHeader.appendChild(headerText);
      card.appendChild(vendorHeader);
      
      const addressEl = document.createElement('div');
      addressEl.className = 'vendor-info';
      addressEl.textContent = vendor.address;
      card.appendChild(addressEl);
      
      const detailsEl = document.createElement('div');
      detailsEl.className = 'vendor-details';
      
      if (vendor.rating !== null) {
        const ratingSpan = document.createElement('span');
        ratingSpan.textContent = `⭐ ${formatRating(vendor.rating)}`;
        detailsEl.appendChild(ratingSpan);
      }
      
      const feeSpan = document.createElement('span');
      feeSpan.textContent = `💰 ${formatDeliveryFee(vendor.deliveryFee)}`;
      detailsEl.appendChild(feeSpan);
      
      if (vendor.deliveryTime !== null) {
        const timeSpan = document.createElement('span');
        timeSpan.textContent = `⏱️ ${vendor.deliveryTime} دقیقه`;
        detailsEl.appendChild(timeSpan);
      }
      
      card.appendChild(detailsEl);
      
      const productImagesContainer = document.createElement('div');
      productImagesContainer.className = 'product-images';
      
      vendor.matchedProducts.forEach(({ name, product }) => {
        const imageUrl = getProductImage(product);
        if (imageUrl) {
          const productImg = document.createElement('img');
          productImg.className = 'product-image';
          productImg.src = imageUrl;
          productImg.alt = name;
          productImg.title = name;
          productImg.onerror = function() {
            this.style.display = 'none';
          };
          productImagesContainer.appendChild(productImg);
        }
      });
      
      if (productImagesContainer.children.length > 0) {
        card.appendChild(productImagesContainer);
      }
      
      content.appendChild(card);
    });
  }
  
  overlay.appendChild(content);
}

// Message listener for communication with popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'FIND_STORES_FOR_LIST') {
        const items = message.items;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
          sendResponse({
            ok: false,
            error: 'لیست محصولات نامعتبر است: باید آرایه‌ای غیرخالی باشد'
          });
          return;
        }

        const validItems = items.filter(item => item && typeof item === 'string' && item.trim().length > 0);
        
        if (validItems.length === 0) {
          sendResponse({
            ok: false,
            error: 'هیچ نام محصول معتبری ارائه نشده است'
          });
          return;
        }

        // Check if search context is initialized
        if (!isSearchContextInitialized()) {
          showInitAlert();
          sendResponse({
            ok: false,
            error: 'لطفاً ابتدا یک محصول را در سایت جستجو کنید تا افزونه راه‌اندازی شود.'
          });
          return;
        }

        console.log('Searching for vendors with products:', validItems);

        const vendors = await findVendorsWithAllProducts(validItems);
        
        console.log(`Found ${vendors.length} matching vendors`);

        showResultsOverlay(vendors, validItems);

        sendResponse({
          ok: true,
          result: vendors
        });
      } else {
        sendResponse({
          ok: false,
          error: 'نوع پیام نامشخص'
        });
      }
    } catch (error) {
      console.error('Error in content script message handler:', error);
      sendResponse({
        ok: false,
        error: error.message || 'خطای نامشخص رخ داد'
      });
    }
  })();

  return true;
});

console.log('Snapp Express Basket Helper content script loaded');

