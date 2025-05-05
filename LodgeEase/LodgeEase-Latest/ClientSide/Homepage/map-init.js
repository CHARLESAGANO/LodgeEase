/**
 * Map initialization script for LodgeEase
 * This is a standalone script to handle Google Maps initialization
 */

// Global variables for map functionality
let map = null;
let directionsService = null;
let directionsRenderer = null;
let userLocation = null;
let userMarker = null;
let markers = [];
let mapInitialized = false;

// Listen for both direct initMap calls and our custom event
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the UI components
  initMapView();
  
  // Listen for Google Maps loaded event
  window.addEventListener('google-maps-loaded', function() {
    console.log('Received Google Maps loaded event');
    // Try to initialize map
    if (!mapInitialized) {
      initializeMapInstance();
    }
  });
});

// This function will be called by the Google Maps API
// Fallback entrypoint - the preferred method now is through the custom event
function initMap() {
  console.log('Google Maps API direct callback');
  // The inline script now handles this and dispatches a custom event
  // But we keep this for compatibility
}

// Initialize the actual map instance
function initializeMapInstance() {
  try {
    if (mapInitialized) {
      console.log('Map already initialized, skipping');
      return;
    }
    
    if (typeof google === 'undefined' || !google.maps) {
      console.error('Google Maps API not loaded yet');
      return;
    }
    
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('Map element not found in DOM');
      return;
    }
    
    console.log('Creating map instance');
    
    // Create map centered on Baguio
    map = new google.maps.Map(mapElement, {
      center: { lat: 16.4023, lng: 120.5960 },
      zoom: 14,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      zoomControl: true,
      mapTypeId: google.maps.MapTypeId.ROADMAP
    });
    
    // Initialize directions service
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map: map,
      suppressMarkers: true
    });
    
    // Add markers for lodges
    if (window.lodgeData && window.lodgeData.length > 0) {
      addMarkers(window.lodgeData);
    }
    
    mapInitialized = true;
    window.mapInitialized = true; // Make it globally available
    console.log('Map initialized successfully');
  } catch (error) {
    console.error('Error initializing map:', error);
  }
}

// Get user location for map
function getUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        // Add user marker with distinctive icon
        if (userMarker) userMarker.setMap(null);
        userMarker = new google.maps.Marker({
          position: userLocation,
          map: map,
          title: 'Your Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 999
        });

        // Add location button
        const locationButton = document.createElement("button");
        locationButton.className = "custom-map-control";
        locationButton.innerHTML = '<i class="ri-focus-2-line"></i>';
        locationButton.title = "Center to your location";
        locationButton.onclick = () => {
          map.panTo(userLocation);
          map.setZoom(15);
        };

        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(locationButton);
      },
      (error) => {
        console.error("Error getting user location:", error);
      }
    );
  } else {
    console.error("Geolocation is not supported by this browser.");
  }
}

// Add markers to the map
function addMarkers(lodges) {
  if (!map || !Array.isArray(lodges)) return;
  
  // Clear existing markers
  markers.forEach(marker => marker.setMap(null));
  markers = [];

  lodges.forEach(lodge => {
    if (!lodge.coordinates) return;
    
    const marker = new google.maps.Marker({
      position: lodge.coordinates,
      map: map,
      title: lodge.name,
      animation: google.maps.Animation.DROP
    });

    const infoContent = `
      <div class="map-popup p-3">
        <h3 class="font-bold text-lg mb-2">${lodge.name}</h3>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-yellow-400">★</span>
          <span class="font-medium">${lodge.rating}</span>
        </div>
        <p class="text-gray-600 mb-2">${lodge.location}</p>
        <p class="font-bold text-lg">₱${lodge.price.toLocaleString()}<span class="text-sm font-normal text-gray-600">/night</span></p>
        <div class="flex gap-2 mt-3">
          <button onclick="getDirections({lat: ${lodge.coordinates.lat}, lng: ${lodge.coordinates.lng}})" class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">Get Directions</button>
        </div>
      </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
      content: infoContent,
      maxWidth: 300
    });

    marker.addListener("click", () => {
      infoWindow.open(map, marker);
    });

    markers.push(marker);
  });
}

// Get directions to a location
function getDirections(destination) {
  if (!userLocation) {
    getUserLocation();
    alert("Please allow location access to get directions. Try again in a moment.");
    return;
  }

  const request = {
    origin: userLocation,
    destination: destination,
    travelMode: google.maps.TravelMode.DRIVING
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      
      // Show route info
      const route = result.routes[0].legs[0];
      const infoContent = `
        <div class="p-4">
          <h3 class="font-bold mb-2">Directions</h3>
          <p class="text-sm mb-1">Distance: ${route.distance.text}</p>
          <p class="text-sm mb-2">Duration: ${route.duration.text}</p>
          <button onclick="clearDirections()" class="text-blue-500 hover:text-blue-700 text-sm">Clear directions</button>
        </div>
      `;
      
      const infoWindow = new google.maps.InfoWindow({
        content: infoContent,
        position: destination
      });
      
      infoWindow.open(map);
    } else {
      console.error('Directions request failed due to ' + status);
      alert('Could not calculate directions: ' + status);
    }
  });
}

// Clear directions from the map
function clearDirections() {
  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
  }
}

// Initialize map view (show/hide)
function initMapView() {
  const showMapBtn = document.getElementById("showMap");
  const closeMapBtn = document.getElementById("closeMap");
  const mapView = document.getElementById("mapView");

  if (showMapBtn) {
    showMapBtn.addEventListener("click", () => {
      if (mapView) {
        mapView.classList.remove("hidden");
        if (!map && typeof google !== 'undefined') {
          initializeMap();
        } else if (map) {
          google.maps.event.trigger(map, 'resize');
        } else {
          console.log('Waiting for Google Maps API to load...');
        }
      }
    });
  }

  if (closeMapBtn && mapView) {
    closeMapBtn.addEventListener("click", () => {
      mapView.classList.add("hidden");
    });
  }

  // Close map view when clicking Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mapView && !mapView.classList.contains("hidden")) {
      mapView.classList.add("hidden");
    }
  });
}

// Make functions available globally
window.initializeGoogleMaps = initializeMap;
window.getDirections = getDirections;
window.clearDirections = clearDirections;
window.initMapView = initMapView; 