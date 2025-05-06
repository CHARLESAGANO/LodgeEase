// LodgeEase Homepage Main JavaScript
// This script doesn't use ES modules and should work in all browsers

// Add cache busting mechanism
(function() {
  // Add cache-busting parameter to script and stylesheet URLs
  const addCacheBuster = () => {
    const timestamp = new Date().getTime();
    const scripts = document.querySelectorAll('script[src]');
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    
    // Add timestamp to scripts
    scripts.forEach(script => {
      if (script.src.includes('LodgeEase') || script.src.includes('lodgeease')) {
        const url = new URL(script.src);
        url.searchParams.set('v', timestamp);
        script.src = url.href;
      }
    });
    
    // Add timestamp to stylesheets
    links.forEach(link => {
      if (link.href.includes('LodgeEase') || link.href.includes('lodgeease')) {
        const url = new URL(link.href);
        url.searchParams.set('v', timestamp);
        link.href = url.href;
      }
    });
    
    console.log('Cache busting applied to resources');
  };
  
  // Run cache busting when DOM loads
  document.addEventListener('DOMContentLoaded', addCacheBuster);
  
  // Force reload if the page hasn't been reloaded in the last hour
  const lastReload = localStorage.getItem('lodgeEaseLastReload');
  const now = new Date().getTime();
  if (!lastReload || (now - parseInt(lastReload)) > 3600000) { // 1 hour in milliseconds
    localStorage.setItem('lodgeEaseLastReload', now);
    if (performance.navigation.type !== 1) { // Not a reload
      console.log('Forcing page reload for fresh content');
      location.reload(true); // Force reload from server
    }
  }
})();

// Global variables
let map = null;
let directionsService = null;
let directionsRenderer = null;
let userLocation = null;
let userMarker = null;
let markers = [];

// Sample lodge data (to be replaced by API data later)
const lodgeData = [
  {
    id: 13,
    name: "Ever Lodge",
    location: "Baguio City Center, Baguio City",
    barangay: "Session Road",
    image: "../components/6.jpg",
    price: 1300,
    promoPrice: 580,
    amenities: ["Mountain View", "High-speed WiFi", "Fitness Center", "Coffee Shop"],
    rating: 4.9,
    propertyType: "hotel",
    coordinates: {
      lat: 16.4088,
      lng: 120.6013
    }
  },
  {
    id: 1,
    name: "Pine Haven Lodge",
    location: "Camp John Hay, Baguio City",
    barangay: "Camp 7",
    image: "../components/pinehaven.jpg",
    price: 6500,
    amenities: ["Mountain View", "Fireplace", "WiFi"],
    rating: 4.8,
    propertyType: "hotel",
    coordinates: {
      lat: 16.4096,
      lng: 120.6010
    }
  }
];

// Make lodge data available globally
window.lodgeData = lodgeData;

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('Document ready, initializing app...');
  
  // Try to initialize Firebase with retry mechanism
  initFirebaseWithRetry();
  
  // Set up UI event listeners regardless of Firebase status
  setupEventListeners();
  
  // Apply CSS checks but with a brief delay to ensure DOM is fully parsed
  setTimeout(function() {
    if (window.checkAndFixCSS) {
      window.checkAndFixCSS();
    } else {
      console.warn('checkAndFixCSS function not available yet, will try again');
      setTimeout(window.checkAndFixCSS, 500);
    }
  }, 100);
});

function setupEventListeners() {
  // Set up filter buttons
  const filterButtons = document.querySelectorAll('.filter-button');
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      const filterValue = this.getAttribute('data-filter');
      console.log(`Filter clicked: ${filterValue}`);
      filterLodges(filterValue);
    });
  });
  
  // Set up search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      searchLodges(searchTerm);
    });
  }
}

// Initialize Firebase with config - DEPRECATED, now done in HTML
// This remains here for compatibility
function initializeFirebase() {
  console.log('Firebase already initialized in HTML');
  // Firebase initialization is now handled directly in the HTML
  return true;
}

