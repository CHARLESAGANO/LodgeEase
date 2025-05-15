import { auth as getAuth, db as getDb, doc, getDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot } from "../../AdminSide/firebase.js";
import { initializeUserDrawer } from '../components/userDrawer.js';
import { loadBookingHistory } from './bookingHistory.js';

// Function to get URL parameters with better error handling
function getUrlParameters() {
    try {
        const bookingId = getUrlParameter('bookingId');
        const collection = getUrlParameter('collection') || 'everlodgebookings';
        
        return { 
            bookingId: bookingId, 
            collection: collection
        };
    } catch (error) {
        console.error('Error parsing URL parameters:', error);
        return { 
            bookingId: null, 
            collection: 'everlodgebookings'
        };
    }
}

// Replace the individual parameter parsing with the combined function
const urlParams = getUrlParameters();
const bookingId = urlParams.bookingId;
const collectionName = urlParams.collection;

// Add this function near the top of the file to handle URL parameters
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DEBUG: Dashboard DOM loaded, initializing...');
    
    // Initialize user drawer with Firebase auth and db
    try {
        console.log('DEBUG: Initializing user drawer');
        initializeUserDrawer(getAuth(), getDb());
        
        // Setup auth state listener for login button visibility with improved error handling
        getAuth().onAuthStateChanged(user => {
            console.log('DEBUG: Auth state changed:', user ? 'User logged in' : 'No user');
            const loginButton = document.getElementById('loginButton');
            const userIconBtn = document.getElementById('userIconBtn');
            
            // Handle login button visibility
            if (loginButton) {
                loginButton.style.display = user ? 'none' : 'block';
                console.log('DEBUG: Updated login button visibility:', loginButton.style.display);
            } else {
                console.error('DEBUG: Login button element not found');
            }
            
            // Handle user icon button visibility
            if (userIconBtn) {
                userIconBtn.style.display = user ? 'block' : 'none';
                console.log('DEBUG: Updated user icon button visibility:', userIconBtn.style.display);
            } else {
                console.error('DEBUG: User icon button element not found');
            }
            
            // Try again after a slight delay in case elements are added later
            setTimeout(() => {
                const retryLoginButton = document.getElementById('loginButton');
                const retryUserIconBtn = document.getElementById('userIconBtn');
                
                if (retryLoginButton) {
                    retryLoginButton.style.display = user ? 'none' : 'block';
                }
                
                if (retryUserIconBtn) {
                    retryUserIconBtn.style.display = user ? 'block' : 'none';
                }
            }, 500);
        });
    } catch (error) {
        console.error('ERROR: Failed to initialize user drawer:', error);
    }
    
    // Dump storage data for debugging
    dumpStorageToConsole();
    
    // Load parameter values via our robust URL parameter parser
    const urlParams = getUrlParameters();
    const bookingId = urlParams.bookingId;
    const collectionName = urlParams.collection;
    
    // Check if View Details button exists
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    console.log('DEBUG: On page load, viewDetailsBtn exists:', !!viewDetailsBtn);
    if (viewDetailsBtn) {
        console.log('DEBUG: viewDetailsBtn element properties:', {
            id: viewDetailsBtn.id,
            className: viewDetailsBtn.className,
            disabled: viewDetailsBtn.disabled,
            innerHTML: viewDetailsBtn.innerHTML
        });
    }
    
    // Initialize window.currentBookingData if not already defined
    window.currentBookingData = window.currentBookingData || null;
    
    // Check if early fetch already populated booking data
    if (window.currentBookingData) {
        console.log('DEBUG: Using booking data from early fetch:', window.currentBookingData);
        displayBookingInfo(window.currentBookingData);
    } else {
        // Add debug controls to page when URL parameters exist
        if (bookingId) {
            console.log('Adding debug controls to page...');
            addDebugControls();
        }
        
        // Always first try URL parameters
        if (bookingId) {
            console.log(`Found booking ID in URL: ${bookingId}, loading from ${collectionName}`);
            
            // Try to fetch the booking from Firestore
            fetchBookingById(bookingId, collectionName)
                .then(bookingData => {
                    if (bookingData) {
                        console.log('DEBUG: Successfully fetched booking data from Firestore:', bookingData);
                        window.currentBookingData = bookingData; // Store in window object
                        displayBookingInfo(bookingData);
                    } else {
                        console.warn('No booking data returned from Firestore');
                        checkBookingConfirmation();
                    }
                })
                .catch(error => {
                    console.error('Error fetching booking from Firestore:', error);
                    checkBookingConfirmation();
                });
        } else {
            // If no URL parameters, check for booking confirmation in session storage
            console.log('No booking ID in URL, checking session storage...');
            checkBookingConfirmation();
        }
    }

    // Initialize booking history and tabs
    initializeTabs();

    // Load booking history
    loadBookingHistory();
    
    // Initialize the bookings modal with appropriate setup
    initializeBookingsModal();
    
    // Initialize modal elements (moved outside the DOMContentLoaded handler to make them globally available)
    window.modal = document.getElementById('bookingModal');
    console.log('DEBUG: Modal element initialized:', !!window.modal);
    
    // Set up the View Details Button Click Handler
    console.log('DEBUG: About to set up View Details button');
    setupViewDetailsButton();
    
    // Add a manual click handler for testing
    console.log('DEBUG: Adding direct click handler to document for testing');
    document.addEventListener('click', function(event) {
        // Check if click was on viewDetailsBtn or a child of it
        if (event.target.closest('#viewDetailsBtn')) {
            console.log('DEBUG: View Details button clicked via document event delegation');
            
            // Stop event if the original handler didn't work
            event.preventDefault();
            event.stopPropagation();
            
            // Check if we already have booking data
            if (window.currentBookingData) {
                console.log('DEBUG: Using existing currentBookingData:', window.currentBookingData);
                showBookingDetails(window.currentBookingData);
            } else {
                // Try to find booking data
                const storedData = localStorage.getItem('currentBooking');
                if (storedData) {
                    try {
                        const bookingData = JSON.parse(storedData);
                        console.log('DEBUG: Using booking data from localStorage:', bookingData);
                        window.currentBookingData = bookingData;
                        showBookingDetails(bookingData);
                    } catch (error) {
                        console.error('DEBUG: Error parsing booking data from localStorage:', error);
                        alert('Error loading booking data. Please refresh and try again.');
                    }
                } else {
                    console.error('DEBUG: No booking data available to display');
                    alert('No booking information available to display. Please refresh the page and try again.');
                }
            }
        }
    });
    
    // Verify that all dashboard elements exist
    verifyDashboardElements();

    // Wait a moment to ensure the page is fully loaded
    setTimeout(function() {
        addTestButtonToPage();
    }, 1000);
});

