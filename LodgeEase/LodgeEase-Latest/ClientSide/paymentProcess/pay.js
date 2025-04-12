import { auth, db, addBooking } from '../../AdminSide/firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { generateEmailTemplate } from './emailTemplate.js';
import { initializePaymentListeners } from './payment.js';
import { GCashPayment } from './gcashPayment.js';
import { doc, getDoc, collection, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Constants
const NIGHTLY_RATE = 6500;
const SERVICE_FEE_PERCENTAGE = 0.14;

// Auth state flag
let userAuthenticated = false;
let currentUser = null;

// Get UI elements
const confirmButton = document.getElementById('confirm-button');
const paymentSuccessModal = document.getElementById('payment-success-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

// Initialize authentication listener immediately
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('User authenticated in payment page:', user.email);
        userAuthenticated = true;
        currentUser = user;
        
        // Check for pending booking
        if (sessionStorage.getItem('pendingBooking')) {
            sessionStorage.removeItem('pendingBooking');
            handlePaymentSuccess();
        }
    } else {
        console.log('No user is signed in on payment page');
        userAuthenticated = false;
        currentUser = null;
        
        // Redirect to login if not authenticated
        alert('Please log in to complete your booking');
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.href = `../Login/index.html?redirect=${returnUrl}`;
    }
});

// Card input fields
const cardNumberInput = document.getElementById('card-number');
const cardExpirationInput = document.getElementById('card-expiration');
const cardCvvInput = document.getElementById('card-cvv');
const cardZipInput = document.getElementById('card-zip');
const cardCountrySelect = document.getElementById('card-country');

// Update verification function to use same constants
function verifyBookingCosts(bookingData) {
    if (!bookingData.nightlyRate || !bookingData.numberOfNights) {
        throw new Error('Invalid booking data: missing rate information');
    }

    // Use the actual rate from the booking data instead of a constant
    const nightlyRate = bookingData.nightlyRate;
    const numberOfNights = bookingData.numberOfNights;
    
    // Recalculate using the same formula as in lodge files
    const subtotal = nightlyRate * numberOfNights;
    const serviceFee = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
    const totalPrice = subtotal + serviceFee;

    // Verify the calculations match
    if (Math.abs(bookingData.subtotal - subtotal) > 1 || 
        Math.abs(bookingData.serviceFee - serviceFee) > 1 || 
        Math.abs(bookingData.totalPrice - totalPrice) > 1) {
        console.warn('Price mismatch detected', {
            original: {
                subtotal: bookingData.subtotal,
                serviceFee: bookingData.serviceFee,
                totalPrice: bookingData.totalPrice
            },
            recalculated: {
                subtotal,
                serviceFee, 
                totalPrice
            }
        });
    }

    return {
        nightlyRate,
        subtotal,
        serviceFee,
        totalPrice
    };
}

function checkPaymentSelections() {
  const selectedPaymentType = document.querySelector('input[name="payment_type"]:checked');
  const selectedPaymentMethod = document.querySelector('input[name="payment_method"]:checked');

  // Check if payment method is card
  const isCardMethod = selectedPaymentMethod && selectedPaymentMethod.value === 'card';
  
  if (selectedPaymentType && selectedPaymentMethod) {
    // If card method, check if all card fields have some input
    if (isCardMethod) {
      const hasCardDetails = cardNumberInput.value.trim() !== '' &&
                             cardExpirationInput.value.trim() !== '' &&
                             cardCvvInput.value.trim() !== '' &&
                             cardZipInput.value.trim() !== '' &&
                             cardCountrySelect.value !== '';
      
      confirmButton.disabled = !hasCardDetails;
    } else {
      // For other payment methods, just need payment type and method
      confirmButton.disabled = false;
    }
  } else {
    confirmButton.disabled = true;
  }
}

