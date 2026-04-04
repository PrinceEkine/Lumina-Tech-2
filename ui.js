// UI Management Module
export const setupTheme = () => {
  const themeToggles = document.querySelectorAll('.theme-toggle-btn');
  const body = document.body;

  const updateThemeIcons = (isLight) => {
    themeToggles.forEach(btn => {
      btn.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });
  };

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    body.classList.add('light-mode');
    updateThemeIcons(true);
  }

  themeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      body.classList.toggle('light-mode');
      const isLight = body.classList.contains('light-mode');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      updateThemeIcons(isLight);
    });
  });
};

export class CurrencyManager {
  constructor() {
    this.currencies = {
      'USD': { symbol: '$', rate: 1, name: 'US Dollar' },
      'EUR': { symbol: '€', rate: 0.92, name: 'Euro' },
      'GBP': { symbol: '£', rate: 0.79, name: 'British Pound' },
      'NGN': { symbol: '₦', rate: 1500, name: 'Nigerian Naira' }
    };
    this.current = localStorage.getItem('currency') || 'USD';
    if (!this.currencies[this.current]) this.current = 'USD';
    
    if (!localStorage.getItem('currency')) {
      this.autoDetectCurrency();
    }
  }

  async autoDetectCurrency() {
    if (localStorage.getItem('currency')) return;
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (!response.ok) throw new Error('IP API failed');
      const data = await response.json();
      if (data && data.currency && this.currencies[data.currency]) {
        this.setCurrency(data.currency);
        const selectors = document.querySelectorAll('.currency-selector');
        selectors.forEach(s => s.value = data.currency);
      }
    } catch (error) {
      console.warn('Currency auto-detection failed:', error.message);
    }
  }

  get symbol() { return this.currencies[this.current].symbol; }
  get rate() { return this.currencies[this.current].rate; }

  format(amount) {
    const converted = amount * this.rate;
    return `${this.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  setCurrency(code) {
    if (this.currencies[code]) {
      this.current = code;
      localStorage.setItem('currency', code);
      this.refreshUI();
    }
  }

  refreshUI() {
    document.querySelectorAll('[data-price]').forEach(el => {
      const basePrice = parseFloat(el.getAttribute('data-price'));
      if (!isNaN(basePrice)) {
        el.innerText = this.format(basePrice);
      }
    });
    // Trigger global event for other components to refresh
    window.dispatchEvent(new CustomEvent('currencyChanged', { detail: { code: this.current } }));
  }
}

export const setupCurrencySelectors = (manager) => {
  const selectors = document.querySelectorAll('.currency-selector');
  selectors.forEach(select => {
    select.value = manager.current;
    select.addEventListener('change', (e) => {
      manager.setCurrency(e.target.value);
      selectors.forEach(s => s.value = e.target.value);
    });
  });
};