// Add a new function to set up the View Details button
function setupViewDetailsButton() {
    console.log('DEBUG: Setting up view details button');
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    
    if (!viewDetailsBtn) {
        console.error('DEBUG: View Details button not found in DOM');
        return;
    }
    
    console.log('DEBUG: Found viewDetailsBtn element:', viewDetailsBtn);
    
    // Remove any existing event listeners to prevent duplicates
    const newBtn = viewDetailsBtn.cloneNode(true);
    viewDetailsBtn.parentNode.replaceChild(newBtn, viewDetailsBtn);
    
    // Get the fresh button reference after replacing
    const freshViewDetailsBtn = document.getElementById('viewDetailsBtn');
    console.log('DEBUG: Created fresh button element:', freshViewDetailsBtn);
    
    // Add the event listener to the fresh button
    freshViewDetailsBtn.addEventListener('click', function(event) {
        console.log('DEBUG: View Details button clicked!', event);
        event.preventDefault();
        event.stopPropagation();
        
        console.log('DEBUG: Current booking data:', window.currentBookingData);
        
        if (window.currentBookingData) {
            console.log('DEBUG: Attempting to show booking details');
            showBookingDetails(window.currentBookingData);
        } else {
            console.error('DEBUG: No booking data available to display');
            alert('No booking information available to display. Please refresh the page and try again.');
        }
    });
    
    // Add an inline click handler as a backup
    freshViewDetailsBtn.onclick = function(event) {
        console.log('DEBUG: View Details button clicked via onclick property!');
        event.preventDefault();
        
        if (window.currentBookingData) {
            showBookingDetails(window.currentBookingData);
        } else {
            alert('No booking information available to display');
        }
        
        return false;
    };
    
    console.log('DEBUG: View Details button handler set up successfully');
}