// Show payment success modal on confirm
confirmButton.addEventListener('click', async (event) => {
    event.preventDefault();
    
    // Re-validate form just before processing
    const isFormValidOnClick = validatePaymentForm();
    console.log(`[Debug] Click Handler - Is Form Valid (Initial Check): ${isFormValidOnClick}`); // Log validation result
    if (!isFormValidOnClick) {
        console.warn('Confirm button clicked, but initial validation failed. Aborting.');
        alert('Please ensure you have selected a payment type and method, and completed any required fields (like card details).');
        return; // Prevent processing if form is invalid
    }
    
    // === Specific GCash Reference Check ===
    const selectedPaymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    if (selectedPaymentMethod === 'gcash') {
        const gcashRefInput = document.getElementById('gcash-reference');
        const gcashRefValue = gcashRefInput ? gcashRefInput.value.trim() : '';
        const minLength = 6; // Define minimum length for reference number
        if (gcashRefValue.length < minLength) {
            console.warn(`[Debug] GCash reference check failed. Length: ${gcashRefValue.length}, Required: ${minLength}`);
            alert(`Please enter a valid GCash reference number (at least ${minLength} characters).`);
            return; // Stop processing
        }
         console.log('[Debug] GCash reference check passed.');
    }
    // ====================================

    // Verify confirmButton reference
    if (!confirmButton || confirmButton.id !== 'confirm-button') {
        console.error('[Critical] confirmButton reference is lost or incorrect!');
        return;
    }
    console.log('[Debug] confirmButton reference seems ok.');

    try {
        // Show processing state
        confirmButton.disabled = true;
        document.getElementById('button-text').textContent = 'Processing...';
        document.getElementById('loading-spinner').classList.remove('hidden');
        
        // Make sure we have a user
        if (!userAuthenticated || !currentUser) {
            console.log('Waiting for authentication...');
            // Wait a bit for auth to initialize if it hasn't already
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!userAuthenticated || !currentUser) {
                throw new Error('Authentication required');
            }
        }
        
        // Process the payment and create booking
        await processPaymentAndBooking();
        
        // Show success modal
        paymentSuccessModal.classList.remove('hidden');
    } catch (error) {
        console.error('Payment processing error:', error);
        alert(error.message || 'An error occurred during payment processing');
        
        // Reset button
        confirmButton.disabled = false;
        document.getElementById('button-text').textContent = 'Confirm and Pay';
        document.getElementById('loading-spinner').classList.add('hidden');
    }
});

// Close modal functionality
closeModalBtn.addEventListener('click', () => {
  paymentSuccessModal.classList.add('hidden');
  window.location.href = '../Dashboard/Dashboard.html';
});

// Initial state
confirmButton.disabled = true;

// Consolidate booking data handling
function getBookingData() {
    const data = localStorage.getItem('bookingData');
    if (!data) return null;
    
    try {
        return JSON.parse(data);
    } catch (error) {
        console.error('Error parsing booking data:', error);
        return null;
    }
}

// Single function to initialize page
function initializePage() {
    console.log('Initializing payment page...'); // Debug log
    
    const bookingData = getBookingData();
    console.log('Retrieved booking data:', bookingData); // Debug log
    
    if (!bookingData) {
        console.error('No booking data found in localStorage');
        window.location.href = '../Homepage/rooms.html';
        return;
    }

    try {
        // Update the UI with booking data
        updateSummaryDisplay(bookingData);
        updatePaymentAmounts(bookingData.totalPrice);
        
        // Set up payment options
        setupPaymentOptions(bookingData);
        setupPaymentMethodListeners();
        
        console.log('Payment page initialized successfully'); // Debug log
    } catch (error) {
        console.error('Error initializing payment page:', error);
        alert('Error loading booking details. Please try again.');
        window.location.href = '../Homepage/rooms.html';
    }
}

function updateSummaryDisplay(bookingData) {
    console.log('Updating summary display with:', bookingData); // Debug log
    
    const formatDate = (dateObj) => {
        try {
            let date;
            // Handle Firebase Timestamp
            if (dateObj && typeof dateObj === 'object' && 'seconds' in dateObj) {
                date = new Date(dateObj.seconds * 1000);
            } else if (typeof dateObj === 'string') {
                date = new Date(dateObj);
            } else {
                date = new Date(dateObj);
            }

            if (isNaN(date.getTime())) {
                console.error('Invalid date:', dateObj);
                return 'Invalid Date';
            }
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid Date';
        }
    };

    // Update all summary fields
    const summaryFields = {
        'summary-checkin': formatDate(bookingData.checkIn),
        'summary-checkout': formatDate(bookingData.checkOut),
        'summary-guests': `${bookingData.guests} guest${bookingData.guests > 1 ? 's' : ''}`,
        'summary-contact': bookingData.contactNumber || 'Not provided',
        'summary-nights': `${bookingData.numberOfNights} night${bookingData.numberOfNights > 1 ? 's' : ''}`,
        'summary-rate': `₱${bookingData.nightlyRate.toLocaleString()}`,
        'summary-subtotal': `₱${bookingData.subtotal.toLocaleString()}`,
        'summary-fee': `₱${bookingData.serviceFee.toLocaleString()}`,
        'summary-total': `₱${bookingData.totalPrice.toLocaleString()}`
    };

    // Update each field and log any errors
    Object.entries(summaryFields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        } else {
            console.error(`Element with id '${id}' not found`);
        }
    });
}

