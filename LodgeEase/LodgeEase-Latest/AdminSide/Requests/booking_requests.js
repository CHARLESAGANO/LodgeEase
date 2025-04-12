import { initializeApp } from "https://www.gstatic.com/firebasejs/9.18.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/9.18.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    getDoc,
    updateDoc, 
    doc, 
    Timestamp,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.18.0/firebase-firestore.js";

// Initialize Firebase with your config
const firebaseConfig = {
    apiKey: "AIzaSyBAJr0JQgWRfGTmSXTK6P7Yn8fkHXG2YeE",
    authDomain: "lms-app-2b903.firebaseapp.com",
    projectId: "lms-app-2b903",
    storageBucket: "lms-app-2b903.appspot.com",
    messagingSenderId: "1046108373013",
    appId: "1:1046108373013:web:fc366db1d92b9c4b860e1c",
    measurementId: "G-WRMW9Z8867"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Set persistence to LOCAL (this keeps the user logged in)
setPersistence(auth, browserLocalPersistence)
    .catch((error) => {
        console.error("Auth persistence error:", error);
    });

// Function declarations moved outside DOMContentLoaded
async function loadModificationRequests() {
    try {
        const requestsRef = collection(db, 'modificationRequests');
        const q = query(
            requestsRef,
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        const container = document.getElementById('modificationRequests');
        container.innerHTML = `
            <div class="text-gray-500 text-center py-10">
                <svg class="mx-auto h-12 w-12 text-gray-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-2">Loading requests...</p>
            </div>
        `;

        try {
            const snapshot = await getDocs(q);
            container.innerHTML = '';

            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-10 text-gray-500">
                        <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p class="text-lg font-medium">No pending modification requests</p>
                        <p class="text-sm">When guests request booking changes, they'll appear here</p>
                    </div>
                `;
                return;
            }

            snapshot.forEach(doc => {
                const request = doc.data();
                container.appendChild(createModificationRequestCard(doc.id, request));
            });
        } catch (error) {
            if (error.code === 'failed-precondition' || error.message.includes('requires an index')) {
                container.innerHTML = `
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700">
                                    Index not ready. Please wait a few moments and refresh the page.
                                </p>
                                <p class="mt-2 text-xs text-yellow-600">
                                    If the problem persists, ask an administrator to check the Firebase indexes.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error loading modification requests:', error);
        const container = document.getElementById('modificationRequests');
        container.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">
                            Error loading requests: ${error.message}
                        </p>
                        <p class="mt-2 text-xs text-red-600">
                            Please try again later or contact support.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}

async function loadCancellationRequests() {
    try {
        const requestsRef = collection(db, 'cancellationRequests');
        console.log('Starting to load cancellation requests...');

        const container = document.getElementById('cancellationRequests');
        container.innerHTML = `
            <div class="text-gray-500 text-center py-10">
                <svg class="mx-auto h-12 w-12 text-gray-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-2">Loading requests...</p>
            </div>
        `;

        const snapshot = await getDocs(requestsRef);
        console.log('Total cancellation requests found:', snapshot.size);
        
        snapshot.forEach(doc => {
            console.log('Request:', {
                id: doc.id,
                status: doc.data().status,
                booking: doc.data().booking?.id,
                createdAt: doc.data().createdAt?.toDate()
            });
        });

        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-gray-500">
                    <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p class="text-lg font-medium">No cancellation requests found</p>
                    <p class="text-sm">When guests request booking cancellations, they'll appear here</p>
                </div>
            `;
            return;
        }

        const pendingRequests = snapshot.docs.filter(doc => doc.data().status === 'pending');
        console.log('Pending cancellation requests:', pendingRequests.length);

        if (pendingRequests.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-gray-500">
                    <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p class="text-lg font-medium">No pending cancellation requests</p>
                    <p class="text-sm">All cancellation requests have been processed</p>
                </div>
            `;
            return;
        }

        pendingRequests.forEach(doc => {
            const request = doc.data();
            console.log('Creating card for request:', doc.id, request);
            container.appendChild(createCancellationRequestCard(doc.id, request));
        });

    } catch (error) {
        console.error('Detailed error loading cancellation requests:', error);
        const container = document.getElementById('cancellationRequests');
        container.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">
                            Error loading requests: ${error.message}
                        </p>
                        <p class="mt-2 text-xs text-red-600">
                            Error code: ${error.code || 'unknown'}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}

async function loadPaymentVerificationRequests() {
    const container = document.getElementById('paymentVerificationRequests');
    if (!container) {
        console.error('Payment verification requests container not found');
        return;
    }

    try {
        const requestsRef = collection(db, 'paymentVerificationRequests');
        const q = query(
            requestsRef,
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        // Set up real-time listener
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            try {
                container.innerHTML = `
                    <div class="text-gray-500 text-center py-10">
                        <svg class="mx-auto h-12 w-12 text-gray-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p class="mt-2">Loading payment verification requests...</p>
                    </div>
                `;

                if (snapshot.empty) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-10 text-gray-500">
                            <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            <p class="text-lg font-medium">No pending payment verification requests</p>
                            <p class="text-sm">When guests submit payment proofs, they'll appear here</p>
                        </div>
                    `;
                    return;
                }

                // Process each payment verification request
                const promises = snapshot.docs.map(async (docSnapshot) => {
                    const request = docSnapshot.data();
                    
                    // Fetch booking details if we have a booking ID
                    if (request.bookingId) {
                        try {
                            const bookingDocRef = doc(db, 'everlodgebookings', request.bookingId);
                            const bookingDocSnapshot = await getDoc(bookingDocRef);
                            if (bookingDocSnapshot.exists()) {
                                request.bookingDetails = bookingDocSnapshot.data();
                            }
                        } catch (err) {
                            console.error(`Error fetching booking ${request.bookingId}:`, err);
                        }
                    }
                    
                    // Fetch user details if we have a user ID
                    if (request.userId) {
                        try {
                            const userDocRef = doc(db, 'users', request.userId);
                            const userDocSnapshot = await getDoc(userDocRef);
                            if (userDocSnapshot.exists()) {
                                request.userDetails = userDocSnapshot.data();
                            }
                        } catch (err) {
                            console.error(`Error fetching user ${request.userId}:`, err);
                        }
                    }
                    
                    return { id: docSnapshot.id, ...request };
                });

                const requests = await Promise.all(promises);
                
                // Create and append cards for each request
                container.innerHTML = ''; // Clear existing content
                requests.forEach(request => {
                    const card = createPaymentVerificationCard(request.id, request);
                    container.appendChild(card);
                });

                // Add notification for new requests if any
                if (snapshot.docChanges().some(change => change.type === 'added')) {
                    showNotification('New payment verification request received');
                }
            } catch (error) {
                console.error('Error processing payment verification requests:', error);
                container.innerHTML = `
                    <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-red-700">
                                    Error loading requests: ${error.message}
                                </p>
                                <p class="mt-2 text-xs text-red-600">
                                    Please try again later or contact support.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }, (error) => {
            console.error('Error setting up real-time listener:', error);
            container.innerHTML = `
                <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-red-700">
                                Error setting up real-time updates: ${error.message}
                            </p>
                            <p class="mt-2 text-xs text-red-600">
                                Please refresh the page to try again.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        });

        // Clean up listener when component unmounts
        return () => unsubscribe();
    } catch (error) {
        console.error('Error in loadPaymentVerificationRequests:', error);
        container.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">
                            Error initializing payment verification requests: ${error.message}
                        </p>
                        <p class="mt-2 text-xs text-red-600">
                            Please refresh the page to try again.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}

// Set up real-time listeners for both request types
function setupRequestListeners() {
    // Listen for cancellation requests
    const unsubscribeCancellations = onSnapshot(collection(db, 'cancellationRequests'), (snapshot) => {
        console.log('Cancellation requests updated:', snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })));
        loadCancellationRequests();
    });

    // Listen for modification requests
    const unsubscribeModifications = onSnapshot(collection(db, 'modificationRequests'), (snapshot) => {
        console.log('Modification requests updated:', snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })));
        loadModificationRequests();
    });

    // Listen for payment verification requests
    const unsubscribePayments = onSnapshot(
        query(
            collection(db, 'paymentVerificationRequests'),
            where('status', '==', 'pending')
        ),
        (snapshot) => {
            console.log('Payment verification requests updated:', snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })));
            loadPaymentVerificationRequests();
        }
    );

    // Return cleanup functions
    return () => {
        unsubscribeCancellations();
        unsubscribeModifications();
        unsubscribePayments();
    };
}

// Format payment method names for display
function formatPaymentMethod(method) {
    if (!method) return 'Unknown';
    
    const methodMap = {
        'card': 'Credit/Debit Card',
        'gcash': 'GCash',
        'paypal': 'PayPal',
        'bank_transfer': 'Bank Transfer',
        'cash': 'Cash'
    };
    
    return methodMap[method.toLowerCase()] || method;
}

// Format date helper function
function formatDate(date) {
    try {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid Date';
    }
}

// Add notification function
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg transform transition-transform duration-300 translate-y-0';
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-bell mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateY(200%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

function createPaymentVerificationCard(requestId, request) {
    const card = document.createElement('div');
    card.className = 'bg-white border rounded-lg overflow-hidden shadow-sm mb-4';
    card.setAttribute('data-request-id', requestId);

    // Format creation date
    const createdDate = request.createdAt ? 
        new Date(request.createdAt.toDate()).toLocaleString() : 'N/A';
    
    // Get user information
    const userName = request.userDetails?.name || request.userDetails?.fullname || 'Unknown User';
    const userEmail = request.userDetails?.email || 'No email provided';
    
    // Get booking information
    const bookingId = request.bookingId || 'N/A';
    const propertyName = request.bookingDetails?.propertyDetails?.name || 
                        request.bookingDetails?.propertyName || 
                        'Unknown Property';
    
    // Format payment method for display
    const paymentMethodDisplay = formatPaymentMethod(request.paymentMethod);
    
    // Create payment verification card HTML
    card.innerHTML = `
        <div class="border-b border-gray-200">
            <div class="flex justify-between items-center p-4 bg-gray-50">
                <div>
                    <h3 class="font-semibold text-lg text-gray-800">${propertyName}</h3>
                    <span class="text-sm text-gray-500">Payment Verification</span>
                </div>
                <span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                    Pending
                </span>
            </div>
        </div>
        
        <div class="p-4">
            <div class="grid md:grid-cols-2 gap-4">
                <div>
                    <h4 class="font-medium text-gray-700 mb-2">Payment Details</h4>
                    <div class="space-y-1 text-sm">
                        <p class="flex justify-between">
                            <span class="text-gray-500">Amount:</span>
                            <span class="font-medium">₱${request.amount?.toLocaleString() || 'N/A'}</span>
                        </p>
                        <p class="flex justify-between">
                            <span class="text-gray-500">Payment Method:</span>
                            <span class="font-medium">${paymentMethodDisplay}</span>
                        </p>
                        <p class="flex justify-between">
                            <span class="text-gray-500">Reference Number:</span>
                            <span class="font-medium">${request.referenceNumber || 'N/A'}</span>
                        </p>
                        <p class="flex justify-between">
                            <span class="text-gray-500">Submitted:</span>
                            <span class="font-medium">${createdDate}</span>
                        </p>
                    </div>
                </div>
                
                <div>
                    <h4 class="font-medium text-gray-700 mb-2">Guest Details</h4>
                    <div class="space-y-1 text-sm">
                        <p class="flex justify-between">
                            <span class="text-gray-500">Name:</span>
                            <span class="font-medium">${userName}</span>
                        </p>
                        <p class="flex justify-between">
                            <span class="text-gray-500">Email:</span>
                            <span class="font-medium">${userEmail}</span>
                        </p>
                        <p class="flex justify-between">
                            <span class="text-gray-500">Booking ID:</span>
                            <span class="font-medium">${bookingId}</span>
                        </p>
                        <p class="flex justify-between">
                            <span class="text-gray-500">Request ID:</span>
                            <span class="font-medium text-xs">${requestId}</span>
                        </p>
                    </div>
                </div>
            </div>
            
            ${request.paymentScreenshot ? `
                <div class="mt-4">
                    <h4 class="font-medium text-gray-700 mb-2">Payment Proof</h4>
                    <div class="bg-gray-100 p-2 rounded">
                        <a href="${request.paymentScreenshot}" target="_blank" class="flex items-center text-blue-600 hover:text-blue-800">
                            <i class="fas fa-external-link-alt mr-2"></i>
                            View Payment Screenshot
                        </a>
                    </div>
                </div>
            ` : ''}

            <div class="mt-4 flex justify-end space-x-3">
                <button class="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 reject-btn">
                    Reject
                </button>
                <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 approve-btn">
                    Approve
                </button>
            </div>
        </div>
    `;

    // Add event listeners for approve and reject buttons
    const approveBtn = card.querySelector('.approve-btn');
    const rejectBtn = card.querySelector('.reject-btn');

    approveBtn.addEventListener('click', () => handleApprovePayment(requestId, request));
    rejectBtn.addEventListener('click', () => handleRejectPayment(requestId, request));

    return card;
}

async function handleApprovePayment(requestId, request) {
    try {
        // Update payment verification request status
        const requestRef = doc(db, 'paymentVerificationRequests', requestId);
        await updateDoc(requestRef, {
            status: 'approved',
            processedAt: Timestamp.now()
        });

        // Update booking payment status and overall status
        if (request.bookingId) {
            // Check if this is an Ever Lodge booking
            const isEverLodgeBooking = request.bookingDetails?.propertyDetails?.name === 'Ever Lodge' ||
                                     request.bookingDetails?.lodgeName === 'Ever Lodge';
            
            // Use the correct collection based on the booking type
            const collectionName = isEverLodgeBooking ? 'everlodgebookings' : 'bookings';
            const bookingRef = doc(db, collectionName, request.bookingId);
            
            // Only update the status to 'confirmed' here, after approval
            await updateDoc(bookingRef, {
                paymentStatus: 'verified',
                'paymentDetails.verifiedAt': Timestamp.now(),
                status: 'confirmed'
            });

            // Get room number from booking details or request
            const roomNumber = request.bookingDetails?.roomNumber || 
                             request.bookingDetails?.propertyDetails?.roomNumber || 
                             'N/A';

            // Save to payment history with safe values
            const historyRef = collection(db, 'paymentHistory');
            await addDoc(historyRef, {
                bookingId: request.bookingId,
                guestName: request.userDetails?.name || request.userDetails?.fullname || 'N/A',
                roomNumber: roomNumber,
                amount: request.amount || 0,
                status: 'verified',
                timestamp: serverTimestamp(),
                paymentMethod: request.paymentMethod || 'N/A',
                referenceNumber: request.referenceNumber || 'N/A',
                propertyName: request.bookingDetails?.propertyDetails?.name || 
                            request.bookingDetails?.lodgeName || 'N/A'
            });
            
            // Trigger a dashboard refresh using all available methods
            try {
                // Method 1: Custom events on current document
                const dashboardUpdateEvent = new CustomEvent('dashboard:booking:update', {
                    detail: {
                        bookingId: request.bookingId,
                        action: 'approve'
                    },
                    bubbles: true
                });
                document.dispatchEvent(dashboardUpdateEvent);
                console.log('Dashboard update event dispatched for booking approval');
                
                // Method 2: LocalStorage for cross-tab communication
                localStorage.setItem('dashboard:refresh', JSON.stringify({
                    timestamp: new Date().getTime(),
                    action: 'booking_approved',
                    bookingId: request.bookingId
                }));
                console.log('LocalStorage refresh signal set');
                
                // Method 3: Direct function call if available in various contexts
                if (typeof window.dashboardRefresh === 'function') {
                    console.log('Calling window.dashboardRefresh directly');
                    window.dashboardRefresh();
                } else if (window.parent && typeof window.parent.dashboardRefresh === 'function') {
                    console.log('Calling parent.dashboardRefresh');
                    window.parent.dashboardRefresh();
                } else if (window.top && typeof window.top.dashboardRefresh === 'function') {
                    console.log('Calling top.dashboardRefresh');
                    window.top.dashboardRefresh();
                } else {
                    console.log('Direct dashboard refresh function not available');
                }
                
                // Method 4: Try to find any iframe with Dashboard page and post message
                try {
                    const dashboardFrames = Array.from(document.querySelectorAll('iframe'))
                        .filter(frame => frame.src && frame.src.includes('Dashboard'));
                    
                    if (dashboardFrames.length > 0) {
                        console.log(`Found ${dashboardFrames.length} dashboard frames to notify`);
                        dashboardFrames.forEach(frame => {
                            if (frame.contentWindow) {
                                frame.contentWindow.postMessage({
                                    type: 'refresh-dashboard',
                                    data: { bookingId: request.bookingId }
                                }, '*');
                            }
                        });
                    }
                } catch (frameError) {
                    console.warn('Error notifying dashboard frames:', frameError);
                }
                
                // Method 5: Try to navigate to Dashboard tab and refresh
                try {
                    // Opens in dashboard in new tab if not already open
                    const dashboardWindow = window.open('../Dashboard/Dashboard.html', 'lodgeease-dashboard');
                    if (dashboardWindow) {
                        console.log('Opened dashboard in new window/tab');
                    }
                } catch (windowError) {
                    console.warn('Error opening dashboard tab:', windowError);
                }
            } catch (eventError) {
                console.warn('Error setting up dashboard refresh:', eventError);
            }
        }

        // Show success message
        alert('Payment verification request approved successfully');
        
        // Remove the card from the UI
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
            card.remove();
        }

        // Refresh the payment history
        await loadPaymentHistory();
    } catch (error) {
        console.error('Error approving payment verification:', error);
        alert('Failed to approve payment verification. Please try again.');
    }
}

async function handleRejectPayment(requestId, request) {
    try {
        const reason = prompt('Please enter the reason for rejection:');
        if (reason === null) return; // User cancelled

        // Update payment verification request status
        const requestRef = doc(db, 'paymentVerificationRequests', requestId);
        await updateDoc(requestRef, {
            status: 'rejected',
            processedAt: Timestamp.now(),
            rejectionReason: reason
        });

        // Update booking payment status and overall status
        if (request.bookingId) {
            // Check if this is an Ever Lodge booking
            const isEverLodgeBooking = request.bookingDetails?.propertyDetails?.name === 'Ever Lodge' ||
                                     request.bookingDetails?.lodgeName === 'Ever Lodge';
            
            // Use the correct collection based on the booking type
            const collectionName = isEverLodgeBooking ? 'everlodgebookings' : 'bookings';
            const bookingRef = doc(db, collectionName, request.bookingId);
            
            await updateDoc(bookingRef, {
                paymentStatus: 'rejected',
                'paymentDetails.rejectedAt': Timestamp.now(),
                status: 'cancelled',
                'paymentDetails.rejectionReason': reason
            });

            // Get room number from booking details or request
            const roomNumber = request.bookingDetails?.roomNumber || 
                             request.bookingDetails?.propertyDetails?.roomNumber || 
                             'N/A';

            // Save to payment history with safe values
            const historyRef = collection(db, 'paymentHistory');
            await addDoc(historyRef, {
                bookingId: request.bookingId,
                guestName: request.userDetails?.name || request.userDetails?.fullname || 'N/A',
                roomNumber: roomNumber,
                amount: request.amount || 0,
                status: 'rejected',
                reason: reason || '',
                timestamp: serverTimestamp(),
                paymentMethod: request.paymentMethod || 'N/A',
                referenceNumber: request.referenceNumber || 'N/A',
                propertyName: request.bookingDetails?.propertyDetails?.name || 
                            request.bookingDetails?.lodgeName || 'N/A'
            });
            
            // Trigger a dashboard refresh like we did for approval
            try {
                // Create and dispatch a custom event to notify the dashboard of the update
                const dashboardUpdateEvent = new CustomEvent('dashboard:booking:update', {
                    detail: {
                        bookingId: request.bookingId,
                        action: 'reject'
                    },
                    bubbles: true
                });
                document.dispatchEvent(dashboardUpdateEvent);
                console.log('Dashboard update event dispatched for booking rejection');
                
                // If Dashboard is open in another tab, send a message via localStorage
                localStorage.setItem('dashboard:refresh', JSON.stringify({
                    timestamp: new Date().getTime(),
                    action: 'booking_rejected'
                }));
            } catch (eventError) {
                console.warn('Error dispatching dashboard update event:', eventError);
            }
        }

        // Show success message
        alert('Payment verification request rejected successfully');
        
        // Remove the card from the UI
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
            card.remove();
        }

        // Refresh the payment history
        await loadPaymentHistory();
    } catch (error) {
        console.error('Error rejecting payment verification:', error);
        alert('Failed to reject payment verification. Please try again.');
    }
}

async function handleApproveModification(requestId) {
    try {
        const requestRef = doc(db, 'modificationRequests', requestId);
        const requestDoc = await getDoc(requestRef);
        const request = requestDoc.data();

        if (!request || !request.bookingId) {
            throw new Error('Invalid request data');
        }

        // Update modification request status
        await updateDoc(requestRef, {
            status: 'approved',
            processedAt: Timestamp.now()
        });

        // Update booking with new dates
        const bookingRef = doc(db, 'bookings', request.bookingId);
        await updateDoc(bookingRef, {
            checkIn: request.requestedChanges.checkIn,
            checkOut: request.requestedChanges.checkOut,
            status: 'confirmed'
        });

        alert('Modification request approved successfully');
        await loadModificationRequests();
    } catch (error) {
        console.error('Error approving modification:', error);
        alert('Failed to approve modification request. Please try again.');
    }
}

async function handleRejectModification(requestId) {
    try {
        const requestRef = doc(db, 'modificationRequests', requestId);
        const requestDoc = await getDoc(requestRef);
        const request = requestDoc.data();

        if (!request || !request.bookingId) {
            throw new Error('Invalid request data');
        }

        // Update modification request status
        await updateDoc(requestRef, {
            status: 'rejected',
            processedAt: Timestamp.now()
        });

        // Update booking status to indicate rejection
        const bookingRef = doc(db, 'bookings', request.bookingId);
        await updateDoc(bookingRef, {
            status: 'confirmed'
        });

        alert('Modification request rejected successfully');
        await loadModificationRequests();
    } catch (error) {
        console.error('Error rejecting modification:', error);
        alert('Failed to reject modification request. Please try again.');
    }
}

async function handleApproveCancellation(requestId) {
    try {
        const requestRef = doc(db, 'cancellationRequests', requestId);
        const requestDoc = await getDoc(requestRef);
        const request = requestDoc.data();

        if (!request || !request.bookingId) {
            throw new Error('Invalid request data');
        }

        // Update cancellation request status
        await updateDoc(requestRef, {
            status: 'approved',
            processedAt: Timestamp.now()
        });

        // Update booking status
        const bookingRef = doc(db, 'bookings', request.bookingId);
        await updateDoc(bookingRef, {
            status: 'cancelled',
            cancellationReason: request.reason,
            cancelledAt: Timestamp.now()
        });

        alert('Cancellation request approved successfully');
        await loadCancellationRequests();
    } catch (error) {
        console.error('Error approving cancellation:', error);
        alert('Failed to approve cancellation request. Please try again.');
    }
}

async function handleRejectCancellation(requestId) {
    try {
        const requestRef = doc(db, 'cancellationRequests', requestId);
        const requestDoc = await getDoc(requestRef);
        const request = requestDoc.data();

        if (!request || !request.bookingId) {
            throw new Error('Invalid request data');
        }

        // Update cancellation request status
        await updateDoc(requestRef, {
            status: 'rejected',
            processedAt: Timestamp.now()
        });

        // Update booking status to indicate rejection
        const bookingRef = doc(db, 'bookings', request.bookingId);
        await updateDoc(bookingRef, {
            status: 'confirmed'
        });

        alert('Cancellation request rejected successfully');
        await loadCancellationRequests();
    } catch (error) {
        console.error('Error rejecting cancellation:', error);
        alert('Failed to reject cancellation request. Please try again.');
    }
}

// Function to load payment history (moved outside DOMContentLoaded)
async function loadPaymentHistory(filter = 'all') {
    try {
        const historyRef = collection(db, 'paymentHistory');
        const q = query(historyRef, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const tableBody = document.getElementById('paymentHistoryTableBody');
        if (!tableBody) {
            console.error('Payment history table body not found');
            return;
        }

        // Clear existing content and show loading state
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center">
                    <div class="flex justify-center items-center">
                        <svg class="animate-spin h-5 w-5 mr-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading payment history...
                    </div>
                </td>
            </tr>
        `;

        if (querySnapshot.empty) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                        No payment history found
                    </td>
                </tr>
            `;
            return;
        }

        // Process the data
        let historyData = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            const data = docSnapshot.data();
            let bookingData = {};
            
            // Fetch additional booking details if bookingId exists
            if (data.bookingId) {
                try {
                    const bookingDocRef = doc(db, 'bookings', data.bookingId);
                    const bookingDocSnapshot = await getDoc(bookingDocRef);
                    if (bookingDocSnapshot.exists()) {
                        bookingData = bookingDocSnapshot.data();
                    }
                } catch (err) {
                    console.error(`Error fetching booking ${data.bookingId}:`, err);
                }
            }

            return {
                id: docSnapshot.id,
                ...data,
                timestamp: data.timestamp?.toDate() || new Date(),
                guestName: data.guestName || bookingData.guestName || 'N/A',
                roomNumber: data.roomNumber || bookingData.roomNumber || 'N/A',
                amount: data.amount || bookingData.totalPrice || 0
            };
        }));

        // Filter the data if needed
        if (filter !== 'all') {
            historyData = historyData.filter(item => item.status === filter);
        }

        // Display the data
        if (historyData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                        No ${filter === 'all' ? '' : filter} payments found
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = historyData.map(item => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${item.timestamp.toLocaleDateString()} ${item.timestamp.toLocaleTimeString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${item.guestName}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${item.roomNumber}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ₱${parseFloat(item.amount).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${item.status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${item.status === 'verified' ? 'Approved' : 'Rejected'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${item.reason || '---'}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading payment history:', error);
        const tableBody = document.getElementById('paymentHistoryTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-red-500">
                        Error loading payment history. Please try again.
                    </td>
                </tr>
            `;
        }
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    let unsubscribeAuth = null;
    let authInitialized = false;

    // Initialize payment history modal functionality
    const modal = document.getElementById('paymentHistoryModal');
    const openBtn = document.getElementById('viewPaymentHistoryBtn');
    const closeBtn = document.getElementById('closePaymentHistoryModal');
    const showAllBtn = document.getElementById('showAllHistory');
    const showApprovedBtn = document.getElementById('showApproved');
    const showRejectedBtn = document.getElementById('showRejected');

    if (!modal || !openBtn || !closeBtn) {
        console.error('Required modal elements not found');
        return;
    }

    // Load initial payment history
    loadPaymentHistory();

    // Open modal
    openBtn.addEventListener('click', () => {
        console.log('Opening payment history modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        loadPaymentHistory();
    });

    // Close modal
    closeBtn.addEventListener('click', () => {
        console.log('Closing payment history modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    });

    // Filter buttons
    if (showAllBtn) {
        showAllBtn.addEventListener('click', () => {
            console.log('Showing all payment history');
            loadPaymentHistory('all');
        });
    }

    if (showApprovedBtn) {
        showApprovedBtn.addEventListener('click', () => {
            console.log('Showing approved payments');
            loadPaymentHistory('verified');
        });
    }

    if (showRejectedBtn) {
        showRejectedBtn.addEventListener('click', () => {
            console.log('Showing rejected payments');
            loadPaymentHistory('rejected');
        });
    }

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            console.log('Closing modal (clicked outside)');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    });

    // Tab switching functionality
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active', 'border-blue-500', 'text-blue-600'));
            tabs.forEach(t => t.classList.add('text-gray-500', 'border-transparent'));
            tab.classList.add('active', 'border-blue-500', 'text-blue-600');
            tab.classList.remove('text-gray-500', 'border-transparent');

            tabContents.forEach(content => content.classList.add('hidden'));
            const targetContent = document.getElementById(`${tab.dataset.tab}`);
            targetContent.classList.remove('hidden');
        });
    });

    // Auth state management
    try {
        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            try {
                console.log("Auth state changed:", user ? "User exists" : "No user");
                
                // Skip if auth is already initialized and user exists
                if (authInitialized && user) {
                    console.log("Auth already initialized, skipping checks");
                    return;
                }

                if (user) {
                    authInitialized = true;
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    console.log("User document:", userDoc.exists() ? "exists" : "does not exist");

                    if (userDoc.exists()) {
                        // Store user data in sessionStorage
                        sessionStorage.setItem('userAuthenticated', 'true');
                        sessionStorage.setItem('userId', user.uid);
                        
                        console.log("Setting up listeners and loading requests");
                        const cleanup = setupRequestListeners();
                        await loadRequests();

                        // Clean up listeners when the page is unloaded
                        window.addEventListener('unload', cleanup);
                    } else {
                        console.error('User document not found');
                        sessionStorage.clear();
                        if (!window.location.href.includes('Login/index.html')) {
                            window.location.href = '../Login/index.html';
                        }
                    }
                } else if (sessionStorage.getItem('userAuthenticated')) {
                    // User was previously authenticated in this session
                    console.log("Session exists but no user, waiting for auth...");
                    // Don't redirect immediately, wait for a moment
                    setTimeout(() => {
                        if (!auth.currentUser) {
                            console.log("No user after delay, redirecting");
                            sessionStorage.clear();
                            window.location.href = '../Login/index.html';
                        }
                    }, 2000);
                }
            } catch (error) {
                console.error('Auth state error:', error);
                // Only redirect on critical errors
                if (error.code === 'permission-denied') {
                    sessionStorage.clear();
                    window.location.href = '../Login/index.html';
                }
            }
        });
    } catch (error) {
        console.error('Auth setup error:', error);
    }

    // Add page visibility change handler
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && auth.currentUser) {
            console.log('Page became visible, refreshing data...');
            try {
                await loadRequests();
            } catch (error) {
                console.error('Error refreshing data:', error);
            }
        }
    });

    // Cleanup on page unload
    window.addEventListener('unload', () => {
        if (unsubscribeAuth) {
            unsubscribeAuth();
        }
    });

    async function loadRequests() {
        try {
            await Promise.all([
                loadModificationRequests(),
                loadCancellationRequests(),
                loadPaymentVerificationRequests()
            ]);
        } catch (error) {
            console.error('Error loading requests:', error);
            handleLoadError(error);
        }
    }

    function handleLoadError(error) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'bg-red-50 border-l-4 border-red-400 p-4 rounded my-4';
        
        const content = document.createElement('div');
        content.className = 'flex';
        
        const icon = document.createElement('div');
        icon.className = 'flex-shrink-0';
        icon.innerHTML = `
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
        `;
        
        const textContent = document.createElement('div');
        textContent.className = 'ml-3';
        
        if (error.code === 'failed-precondition' || error.message.includes('requires an index')) {
            textContent.innerHTML = `
                <p class="text-sm text-red-700">Database index not ready</p>
                <p class="mt-1 text-xs text-red-600">Please wait a few moments and refresh the page.</p>
            `;
        } else if (error.code === 'permission-denied') {
            textContent.innerHTML = `
                <p class="text-sm text-red-700">You do not have permission to view these requests</p>
                <p class="mt-1 text-xs text-red-600">Redirecting to login page...</p>
            `;
            setTimeout(() => window.location.href = '../Login/index.html', 2000);
        } else {
            textContent.innerHTML = `
                <p class="text-sm text-red-700">Failed to load requests</p>
                <p class="mt-1 text-xs text-red-600">Please refresh the page or try again later.</p>
            `;
        }
        
        content.appendChild(icon);
        content.appendChild(textContent);
        errorMessage.appendChild(content);
        
        document.querySelector('.tab-content:not(.hidden)').appendChild(errorMessage);
    }

    function createModificationRequestCard(requestId, request) {
        if (!request || !request.currentBooking || !request.requestedChanges) {
            console.error('Invalid request data:', request);
            return document.createElement('div');
        }
        
        const card = document.createElement('div');
        card.className = 'bg-white border rounded-lg p-6 shadow-sm mb-4';
        
        const booking = request.currentBooking;
        const changes = request.requestedChanges;

        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-semibold text-lg">${booking.propertyDetails?.name || booking.propertyName || 'Unnamed Property'}</h4>
                    <p class="text-sm text-gray-500">Request ID: ${requestId}</p>
                    <p class="text-sm text-gray-500">Booking ID: ${booking.id || 'N/A'}</p>
                    <p class="text-sm text-gray-500">Created: ${request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                </div>
                <span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                    Pending
                </span>
            </div>
            <div class="mb-4">
                <p class="text-sm text-gray-500">Current Booking Dates</p>
                <p class="font-medium">Check-in: ${formatDate(booking.checkIn.toDate())}</p>
                <p class="font-medium">Check-out: ${formatDate(booking.checkOut.toDate())}</p>
            </div>
            <div class="mb-4">
                <p class="text-sm text-gray-500">Requested Booking Dates</p>
                <p class="font-medium">Check-in: ${formatDate(changes.checkIn.toDate())}</p>
                <p class="font-medium">Check-out: ${formatDate(changes.checkOut.toDate())}</p>
            </div>
            <div class="mb-4">
                <p class="text-sm text-gray-500">Reason for Modification</p>
                <p class="mt-1">${request.reason || 'No reason provided'}</p>
            </div>
            <div class="flex justify-end space-x-3">
                <button class="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 reject-btn">
                    Reject
                </button>
                <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 approve-btn">
                    Approve
                </button>
            </div>
        `;

        // Add event listeners
        const approveBtn = card.querySelector('.approve-btn');
        const rejectBtn = card.querySelector('.reject-btn');

        approveBtn.addEventListener('click', () => handleApproveModification(requestId));
        rejectBtn.addEventListener('click', () => handleRejectModification(requestId));

        return card;
    }

    function createCancellationRequestCard(requestId, request) {
        if (!request || !request.booking) {
            console.error('Invalid request data:', request);
            return document.createElement('div');
        }
        
        const card = document.createElement('div');
        card.className = 'bg-white border rounded-lg p-6 shadow-sm mb-4';
        
        const booking = request.booking;

        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-semibold text-lg">${booking.propertyDetails?.name || booking.propertyName || 'Unnamed Property'}</h4>
                    <p class="text-sm text-gray-500">Request ID: ${requestId}</p>
                    <p class="text-sm text-gray-500">Booking ID: ${booking.id || 'N/A'}</p>
                    <p class="text-sm text-gray-500">Created: ${request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                </div>
                <span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                    Pending
                </span>
            </div>
            <div class="mb-4">
                <p class="text-sm text-gray-500">Booking Details</p>
                <p class="font-medium">Guest: ${booking.guestName || 'N/A'}</p>
                <p class="font-medium">Check-in: ${booking.checkIn ? formatDate(booking.checkIn.toDate()) : 'N/A'}</p>
                <p class="font-medium">Check-out: ${booking.checkOut ? formatDate(booking.checkOut.toDate()) : 'N/A'}</p>
                <p class="font-medium">Room: ${booking.propertyDetails?.roomType || booking.roomType || 'N/A'}</p>
            </div>
            <div class="mb-4">
                <p class="text-sm text-gray-500">Reason for Cancellation</p>
                <p class="mt-1">${request.reason || 'No reason provided'}</p>
            </div>
            <div class="flex justify-end space-x-3">
                <button class="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 reject-btn">
                    Reject
                </button>
                <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 approve-btn">
                    Approve
                </button>
            </div>
        `;

        // Add event listeners
        const approveBtn = card.querySelector('.approve-btn');
        const rejectBtn = card.querySelector('.reject-btn');

        approveBtn.addEventListener('click', () => handleApproveCancellation(requestId));
        rejectBtn.addEventListener('click', () => handleRejectCancellation(requestId));

        return card;
    }

    let paymentHistoryData = [];

    // Function to update booking in dashboard
    async function updateBookingStatus(bookingId, status, reason = '') {
        try {
            const bookingRef = doc(db, 'bookings', bookingId);
            await updateDoc(bookingRef, {
                paymentStatus: status,
                ...(reason ? { rejectionReason: reason } : {})
            });
            console.log(`Booking ${bookingId} payment status updated to ${status}`);
        } catch (error) {
            console.error('Error updating booking status:', error);
            throw error;
        }
    }

    // Function to save payment history
    async function savePaymentHistory(bookingData, status, reason = '') {
        try {
            const historyRef = collection(db, 'paymentHistory');
            const historyData = {
                bookingId: bookingData.id,
                guestName: bookingData.guestName,
                roomNumber: bookingData.propertyDetails?.roomNumber,
                amount: bookingData.totalPrice,
                status: status,
                reason: reason,
                timestamp: serverTimestamp(),
            };
            await addDoc(historyRef, historyData);
            console.log('Payment history saved');
        } catch (error) {
            console.error('Error saving payment history:', error);
        }
    }

    // Function to display payment history
    function displayPaymentHistory(filter = 'all') {
        const tableBody = document.getElementById('paymentHistoryTableBody');
        if (!tableBody) return;

        let filteredData = paymentHistoryData;
        if (filter !== 'all') {
            filteredData = paymentHistoryData.filter(item => item.status === filter);
        }

        tableBody.innerHTML = filteredData.map(item => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${item.timestamp.toLocaleDateString()} ${item.timestamp.toLocaleTimeString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${item.guestName || '---'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${item.roomNumber || '---'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ₱${parseFloat(item.amount || 0).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${item.status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${item.status === 'verified' ? 'Approved' : 'Rejected'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${item.reason || '---'}
                </td>
            </tr>
        `).join('');
    }
});