// Function to set up the rest of the modal event listeners
function setupModalEventListeners(modal, downloadPDF, printBooking) {
    // Print functionality
    if (printBooking) {
        printBooking.addEventListener('click', () => {
            const modalContent = document.getElementById('modalContent');
            if (!modalContent) return;

            const printWindow = window.open('', '', 'width=800,height=600');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Booking Confirmation - ${window.currentBookingData?.id || 'LodgeEase'}</title>
                        <link href="https://cdn.tailwindcss.com" rel="stylesheet">
                        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
                        <style>
                            @media print {
                                @page {
                                    size: letter portrait;
                                    margin: 0.5in;
                                }
                                body {
                                    -webkit-print-color-adjust: exact;
                                    print-color-adjust: exact;
                                }
                                .page-break {
                                    page-break-after: always;
                                }
                                .no-print {
                                    display: none !important;
                                }
                                .print-container {
                                    max-width: 100% !important;
                                    width: 100% !important;
                                }
                            }
                            
                            /* Print-friendly font sizes */
                            body {
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                line-height: 1.5;
                                color: #333;
                            }
                            
                            /* Custom classes for print */
                            .print-header {
                                text-align: center;
                                margin-bottom: 1.5rem;
                            }
                            
                            .print-content {
                                width: 100%;
                                max-width: 800px;
                                margin: 0 auto;
                            }
                        </style>
                    </head>
                    <body class="print-ready p-4" onload="window.print(); window.setTimeout(function(){ window.close(); }, 500);">
                        <div class="print-content">${modalContent.innerHTML}</div>
                    </body>
                </html>
            `);
            
            printWindow.document.close();
        });
    }

    // Download PDF functionality
    if (downloadPDF) {
        downloadPDF.addEventListener('click', () => {
            const modalContent = document.getElementById('modalContent');
            if (!modalContent) return;
            
            const printSection = modalContent.querySelector('#printable-content') || modalContent;
            
            const opt = {
                margin: 0.5,
                filename: `booking-confirmation-${window.currentBookingData?.id || 'default'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            
            // Use html2pdf bundle
            html2pdf().set(opt).from(printSection).save();
        });
    }
}

// Add formatDate function to global scope
function formatDate(dateInput) {
    if (!dateInput) return '---';
    
    let date;
    
    // Handle different date formats
    if (typeof dateInput === 'string') {
        // ISO string format
        date = new Date(dateInput);
    } else if (dateInput.seconds) {
        // Firebase timestamp format
        date = new Date(dateInput.seconds * 1000);
    } else if (dateInput.toDate && typeof dateInput.toDate === 'function') {
        // Firestore Timestamp object
        date = dateInput.toDate();
    } else if (dateInput instanceof Date) {
        // Already a Date object
        date = dateInput;
    } else {
        console.error('Unknown date format:', dateInput);
        return 'Invalid Date';
    }
    
    // Check if we have a valid date
    if (isNaN(date.getTime())) {
        console.error('Invalid date value:', dateInput);
        return 'Invalid Date';
    }
    
    try {
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return date.toLocaleDateString();
    }
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
        const bookingsRef = collection(getDb, 'everlodgebookings');
        
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

// Function to check for booking confirmation from various sources
async function checkBookingConfirmation() {
    try {
        console.log('Checking for booking confirmation in session storage...');
        
        const bookingData = JSON.parse(sessionStorage.getItem('bookingConfirmation'));
        
        if (bookingData) {
            console.log('Found booking confirmation in session storage:', bookingData);
            window.currentBookingData = bookingData; // Store in window object
            displayBookingInfo(bookingData);
            return true;
        }
        
        // Fallback to localStorage
        console.log('Checking localStorage for booking data...');
        
        // Try to get booking data from numerous possible sources
        try {
            // Try confirmation data from successful booking flow
            const confirmationData = localStorage.getItem('bookingConfirmation');
            
            if (confirmationData) {
                console.log('Found booking confirmation data in localStorage');
                const bookingData = JSON.parse(confirmationData);
                
                if (bookingData && (bookingData.id || bookingData.bookingId)) {
                    console.log('Displaying booking info from backup data');
                    window.currentBookingData = bookingData; // Store in window object
                    displayBookingInfo(bookingData);
                    return true;
                }
            }
            
            // Try current booking data which might be set by other flows
            const storedBookingData = localStorage.getItem('currentBooking');
            
            if (storedBookingData) {
                console.log('Found current booking data in localStorage');
                const bookingData = JSON.parse(storedBookingData);
                
                if (bookingData && (bookingData.id || bookingData.bookingId)) {
                    console.log('Displaying booking info from current booking data');
                    window.currentBookingData = bookingData; // Store in window object
                    displayBookingInfo(bookingData);
                    return true;
                }
            }
            
            // Last resort - look for a booking ID and fetch from Firebase
            const bookingId = localStorage.getItem('lastBookingId');
            
            if (bookingId) {
                console.log(`Found booking ID ${bookingId} in localStorage, fetching from Firebase`);
                
                const bookingData = await fetchBookingById(bookingId);
                
                if (bookingData) {
                    console.log('Successfully retrieved booking from localStorage ID');
                    window.currentBookingData = bookingData; // Store in window object
                    displayBookingInfo(bookingData);
                    return true;
                }
            }
        } catch (error) {
            console.error('Error parsing local storage booking data:', error);
        }
        
        // If all else fails, display the no booking info screen
        console.log('No booking data found in any storage location');
        displayNoBookingInfo();
        return false;
    } catch (error) {
        console.error('Error checking booking confirmation:', error);
        displayNoBookingInfo();
        return false;
    }
}

// Function to fetch booking by ID with retry logic
async function fetchBookingById(bookingId, collectionName = 'everlodgebookings') {
    console.log(`Fetching booking with ID: ${bookingId} from collection: ${collectionName}`);
    
    if (!bookingId) {
        console.error('No booking ID provided to fetch');
        return null;
    }
    
    // Initialize Firebase if not already done
    const db = getDb();
    if (!db) {
        console.error('Firestore not initialized');
        return null;
    }
    
    // Setup retry logic
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} to fetch booking ${bookingId}`);
            
            // Create the document reference
            const bookingRef = doc(db, collectionName, bookingId);
            
            // Get the document
            const bookingDoc = await getDoc(bookingRef);
            
            if (bookingDoc.exists()) {
                // Construct the booking data with the document ID
                const bookingData = {
                    id: bookingDoc.id,
                    ...bookingDoc.data()
                };
                
                console.log('Successfully fetched booking data:', bookingData);
                
                // Store the booking data for future reference
                localStorage.setItem('currentBooking', JSON.stringify(bookingData));
                localStorage.setItem('currentBookingId', bookingId);
                
                // Display the booking info
                displayBookingInfo(bookingData);
                
                return bookingData;
            } else {
                console.warn(`Booking document ${bookingId} not found in collection ${collectionName}`);
                
                if (attempt < maxRetries) {
                    console.log(`Retry attempt ${attempt + 1} in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        } catch (error) {
            console.error(`Error fetching booking (attempt ${attempt}):`, error);
            
            if (attempt < maxRetries) {
                console.log(`Retry attempt ${attempt + 1} in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    
    console.error(`Failed to fetch booking ${bookingId} after ${maxRetries} attempts`);
    return null;
}

// Function to display booking information
function displayBookingInfo(bookingData) {
    try {
        console.log('DASHBOARD DEBUG: Displaying booking information:', bookingData);
        
        // Store booking data globally for later use (for View Details button)
        window.currentBookingData = bookingData;
        
        // Get all the booking details UI elements
        const elements = {
            guestName: document.getElementById('guest-name'),
            bookingStatus: document.getElementById('booking-status'),
            roomNumber: document.getElementById('room-number'),
            guestCount: document.getElementById('guest-count'),
            checkInDate: document.getElementById('check-in-date'),
            checkOutDate: document.getElementById('check-out-date'),
            ratePerNight: document.getElementById('rate-per-night'),
            totalAmount: document.getElementById('total-amount')
        };
        
        // Check which elements exist
        Object.entries(elements).forEach(([key, element]) => {
            if (!element) {
                console.error(`DASHBOARD DEBUG: Element not found: ${key}`);
            }
        });
        
        // Update guest name if available
        if (elements.guestName) {
            elements.guestName.textContent = bookingData.guestName || 'Guest';
        }
        
        // Set room details - handle different data structures flexibly
        const propertyDetails = bookingData.propertyDetails || {};
        if (elements.roomNumber) {
            const roomNumber = propertyDetails.roomNumber || 
                              propertyDetails.roomNo || 
                              propertyDetails.room || 
                              'N/A';
            elements.roomNumber.textContent = roomNumber;
        }
        
        // Set guest count
        if (elements.guestCount) {
            const guestCount = bookingData.guests || 
                              bookingData.guestCount || 
                              bookingData.numberOfGuests || 
                              1;
            elements.guestCount.textContent = guestCount;
        }
        
        // Format and set dates
        if (elements.checkInDate || elements.checkOutDate) {
            const formatDate = (dateString) => {
                if (!dateString) return 'Not specified';
                
                let date;
                
                // Handle different date formats
                if (typeof dateString === 'string') {
                    // ISO string format
                    date = new Date(dateString);
                } else if (dateString.seconds) {
                    // Firebase timestamp format
                    date = new Date(dateString.seconds * 1000);
                } else if (dateString.toDate && typeof dateString.toDate === 'function') {
                    // Firestore Timestamp object
                    date = dateString.toDate();
                } else if (dateString instanceof Date) {
                    // Already a Date object
                    date = dateString;
                } else {
                    console.error('Unknown date format:', dateString);
                    return 'Invalid Date';
                }
                
                // Check if we have a valid date
                if (isNaN(date.getTime())) {
                    console.error('Invalid date value:', dateString);
                    return 'Invalid Date';
                }
                
                try {
                    return date.toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    });
                } catch (error) {
                    console.error('Error formatting date:', error);
                    return date.toLocaleDateString();
                }
            };
            
            if (elements.checkInDate) {
                elements.checkInDate.textContent = formatDate(bookingData.checkIn);
            }
            
            if (elements.checkOutDate) {
                elements.checkOutDate.textContent = formatDate(bookingData.checkOut);
            }
        }
        
        // Set pricing information
        const formatPrice = (price) => {
            // Check if price is a number or a string that can be converted to a number
            if (isNaN(price)) {
                return price; // Return as is if not a number
            }
            
            // Format as PHP currency
            return '₱' + parseFloat(price).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        };
        
        if (elements.ratePerNight) {
            const rate = bookingData.nightlyRate || 
                        bookingData.rate || 
                        bookingData.pricePerNight || 
                        0;
            elements.ratePerNight.textContent = formatPrice(rate);
        }
        
        if (elements.totalAmount) {
            const total = bookingData.totalPrice || 
                         bookingData.totalAmount || 
                         bookingData.totalCost || 
                         0;
            elements.totalAmount.textContent = formatPrice(total);
        }
        
        // Set booking status message
        if (elements.bookingStatus) {
            const status = bookingData.status || 'confirmed';
            let statusMessage = '';
            
            switch (status.toLowerCase()) {
                case 'active':
                case 'confirmed':
                    statusMessage = 'Your booking is confirmed';
                    elements.bookingStatus.style.color = '#047857'; // Green
                    break;
                case 'pending':
                    statusMessage = 'Your booking is pending confirmation';
                    elements.bookingStatus.style.color = '#B45309'; // Amber
                    break;
                case 'completed':
                    statusMessage = 'Your stay has been completed';
                    elements.bookingStatus.style.color = '#1F2937'; // Gray
                    break;
                case 'cancelled':
                    statusMessage = 'This booking has been cancelled';
                    elements.bookingStatus.style.color = '#DC2626'; // Red
                    break;
                default:
                    statusMessage = `Booking status: ${status}`;
                    elements.bookingStatus.style.color = '#2563EB'; // Blue
            }
            
            elements.bookingStatus.textContent = statusMessage;
        }
        
        console.log('DASHBOARD DEBUG: Successfully displayed booking information');
        
    } catch (error) {
        console.error('DASHBOARD DEBUG: Error displaying booking information:', error);
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
        if (getAuth.currentUser) {
            const bookingHistoryContainer = document.getElementById('bookingHistoryContainer');
            // Only reload if showing loading message
            if (bookingHistoryContainer.querySelector('p.text-center.py-16')) {
                console.log('Loading booking history for user:', getAuth.currentUser.uid);
                loadBookingHistory(getAuth.currentUser.uid, getDb);
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

// Function to handle modal opening and display booking details
function showBookingDetails(booking) {
    console.log('DEBUG: showBookingDetails called with booking:', booking);
    
    // Get the modal element
    const modal = document.getElementById('bookingModal');
    if (!modal) {
        console.error('DEBUG: Modal element not found - cannot find #bookingModal');
        alert('Error: Cannot find the booking details modal. Please contact support.');
        return;
    }
    
    console.log('DEBUG: Found modal element:', modal);
    
    // Get or create the modal content
    let modalContent = document.getElementById('modalContent');
    if (!modalContent) {
        console.error('DEBUG: Modal content element not found - cannot find #modalContent');
        alert('Error: Cannot find the modal content area. Please contact support.');
        return;
    }

    console.log('DEBUG: Found modalContent element:', modalContent);
    
    try {
        console.log('DEBUG: Building modal content HTML');
        // Use the exact totalPrice value without modification
        const totalAmount = parseFloat(booking.totalPrice || 0);
        
        // Set the content of the modal with the booking details
        modalContent.innerHTML = `
            <div id="printable-content" class="relative overflow-hidden">
                <!-- Background watermark -->
                <div class="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none" style="z-index: 0;">
                    <img src="https://lms-app-2b903.web.app/components/LodgeEaseLogo.png" alt="LodgeEase Watermark" class="w-64 h-64">
                </div>
                
                <div class="relative z-10">
                    <!-- Header with logo -->
                    <div class="text-center mb-6 border-b pb-4">
                        <div class="flex items-center justify-center mb-2">
                            <img src="https://lms-app-2b903.web.app/components/LodgeEaseLogo.png" alt="LodgeEase Logo" class="h-16 w-16 mr-3">
                            <div class="text-left">
                                <h1 class="text-2xl font-bold text-blue-600">LodgeEase</h1>
                                <p class="text-sm text-gray-600">Aspiras Palispis Highway, Baguio City</p>
                            </div>
                        </div>
                        <h2 class="text-xl font-bold text-gray-800 mt-4">OFFICIAL BOOKING CONFIRMATION</h2>
                    </div>

                    <!-- Booking Reference and Status -->
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-gray-700 font-medium">Booking Reference:</span>
                            <span class="font-mono font-bold bg-blue-50 px-2 py-1 rounded">${booking.id || '---'}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-gray-700 font-medium">Status:</span>
                            <span class="font-medium px-2 py-1 rounded ${
                                booking.status === 'cancelled' ? 'bg-red-50 text-red-600' : 
                                booking.status === 'pending' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'
                            }">
                                ${booking.status ? booking.status.charAt(0).toUpperCase() + 
                                booking.status.slice(1) : 'Unknown'}
                            </span>
                        </div>
                        ${booking.paymentStatus ? `
                        <div class="flex justify-between items-center mt-2">
                            <span class="text-gray-700 font-medium">Payment Status:</span>
                            <span class="font-medium px-2 py-1 rounded ${
                                booking.paymentStatus === 'verified' ? 'bg-green-50 text-green-600' : 
                                booking.paymentStatus === 'pending' ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'
                            }">
                                ${booking.paymentStatus.charAt(0).toUpperCase() + 
                                booking.paymentStatus.slice(1)}
                            </span>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Guest and Hotel Info -->
                    <div class="grid grid-cols-2 gap-6 mb-6">
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h3 class="font-semibold mb-3 text-gray-800 border-b pb-2">Guest Information</h3>
                            <p class="text-gray-700 font-medium">${booking.guestName || '---'}</p>
                            <p class="text-gray-600">${booking.email || '---'}</p>
                            <p class="text-gray-600 mt-2">Number of Guests: ${booking.guests || '---'}</p>
                        </div>
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h3 class="font-semibold mb-3 text-gray-800 border-b pb-2">Hotel Information</h3>
                            <p class="text-gray-700 font-medium">LodgeEase Hotel</p>
                            <p class="text-gray-600">Aspiras Palispis Highway</p>
                            <p class="text-gray-600">Baguio City, 2600</p>
                            <p class="text-gray-600 mt-2">+63 912 991 2658</p>
                        </div>
                    </div>

                    <!-- Stay Details -->
                    <div class="bg-blue-50 border border-blue-100 rounded-lg p-5 mb-6">
                        <h3 class="font-semibold mb-4 text-blue-800 border-b border-blue-200 pb-2">Stay Details</h3>
                        <div class="grid grid-cols-2 gap-6">
                            <div class="bg-white rounded-lg p-3 shadow-sm">
                                <p class="text-gray-600 text-sm">Check-in Date</p>
                                <p class="font-bold text-gray-800 text-lg">${formatDate(booking.checkIn)}</p>
                                <p class="text-sm text-gray-500 mt-1">After 2:00 PM</p>
                            </div>
                            <div class="bg-white rounded-lg p-3 shadow-sm">
                                <p class="text-gray-600 text-sm">Check-out Date</p>
                                <p class="font-bold text-gray-800 text-lg">${formatDate(booking.checkOut)}</p>
                                <p class="text-sm text-gray-500 mt-1">Before 12:00 PM</p>
                            </div>
                        </div>
                        
                        <!-- Payment Status Information -->
                        <div class="mt-4 pt-3 border-t border-blue-200">
                            <p class="text-gray-600 text-sm">Payment Status</p>
                            ${booking.paymentStatus === 'verified' ? `
                                <p class="font-medium text-green-600 bg-green-50 rounded-lg p-2 mt-1 inline-block">
                                    <i class="fas fa-check-circle mr-1"></i> Payment Verified
                                </p>
                            ` : booking.paymentStatus === 'pending' ? `
                                <p class="font-medium text-yellow-600 bg-yellow-50 rounded-lg p-2 mt-1 inline-block">
                                    <i class="fas fa-clock mr-1"></i> Payment Pending Verification
                                </p>
                                <p class="text-sm text-gray-500 mt-1">Please wait for admin verification</p>
                            ` : booking.paymentStatus === 'rejected' ? `
                                <p class="font-medium text-red-600 bg-red-50 rounded-lg p-2 mt-1 inline-block">
                                    <i class="fas fa-times-circle mr-1"></i> Payment Rejected
                                </p>
                                ${booking.rejectionReason ? `
                                    <p class="text-sm text-red-600 mt-1">Reason: ${booking.rejectionReason}</p>
                                ` : ''}
                            ` : `
                                <p class="font-medium text-gray-600">No Payment Status Available</p>
                            `}
                        </div>
                    </div>

                    <!-- Room Details -->
                    <div class="border border-gray-200 rounded-lg p-4 mb-6">
                        <h3 class="font-semibold mb-3 text-gray-800 border-b pb-2">Room Details</h3>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
                                <span class="text-gray-700 font-medium">Room Number</span>
                                <span class="font-bold">${booking.propertyDetails?.roomNumber || '---'}</span>
                            </div>
                            <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
                                <span class="text-gray-700 font-medium">Room Type</span>
                                <span class="font-bold">${booking.propertyDetails?.roomType || '---'}</span>
                            </div>
                            <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
                                <span class="text-gray-700 font-medium">Rate per Night</span>
                                <span class="font-bold">₱${booking.nightlyRate?.toLocaleString() || '---'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Total Amount -->
                    <div class="bg-gray-800 text-white rounded-lg p-4 mb-6">
                        <div class="flex justify-between items-center text-xl">
                            <span class="font-medium">Total Amount</span>
                            <span class="font-bold">₱${totalAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <!-- Footer Notes -->
                    <div class="mt-6 text-center border-t border-gray-200 pt-6">
                        <p class="font-medium text-gray-800 mb-2">Please present this booking confirmation upon check-in</p>
                        <div class="text-sm text-gray-600 space-y-1">
                            <p>Check-in time is 2:00 PM. Early check-in is subject to availability.</p>
                            <p>Check-out time is 12:00 PM. Late check-out may incur additional charges.</p>
                            <p>For inquiries, contact: +63 912 991 2658 or lodgeease@example.com</p>
                        </div>
                        <div class="mt-4 text-xs text-gray-500">
                            <p>Booking Reference: ${booking.id || 'N/A'}</p>
                            <p>Generated on: ${new Date().toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Show the modal by removing the hidden class
        console.log('DEBUG: Showing modal - removing hidden class');
        console.log('DEBUG: Modal classes before showing:', modal.className);
        modal.classList.remove('hidden');
        console.log('DEBUG: Modal classes after showing:', modal.className);
        
        // Make sure the close modal button works
        const closeModalBtn = document.getElementById('closeModal');
        if (closeModalBtn) {
            console.log('DEBUG: Found closeModalBtn, setting up click handler');
            // Remove any existing event listeners to prevent duplicates
            const newCloseBtn = closeModalBtn.cloneNode(true);
            closeModalBtn.parentNode.replaceChild(newCloseBtn, closeModalBtn);
            
            // Get the fresh button reference after replacing
            const freshCloseBtn = document.getElementById('closeModal');
            freshCloseBtn.addEventListener('click', function(event) {
                console.log('DEBUG: Close modal button clicked');
                event.preventDefault();
                modal.classList.add('hidden');
            });
        } else {
            console.error('DEBUG: Close button not found - cannot find #closeModal');
        }
        
        // Also allow clicking outside the modal to close it
        console.log('DEBUG: Setting up click outside handler for modal');
        modal.addEventListener('click', function(e) {
            console.log('DEBUG: Modal clicked', e.target, modal);
            if (e.target === modal) {
                console.log('DEBUG: Clicked outside modal content, closing modal');
                modal.classList.add('hidden');
            }
        });
    } catch (error) {
        console.error('DEBUG: Error showing booking details:', error);
        alert('An error occurred while displaying booking details. Please try again or contact support.');
    }
}

// Function to dump all storage contents to console
function dumpStorageToConsole() {
    console.log('===== DASHBOARD DEBUG: Storage Contents =====');
    
    // Dump localStorage
    console.log('--- localStorage ---');
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        let value = '';
        try {
            const rawValue = localStorage.getItem(key);
            // Try to parse as JSON, if not, just show as string
            try {
                const parsedValue = JSON.parse(rawValue);
                value = `[Object/Array with keys: ${Object.keys(parsedValue).join(', ')}]`;
            } catch (e) {
                value = rawValue.length > 50 ? rawValue.substring(0, 50) + '...' : rawValue;
            }
        } catch (e) {
            value = '[Error reading value]';
        }
        console.log(`${key}: ${value}`);
    }
    
    // Dump sessionStorage
    console.log('--- sessionStorage ---');
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        let value = '';
        try {
            const rawValue = sessionStorage.getItem(key);
            // Try to parse as JSON, if not, just show as string
            try {
                const parsedValue = JSON.parse(rawValue);
                value = `[Object/Array with keys: ${Object.keys(parsedValue).join(', ')}]`;
            } catch (e) {
                value = rawValue.length > 50 ? rawValue.substring(0, 50) + '...' : rawValue;
            }
        } catch (e) {
            value = '[Error reading value]';
        }
        console.log(`${key}: ${value}`);
    }
    
    console.log('=======================================');
}

// Function to check if all required dashboard UI elements exist
function verifyDashboardElements() {
    console.log('DASHBOARD DEBUG: Verifying UI elements...');
    
    const requiredElements = [
        { id: 'booking-status', description: 'Booking status message' },
        { id: 'guest-name', description: 'Guest name display' },
        { id: 'room-number', description: 'Room number display' },
        { id: 'guest-count', description: 'Guest count display' },
        { id: 'check-in-date', description: 'Check-in date display' },
        { id: 'check-out-date', description: 'Check-out date display' },
        { id: 'rate-per-night', description: 'Nightly rate display' },
        { id: 'total-amount', description: 'Total amount display' },
        { id: 'viewDetailsBtn', description: 'View details button' }
    ];
    
    let allElementsExist = true;
    const missingElements = [];
    
    requiredElements.forEach(element => {
        const domElement = document.getElementById(element.id);
        if (!domElement) {
            allElementsExist = false;
            missingElements.push(element);
            console.error(`DASHBOARD DEBUG: Missing UI element: ${element.id} (${element.description})`);
        }
    });
    
    if (allElementsExist) {
        console.log('DASHBOARD DEBUG: All required UI elements exist');
        return true;
    } else {
        console.error(`DASHBOARD DEBUG: Missing ${missingElements.length} elements:`, 
            missingElements.map(e => e.id).join(', '));
        return false;
    }
}

// Function to add debugging controls to the page
function addDebugControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.classList.add('debug-controls');
    controlsContainer.style.position = 'fixed';
    controlsContainer.style.bottom = '10px';
    controlsContainer.style.right = '10px';
    controlsContainer.style.zIndex = '9999';
    controlsContainer.style.background = '#f0f0f0';
    controlsContainer.style.padding = '10px';
    controlsContainer.style.border = '1px solid #ccc';
    controlsContainer.style.borderRadius = '5px';
    
    // Add a Force Load button
    const forceLoadBtn = document.createElement('button');
    forceLoadBtn.innerText = 'Force Load Booking';
    forceLoadBtn.style.padding = '5px 10px';
    forceLoadBtn.style.backgroundColor = '#4CAF50';
    forceLoadBtn.style.color = 'white';
    forceLoadBtn.style.border = 'none';
    forceLoadBtn.style.borderRadius = '3px';
    forceLoadBtn.style.cursor = 'pointer';
    
    forceLoadBtn.addEventListener('click', function() {
        console.log('Force Load button clicked');
        
        // Try to load from localStorage first
        const bookingId = localStorage.getItem('currentBookingId') || 
                          localStorage.getItem('lastConfirmedBookingId') ||
                          localStorage.getItem('dashboard_pendingBookingId');
        
        if (bookingId) {
            console.log(`Force loading booking ID: ${bookingId}`);
            fetchBookingById(bookingId, 'everlodgebookings')
                .then(bookingData => {
                    if (bookingData) {
                        console.log('Force loaded booking data:', bookingData);
                        displayBookingInfo(bookingData);
                        alert('Booking data loaded successfully!');
                    } else {
                        console.warn('Force load: No booking data found');
                        alert('No booking data found with ID: ' + bookingId);
                    }
                })
                .catch(error => {
                    console.error('Force load error:', error);
                    alert('Error loading booking: ' + error.message);
                });
        } else {
            console.warn('Force load: No booking ID found in storage');
            alert('No booking ID found in storage');
        }
    });
    
    // Add buttons to container
    controlsContainer.appendChild(forceLoadBtn);
    
    // Add container to body
    document.body.appendChild(controlsContainer);
}

// Function to initialize the bookings modal
function initializeBookingsModal() {
    console.log('Initializing bookings modal...');
    
    // Ensure the modal element has the correct structure and IDs
    const modal = document.getElementById('bookingModal');
    
    if (!modal) {
        console.error('Booking modal element not found in the DOM');
        return;
    }
    
    console.log('Modal found with classes:', modal.className);
    
    // Check if the main content div exists
    const modalContent = document.getElementById('modalContent');
    if (!modalContent) {
        console.error('Modal content element not found in the DOM');
    } else {
        console.log('Modal content element found');
    }
    
    // Check for the action buttons
    const closeBtn = document.getElementById('closeModal');
    const printBtn = document.getElementById('printBooking');
    const downloadBtn = document.getElementById('downloadPDF');
    
    console.log('Modal elements found:', {
        closeBtn: !!closeBtn,
        printBtn: !!printBtn,
        downloadBtn: !!downloadBtn
    });
    
    // Set up the print functionality
    if (printBtn) {
        printBtn.addEventListener('click', function() {
            console.log('Print button clicked');
            if (window.currentBookingData) {
                window.print();
            } else {
                console.error('No booking data available to print');
                alert('No booking information available to print');
            }
        });
    }
    
    // Set up the download PDF functionality
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
            console.log('Download PDF button clicked');
            if (window.currentBookingData) {
                const printableContent = document.getElementById('printable-content');
                if (printableContent) {
                    const opt = {
                        margin: 10,
                        filename: `booking-confirmation-${window.currentBookingData.id || 'lodgeease'}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2 },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };
                    
                    // Generate PDF
                    html2pdf().set(opt).from(printableContent).save();
                } else {
                    console.error('Printable content element not found');
                    alert('Could not generate PDF. Please try again.');
                }
            } else {
                console.error('No booking data available to download');
                alert('No booking information available to download');
            }
        });
    }
    
    // Set up the close modal functionality
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            console.log('Close button clicked');
            modal.classList.add('hidden');
            modal.style.display = 'none';
        });
        
        // Add an additional onclick handler as a fallback
        closeBtn.onclick = function() {
            console.log('Close button clicked via onclick');
            modal.classList.add('hidden');
            modal.style.display = 'none';
            return false;
        };
    }
    
    // Add global closeModal function
    window.closeModal = function() {
        console.log('Global closeModal function called');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    };
    
    // Add the ability to close the modal by clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            console.log('Clicked outside modal content, closing modal');
            modal.classList.add('hidden');
        }
    });
}