function updatePaymentAmounts(totalPrice) {
    console.log('Updating payment amounts with total:', totalPrice); // Debug log
    
    const payNowAmount = document.getElementById('pay-now-amount');
    const payLaterFirst = document.getElementById('pay-later-first');
    const payLaterSecond = document.getElementById('pay-later-second');
    
    if (payNowAmount) payNowAmount.textContent = `₱${totalPrice.toLocaleString()}`;
    
    const firstPayment = Math.round(totalPrice / 2);
    const secondPayment = totalPrice - firstPayment;
    
    if (payLaterFirst) payLaterFirst.textContent = `₱${firstPayment.toLocaleString()}`;
    if (payLaterSecond) payLaterSecond.textContent = `₱${secondPayment.toLocaleString()}`;
}

async function processPaymentAndBooking() {
    // Get booking data from localStorage
    const bookingData = JSON.parse(localStorage.getItem('bookingData'));
    if (!bookingData) {
        throw new Error('No booking data found');
    }

    // Get current user
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error('No user logged in');
    }

    // === Robust Value Reading ===
    let paymentMethod = undefined;
    const paymentMethodRadios = document.querySelectorAll('input[name="payment_method"]');
    paymentMethodRadios.forEach(radio => {
        if (radio.checked) {
            paymentMethod = radio.value;
        }
    });

    let paymentType = undefined;
    const paymentTypeRadios = document.querySelectorAll('input[name="payment_type"]');
    paymentTypeRadios.forEach(radio => {
        if (radio.checked) {
            paymentType = radio.value;
        }
    });

    console.log('[Debug Robust Read] Payment Method:', paymentMethod);
    console.log('[Debug Robust Read] Payment Type:', paymentType);
    // =========================

    const referenceNumberInput = document.getElementById('gcash-reference');
    const referenceNumber = referenceNumberInput ? referenceNumberInput.value : null;

    // Keep the original check as a fallback/final validation
    if (!paymentMethod || !paymentType) {
        console.error('Validation failed: Missing paymentMethod or paymentType even after robust read.');
        throw new Error('Missing payment details');
    }

    // Show loading state
    const confirmButton = document.getElementById('confirm-button');
    const buttonText = document.getElementById('button-text');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    if (confirmButton && buttonText && loadingSpinner) {
        confirmButton.disabled = true;
        buttonText.textContent = 'Processing...';
        loadingSpinner.classList.remove('hidden');
    }

    try {
        // First, create the booking in everlodgebookings
        const bookingsRef = collection(db, 'everlodgebookings');
        const bookingDocRef = await addDoc(bookingsRef, {
            ...bookingData,
            userId: currentUser.uid,
            email: currentUser.email,
            guestName: currentUser.displayName || 'Guest',
            createdAt: Timestamp.now(),
            paymentMethod: paymentMethod,
            paymentType: paymentType,
            paymentStatus: 'pending',
            status: 'pending'
        });

        console.log('Created booking with ID:', bookingDocRef.id);

        // Get payment screenshot if available
        let paymentScreenshotURL = null;
        const screenshotInput = document.getElementById('payment-screenshot');
        if (screenshotInput && screenshotInput.files[0]) {
            // Here you would typically upload the file to storage and get URL
            // For now we'll just use a placeholder
            paymentScreenshotURL = 'screenshot_url_placeholder';
        }

        // Create payment verification request if needed
        if (paymentMethod === 'gcash' || paymentMethod === 'bank_transfer') {
            const verificationRequestId = await createPaymentVerificationRequest(bookingDocRef.id, {
                bookingId: bookingDocRef.id,
                userId: currentUser.uid,
                amount: paymentType === 'pay_now' ? bookingData.totalPrice : Math.round(bookingData.totalPrice / 2),
                paymentMethod: paymentMethod,
                referenceNumber: referenceNumber,
                paymentScreenshot: paymentScreenshotURL
            });
            
            console.log('Created payment verification request:', verificationRequestId);
        }
        
        // Update success message with more details
        const modalMessage = document.querySelector('#payment-success-modal p');
        if (modalMessage) {
            modalMessage.innerHTML = `
                Payment of ₱${bookingData.totalPrice.toLocaleString()} submitted!<br>
                Your booking is pending payment verification.<br>
                Booking ID: ${bookingDocRef.id}<br>
                <span class="text-sm text-gray-600">Please wait for admin verification.</span>
            `;
        }
        
        // Clear booking data from localStorage
        localStorage.removeItem('bookingData');
        
        // Store booking in localStorage for dashboard access
        localStorage.setItem('currentBooking', JSON.stringify({
            ...bookingData,
            id: bookingDocRef.id
        }));
        
        // Store confirmation in sessionStorage for dashboard redirect
        sessionStorage.setItem('bookingConfirmation', JSON.stringify({
            bookingId: bookingDocRef.id,
            propertyName: bookingData.propertyDetails?.name || 'Ever Lodge',
            totalPrice: bookingData.totalPrice,
            paymentStatus: 'pending'
        }));
        
        return bookingDocRef.id;
    } catch (error) {
        console.error('Error processing payment:', error);
        
        // Show error in modal
        const modalMessage = document.querySelector('#payment-success-modal p');
        if (modalMessage) {
            modalMessage.innerHTML = `
                <div class="text-red-600">
                    <p>Error processing payment: ${error.message}</p>
                    <p class="text-sm mt-2">Please try again or contact support.</p>
                </div>
            `;
        }
        
        // Reset button state
        if (confirmButton && buttonText && loadingSpinner) {
            confirmButton.disabled = false;
            buttonText.textContent = 'Confirm and Pay';
            loadingSpinner.classList.add('hidden');
        }
        
        throw error;
    }
}

