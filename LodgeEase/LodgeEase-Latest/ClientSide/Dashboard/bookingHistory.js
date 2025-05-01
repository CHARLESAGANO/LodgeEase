import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Loads and displays booking history for a user
 * @param {string} userId - The user ID to load bookings for
 * @param {Object} db - Firestore database instance
 */
export async function loadBookingHistory(userId, db) {
    try {
        console.log('Loading booking history for user:', userId);
        
        // Get the container to display history in
        const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
        if (!bookingHistoryContainer) {
            console.error('Booking history container not found');
            return;
        }
        
        // Show loading indicator
        bookingHistoryContainer.innerHTML = `
            <div class="text-center py-8">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p class="mt-2 text-gray-600">Loading booking history...</p>
            </div>
        `;

        // Query bookings for this user
        const bookingsRef = collection(db, 'bookings');
        const q = query(
            bookingsRef,
            where('userId', '==', userId)
        );

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

        // Process bookings
        const bookings = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by created date (descending)
        bookings.sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        });

        // Helper function to format dates
        const formatDate = (dateInput) => {
            if (!dateInput) return 'N/A';
            if (typeof dateInput === 'string') return new Date(dateInput).toLocaleDateString();
            if (dateInput.seconds) return new Date(dateInput.seconds * 1000).toLocaleDateString();
            return new Date(dateInput).toLocaleDateString();
        };

        // Generate HTML for each booking
        const bookingsHTML = bookings.map(booking => `
            <div class="bg-white border rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-semibold">Room ${booking.propertyDetails?.roomNumber || 'N/A'}</h4>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(booking.status || 'completed')}">
                        ${(booking.status || 'completed').charAt(0).toUpperCase() + (booking.status || 'completed').slice(1)}
                    </span>
                </div>
                <div class="flex items-center text-sm text-gray-500 space-x-2 mb-2">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${formatDate(booking.checkIn)} - ${formatDate(booking.checkOut)}</span>
                </div>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-medium">₱${parseFloat(booking.totalPrice || 0).toLocaleString()}</span>
                    <button class="text-blue-600 hover:text-blue-800 text-sm font-medium view-booking-btn" 
                            data-booking-id="${booking.id}">
                        View Details
                    </button>
                </div>
            </div>
        `).join('');

        // Display the bookings
        bookingHistoryContainer.innerHTML = bookingsHTML || `
            <div class="text-center text-gray-500 py-8">
                <p>No booking history found</p>
            </div>
        `;

        // Add event listeners to booking buttons
        bookingHistoryContainer.querySelectorAll('.view-booking-btn').forEach(button => {
            button.addEventListener('click', () => {
                const bookingId = button.dataset.bookingId;
                // Navigate to booking details or show modal
                window.location.href = `../Dashboard/dashboard.html?bookingId=${bookingId}`;
            });
        });
        
    } catch (error) {
        console.error('Error loading booking history:', error);
        
        // Get container again to be sure
        const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
        if (bookingHistoryContainer) {
            bookingHistoryContainer.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                    <p>Error loading booking history: ${error.message}</p>
                </div>
            `;
        }
    }
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