// Add the initializeTabs function if it doesn't exist
function initializeTabs() {
    console.log('DEBUG: Initializing tabs');
    
    // Check if we're in the bookings popup/modal
    const bookingsPopup = document.getElementById('bookingsPopup');
    if (!bookingsPopup) {
        console.log('DEBUG: Bookings popup not found, skipping tab initialization');
        return;
    }
    
    const tabButtons = bookingsPopup.querySelectorAll('[data-tab]');
    console.log('DEBUG: Found tab buttons:', tabButtons.length);
    
    // Set up tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            console.log(`DEBUG: Tab button clicked: ${tabName}`);
            
            // Update active tab styles
            tabButtons.forEach(btn => {
                const isActive = btn === button;
                btn.classList.toggle('text-blue-600', isActive);
                btn.classList.toggle('border-b-2', isActive);
                btn.classList.toggle('border-blue-600', isActive);
                btn.classList.toggle('text-gray-500', !isActive);
            });
            
            // Show the selected tab content, hide others
            const tabContents = [
                document.getElementById('currentBookings'),
                document.getElementById('previousBookings'),
                document.getElementById('bookingHistoryContainer')
            ];
            
            tabContents.forEach(content => {
                if (content) {
                    const shouldShow = 
                        (tabName === 'current' && content.id === 'currentBookings') ||
                        (tabName === 'previous' && content.id === 'previousBookings') ||
                        (tabName === 'history' && content.id === 'bookingHistoryContainer');
                    
                    content.classList.toggle('hidden', !shouldShow);
                }
            });
        });
    });
}