// Load fallback data if Firebase isn't available
function loadFallbackData() {
  console.log('Loading fallback data without Firebase');
  
  // Check if we can access the rooms.js API
  if (window.LodgeEasePublicAPI && typeof window.LodgeEasePublicAPI.renderLodges === 'function') {
    // Use the API's own rendering function
    console.log('Using LodgeEasePublicAPI for fallback rendering');
    window.LodgeEasePublicAPI.renderLodges(window.LodgeEasePublicAPI.getAllLodges());
  } else {
    // Use our local function with the static data
    console.log('Using local createLodgeCards for fallback rendering');
  createLodgeCards(lodgeData);
  }

  // Since we're in fallback mode, also try to add the rooms.js script if it's not already there
  if (!document.querySelector('script[src*="rooms.js"]')) {
    console.log('Adding rooms.js script dynamically for fallback mode');
    const script = document.createElement('script');
    script.src = 'rooms.js?' + new Date().getTime(); // Add cache buster
    script.onload = () => {
      console.log('rooms.js loaded in fallback mode');
      // Try using the API again
      if (window.LodgeEasePublicAPI && typeof window.LodgeEasePublicAPI.renderLodges === 'function') {
        window.LodgeEasePublicAPI.renderLodges(window.LodgeEasePublicAPI.getAllLodges());
      }
    };
    document.head.appendChild(script);
  }
}

// Update login button visibility based on auth state
function updateLoginButtonVisibility(user) {
  const loginButton = document.getElementById('loginButton');
  const mobileLoginButton = document.getElementById("mobileLoginButton");
  
  if (loginButton) {
    loginButton.style.display = user ? 'none' : 'flex';
  }
  
  if (mobileLoginButton) {
    mobileLoginButton.style.display = user ? 'none' : 'block';
  }
}

// Create lodge cards in the container
function createLodgeCards(data) {
  console.log('Creating lodge cards with data:', data?.length || 0, 'lodges');
  
  const container = document.querySelector('.lodge-container');
  if (!container) {
    console.error('Lodge container not found!');
    return;
  }

  // First, check if there are already cards from rooms.js
  const existingCards = container.querySelectorAll('.lodge-card');
  if (existingCards.length > 2) {
    console.log('Lodge cards already exist from rooms.js, not recreating');
    return; // Don't recreate if cards already exist
  }

  // Check for valid data array
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('No valid lodge data provided to createLodgeCards');
    return;
  }

  // Clear any dynamically added cards but keep static ones
  const staticCards = Array.from(container.querySelectorAll('article.lodge-card:not([data-dynamic="true"])'));
  const staticCardIds = staticCards.map(card => {
    const id = parseInt(card.dataset.lodgeId || '0');
    return isNaN(id) ? 0 : id;
  });
  
  console.log('Static card IDs:', staticCardIds);
  
  // Remove only dynamically added cards
  container.querySelectorAll('article.lodge-card[data-dynamic="true"]').forEach(el => el.remove());
  
  data.forEach((lodge, index) => {
    // Skip if this lodge is already represented by a static card
    if (staticCardIds.includes(lodge.id)) {
      console.log(`Skipping lodge ${lodge.id} as it already exists as static card`);
      return;
    }
    
    const card = document.createElement('article');
    card.className = 'lodge-card bg-white rounded-lg shadow-md overflow-hidden h-full';
    card.style.animationDelay = `${index * 100}ms`;
    card.dataset.propertyType = lodge.propertyType || 'hotel';
    card.dataset.lodgeId = lodge.id;
    card.dataset.barangay = lodge.barangay || '';
    card.dataset.dynamic = "true"; // Mark as dynamically created

    const isEverLodge = lodge.id === 13;
    const bestValueBadge = isEverLodge ? `<div class="best-value-badge"></div>` : '';
    const promoTag = lodge.promoPrice ? 
      `<div class="promo-tag">
          <span class="promo-tag-label">NIGHT PROMO</span>
          <span class="promo-tag-price">₱${lodge.promoPrice}</span>
       </div>` : '';

    card.innerHTML = `
      <div class="relative w-full pb-[60%]">
          ${bestValueBadge}
          ${promoTag}
          <img src="${lodge.image}" alt="${lodge.name}" class="absolute inset-0 w-full h-full object-cover" onerror="this.onerror=null; this.src='../components/6.jpg';">
      </div>
      <div class="p-4">
          <h2 class="text-xl font-semibold mb-2">${lodge.name}</h2>
          <div class="location flex items-center text-gray-600 mb-2">
              <i class="ri-map-pin-line mr-1"></i>
              <span>${lodge.location}</span>
          </div>
          <div class="amenities flex flex-wrap gap-2 mb-4">
              ${lodge.amenities.map(amenity => 
                  `<span class="amenity-tag">${amenity}</span>`
              ).join('')}
          </div>
          <div class="flex items-center justify-between">
              <div class="rating flex items-center">
                  <span class="text-yellow-400 mr-1">★</span>
                  <span class="font-medium">${lodge.rating}</span>
              </div>
              <div class="price text-lg font-bold ${isEverLodge ? 'text-green-600' : ''}">
                  ₱${typeof lodge.price === 'number' ? lodge.price.toLocaleString() : lodge.price}
                  <span class="text-sm font-normal text-gray-600">/night</span>
              </div>
          </div>
      </div>
    `;

    // Add click event to show details
    card.addEventListener('click', function(e) {
      if (!e.target.closest('.favorite-btn')) {
        showLodgeDetails(lodge);
      }
    });

    container.appendChild(card);
    console.log(`Added dynamic lodge card: ${lodge.name}`);
  });
  
  console.log('Lodge cards creation complete');
}

