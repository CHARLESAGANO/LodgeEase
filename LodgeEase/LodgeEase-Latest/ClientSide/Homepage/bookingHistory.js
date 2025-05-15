/**
 * Booking History Module for LodgeEase Homepage
 * This module handles fetching and displaying booking history in the homepage's bookings modal
 */
// Instead of import, use the globally available firebase
// import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Loads booking history for a user and displays it in the specified container
 * @param {string} userId - The user's ID
 * @param {object} db - The Firestore database instance
 * @param {string} [containerId='bookingHistoryContainer'] - Optional container ID
 * @returns {Promise<void>}
 */
// Changed from export to regular function
async function loadBookingHistory(userId, db, containerId = 'bookingHistoryContainer') {
    try {
        console.log(`Loading booking history for user: ${userId} into container: ${containerId}`);
        const bookingHistoryContainer = document.getElementById(containerId);
        if (!bookingHistoryContainer) {
            console.error(`Booking history container not found: ${containerId}`);
            return;
        }

        // Show loading state
        bookingHistoryContainer.innerHTML = `
            <div class="flex items-center justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span class="ml-2">Loading your booking history...</span>
            </div>
        `;
        
        // Validate database instance - now with more thorough checks
        if (!db) {
            console.error('Firestore database instance is null or undefined');
            bookingHistoryContainer.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>Unable to connect to database - database is undefined.</p>
                    <p class="text-sm text-gray-500 mt-2">Please try again later or contact support.</p>
                </div>
            `;
            return;
        }
        
        if (typeof db !== 'object') {
            console.error(`Firestore database instance is not an object, got ${typeof db}`);
            bookingHistoryContainer.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>Database connection error: Invalid database type.</p>
                    <p class="text-sm text-gray-500 mt-2">Please try again later or contact support.</p>
                </div>
            `;
            return;
        }
        
        if (typeof db.collection !== 'function') {
            console.error('Firestore database instance not valid - missing collection method');
            
            // Try to get a better database instance
            let alternateDb = null;
            try {
                // Check for global instances
                if (window.firebaseAppDb && typeof window.firebaseAppDb.collection === 'function') {
                    console.log('Found alternate db instance from window.firebaseAppDb');
                    alternateDb = window.firebaseAppDb;
                } else if (window.firebase && window.firebase.firestore) {
                    console.log('Found alternate db instance from window.firebase.firestore()');
                    alternateDb = window.firebase.firestore();
                }
            } catch (e) {
                console.error('Error trying to get alternate db instance:', e);
            }
            
            if (alternateDb) {
                console.log('Using alternate database instance');
                db = alternateDb;
            } else {
                bookingHistoryContainer.innerHTML = `
                    <div class="text-center text-red-500 py-8">
                        <p>Database connection error: Missing required methods.</p>
                        <p class="text-sm text-gray-500 mt-2">Please try again later or contact support.</p>
                    </div>
                `;
                return;
            }
        }

        try {
            // Use the Firestore instance methods directly
            const bookingsRef = db.collection('bookings');
            // Simple query without orderBy to avoid requiring a composite index
            const q = bookingsRef.where('userId', '==', userId);
            let querySnapshot = await q.get();
            
            // If no bookings found, try an alternative collection
            if (querySnapshot.empty) {
                console.log('No bookings found in primary collection, trying reservations');
                const reservationsRef = db.collection('reservations');
                const reservationsQuery = reservationsRef.where('userId', '==', userId);
                querySnapshot = await reservationsQuery.get();
            }
            
            if (querySnapshot.empty) {
                bookingHistoryContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-calendar-times text-2xl mb-2"></i>
                        <p>No booking history found</p>
                    </div>
                `;
                return;
            }

            const bookings = querySnapshot.docs.map(doc => {
                const data = doc.data();
                console.log(`Raw booking data for ID ${doc.id}:`, data);
                
                // Enhanced logging to identify all possible date fields
                const possibleDateFields = [
                    'checkIn', 'checkOut', 'checkInDate', 'checkOutDate',
                    'startDate', 'endDate', 'arrivalDate', 'departureDate',
                    'dateFrom', 'dateTo', 'date_from', 'date_to',
                    'arrival', 'departure', 'bookingDate', 'reservationDate'
                ];
                
                console.log('Checking for date fields in booking:', doc.id);
                possibleDateFields.forEach(field => {
                    if (data[field]) {
                        console.log(`Found date field "${field}":`, data[field]);
                    } else if (data.booking && data.booking[field]) {
                        console.log(`Found date field in booking.${field}:`, data.booking[field]);
                    } else if (data.reservation && data.reservation[field]) {
                        console.log(`Found date field in reservation.${field}:`, data.reservation[field]);
                    }
                });
                
                return {
                    id: doc.id,
                    ...data
                };
            });
            
            // Try to enhance booking data with lodge details if needed
            try {
                const enhancedBookings = await enhanceBookingsWithLodgeDetails(bookings, db);
                displayBookingHistory(enhancedBookings);
            } catch (error) {
                console.error('Error enhancing bookings with lodge details:', error);
                // Fall back to displaying the bookings without enhancement
                displayBookingHistory(bookings);
            }
            
            // Function to display booking history
            async function displayBookingHistory(bookings) {
                try {
                    // Get the current date for comparison
                    const now = new Date();
                    
                    // Filter bookings into different categories
                    const currentBookings = [];
                    const previousBookings = [];
                    const historyBookings = [];
                    
                    // Process each booking
                    bookings.forEach(booking => {
                        // Determine if it's current, past, or cancelled
                        const checkInDate = findDateInObject(booking, ['checkIn', 'checkInDate', 'startDate', 'dateFrom', 'date_from', 'arrivalDate', 'arrival']);
                        const checkOutDate = findDateInObject(booking, ['checkOut', 'checkOutDate', 'endDate', 'dateTo', 'date_to', 'departureDate', 'departure']);
                        
                        console.log(`Processing booking ${booking.id}:`, {
                            checkInDate: checkInDate ? checkInDate.toDate?.() || checkInDate : null,
                            checkOutDate: checkOutDate ? checkOutDate.toDate?.() || checkOutDate : null
                        });
                        
                        // Convert to Date objects if they are Firestore timestamps
                        let checkOut;
                        if (checkOutDate) {
                            if (typeof checkOutDate.toDate === 'function') {
                                checkOut = checkOutDate.toDate();
                            } else {
                                checkOut = new Date(checkOutDate);
                            }
                        }
                        
                        // Check if booking is cancelled
                        const isCancelled = booking.status === 'cancelled' || booking.isCancelled || booking.cancelled;
                        
                        if (isCancelled) {
                            // Add to cancelled bookings
                            historyBookings.push(booking);
                        } else if (checkOut && checkOut > now) {
                            // If checkout date is in the future, it's a current booking
                            currentBookings.push(booking);
                        } else {
                            // If no check-out date, put in history
                            historyBookings.push(booking);
                        }
                    });
                    
                    console.log('Current bookings:', currentBookings.length);
                    console.log('Previous bookings:', previousBookings.length);
                    console.log('History bookings:', historyBookings.length);
                    
                    // For now, just render all bookings in the container
                    renderBookingsList(bookingHistoryContainer, containerId.includes('current') ? currentBookings : 
                                       containerId.includes('previous') ? previousBookings : historyBookings);
                    
                } catch (error) {
                    console.error('Error displaying booking history:', error);
                    bookingHistoryContainer.innerHTML = `
                        <div class="text-center text-red-500 py-8">
                            <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                            <p>Error displaying booking history. Please try again later.</p>
                            <p class="text-sm text-gray-600 mt-2">${error.message}</p>
                        </div>
                    `;
                }
            }
            
        } catch (error) {
            console.error('Error querying bookings:', error);
            
            // Provide more specific error message based on the error
            let errorMessage = 'Unable to fetch your booking history.';
            if (error.code === 'permission-denied') {
                errorMessage = 'You do not have permission to view these bookings.';
            } else if (error.message.includes('index')) {
                errorMessage = 'Database query error: missing index.';
            }
            
            bookingHistoryContainer.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>${errorMessage}</p>
                    <p class="text-sm text-gray-500 mt-2">Please try again later or contact support.</p>
                    <p class="text-xs text-gray-400 mt-1">${error.message}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Unexpected error in loadBookingHistory:', error);
        
        // Try to get the container even if there was an error
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>An unexpected error occurred</p>
                    <p class="text-sm text-gray-500 mt-2">Please try again later or contact support.</p>
                </div>
            `;
        }
    }
}

/**
 * Helper function to format booking dates
 * @param {*} dateInput - Date input in various formats
 * @returns {string} Formatted date string
 */
function formatBookingDate(dateValue) {
    if (!dateValue) {
        console.log('No date value provided to formatBookingDate');
        return 'N/A';
    }
    
    console.log('Formatting date value:', dateValue, 'Type:', typeof dateValue);
    
    try {
        let dateObj;
        
        // Handle different date formats
        if (typeof dateValue === 'object') {
            // Handle Firebase Timestamp objects
            if (dateValue.seconds !== undefined && dateValue.nanoseconds !== undefined) {
                console.log('Handling Firebase Timestamp with seconds:', dateValue.seconds);
                dateObj = new Date(dateValue.seconds * 1000);
            }
            // Handle Firebase server timestamp object
            else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
                console.log('Handling Firebase Timestamp with toDate method');
                dateObj = dateValue.toDate();
            }
            // Handle Date objects
            else if (dateValue instanceof Date) {
                console.log('Handling regular Date object');
                dateObj = dateValue;
            }
            // Handle object with custom date fields
            else if (dateValue.date || dateValue.day) {
                const dateStr = dateValue.date || dateValue.day;
                const monthStr = dateValue.month;
                const yearStr = dateValue.year;
                
                if (dateStr && monthStr && yearStr) {
                    console.log('Handling object with date parts:', dateStr, monthStr, yearStr);
                    dateObj = new Date(yearStr, monthStr - 1, dateStr);
                }
            }
        }
        // Handle string dates
        else if (typeof dateValue === 'string') {
            console.log('Handling string date:', dateValue);
            
            // Try different date formats
            const formats = [
                // Try direct parsing first
                () => new Date(dateValue),
                
                // Try MM/DD/YYYY or MM-DD-YYYY
                () => {
                    const parts = dateValue.split(/[\/\-\.]/);
                    if (parts.length === 3) {
                        return new Date(parts[2], parts[0] - 1, parts[1]);
                    }
                    return null;
                },
                
                // Try DD/MM/YYYY or DD-MM-YYYY
                () => {
                    const parts = dateValue.split(/[\/\-\.]/);
                    if (parts.length === 3) {
                        return new Date(parts[2], parts[1] - 1, parts[0]);
                    }
                    return null;
                },
                
                // Try YYYY/MM/DD or YYYY-MM-DD
                () => {
                    const parts = dateValue.split(/[\/\-\.]/);
                    if (parts.length === 3) {
                        return new Date(parts[0], parts[1] - 1, parts[2]);
                    }
                    return null;
                }
            ];
            
            // Try each format until we get a valid date
            for (const formatFn of formats) {
                const attemptedDate = formatFn();
                if (attemptedDate && !isNaN(attemptedDate.getTime())) {
                    dateObj = attemptedDate;
                    break;
                }
            }
        }
        // Handle numeric timestamps (milliseconds since epoch)
        else if (typeof dateValue === 'number') {
            console.log('Handling numeric timestamp:', dateValue);
            dateObj = new Date(dateValue);
        }
        
        // Check if we have a valid date
        if (dateObj && !isNaN(dateObj.getTime())) {
            console.log('Successfully created Date object:', dateObj);
            // Format date as MM/DD/YYYY
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const year = dateObj.getFullYear();
            return `${month}/${day}/${year}`;
        } else {
            console.log('Failed to create valid Date object from:', dateValue);
            return 'N/A';
        }
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'N/A';
    }
}

