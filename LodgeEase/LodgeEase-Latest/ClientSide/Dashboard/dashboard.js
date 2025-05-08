import { auth, db } from '../../AdminSide/firebase.js';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeUserDrawer } from '../components/userDrawer.js';
import { loadBookingHistory } from './bookingHistory.js';

// Check if there's a booking ID and collection in the URL params
const urlParams = new URLSearchParams(window.location.search);
const bookingId = urlParams.get('bookingId');
const collectionName = urlParams.get('collection') || 'everlodgebookings';

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM Content Loaded - Initializing dashboard...');
    
    // If bookingId is present in URL, fetch and display that booking
    if (bookingId) {
        console.log(`Fetching booking ${bookingId} from collection ${collectionName}`);
        try {
            const bookingRef = doc(db, collectionName, bookingId);
            const bookingDoc = await getDoc(bookingRef);
            
            if (bookingDoc.exists()) {
                const bookingData = {
                    id: bookingDoc.id,
                    ...bookingDoc.data()
                };
                console.log('Retrieved booking by ID:', bookingData);
                
                // Store in localStorage for future reference
                localStorage.setItem('currentBooking', JSON.stringify(bookingData));
                
                // Display the booking
                displayBookingInfo(bookingData);
            } else {
                console.log(`No booking found with ID: ${bookingId} in collection ${collectionName}`);
                // Try retrieving from localStorage as a fallback
                const storedBooking = localStorage.getItem('currentBooking');
                if (storedBooking) {
                    displayBookingInfo(JSON.parse(storedBooking));
                } else {
                    displayNoBookingInfo();
                }
            }
        } catch (error) {
            console.error('Error fetching booking by ID:', error);
            displayNoBookingInfo();
        }
    }
    
    // Verify elements exist
    const userIconBtn = document.getElementById('userIconBtn');
    const userDrawer = document.getElementById('userDrawer');
    
    if (!userIconBtn || !userDrawer) {
        console.error('Critical UI elements missing:', {
            userIconBtn: !!userIconBtn,
            userDrawer: !!userDrawer
        });
    } else {
        console.log('UI elements found successfully');
    }

    // Initialize user drawer
    try {
        console.log('Initializing user drawer with auth:', !!auth, 'db:', !!db);
        initializeUserDrawer(auth, db);
        console.log('User drawer initialized successfully');
    } catch (error) {
        console.error('Error initializing user drawer:', error);
    }

    // Check for booking confirmation from payment flow
    checkBookingConfirmation();

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                // Get user data
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                const userData = userDoc.data();

                // Update welcome message
                const guestNameElement = document.getElementById('guest-name');
                if (guestNameElement) {
                    guestNameElement.textContent = userData?.fullname || 'Guest';
                }

                // Get and display latest booking using new function
                const latestBooking = await getLatestBooking(user);
                if (latestBooking) {
                    displayBookingInfo(latestBooking);
                } else {
                    displayNoBookingInfo();
                }

                // Load booking history
                await loadBookingHistory(user.uid, db);

                // Set up real-time listener for booking changes
                const bookingsRef = collection(db, 'bookings');
                const q = query(
                    bookingsRef,
                    where('userId', '==', user.uid)
                );

                // Store the unsubscribe function
                window.unsubscribeBookings = onSnapshot(q, (snapshot) => {
                    console.log('Received booking update');
                    snapshot.docChanges().forEach((change) => {
                        const bookingData = {
                            id: change.doc.id,
                            ...change.doc.data()
                        };

                        // Check if this is the current booking
                        const currentBooking = localStorage.getItem('currentBooking');
                        if (currentBooking) {
                            const parsedBooking = JSON.parse(currentBooking);
                            if (parsedBooking.id === bookingData.id) {
                                console.log('Updating current booking display');
                                // Update localStorage
                                localStorage.setItem('currentBooking', JSON.stringify(bookingData));
                                // Update the display
                                displayBookingInfo(bookingData);
                            }
                        }

                        // Refresh booking history
                        loadBookingHistory(user.uid, db);
                    });
                }, (error) => {
                    console.error('Error listening to booking changes:', error);
                });

            } catch (error) {
                console.error('Error loading dashboard:', error);
                const statusElement = document.getElementById('booking-status');
                if (statusElement) {
                    statusElement.textContent = 'Error loading booking information. Please try again.';
                }
            }
        } else {
            // Clean up listener if it exists
            if (window.unsubscribeBookings) {
                window.unsubscribeBookings();
                window.unsubscribeBookings = null;
            }
            // Redirect to login if not authenticated
            window.location.href = '../Login/index.html';
        }
    });

    // Initialize booking history functionality if the container exists
    const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
    if (bookingHistoryContainer) {
        // Wait for authentication state to be ready
        auth.onAuthStateChanged(user => {
            if (user) {
                loadBookingHistory(user.uid, db);
            }
        });
    }
});

