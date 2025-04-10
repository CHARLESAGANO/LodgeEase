// Use an IIFE to avoid global namespace pollution
(function() {
    // Make these functions globally available for the info window buttons
    window.getDirectionsCallback = null;
    window.clearDirectionsCallback = null;

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
    document.addEventListener('DOMContentLoaded', () => {
        try {
            console.log('DOM loaded, initializing functionality...');
            initializeAllFunctionality();
            
            // Initialize auth state monitoring
            import('../../AdminSide/firebase.js').then(({ auth }) => {
                auth.onAuthStateChanged((user) => {
                    updateLoginButtonVisibility(user);
                });
            });
            
            // Create lodge cards immediately after initialization
            console.log('Creating lodge cards after initialization...');
            createLodgeCards();
            
            // Initialize user drawer
            import('../../AdminSide/firebase.js').then(({ auth, db }) => {
                import('../components/userDrawer.js').then(({ initializeUserDrawer }) => {
                    initializeUserDrawer(auth, db);
                });
            });

            // Initialize navigation
            initializeNavigation();

            // Remove this line
            // initializeCheckInPopup();

            // Initialize the check-in date filter
            initializeCheckInDateFilter();
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    });

    function initializeAllFunctionality() {
        try {
            console.log('Starting initialization of all functionality...');
            
            // Initialize map view if the map container exists
            if (document.getElementById('map')) {
                initMapView();
            }

            // Initialize guests dropdown if the element exists
            const guestsDropdownBtn = document.getElementById('guestsDropdownBtn');
            if (guestsDropdownBtn) {
                initGuestsDropdown();
            }

            // Initialize barangay dropdown
            initializeBarangayDropdown();

            // Initialize other components
            initializeSearch();
            initializeFilters();
            initializeSort();
            
            console.log('Creating lodge cards from initializeAllFunctionality...');
            createLodgeCards();

            // Add lodge modal
            addLodgeModalToDOM();
            
            console.log('All functionality initialized successfully');
        } catch (error) {
            console.error('Error initializing functionality:', error);
        }
    }

    function createLodgeCards() {
        const container = document.querySelector('.lodge-container');
        if (!container) return;
    
        container.innerHTML = '';
        
        lodgeData.forEach((lodge, index) => {
            const card = document.createElement('article');
            card.className = 'lodge-card opacity-0';
            card.style.animationDelay = `${index * 100}ms`;
            card.style.animation = 'scaleIn 0.5s ease forwards';
            card.dataset.propertyType = lodge.propertyType || 'hotel';
            card.dataset.lodgeId = lodge.id;
            card.dataset.barangay = lodge.barangay;
    
            
            const isEverLodge = lodge.id === 13;
            
            
            const bestValueBadge = isEverLodge ? 
                `<div class="best-value-badge"></div>` : '';
    
            
            const promoTag = lodge.promoPrice ? 
                `<div class="promo-tag">
                    <span class="promo-tag-label">NIGHT PROMO</span>
                    <span class="promo-tag-price">₱${lodge.promoPrice}</span>
                 </div>` : '';
    
            card.innerHTML = `
                <div class="relative overflow-hidden">
                    ${bestValueBadge}
                    ${promoTag}
                    <img src="${lodge.image}" alt="${lodge.name}" class="lodge-image w-full h-48 object-cover">
                    <button class="favorite-btn">
                        <i class="ri-heart-line"></i>
                    </button>
                </div>
                <div class="content p-4">
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
            amenities: ["City View", "WiFi", "Kitchen"],
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
    
        if (!barangayDropdownBtn || !barangayDropdown || !barangayList) {
            console.error('Barangay dropdown elements not found');
            return;
        }
    
        // Clear and populate the list
        barangayList.innerHTML = '';
        
        // Add "All Barangays" option
        const allBarangaysBtn = document.createElement('button');
        allBarangaysBtn.className = 'w-full text-left px-4 py-2 hover:bg-gray-100';
        allBarangaysBtn.textContent = 'All Barangays';
        allBarangaysBtn.addEventListener('click', () => {
            barangayText.textContent = 'All Barangays';
            barangayDropdown.classList.add('hidden');
            filterLodgesByBarangay('All Barangays');
        });
        barangayList.appendChild(allBarangaysBtn);
    
        // Add separator
        const separator = document.createElement('div');
        separator.className = 'border-t border-gray-200 my-2';
        barangayList.appendChild(separator);
    
        // Add barangay options
        barangays.forEach(barangay => {
            const button = document.createElement('button');
            button.className = 'w-full text-left px-4 py-2 hover:bg-gray-100';
            button.textContent = barangay;
            button.addEventListener('click', () => {
                barangayText.textContent = barangay;
                barangayDropdown.classList.add('hidden');
                filterLodgesByBarangay(barangay);
            });
            barangayList.appendChild(button);
        });
    
        // Toggle dropdown
        barangayDropdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Position the dropdown below the button
            const buttonRect = barangayDropdownBtn.getBoundingClientRect();
            barangayDropdown.style.top = `${buttonRect.bottom + window.scrollY + 4}px`;
            barangayDropdown.style.left = `${buttonRect.left}px`;
            barangayDropdown.style.width = `${buttonRect.width}px`;
            
            barangayDropdown.classList.toggle('hidden');
        });
    
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!barangayDropdown.contains(e.target) && !barangayDropdownBtn.contains(e.target)) {
                barangayDropdown.classList.add('hidden');
            }
        });
    }

    // Filter lodges by barangay
    function filterLodgesByBarangay(barangay) {
        const container = document.querySelector('.lodge-container');
        if (!container) return;

        const cards = container.querySelectorAll('.lodge-card');
        let visibleCount = 0;

        cards.forEach(card => {
            if (barangay === 'All Barangays' || card.dataset.barangay === barangay) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Update results count
        const resultsCount = document.querySelector('.lodge-count');
        if (resultsCount) {
            resultsCount.textContent = `Showing ${visibleCount} of ${cards.length} lodges`;
        }

        // Update map markers if map is visible
        if (!document.getElementById('mapView').classList.contains('hidden')) {
            updateMapMarkers(barangay);
        }
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
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            resultsCount.textContent = `${count} lodges available`;
        }
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
        document.getElementById('lodgeDetailsModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'lodgeDetailsModal') {
                e.target.classList.add('hidden');
            }
        });
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
                <button class="text-gray-500 hover:text-gray-700" onclick="document.getElementById('lodgeDetailsModal').classList.add('hidden')">
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
        
        modal.classList.remove('hidden');
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

    // Ensure map initialization only happens after Google Maps API is loaded
    function initializeMap() {
        if (typeof google === 'undefined') {
            setTimeout(initializeMap, 100);
            return;
        }
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
            if (!map) {
                initializeMap();
            } else {
                // If map already exists, trigger a resize to fix any display issues
                google.maps.event.trigger(map, 'resize');
                // Re-initialize markers that might be hidden
                updateMapMarkers('All Barangays');
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
    
        updateResultsCount(visibleCount);
    }
    
    function resetFilters() {
        // Reset price slider
        const priceSlider = document.querySelector('input[type="range"]');
        if (priceSlider) {
            priceSlider.value = priceSlider.max;
            const priceDisplay = document.querySelector('.price-display');
            if (priceDisplay) {
                priceDisplay.textContent = `₱${priceSlider.max.toLocaleString()}`;
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
        updateResultsCount(document.querySelectorAll('.lodge-card').length);
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

        // Check stay duration
        if (filters.stayDuration.length > 0) {
            const hasLongTerm = lodgeAmenities.some(amenity => 
                amenity.includes('long term') || amenity.includes('dorm'));
            if (!hasLongTerm && filters.stayDuration.includes('long term/dorms')) {
                return false;
            }
            if (hasLongTerm && filters.stayDuration.includes('short term')) {
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
        const sortSelect = document.querySelector('select');
        if (!sortSelect) return;

        sortSelect.addEventListener('change', () => {
            const lodges = Array.from(document.querySelectorAll('.lodge-card'));
            const container = lodges[0]?.parentNode;
            if (!container) return;

            lodges.sort((a, b) => {
                const priceA = parseInt(a.querySelector('.text-green-600')?.textContent.replace(/[^0-9]/g, '') || '0');
                const priceB = parseInt(b.querySelector('.text-green-600')?.textContent.replace(/[^0-9]/g, '') || '0');

                switch (sortSelect.value) {
                    case 'Price: Low to High':
                        return priceA - priceB;
                    case 'Price: High to Low':
                        return priceB - priceA;
                    default:
                        return 0;
                }
            });

            lodges.forEach(lodge => container.appendChild(lodge));
        });
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
    
        // Initialize flatpickr with specific positioning
        const fp = flatpickr(checkInDropdownBtn, {
            inline: false,
            minDate: "today",
            dateFormat: "Y-m-d",
            onChange: (selectedDates, dateStr) => {
                if (selectedDates.length > 0) {
                    checkInText.textContent = dateStr;
                    checkInText.classList.remove('text-gray-500');
                }
            },
            appendTo: checkInDropdownBtn.parentElement, // Attach to parent element
            static: true, // Prevent positioning issues
            position: "below", // Force position below
        });
    
        // Toggle calendar visibility
        checkInDropdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fp.open();
        });
    
        // Close calendar when clicking outside
        document.addEventListener('click', (e) => {
            if (!checkInDropdownBtn.contains(e.target)) {
                fp.close();
            }
        });
    }
})();