// New function to create payment verification request
async function createPaymentVerificationRequest(bookingId, paymentData) {
    try {
        // Get the booking details first
        const bookingRef = doc(db, 'everlodgebookings', bookingId);
        const bookingDoc = await getDoc(bookingRef);
        
        if (!bookingDoc.exists()) {
            console.error('Booking not found:', bookingId);
            throw new Error('Booking not found');
        }

        const bookingDetails = bookingDoc.data();
        
        // Create payment verification request with booking details
        const paymentVerificationRef = collection(db, 'paymentVerificationRequests');
        const verificationData = {
            ...paymentData,
            bookingDetails: {
                ...bookingDetails,
                id: bookingId
            },
            userDetails: {
                name: auth.currentUser.displayName || 'Guest',
                email: auth.currentUser.email
            },
            createdAt: Timestamp.now(),
            status: 'pending'
        };

        const docRef = await addDoc(paymentVerificationRef, verificationData);
        console.log('Payment verification request created with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error creating payment verification request:', error);
        throw error; // We should throw here to handle the error in the calling function
    }
}

async function getUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return {};
    } catch (error) {
        console.error('Error fetching user data:', error);
        return {};
    }
}

function setupPaymentOptions(bookingData) {
    const paymentTypeRadios = document.querySelectorAll('input[name="payment_type"]');
    if (paymentTypeRadios.length > 0) {
        const defaultRadio = paymentTypeRadios[0];
        defaultRadio.checked = true; // Default to first option (pay now)
        console.log(`[Debug] Default payment TYPE set to: ${defaultRadio.value}`);

        paymentTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                 console.log(`[Debug] Payment type changed to: ${radio.value}`);
                validatePaymentForm();
            });
        });
    } else {
        console.warn('[Debug] No payment type radios found.');
    }
}