// Add a manual test function that can be called from the browser console
window.testViewDetailsButton = function() {
    console.log('DEBUG: Manual test of View Details button triggered');
    
    // Check if the View Details button exists
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    console.log('DEBUG: viewDetailsBtn exists:', !!viewDetailsBtn);
    
    if (viewDetailsBtn) {
        console.log('DEBUG: Manually triggering click on viewDetailsBtn');
        viewDetailsBtn.click();
    } else {
        console.error('DEBUG: View Details button not found for testing');
    }
};

// Check if booking data is available in storage and load it
window.loadBookingData = function() {
    console.log('DEBUG: Manual test of loading booking data');
    
    // Try to load from various storage locations
    const sources = [
        { name: 'sessionStorage.bookingConfirmation', value: sessionStorage.getItem('bookingConfirmation') },
        { name: 'localStorage.bookingConfirmation', value: localStorage.getItem('bookingConfirmation') },
        { name: 'localStorage.currentBooking', value: localStorage.getItem('currentBooking') }
    ];
    
    console.log('DEBUG: Available data sources:', sources);
    
    // Try each source
    for (const source of sources) {
        if (source.value) {
            try {
                const bookingData = JSON.parse(source.value);
                console.log(`DEBUG: Successfully loaded booking data from ${source.name}:`, bookingData);
                
                // Set as current booking data
                window.currentBookingData = bookingData;
                
                // Try to display it
                if (typeof displayBookingInfo === 'function') {
                    displayBookingInfo(bookingData);
                    console.log('DEBUG: Displayed booking info from loaded data');
                }
                
                return bookingData;
            } catch (error) {
                console.error(`DEBUG: Error parsing data from ${source.name}:`, error);
            }
        }
    }
    
    console.error('DEBUG: No valid booking data found in any storage location');
    return null;
};

