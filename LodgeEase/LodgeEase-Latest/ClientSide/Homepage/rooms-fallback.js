// Fallback script for environments that don't support ES modules
console.log('Loading fallback script for non-module environments');

// Define placeholder for Firebase auth and db
window.firebaseAuth = null;
window.firebaseDb = null;

// Initialize Firebase SDK (non-module version)
document.addEventListener('DOMContentLoaded', function() {
  // Load Firebase scripts if not already loaded
  if (typeof firebase === 'undefined') {
    loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js', function() {
      loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js', function() {
        loadScript('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js', function() {
          // Initialize Firebase
          const firebaseConfig = {
            apiKey: "AIzaSyBAJr0JQgWRfGTmSXTK6P7Yn8fkHXG2YeE",
            authDomain: "lms-app-2b903.firebaseapp.com",
            projectId: "lms-app-2b903",
            storageBucket: "lms-app-2b903.appspot.com",
            messagingSenderId: "1046108373013",
            appId: "1:1046108373013:web:fc366db1d92b9c4b860e1c",
            measurementId: "G-WRMW9Z8867"
          };
          
          // Initialize Firebase if not already initialized
          try {
            if (firebase.apps.length === 0) {
              firebase.initializeApp(firebaseConfig);
            }
            window.firebaseAuth = firebase.auth();
            window.firebaseDb = firebase.firestore();
            console.log('Firebase initialized in fallback script');
            
            // Setup auth state change listener
            window.firebaseAuth.onAuthStateChanged(function(user) {
              updateLoginButtonVisibility(user);
            });
            
            // Initialize other functions
            initializeAllFunctionality();
          } catch (error) {
            console.error('Error initializing Firebase:', error);
          }
        });
      });
    });
  }
});

// Helper to load scripts dynamically
function loadScript(url, callback) {
  const script = document.createElement('script');
  script.src = url;
  script.onload = callback;
  document.head.appendChild(script);
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

// Initialize all functionality
function initializeAllFunctionality() {
  console.log('Starting initialization of all functionality in fallback script...');
  
  // Initialize map view if the map container exists
  if (document.getElementById('map')) {
    initMapView();
  }

  // Initialize barangay dropdown
  initializeBarangayDropdown();
  initializeCheckInDateFilter();

  // Initialize other components
  initializeSearch();
  initializeFilters();
  initializeSort();
  initializeNavigation();
  initializeHeaderScroll();
  
  console.log('Creating lodge cards from fallback script...');
  createLodgeCards();

  // Add lodge modal
  addLodgeModalToDOM();
  
  console.log('All homepage functionality initialized successfully from fallback script');
}

// When Google Maps API is loaded, this will be called via the callback
window.initializeGoogleMaps = function() {
  console.log('Google Maps initialization triggered from fallback script');
  if (typeof google !== 'undefined') {
    console.log('Google Maps API loaded successfully');
    initMap();
    getUserLocation();
    if (window.lodgeData) {
      addMarkers(window.lodgeData);
    }
  } else {
    console.error('Google Maps API not properly loaded');
  }
};

// All other functions from rooms.js would be added here...
// For brevity, they are not included in this example
// In a real implementation, copy all functions from rooms.js
// but remove the ES module imports/exports 