let modal;
let currentBookingData = null;

// Add formatDate function to global scope
function formatDate(dateInput) {
    if (!dateInput) return '---';
    if (typeof dateInput === 'string') return new Date(dateInput).toLocaleDateString();
    if (dateInput.seconds) return new Date(dateInput.seconds * 1000).toLocaleDateString();
    return new Date(dateInput).toLocaleDateString();
}

// Update getLatestBooking function
async function getLatestBooking(user) {
    try {
        // First check localStorage for current booking
        const currentBooking = localStorage.getItem('currentBooking');
        if (currentBooking) {
            const bookingData = JSON.parse(currentBooking);
            // Verify this booking belongs to current user
            if (bookingData.userId === user.uid) {
                console.log('Using booking from localStorage:', bookingData);
                return bookingData;
            }
        }

        // If no valid booking in localStorage, get from Firestore
        console.log('Fetching booking from Firestore...');
        const bookingsRef = collection(db, 'bookings');
        
        // First try a simpler query without ordering
        const q = query(
            bookingsRef,
            where('userId', '==', user.uid)
        );

        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            // Sort the results in memory
            const bookings = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Sort by createdAt in descending order
            bookings.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

            // Get the latest booking
            const latestBooking = bookings[0];
            console.log('Found booking in Firestore:', latestBooking);
            
            // Update localStorage with latest booking
            localStorage.setItem('currentBooking', JSON.stringify(latestBooking));
            return latestBooking;
        }

        console.log('No booking found');
        return null;
    } catch (error) {
        console.error('Error getting latest booking:', error);
        
        // If the error is about missing index, show a user-friendly message
        if (error.code === 'failed-precondition' || error.message.includes('requires an index')) {
            const statusElement = document.getElementById('booking-status');
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700">
                                    Database index not ready. Please create the following composite index in Firebase Console:
                                </p>
                                <div class="mt-2 text-xs text-yellow-600 bg-yellow-100 p-2 rounded">
                                    <p>Collection: bookings</p>
                                    <p>Fields to index:</p>
                                    <ul class="list-disc pl-4">
                                        <li>userId (Ascending)</li>
                                        <li>createdAt (Descending)</li>
                                    </ul>
                                </div>
                                <p class="mt-2 text-xs text-yellow-600">
                                    Once the index is created, please wait a few minutes for it to build and then refresh the page.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        throw error;
    }
}

// Add a new function to check booking confirmation from session storage
function checkBookingConfirmation() {
    const confirmationData = sessionStorage.getItem('bookingConfirmation');
    if (confirmationData) {
        console.log('Found booking confirmation in session storage');
        // Clear the confirmation from session storage to prevent showing it again on refresh
        sessionStorage.removeItem('bookingConfirmation');
        
        // Update the dashboard with this booking information
        // We'll need to fetch the complete booking details using the bookingId
        const bookingDetails = JSON.parse(confirmationData);
        if (bookingDetails && bookingDetails.bookingId) {
            const collection = bookingDetails.collection || 'everlodgebookings';
            fetchBookingById(bookingDetails.bookingId, collection);
        }
    }
}