// Provide a direct function to show the modal with any booking data
window.showBookingModal = function(bookingData) {
    console.log('DEBUG: Manual test of showing booking modal');
    
    // Use provided booking data or existing data
    const dataToUse = bookingData || window.currentBookingData;
    
    if (dataToUse) {
        console.log('DEBUG: Showing booking details with data:', dataToUse);
        showBookingDetails(dataToUse);
    } else {
        console.error('DEBUG: No booking data available for modal');
        alert('No booking data available. Please load booking data first.');
    }
};

// Create a sample booking data for testing
window.createTestBookingData = function() {
    console.log('DEBUG: Creating test booking data');
    
    const testData = {
        id: 'test-booking-' + new Date().getTime(),
        guestName: 'Test Guest',
        email: 'testguest@example.com',
        status: 'confirmed',
        paymentStatus: 'verified',
        guests: 2,
        propertyDetails: {
            roomNumber: '101',
            roomType: 'Deluxe Room'
        },
        checkIn: new Date().toISOString(),
        checkOut: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        nightlyRate: 2500,
        totalPrice: 7500
    };
    
    console.log('DEBUG: Created test booking data:', testData);
    
    // Store in window and localStorage for future use
    window.currentBookingData = testData;
    localStorage.setItem('currentBooking', JSON.stringify(testData));
    
    return testData;
};