/**
 * Helper function to get status class for styling
 * @param {string} status - Booking status
 * @returns {string} CSS class for the status
 */
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

/**
 * Navigate to booking details page or show details modal
 * 
 * @param {string} bookingId - The ID of the booking
 * @param {string} collection - The collection the booking is from
 */
function viewBookingDetails(bookingId, collection = 'bookings') {
    console.log(`Viewing booking ${bookingId} from ${collection || 'bookings'} collection`);
    
    // Determine the correct URL for the details page
    const dashboardPath = '../Dashboard/Dashboard.html';
    
    // Always use a safe URL encoding for parameters
    const detailsUrl = `${dashboardPath}?bookingId=${encodeURIComponent(bookingId)}&collection=${encodeURIComponent(collection || 'bookings')}`;
    
    // Redirect to the details page
    window.location.href = detailsUrl;
}

/**
 * Helper function to look for date fields in deeply nested objects
 * @param {Object} obj - The object to search
 * @param {Array<string>} fieldNames - Array of possible field names to search for
 * @param {number} depth - Maximum depth to search (prevents infinite recursion)
 * @returns {*} - The found date value or null
 */
function findDateInObject(obj, fieldNames, depth = 3) {
    if (!obj || typeof obj !== 'object' || depth <= 0) {
        return null;
    }
    
    // First check direct properties
    for (const fieldName of fieldNames) {
        if (obj[fieldName] !== undefined) {
            console.log(`Found date field '${fieldName}' at depth ${3 - depth}`);
            return obj[fieldName];
        }
    }
    
    // Then search in nested objects
    for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            const result = findDateInObject(obj[key], fieldNames, depth - 1);
            if (result) {
                return result;
            }
        }
    }
    
    return null;
}