// Show lodge details
function showLodgeDetails(lodge) {
  console.log('Showing details for:', lodge.name);
  
  // Check if modal already exists
  let modal = document.getElementById('lodgeDetailsModal');
  
  // Create modal if it doesn't exist
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'lodgeDetailsModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.style.display = 'none';
    document.body.appendChild(modal);
  }
  
  // Add promo price with improved styling if it exists
  const promoDisplay = lodge.promoPrice ? 
    `<div class="mt-3">
        <p class="flex items-center font-bold text-green-600 text-lg">
            <span class="inline-block bg-green-100 text-green-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">PROMO</span>
            Night Rate: ₱${lodge.promoPrice}
        </p>
        <p class="text-xs text-gray-500">(Check-in: 10PM - 8AM)</p>
     </div>` : '';
  
  // Add "Best Value" badge for Ever Lodge (id: 13)
  const bestValueBadge = lodge.id === 13 ? 
    `<span class="inline-block bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded mr-2">BEST VALUE</span>` : '';
  
  // Generate the correct file path to the lodge HTML file
  const bookingUrl = `../Lodge/lodge${lodge.id}.html`;
  
  // Populate modal content
  modal.innerHTML = `
    <div class="bg-white rounded-lg max-w-4xl w-full max-h-90vh overflow-y-auto relative">
      <div class="p-6">
        <button class="absolute top-4 right-4 text-gray-500 hover:text-gray-700" onclick="document.getElementById('lodgeDetailsModal').style.display = 'none'">
          <i class="ri-close-line text-2xl"></i>
        </button>
        
        <h2 class="text-2xl font-bold flex items-center mb-6">${bestValueBadge}${lodge.name}</h2>
        
        <img src="${lodge.image}" alt="${lodge.name}" class="w-full h-64 object-cover rounded-lg mb-6" 
             onerror="this.onerror=null; this.src='../components/6.jpg';">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 class="font-semibold mb-2">Location</h3>
            <p class="text-gray-600">${lodge.location}</p>
            
            <h3 class="font-semibold mt-4 mb-2">Price</h3>
            <p class="text-green-600 font-bold text-xl">₱${lodge.price.toLocaleString()} per night</p>
            ${promoDisplay}
            
            <h3 class="font-semibold mt-4 mb-2">Rating</h3>
            <div class="flex items-center">
              <span class="text-yellow-500 mr-1">${'★'.repeat(Math.floor(lodge.rating))}</span>
              <span class="text-gray-600">${lodge.rating}/5</span>
            </div>
          </div>
          <div>
            <h3 class="font-semibold mb-2">Amenities</h3>
            <div class="flex flex-wrap gap-2 mb-4">
              ${lodge.amenities.map(amenity => 
                `<span class="bg-gray-100 px-3 py-1 rounded-full text-sm">${amenity}</span>`
              ).join('')}
            </div>
            
            <a href="${bookingUrl}" class="block">
              <button class="w-full bg-blue-600 text-white py-3 rounded-lg mt-6 hover:bg-blue-700 transition-colors">
                Book Now
              </button>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Show the modal
  modal.style.display = 'flex';
  
  // Close modal when clicking outside content
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      modal.style.display = 'none';
    }
  });
}

// Initialize map view functionality
function initializeMapView() {
  const showMapBtn = document.getElementById("showMap");
  const closeMapBtn = document.getElementById("closeMap");
  const mapView = document.getElementById("mapView");

  if (showMapBtn && mapView) {
    showMapBtn.addEventListener("click", function() {
      mapView.classList.remove("hidden");
      
      // Try to ensure map is initialized
      if (typeof google !== 'undefined' && google.maps) {
        if (!window.mapInitialized && typeof initializeMapInstance === 'function') {
          console.log('Initializing map from map view button');
          initializeMapInstance();
        } else if (map) {
          // Trigger resize event to fix rendering
          window.setTimeout(function() {
            google.maps.event.trigger(map, 'resize');
          }, 100);
        }
      } else {
        console.warn('Google Maps not available yet - map might not display correctly');
      }
    });
  }

  if (closeMapBtn && mapView) {
    closeMapBtn.addEventListener("click", function() {
      mapView.classList.add("hidden");
    });
  }
}

// Initialize map when Google Maps API is loaded
function initMap() {
  if (typeof google === 'undefined') {
    console.log('Google Maps not loaded yet');
    return;
  }
  
  const baguioCity = { lat: 16.4023, lng: 120.5960 };
  
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 14,
    center: baguioCity,
    mapTypeControl: true
  });
  
  // Add markers for lodges
  if (window.lodgeData) {
    addMarkers(window.lodgeData);
  }
}

// Add markers to the map
function addMarkers(lodges) {
  if (!map || !Array.isArray(lodges)) return;
  
  lodges.forEach(lodge => {
    if (!lodge.coordinates) return;
    
    const marker = new google.maps.Marker({
      position: lodge.coordinates,
      map: map,
      title: lodge.name
    });

    const infoContent = `
      <div class="p-3">
        <h3 class="font-bold">${lodge.name}</h3>
        <p>${lodge.location}</p>
        <p class="font-bold">₱${lodge.price.toLocaleString()}/night</p>
      </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
      content: infoContent
    });

    marker.addListener("click", function() {
      infoWindow.open(map, marker);
    });
  });
}

