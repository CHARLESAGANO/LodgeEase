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
 * @param {string} [containerId='bookingHistoryContainer'] - The ID of the container element
 * @returns {Promise<void>}
 */
// Changed from export to regular function, added containerId parameter
async function loadBookingHistory(userId, db, containerId = 'bookingHistoryContainer') {
    try {
        console.log(`[bookingHistory.js] loadBookingHistory called for userId: ${userId}, containerId: ${containerId}`);
        const bookingHistoryContainer = document.getElementById(containerId);
        if (!bookingHistoryContainer) {
            console.error(`[bookingHistory.js] Booking history container with ID '${containerId}' not found`);
            return;
        }

        console.log('[bookingHistory.js] Loading booking history for user:', userId);
        
        if (!db || !db.collection) {
            console.error('Firestore database instance not valid');
            bookingHistoryContainer.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>Unable to connect to database. Please try again later.</p>
                </div>
            `;
            return;
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
            
            // Log all bookings for debugging
            console.log('All bookings:', bookings);

            // Sort the results by createdAt in descending order - client-side sorting
            bookings.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

            // Enhance bookings with additional data if needed
            await enhanceBookingsWithLodgeDetails(bookings, db);

            // Filter out the current booking if it exists
            const currentBookingId = localStorage.getItem('currentBooking') ? 
                JSON.parse(localStorage.getItem('currentBooking')).id : null;
            
            const pastBookings = bookings.filter(booking => booking.id !== currentBookingId);

            if (pastBookings.length === 0) {
                bookingHistoryContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-calendar-times text-2xl mb-2"></i>
                        <p>No past bookings found</p>
                    </div>
                `;
                return;
            }

            // Display past bookings
            bookingHistoryContainer.innerHTML = pastBookings.map(booking => {
                // Debug output to inspect the booking data structure
                console.log('Booking data:', booking);
                
                // Better property name handling with fallbacks
                const lodgeName = booking.propertyDetails?.name || 
                                 booking.lodgeName || 
                                 booking.propertyName ||
                                 booking.lodgeName || 
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
                
                console.log(`Deep search results for booking ${booking.id}:`, 
                            'checkInDate:', checkInDate, 
                            'checkOutDate:', checkOutDate);
                
                // Try created date as fallback
                if (!checkInDate && booking.createdAt) {
                    checkInDate = booking.createdAt;
                    console.log('Using createdAt as fallback for check-in date:', checkInDate);
                }
                
                // Format the dates
                const formattedCheckIn = formatBookingDate(checkInDate);
                const formattedCheckOut = formatBookingDate(checkOutDate);
                
                // Show the stay dates in a more readable format
                const stayedText = `Stayed: ${formattedCheckIn} - ${formattedCheckOut}`;
                
                console.log(`Formatted dates for booking ${booking.id}: ${formattedCheckIn} - ${formattedCheckOut}`);
                
                // Calculate total price with better fallbacks
                const totalPrice = booking.totalPrice || booking.price || booking.amount || 0;
                
                // Better status handling
                const status = booking.status || 'completed';
                
                return `
                <div class="bg-white border rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                    <div class="flex flex-col">
                        <div class="flex justify-between mb-2">
                            <h4 class="font-semibold">${lodgeName}</h4>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(status)}">
                                ${status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                        </div>
                        <div class="text-sm text-gray-600 mb-2">
                            ${stayedText}
                        </div>
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

            // Add event listeners to view details buttons
            bookingHistoryContainer.querySelectorAll('[data-booking-id]').forEach(button => {
                button.addEventListener('click', () => {
                    const bookingId = button.dataset.bookingId;
                    const collection = button.dataset.collection;
                    // Navigate to booking details page or show modal with details
                    viewBookingDetails(bookingId, collection);
                });
            });
        } catch (queryError) {
            console.error('Error executing booking history query:', queryError);
            
            // Display user-friendly error message
            const errorMessage = queryError.message?.includes('index') 
                ? 'The booking data requires a database update. Please contact support.'
                : 'Unable to load your booking history at this time.';
                
            bookingHistoryContainer.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p>${errorMessage}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading booking history:', error);
        const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
        
        bookingHistoryContainer.innerHTML = `
            <div class="text-center text-red-500 py-8">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error loading booking history. Please try again later.</p>
            </div>
        `;
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
 * Function to view booking details
 * @param {string} bookingId - The booking ID
 * @param {string} collection - The collection name
 */
function viewBookingDetails(bookingId, collection) {
    console.log(`Viewing booking ${bookingId} from ${collection} collection`);
    
    // Fix case sensitivity in path and handle collection default
    const dashboardPath = '../Dashboard/Dashboard.html';
    const collectionParam = collection || 'everlodgebookings';
    
    // Use the corrected URL for dashboard
    window.location.href = `${dashboardPath}?bookingId=${bookingId}&collection=${collectionParam}`;
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

// Expose the main function globally
if (typeof window !== 'undefined') {
    console.log('[bookingHistory.js] Exposing loadBookingHistory to window object.');
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

// Helper function to render a list of bookings
function renderBookingsList(container, bookings) {
    bookings.forEach(booking => {
        // Better property name handling with fallbacks
        const lodgeName = booking.propertyDetails?.name || 
                         booking.lodgeName || 
                         booking.propertyName ||
                         booking.lodgeName || 
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
        
        console.log(`Deep search results for booking ${booking.id}:`, 
                    'checkInDate:', checkInDate, 
                    'checkOutDate:', checkOutDate);
        
        // Try created date as fallback
        if (!checkInDate && booking.createdAt) {
            checkInDate = booking.createdAt;
            console.log('Using createdAt as fallback for check-in date:', checkInDate);
        }
        
        // Format the dates
        const formattedCheckIn = formatBookingDate(checkInDate);
        const formattedCheckOut = formatBookingDate(checkOutDate);
        
        // Show the stay dates in a more readable format
        const stayedText = `Stayed: ${formattedCheckIn} - ${formattedCheckOut}`;
        
        console.log(`Formatted dates for booking ${booking.id}: ${formattedCheckIn} - ${formattedCheckOut}`);
        
        // Calculate total price with better fallbacks
        const price = booking.totalPrice || booking.price || booking.amount || booking.total || 0;
        const formattedPrice = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(price);
        
        // Get room information with fallbacks
        const roomNumber = booking.roomNumber || booking.room || booking.propertyDetails?.roomNumber || 'Room';
        
        // Create booking card
        const bookingCard = document.createElement('div');
        bookingCard.className = 'bg-white rounded-lg shadow-md p-6 mb-4 hover:shadow-lg transition-shadow';
        bookingCard.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-xl font-bold text-gray-800">${lodgeName}</h3>
                    <p class="text-gray-600">${roomNumber}</p>
                    <p class="text-gray-500 text-sm mt-1">${stayedText}</p>
                </div>
                <div class="text-right">
                    <p class="text-xl font-semibold text-green-600">${formattedPrice}</p>
                    <button class="view-details-btn mt-2 bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-3 rounded" 
                            data-booking-id="${booking.id || booking.bookingId}" 
                            data-collection="${booking.collection || 'bookings'}">
                        View Details
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(bookingCard);
    });
    
    // Add click event listeners to the View Details buttons
    const viewDetailsButtons = container.querySelectorAll('.view-details-btn');
    viewDetailsButtons.forEach(button => {
        button.addEventListener('click', function() {
            const bookingId = this.getAttribute('data-booking-id');
            const collection = this.getAttribute('data-collection');
            navigateToBookingDetails(bookingId, collection);
        });
    });
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