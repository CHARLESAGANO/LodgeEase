/**
 * Booking History Module for LodgeEase Homepage
 * This module handles fetching and displaying booking history in the homepage's bookings modal
 */
// Import Firestore methods without initializing Firebase again
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Loads booking history for a user and displays it in the specified container
 * @param {string} userId - The user's ID
 * @param {object} db - The Firestore database instance
 * @returns {Promise<void>}
 */
export async function loadBookingHistory(userId, db) {
    try {
        const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
        if (!bookingHistoryContainer) {
            console.error('Booking history container not found');
            return;
        }

        console.log('Loading booking history for user:', userId);
        
        const bookingsRef = collection(db, 'bookings');
        // Simple query without orderBy to avoid requiring a composite index
        const q = query(
            bookingsRef,
            where('userId', '==', userId)
        );

        try {
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                bookingHistoryContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-calendar-times text-2xl mb-2"></i>
                        <p>No booking history found</p>
                    </div>
                `;
                return;
            }

            const bookings = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort the results by createdAt in descending order - client-side sorting
            bookings.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

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
            bookingHistoryContainer.innerHTML = pastBookings.map(booking => `
                <div class="bg-white border rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                    <div class="flex flex-col">
                        <div class="flex justify-between mb-2">
                            <h4 class="font-semibold">${booking.propertyDetails?.name || 'Unknown Property'}</h4>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(booking.status || 'completed')}">
                                ${(booking.status || 'Completed').charAt(0).toUpperCase() + (booking.status || 'completed').slice(1)}
                            </span>
                        </div>
                        <div class="space-y-2">
                            <div class="flex items-center space-x-2">
                                <span class="text-sm text-gray-500">Room:</span>
                                <span class="font-semibold">${booking.propertyDetails?.roomNumber || 'N/A'}</span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="text-sm text-gray-500">Check-in:</span>
                                <span class="font-semibold">${formatBookingDate(booking.checkIn)}</span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="text-sm text-gray-500">Check-out:</span>
                                <span class="font-semibold">${formatBookingDate(booking.checkOut)}</span>
                            </div>
                        </div>
                        <div class="mt-3 flex justify-between">
                            <div class="text-purple-600 font-bold">₱${parseFloat(booking.totalPrice || 0).toLocaleString()}</div>
                            <button class="text-blue-600 hover:text-blue-800 text-sm font-medium" 
                                    data-booking-id="${booking.id}" 
                                    data-collection="${booking.collectionSource || 'bookings'}">
                                View Details
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

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
function formatBookingDate(dateInput) {
    if (!dateInput) return 'N/A';
    if (typeof dateInput === 'string') return new Date(dateInput).toLocaleDateString();
    if (dateInput.seconds) return new Date(dateInput.seconds * 1000).toLocaleDateString();
    return new Date(dateInput).toLocaleDateString();
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
    // Redirect to the dashboard where they can see more details
    window.location.href = `../Dashboard/dashboard.html?bookingId=${bookingId}&collection=${collection}`;
} 