/**
 * Fetch additional lodge details for bookings with incomplete information
 * @param {Array} bookings - The array of booking objects
 * @param {Object} db - Firestore database instance
 */
async function enhanceBookingsWithLodgeDetails(bookings, db) {
    console.log('Enhancing bookings with lodge details:', bookings);
    
    if (!bookings || !bookings.length) {
        console.log('No bookings to enhance');
        return bookings;
    }
    
    const checkInFields = ['checkIn', 'checkInDate', 'startDate', 'dateFrom', 'date_from', 'arrivalDate', 'arrival'];
    const checkOutFields = ['checkOut', 'checkOutDate', 'endDate', 'dateTo', 'date_to', 'departureDate', 'departure'];
    
    // Filter bookings that need enhancement
    const bookingsToEnhance = bookings.filter(booking => {
        // Check if we already have all the required information
        const hasLodgeName = booking.propertyDetails?.name || 
                           booking.lodgeName || 
                           booking.propertyName;
        
        // Check for date information using our deep search function
        const hasCheckIn = findDateInObject(booking, checkInFields);
        const hasCheckOut = findDateInObject(booking, checkOutFields);
        
        console.log(`Booking ${booking.id || booking.bookingId} has lodge name: ${Boolean(hasLodgeName)}, check-in: ${Boolean(hasCheckIn)}, check-out: ${Boolean(hasCheckOut)}`);
        
        // Return true for bookings that need enhancement
        return !hasLodgeName || !hasCheckIn || !hasCheckOut;
    });
    
    console.log(`Found ${bookingsToEnhance.length} bookings that need enhancement`);
    
    // If no bookings need enhancement, return the original list
    if (bookingsToEnhance.length === 0) {
        return bookings;
    }
    
    try {
        // Process each incomplete booking
        for (const booking of bookingsToEnhance) {
            try {
                // Try to get lodgeId from various fields
                const lodgeId = booking.lodgeId || 
                              booking.propertyId || 
                              booking.property_id || 
                              (booking.propertyDetails ? booking.propertyDetails.id : null);
                
                if (lodgeId) {
                    console.log(`Attempting to fetch lodge details for booking ${booking.id || booking.bookingId} with lodge ID: ${lodgeId}`);
                    
                    // First query the "properties" collection
                    const lodgeDoc = await db.collection('properties').doc(lodgeId).get();
                    
                    if (lodgeDoc.exists) {
                        const lodgeData = lodgeDoc.data();
                        console.log(`Found lodge data:`, lodgeData);
                        
                        // Update booking with lodge details
                        booking.propertyDetails = booking.propertyDetails || {};
                        booking.propertyDetails.name = lodgeData.name || lodgeData.propertyName;
                        booking.propertyDetails.id = lodgeId;
                        booking.lodgeName = lodgeData.name || lodgeData.propertyName;
                    } else {
                        console.log(`No lodge found with ID ${lodgeId} in properties collection, trying lodges collection`);
                        
                        // Try the "lodges" collection as a fallback
                        const altLodgeDoc = await db.collection('lodges').doc(lodgeId).get();
                        
                        if (altLodgeDoc.exists) {
                            const lodgeData = altLodgeDoc.data();
                            console.log(`Found lodge data in lodges collection:`, lodgeData);
                            
                            // Update booking with lodge details
                            booking.propertyDetails = booking.propertyDetails || {};
                            booking.propertyDetails.name = lodgeData.name || lodgeData.propertyName;
                            booking.propertyDetails.id = lodgeId;
                            booking.lodgeName = lodgeData.name || lodgeData.propertyName;
                        } else {
                            console.log(`No lodge found for ID ${lodgeId} in any collection`);
                        }
                    }
                } else {
                    console.log(`Cannot fetch lodge details for booking ${booking.id || booking.bookingId} - no lodge ID found`);
                }
                
                // Attempt to find missing dates from reservations collection
                const bookingId = booking.id || booking.bookingId;
                if (bookingId && (!findDateInObject(booking, checkInFields) || !findDateInObject(booking, checkOutFields))) {
                    console.log(`Searching for dates in reservations collection for booking ID: ${bookingId}`);
                    
                    // Try to find reservation data for this booking
                    const reservationQuery = await db.collection('reservations')
                        .where('bookingId', '==', bookingId)
                        .limit(1)
                        .get();
                    
                    if (!reservationQuery.empty) {
                        const reservationData = reservationQuery.docs[0].data();
                        console.log(`Found reservation data:`, reservationData);
                        
                        // Look for check-in and check-out dates
                        const resCheckIn = findDateInObject(reservationData, checkInFields);
                        const resCheckOut = findDateInObject(reservationData, checkOutFields);
                        
                        if (resCheckIn) {
                            booking.checkIn = resCheckIn;
                            console.log(`Updated booking with check-in date from reservation: ${resCheckIn}`);
                        }
                        
                        if (resCheckOut) {
                            booking.checkOut = resCheckOut;
                            console.log(`Updated booking with check-out date from reservation: ${resCheckOut}`);
                        }
                    } else {
                        console.log(`No reservation found for booking ID ${bookingId}`);
                    }
                }
            } catch (error) {
                console.error(`Error enhancing booking ${booking.id || booking.bookingId}:`, error);
            }
        }
        
        console.log('Finished enhancing bookings:', bookings);
        return bookings;
    } catch (error) {
        console.error('Error enhancing bookings:', error);
        return bookings;
    }
}

