// Use an IIFE to avoid global namespace pollution

// Define global showBookingsModal FIRST to ensure it's available.
window.showBookingsModal = function() {
    console.log('[rooms.js] window.showBookingsModal EXECUTION START.');
    const bookingsPopup = document.getElementById('bookingsPopupRooms'); // Use unique ID
    if (bookingsPopup) {
        console.log('[rooms.js] window.showBookingsModal: #bookingsPopupRooms FOUND. Current classes:', bookingsPopup.className);
        bookingsPopup.classList.remove('hidden');
        console.log('[rooms.js] window.showBookingsModal: #bookingsPopupRooms classes after removing hidden:', bookingsPopup.className);
        // Ensure z-index is high enough
        bookingsPopup.style.zIndex = '200000'; 
        const innerModal = bookingsPopup.querySelector('.fixed.right-0.top-0');
        if (innerModal) innerModal.style.zIndex = '200001';
    } else {
        console.error('[rooms.js] window.showBookingsModal: #bookingsPopupRooms NOT FOUND in DOM!');
    }
    console.log('[rooms.js] window.showBookingsModal EXECUTION END.');
};

(function() {
    // Initialize the LodgeEasePublicAPI immediately
    console.log('Initializing LodgeEasePublicAPI');
    
    // Make these functions globally available for the info window buttons
    window.getDirectionsCallback = null;
    window.clearDirectionsCallback = null;
    
    // Make map initialization accessible to Google Maps callback
    window.initializeGoogleMaps = initializeMap;

    window.getDirections = function(destination) {
        window.getDirectionsCallback?.(destination);
    }

    window.clearDirections = function() {
        window.clearDirectionsCallback?.();
    }

    // Expose lodgeData and rendering functions globally for admin integration
    window.LodgeEasePublicAPI = {
        getAllLodges: () => lodgeData,
        renderLodges: createLodgeCards,
        addNewLodge: (lodge) => {
            // Add a new lodge to the collection and re-render
            lodgeData.push(lodge);
            createLodgeCards();
            return true;
        },
        updateLodge: (lodgeId, updatedData) => {
            // Find and update an existing lodge by ID
            const index = lodgeData.findIndex(lodge => lodge.id === parseInt(lodgeId));
            if (index !== -1) {
                lodgeData[index] = { ...lodgeData[index], ...updatedData };
                createLodgeCards();
                return true;
            }
            return false;
        },
        removeLodge: (lodgeId) => {
            // Remove a lodge by ID
            const initialLength = lodgeData.length;
            lodgeData = lodgeData.filter(lodge => lodge.id !== parseInt(lodgeId));
            if (lodgeData.length !== initialLength) {
                createLodgeCards();
                return true;
            }
            return false;
        }
    };

    // Add this line to import initializeUserDrawer
    // NOTE: Ensure the path is correct based on your file structure.
    // Assuming rooms.js is in Homepage and userDrawer.js is in components at the same level as Homepage.
    // If ClientSide is the root for these, then it should be:
    // import { initializeUserDrawer } from '../components/userDrawer.js';
    // If LodgeEase-Latest is the root, it might be:
    // import { initializeUserDrawer } from './ClientSide/components/userDrawer.js';
    // For now, using the relative path from Homepage to components
    let initializeUserDrawer; // Declare here

    // Add this function to handle login button visibility
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

    // Initialize everything when DOM is loaded
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[rooms.js IIFE] DOMContentLoaded: Event Fired.');
        let auth, db; // Declare auth and db for this scope

        try {
            // PRIORITIZE V10 instances from the module script in rooms.html
            if (window.firebaseV10Ready && window.firebaseAppAuth && window.firebaseAppDb) {
                console.log('[rooms.js IIFE]: V10 Firebase instances found on window. Using them.');
                auth = window.firebaseAppAuth;
                db = window.firebaseAppDb;
                if (db && typeof db.collection === 'function') {
                    console.log('[rooms.js IIFE]: window.firebaseAppDb appears to be a VALID Firestore instance.');
                } else {
                    console.error('[rooms.js IIFE]: window.firebaseAppDb is INVALID. Type:', typeof db, 'Keys:', db ? Object.keys(db) : 'null');
                    // Fallback to other methods if this specific global is somehow bad
                    auth = null; db = null; // Reset to trigger fallbacks
                }
            } else {
                console.log('[rooms.js IIFE]: V10 Firebase instances not ready on window. Proceeding to fallbacks.');
            }

            // Fallback: If V10 globals were not ready/valid, attempt original loading (simplified)
            if (!auth || !db) {
                console.log('[rooms.js IIFE]: Attempting fallback Firebase loading...');
                // This is a simplified version of your original fallback. 
                // Consider removing if firebase-bridge.js or components/firebase.js are problematic.
                try {
                    const firebaseModule = await import('../components/firebase.js'); // This might still get the stub if not careful
                    auth = firebaseModule.auth;
                    db = firebaseModule.db;
                    console.log('[rooms.js IIFE]: Fallback: Loaded Firebase from ../components/firebase.js.');
                    if (!(db && typeof db.collection === 'function')) {
                         console.error('[rooms.js IIFE]: Fallback: db from ../components/firebase.js is INVALID. This is likely the stub.');
                         // Potentially set auth/db to null again if this is also bad, to prevent errors
                    }
                } catch (e) {
                    console.error('[rooms.js IIFE]: Fallback: Error loading from ../components/firebase.js:', e);
                    // Final fallback to prevent major errors - create minimal stubs here if all else fails
                    if (!auth) auth = { currentUser: null, onAuthStateChanged: (cb) => { cb(null); return () => {}; } };
                    if (!db) db = { collection: () => ({ get: async () => ({ docs: [] }) }) };
                }
            }
            
            console.log('[rooms.js IIFE] Final check before initializeBookingsModal:');
            console.log('[rooms.js IIFE] auth valid?', !!(auth && auth.onAuthStateChanged));
            console.log('[rooms.js IIFE] db valid (has .collection)?', !!(db && typeof db.collection === 'function'));

            initializeBookingsModal(auth, db); // Call with the resolved auth and db
            
            // Set a flag to indicate DOM is ready
            window.domContentLoaded = true;
            
            // Connect the global direction functions
            window.getDirectionsCallback = getDirections;
            window.clearDirectionsCallback = clearDirections;
            
            // Initialize map view functionality (but not the map itself yet - wait for Google Maps callback)
            initMapView();
            
            // Wait for Firebase modules to load first
            try {
                // First, try to use the global Firebase instance that's already loaded via script tags
                // This is the most reliable method for web deployment
                if (window.firebase && window.firebase.auth && window.firebase.firestore) {
                    console.log('Using global firebase object from HTML script tags');
                    auth = window.firebase.auth();
                    db = window.firebase.firestore();
                    console.log('Firebase auth and db loaded successfully from global object.');
                } else {
                    // Fall back to module imports if global Firebase is not available
                    console.log('Global firebase not available, trying module imports...');
                    
                    // Try different import paths to locate firebase.js
                    const firebase = await import('../firebase.js').catch(async () => {
                        console.log('First import path failed, trying component path...');
                        return import('../components/firebase.js').catch(async () => {
                            console.log('Component path failed, trying deeper relative path...');
                            return import('../../firebase.js').catch(async () => {
                                console.log('Deeper relative path failed, trying from root...');
                                return import('/firebase.js').catch(async () => {
                                    console.error('All import paths failed. Using fallback Firebase.');
                                    // Create a minimal fallback object with empty implementations
                                    return {
                                        auth: { currentUser: null, onAuthStateChanged: (cb) => cb(null) },
                                        db: { collection: () => ({ get: async () => ({ docs: [] }) }) }
                                    };
                                });
                            });
                        });
                    });
                    
                    auth = firebase.auth;
                    db = firebase.db;
                    console.log('Firebase auth and db loaded from module imports.');
                }
            } catch (error) {
                console.error('Error loading Firebase:', error);
                console.log('Attempting to use fallback Firebase implementation...');
                
                // Try to use the fallback script's Firebase implementation or global firebase
                if (window.firebaseAuth && window.firebaseDb) {
                    auth = window.firebaseAuth;
                    db = window.firebaseDb;
                    console.log('Using fallback Firebase implementation from script tag');
                } else if (window.firebase && window.firebase.auth && window.firebase.firestore) {
                    auth = window.firebase.auth();
                    db = window.firebase.firestore();
                    console.log('Using global Firebase implementation from firebase-app.js');
                } else {
                    console.error('No Firebase implementation available. Lodge functionality will be limited.');
                    // Create minimal mock implementations to prevent errors
                    auth = { 
                        currentUser: null,
                        onAuthStateChanged: (callback) => { setTimeout(() => callback(null), 0); return () => {}; }
                    };
                    db = {
                        collection: () => ({ 
                            get: async () => ({ empty: true, docs: [] }),
                            where: () => ({ get: async () => ({ empty: true, docs: [] }) })
                        })
                    };
                }
            }

            console.log('[rooms.js] DOMContentLoaded: Firebase auth and db resolved/fallen back.');
            console.log('[rooms.js] DOMContentLoaded: auth valid for bookings modal?', !!(auth && auth.onAuthStateChanged));
            console.log('[rooms.js] DOMContentLoaded: db valid for bookings modal?', !!(db && db.collection));

            // Dynamically import initializeUserDrawer
            try {
                const userDrawerModule = await import('../components/userDrawer.js');
                initializeUserDrawer = userDrawerModule.initializeUserDrawer;
            } catch (e) {
                console.error('Failed to load userDrawer.js:', e);
                // Fallback or error handling if userDrawer.js can\'t be loaded
                initializeUserDrawer = () => { console.error("userDrawer.js could not be loaded, drawer functionality disabled."); };
            }
            
            // Import and use the bookingHistory module for the bookings popup
            try {
                import('./bookingHistory.js')
                    .catch(error => {
                        console.error('Error importing bookingHistory module:', error);
                        // Create a simple fallback implementation
                        if (!window.loadBookingHistory) {
                            window.loadBookingHistory = async function(userId, db) {
                                try {
                                    console.log('Using fallback loadBookingHistory implementation');
                                    const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
                                    if (!bookingHistoryContainer) {
                                        console.error('Booking history container not found');
                                        return;
                                    }
                                    
                                    if (!db || !db.collection) {
                                        bookingHistoryContainer.innerHTML = `
                                            <div class="text-center text-red-500 py-8">
                                                <p>Database connection unavailable</p>
                                            </div>
                                        `;
                                        return;
                                    }
                                    
                                    try {
                                        const bookingsRef = db.collection('bookings');
                                        const q = bookingsRef.where('userId', '==', userId);
                                        const querySnapshot = await q.get();
                                        
                                        if (querySnapshot.empty) {
                                            bookingHistoryContainer.innerHTML = `
                                                <div class="text-center text-gray-500 py-8">
                                                    <p>No booking history found</p>
                                                </div>
                                            `;
                                            return;
                                        }
                                        
                                        const bookings = querySnapshot.docs.map(doc => ({
                                            id: doc.id,
                                            ...doc.data()
                                        }));
                                        
                                        // Simple display of bookings
                                        bookingHistoryContainer.innerHTML = bookings.map(booking => `
                                            <div class="bg-white border rounded-lg shadow-sm p-4 mb-3">
                                                <h4 class="font-semibold">${booking.propertyDetails?.name || 'Unknown Property'}</h4>
                                                <p>Check-in: ${new Date(booking.checkIn?.seconds * 1000).toLocaleDateString()}</p>
                                                <p>Check-out: ${new Date(booking.checkOut?.seconds * 1000).toLocaleDateString()}</p>
                                                <div class="mt-2">
                                                    <span class="text-purple-600 font-bold">₱${parseFloat(booking.totalPrice || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        `).join('') || `<p class="text-center py-8">No booking history available</p>`;
                                        
                                    } catch (error) {
                                        console.error('Error in fallback booking history:', error);
                                        bookingHistoryContainer.innerHTML = `
                                            <div class="text-center text-red-500 py-8">
                                                <p>Error loading booking history</p>
                                            </div>
                                        `;
                                    }
                                } catch (error) {
                                    console.error('Error in loadBookingHistory fallback:', error);
                                }
                            };
                        }
                    });
            } catch (error) {
                console.error('Error setting up bookingHistory:', error);
            }

            // Initialize other homepage specific functionality
            initializeAllFunctionality(); // Keep this call
            
            // Ensure sort functionality is initialized directly
            console.log('Directly initializing sort functionality');
            initializeSort();
            
            // Initialize auth state monitoring for login button visibility
            auth.onAuthStateChanged((user) => {
                updateLoginButtonVisibility(user);
            });
            
            // Check if CSS is loaded properly, wait if necessary
            checkCSSLoading();

            // Initialize the user drawer - ensure auth and db are available
            if (initializeUserDrawer && typeof initializeUserDrawer === 'function' && auth && db) {
                console.log('Calling initializeUserDrawer from rooms.js');
                initializeUserDrawer(auth, db);
            } else {
                if (!initializeUserDrawer) console.error('initializeUserDrawer is not loaded.');
                if (!auth) console.error('Firebase auth is not available for userDrawer.');
                if (!db) console.error('Firebase db is not available for userDrawer.');
            }
            
        } catch (error) {
            console.error('[rooms.js IIFE] Error during DOMContentLoaded initialization:', error);
            // Ensure bookings modal still has a fallback if everything above failed
            if (typeof initializeBookingsModal === 'function') {
                 initializeBookingsModal( // Call with stubs to prevent further errors
                    { currentUser: null, onAuthStateChanged: (cb) => { cb(null); return () => {}; } }, 
                    { collection: () => ({ get: async () => ({ docs: [] }) }) }
                );
            }
        }
    });

    // New function to handle checking CSS loading
    function checkCSSLoading() {
        if (document.body.classList.contains('css-loaded')) {
            console.log('CSS already loaded, proceeding with initialization');
            finalizeInitialization();
            return;
        }
        
        // Check if we have emergency styles
        if (document.getElementById('emergency-styles')) {
            console.log('Using emergency styles, proceeding with initialization');
            finalizeInitialization();
            return;
        }
        
        // Check if styles are loaded after a short delay
        setTimeout(() => {
            if (document.body.classList.contains('css-loaded') || 
                document.getElementById('emergency-styles')) {
                finalizeInitialization();
            } else {
                // Try one more time
                setTimeout(finalizeInitialization, 1000);
            }
        }, 500);
    }
    
    // Function to complete initialization after CSS is handled
    function finalizeInitialization() {
        console.log('Finalizing initialization');
        
        // Create lodge cards
        createLodgeCards();
        
        // Hide loader
        const loader = document.getElementById('pageLoader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    function initializeAllFunctionality() {
        try {
            console.log('Starting initialization of all functionality...');
            
            // Initialize map view if the map container exists
            if (document.getElementById('map')) {
                initMapView();
            }

            // Initialize guests dropdown if the element exists
            // const guestsDropdownBtn = document.getElementById('guestsDropdownBtn'); // No longer exists in HTML?
            // if (guestsDropdownBtn) {
            //     initGuestsDropdown();
            // }

            // Initialize barangay dropdown
            initializeBarangayDropdown();
            initializeCheckInDateFilter(); // Ensure date filter is initialized

            // Initialize other components
            initializeSearch();
            initializeFilters();
            initializeSort();
            initializeNavigation(); // Ensure navigation is initialized
            initializeHeaderScroll(); // Ensure header scroll is initialized
            
            console.log('Creating lodge cards from initializeAllFunctionality...');
            createLodgeCards(); // Ensure lodge cards are created

            // Add lodge modal
            addLodgeModalToDOM();
            
            console.log('All homepage functionality initialized successfully');
        } catch (error) {
            console.error('Error initializing homepage functionality:', error);
        }
    }

    function createLodgeCards() {
        const container = document.querySelector('.lodge-container');
        if (!container) return;
    
        container.innerHTML = '';
        
        console.log('Creating lodge cards, total:', lodgeData.length);
        
        lodgeData.forEach((lodge, index) => {
            const card = document.createElement('article');
            card.className = 'lodge-card bg-white rounded-lg shadow-md overflow-hidden h-full';
            card.style.animationDelay = `${index * 100}ms`;
            card.style.animation = 'scaleIn 0.5s ease forwards';
            card.dataset.propertyType = lodge.propertyType || 'hotel';
            card.dataset.lodgeId = lodge.id;
            card.dataset.barangay = lodge.barangay;
            
            console.log(`Card ${index} (${lodge.name}) barangay set to:`, lodge.barangay);
    
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
                    <img src="${lodge.image}" alt="${lodge.name}" class="absolute inset-0 w-full h-full object-cover">
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
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.favorite-btn')) {
                    showLodgeDetails(lodge);
                }
            });
    
            container.appendChild(card);
        });
    }

    // Lodge data
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
        },
        {
            id: 2,
            name: "Mountain Breeze Lodge",
            location: "Session Road Area, Baguio City",
            barangay: "Session Road",
            image: "../components/6.jpg",
            price: 3200,
            amenities: ["City View", "Kitchen", "Parking"],
            rating: 4.5,
            propertyType: "resort",
            coordinates: {
                lat: 16.4145,
                lng: 120.5960
            }
        },
        {
            id: 3,
            name: "Baguio Hillside Retreat",
            location: "Burnham Park, Baguio City",
            barangay: "Burnham-Legarda",
            image: "../components/3.jpg",
            price: 4800,
            amenities: ["Mountain View", "Kitchen", "WiFi", "Parking"],
            rating: 4.7,
            propertyType: "vacation-home",
            coordinates: {
                lat: 16.4123,
                lng: 120.5925
            }
        },
        {
            id: 5,
            name: "Super Apartment - Room 6",
            location: "City Center, Baguio City",
            barangay: "City Camp Central",
            image: "../components/SuperApartmentRoom6.jpg",
            price: 3200,
            amenities: ["City View", "WiFi", "Kitchen", "Long-term"],
            rating: 4.4,
            propertyType: "apartment",
            coordinates: {
                lat: 16.4123,
                lng: 120.5960
            }
        },

        {
            id: 4,
            name: "The Forest Lodge",
            location: "Session Road Area, Baguio City",
            barangay: "Session Road",
            image: "../components/4.jpg",
            price: 2800,
            amenities: ["City View", "WiFi", "Restaurant"],
            rating: 4.3,
            propertyType: "hotel",
            coordinates: {
                lat: 16.4156,
                lng: 120.5964
            }
        },
        {
            id: 6,
            name: "Wright Park Manor",
            location: "Wright Park, Baguio City",
            barangay: "Kisad",
            image: "../components/7.jpg",
            price: 5200,
            amenities: ["Mountain View", "Kitchen", "Parking", "Pet Friendly"],
            rating: 4.6,
            propertyType: "bed-breakfast",
            coordinates: {
                lat: 16.4105,
                lng: 120.6287
            }
        },
        {
            id: 7,
            name: "Highland Haven",
            location: "Burnham Park, Baguio City",
            barangay: "Burnham-Legarda",
            image: "../components/8.jpg",
            price: 4100,
            amenities: ["City View", "WiFi", "Fitness Center"],
            rating: 4.4,
            propertyType: "hotel",
            coordinates: {
                lat: 16.4115,
                lng: 120.5932
            }
        },
        {
            id: 8,
            name: "Sunset View Villa",
            location: "Camp John Hay, Baguio City",
            barangay: "Camp 7",
            image: "../components/9.jpg",
            price: 8900,
            amenities: ["Mountain View", "Pool", "Kitchen", "Fireplace"],
            rating: 4.9,
            propertyType: "vacation-home",
            coordinates: {
                lat: 16.4089,
                lng: 120.6015
            }
        },
        {
            id: 9,
            name: "Cozy Corner B&B",
            location: "Wright Park, Baguio City",
            barangay: "Kisad",
            image: "../components/10.jpg",
            price: 3500,
            amenities: ["Garden View", "Free Breakfast", "WiFi"],
            rating: 4.5,
            propertyType: "bed-breakfast",
            coordinates: {
                lat: 16.4112,
                lng: 120.6291
            }
        },
        {
            id: 10,
            name: "The Manor Hotel",
            location: "Camp John Hay, Baguio City",
            barangay: "Camp 7",
            image: "../components/11.jpg",
            price: 9500,
            amenities: ["Mountain View", "Spa", "Restaurant", "Room Service"],
            rating: 4.8,
            propertyType: "hotel",
            coordinates: {
                lat: 16.4098,
                lng: 120.6018
            }
        },

    ];

    // Barangay data
    const barangays = [
        'Abanao-Zandueta-Kayong-Chugum-Otek',
        'Alfonso Tabora',
        'Ambiong',
        'Andres Bonifacio',
        'Apugan-Loakan',
        'Aurora Hill North Central',
        'Aurora Hill Proper',
        'Aurora Hill South Central',
        'Bagong Abreza',
        'BGH Compound',
        'Cabinet Hill-Teachers Camp',
        'Camp 7',
        'Camp 8',
        'Camp Allen',
        'City Camp Central',
        'City Camp Proper',
        'Country Club Village',
        'Dagsian Lower',
        'Dagsian Upper',
        'Dominican Hill-Mirador',
        'Dontogan',
        'Engineers Hill',
        'Fairview Village',
        'Fort del Pilar',
        'Gibraltar',
        'Greenwater Village',
        'Guisad Central',
        'Guisad Sorong',
        'Happy Hollow',
        'Happy Homes-Lucban',
        'Harrison-Claudio Carantes',
        'Holy Ghost Extension',
        'Holy Ghost Proper',
        'Imelda Village',
        'Irisan',
        'Kabayanihan',
        'Kagitingan',
        'Kias',
        'Loakan Proper',
        'Lopez Jaena',
        'Lourdes Subdivision Extension',
        'Lourdes Subdivision Proper',
        'Lower Magsaysay',
        'Lower Rock Quarry',
        'Lualhati',
        'Lucnab',
        'Magsaysay Private Road',
        'Malcolm Square-Perfecto',
        'Manuel A. Roxas',
        'Market Subdivision',
        'Middle Quezon Hill',
        'Military Cut-off',
        'Mines View Park',
        'Modern Site East',
        'Modern Site West',
        'MRR-Queen of Peace',
        'New Lucban',
        'Outlook Drive',
        'Pacdal',
        'Padre Burgos',
        'Padre Zamora',
        'Phil-Am',
        'Pinget',
        'Pinsao Pilot Project',
        'Pinsao Proper',
        'Poliwes',
        'Pucsusan',
        'Quezon Hill Proper',
        'Rizal Monument',
        'Rock Quarry Lower',
        'Rock Quarry Middle',
        'Saint Joseph Village',
        'Salud Mitra',
        'San Antonio Village',
        'San Luis Village',
        'San Roque Village',
        'San Vicente',
        'Sanitary Camp North',
        'Sanitary Camp South',
        'Santa Escolastica',
        'Santo Rosario',
        'Santo Tomas Proper',
        'Santo Tomas School Area',
        'Scout Barrio',
        'Session Road',
        'Slaughter House Area',
        'SLU-SVP Housing Village',
        'South Drive',
        'Teodora Alonzo',
        'Upper Market Subdivision',
        'Upper Magsaysay',
        'Upper QM Subdivision',
        'Upper Rock Quarry',
        'Victoria Village'
    ];

    // Initialize barangay dropdown
    function initializeBarangayDropdown() {
        const barangayDropdownBtn = document.getElementById('barangayDropdownBtn');
        const barangayDropdown = document.getElementById('barangayDropdown');
        const barangayText = document.getElementById('barangayText');
        const barangayList = document.getElementById('barangayList');
    
        // Handle case when elements are not found
        if (!barangayDropdownBtn) {
            console.error('Barangay dropdown button not found');
            return;
        }
        
        if (!barangayDropdown) {
            console.error('Barangay dropdown container not found');
            // Create the dropdown container if it doesn't exist
            const newDropdown = document.createElement('div');
            newDropdown.id = 'barangayDropdown';
            newDropdown.className = 'hidden absolute bg-white mt-2 rounded-lg shadow-lg z-10 max-h-96 overflow-y-auto';
            newDropdown.innerHTML = `
                <div class="p-4">
                    <h3 class="font-semibold mb-2 text-black">Choose Area</h3>
                    <div class="relative mb-2">
                        <input type="text" id="barangaySearchInput" placeholder="Search areas..." class="w-full border rounded-lg px-3 py-2 text-sm text-black pr-8">
                        <button id="clearBarangaySearch" class="absolute right-2 top-2 text-gray-400 hover:text-gray-600" style="display: none;">
                            <i class="ri-close-circle-line text-lg"></i>
                        </button>
                        <i class="ri-search-line absolute right-3 top-2 text-gray-400" id="searchIcon"></i>
                    </div>
                    <div id="barangayList" class="mt-2 space-y-1">
                        <!-- Items will be populated dynamically -->
                    </div>
                </div>
            `;
            
            barangayDropdownBtn.parentNode.appendChild(newDropdown);
            console.log('Created missing barangay dropdown container');
            
            // Re-get the elements
            const barangayDropdown = document.getElementById('barangayDropdown');
            const barangayList = document.getElementById('barangayList');
            
            // If we still can't find them, we have to abort
            if (!barangayDropdown || !barangayList) {
                console.error('Failed to create barangay dropdown elements');
                return;
            }
        }
    
        if (!barangayText) {
            console.error('Barangay text element not found');
            return;
        }
    
        if (!barangayList) {
            console.error('Barangay list element not found');
            const list = document.createElement('div');
            list.id = 'barangayList';
            list.className = 'mt-2 space-y-1';
            barangayDropdown.querySelector('.p-4').appendChild(list);
            console.log('Created missing barangay list container');
            
            // Re-get the element
            const barangayList = document.getElementById('barangayList');
            if (!barangayList) {
                console.error('Failed to create barangay list element');
                return;
            }
        }

        // Get the search input element
        const searchInput = barangayDropdown.querySelector('input[placeholder="Search areas..."]') || 
                           document.getElementById('barangaySearchInput');
        
        // Log whether the search input element was found
        console.log('Search input found:', searchInput ? true : false, searchInput);
        
        // Get the clear button
        const clearButton = document.getElementById('clearBarangaySearch');
        const searchIcon = document.getElementById('searchIcon');
        
        // Add functionality to clear button
        if (clearButton && searchInput) {
            clearButton.addEventListener('click', function() {
                searchInput.value = '';
                this.style.display = 'none';
                if (searchIcon) searchIcon.style.display = 'block';
                filterBarangayList('');
                searchInput.focus();
            });
            
            // Show/hide clear button based on input
            searchInput.addEventListener('input', function(e) {
                const hasValue = e.target.value.trim() !== '';
                clearButton.style.display = hasValue ? 'block' : 'none';
                if (searchIcon) searchIcon.style.display = hasValue ? 'none' : 'block';
                
                const searchTerm = e.target.value.toLowerCase().trim();
                console.log('Search input event triggered with term:', searchTerm);
                filterBarangayList(searchTerm);
            });
            
            // Also clear when ESC is pressed while input is focused
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    // If dropdown is being closed by the global ESC handler, don't prevent it
                    if (searchInput.value.trim() !== '') {
                        e.stopPropagation(); // Prevent the modal from closing if we're just clearing the input
                        searchInput.value = '';
                        clearButton.style.display = 'none';
                        if (searchIcon) searchIcon.style.display = 'block';
                        filterBarangayList('');
                    }
                }
            });
        } else {
            console.error('Clear button or search input not found');
            
            // Initialize and attach search functionality if the input exists
            if (searchInput) {
                searchInput.addEventListener('input', function(e) {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    console.log('Search input event triggered with term:', searchTerm);
                    filterBarangayList(searchTerm);
                });
                
                // Clear the search input when the dropdown is opened
                barangayDropdownBtn.addEventListener('click', () => {
                    setTimeout(() => {
                        searchInput.value = '';
                        console.log('Clearing search input and focusing');
                        filterBarangayList(''); // Show all options
                        searchInput.focus(); // Auto focus the search input
                    }, 10);
                });
            } else {
                console.error('Search input element not found, search functionality will not work');
            }
        }
    
        // Function to filter the barangay list based on search term
        function filterBarangayList(searchTerm) {
            console.log('Filtering barangay list with term:', searchTerm);
            
            const allOptions = barangayList.querySelectorAll('button');
            console.log('Total options:', allOptions.length);
            
            let hasResults = false;
            let matchCount = 0;
            
            allOptions.forEach(button => {
                // Skip the "All Barangays" option if there's a search term
                if (button.textContent === 'All Barangays') {
                    button.style.display = searchTerm ? 'none' : 'block';
                    console.log('All Barangays option display:', button.style.display);
                    return;
                }
                
                // Check if the barangay name contains the search term
                const barangayName = button.textContent.toLowerCase();
                const matches = barangayName.includes(searchTerm);
                if (matches) {
                    button.style.display = 'block';
                    hasResults = true;
                    matchCount++;
                } else {
                    button.style.display = 'none';
                }
            });
            
            console.log('Matches found:', matchCount);
            
            // Show a no results message if needed
            const noResultsEl = barangayList.querySelector('.no-results');
            if (!hasResults && searchTerm) {
                if (!noResultsEl) {
                    const noResults = document.createElement('div');
                    noResults.className = 'no-results text-center py-2 text-black';
                    noResults.textContent = 'No areas found';
                    barangayList.appendChild(noResults);
                    console.log('Added no results message');
                }
            } else if (noResultsEl) {
                noResultsEl.remove();
                console.log('Removed no results message');
            }
            
            // Also, hide/show the separator based on search
            const separator = barangayList.querySelector('.border-t');
            if (separator) {
                separator.style.display = searchTerm ? 'none' : 'block';
                console.log('Separator display:', separator.style.display);
            }
        }
    
        // Clear and populate the list
        barangayList.innerHTML = '';
        
        // Add "All Barangays" option
        const allBarangaysBtn = document.createElement('button');
        allBarangaysBtn.className = 'w-full text-left px-4 py-2 hover:bg-gray-100 text-black';
        allBarangaysBtn.textContent = 'All Barangays';
        allBarangaysBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            barangayText.textContent = 'All Barangays';
            barangayDropdown.classList.add('hidden');
            console.log('All Barangays button clicked, calling filterLodgesByBarangay');
            filterLodgesByBarangay('All Barangays');
            return false; // Prevent default and stop propagation
        });
        barangayList.appendChild(allBarangaysBtn);
    
        // Add separator
        const separator = document.createElement('div');
        separator.className = 'border-t border-gray-200 my-2';
        barangayList.appendChild(separator);
    
        // Add barangay options
        barangays.forEach(barangay => {
            const button = document.createElement('button');
            button.className = 'w-full text-left px-4 py-2 hover:bg-gray-100 text-black';
            button.textContent = barangay;
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                barangayText.textContent = barangay;
                barangayDropdown.classList.add('hidden');
                console.log(`Barangay '${barangay}' button clicked, calling filterLodgesByBarangay`);
                filterLodgesByBarangay(barangay);
                return false; // Prevent default and stop propagation
            });
            barangayList.appendChild(button);
        });

        // Remove ALL previous click handlers on document to avoid conflicts
        if (window._dropdownClickHandler) {
            document.removeEventListener('click', window._dropdownClickHandler, true);
            document.removeEventListener('click', window._dropdownClickHandler, false);
        }

        // Instead of replacing the button (which causes TypeError), 
        // use the existing button but clear all its event listeners
        const dropdownButton = barangayDropdownBtn;
        
        // Define a simplified open function
        const openDropdown = () => {
            // Position dropdown (simplified)
            const buttonRect = dropdownButton.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop; // Get scroll position
            
            // Remove hidden first to get proper dimensions
            barangayDropdown.classList.remove('hidden');
            
            // Position the dropdown
            barangayDropdown.style.position = 'absolute'; // Use absolute positioning relative to the body
            barangayDropdown.style.top = `${buttonRect.bottom + scrollTop + 4}px`;
            barangayDropdown.style.left = `${buttonRect.left}px`;
            barangayDropdown.style.width = '350px'; // Increase width for larger text
            barangayDropdown.style.maxHeight = '400px';
            barangayDropdown.style.zIndex = '10000';
            barangayDropdown.style.backgroundColor = 'white';
            barangayDropdown.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            barangayDropdown.style.border = '1px solid #eaeaea';
            
            // Show the dropdown
            barangayDropdown.classList.remove('hidden');
            
            // Focus the search input
            const searchInput = barangayDropdown.querySelector('input#barangaySearchInput');
            if (searchInput) {
                setTimeout(() => {
                    searchInput.value = '';
                    searchInput.focus();
                    
                    // Hide clear button
                    const clearButton = document.getElementById('clearBarangaySearch');
                    if (clearButton) clearButton.style.display = 'none';
                    
                    // Show search icon
                    const searchIcon = document.getElementById('searchIcon');
                    if (searchIcon) searchIcon.style.display = 'block';
                }, 10);
            }
        };

        // Add a clean click handler to the dropdown button
        dropdownButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Dropdown button clicked - opening dropdown');
            openDropdown();
        });

        // Force all buttons to close the dropdown immediately when clicked
        barangayList.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', function(e) {
                console.log('Option clicked, forcing dropdown closed');
                barangayDropdown.classList.add('hidden');
                e.stopPropagation(); // Prevent event bubbling
            });
        });

        // Simple document click handler to close dropdown when clicking outside
        window._dropdownClickHandler = function(e) {
            if (barangayDropdown && !barangayDropdown.classList.contains('hidden')) {
                // Close if click is outside dropdown AND outside button
                if (!barangayDropdown.contains(e.target) && !dropdownButton.contains(e.target)) {
                    console.log('Outside click detected, forcing dropdown closed');
                    barangayDropdown.classList.add('hidden');
                }
            }
        };
        
        // Use capture phase to ensure it runs before other handlers
        document.addEventListener('click', window._dropdownClickHandler, true);

        // Add ESC key handler
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && barangayDropdown && !barangayDropdown.classList.contains('hidden')) {
                console.log('ESC key pressed, closing dropdown');
                barangayDropdown.classList.add('hidden');
            }
        });

        // Add a direct close method to the dropdown element itself
        barangayDropdown.closeDropdown = function() {
            this.classList.add('hidden');
        };

        // Also add a direct handler for any clicks inside the dropdown
        barangayDropdown.addEventListener('click', function(e) {
            // If a button was clicked
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                console.log('Button clicked inside dropdown, forcing close');
                barangayDropdown.classList.add('hidden');
            }
        });
        
        // Global fail-safe to force dropdown closed from anywhere
        if (!window._globalBarangayCloseHandler) {
            window._globalBarangayCloseHandler = function(event) {
                // Get the dropdown every time to make sure we have the current reference
                const dropdown = document.getElementById('barangayDropdown');
                if (dropdown && !dropdown.classList.contains('hidden')) {
                    console.log('Global click handler triggered, closing dropdown');
                    setTimeout(() => {
                        dropdown.classList.add('hidden');
                    }, 100);
                }
            };
            
            // Add this handler to multiple elements as a fail-safe
            document.body.addEventListener('click', window._globalBarangayCloseHandler);
            window.addEventListener('click', window._globalBarangayCloseHandler);
            document.addEventListener('click', window._globalBarangayCloseHandler);
            
            // Even add an interval timer as a last resort
            window._dropdownCloseInterval = setInterval(() => {
                const dropdown = document.getElementById('barangayDropdown');
                const searchBar = document.querySelector('.search-bar-container');
                if (dropdown && !dropdown.classList.contains('hidden')) {
                    // Only auto-close if mouse is far away from the dropdown
                    if (typeof event !== 'undefined' && event.clientY > 400) {
                        console.log('Auto-closing dropdown via interval');
                        dropdown.classList.add('hidden');
                    }
                }
            }, 5000); // Check every 5 seconds
        }
    }

    // Filter lodges by barangay
    function filterLodgesByBarangay(barangay) {
        console.log('filterLodgesByBarangay called with:', barangay);
        
        const container = document.querySelector('.lodge-container');
        if (!container) {
            console.error('Lodge container not found');
            return;
        }

        const cards = container.querySelectorAll('.lodge-card');
        console.log('Found', cards.length, 'lodge cards');
        
        let visibleCount = 0;

        cards.forEach(card => {
            const cardBarangay = card.dataset.barangay;
            console.log('Card barangay:', cardBarangay, 'Selected barangay:', barangay);
            
            if (barangay === 'All Barangays' || cardBarangay === barangay) {
                card.style.display = 'block';
                visibleCount++;
                console.log('Showing card:', card.querySelector('h2')?.textContent);
            } else {
                card.style.display = 'none';
                console.log('Hiding card:', card.querySelector('h2')?.textContent);
            }
        });

        // Update results count
        const resultsCount = document.querySelector('.lodge-count');
        if (resultsCount) {
            resultsCount.textContent = `Showing ${visibleCount} of ${cards.length} lodges`;
            console.log('Updated results count:', resultsCount.textContent);
        }

        // Update map markers if map is visible
        if (!document.getElementById('mapView').classList.contains('hidden')) {
            updateMapMarkers(barangay);
        }
        
        // Force a DOM reflow to ensure changes are applied
        document.body.offsetHeight;
    }

    // Add this function to update map markers based on barangay filter
    function updateMapMarkers(barangay) {
        if (!markers || !map) return;

        markers.forEach(marker => {
            const lodge = lodgeData.find(l => 
                l.coordinates.lat === marker.getPosition().lat() && 
                l.coordinates.lng === marker.getPosition().lng()
            );

            if (lodge) {
                if (barangay === 'All Barangays' || lodge.barangay === barangay) {
                    marker.setMap(map);
                } else {
                    marker.setMap(null);
                }
            }
        });
    }

    // Update the updateResultsCount function
    function updateResultsCount(count) {
        updateDisplayCount();
    }

    // Add the new modal function here
    function addLodgeModalToDOM() {
        const modalHTML = `
            <div id="lodgeDetailsModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
                <div class="fixed inset-0 flex items-center justify-center p-4">
                    <div class="bg-white rounded-lg max-w-4xl w-full max-h-90vh overflow-y-auto">
                        <div class="p-6" id="lodgeDetailsContent">
                            <!-- Content will be dynamically inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    
        // Add global click handler to close modal when clicking outside
        const lodgeDetailsModal = document.getElementById('lodgeDetailsModal');
        if (lodgeDetailsModal) {
            lodgeDetailsModal.addEventListener('click', (e) => {
                if (e.target === lodgeDetailsModal) {
                    lodgeDetailsModal.classList.add('hidden');
                }
            });
        }
    }
    
    // Add the show details function here
    function showLodgeDetails(lodge) {
        const modal = document.getElementById('lodgeDetailsModal');
        const content = document.getElementById('lodgeDetailsContent');
        
        if (!modal || !content) {
            console.error('Modal elements not found');
            return;
        }
        
        // Generate the correct file path with the Lodge folder
        const bookingUrl = `../Lodge/lodge${lodge.id}.html`;
        
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
        
        content.innerHTML = `
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-2xl font-bold flex items-center">${bestValueBadge}${lodge.name}</h2>
                <button id="closeDetailsBtn" class="text-gray-500 hover:text-gray-700">
                    <i class="ri-close-line text-2xl"></i>
                </button>
            </div>
            <img src="${lodge.image}" alt="${lodge.name}" class="w-full h-64 object-cover rounded-lg mb-6">
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
                    <div class="flex flex-wrap gap-2">
                        ${lodge.amenities.map(amenity => 
                            `<span class="bg-gray-100 px-3 py-1 rounded-full text-sm">${amenity}</span>`
                        ).join('')}
                    </div>
                    
                    <a href="${bookingUrl}">
                        <button class="w-full bg-blue-600 text-white py-3 rounded-lg mt-6 hover:bg-blue-700 transition-colors">
                            Book Now
                        </button>
                    </a>
                </div>
            </div>
        `;
        
        // Show the modal
        modal.classList.remove('hidden');
        
        // Add event listener to close button AFTER content is added
        const closeBtn = document.getElementById('closeDetailsBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                console.log('Close details button clicked');
                modal.classList.add('hidden');
            });
        } else {
            console.error('Close details button not found');
        }
    }
    
    // Search functionality
    function initializeSearch() {
        const searchInput = document.querySelector('input[placeholder*="Search"]');
        if (!searchInput) {
            console.error('Search input not found');
            return;
        }

        function filterLodges(searchTerm) {
            const lodges = document.querySelectorAll('.lodge-card');
            let visibleCount = 0;

            lodges.forEach(lodge => {
                const searchableContent = [
                    lodge.querySelector('h2')?.textContent || '',
                    lodge.querySelector('.text-gray-500')?.textContent || '',
                    ...Array.from(lodge.querySelectorAll('.text-xs')).map(el => el.textContent || '')
                ].join(' ').toLowerCase();

                if (searchTerm === '' || searchableContent.includes(searchTerm.toLowerCase())) {
                    lodge.style.display = 'block';
                    visibleCount++;
                } else {
                    lodge.style.display = 'none';
                }
            });

            updateResultsCount(visibleCount);
        }

        searchInput.addEventListener('input', (e) => filterLodges(e.target.value));
    }

    // Map toggle functionality
    let map;
    let markers = [];
    let userMarker;
    let directionsService;
    let directionsRenderer;
    let userLocation = null;

    // Initialize map functionality when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        initMapView();
        
        // Connect the global direction functions
        window.getDirectionsCallback = getDirections;
        window.clearDirectionsCallback = clearDirections;
    });

    // Modified map initialization function to work with Google Maps callback
    function initializeMap() {
        console.log('Map initialization started');
        if (typeof google === 'undefined') {
            console.error('Google Maps API not loaded. Will try again when callback is triggered.');
            return;
        }
        
        // Check if map element exists
        if (!document.getElementById("map")) {
            console.log('Map container not found in DOM');
            return;
        }
        
        console.log('Initializing map...');
        initMap();
        getUserLocation();
        addMarkers(lodgeData);
    }

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
        }
    }

    function initMap() {
        const baguioCity = { lat: 16.4023, lng: 120.5960 };
        
        // Initialize directions service and renderer
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: '#4285F4',
                strokeWeight: 4
            }
        });

        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 14,
            center: baguioCity,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: false,
            gestureHandling: 'greedy',
            clickableIcons: true,
            draggable: true,
            keyboardShortcuts: true,
            disableDoubleClickZoom: false,
            styles: [
                {
                    featureType: "poi",
                    elementType: "labels",
                    stylers: [{ visibility: "on" }]
                }
            ]
        });

        // Prevent scroll propagation
        google.maps.event.addDomListener(map.getDiv(), 'wheel', (e) => {
            e.stopPropagation();
        });

        directionsRenderer.setMap(map);

        // Add custom controls - in a single group at the right bottom
        const zoomInButton = document.createElement("button");
        zoomInButton.textContent = "+";
        zoomInButton.className = "custom-map-control";
        zoomInButton.title = "Zoom in";
        zoomInButton.onclick = () => map.setZoom(map.getZoom() + 1);

        const zoomOutButton = document.createElement("button");
        zoomOutButton.textContent = "-";
        zoomOutButton.className = "custom-map-control";
        zoomOutButton.title = "Zoom out";
        zoomOutButton.onclick = () => map.setZoom(map.getZoom() - 1);

        // Add a button to show user's location
        const myLocationButton = document.createElement("button");
        myLocationButton.className = "custom-map-control";
        myLocationButton.innerHTML = '<i class="ri-map-pin-user-line"></i>';
        myLocationButton.title = "Show my location";
        myLocationButton.onclick = () => {
            if (userLocation) {
                map.panTo(userLocation);
                map.setZoom(15);
            } else {
                getUserLocation();
                alert("Getting your location. Please wait...");
            }
        };

        // Add controls in this order: My Location, Zoom In, Zoom Out
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(myLocationButton);
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(zoomInButton);
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(zoomOutButton);
    }

    function getDirections(destination) {
        if (!userLocation) {
            // If we don't have user location yet, try to get it first
            getUserLocation();
            alert("Please allow location access to get directions. Try again in a moment.");
            return;
        }

        // Show loading state
        const loadingInfoWindow = new google.maps.InfoWindow({
            content: `
                <div class="p-4">
                    <h3 class="font-bold mb-2">Getting Directions...</h3>
                    <p class="text-sm">Please wait while we calculate the route.</p>
                </div>
            `,
            position: destination
        });
        loadingInfoWindow.open(map);

        const request = {
            origin: userLocation,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING
        };

        directionsService.route(request, (result, status) => {
            loadingInfoWindow.close();

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
                let errorMessage = "Unable to get directions at this time.";
                if (status === google.maps.DirectionsStatus.REQUEST_DENIED) {
                    errorMessage = "API Error: Please make sure the following APIs are enabled in your Google Cloud Console:\n" +
                                 "- Maps JavaScript API\n" +
                                 "- Directions API\n" +
                                 "Also ensure your API key has the correct restrictions set.";
                } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
                    errorMessage = "No route could be found between your location and the destination.";
                } else if (status === google.maps.DirectionsStatus.OVER_QUERY_LIMIT) {
                    errorMessage = "You have exceeded your API request quota. Please try again later.";
                }
                console.error("Directions request failed:", status);
                
                const errorInfoWindow = new google.maps.InfoWindow({
                    content: `
                        <div class="p-4">
                            <h3 class="font-bold mb-2 text-red-600">Error Getting Directions</h3>
                            <p class="text-sm mb-2">${errorMessage}</p>
                            <p class="text-sm text-gray-600">Status: ${status}</p>
                        </div>
                    `,
                    position: destination
                });
                errorInfoWindow.open(map);
            }
        });
    }

    function clearDirections() {
        directionsRenderer.setDirections({ routes: [] });
    }

    function addMarkers(lodges) {
        // Clear existing markers
        markers.forEach(marker => marker.setMap(null));
        markers = [];

        lodges.forEach(lodge => {
            const marker = new google.maps.Marker({
                position: { lat: parseFloat(lodge.coordinates.lat), lng: parseFloat(lodge.coordinates.lng) },
                map: map,
                title: lodge.name,
                animation: google.maps.Animation.DROP
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div class="p-4">
                        <h3 class="font-bold">${lodge.name}</h3>
                        <p class="text-sm">${lodge.location}</p>
                        <p class="text-sm">₱${lodge.price} per night</p>
                        <div class="mt-2">
                            <a href="../Lodge/lodge${lodge.id}.html" class="text-blue-500 hover:text-blue-700">View Details</a>
                            <button onclick="getDirections({lat: ${lodge.coordinates.lat}, lng: ${lodge.coordinates.lng}})" 
                                    class="ml-2 text-blue-500 hover:text-blue-700">
                                Get Directions
                            </button>
                        </div>
                    </div>
                `
            });

            marker.addListener("click", () => {
                infoWindow.open(map, marker);
            });

            markers.push(marker);
        });
    }

    function initMapView() {
        const showMapBtn = document.getElementById("showMap");
        const closeMapBtn = document.getElementById("closeMap");
        const mapView = document.getElementById("mapView");

        showMapBtn?.addEventListener("click", () => {
            mapView.classList.remove("hidden");
            if (!map && typeof google !== 'undefined') {
                // Only initialize if Google Maps API is loaded
                initializeMap();
            } else if (map) {
                // If map already exists, trigger a resize to fix any display issues
                google.maps.event.trigger(map, 'resize');
                // Re-initialize markers that might be hidden
                updateMapMarkers('All Barangays');
            } else {
                console.log('Waiting for Google Maps API to load...');
            }
        });

        closeMapBtn?.addEventListener("click", () => {
            mapView.classList.add("hidden");
        });

        // Close map view when clicking Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !mapView.classList.contains("hidden")) {
                mapView.classList.add("hidden");
            }
        });
    }

    // Initialize filters
    function initializeFilters() {
        // Price filter
        const priceSlider = document.querySelector('input[type="range"]');
        if (priceSlider) {
            // Set initial value display
            const priceDisplay = document.querySelector('.price-display');
            if (priceDisplay) {
                priceDisplay.textContent = `₱${parseInt(priceSlider.value).toLocaleString()}`;
            }
            
            priceSlider.addEventListener('input', (e) => {
                const maxPrice = parseInt(e.target.value);
                const priceDisplay = document.querySelector('.price-display');
                if (priceDisplay) {
                    priceDisplay.textContent = `₱${maxPrice.toLocaleString()}`;
                }
                applyFilters();
            });
        }

        // All other filters (checkboxes)
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', applyFilters);
        });

        // Reset button
        const resetButton = document.querySelector('.ri-refresh-line')?.parentElement;
        if (resetButton) {
            resetButton.addEventListener('click', resetFilters);
        }

        // Apply initial filtering
        applyFilters();
    }

    function applyFilters() {
        const lodges = document.querySelectorAll('.lodge-card');
        const container = document.querySelector('.lodge-container');
        const priceSlider = document.querySelector('input[type="range"]');
        const maxPrice = priceSlider ? parseInt(priceSlider.value) : Infinity;
    
        // Get all selected filters
        const selectedFilters = {
            neighborhoods: getSelectedValues('neighborhood'),
            amenities: getSelectedValues('amenity'),
            propertyTypes: getPropertyTypeValues(),
            stayDuration: getSelectedValues('stayDuration'),
            guestRating: getSelectedValues('guest-rating'),
            moreAmenities: getSelectedValues('more-amenities'), // Make sure this matches your HTML
            roomTypes: getSelectedValues('room-type')
        };
    
        let visibleCount = 0;
    
        lodges.forEach(lodge => {
            const price = extractPrice(lodge);
            const matchesPrice = price <= maxPrice;
            const matchesFilters = checkAllFilters(lodge, selectedFilters);
    
            if (matchesPrice && matchesFilters) {
                lodge.style.display = 'block';
                visibleCount++;
            } else {
                lodge.style.display = 'none';
            }
        });
    
        // Update empty state message
        if (visibleCount === 0) {
            if (!container.querySelector('.no-results')) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results col-span-full text-center py-8';
                noResults.innerHTML = `
                    <i class="ri-hotel-line text-4xl text-gray-400 mb-2"></i>
                    <h3 class="text-xl font-semibold text-gray-600 mb-2">No Lodges Available</h3>
                    <p class="text-gray-500">Try adjusting your filters to find more options.</p>
                `;
                container.appendChild(noResults);
            }
        } else {
            const noResults = container.querySelector('.no-results');
            if (noResults) {
                noResults.remove();
            }
        }
    
        // Update the displayed count
        updateDisplayCount();
    }
    
    function resetFilters() {
        // Reset price slider
        const priceSlider = document.querySelector('input[type="range"]');
        if (priceSlider) {
            priceSlider.value = priceSlider.max;
            const priceDisplay = document.querySelector('.price-display');
            if (priceDisplay) {
                priceDisplay.textContent = `₱${parseInt(priceSlider.max).toLocaleString()}`;
            }
        }
    
        // Reset all checkboxes and show all lodges
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    
        document.querySelectorAll('.lodge-card').forEach(card => {
            card.style.display = 'block';
        });
    
        // Remove no-results message if it exists
        const noResults = document.querySelector('.no-results');
        if (noResults) {
            noResults.remove();
        }
    
        // Update the count
        updateDisplayCount();

        // Make sure filters are properly applied after reset
        applyFilters();
    }

    function getSelectedValues(selector) {
        const checkboxes = document.querySelectorAll(`input[name="${selector}"]:checked`);
        return Array.from(checkboxes).map(cb => cb.value.toLowerCase());
    }

    function getPropertyTypeValues() {
        return Array.from(document.querySelectorAll('[data-filter="property-type"] input:checked'))
            .map(cb => cb.value.toLowerCase());
    }

    function checkAllFilters(lodge, filters) {
        // Check property type
        const propertyType = lodge.dataset.propertyType?.toLowerCase();
        if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(propertyType)) {
            return false;
        }

        // Check neighborhood
        const location = lodge.querySelector('.location span')?.textContent.toLowerCase() || '';
        if (filters.neighborhoods.length > 0 && !filters.neighborhoods.some(n => location.includes(n.toLowerCase()))) {
            return false;
        }

        // Get all amenities from the lodge (both regular and more amenities)
        const lodgeAmenities = Array.from(lodge.querySelectorAll('.amenity-tag'))
            .map(tag => tag.textContent.toLowerCase());

        // Check regular amenities
        if (filters.amenities.length > 0 && !filters.amenities.every(a => lodgeAmenities.includes(a.toLowerCase()))) {
            return false;
        }

        // Check more amenities
        if (filters.moreAmenities.length > 0 && !filters.moreAmenities.every(a => lodgeAmenities.includes(a.toLowerCase()))) {
            return false;
        }

        // Check guest rating if implemented
        if (filters.guestRating.length > 0) {
            const rating = parseFloat(lodge.querySelector('.rating span')?.textContent || '0');
            const passesRating = filters.guestRating.some(ratingFilter => {
                const minRating = parseInt(ratingFilter);
                return rating >= minRating;
            });
            if (!passesRating) return false;
        }

        // Check stay duration - Modified logic
        if (filters.stayDuration.length > 0) {
            const hasLongTerm = lodgeAmenities.some(amenity => 
                amenity.includes('long-term') || amenity.includes('long term'));
                
            if (filters.stayDuration.includes('long term/dorms') && !hasLongTerm) {
                return false;
            }
            if (filters.stayDuration.includes('short term') && hasLongTerm) {
                return false;
            }
        }

        return true;
    }

    function extractPrice(lodge) {
        const priceText = lodge.querySelector('.price')?.textContent || '0';
        return parseInt(priceText.replace(/[^0-9]/g, ''));
    }

    // Sort functionality
    function initializeSort() {
        const sortSelect = document.getElementById('sortBySelect');
        const lodgeCount = document.querySelector('.lodge-count');
        if (!sortSelect || !lodgeCount) return;

        // Initial count display
        updateDisplayCount();

        sortSelect.addEventListener('change', () => {
            console.log('Sort selection changed to:', sortSelect.value);
            const lodges = Array.from(document.querySelectorAll('.lodge-card'));
            const container = document.querySelector('.lodge-container');
            if (!container) return;

            lodges.sort((a, b) => {
                const priceA = parseInt(a.querySelector('.price')?.textContent.replace(/[^0-9]/g, '') || '0');
                const priceB = parseInt(b.querySelector('.price')?.textContent.replace(/[^0-9]/g, '') || '0');
                const ratingA = parseFloat(a.querySelector('.rating .font-medium')?.textContent || '0');
                const ratingB = parseFloat(b.querySelector('.rating .font-medium')?.textContent || '0');

                switch (sortSelect.value) {
                    case 'Price: Low to High':
                        return priceA - priceB;
                    case 'Price: High to Low':
                        return priceB - priceA;
                    case 'Top Rated':
                        return ratingB - ratingA;
                    default: // Recommended
                        return lodgeData.findIndex(l => l.id === parseInt(a.dataset.lodgeId)) - 
                               lodgeData.findIndex(l => l.id === parseInt(b.dataset.lodgeId));
                }
            });

            // Clear and re-append sorted lodges
            container.innerHTML = '';
            lodges.forEach(lodge => container.appendChild(lodge));
            
            // Update count after sorting
            updateDisplayCount();
        });
    }

    // Helper function to update the display count
    function updateDisplayCount() {
        const lodgeCount = document.querySelector('.lodge-count');
        if (!lodgeCount) return;

        const visibleLodges = Array.from(document.querySelectorAll('.lodge-card'))
            .filter(card => window.getComputedStyle(card).display !== 'none');
        const totalLodges = lodgeData.length;
        
        lodgeCount.textContent = `Showing ${visibleLodges.length} of ${totalLodges} lodges`;
    }

    function initGuestsDropdown() {
        const guestsDropdownBtn = document.getElementById('guestsDropdownBtn');
        const guestsDropdown = document.getElementById('guestsDropdown');
        const dropdownPortal = document.getElementById('dropdownPortal');
        
        // Move dropdown to portal if not already there
        if (guestsDropdown && dropdownPortal && guestsDropdown.parentElement !== dropdownPortal) {
            dropdownPortal.appendChild(guestsDropdown);
        }

        const guestsText = document.getElementById('guestsText');
        const applyGuestsBtn = document.getElementById('applyGuests');
        const guestBtns = document.querySelectorAll('.guest-btn');

        if (!guestsDropdownBtn || !guestsDropdown || !guestsText) return;

        const guestState = {
            guests: 1
        };

        function updateGuestsText() {
            const total = guestState.guests;
            guestsText.textContent = `${total} guest${total !== 1 ? 's' : ''}`;
        }

        function updateButtonStates() {
            guestBtns.forEach(btn => {
                const action = btn.dataset.action;
                
                if (action === 'decrement') {
                    btn.disabled = guestState.guests <= 1;
                } else if (action === 'increment') {
                    btn.disabled = guestState.guests >= 8;
                }
                
                btn.classList.toggle('opacity-50', btn.disabled);
            });
        }

        // Handle guest buttons
        guestBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (btn.disabled) return;

                const action = btn.dataset.action;
                
                if (action === 'increment') {
                    guestState.guests++;
                } else if (action === 'decrement') {
                    guestState.guests--;
                }
                
                // Update the count display
                const countElement = document.querySelector(`.guest-count[data-type="guests"]`);
                if (countElement) {
                    countElement.textContent = guestState.guests;
                }
                
                updateButtonStates();
                updateGuestsText();
            });
        });

        // Toggle dropdown with improved positioning
        guestsDropdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const buttonRect = guestsDropdownBtn.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Remove hidden first to get proper dimensions
            guestsDropdown.classList.remove('hidden');
            
            // Position the dropdown
            guestsDropdown.style.position = 'fixed';
            guestsDropdown.style.left = `${buttonRect.left}px`;
            guestsDropdown.style.width = `${buttonRect.width}px`;
            guestsDropdown.style.zIndex = '10000';

            // Check if there's room below
            const dropdownHeight = guestsDropdown.offsetHeight;
            const viewportHeight = window.innerHeight;
            
            if (buttonRect.bottom + dropdownHeight > viewportHeight) {
                guestsDropdown.style.top = `${buttonRect.top + scrollTop - dropdownHeight - 5}px`;
            } else {
                guestsDropdown.style.top = `${buttonRect.bottom + scrollTop + 5}px`;
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!guestsDropdown.contains(e.target) && !guestsDropdownBtn.contains(e.target)) {
                guestsDropdown.classList.add('hidden');
            }
        });

        // Apply button
        applyGuestsBtn?.addEventListener('click', () => {
            guestsDropdown.classList.add('hidden');
        });

        // Initial state
        updateButtonStates();
        updateGuestsText();
    }

    // Remove the initializeCheckInDropdown function since we won't need it anymore

    
    // Header scroll effect
    function initializeHeaderScroll() {
        const header = document.querySelector('.main-header');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');

        if (header) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 0) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            });
        }

        if (mobileMenuBtn && mobileMenu) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
            });
        }
    }

    // Initialize header scroll effect
    initializeHeaderScroll();

    function initializeNavigation() {
        // Quick Search button handler
        const quickSearchBtn = document.getElementById('quickSearchBtn');
        if (quickSearchBtn) {
            quickSearchBtn.addEventListener('click', () => {
                const searchInput = document.querySelector('input[placeholder*="Search lodges"]');
                if (searchInput) {
                    searchInput.scrollIntoView({ behavior: 'smooth' });
                    searchInput.focus();
                    
                    // Highlight the search container
                    const searchContainer = searchInput.closest('.search-container-wrapper');
                    if (searchContainer) {
                        searchContainer.classList.add('highlight');
                        setTimeout(() => {
                            searchContainer.classList.remove('highlight');
                        }, 2000);
                    }
                }
            });
        }

        // Add active state to current page
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-button').forEach(button => {
            if (button.getAttribute('href') && button.getAttribute('href').includes(currentPath)) {
                button.classList.add('active');
            }
        });
    }

    function initializeCheckInDateFilter() {
        const checkInDropdownBtn = document.getElementById('checkInDropdownBtn');
        const checkInText = document.getElementById('checkInText');
    
        if (!checkInDropdownBtn || !checkInText) {
            console.error('Check-in date filter elements not found');
            return;
        }
    
        // Check if flatpickr is available
        if (typeof flatpickr === 'undefined') {
            console.warn('Flatpickr not available, using native date input');
            
            // Create a hidden native date input
            const nativeDateInput = document.createElement('input');
            nativeDateInput.type = 'date';
            nativeDateInput.style.display = 'none';
            nativeDateInput.id = 'nativeDateInput';
            checkInDropdownBtn.parentNode.appendChild(nativeDateInput);
            
            // When check-in button is clicked, show and focus the native date input
            checkInDropdownBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                nativeDateInput.style.display = 'block';
                nativeDateInput.focus();
                nativeDateInput.showPicker();
            });
            
            // Handle date selection
            nativeDateInput.addEventListener('change', function() {
                const selectedDate = new Date(this.value);
                const formattedDate = selectedDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                checkInText.textContent = formattedDate;
                nativeDateInput.style.display = 'none';
                
                // Apply date filter
                filterLodgesByDate(selectedDate);
            });
            
            // Handle clicking outside
            document.addEventListener('click', function(e) {
                if (e.target !== checkInDropdownBtn && e.target !== nativeDateInput) {
                    nativeDateInput.style.display = 'none';
                }
            });
        } else {
            // Initialize flatpickr
            const flatpickrInstance = flatpickr(checkInDropdownBtn, {
                dateFormat: "M j, Y",
                minDate: "today",
                disableMobile: false,
                onChange: function(selectedDates) {
                    if (selectedDates.length > 0) {
                        const selectedDate = selectedDates[0];
                        checkInText.textContent = flatpickrInstance.formatDate(selectedDate, "M j, Y");
                        
                        // Apply date filter
                        filterLodgesByDate(selectedDate);
                    }
                },
                onOpen: function() {
                    checkInText.style.color = '#3B82F6'; // Blue when open
                },
                onClose: function() {
                    checkInText.style.color = checkInText.textContent === 'Check-in Date' ? '#6B7280' : '#111827';
                }
            });
            
            // Position the calendar correctly (customizable)
            checkInDropdownBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Delay to allow flatpickr to open
                setTimeout(() => {
                    const calendar = document.querySelector('.flatpickr-calendar');
                    if (calendar) {
                        const buttonRect = checkInDropdownBtn.getBoundingClientRect();
                        calendar.style.left = `${buttonRect.left}px`;
                        calendar.style.top = `${buttonRect.bottom + window.scrollY + 10}px`;
                    }
                }, 10);
            });
        }
    }

    // Function to initialize and populate the bookings modal
    function initializeBookingsModal(auth, db) {
        console.log('[rooms.js] initializeBookingsModal EXECUTION START.');
        if (document.getElementById('bookingsPopupRooms')) {
            console.warn('[rooms.js] initializeBookingsModal: #bookingsPopupRooms ALREADY EXISTS. Aborting recreation.');
            return;
        }

        if (!auth || typeof auth.onAuthStateChanged !== 'function') {
            console.error('[rooms.js] initializeBookingsModal: Auth is NOT VALID or not initialized. Aborting modal creation.');
            return;
        }
        if (!db || typeof db.collection !== 'function') {
            console.error('[rooms.js] initializeBookingsModal: Firestore db is NOT VALID or not initialized. Aborting modal creation.');
            return;
        }

        console.log('[rooms.js] initializeBookingsModal: Auth and DB seem valid. Creating popup HTML.');

        const bookingsPopup = document.createElement('div');
        bookingsPopup.id = 'bookingsPopupRooms';
        bookingsPopup.className = 'fixed inset-0 bg-black bg-opacity-50 hidden';
        bookingsPopup.style.zIndex = "200000";
        
        bookingsPopup.innerHTML = `
            <div class="fixed right-0 top-0 w-96 h-full bg-white shadow-xl overflow-y-auto" style="z-index: 200001 !important;">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-2xl font-bold text-gray-900">My Bookings</h3>
                        <button id="closeBookingsPopupRooms" class="text-gray-500 hover:text-gray-700">
                            <i class="ri-close-line text-2xl"></i>
                        </button>
                    </div>
                    <div class="flex border-b mb-6">
                        <button class="flex-1 py-3 text-blue-600 border-b-2 border-blue-600 font-medium" data-tab="current_rooms">Current</button>
                        <button class="flex-1 py-3 text-gray-500 font-medium" data-tab="previous_rooms">Previous</button>
                        <button class="flex-1 py-3 text-gray-500 font-medium" data-tab="cancelled_rooms">Cancelled</button>
                    </div>
                    <div id="currentBookingsRooms" class="space-y-4">
                        <div class="flex items-center justify-center py-6">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span class="ml-2">Loading bookings...</span>
                        </div>
                    </div>
                    <div id="previousBookingsRooms" class="hidden space-y-4">
                        <div class="flex items-center justify-center py-6">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span class="ml-2">Loading bookings...</span>
                        </div>
                    </div>
                    <div id="cancelledBookingsRooms" class="hidden space-y-4">
                        <div class="flex items-center justify-center py-6">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            <span class="ml-2">Loading bookings...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(bookingsPopup);
        console.log('[rooms.js] initializeBookingsModal: #bookingsPopupRooms element appended to body.');
        
        const closeBtn = bookingsPopup.querySelector('#closeBookingsPopupRooms');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('[rooms.js] Close button clicked for #bookingsPopupRooms');
                bookingsPopup.classList.add('hidden');
            });
        }
        
        bookingsPopup.addEventListener('click', (e) => {
            if (e.target === bookingsPopup) {
                console.log('[rooms.js] Backdrop clicked for #bookingsPopupRooms');
                bookingsPopup.classList.add('hidden');
            }
        });
        
                const tabButtons = bookingsPopup.querySelectorAll('[data-tab]');
                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        tabButtons.forEach(btn => {
                            btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
                            btn.classList.add('text-gray-500');
                        });
                        button.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
                        button.classList.remove('text-gray-500');

                        const tabName = button.dataset.tab;
                const currentContent = document.getElementById('currentBookingsRooms');
                const previousContent = document.getElementById('previousBookingsRooms');
                const historyContent = document.getElementById('bookingHistoryContainerRooms');

                if(currentContent) currentContent.classList.toggle('hidden', tabName !== 'current_rooms');
                if(previousContent) previousContent.classList.toggle('hidden', tabName !== 'previous_rooms');
                if(historyContent) historyContent.classList.toggle('hidden', tabName !== 'history_rooms');
                 console.log(`[rooms.js] Tab ${tabName} selected in bookings popup.`);
                    });
                });

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('[rooms.js] initializeBookingsModal: Auth state changed, user logged in. UID:', user.uid);
                if (window.loadBookingHistory && document.getElementById('bookingHistoryContainerRooms')) {
                     console.log('[rooms.js] initializeBookingsModal: Calling window.loadBookingHistory for bookingHistoryContainerRooms.');
                     // Assuming loadBookingHistory can take a container ID, or it defaults to a known one.
                     // If it needs db, it should be passed or accessed from its own scope.
                     window.loadBookingHistory(user.uid, db, 'bookingHistoryContainerRooms'); 
                } else {
                    console.warn('[rooms.js] initializeBookingsModal: window.loadBookingHistory not available or container #bookingHistoryContainerRooms missing.');
                    const historyContainer = document.getElementById('bookingHistoryContainerRooms');
                    if (historyContainer) {
                        historyContainer.innerHTML = '<p class="text-gray-500 text-center py-16">Could not load booking history function.</p>';
                    }
                }
            } else {
                console.log('[rooms.js] initializeBookingsModal: Auth state changed, user logged OUT.');
                if(document.getElementById('currentBookingsRooms')) document.getElementById('currentBookingsRooms').innerHTML = '<p class="text-gray-500 text-center py-16">Please log in to see bookings.</p>';
                if(document.getElementById('previousBookingsRooms')) document.getElementById('previousBookingsRooms').innerHTML = '';
                if(document.getElementById('bookingHistoryContainerRooms')) document.getElementById('bookingHistoryContainerRooms').innerHTML = '';
            }
        });
        console.log('[rooms.js] initializeBookingsModal EXECUTION END.');
    }

    // Function to fetch user's bookings
    async function fetchUserBookings(userId, db) {
        console.log('Fetching bookings for user:', userId);
        
        if (!userId) {
            console.error('No user ID provided to fetchUserBookings');
            return { currentBookings: [], pastBookings: [] };
        }
        
        try {
            // Create an inline booking service if needed
            const bookingService = {
                getUserBookings: async function(userId) {
                    if (!db || !db.collection) {
                        console.error('Database not available for fetching bookings');
                        return { currentBookings: [], pastBookings: [] };
                    }
                    
                    try {
                        const bookingsCollection = db.collection('bookings');
                        const snapshot = await bookingsCollection.where('userId', '==', userId).get();
                        
                        if (snapshot.empty) {
                            console.log('No bookings found for user:', userId);
                            return { currentBookings: [], pastBookings: [] };
                        }
                        
                        const now = new Date();
                        const currentBookings = [];
                        const pastBookings = [];
                        
                        snapshot.forEach(doc => {
                            const booking = { id: doc.id, ...doc.data() };
                            
                            // Handle different date formats
                            let checkOutDate;
                            if (booking.checkOutDate) {
                                if (typeof booking.checkOutDate.toDate === 'function') {
                                    checkOutDate = booking.checkOutDate.toDate();
                                } else if (typeof booking.checkOutDate === 'string') {
                                    checkOutDate = new Date(booking.checkOutDate);
                                } else {
                                    checkOutDate = booking.checkOutDate;
                                }
                            } else {
                                // If no checkout date, assume it's a past booking
                                checkOutDate = new Date(0);
                            }
                            
                            if (checkOutDate > now) {
                                currentBookings.push(booking);
                            } else {
                                pastBookings.push(booking);
                            }
                        });
                        
                        return { currentBookings, pastBookings };
                    } catch (error) {
                        console.error('Error querying bookings:', error);
                        throw error;
                    }
                }
            };
            
            // Use the inline booking service
            const { currentBookings, pastBookings } = await bookingService.getUserBookings(userId);
            
            // Update the UI with the fetched bookings
            const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
            if (bookingHistoryContainer) {
                if (currentBookings.length === 0 && pastBookings.length === 0) {
                    bookingHistoryContainer.innerHTML = `
                        <div class="text-center py-6">
                            <p class="text-gray-500">You don't have any bookings yet.</p>
                        </div>
                    `;
                } else {
                    let html = '';
                    
                    // Add current bookings section if there are any
                    if (currentBookings.length > 0) {
                        html += '<div class="mb-6">';
                        html += '<h3 class="text-lg font-semibold mb-3">Upcoming Stays</h3>';
                        html += '<div class="space-y-4">';
                        
                        currentBookings.forEach(booking => {
                            html += createBookingCard(booking, true);
                        });
                        
                        html += '</div></div>';
                    }
                    
                    // Add past bookings section if there are any
                    if (pastBookings.length > 0) {
                        html += '<div>';
                        html += '<h3 class="text-lg font-semibold mb-3">Past Stays</h3>';
                        html += '<div class="space-y-4">';
                        
                        pastBookings.forEach(booking => {
                            html += createBookingCard(booking, false);
                        });
                        
                        html += '</div></div>';
                    }
                    
                    bookingHistoryContainer.innerHTML = html;
                }
            } else {
                console.error('bookingHistoryContainer not found in the DOM');
            }
            
            return { currentBookings, pastBookings };
        } catch (error) {
            console.error('Error in fetchUserBookings:', error);
            
            // Update UI to show error
            const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
            if (bookingHistoryContainer) {
                bookingHistoryContainer.innerHTML = `
                    <div class="text-center py-6">
                        <p class="text-red-500">There was an error loading your bookings.</p>
                        <p class="text-sm text-gray-500 mt-2">${error.message}</p>
                    </div>
                `;
            }
            
            // Return empty arrays to prevent further errors
            return { currentBookings: [], pastBookings: [] };
        }
    }

    // Helper function to create a booking card HTML
    function createBookingCard(booking, isCurrent) {
        const status = isCurrent ? 'active' : 'completed';
        const statusClass = isCurrent ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
        
        // Format dates safely
        let checkInDate = 'N/A';
        let checkOutDate = 'N/A';
        
        try {
            if (booking.checkInDate) {
                if (typeof booking.checkInDate.toDate === 'function') {
                    checkInDate = booking.checkInDate.toDate().toLocaleDateString();
                } else if (typeof booking.checkInDate === 'string') {
                    checkInDate = new Date(booking.checkInDate).toLocaleDateString();
                } else {
                    checkInDate = booking.checkInDate.toLocaleDateString();
                }
            }
            
            if (booking.checkOutDate) {
                if (typeof booking.checkOutDate.toDate === 'function') {
                    checkOutDate = booking.checkOutDate.toDate().toLocaleDateString();
                } else if (typeof booking.checkOutDate === 'string') {
                    checkOutDate = new Date(booking.checkOutDate).toLocaleDateString();
                } else {
                    checkOutDate = booking.checkOutDate.toLocaleDateString();
                }
            }
        } catch (error) {
            console.error('Error formatting dates:', error);
        }
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div class="p-4">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-semibold">${booking.lodgeName || 'Lodge'}</h4>
                            ${isCurrent 
                                ? `<p class="text-sm text-gray-600">Check-in: ${checkInDate}</p>
                                   <p class="text-sm text-gray-600">Check-out: ${checkOutDate}</p>`
                                : `<p class="text-sm text-gray-600">Stayed: ${checkInDate} - ${checkOutDate}</p>`
                            }
                        </div>
                        <span class="px-2 py-1 text-xs rounded-full ${statusClass} capitalize">${status}</span>
                    </div>
                    <div class="mt-3 flex justify-between items-center">
                        <p class="font-medium">₱${booking.totalPrice || booking.price || 'N/A'}</p>
                        <button class="text-sm text-blue-600 hover:underline" 
                            onclick="viewBookingDetails('${booking.id}')">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Function to display bookings in the container
    function displayBookings(containerId, bookings) {
        console.log(`Displaying ${bookings.length} bookings in ${containerId}`);
        const container = document.getElementById(containerId);
        
        if (!bookings || !bookings.length) {
            container.innerHTML = `
                <p class="text-gray-500 text-center py-16">No bookings found</p>
            `;
            return;
        }
        
        // Generate HTML for each booking
        const bookingsHTML = bookings.map(booking => {
            // Format dates
            const checkInDate = formatDate(booking.checkIn);
            const checkOutDate = formatDate(booking.checkOut);
            
            // Get property details
            const propertyName = booking.propertyDetails?.name || 'Unknown Property';
            const roomType = booking.propertyDetails?.roomType || 'Standard Room';
            const roomNumber = booking.propertyDetails?.roomNumber || '';
            
            // Get status
            const status = booking.status || 'pending';
            const statusClass = getStatusClass(status);
            
            return `
                <div class="bg-white border rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-semibold">${propertyName}</h4>
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${statusClass}">
                            ${status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                    </div>
                    <p class="text-sm text-gray-600 mb-2">${roomType} ${roomNumber ? `#${roomNumber}` : ''}</p>
                    <div class="flex items-center text-sm text-gray-500 space-x-2 mb-2">
                        <i class="ri-calendar-line"></i>
                        <span>${checkInDate} → ${checkOutDate}</span>
                    </div>
                    <div class="flex justify-between items-center mt-2">
                        <span class="font-medium">₱${booking.totalPrice?.toLocaleString() || 'N/A'}</span>
                        <button class="text-blue-600 hover:text-blue-800 text-sm font-medium" 
                                data-booking-id="${booking.id}" 
                                data-collection="${booking.collectionSource}">
                            View Details
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = bookingsHTML;
        
        // Add event listeners to view details buttons
        container.querySelectorAll('[data-booking-id]').forEach(button => {
            button.addEventListener('click', () => {
                const bookingId = button.dataset.bookingId;
                const collection = button.dataset.collection;
                // Navigate to booking details page or show modal with details
                viewBookingDetails(bookingId, collection);
            });
        });
    }

    // Helper function to format dates
    function formatDate(date) {
        if (!date) return 'N/A';
        
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    // Helper function to get status class for styling
    function getStatusClass(status) {
        switch (status.toLowerCase()) {
            case 'confirmed':
                return 'bg-green-100 text-green-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            case 'completed':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    }

    // Function to view booking details
    function viewBookingDetails(bookingId, collection) {
        console.log(`Viewing booking ${bookingId} from ${collection} collection`);
        
        // Fix case sensitivity in path and handle collection default
        const dashboardPath = '../Dashboard/Dashboard.html';
        const collectionParam = collection || 'everlodgebookings';
        
        // Use the corrected URL for dashboard
        window.location.href = `${dashboardPath}?bookingId=${bookingId}&collection=${collectionParam}`;
    }

    // At the very beginning of the file (outside the IIFE), add global function
    window.showBookingsModal = function() {
        console.log('Global showBookingsModal called');
        const bookingsPopup = document.getElementById('bookingsPopupRooms'); // Use unique ID
        if (bookingsPopup) {
            console.log('[rooms.js] window.showBookingsModal: #bookingsPopupRooms FOUND. Current classes:', bookingsPopup.className);
            bookingsPopup.classList.remove('hidden');
            console.log('[rooms.js] window.showBookingsModal: #bookingsPopupRooms classes after removing hidden:', bookingsPopup.className);
            // Ensure z-index is high enough
            bookingsPopup.style.zIndex = '200000'; 
            const innerModal = bookingsPopup.querySelector('.fixed.right-0.top-0');
            if (innerModal) innerModal.style.zIndex = '200001';
        } else {
            console.error('[rooms.js] window.showBookingsModal: #bookingsPopupRooms NOT FOUND in DOM!');
        }
    };

    // Inside the IIFE, update the showBookingsModal function (around line 1751)
    function showBookingsModal() {
        console.log('Internal showBookingsModal called - using global version');
        window.showBookingsModal();  // Call the global function
    }

    // Keep this line - just make it call the global function instead of defining a new one
    window.showBookingsModal = window.showBookingsModal || showBookingsModal;

   
    // Function to ensure bookings modal persists across page navigation
    function ensureBookingsModalPersistence() {
        // Check if modal exists, if not create it
        let bookingsPopup = document.getElementById('bookingsPopupRooms');
        
        if (!bookingsPopup) {
            console.log('Recreating bookings modal on page revisit');
            
            try {
                // Get Firebase instances
                const auth = window.firebase?.auth();
                const db = window.firebase?.firestore();
                
                if (auth && db) {
                    initializeBookingsModal(auth, db);
                    bookingsPopup = document.getElementById('bookingsPopupRooms');
                    
                    if (bookingsPopup) {
                        // Additional fix to ensure z-index is set correctly
                        bookingsPopup.style.cssText = bookingsPopup.style.cssText + "; z-index: 200000 !important;";
                        
                        const modalContainer = bookingsPopup.querySelector('.fixed.right-0.top-0');
                        if (modalContainer) {
                            modalContainer.style.cssText = modalContainer.style.cssText + "; z-index: 200001 !important;";
                        }
                    }
                }
            } catch (error) {
                console.error('Error recreating bookings modal:', error);
            }
        } else {
            // If modal exists, ensure its z-index is set correctly
            bookingsPopup.style.cssText = bookingsPopup.style.cssText + "; z-index: 200000 !important;";
            
            const modalContainer = bookingsPopup.querySelector('.fixed.right-0.top-0');
            if (modalContainer) {
                modalContainer.style.cssText = modalContainer.style.cssText + "; z-index: 200001 !important;";
            }
        }
    }
    
    // Run this function on DOM load to ensure we have the bookings modal
    document.addEventListener('DOMContentLoaded', ensureBookingsModalPersistence);
    
    // Also run when page becomes visible again (returning from other pages)
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            ensureBookingsModalPersistence();
        }
    });

    document.addEventListener('DOMContentLoaded', function() {
        // Additional event listener for the search input that might be in the DOM directly
        const directSearchInput = document.getElementById('barangaySearchInput');
        if (directSearchInput) {
            console.log('Found direct search input in DOM, attaching event listener');
            directSearchInput.addEventListener('input', function(e) {
                const searchTerm = e.target.value.toLowerCase().trim();
                console.log('Direct search input triggered with:', searchTerm);
                
                // Access the barangay list
                const barangayList = document.getElementById('barangayList');
                if (!barangayList) {
                    console.error('Could not find barangayList for direct search');
                    return;
                }
                
                // Find all barangay buttons
                const buttons = barangayList.querySelectorAll('button');
                console.log(`Found ${buttons.length} buttons in barangayList`);
                
                // Filter the buttons
                let matchCount = 0;
                buttons.forEach(button => {
                    // Skip the "All Barangays" option if there's a search term
                    if (button.textContent === 'All Barangays') {
                        button.style.display = searchTerm ? 'none' : 'block';
                        return;
                    }
                    
                    const text = button.textContent.toLowerCase();
                    if (text.includes(searchTerm)) {
                        button.style.display = 'block';
                        matchCount++;
                    } else {
                        button.style.display = 'none';
                    }
                });
                
                console.log(`Direct search found ${matchCount} matches`);
                
                // Handle "no results" message
                const existingNoResults = barangayList.querySelector('.no-results');
                if (matchCount === 0 && searchTerm) {
                    if (!existingNoResults) {
                        const noResults = document.createElement('div');
                        noResults.className = 'no-results text-center py-2 text-black';
                        noResults.textContent = 'No areas found';
                        barangayList.appendChild(noResults);
                    }
                } else if (existingNoResults) {
                    existingNoResults.remove();
                }
            });
        }
    });

    // Add a global ESC key handler
    document.addEventListener('DOMContentLoaded', function() {
        // Global ESC key handler to close all modals
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                console.log('ESC key pressed - closing all modals');
                
                // Close all possible modals
                const modals = [
                    document.getElementById('lodgeDetailsModal'),
                    document.getElementById('bookingsPopupRooms'),
                    document.getElementById('barangayDropdown'),
                    document.getElementById('userDrawer')
                ];
                
                modals.forEach(modal => {
                    if (modal) {
                        if (modal.id === 'userDrawer') {
                            modal.classList.add('translate-x-full'); // User drawer uses transform
                        } else {
                            modal.classList.add('hidden'); // Other modals use hidden
                        }
                    }
                });
                
                // Also hide the drawer overlay if visible
                const overlay = document.getElementById('drawerOverlay');
                if (overlay && !overlay.classList.contains('hidden')) {
                    overlay.classList.add('hidden');
                }
            }
        });
    });

    // Expose the filter function to the global scope
    window.filterLodgesByBarangay = filterLodgesByBarangay;
})();