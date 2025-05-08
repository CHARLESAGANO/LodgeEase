/**
 * userDrawer-fallback.js - A non-module version of the user drawer functionality
 * This file is used when the ES6 module version of userDrawer.js fails to load
 */

(function() {
  console.log('userDrawer-fallback.js loaded');
  
  // The main initialization function
  window.initializeUserDrawer = function(auth, db) {
    console.log('Initializing user drawer with fallback script');
    
    if (window.userDrawerInitialized) {
      console.log('User drawer already initialized');
      return;
    }
    
    const userIconBtn = document.getElementById('userIconBtn');
    const drawer = document.getElementById('userDrawer');
    
    if (!userIconBtn || !drawer) {
      console.error('Required elements not found:', { userIconBtn: !!userIconBtn, drawer: !!drawer });
      
      // Try to find alternative elements
      const alternativeUserBtn = document.querySelector('button.nav-button i.ri-user-line')?.parentElement;
      if (!userIconBtn && alternativeUserBtn) {
        console.log('Found alternative user button');
        userIconBtn = alternativeUserBtn;
      }
      
      // Create drawer if missing
      if (!drawer) {
        console.log('Creating missing drawer element');
        const newDrawer = document.createElement('div');
        newDrawer.id = 'userDrawer';
        newDrawer.className = 'fixed top-0 right-0 w-80 h-full bg-white shadow-xl transform translate-x-full transition-transform duration-300 ease-in-out z-[200000]';
        document.body.appendChild(newDrawer);
        drawer = newDrawer;
      } else {
        // Update existing drawer styles
        drawer.classList.remove('w-96');
        drawer.classList.add('w-80');
      }
      
      if (!userIconBtn || !drawer) {
        console.error('Still missing required elements after recovery attempt');
        return;
      }
    }
    
    // Update drawer styles
    drawer.className = 'fixed top-0 right-0 w-80 h-full bg-white shadow-xl transform translate-x-full transition-transform duration-300 ease-in-out z-[200000]';
    
    // Ensure the drawer has the right structure
    if (!drawer.querySelector('.drawer-content')) {
      drawer.innerHTML = `
        <div class="drawer-content p-6">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-bold">User Profile</h3>
            <button id="closeDrawer" class="text-gray-500 hover:text-gray-700">
              <i class="ri-close-line text-2xl"></i>
            </button>
          </div>
          <div id="userDrawerContent">
            <!-- Content will be inserted here -->
          </div>
        </div>
      `;
    }
    
    // Toggle drawer when user icon is clicked
    userIconBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      drawer.classList.remove('translate-x-full');
      
      // Force update content on open
      if (auth) {
        updateDrawerContent(auth.currentUser);
      } else {
        updateDrawerContent(null);
      }
    });
    
    // Close drawer when close button is clicked
    const closeBtn = drawer.querySelector('#closeDrawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        drawer.classList.add('translate-x-full');
      });
    }
    
    // Check auth state and update drawer content
    function updateDrawerContent(user) {
      const content = drawer.querySelector('#userDrawerContent') || 
                     drawer.querySelector('.drawer-content');
      
      if (!content) {
        console.error('Drawer content container not found');
        return;
      }
      
      if (user) {
        // User is signed in
        content.innerHTML = `
          <div class="py-4">
            <div class="flex justify-center mb-4">
              <div class="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                ${user.photoURL ? 
                  `<img src="${user.photoURL}" alt="${user.displayName || 'User'}" class="w-16 h-16 rounded-full">` :
                  `<span class="text-2xl text-blue-600">${(user.displayName || user.email || 'U').charAt(0).toUpperCase()}</span>`}
              </div>
            </div>
            <h3 class="text-center text-lg font-bold mb-1">${user.displayName || 'LodgeEase User'}</h3>
            <p class="text-center text-gray-500 mb-6 text-sm">${user.email || ''}</p>
            
            <div class="space-y-2">
              <button class="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded flex items-center text-sm" id="drawerBookingsBtn">
                <i class="ri-calendar-line mr-2"></i>
                <span>My Bookings</span>
              </button>
              <button class="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded flex items-center text-sm" id="drawerDashboardBtn">
                <i class="ri-dashboard-line mr-2"></i>
                <span>Dashboard</span>
              </button>
              <button class="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded flex items-center text-sm" id="drawerSignOutBtn">
                <i class="ri-logout-box-line mr-2"></i>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        `;
        
        // Add bookings button handler
        const bookingsBtn = content.querySelector('#drawerBookingsBtn');
        if (bookingsBtn) {
          bookingsBtn.addEventListener('click', function() {
            if (typeof window.showBookingsModal === 'function') {
              window.showBookingsModal();
            } else {
              console.error('showBookingsModal function not available');
              window.location.href = '../Dashboard/Dashboard.html#bookings';
            }
            drawer.classList.add('translate-x-full');
          });
        }
        
        // Add dashboard button handler
        const dashboardBtn = content.querySelector('#drawerDashboardBtn');
        if (dashboardBtn) {
          dashboardBtn.addEventListener('click', function() {
            window.location.href = '../Dashboard/Dashboard.html';
          });
        }
        
        // Add sign out button handler
        const signOutBtn = content.querySelector('#drawerSignOutBtn');
        if (signOutBtn && auth) {
          signOutBtn.addEventListener('click', function() {
            auth.signOut().then(function() {
              drawer.classList.add('translate-x-full');
              console.log('User signed out');
              updateDrawerContent(null); // Update drawer immediately
              
              // Handle login button visibility
              updateLoginButtonVisibility(null);
            }).catch(function(error) {
              console.error('Sign out error', error);
            });
          });
        }
      } else {
        // User is signed out
        content.innerHTML = `
          <div class="py-6 text-center">
            <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <i class="ri-user-line text-2xl text-gray-400"></i>
            </div>
            <p class="mb-6 text-sm">Please sign in to access your profile</p>
            <a href="../Login/index.html" class="inline-block bg-blue-600 text-white py-2 px-6 rounded hover:bg-blue-700 transition-colors text-sm">
              Sign In
            </a>
            <p class="mt-4 text-xs text-gray-500">
              Don't have an account? 
              <a href="../Login/index.html#signup" class="text-blue-600 hover:underline">Sign Up</a>
            </p>
          </div>
        `;
      }
      
      // Reinitialize close button
      const newCloseBtn = drawer.querySelector('#closeDrawer');
      if (newCloseBtn) {
        newCloseBtn.addEventListener('click', function() {
          drawer.classList.add('translate-x-full');
        });
      }
    }
    
    // Function to handle login button visibility
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
    
    // Close when clicking outside
    document.addEventListener('click', function(e) {
      if (drawer && !drawer.classList.contains('translate-x-full') && 
          e.target !== userIconBtn && 
          !drawer.contains(e.target) && 
          !userIconBtn.contains(e.target)) {
        drawer.classList.add('translate-x-full');
      }
    });
    
    // Listen for auth state changes
    if (auth) {
      auth.onAuthStateChanged(function(user) {
        updateDrawerContent(user);
        updateLoginButtonVisibility(user);
      });
    } else {
      updateDrawerContent(null);
    }
    
    window.userDrawerInitialized = true;
    console.log('User drawer initialization complete');
  };
  
  // Function to check and get Firebase objects
  function getFirebaseInstances() {
    // Try different sources to get Firebase auth and db
    if (window.firebaseAuth && window.firebaseDb) {
      return { auth: window.firebaseAuth, db: window.firebaseDb };
    }
    
    if (window.firebase && window.firebase.auth && window.firebase.firestore) {
      return { 
        auth: window.firebase.auth(), 
        db: window.firebase.firestore() 
      };
    }
    
    return null;
  }
  
  // Setup auto-initialization with retries
  function setupAutoInit() {
    let attempts = 0;
    const maxAttempts = 3;
    
    function tryInitialize() {
      try {
        if (window.userDrawerInitialized) {
          console.log('User drawer already initialized, skipping auto-init');
          return;
        }
        
        attempts++;
        console.log(`Auto-initialization attempt ${attempts}/${maxAttempts}`);
        
        const firebaseInstances = getFirebaseInstances();
        if (firebaseInstances) {
          console.log('Found Firebase instances for auto-init');
          window.initializeUserDrawer(firebaseInstances.auth, firebaseInstances.db);
          return true;
        } else {
          console.log('Firebase instances not found yet');
          
          if (attempts < maxAttempts) {
            // Try again with increasing delay
            setTimeout(tryInitialize, attempts * 1000);
          } else {
            console.error('Max attempts reached, initializing without auth');
            // Initialize without auth as a last resort
            window.initializeUserDrawer(null, null);
          }
        }
      } catch (e) {
        console.error('Error during auto-initialization:', e);
        if (attempts < maxAttempts) {
          setTimeout(tryInitialize, 1000);
        } else {
          console.error('Failed to auto-initialize after multiple attempts');
        }
      }
    }
    
    // Start initialization process
    tryInitialize();
  }
  
  // Document loaded or loading - start auto-init process
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAutoInit);
  } else {
    setupAutoInit();
  }
})(); 