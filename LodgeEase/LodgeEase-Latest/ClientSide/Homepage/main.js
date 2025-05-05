// LodgeEase Homepage Main JavaScript
// This script doesn't use ES modules and should work in all browsers

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

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing with non-module script...');
  
  // Initialize user interface components
  initializeNavigation();
  initializeHeaderScroll();
  initializeBarangayDropdown();
  initializeFilters();
  initializeSort();
  initializeMapView();
  
  // Create lodge cards
  createLodgeCards(lodgeData);
  
  // Firebase is now initialized in the HTML
  // Just check if auth is ready
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(function(user) {
      updateLoginButtonVisibility(user);
    });
  } else {
    console.warn('Firebase auth not available, using fallback');
    loadFallbackData();
  }
});

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
  // Create lodge cards with static data
  createLodgeCards(lodgeData);
}

// Update login button visibility based on auth state
function updateLoginButtonVisibility(user) {
  const loginButton = document.getElementById('loginButton');
  const mobileLoginButton = document.getElementById('mobileLoginButton');
  
  if (loginButton) {
    loginButton.style.display = user ? 'none' : 'flex';
  }
  
  if (mobileLoginButton) {
    mobileLoginButton.style.display = user ? 'none' : 'block';
  }
}

// Create lodge cards in the container
function createLodgeCards(data) {
  const container = document.querySelector('.lodge-container');
  if (!container) return;

  container.innerHTML = '';
  
  data.forEach((lodge, index) => {
    const card = document.createElement('article');
    card.className = 'lodge-card bg-white rounded-lg shadow-md overflow-hidden h-full';
    card.style.animationDelay = `${index * 100}ms`;
    card.dataset.propertyType = lodge.propertyType || 'hotel';
    card.dataset.lodgeId = lodge.id;
    card.dataset.barangay = lodge.barangay;

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
                  ₱${lodge.price.toLocaleString()}
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
  });
}

// Show lodge details
function showLodgeDetails(lodge) {
  // Implement details view
  console.log('Showing details for:', lodge.name);
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