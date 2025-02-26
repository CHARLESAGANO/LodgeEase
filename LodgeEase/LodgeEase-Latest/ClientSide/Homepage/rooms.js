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

            // Initialize date range picker if the element exists
            const datePickerBtn = document.getElementById('datePickerBtn');
            if (datePickerBtn) {
                initializeDateRangePicker();
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
        console.log('Starting createLodgeCards function...');
        const container = document.querySelector('.lodge-container');
        
        if (!container) {
            console.error('Lodge container not found');
            return;
        }
        
        // Show loading state
        container.innerHTML = `
            <div class="loading-state p-4 text-center">
                <div class="animate-spin h-8 w-8 mx-auto mb-4">
                    <i class="ri-loader-4-line text-2xl text-blue-600"></i>
                </div>
                <p class="text-gray-600">Loading available rooms...</p>
            </div>
        `;

        // Fetch rooms from Firestore
        const fetchRooms = async () => {
            try {
                // Import Firebase modules
                const { collection, getDocs, query, where } = await import('../../AdminSide/firebase.js');
                const { db } = await import('../../AdminSide/firebase.js');

                // Only fetch available rooms
                const roomsRef = collection(db, 'rooms');
                const roomsQuery = query(roomsRef, where('status', '==', 'Available'));
                const roomsSnapshot = await getDocs(roomsQuery);
                
                // Clear loading state
                container.innerHTML = '';

                if (roomsSnapshot.empty) {
                    container.innerHTML = `
                        <div class="no-rooms p-4 text-center">
                            <i class="ri-hotel-bed-line text-4xl text-gray-400 mb-2"></i>
                            <p class="text-gray-600">No rooms available at the moment.</p>
                        </div>
                    `;
                    return;
                }

                const rooms = roomsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                rooms.forEach(lodge => {
                    const card = document.createElement('article');
                    card.className = 'lodge-card';
                    card.style.opacity = '1';
                    card.style.display = 'block';
                    card.dataset.propertyType = lodge.propertyType || 'hotel';
                    card.dataset.barangay = lodge.barangay;
                    
                    card.innerHTML = `
                        <img src="${lodge.image || '../components/default-room.jpg'}" alt="${lodge.name}" class="lodge-image">
                        <button class="favorite-btn" aria-label="Add to favorites">
                            <i class="ri-heart-line"></i>
                        </button>
                        <div class="content">
                            <div class="flex justify-between items-start">
                                <h2>${lodge.name}</h2>
                                <div class="rating">
                                    <i class="ri-star-fill"></i>
                                    <span>${lodge.rating || '0.0'}</span>
                                </div>
                            </div>
                            <div class="location">
                                <i class="ri-map-pin-line"></i>
                                <span>${lodge.location}</span>
                            </div>
                            <div class="amenities">
                                ${(lodge.amenities || []).map(amenity => 
                                    `<span class="amenity-tag">${amenity}</span>`
                                ).join('')}
                            </div>
                            <div class="price">
                                ₱${lodge.price.toLocaleString()}
                                <span>/night</span>
                            </div>
                        </div>
                    `;
                    
                    // Add click event listener to open lodge details
                    card.addEventListener('click', (e) => {
                        if (!e.target.closest('.favorite-btn')) {
                            showLodgeDetails(lodge);
                        }
                    });
                    
                    container.appendChild(card);
                    void card.offsetHeight;
                });

                console.log('All lodge cards created successfully');
                updateResultsCount(rooms.length);

                // Update markers on map if it exists
                if (window.map && window.markers) {
                    addMarkers(rooms);
                }

            } catch (error) {
                console.error('Error fetching rooms:', error);
                container.innerHTML = `
                    <div class="error-state p-4 text-center">
                        <i class="ri-error-warning-line text-4xl text-red-500 mb-2"></i>
                        <p class="text-red-600">Error loading rooms. Please try again later.</p>
                        <button onclick="createLodgeCards()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Retry
                        </button>
                    </div>
                `;
            }
        };

        fetchRooms();
    }

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
        
        content.innerHTML = `
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-2xl font-bold">${lodge.name}</h2>
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
                    <p class="text-green-600 font-bold text-xl">₱${lodge.price} per night</p>
                    
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
                    
                    // Add user marker
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
            zoomControl: true,
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

        directionsRenderer.setMap(map);

        // Add custom controls
        const zoomInButton = document.createElement("button");
        zoomInButton.textContent = "+";
        zoomInButton.className = "custom-map-control";
        zoomInButton.onclick = () => map.setZoom(map.getZoom() + 1);

        const zoomOutButton = document.createElement("button");
        zoomOutButton.textContent = "-";
        zoomOutButton.className = "custom-map-control";
        zoomOutButton.onclick = () => map.setZoom(map.getZoom() - 1);

        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(zoomInButton);
        map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(zoomOutButton);
    }

    function getDirections(destination) {
        if (!userLocation) {
            alert("Please allow location access to get directions");
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
            }
        });

        closeMapBtn?.addEventListener("click", () => {
            mapView.classList.add("hidden");
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
        const priceSlider = document.querySelector('input[type="range"]');
        const maxPrice = priceSlider ? parseInt(priceSlider.value) : Infinity;

        // Get all selected filters
        const selectedFilters = {
            neighborhoods: getSelectedValues('neighborhood'),
            amenities: getSelectedValues('amenity'),
            propertyTypes: getPropertyTypeValues(),
            stayDuration: getSelectedValues('stayDuration')
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

        updateResultsCount(visibleCount);
    }

    function getSelectedValues(selector) {
        return Array.from(document.querySelectorAll(`input[name="${selector}"]:checked`))
            .map(cb => cb.value.toLowerCase());
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

        // Check amenities
        const lodgeAmenities = Array.from(lodge.querySelectorAll('.amenity-tag'))
            .map(tag => tag.textContent.toLowerCase());
        if (filters.amenities.length > 0 && !filters.amenities.every(a => lodgeAmenities.includes(a.toLowerCase()))) {
            return false;
        }

        // Check stay duration (if implemented)
        if (filters.stayDuration.length > 0) {
            // Add your stay duration logic here
            // For now, we'll return true to not affect the filtering
            return true;
        }

        return true;
    }

    function extractPrice(lodge) {
        const priceText = lodge.querySelector('.price')?.textContent || '0';
        return parseInt(priceText.replace(/[^0-9]/g, ''));
    }

    function resetFilters() {
        // Reset price slider
        const priceSlider = document.querySelector('input[type="range"]');
        if (priceSlider) {
            priceSlider.value = priceSlider.max;
        }

        // Reset all checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });

        // Show all lodges
        document.querySelectorAll('.lodge-card').forEach(card => {
            card.style.display = 'block';
        });

        // Update the count
        updateResultsCount(document.querySelectorAll('.lodge-card').length);
    }

    // Update the updateResultsCount function
    function updateResultsCount(visibleCount) {
        const total = document.querySelectorAll('.lodge-card').length;
        const countDisplay = document.querySelector('.lodge-count');
        if (countDisplay) {
            countDisplay.textContent = `Showing ${visibleCount} of ${total} lodges`;
        }
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

    // Date Range Picker
    function initializeDateRangePicker() {
        const datePickerInput = document.getElementById('datePickerBtn');
        if (!datePickerInput) {
            console.warn('Date picker input not found');
            return;
        }
    
        const fp = flatpickr(datePickerInput, {
            mode: "range",
            minDate: "today",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "F j, Y",
            static: true,
            position: "auto",
            disableMobile: true,
            monthSelectorType: "static",
            showMonths: 2,
            inline: false,
            appendTo: document.body,
            onOpen: function() {
                // Add overlay class to body
                document.body.classList.add('datepicker-open');
                datePickerInput.closest('.search-input-group').classList.add('active');
            },
            onClose: function() {
                // Remove overlay class from body
                document.body.classList.remove('datepicker-open');
                datePickerInput.closest('.search-input-group').classList.remove('active');
            },
            onChange: function(selectedDates) {
                if (selectedDates.length === 2) {
                    const [start, end] = selectedDates;
                    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    datePickerInput.value = `${start.toLocaleDateString()} - ${end.toLocaleDateString()} (${nights} nights)`;
                }
            }
        });
    
        // Close other dropdowns when date picker opens
        datePickerInput.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close any other open dropdowns
            document.querySelectorAll('.search-dropdown, #guestsDropdown').forEach(el => {
                el.classList.add('hidden');
            });
        });
    
        return fp;
    }

    function initGuestsDropdown() {
        const guestsDropdownBtn = document.getElementById('guestsDropdownBtn');
        const guestsDropdown = document.getElementById('guestsDropdown');
        const guestsText = document.getElementById('guestsText');
        const applyGuestsBtn = document.getElementById('applyGuests');
        const guestBtns = document.querySelectorAll('.guest-btn');

        if (!guestsDropdownBtn || !guestsDropdown || !guestsText) return;

        const guestState = {
            adults: 1,
            children: 0,
            infants: 0
        };

        function updateGuestsText() {
            const total = guestState.adults + guestState.children;
            let text = `${total} guest${total !== 1 ? 's' : ''}`;
            if (guestState.infants > 0) {
                text += `, ${guestState.infants} infant${guestState.infants !== 1 ? 's' : ''}`;
            }
            guestsText.textContent = text;
        }

        function updateButtonStates() {
            guestBtns.forEach(btn => {
                const type = btn.dataset.type;
                const action = btn.dataset.action;
                
                if (action === 'decrement') {
                    btn.disabled = (type === 'adults' && guestState[type] <= 1) || 
                                 ((type === 'children' || type === 'infants') && guestState[type] <= 0);
                } else if (action === 'increment') {
                    btn.disabled = (type === 'adults' && guestState[type] >= 8) ||
                                 (type === 'children' && guestState[type] >= 6) ||
                                 (type === 'infants' && guestState[type] >= 4);
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

                const type = btn.dataset.type;
                const action = btn.dataset.action;
                
                if (action === 'increment') {
                    guestState[type]++;
                } else if (action === 'decrement') {
                    guestState[type]--;
                }
                
                // Update the count display
                const countElement = document.querySelector(`.guest-count[data-type="${type}"]`);
                if (countElement) {
                    countElement.textContent = guestState[type];
                }
                
                updateButtonStates();
                updateGuestsText();
            });
        });

        // Toggle dropdown
        guestsDropdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const buttonRect = guestsDropdownBtn.getBoundingClientRect();
            guestsDropdown.style.position = 'fixed';
            guestsDropdown.style.top = `${buttonRect.bottom + window.scrollY + 4}px`;
            guestsDropdown.style.left = `${buttonRect.left}px`;
            guestsDropdown.style.width = `${buttonRect.width}px`;
            guestsDropdown.style.zIndex = '10000';
            
            guestsDropdown.classList.toggle('hidden');
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
})();