/**
 * Helper function to render a list of bookings in a container
 * @param {HTMLElement} container - The container to render bookings in
 * @param {Array} bookings - The array of bookings to display
 */
function renderBookingsList(container, bookings) {
    if (!container) {
        console.error('Cannot render bookings - container is null or undefined');
        return;
    }
    
    // Clear the container first
    container.innerHTML = '';
    
    // If no bookings, show empty state
    if (!bookings || bookings.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-calendar-times text-2xl mb-2"></i>
                <p>No bookings found</p>
            </div>
        `;
        return;
    }
    
    // Create a wrapper for the bookings
    const bookingsWrapper = document.createElement('div');
    bookingsWrapper.className = 'space-y-4';
    
    // Sort bookings by date (most recent first)
    const sortedBookings = [...bookings].sort((a, b) => {
        // Get check-in dates for comparison
        const checkInA = findDateInObject(a, ['checkIn', 'checkInDate', 'startDate', 'dateFrom', 'date_from', 'arrivalDate', 'arrival']) || {};
        const checkInB = findDateInObject(b, ['checkIn', 'checkInDate', 'startDate', 'dateFrom', 'date_from', 'arrivalDate', 'arrival']) || {};
        
        // Convert to timestamps for comparison, handling both Firestore timestamps and regular dates
        const timeA = checkInA.seconds ? checkInA.seconds * 1000 : checkInA.getTime ? checkInA.getTime() : 0;
        const timeB = checkInB.seconds ? checkInB.seconds * 1000 : checkInB.getTime ? checkInB.getTime() : 0;
        
        // Sort descending (newest first)
        return timeB - timeA;
    });
    
    // Render each booking
    sortedBookings.forEach(booking => {
        // Get lodge name with fallbacks
        const lodgeName = booking.propertyDetails?.name || 
                          booking.lodgeName || 
                          booking.propertyName || 
                          booking.roomDetails?.propertyName ||
                          'Reservation';
        
        // Get check-in and check-out dates with fallbacks
        const checkInDate = findDateInObject(booking, ['checkIn', 'checkInDate', 'startDate', 'dateFrom', 'date_from', 'arrivalDate', 'arrival']);
        const checkOutDate = findDateInObject(booking, ['checkOut', 'checkOutDate', 'endDate', 'dateTo', 'date_to', 'departureDate', 'departure']);
        
        // Format dates - convert from Firestore timestamp if needed
        const formatDate = (date) => {
            if (!date) return 'Not specified';
            
            try {
                if (typeof date.toDate === 'function') {
                    // Firestore timestamp
                    return date.toDate().toLocaleDateString();
                } else if (date instanceof Date) {
                    return date.toLocaleDateString();
                } else if (typeof date === 'string') {
                    return new Date(date).toLocaleDateString();
                } else if (typeof date === 'number') {
                    return new Date(date).toLocaleDateString();
                }
                return 'Invalid date';
            } catch (e) {
                console.error('Error formatting date:', e);
                return 'Date error';
            }
        };
        
        // Get status with fallbacks
        const status = booking.status || 'pending';
        
        // Get appropriate status class
        const getStatusClass = (status) => {
            const statusLower = String(status).toLowerCase();
            if (statusLower.includes('confirm') || statusLower === 'active') {
                return 'bg-green-100 text-green-800';
            } else if (statusLower.includes('pend')) {
                return 'bg-yellow-100 text-yellow-800';
            } else if (statusLower.includes('cancel')) {
                return 'bg-red-100 text-red-800';
            } else if (statusLower.includes('complet')) {
                return 'bg-blue-100 text-blue-800';
            }
            return 'bg-gray-100 text-gray-800';
        };
        
        // Create booking card
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-all';
        
        // Format price with fallbacks
        const price = booking.totalPrice || booking.price || booking.amount || booking.total || 0;
        const formattedPrice = typeof price === 'number' ? 
                              `₱${price.toLocaleString()}` : 
                              typeof price === 'string' ? price : '₱0';
        
        // Booking summary
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-semibold text-gray-900">${lodgeName}</h3>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(status)}">
                    ${status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
            </div>
            <div class="flex items-center text-sm text-gray-600 space-x-2 mb-2">
                <i class="ri-calendar-line"></i>
                <span>${formatDate(checkInDate)} → ${formatDate(checkOutDate)}</span>
            </div>
            <div class="flex justify-between items-center mt-2">
                <span class="font-medium">${formattedPrice}</span>
                <button class="text-blue-600 hover:text-blue-800 text-sm font-medium view-details-btn" 
                        data-booking-id="${booking.id || booking.bookingId}" 
                        data-collection="${booking.collectionSource || 'bookings'}">
                    View Details
                </button>
            </div>
        `;
        
        // Add the card to the wrapper
        bookingsWrapper.appendChild(card);
    });
    
    // Add the wrapper to the container
    container.appendChild(bookingsWrapper);
    
    // Add event listeners to details buttons
    const detailsButtons = container.querySelectorAll('.view-details-btn');
    detailsButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const bookingId = this.getAttribute('data-booking-id');
            const collection = this.getAttribute('data-collection');
            viewBookingDetails(bookingId, collection);
        });
    });
}