// Update fetchBookingById function to use the provided collection name
async function fetchBookingById(bookingId, collection = 'everlodgebookings') {
    try {
        console.log('Fetching booking by ID:', bookingId, 'from collection:', collection);
        
        // Use the provided collection and get the document directly by ID
        const bookingRef = doc(db, collection, bookingId);
        const bookingDoc = await getDoc(bookingRef);
        
        if (bookingDoc.exists()) {
            const bookingData = {
                id: bookingDoc.id,
                ...bookingDoc.data()
            };
            console.log('Retrieved booking by ID:', bookingData);
            
            // Store in localStorage for future reference
            localStorage.setItem('currentBooking', JSON.stringify(bookingData));
            
            // Display the booking
            displayBookingInfo(bookingData);
        } else {
            console.log(`No booking found with ID: ${bookingId} in collection ${collection}`);
            // Try retrieving from localStorage as a fallback
            const storedBooking = localStorage.getItem('currentBooking');
            if (storedBooking) {
                displayBookingInfo(JSON.parse(storedBooking));
            } else {
                displayNoBookingInfo();
            }
        }
    } catch (error) {
        console.error('Error fetching booking by ID:', error);
        displayNoBookingInfo();
    }
}

// Update displayBookingInfo function to show proper status indicators
function displayBookingInfo(booking) {
    console.log('Displaying booking info:', booking);
    currentBookingData = booking;

    // Use the exact totalPrice from the booking data without any modifications
    const elements = {
        'room-number': booking.propertyDetails?.roomNumber || '---',
        'check-in-date': formatDate(booking.checkIn),
        'check-out-date': formatDate(booking.checkOut),
        'guest-count': booking.guests || '---',
        'rate-per-night': booking.nightlyRate ? `₱${booking.nightlyRate.toLocaleString()}` : '---',
        'total-amount': `₱${parseFloat(booking.totalPrice || 0).toLocaleString()}`
    };

    // Update each element if it exists
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });

    // Update booking status and payment status
    const statusElement = document.getElementById('booking-status');
    if (statusElement) {
        let status = '';
        let statusClass = '';

        // First check payment status
        if (booking.paymentStatus === 'rejected') {
            status = 'Payment Rejected';
            statusClass = 'text-red-600';
        } else if (booking.paymentStatus === 'verified') {
            status = 'Payment Verified';
            statusClass = 'text-green-600';
        } else {
            status = 'Payment Pending Verification';
            statusClass = 'text-yellow-600';
        }

        // Then check booking status
        if (booking.status === 'cancelled') {
            status += ' | Booking Cancelled';
            statusClass = 'text-red-600';
        } else if (booking.status === 'pending') {
            status += ' | Booking Pending';
            statusClass = 'text-yellow-600';
        } else if (booking.status === 'confirmed') {
            const now = new Date();
            const checkIn = booking.checkIn.seconds ? 
                new Date(booking.checkIn.seconds * 1000) : 
                new Date(booking.checkIn);
            const checkOut = booking.checkOut.seconds ? 
                new Date(booking.checkOut.seconds * 1000) : 
                new Date(booking.checkOut);

            if (now < checkIn) {
                const daysToCheckIn = Math.ceil((checkIn - now) / (1000 * 60 * 60 * 24));
                status += ` | Stay begins in ${daysToCheckIn} days`;
                statusClass = 'text-green-600';
            } else if (now >= checkIn && now <= checkOut) {
                const daysLeft = Math.ceil((checkOut - now) / (1000 * 60 * 60 * 24));
                status += ` | Currently staying (${daysLeft} days remaining)`;
                statusClass = 'text-green-600';
            } else {
                status += ' | Stay completed';
                statusClass = 'text-gray-600';
            }
        }

        statusElement.textContent = status;
        statusElement.className = `font-medium ${statusClass}`;
    }

    // Add status indicators to stay details
    const stayDetailsContainer = document.querySelector('.bg-gray-50.p-3.rounded-lg.mb-4.text-sm');
    if (stayDetailsContainer) {
        const statusIndicators = document.createElement('div');
        statusIndicators.className = 'mt-3 pt-3 border-t border-gray-200';
        statusIndicators.innerHTML = `
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-gray-600">Booking Status:</span>
                    <span class="font-medium ${booking.status === 'confirmed' ? 'text-green-600' : 
                        booking.status === 'pending' ? 'text-yellow-600' : 'text-red-600'}">
                        ${booking.status === 'confirmed' ? 'Confirmed' : 
                          booking.status === 'pending' ? 'Pending' : 'Cancelled'}
                    </span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-gray-600">Payment Status:</span>
                    <span class="font-medium ${booking.paymentStatus === 'verified' ? 'text-green-600' : 
                        booking.paymentStatus === 'pending' ? 'text-yellow-600' : 'text-red-600'}">
                        ${booking.paymentStatus === 'verified' ? 'Verified' : 
                          booking.paymentStatus === 'pending' ? 'Pending Verification' : 'Rejected'}
                    </span>
                </div>
                ${booking.paymentStatus === 'rejected' && booking.rejectionReason ? `
                <div class="text-sm text-red-600 mt-1">
                    Rejection Reason: ${booking.rejectionReason}
                </div>
                ` : ''}
            </div>
        `;
        stayDetailsContainer.appendChild(statusIndicators);
    }
}