// Initialize dropdown for barangay selection
function initializeBarangayDropdown() {
  // Basic implementation
}

// Initialize filters
function initializeFilters() {
  // Basic implementation
}

// Initialize sorting functionality
function initializeSort() {
  const sortBySelect = document.getElementById('sortBySelect');
  if (sortBySelect) {
    sortBySelect.addEventListener('change', function() {
      // Implement sorting
    });
  }
}

// Initialize header scroll effects
function initializeHeaderScroll() {
  const header = document.querySelector('.main-header');
  
  if (header) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }
}

// Initialize navigation
function initializeNavigation() {
  const userIconBtn = document.getElementById('userIconBtn');
  const mobileMenu = document.getElementById('mobile-menu');
  
  if (userIconBtn && mobileMenu) {
    userIconBtn.addEventListener('click', function() {
      mobileMenu.classList.toggle('hidden');
    });
  }
}

// Make the Google Maps callback available globally
window.initMap = initMap;

// Function to check if CSS is loaded properly
window.checkAndFixCSS = function() {
  console.log('Checking CSS loading status...');
  
  // If body has css-loaded class, we know CSS has loaded properly
  if (document.body.classList.contains('css-loaded')) {
    console.log('CSS confirmed loaded via loading indicators');
    return true;
  }
  
  // Check if hero section and main header are styled correctly
  const heroSection = document.querySelector('.hero-section');
  const header = document.querySelector('.main-header');
  const lodgeContainer = document.querySelector('.lodge-container');
  
  let cssIssueDetected = false;
  
  if (heroSection) {
    const heroStyles = getComputedStyle(heroSection);
    if (heroStyles.height === '0px' || heroStyles.minHeight === '0px' || heroStyles.backgroundColor === 'rgba(0, 0, 0, 0)') {
      console.warn('Hero section styles missing');
      cssIssueDetected = true;
    }
  }
  
  if (header) {
    const headerStyles = getComputedStyle(header);
    if (headerStyles.position !== 'fixed' || headerStyles.zIndex === 'auto') {
      console.warn('Header styles missing');
      cssIssueDetected = true;
    }
  }
  
  if (lodgeContainer) {
    const containerStyles = getComputedStyle(lodgeContainer);
    if (containerStyles.display !== 'grid') {
      console.warn('Lodge container styles missing');
      cssIssueDetected = true;
    }
  }
  
  if (cssIssueDetected) {
    console.warn('CSS issues detected, applying emergency inline styles');
    // Check if styles were already applied to avoid duplication
    if (!document.getElementById('emergency-styles')) {
      applyEmergencyStyles();
    }
    return false;
  }
  
  // Mark CSS as loaded since checks passed
  document.body.classList.add('css-loaded');
  console.log('CSS appears to be loaded correctly');
  return true;
};