// Make loadBookingHistory available globally for access from rooms.js
if (!window.loadBookingHistory) {
    window.loadBookingHistory = loadBookingHistory; 
}

// Function to display booking history
async function displayBookingHistory(bookings) {
    const currentBookingsContainer = document.getElementById('currentBookings');
    const previousBookingsContainer = document.getElementById('previousBookings');
    const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
    
    if (!currentBookingsContainer || !previousBookingsContainer || !bookingHistoryContainer) {
        console.error('Booking containers not found');
        return;
    }
    
    console.log('Original bookings before enhancement:', bookings);
    
    try {
        // Enhance bookings with more detailed information
        const enhancedBookings = await enhanceBookingsWithLodgeDetails(bookings);
        console.log('Enhanced bookings:', enhancedBookings);
        
        // Clear previous content
        currentBookingsContainer.innerHTML = '';
        previousBookingsContainer.innerHTML = '';
        bookingHistoryContainer.innerHTML = '';
        
        if (enhancedBookings && enhancedBookings.length > 0) {
            // Categorize bookings by status (current, previous, history)
            const now = new Date();
            const currentBookings = [];
            const previousBookings = [];
            const historyBookings = [];
            
            enhancedBookings.forEach(booking => {
                // Determine checkOut date
                let checkOutDate = null;
                const checkOutFields = ['checkOut', 'checkOutDate', 'endDate', 'dateTo', 'date_to', 'departureDate', 'departure'];
                checkOutDate = findDateInObject(booking, checkOutFields);
                
                // Convert to Date object for comparison
                let checkOutObj = null;
                
                if (checkOutDate) {
                    if (typeof checkOutDate === 'object' && checkOutDate.seconds) {
                        // Firebase Timestamp
                        checkOutObj = new Date(checkOutDate.seconds * 1000);
                    } else if (checkOutDate instanceof Date) {
                        checkOutObj = checkOutDate;
                    } else if (typeof checkOutDate === 'string') {
                        checkOutObj = new Date(checkOutDate);
                    }
                }
                
                // Determine booking status based on dates
                if (checkOutObj) {
                    // If check-out date is in the future, it's a current booking
                    if (checkOutObj > now) {
                        currentBookings.push(booking);
                    } 
                    // If check-out date is within the last 30 days, it's a previous booking
                    else {
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(now.getDate() - 30);
                        
                        if (checkOutObj > thirtyDaysAgo) {
                            previousBookings.push(booking);
                        } else {
                            historyBookings.push(booking);
                        }
                    }
                } else {
                    // If no check-out date, put in history
                    historyBookings.push(booking);
                }
            });
            
            console.log('Current bookings:', currentBookings.length);
            console.log('Previous bookings:', previousBookings.length);
            console.log('History bookings:', historyBookings.length);
            
            // Render each category
            if (currentBookings.length > 0) {
                renderBookingsList(currentBookingsContainer, currentBookings);
            } else {
                currentBookingsContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-calendar-times text-2xl mb-2"></i>
                        <p>No current bookings found.</p>
                    </div>
                `;
            }
            
            if (previousBookings.length > 0) {
                renderBookingsList(previousBookingsContainer, previousBookings);
            } else {
                previousBookingsContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-calendar-times text-2xl mb-2"></i>
                        <p>No recent bookings found.</p>
                    </div>
                `;
            }
            
            if (historyBookings.length > 0) {
                renderBookingsList(bookingHistoryContainer, historyBookings);
            } else {
                bookingHistoryContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-calendar-times text-2xl mb-2"></i>
                        <p>No booking history found.</p>
                    </div>
                `;
            }
        } else {
            // No bookings found at all
            const emptyMessage = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-calendar-times text-2xl mb-2"></i>
                    <p>No booking history found.</p>
                </div>
            `;
            
            currentBookingsContainer.innerHTML = emptyMessage;
            previousBookingsContainer.innerHTML = emptyMessage;
            bookingHistoryContainer.innerHTML = emptyMessage;
        }
    } catch (error) {
        console.error('Error displaying booking history:', error);
        const errorMessage = `
            <div class="text-center text-red-500 py-8">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error displaying booking history. Please try again later.</p>
            </div>
        `;
        
        currentBookingsContainer.innerHTML = errorMessage;
        previousBookingsContainer.innerHTML = errorMessage;
        bookingHistoryContainer.innerHTML = errorMessage;
    }
}

// Function to fetch booking history data from Firebase
async function fetchBookingHistory() {
    try {
        console.log('Fetching booking history...');
        // Get current user
        const user = firebase.auth().currentUser;
        if (!user) {
            console.error('No user is signed in');
            return [];
        }
        
        console.log('Current user:', user.uid);
        const db = firebase.firestore();
        const now = new Date();
        
        // Define all collections to query
        const collections = [
            { name: 'everlodgebookings', label: 'everlodgebookings' },
            { name: 'bookings', label: 'bookings' },
            { name: 'reservations', label: 'reservations' }
        ];
        
        let allBookings = [];
        
        // Query each collection
        for (const collection of collections) {
            console.log(`Querying ${collection.name} collection...`);
            try {
                const querySnapshot = await db.collection(collection.name)
                    .where('userId', '==', user.uid)
                    .orderBy('createdAt', 'desc')
                    .get();
                
                // Add bookings to the array with collection source
                querySnapshot.forEach(doc => {
                    const booking = { 
                        ...doc.data(), 
                        id: doc.id, 
                        collection: collection.label 
                    };
                    console.log(`Added booking from ${collection.name} collection:`, booking);
                    allBookings.push(booking);
                });
            } catch (error) {
                console.warn(`Error querying ${collection.name}:`, error);
            }
        }
        
        console.log(`Fetched ${allBookings.length} bookings/reservations in total`);
        return allBookings;
    } catch (error) {
        console.error('Error fetching booking history:', error);
        return [];
    }
}

// Function to load booking history
async function initializeBookingHistory() {
    try {
        console.log('Loading booking history...');
        
        // Setup tab functionality
        setupBookingTabs();
        
        // Fetch and display bookings
        const bookings = await fetchBookingHistory();
        console.log('Booking history fetched:', bookings);
        
        // Use our new display function
        await displayBookingHistory(bookings);
        
        // Show current bookings tab by default
        activateTab('current');
    } catch (error) {
        console.error('Error loading booking history:', error);
        const containers = [
            document.getElementById('currentBookings'),
            document.getElementById('previousBookings'),
            document.getElementById('bookingHistoryContainer')
        ];
        
        containers.forEach(container => {
            if (container) {
                container.innerHTML = `
                    <div class="text-center text-red-500 py-8">
                        <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                        <p>Error loading booking history. Please try again later.</p>
                        <p class="text-sm text-gray-500 mt-2">${error.message}</p>
                    </div>
                `;
            }
        });
    }
}

// Setup booking tabs functionality
function setupBookingTabs() {
    const tabButtons = document.querySelectorAll('[data-tab]');
    if (!tabButtons.length) return;
    
    console.log('Setting up booking tabs:', tabButtons.length);
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            activateTab(tabName);
        });
    });
}