// Create a visible test button on the page
function addTestButtonToPage() {
    console.log('DEBUG: Adding test button to page');
    
    // Create a button container
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'debug-buttons';
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.bottom = '20px';
    buttonContainer.style.left = '20px';
    buttonContainer.style.zIndex = '9999';
    buttonContainer.style.backgroundColor = '#f0f0f0';
    buttonContainer.style.padding = '10px';
    buttonContainer.style.borderRadius = '5px';
    buttonContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    
    // Create test button
    const testButton = document.createElement('button');
    testButton.textContent = 'Test View Details';
    testButton.style.backgroundColor = '#4CAF50';
    testButton.style.color = 'white';
    testButton.style.padding = '10px 15px';
    testButton.style.border = 'none';
    testButton.style.borderRadius = '4px';
    testButton.style.cursor = 'pointer';
    testButton.style.marginRight = '10px';
    
    // Add click handler
    testButton.addEventListener('click', function() {
        console.log('DEBUG: Test button clicked');
        
        // Check if we have booking data
        if (!window.currentBookingData) {
            console.log('DEBUG: No booking data found, creating test data');
            window.createTestBookingData();
        }
        
        // Show the modal
        window.showBookingModal();
    });
    
    // Create data load button
    const loadDataButton = document.createElement('button');
    loadDataButton.textContent = 'Load Booking Data';
    loadDataButton.style.backgroundColor = '#2196F3';
    loadDataButton.style.color = 'white';
    loadDataButton.style.padding = '10px 15px';
    loadDataButton.style.border = 'none';
    loadDataButton.style.borderRadius = '4px';
    loadDataButton.style.cursor = 'pointer';
    
    // Add click handler
    loadDataButton.addEventListener('click', function() {
        console.log('DEBUG: Load data button clicked');
        window.loadBookingData();
    });
    
    // Add buttons to container
    buttonContainer.appendChild(testButton);
    buttonContainer.appendChild(loadDataButton);
    
    // Add container to page
    document.body.appendChild(buttonContainer);
    
    console.log('DEBUG: Test buttons added to page');
}

// Add these test functions to console.log for visibility
console.log('DEBUG: Test functions available in browser console:');
console.log('- window.testViewDetailsButton() - Test the View Details button');
console.log('- window.loadBookingData() - Load booking data from storage');
console.log('- window.showBookingModal() - Directly show the booking modal');
console.log('- window.createTestBookingData() - Create test booking data');