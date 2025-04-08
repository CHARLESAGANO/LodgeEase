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
    
    if (!validatePaymentForm()) {
        return;
    }

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
    // Get booking data
    const bookingDataJson = localStorage.getItem('bookingData');
    if (!bookingDataJson) {
        throw new Error('No booking data found');
    }
    
    const bookingData = JSON.parse(bookingDataJson);
    
    // Validate and parse dates
    let checkInDate, checkOutDate;
    
    try {
        if (bookingData.checkIn && typeof bookingData.checkIn === 'object' && 'seconds' in bookingData.checkIn) {
            checkInDate = new Date(bookingData.checkIn.seconds * 1000);
        } else {
            checkInDate = new Date(bookingData.checkIn);
        }
        
        if (bookingData.checkOut && typeof bookingData.checkOut === 'object' && 'seconds' in bookingData.checkOut) {
            checkOutDate = new Date(bookingData.checkOut.seconds * 1000);
        } else {
            checkOutDate = new Date(bookingData.checkOut);
        }
        
        // Validate dates
        if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
            throw new Error('Invalid check-in or check-out dates');
        }
        
        // Ensure check-out is after check-in
        if (checkOutDate <= checkInDate) {
            throw new Error('Check-out date must be after check-in date');
        }
    } catch (error) {
        console.error('Date parsing error:', error);
        throw new Error('Invalid date format in booking data');
    }
    
    // Double-check authentication
    if (!currentUser) {
        throw new Error('You must be logged in to complete this booking');
    }
    
    // Get payment details
    const paymentType = document.querySelector('input[name="payment_type"]:checked').value;
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
    
    // Get additional reference number for GCash
    let referenceNumber = null;
    if (paymentMethod === 'gcash') {
        const gcashRefInput = document.getElementById('gcash-reference');
        if (gcashRefInput) {
            referenceNumber = gcashRefInput.value.trim();
        }
    }
    
    // Prepare booking record for Firestore
    const userData = await getUserData(currentUser.uid);
    
    const bookingId = `BK${Date.now()}`;
    
    const booking = {
        bookingId: bookingId,
        userId: currentUser.uid,
        guestName: userData.name || currentUser.displayName || userData.fullname || 'Guest',
        email: userData.email || currentUser.email,
        contactNumber: bookingData.contactNumber,
        checkIn: Timestamp.fromDate(checkInDate),
        checkOut: Timestamp.fromDate(checkOutDate),
        guests: bookingData.guests,
        numberOfNights: bookingData.numberOfNights,
        nightlyRate: bookingData.nightlyRate,
        subtotal: bookingData.subtotal,
        serviceFee: bookingData.serviceFee,
        totalPrice: bookingData.totalPrice,
        paymentType: paymentType,
        paymentMethod: paymentMethod,
        paymentStatus: paymentType === 'pay_now' ? 'pending_verification' : 'partially_paid',
        status: 'confirmed',
        createdAt: Timestamp.now(),
        propertyDetails: bookingData.propertyDetails,
        paymentDetails: {
            referenceNumber: referenceNumber
        }
    };
    
    console.log('Creating booking with data:', booking);
    
    // Save booking to Firestore
    try {
        const docRef = await addDoc(collection(db, 'bookings'), booking);
        console.log('Booking created with ID:', docRef.id);
        
        // Create payment verification request for admin
        if (paymentMethod === 'gcash' || paymentMethod === 'bank_transfer') {
            await createPaymentVerificationRequest(docRef.id, {
                bookingId: docRef.id,
                userId: currentUser.uid,
                amount: paymentType === 'pay_now' ? booking.totalPrice : Math.round(booking.totalPrice / 2),
                paymentMethod: paymentMethod,
                referenceNumber: referenceNumber,
                createdAt: Timestamp.now(),
                status: 'pending'
            });
        }
        
        // Update success message
        const modalMessage = document.querySelector('#payment-success-modal p');
        if (modalMessage) {
            modalMessage.innerHTML = `
                Payment of ₱${booking.totalPrice.toLocaleString()} submitted!<br>
                Your booking is confirmed.<br>
                Booking ID: ${booking.bookingId}
            `;
        }
        
        // Clear booking data from localStorage
        localStorage.removeItem('bookingData');
        
        // Store booking in localStorage for dashboard access
        localStorage.setItem('currentBooking', JSON.stringify({
            ...booking,
            id: docRef.id
        }));
        
        // Store confirmation in sessionStorage for dashboard redirect
        sessionStorage.setItem('bookingConfirmation', JSON.stringify({
            bookingId: booking.bookingId,
            propertyName: booking.propertyDetails?.name || 'Your Lodge',
            totalPrice: booking.totalPrice
        }));
        
        return docRef.id;
    } catch (error) {
        console.error('Error saving booking to Firestore:', error);
        throw new Error('Failed to save your booking. Please try again.');
    }
}