function setupPaymentMethodListeners() {
    const paymentMethodRadios = document.querySelectorAll('input[name="payment_method"]');
    const cardForm = document.getElementById('card-form');
    const gcashForm = document.getElementById('gcash-form');
    
    // Default to the first payment method (e.g., 'card')
    if (paymentMethodRadios.length > 0) {
        const defaultRadio = paymentMethodRadios[0]; // Get the first radio
        defaultRadio.checked = true; // Explicitly check it
        console.log(`[Debug] Default payment METHOD set to: ${defaultRadio.value}`); // Log default

        // Trigger visibility of the corresponding form
        if (defaultRadio.value === 'card' && cardForm) {
            cardForm.classList.remove('hidden');
            console.log('[Debug] Card form shown by default');
        } else if (defaultRadio.value === 'gcash' && gcashForm) {
            gcashForm.classList.remove('hidden');
            console.log('[Debug] GCash form shown by default');
        }
        // ... handle other potential default methods if needed ...
        else {
             if (cardForm) cardForm.classList.add('hidden');
             if (gcashForm) gcashForm.classList.add('hidden');
             console.log('[Debug] Default payment method form not found or handled, hiding all.');
        }
    } else {
         console.warn('[Debug] No payment method radios found to set a default.');
    }
    
    paymentMethodRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            // Hide all payment method specific forms first
            if (cardForm) cardForm.classList.add('hidden');
            if (gcashForm) gcashForm.classList.add('hidden');

            // Show the selected payment method form
             console.log(`[Debug] Payment method changed to: ${radio.value}`);
            if (radio.value === 'card' && cardForm) {
                cardForm.classList.remove('hidden');
            } else if (radio.value === 'gcash' && gcashForm) {
                gcashForm.classList.remove('hidden');
            }
            
            validatePaymentForm(); // Validate whenever method changes
        });
    });
}

function validatePaymentForm() {
    if (!confirmButton) return false;
    
    const selectedPaymentTypeRadio = document.querySelector('input[name="payment_type"]:checked');
    const selectedPaymentMethodRadio = document.querySelector('input[name="payment_method"]:checked');
    const selectedPaymentType = selectedPaymentTypeRadio?.value;
    const selectedPaymentMethod = selectedPaymentMethodRadio?.value;
    
    let isValid = selectedPaymentTypeRadio && selectedPaymentMethodRadio;
    let reason = ''; // For debugging

    console.log(`[Debug Validation] Type Radio Found: ${selectedPaymentTypeRadio ? selectedPaymentType : 'None'}`);
    console.log(`[Debug Validation] Method Radio Found: ${selectedPaymentMethodRadio ? selectedPaymentMethod : 'None'}`);

    if (!selectedPaymentTypeRadio) reason += 'No payment type selected. ';
    if (!selectedPaymentMethodRadio) reason += 'No payment method selected. ';
    
    if (isValid && selectedPaymentMethod === 'card') {
        // Validate card inputs
        const cardNumber = document.getElementById('card-number')?.value;
        const cardExpiration = document.getElementById('card-expiration')?.value;
        const cardCvv = document.getElementById('card-cvv')?.value;
        const cardZip = document.getElementById('card-zip')?.value;
        const cardCountry = document.getElementById('card-country')?.value;
        
        isValid = cardNumber && cardExpiration && cardCvv && cardZip && cardCountry;
        if (!isValid) reason += 'Incomplete card details. ';
    }
    // REMOVED GCash validation from here - will be checked on click
    // else if (isValid && selectedPaymentMethod === 'gcash') {
    //     // Validate GCash reference number
    //     const gcashRef = document.getElementById('gcash-reference');
    //     isValid = gcashRef && gcashRef.value.trim().length > 5; // Example: Require more than 5 chars
    //      if (!isValid) reason += 'Invalid GCash reference number (must be > 5 chars). ';
    // }
    // Add validation for other methods like PayPal if needed
    
    console.log(`[Debug] Validation Result (Button Enable/Disable): ${isValid ? 'Valid' : 'Invalid'}. Button Disabled: ${!isValid}. Reason: ${isValid ? 'N/A' : reason.trim()}`);
    confirmButton.disabled = !isValid;
    return isValid;
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Payment page loaded, initializing...'); // Debug log
    initializePage();
    
    // Initial validation check after setup
    validatePaymentForm();
    
    // Check auth state immediately
    if (auth.currentUser) {
        console.log('User already authenticated on page load:', auth.currentUser.email);
        userAuthenticated = true;
        currentUser = auth.currentUser;
    } else {
        console.log('No user authenticated on page load, waiting for auth state change');
    }
});