// Function to apply emergency inline styles if CSS fails to load
function applyEmergencyStyles() {
  // Check if emergency styles are already applied
  if (document.getElementById('emergency-styles')) {
    return;
  }
  
  const fallbackStyles = document.createElement('style');
  fallbackStyles.id = 'emergency-styles';
  fallbackStyles.innerHTML = `
    body { background-color: #f5f5f5; font-family: system-ui, sans-serif; margin: 0; padding: 0; }
    .main-header { position: fixed; top: 0; left: 0; right: 0; background-color: white; height: 65px; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .hero-section { position: relative; min-height: 400px; background: linear-gradient(90deg, rgba(40, 58, 151, 0.9) 0%, rgba(65, 88, 208, 0.85) 100%); padding: 8px 0; margin-top: 86px; margin-bottom: 2rem; border-radius: 0.75rem; overflow: hidden; }
    .hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: brightness(0.7); z-index: -1; }
    .hero-content { position: relative; z-index: 10; padding: 2rem; color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; height: 100%; }
    .hero-title { font-size: 3rem; font-weight: 700; margin-bottom: 0.5rem; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
    .hero-subtitle { font-size: 1.25rem; margin-bottom: 2rem; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
    .lodge-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .lodge-card { background-color: white; border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: transform 0.3s, box-shadow 0.3s; height: 100%; }
    .lodge-card:hover { transform: translateY(-5px); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    #mapView { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: white; z-index: 100; transition: opacity 0.3s ease; }
    #map { height: 100%; width: 100%; }
    .hidden { display: none !important; }
    .logo img { height: 48px; }
    .nav-button { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; color: #374151; font-weight: 500; border-radius: 0.5rem; border: none; background: transparent; cursor: pointer; transition: all 0.2s; }
    .nav-button:hover, .nav-button.active { background-color: #f3f4f6; }
    .amenity-tag { background: #f3f4f6; color: #4b5563; padding: 0.375rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; }
    .price { font-weight: bold; }
    .search-bar-container { background-color: white; border-radius: 9999px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 0.5rem; display: flex; align-items: center; max-width: 30rem; margin: 0 auto; }
  `;
  document.head.appendChild(fallbackStyles);
  console.log('Emergency styles applied');
}

// Add a check after a delay to ensure CSS has had time to load
setTimeout(window.checkAndFixCSS, 3000);

