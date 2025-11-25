// Initialize popup with default product inputs
document.addEventListener('DOMContentLoaded', () => {
  const productList = document.getElementById('product-list');
  const addProductBtn = document.getElementById('add-product');
  const findStoresBtn = document.getElementById('find-stores');
  const statusDiv = document.getElementById('status');

  // Create initial 2 product input rows
  for (let i = 0; i < 2; i++) {
    addProductInput();
  }

  // Focus first input when popup opens
  const firstInput = productList.querySelector('input');
  if (firstInput) {
    firstInput.focus();
  }

  // Add product button handler
  addProductBtn.addEventListener('click', () => {
    addProductInput();
  });

  // Find stores button handler
  findStoresBtn.addEventListener('click', async () => {
    await handleFindStores();
  });

  /**
   * Adds a new product input row to the list
   */
  function addProductInput() {
    const row = document.createElement('div');
    row.className = 'product-row';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'نام محصول';
    
    // Add Enter key handler to trigger search
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFindStores();
      }
    });
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-product-btn';
    removeBtn.textContent = '×';
    removeBtn.title = 'حذف';
    removeBtn.type = 'button';
    removeBtn.tabIndex = -1; // Skip in tab navigation
    removeBtn.addEventListener('click', () => {
      removeProductInput(row);
    });
    
    row.appendChild(input);
    row.appendChild(removeBtn);
    productList.appendChild(row);
    
    // Update remove button visibility
    updateRemoveButtonsVisibility();
    
    // Focus the new input
    input.focus();
  }

  /**
   * Removes a product input row
   * @param {HTMLElement} row - The row element to remove
   */
  function removeProductInput(row) {
    const rows = productList.querySelectorAll('.product-row');
    // Don't allow removing if it's the last row
    if (rows.length <= 1) {
      return;
    }
    row.remove();
    updateRemoveButtonsVisibility();
  }

  /**
   * Updates remove button visibility based on number of rows
   */
  function updateRemoveButtonsVisibility() {
    const rows = productList.querySelectorAll('.product-row');
    const removeButtons = productList.querySelectorAll('.remove-product-btn');
    
    removeButtons.forEach((btn, index) => {
      // Hide remove button if there's only one row
      if (rows.length <= 1) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'flex';
      }
    });
  }

  /**
   * Collects all non-empty product names from input fields
   * @returns {string[]} Array of product names
   */
  function collectProducts() {
    const inputs = productList.querySelectorAll('input');
    const products = [];
    
    inputs.forEach(input => {
      const value = input.value.trim();
      if (value) {
        products.push(value);
      }
    });
    
    return products;
  }

  /**
   * Updates the status message in the popup
   * @param {string} message - Status message
   * @param {string} type - Status type: 'info', 'success', 'error', 'warning'
   */
  function setStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }

  /**
   * Clears the status message
   */
  function clearStatus() {
    statusDiv.textContent = '';
    statusDiv.className = 'status';
  }

  /**
   * Handles the "Find stores" button click
   */
  async function handleFindStores() {
    clearStatus();
    
    // Collect products
    const products = collectProducts();
    
    // Validate products
    if (products.length === 0) {
      setStatus('لطفاً حداقل یک نام محصول وارد کنید.', 'warning');
      return;
    }

    // Disable button during search
    findStoresBtn.disabled = true;
    setStatus('در حال بررسی تب فعال...', 'info');

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        throw new Error('امکان دسترسی به تب فعال وجود ندارد');
      }

      // Check if tab is on express.snapp.market
      if (!tab.url.startsWith('https://express.snapp.market')) {
        setStatus('لطفاً ابتدا https://express.snapp.market را باز کنید، سپس دوباره تلاش کنید.', 'error');
        findStoresBtn.disabled = false;
        return;
      }

      // Show searching status
      setStatus('در حال جستجوی فروشگاه‌ها...', 'info');

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'FIND_STORES_FOR_LIST',
        items: products
      });

      // Handle response
      if (response && response.ok) {
        const count = response.result ? response.result.length : 0;
        if (count > 0) {
          setStatus(`${count} فروشگاه پیدا شد! نتایج در صفحه نمایش داده شده است.`, 'success');
        } else {
          setStatus('هیچ فروشگاهی پیدا نشد که همه محصولات لیست شما را داشته باشد.', 'warning');
        }
        // Close popup after showing results
        setTimeout(() => {
          window.close();
        }, 500);
      } else {
        const errorMsg = response?.error || 'خطای نامشخص رخ داد';
        setStatus(`خطا: ${errorMsg}`, 'error');
      }
    } catch (error) {
      console.error('Error in handleFindStores:', error);
      setStatus(`خطا: ${error.message}`, 'error');
    } finally {
      findStoresBtn.disabled = false;
    }
  }
});