// New function to create payment verification request
async function createPaymentVerificationRequest(bookingId, paymentData) {
    try {
        const paymentVerificationRef = collection(db, 'paymentVerificationRequests');
        const docRef = await addDoc(paymentVerificationRef, paymentData);
        console.log('Payment verification request created with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error creating payment verification request:', error);
        // Don't throw here, because we don't want to fail the booking process
        // if payment verification request creation fails
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
    if (paymentTypeRadios.length) {
        paymentTypeRadios[0].checked = true; // Default to first option (pay now)
        
        paymentTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                validatePaymentForm();
            });
        });
    }
}

function setupPaymentMethodListeners() {
    const paymentMethodRadios = document.querySelectorAll('input[name="payment_method"]');
    const cardForm = document.getElementById('card-form');
    const gcashForm = document.getElementById('gcash-form');
    
    paymentMethodRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            // Hide all payment method specific forms first
            if (cardForm) cardForm.classList.add('hidden');
            if (gcashForm) gcashForm.classList.add('hidden');
            
            // Show the selected payment method form
            if (radio.value === 'card' && cardForm) {
                cardForm.classList.remove('hidden');
            } else if (radio.value === 'gcash' && gcashForm) {
                gcashForm.classList.remove('hidden');
            }
            
            validatePaymentForm();
        });
    });
    
    // Add listeners to card inputs for validation if they exist
    const cardInputs = document.querySelectorAll('#card-number, #card-expiration, #card-cvv, #card-zip, #card-country');
    cardInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', validatePaymentForm);
        }
    });
    
    // Add listener to GCash reference number input
    const gcashRef = document.getElementById('gcash-reference');
    if (gcashRef) {
        gcashRef.addEventListener('input', validatePaymentForm);
    }
}

function validatePaymentForm() {
    if (!confirmButton) return false;
    
    const selectedPaymentType = document.querySelector('input[name="payment_type"]:checked');
    const selectedPaymentMethod = document.querySelector('input[name="payment_method"]:checked');
    
    let isValid = selectedPaymentType && selectedPaymentMethod;
    
    if (isValid && selectedPaymentMethod.value === 'card') {
        // Validate card inputs
        const cardNumber = document.getElementById('card-number')?.value;
        const cardExpiration = document.getElementById('card-expiration')?.value;
        const cardCvv = document.getElementById('card-cvv')?.value;
        const cardZip = document.getElementById('card-zip')?.value;
        const cardCountry = document.getElementById('card-country')?.value;
        
        isValid = cardNumber && cardExpiration && cardCvv && cardZip && cardCountry;
    }
    else if (isValid && selectedPaymentMethod.value === 'gcash') {
        // Validate GCash reference number
        const gcashRef = document.getElementById('gcash-reference');
        isValid = gcashRef && gcashRef.value.trim().length > 5;
    }
    
    confirmButton.disabled = !isValid;
    return isValid;
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Payment page loaded, initializing...'); // Debug log
    initializePage();
    
    // Check auth state immediately
    if (auth.currentUser) {
        console.log('User already authenticated on page load:', auth.currentUser.email);
        userAuthenticated = true;
        currentUser = auth.currentUser;
    } else {
        console.log('No user authenticated on page load, waiting for auth state change');
    }
});