// Helper function to activate a specific tab
function activateTab(tabName) {
    console.log(`Activating tab: ${tabName}`);
    
    // Get all tab buttons
    const tabButtons = document.querySelectorAll('[data-tab]');
    
    // Get all content containers
    const currentContent = document.getElementById('currentBookings');
    const previousContent = document.getElementById('previousBookings');
    const historyContent = document.getElementById('bookingHistoryContainer');
    
    // Reset all tabs
    tabButtons.forEach(btn => {
        btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
        btn.classList.add('text-gray-500');
    });
    
    // Hide all content
    if (currentContent) currentContent.classList.add('hidden');
    if (previousContent) previousContent.classList.add('hidden');
    if (historyContent) historyContent.classList.add('hidden');
    
    // Activate the selected tab
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
        activeButton.classList.remove('text-gray-500');
    }
    
    // Show the selected content
    switch (tabName) {
        case 'current':
            if (currentContent) currentContent.classList.remove('hidden');
            break;
        case 'previous':
            if (previousContent) previousContent.classList.remove('hidden');
            break;
        case 'history':
            if (historyContent) historyContent.classList.remove('hidden');
            break;
    }
}

// Function to navigate to booking details
function navigateToBookingDetails(bookingId, collection) {
    console.log(`Navigating to details for booking ${bookingId} from ${collection} collection`);
    
    // Default to 'everlodgebookings' collection if not specified
    const collectionName = collection || 'everlodgebookings';
    
    // Format collection name for URL parameters
    const formattedCollection = collectionName.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Use correct case for Dashboard.html
    window.location.href = `../Dashboard/Dashboard.html?bookingId=${bookingId}&collection=${formattedCollection}`;
}