// Function to fetch lodges from Firebase or fallback
async function fetchLodges() {
  try {
        console.log('Attempting to load lodges from rooms.js...');
        
        // Try to get the complete lodge data from rooms.js
        let completeData = [];
        
        try {
            // First try to use window.LodgeEasePublicAPI if it exists (exposed by rooms.js)
            if (window.LodgeEasePublicAPI && window.LodgeEasePublicAPI.getAllLodges) {
                completeData = window.LodgeEasePublicAPI.getAllLodges();
                console.log('Successfully loaded lodges from LodgeEasePublicAPI:', completeData.length);
                return completeData;
            }
            
            // If not available, try to access window.lodgeData from rooms.js
            if (window.rooms && window.rooms.lodgeData) {
                completeData = window.rooms.lodgeData;
                console.log('Successfully loaded lodges from window.rooms.lodgeData:', completeData.length);
                return completeData;
            }
            
            // Last resort - access the non-namespaced lodgeData in rooms.js
            // We'll try to find it by adding a script tag that imports rooms.js
            if (typeof lodgeData !== 'undefined' && Array.isArray(lodgeData) && lodgeData.length > 2) {
                console.log('Using existing lodgeData from global scope:', lodgeData.length);
                return lodgeData;
            }
            
            // If we got here, we couldn't find the full lodge data from rooms.js
            // Let's make sure rooms.js is loaded
            const roomsScript = document.querySelector('script[src*="rooms.js"]');
            if (!roomsScript) {
                console.log('rooms.js not found in document, adding it dynamically');
                
                // Try to add rooms.js dynamically 
                return new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = 'rooms.js?' + new Date().getTime(); // Add cache buster
                    script.onload = () => {
                        console.log('rooms.js loaded dynamically');
                        
                        // Check again for lodgeData
                        if (window.LodgeEasePublicAPI && window.LodgeEasePublicAPI.getAllLodges) {
                            resolve(window.LodgeEasePublicAPI.getAllLodges());
                        } else if (window.rooms && window.rooms.lodgeData) {
                            resolve(window.rooms.lodgeData);
                        } else if (typeof lodgeData !== 'undefined' && Array.isArray(lodgeData)) {
                            resolve(lodgeData);
                        } else {
                            // Use fallback data
                            console.log('Still could not access lodge data after loading rooms.js, using static data');
                            resolve(window.lodgeData || []);
                        }
                    };
                    script.onerror = () => {
                        console.error('Failed to load rooms.js dynamically');
                        resolve(window.lodgeData || []);
                    };
                    document.head.appendChild(script);
                });
            }
        } catch (error) {
            console.error('Error trying to access lodgeData from rooms.js:', error);
        }
        
        // If all else fails, use the static fallback data
        console.log('Using static fallback data from main.js');
        return window.lodgeData || [];
  } catch (error) {
        console.error('Error in fetchLodges:', error);
        return window.lodgeData || [];
  }
}

function initFirebaseWithRetry(maxRetries = 3) {
    let retryCount = 0;
  
  async function tryInit() {
    try {
            console.log('Attempting to initialize Firebase...');
            
            // Check if Firebase is already initialized
            if (window.firebase && window.firebase.apps && window.firebase.apps.length > 0) {
                console.log('Firebase already initialized');
                
                // Fetch lodges after Firebase is confirmed to be initialized
                const lodges = await fetchLodges();
                
                // Try to use the renderLodges function from rooms.js if available
                if (window.LodgeEasePublicAPI && typeof window.LodgeEasePublicAPI.renderLodges === 'function') {
                    console.log('Using renderLodges from LodgeEasePublicAPI');
                    window.LodgeEasePublicAPI.renderLodges(lodges);
                } else {
                    // Fall back to our local createLodgeCards function
                    console.log('Using local createLodgeCards function');
                    createLodgeCards(lodges);
                }
                
                return true;
            }
            
            // If we've exceeded retries, use fallback
            if (retryCount >= maxRetries) {
                console.log('Max retries reached, using fallback data');
                loadFallbackData();
                return false;
            }
            
            retryCount++;
            console.log(`Retry attempt ${retryCount} of ${maxRetries}`);
            
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return tryInit();
            
    } catch (error) {
      console.error('Error initializing Firebase:', error);
            
            if (retryCount >= maxRetries) {
                console.log('Max retries reached, using fallback data');
                loadFallbackData();
                return false;
            }
            
            retryCount++;
            console.log(`Retry attempt ${retryCount} of ${maxRetries}`);
            
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            return tryInit();
        }
    }
    
    return tryInit();
}

// Error handling for images
function handleImageError(img) {
  img.onerror = null;
  img.src = '../components/fallback-lodge.jpg';
  console.warn('Image failed to load, using fallback');
} 