function displayNoBookingInfo() {
    // Clear all booking fields
    const elements = [
        'room-number',
        'check-in-date',
        'check-out-date',
        'guest-count',
        'rate-per-night',
        'total-amount'
    ];

    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = '---';
        }
    });

    // Update status
    const statusElement = document.getElementById('booking-status');
    if (statusElement) {
        statusElement.textContent = 'No active bookings found. Browse our available rooms to make a reservation.';
    }
}

// Initialize modal and event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Get modal elements
    modal = document.getElementById('bookingModal');
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    const closeModalBtn = document.getElementById('closeModal');
    const downloadPDF = document.getElementById('downloadPDF');
    const printBooking = document.getElementById('printBooking');

    // Log modal elements for debugging
    console.log('Modal elements:', {
        modal: !!modal,
        viewDetailsBtn: !!viewDetailsBtn,
        closeModalBtn: !!closeModalBtn
    });

    // View Details Button Click Handler
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', () => {
            if (!modal) {
                console.error('Modal element not found');
                return;
            }

            if (currentBookingData) {
                const modalContent = document.getElementById('modalContent');
                if (!modalContent) {
                    console.error('Modal content element not found');
                    return;
                }

                // Use the exact totalPrice value without modification
                const totalAmount = parseFloat(currentBookingData.totalPrice || 0);

                modalContent.innerHTML = `
                    <div class="text-center mb-4">
                        <img src="../components/lodgeeaselogo.png" alt="LodgeEase Logo" class="h-12 w-12 mx-auto mb-2">
                        <h1 class="text-xl font-bold text-blue-600 mb-1">LodgeEase</h1>
                        <p class="text-sm text-gray-600">Booking Confirmation</p>
                    </div>

                    <div class="border-b border-gray-200 pb-3 mb-3">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-gray-600">Booking Reference:</span>
                            <span class="font-mono font-bold">${currentBookingData.id || '---'}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-600">Status:</span>
                            <span class="font-medium ${currentBookingData.status === 'cancelled' ? 'text-red-600' : 
                                currentBookingData.status === 'pending' ? 'text-yellow-600' : 'text-green-600'}">
                                ${currentBookingData.status ? currentBookingData.status.charAt(0).toUpperCase() + 
                                currentBookingData.status.slice(1) : 'Unknown'}
                            </span>
                        </div>
                        ${currentBookingData.paymentStatus ? `
                        <div class="flex justify-between items-center mt-2">
                            <span class="text-gray-600">Payment Status:</span>
                            <span class="font-medium ${currentBookingData.paymentStatus === 'verified' ? 'text-green-600' : 
                                currentBookingData.paymentStatus === 'pending' ? 'text-yellow-600' : 'text-red-600'}">
                                ${currentBookingData.paymentStatus.charAt(0).toUpperCase() + 
                                currentBookingData.paymentStatus.slice(1)}
                            </span>
                        </div>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <h3 class="font-semibold mb-2">Guest Information</h3>
                            <p class="text-gray-600">${currentBookingData.guestName || '---'}</p>
                            <p class="text-gray-600">${currentBookingData.email || '---'}</p>
                            <p class="text-gray-600">Guests: ${currentBookingData.guests || '---'}</p>
                        </div>
                        <div>
                            <h3 class="font-semibold mb-2">Hotel Information</h3>
                            <p class="text-gray-600">LodgeEase Hotel</p>
                            <p class="text-gray-600">Aspiras Palispis Highway</p>
                            <p class="text-gray-600">Baguio City, 2600</p>
                        </div>
                    </div>

                    <div class="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
                        <h3 class="font-semibold mb-3">Stay Details</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-gray-600">Check-in</p>
                                <p class="font-medium">${formatDate(currentBookingData.checkIn)}</p>
                                <p class="text-sm text-gray-500">After 2:00 PM</p>
                            </div>
                            <div>
                                <p class="text-gray-600">Check-out</p>
                                <p class="font-medium">${formatDate(currentBookingData.checkOut)}</p>
                                <p class="text-sm text-gray-500">Before 12:00 PM</p>
                            </div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-gray-200">
                            <p class="text-gray-600">Payment Status</p>
                            ${currentBookingData.paymentStatus === 'verified' ? `
                                <p class="font-medium text-green-600">Payment Verified</p>
                            ` : currentBookingData.paymentStatus === 'pending' ? `
                                <p class="font-medium text-yellow-600">Payment Pending Verification</p>
                                <p class="text-sm text-gray-500 mt-1">Please wait for admin verification</p>
                            ` : currentBookingData.paymentStatus === 'rejected' ? `
                                <p class="font-medium text-red-600">Payment Rejected</p>
                                ${currentBookingData.rejectionReason ? `
                                    <p class="text-sm text-red-600 mt-1">Reason: ${currentBookingData.rejectionReason}</p>
                                ` : ''}
                            ` : `
                                <p class="font-medium text-gray-600">No Payment Status Available</p>
                            `}
                        </div>
                    </div>

                    <div class="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
                        <h3 class="font-semibold mb-3">Room Details</h3>
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Room Number</span>
                                <span class="font-medium">${currentBookingData.propertyDetails?.roomNumber || '---'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Room Type</span>
                                <span class="font-medium">${currentBookingData.propertyDetails?.roomType || '---'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Rate per Night</span>
                                <span class="font-medium">₱${currentBookingData.nightlyRate?.toLocaleString() || '---'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-gray-200 pt-3">
                        <div class="flex justify-between items-center text-lg font-bold">
                            <span>Total Amount</span>
                            <span>₱${totalAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <div class="mt-4 text-center text-xs text-gray-500">
                        <p>Please present this booking confirmation upon check-in</p>
                        <p>For inquiries, contact: +63 912 991 2658</p>
                    </div>
                `;

                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        });
    }

    // Close Modal Button Click Handler
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    }

    // Print functionality
    if (printBooking) {
        printBooking.addEventListener('click', () => {
            const modalContent = document.getElementById('modalContent');
            if (!modalContent) return;

            const printWindow = window.open('', '', 'width=800,height=600');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Booking Confirmation</title>
                        <link href="https://cdn.tailwindcss.com" rel="stylesheet">
                    </head>
                    <body class="p-8">
                        ${modalContent.innerHTML}
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        });
    }

    // Download PDF functionality
    if (downloadPDF) {
        downloadPDF.addEventListener('click', () => {
            const modalContent = document.getElementById('modalContent');
            if (!modalContent) return;

            const filename = `booking-confirmation-${currentBookingData?.id || 'default'}.pdf`;
            
            const element = document.createElement('div');
            element.innerHTML = modalContent.innerHTML;
            element.style.padding = '20px';

            const opt = {
                margin: 1,
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
            };

            window.html2pdf().set(opt).from(element).save().catch(err => {
                console.error('Error generating PDF:', err);
            });
        });
    }

    // Add modal scroll functionality
    const modalContent = document.getElementById('modalContent');
    if (modalContent) {
        modalContent.addEventListener('scroll', () => {
            const isAtTop = modalContent.scrollTop === 0;
            const isAtBottom = 
                modalContent.scrollHeight - modalContent.scrollTop === modalContent.clientHeight;
            
            modalContent.style.borderTop = isAtTop ? 'none' : '1px solid #e5e7eb';
            modalContent.style.borderBottom = isAtBottom ? 'none' : '1px solid #e5e7eb';
        });
    }
});

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
                    // Don't initialize bookings modal here as it's already done in the HTML
                    // initializeBookingsModal(auth, db);
                });
            });

            // Initialize navigation
            initializeNavigation();

            // Initialize the check-in date filter
            initializeCheckInDateFilter();
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    });
     // Function to initialize and populate the bookings modal
     function initializeBookingsModal(auth, db) {
        if (!auth || !db) {
            console.error('Auth or Firestore not initialized');
            return;
        }

        console.log('Initializing bookings modal with auth and db');

        // Create bookings popup
        const bookingsPopup = document.createElement('div');
        bookingsPopup.id = 'bookingsPopup';
        bookingsPopup.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-[70]';
        
        // Create the bookings modal structure to match the design
        bookingsPopup.innerHTML = `
            <div class="fixed right-0 top-0 w-96 h-full bg-white shadow-xl overflow-y-auto">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-2xl font-bold text-gray-900">My Bookings</h3>
                        <button id="closeBookingsPopup" class="text-gray-500 hover:text-gray-700">
                            <i class="ri-close-line text-2xl"></i>
                        </button>
                    </div>
                    
                    <!-- Booking Tabs with styling to match design -->
                    <div class="flex border-b mb-6">
                        <button class="flex-1 py-3 text-blue-600 border-b-2 border-blue-600 font-medium" data-tab="current">
                            Current
                        </button>
                        <button class="flex-1 py-3 text-gray-500 font-medium" data-tab="previous">
                            Previous
                        </button>
                        <button class="flex-1 py-3 text-gray-500 font-medium" data-tab="history">
                            History
                        </button>
                    </div>
                    
                    <!-- Bookings Content -->
                    <div id="currentBookings" class="space-y-4">
                        <p class="text-gray-500 text-center py-16">No bookings found</p>
                    </div>
                    
                    <div id="previousBookings" class="hidden space-y-4">
                        <p class="text-gray-500 text-center py-16">No bookings found</p>
                    </div>

                    <div id="bookingHistoryContainer" class="hidden space-y-4">
                        <p class="text-gray-500 text-center py-16">Loading booking history...</p>
                    </div>
                </div>
            </div>
        `;

        // Add the modal to the body if it doesn't already exist
        if (!document.getElementById('bookingsPopup')) {
            console.log('Adding bookings popup to the DOM');
            document.body.appendChild(bookingsPopup);
        } else {
            console.log('Bookings popup already exists in the DOM');
        }
        
        // Add event listeners for close button and outside clicks
        const closeBtn = bookingsPopup.querySelector('#closeBookingsPopup');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                bookingsPopup.classList.add('hidden');
            });
        }
        
        // Close when clicking on the backdrop
        bookingsPopup.addEventListener('click', (e) => {
            if (e.target === bookingsPopup) {
                bookingsPopup.classList.add('hidden');
            }
        });
        
        // Track auth state to fetch bookings
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Fetch and display the bookings for the user
                fetchUserBookings(user.uid, db);
                
                // Load booking history using our external module
                import('./bookingHistory.js')
                    .then(({ loadBookingHistory }) => {
                        loadBookingHistory(user.uid, db);
                    })
                    .catch(error => {
                        console.error('Error loading booking history module:', error);
                        document.getElementById('bookingHistoryContainer').innerHTML = `
                            <div class="text-center text-red-500 py-8">
                                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                                <p>Error loading booking history. Please try again later.</p>
                            </div>
                        `;
                    });
                
                // Set up event listeners for the tabs
                const tabButtons = bookingsPopup.querySelectorAll('[data-tab]');
                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        // Remove active state from all tabs
                        tabButtons.forEach(btn => {
                            btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
                            btn.classList.add('text-gray-500');
                        });

                        // Add active state to clicked tab
                        button.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
                        button.classList.remove('text-gray-500');

                        // Show corresponding content
                        const tabName = button.dataset.tab;
                        document.getElementById('currentBookings').classList.toggle('hidden', tabName !== 'current');
                        document.getElementById('previousBookings').classList.toggle('hidden', tabName !== 'previous');
                        document.getElementById('bookingHistoryContainer').classList.toggle('hidden', tabName !== 'history');
                    });
                });
            }
        });
    }

    // Make initializeBookingsModal function available globally
    window.initializeBookingsModal = initializeBookingsModal;

    // Function to fetch user's bookings
    async function fetchUserBookings(userId, db) {
        try {
            console.log('Fetching bookings for user:', userId);
            
            // Import the booking service - fix the path
            const importPath = '../services/bookingService.js';
            console.log('Importing booking service from:', importPath);
            
            const { default: bookingService } = await import(importPath).catch(error => {
                console.error('Error importing booking service:', error);
                throw new Error('Could not load booking service module');
            });
            
            console.log('BookingService imported successfully:', !!bookingService);
            
            try {
                // Fetch bookings using the service
                const { currentBookings, pastBookings } = await bookingService.getUserBookings(userId);
                
                console.log('Retrieved bookings:', { 
                    currentCount: currentBookings.length, 
                    pastCount: pastBookings.length 
                });
                
                // Display the bookings
                displayBookings('currentBookings', currentBookings);
                displayBookings('previousBookings', pastBookings);
            } catch (serviceError) {
                console.error('Error from booking service:', serviceError);
                
                // Display friendly error message
                const errorMessage = serviceError.message.includes('index') 
                    ? 'Database query requires an index. Please contact support.' 
                    : 'Unable to load your bookings at this time';
                
                document.getElementById('currentBookings').innerHTML = `
                    <div class="text-center text-red-500 py-8">
                        <p>${errorMessage}</p>
                    </div>
                `;
                document.getElementById('previousBookings').innerHTML = `
                    <div class="text-center text-red-500 py-8">
                        <p>${errorMessage}</p>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('Error fetching bookings:', error);
            // Show error message in the bookings containers
            const errorMessage = error.message || 'Error loading bookings';
            
            document.getElementById('currentBookings').innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>${errorMessage}</p>
                </div>
            `;
            document.getElementById('previousBookings').innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <p>${errorMessage}</p>
                </div>
            `;
        }
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
        const collectionParam = collection || 'everlodgebookings';
        // For now, just redirect to the dashboard where they can see more details
        window.location.href = `../Dashboard/Dashboard.html?bookingId=${bookingId}&collection=${collectionParam}`;
    }

    

// Update closeModal function to use the correct modal ID
function closeModal() {
    const modal = document.getElementById('bookingModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Function to show bookings modal
function showBookingsModal() {
    console.log('showBookingsModal called');
    const bookingsPopup = document.getElementById('bookingsPopup');
    if (bookingsPopup) {
        console.log('Showing bookings popup');
        bookingsPopup.classList.remove('hidden');
        
        // Activate booking history tab - set History as default active tab
        const tabButtons = bookingsPopup.querySelectorAll('[data-tab]');
        tabButtons.forEach(btn => {
            const isHistoryTab = btn.dataset.tab === 'history';
            btn.classList.toggle('text-blue-600', isHistoryTab);
            btn.classList.toggle('border-b-2', isHistoryTab);
            btn.classList.toggle('border-blue-600', isHistoryTab);
            btn.classList.toggle('text-gray-500', !isHistoryTab);
        });
        
        // Show history container, hide others
        document.getElementById('currentBookings').classList.add('hidden');
        document.getElementById('previousBookings').classList.add('hidden');
        document.getElementById('bookingHistoryContainer').classList.remove('hidden');
        
        // If the user is logged in, load booking history
        if (auth.currentUser) {
            const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
            // Only reload if showing loading message
            if (bookingHistoryContainer.querySelector('p.text-center.py-16')) {
                console.log('Loading booking history for user:', auth.currentUser.uid);
                loadBookingHistory(auth.currentUser.uid, db);
            }
        }
    } else {
        console.error('Bookings popup not found in the DOM');
    }
}

// Make showBookingsModal function available globally
window.showBookingsModal = showBookingsModal;

// Stub functions for references in the code
function initializeAllFunctionality() {
    console.log('initializeAllFunctionality - stub function');
    // This function would normally initialize various features
}

function updateLoginButtonVisibility(user) {
    console.log('updateLoginButtonVisibility - stub function');
    // This would update UI elements based on login state
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.style.display = user ? 'none' : 'block';
    }
}

function createLodgeCards() {
    console.log('createLodgeCards - stub function');
    // This would create lodge cards in the UI
}

function initializeNavigation() {
    console.log('initializeNavigation - stub function');
    // This would set up navigation elements
}

function initializeCheckInDateFilter() {
    console.log('initializeCheckInDateFilter - stub function');
    // This would initialize date filters
}