// Add new helper function for rendering booking list with appropriate messaging
function renderBookingList(bookings, listType = 'history') {
    if (!bookings || bookings.length === 0) {
        let message = 'No booking history found';
        if (listType === 'current') message = 'No current bookings';
        if (listType === 'past') message = 'No previous bookings';
        if (listType === 'cancelled') message = 'No cancelled bookings';
        
        return `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-calendar-times text-2xl mb-2"></i>
                <p>${message}</p>
            </div>
        `;
    }

    return bookings.map(booking => {
        // Debug output to inspect the booking data structure
        console.log(`Rendering booking for ${listType}:`, booking);
        
        // Better property name handling with fallbacks
        const lodgeName = booking.propertyDetails?.name || 
                         booking.lodgeName || 
                         booking.propertyName ||
                         booking.lodge?.name ||
                         'Lodge';
                         
        // Look for date fields in all possible locations
        // First try direct date fields
        let checkInDate = null;
        let checkOutDate = null;
        
        // Check all possible date field combinations
        const checkInFields = ['checkIn', 'checkInDate', 'startDate', 'dateFrom', 'date_from', 'arrivalDate', 'arrival'];
        const checkOutFields = ['checkOut', 'checkOutDate', 'endDate', 'dateTo', 'date_to', 'departureDate', 'departure'];
        
        // Use our deep search function to find dates in the booking object
        checkInDate = findDateInObject(booking, checkInFields);
        checkOutDate = findDateInObject(booking, checkOutFields);
        
        // Try created date as fallback
        if (!checkInDate && booking.createdAt) {
            checkInDate = booking.createdAt;
        }
        
        // Format the dates
        const formattedCheckIn = formatBookingDate(checkInDate);
        const formattedCheckOut = formatBookingDate(checkOutDate);
        
        // Show the stay dates in a more readable format
        let dateDisplay;
        if (listType === 'current') {
            dateDisplay = `
            <div class="text-sm text-gray-600 mb-2">
                <p>Check-in: ${formattedCheckIn}</p>
                <p>Check-out: ${formattedCheckOut}</p>
            </div>`;
        } else {
            dateDisplay = `
            <div class="text-sm text-gray-600 mb-2">
                <p>Stayed: ${formattedCheckIn} - ${formattedCheckOut}</p>
            </div>`;
        }
        
        // Calculate total price with better fallbacks
        const totalPrice = booking.totalPrice || booking.price || booking.amount || 0;
        
        // Better status handling
        const status = booking.status || (listType === 'current' ? 'active' : 'completed');
        
        return `
        <div class="bg-white border rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow mb-3">
            <div class="flex flex-col">
                <div class="flex justify-between mb-2">
                    <h4 class="font-semibold">${lodgeName}</h4>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(status)}">
                        ${status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                </div>
                ${dateDisplay}
                <div class="flex items-center space-x-2 mb-2">
                    <span class="text-sm text-gray-500">Room:</span>
                    <span class="font-semibold">${booking.propertyDetails?.roomNumber || booking.roomNumber || booking.room || 'Standard'}</span>
                </div>
                
                <div class="mt-2 flex justify-between items-center">
                    <div class="text-purple-600 font-bold">₱${parseFloat(totalPrice).toLocaleString()}</div>
                    <button class="text-blue-600 hover:text-blue-800 text-sm font-medium" 
                            data-booking-id="${booking.id}" 
                            data-collection="${booking.collectionSource || 'bookings'}">
                        View Details
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
} 