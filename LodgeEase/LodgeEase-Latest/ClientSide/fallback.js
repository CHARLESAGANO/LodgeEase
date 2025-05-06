// LodgeEase Fallback JavaScript
// This file contains essential functionality from main.js and map-init.js
// to ensure the site works even if the main JavaScript files don't load properly

document.addEventListener('DOMContentLoaded', function() {
  console.log('Fallback JS loaded');
  
  // Initialize Firebase
  if (typeof firebase !== 'undefined') {
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyBAJr0JQgWRfGTmSXTK6P7Yn8fkHXG2YeE",
        authDomain: "lms-app-2b903.firebaseapp.com",
        projectId: "lms-app-2b903",
        storageBucket: "lms-app-2b903.appspot.com",
        messagingSenderId: "1046108373013",
        appId: "1:1046108373013:web:fc366db1d92b9c4b860e1c",
        measurementId: "G-WRMW9Z8867"
      };

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized from fallback.js');
      }
    } catch (error) {
      console.error('Failed to initialize Firebase:', error);
    }
  }
  
  // Handle login button
  const loginButton = document.getElementById('loginButton');
  if (loginButton) {
    loginButton.addEventListener('click', function() {
      window.location.href = '../Login/index.html';
    });
  }
  
  // Handle map view
  const showMapBtn = document.getElementById('showMap');
  const mapView = document.getElementById('mapView');
  const closeMapBtn = document.getElementById('closeMap');
  
  if (showMapBtn && mapView) {
    showMapBtn.addEventListener('click', function() {
      mapView.classList.remove('hidden');
    });
  }
  
  if (closeMapBtn && mapView) {
    closeMapBtn.addEventListener('click', function() {
      mapView.classList.add('hidden');
    });
  }
  
  // Ensure lodge cards are properly displayed
  const lodgeCards = document.querySelectorAll('.lodge-card');
  if (lodgeCards) {
    lodgeCards.forEach(function(card, index) {
      // Apply animation with delay
      card.style.animation = `scaleIn 0.5s ease-in-out ${index * 0.1}s forwards`;
      card.style.opacity = '0';
      
      // Add hover effect
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-5px)';
        this.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
      });
      
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
      });
    });
  }
  
  // Basic filter functionality
  const filterButtons = document.querySelectorAll('.filter-button');
  if (filterButtons) {
    filterButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        alert('Filter functionality will be available soon!');
      });
    });
  }
  
  // Handle mobile menu
  const userIconBtn = document.getElementById('userIconBtn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (userIconBtn && mobileMenu) {
    userIconBtn.addEventListener('click', function() {
      mobileMenu.classList.toggle('hidden');
    });
  }
  
  // Hide page loader
  const pageLoader = document.getElementById('pageLoader');
  if (pageLoader) {
    setTimeout(function() {
      pageLoader.style.display = 'none';
    }, 800);
  }
}); 