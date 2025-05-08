import { auth, db, addBooking, confirmDraftBooking } from '../firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { generateEmailTemplate } from './emailTemplate.js';
import { initializePaymentListeners } from './payment.js';
import { GCashPayment } from './gcashPayment.js';
import { doc, getDoc, collection, addDoc, Timestamp, updateDoc, query, where, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

// Function to copy GCash number
function copyGcashNumber() {
  const gcashNumber = "0917 123 4567";
  navigator.clipboard.writeText(gcashNumber).then(() => {
    const copyMessage = document.getElementById('copyMessage');
    copyMessage.classList.remove('hidden');
    setTimeout(() => {
      copyMessage.classList.add('hidden');
    }, 2000);
  });
}
window.copyGcashNumber = copyGcashNumber;

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
    console.log(`[Debug] Click Handler - Is Form Valid (Initial Check): ${isFormValidOnClick}`); 
    if (!isFormValidOnClick) {
        console.warn('Confirm button clicked, but initial validation failed. Aborting.');
        alert('Please ensure you have selected a payment type and method, and completed any required fields.');
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
    // Get booking ID before redirecting
    const bookingId = localStorage.getItem('currentBookingId');
    // Redirect to dashboard with booking ID parameter
    window.location.href = `../Dashboard/Dashboard.html${bookingId ? `?bookingId=${bookingId}` : ''}`;
});

// Initial state
confirmButton.disabled = true;

// Consolidate booking data handling
function getBookingData() {
    console.log('Getting booking data from localStorage');
    
    // Try to retrieve from multiple storage locations
    let rawBookingData = localStorage.getItem('tempBookingData');
    if (!rawBookingData) {
        console.log('tempBookingData not found, trying bookingData');
        rawBookingData = localStorage.getItem('bookingData');
    }
    
    // If still no data, look for older format
    if (!rawBookingData) {
        console.log('bookingData not found, trying currentBooking');
        rawBookingData = localStorage.getItem('currentBooking');
    }
    
    // Check if we have any data at this point
    if (!rawBookingData) {
        console.warn('No booking data found in any localStorage keys');
        return null;
    }
    
    console.log('Raw booking data found:', rawBookingData.substring(0, 100) + '...');
    
    try {
        // Parse the booking data
        const bookingData = JSON.parse(rawBookingData);
        
        // Log what we found
        console.log('Successfully parsed booking data with keys:', Object.keys(bookingData));
        
        // Backup to sessionStorage for persistence across page navigations
        sessionStorage.setItem('backupBookingData', rawBookingData);
        
        // Add timestamp check
        const createdAt = bookingData.createdAt;
        if (createdAt) {
            const createdDate = new Date(createdAt);
            const ageInMinutes = (new Date() - createdDate) / (1000 * 60);
            
            if (ageInMinutes > 30) {
                console.warn(`Booking data is ${Math.round(ageInMinutes)} minutes old, which may be stale`);
            } else {
                console.log(`Booking data is ${Math.round(ageInMinutes)} minutes old`);
            }
        }
        
        // Ensure date fields are properly formatted
        if (bookingData.checkIn) {
            // Handle different date formats
            if (typeof bookingData.checkIn === 'string') {
                console.log('Converting checkIn from string to Date');
                bookingData.checkIn = new Date(bookingData.checkIn);
            } else if (bookingData.checkIn.seconds && bookingData.checkIn.nanoseconds) {
                console.log('Converting checkIn from Firestore Timestamp to Date');
                bookingData.checkIn = new Date(bookingData.checkIn.seconds * 1000);
            }
        }
        
        if (bookingData.checkOut) {
            // Handle different date formats
            if (typeof bookingData.checkOut === 'string') {
                console.log('Converting checkOut from string to Date');
                bookingData.checkOut = new Date(bookingData.checkOut);
            } else if (bookingData.checkOut.seconds && bookingData.checkOut.nanoseconds) {
                console.log('Converting checkOut from Firestore Timestamp to Date');
                bookingData.checkOut = new Date(bookingData.checkOut.seconds * 1000);
            }
        }
        
        // Ensure numeric values are numbers
        if (bookingData.nightlyRate && typeof bookingData.nightlyRate !== 'number') {
            bookingData.nightlyRate = parseFloat(bookingData.nightlyRate);
        }
        
        if (bookingData.totalPrice && typeof bookingData.totalPrice !== 'number') {
            bookingData.totalPrice = parseFloat(bookingData.totalPrice);
        }
        
        if (bookingData.serviceFee && typeof bookingData.serviceFee !== 'number') {
            bookingData.serviceFee = parseFloat(bookingData.serviceFee);
        }
        
        if (bookingData.subtotal && typeof bookingData.subtotal !== 'number') {
            bookingData.subtotal = parseFloat(bookingData.subtotal);
        }
        
        if (bookingData.guests && typeof bookingData.guests !== 'number') {
            bookingData.guests = parseInt(bookingData.guests, 10);
        }
        
        // Calculate numberOfNights if not provided
        if (!bookingData.numberOfNights && bookingData.checkIn && bookingData.checkOut) {
            bookingData.numberOfNights = calculateNights(bookingData.checkIn, bookingData.checkOut);
        }
        
        // Ensure contact information is available
        if (!bookingData.contactNumber) {
            console.warn('Contact number missing from booking data');
        }
        
        console.log('Final processed booking data:', bookingData);
        return bookingData;
    } catch (error) {
        console.error('Error parsing booking data:', error);
        return null;
    }
}

// Single function to initialize page
function initializePage() {
    console.log('Initializing payment page');
    
    // Clear any default values first
    clearDefaultSummaryValues();
    
    // Get URL parameters
    const bookingId = getUrlParameter('bookingId');
    const source = getUrlParameter('source');
    
    if (bookingId && source === 'draft') {
        // Fetch booking from Firebase draftBookings collection
        console.log('Attempting to fetch booking from Firebase with ID:', bookingId);
        
        fetchDraftBookingFromFirebase(bookingId)
            .then(bookingData => {
                if (bookingData) {
                    // Set up page with the Firebase booking data
                    setupPaymentHandlers(bookingData);
                    updateSummaryDisplay(bookingData);
                    setupPaymentOptions(bookingData);
                    setupPaymentMethodListeners();
                    addValidationListeners();
                    
                    // Store the booking ID for later use
                    localStorage.setItem('tempBookingId', bookingId);
                } else {
                    // Fallback to localStorage if Firebase lookup fails
                    console.warn('Firebase lookup failed, falling back to localStorage');
                    const storedData = getBookingData();
                    if (storedData) {
                        setupPaymentHandlers(storedData);
                        updateSummaryDisplay(storedData);
                        setupPaymentOptions(storedData);
                        setupPaymentMethodListeners();
                        addValidationListeners();
                    } else {
                        console.error('No booking data found in Firebase or localStorage');
                        alert('Could not retrieve your booking information. Please try again.');
                        window.location.href = '../Homepage/rooms.html';
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching draft booking:', error);
                // Fallback to localStorage
                const storedData = getBookingData();
                if (storedData) {
                    setupPaymentHandlers(storedData);
                    updateSummaryDisplay(storedData);
                    setupPaymentOptions(storedData);
                    setupPaymentMethodListeners();
                    addValidationListeners();
                } else {
                    alert('Could not retrieve your booking information. Please try again.');
                    window.location.href = '../Homepage/rooms.html';
                }
            });
    } else {
        // Fallback to localStorage
        console.log('No Firebase ID or source provided, using localStorage');
        const storedData = getBookingData();
        if (storedData) {
            setupPaymentHandlers(storedData);
            updateSummaryDisplay(storedData);
            setupPaymentOptions(storedData);
            setupPaymentMethodListeners();
            addValidationListeners();
        } else {
            alert('Could not retrieve your booking information. Please try again.');
            window.location.href = '../Homepage/rooms.html';
        }
    }
}

// Setup payment handlers
function setupPaymentHandlers(bookingData) {
    console.log('Setting up payment handlers with booking data:', bookingData);
    
    // Process payment on button click
    const confirmButton = document.getElementById('confirm-button');
    if (confirmButton) {
        confirmButton.addEventListener('click', () => {
            processPaymentAndBooking(bookingData);
        });
    } else {
        console.warn('Confirm button not found');
    }
    
    // Add button validation
    validatePaymentForm();
}

// Validate payment form fields
function validatePaymentForm() {
    console.log('Validating payment form');
    
    const confirmButton = document.getElementById('confirm-button');
    if (!confirmButton) {
        console.warn('Confirm button not found for validation');
        return false;
    }
    
    // Get selected payment method
    const selectedPaymentMethod = document.querySelector('input[name="payment_method"]:checked');
    if (!selectedPaymentMethod) {
        console.warn('No payment method selected');
        confirmButton.disabled = true;
        return false;
    }
    
    // Get selected payment type
    const selectedPaymentType = document.querySelector('input[name="payment_type"]:checked');
    if (!selectedPaymentType) {
        console.warn('No payment type selected');
        confirmButton.disabled = true;
        return false;
    }
    
    const paymentMethod = selectedPaymentMethod.value;
    console.log('Selected payment method:', paymentMethod);
    
    // Check validation based on payment method
    let isValid = false;
    
    if (paymentMethod === 'card') {
        const cardInputs = [
            document.getElementById('card-number'),
            document.getElementById('card-expiration'),
            document.getElementById('card-cvv'),
            document.getElementById('card-zip'),
            document.getElementById('card-country')
        ];
        
        const allFieldsFilled = cardInputs.every(input => {
            if (!input) {
                console.warn(`Card input field not found: ${input}`);
                return false;
            }
            return input.value.trim() !== '';
        });
        
        isValid = allFieldsFilled;
        confirmButton.disabled = !isValid;
        console.log('Card validation result:', isValid);
        
    } else if (paymentMethod === 'gcash') {
        const gcashRef = document.getElementById('gcash-reference');
        isValid = gcashRef && gcashRef.value.trim() !== '';
        confirmButton.disabled = !isValid;
        console.log('GCash validation result:', isValid);
        
    } else if (paymentMethod === 'paypal') {
        // PayPal doesn't need any additional validation
        isValid = true;
        confirmButton.disabled = false;
        console.log('PayPal selected, no validation needed');
    }
    
    // Add input listeners to all form fields for real-time validation
    addValidationListeners();
    
    return isValid;
}

// Add input listeners for form validation
function addValidationListeners() {
    const cardInputs = [
        document.getElementById('card-number'),
        document.getElementById('card-expiration'),
        document.getElementById('card-cvv'),
        document.getElementById('card-zip'),
        document.getElementById('card-country')
    ];
    
    const gcashRef = document.getElementById('gcash-reference');
    
    // Add event listeners to card inputs
    cardInputs.forEach(input => {
        if (input && !input.hasValidationListener) {
            input.addEventListener('input', validatePaymentForm);
            input.hasValidationListener = true;
        }
    });
    
    // Add event listener to GCash reference
    if (gcashRef && !gcashRef.hasValidationListener) {
        gcashRef.addEventListener('input', validatePaymentForm);
        gcashRef.hasValidationListener = true;
    }
    
    // Add event listeners to payment method radio buttons
    const paymentMethods = document.querySelectorAll('input[name="payment_method"]');
    paymentMethods.forEach(method => {
        if (method && !method.hasValidationListener) {
            method.addEventListener('change', validatePaymentForm);
            method.hasValidationListener = true;
        }
    });
}

function updateSummaryDisplay(bookingData) {
    console.log('updateSummaryDisplay called with:', bookingData);
    if (!bookingData) {
        console.error('No booking data provided to updateSummaryDisplay');
        return;
    }

    try {
        // Format dates for display with time
        const formatDate = (date) => {
            console.log('Formatting date:', date);
            if (!date) {
                console.warn('Invalid date provided for formatting');
                return 'N/A';
            }
            
            let dateObj = date;
            if (typeof date === 'string') {
                console.log('Converting string date to Date object:', date);
                dateObj = new Date(date);
            }
            
            if (dateObj instanceof Date && !isNaN(dateObj)) {
                // Format with date and time
                const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
                const timeOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
                
                return `${dateObj.toLocaleDateString('en-US', dateOptions)}, ${dateObj.toLocaleTimeString('en-US', timeOptions)}`;
            } else {
                console.warn('Invalid date after conversion:', dateObj);
                return 'Invalid Date';
            }
        };

        // Define currency symbol - use Philippine Peso (₱)
        const currencySymbol = '₱';

        // Update check-in date
        const checkInElement = document.getElementById('summary-checkin');
        if (checkInElement) {
            checkInElement.textContent = formatDate(bookingData.checkIn);
            console.log('Updated check-in date:', checkInElement.textContent);
        } else {
            console.warn('Element summary-checkin not found');
        }

        // Update check-out date
        const checkOutElement = document.getElementById('summary-checkout');
        if (checkOutElement) {
            checkOutElement.textContent = formatDate(bookingData.checkOut);
            console.log('Updated check-out date:', checkOutElement.textContent);
        } else {
            console.warn('Element summary-checkout not found');
        }

        // Update guests
        const guestsElement = document.getElementById('summary-guests');
        if (guestsElement) {
            guestsElement.textContent = bookingData.guests ? `${bookingData.guests} guest${bookingData.guests !== 1 ? 's' : ''}` : 'N/A';
            console.log('Updated guests:', guestsElement.textContent);
        } else {
            console.warn('Element summary-guests not found');
        }

        // Update contact - prioritize contact number from the booking data
        const contactElement = document.getElementById('summary-contact');
        if (contactElement) {
            contactElement.textContent = bookingData.contactNumber || bookingData.contact || bookingData.email || 'N/A';
            console.log('Updated contact:', contactElement.textContent);
        } else {
            console.warn('Element summary-contact not found');
        }

        // Calculate and display nights or hours based on booking type
        const nightsElement = document.getElementById('summary-nights');
        if (nightsElement) {
            if (bookingData.isHourlyRate || bookingData.bookingType === 'hourly') {
                // For hourly bookings
                const hours = bookingData.duration || 
                    (bookingData.numberOfHours || 
                        Math.ceil(Math.abs(new Date(bookingData.checkOut) - new Date(bookingData.checkIn)) / (1000 * 60 * 60)));
                
                nightsElement.textContent = `${hours} hour${hours !== 1 ? 's' : ''}`;
            } else {
                // For nightly bookings
                const nights = bookingData.numberOfNights || 
                    Math.ceil(Math.abs(new Date(bookingData.checkOut) - new Date(bookingData.checkIn)) / (1000 * 60 * 60 * 24));
                
                nightsElement.textContent = `${nights} night${nights !== 1 ? 's' : ''}`;
            }
            console.log('Updated length of stay:', nightsElement.textContent);
        } else {
            console.warn('Element summary-nights not found');
        }

        // Update rate per night/hour
        const rateElement = document.getElementById('summary-rate');
        if (rateElement) {
            if (bookingData.isHourlyRate || bookingData.bookingType === 'hourly') {
                // Use hourly rate
                rateElement.textContent = `${currencySymbol}${bookingData.hourlyRate || 
                    (bookingData.subtotal / bookingData.duration) || 
                    bookingData.nightlyRate || 0}`;
            } else {
                // Use nightly rate
                rateElement.textContent = `${currencySymbol}${bookingData.nightlyRate || 0}`;
            }
            console.log('Updated rate:', rateElement.textContent);
        } else {
            console.warn('Element summary-rate not found');
        }

        // Update subtotal
        const subtotalElement = document.getElementById('summary-subtotal');
        if (subtotalElement) {
            subtotalElement.textContent = `${currencySymbol}${bookingData.subtotal || 0}`;
            console.log('Updated subtotal:', subtotalElement.textContent);
        } else {
            console.warn('Element summary-subtotal not found');
        }

        // Update service fee
        const feeElement = document.getElementById('summary-fee');
        if (feeElement) {
            feeElement.textContent = `${currencySymbol}${bookingData.serviceFee || 0}`;
            console.log('Updated service fee:', feeElement.textContent);
        } else {
            console.warn('Element summary-fee not found');
        }

        // Update total price
        const totalElement = document.getElementById('summary-total');
        if (totalElement) {
            totalElement.textContent = `${currencySymbol}${bookingData.totalPrice || 0}`;
            console.log('Updated total price:', totalElement.textContent);
        } else {
            console.warn('Element summary-total not found');
        }

        // Update payment options
        updatePaymentAmounts(bookingData.totalPrice || 0);
    } catch (error) {
        console.error('Error updating summary display:', error);
    }
}

function updatePaymentAmounts(totalPrice) {
    console.log('Updating payment amounts with total:', totalPrice); // Debug log
    
    // Ensure totalPrice is a number
    if (typeof totalPrice !== 'number' || isNaN(totalPrice)) {
        totalPrice = 0;
        console.warn('Invalid totalPrice provided to updatePaymentAmounts, using 0');
    }
    
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
    try {
        console.log('Processing payment and finalizing booking');
        
        // Get booking ID and source
        const bookingId = getUrlParameter('bookingId') || localStorage.getItem('tempBookingId');
        const source = getUrlParameter('source');
        
        let bookingData;
        
        // Determine where to get booking data from
        if (bookingId && source === 'draft') {
            console.log('Getting booking data from Firebase draft collection');
            bookingData = await fetchDraftBookingFromFirebase(bookingId);
            
            if (!bookingData) {
                throw new Error('Draft booking not found in Firebase');
            }
        } else {
            console.log('Getting booking data from localStorage');
            bookingData = getBookingData();
            
            if (!bookingData) {
                throw new Error('No booking data found in localStorage');
            }
        }
        
        // Validate booking data
        if (!bookingData.userId) {
            throw new Error('Invalid booking data: missing user ID');
        }
        
        // Get selected payment method and type
        const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
        const paymentType = document.querySelector('input[name="payment_type"]:checked').value;
        
        // Create payment data object with details from form
        const paymentData = {
            method: paymentMethod,
            type: paymentType,
            amount: bookingData.totalPrice,
            timestamp: new Date().toISOString(),
            status: 'completed',
            // Include additional payment details based on method
            details: {}
        };
        
        // Add method-specific details
        if (paymentMethod === 'card') {
            // Mask card number for security - only keep last 4 digits
            const cardNumber = document.getElementById('card-number').value;
            const lastFourDigits = cardNumber.slice(-4);
            
            paymentData.details = {
                cardLastFour: lastFourDigits,
                expirationDate: document.getElementById('card-expiration').value,
                country: document.getElementById('card-country').value
            };
        } else if (paymentMethod === 'gcash') {
            paymentData.details = {
                referenceNumber: document.getElementById('gcash-reference').value
            };
        }
        
        // Different handling based on source
        let confirmedBookingId;
        
        if (bookingId && source === 'draft') {
            // Use confirmDraftBooking to move from draft to confirmed
            console.log('Confirming draft booking with ID:', bookingId);
            
            try {
                // First update the draft with payment information
                const draftBookingRef = doc(db, 'draftBookings', bookingId);
                await updateDoc(draftBookingRef, {
                    paymentDetails: paymentData,
                    paymentStatus: 'paid',
                    updatedAt: Timestamp.now()
                });
                
                // Then use confirmDraftBooking to move to everlodgebookings
                confirmedBookingId = await confirmDraftBooking(bookingId);
                console.log('Booking confirmed with ID:', confirmedBookingId);
            } catch (error) {
                console.error('Error confirming draft booking:', error);
                
                // Fallback: if the confirmDraftBooking fails, try direct approach
                const bookingsRef = collection(db, 'everlodgebookings');
                const docRef = await addDoc(bookingsRef, {
                    ...bookingData,
                    paymentDetails: paymentData,
                    paymentStatus: 'paid',
                    status: 'confirmed',
                    confirmedAt: Timestamp.now()
                });
                
                confirmedBookingId = docRef.id;
                console.log('Booking added directly with ID:', confirmedBookingId);
                
                // Still try to delete the draft
                try {
                    const draftBookingRef = doc(db, 'draftBookings', bookingId);
                    await deleteDoc(draftBookingRef);
                } catch (deleteError) {
                    console.error('Error deleting draft booking:', deleteError);
                }
            }
        } else {
            // Regular localStorage-based booking
            console.log('Creating new booking from localStorage data');
            
            // Ensure the appropriate date format for Firestore
            const formattedBooking = {
                ...bookingData,
                checkIn: bookingData.checkIn instanceof Date ? 
                        Timestamp.fromDate(bookingData.checkIn) : 
                        Timestamp.fromDate(new Date(bookingData.checkIn)),
                checkOut: bookingData.checkOut instanceof Date ? 
                         Timestamp.fromDate(bookingData.checkOut) : 
                         Timestamp.fromDate(new Date(bookingData.checkOut)),
                createdAt: Timestamp.now(),
                paymentDetails: paymentData,
                paymentStatus: 'paid',
                status: 'confirmed'
            };
            
            // Add booking document to Firebase
            const bookingsRef = collection(db, 'everlodgebookings');
            const docRef = await addDoc(bookingsRef, formattedBooking);
            confirmedBookingId = docRef.id;
            console.log('New booking created with ID:', confirmedBookingId);
        }
        
        // Store the confirmed booking ID
        localStorage.setItem('currentBookingId', confirmedBookingId);
        
        // Send booking confirmation email
        try {
            await createPaymentVerificationRequest(confirmedBookingId, {
                userId: bookingData.userId,
                email: bookingData.email || currentUser.email,
                bookingRef: confirmedBookingId,
                paymentStatus: 'paid'
            });
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
            // Continue even if email fails
        }
        
        return confirmedBookingId;
    } catch (error) {
        console.error('Error in processPaymentAndBooking:', error);
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
    
    // Function to update selected class
    const updateSelectedClass = (selectedValue) => {
        // Remove selected class from all options
        document.querySelectorAll('input[name="payment_type"]').forEach(radio => {
            const parentOption = radio.closest('.payment-method-option');
            if (parentOption) {
                parentOption.classList.remove('selected');
            }
        });
        
        // Add selected class to the parent of the selected radio
        const selectedRadio = document.querySelector(`input[name="payment_type"][value="${selectedValue}"]`);
        if (selectedRadio) {
            const parentOption = selectedRadio.closest('.payment-method-option');
            if (parentOption) {
                parentOption.classList.add('selected');
            }
        }
    };
    
    if (paymentTypeRadios.length > 0) {
        const defaultRadio = paymentTypeRadios[0];
        defaultRadio.checked = true; // Default to first option (pay now)
        updateSelectedClass(defaultRadio.value); // Update selected styling
        
        console.log(`[Debug] Default payment TYPE set to: ${defaultRadio.value}`);

        paymentTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                console.log(`[Debug] Payment type changed to: ${radio.value}`);
                updateSelectedClass(radio.value); // Update selected styling
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
    
    // Function to update selected class
    const updateSelectedClass = (selectedValue) => {
        // Remove selected class from all options
        document.querySelectorAll('.payment-method-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        // Add selected class to the parent of the selected radio
        const selectedRadio = document.querySelector(`input[name="payment_method"][value="${selectedValue}"]`);
        if (selectedRadio) {
            const parentOption = selectedRadio.closest('.payment-method-option');
            if (parentOption) {
                parentOption.classList.add('selected');
            }
        }
    };
    
    // Default to the first payment method (e.g., 'card')
    if (paymentMethodRadios.length > 0) {
        const defaultRadio = paymentMethodRadios[0]; // Get the first radio
        defaultRadio.checked = true; // Explicitly check it
        updateSelectedClass(defaultRadio.value); // Update selected styling
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
            
            // Update styling for selected option
            updateSelectedClass(radio.value);
            
            validatePaymentForm(); // Validate whenever method changes
        });
    });
}

// Add this function near the top of the file to handle URL parameters
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Add this function to clear any default values from the summary display
function clearDefaultSummaryValues() {
    console.log('Clearing any default values from summary display');
    // Elements to clear
    const elementsToReset = [
        'summary-checkin',
        'summary-checkout',
        'summary-guests',
        'summary-contact',
        'summary-nights',
        'summary-rate',
        'summary-subtotal',
        'summary-fee',
        'summary-total',
        'pay-now-amount',
        'pay-later-first',
        'pay-later-second'
    ];
    
    // Reset each element
    elementsToReset.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = '';
        }
    });
}

// Add this debugging function at the top of the file after imports
function debugLocalStorage(label) {
  console.log(`========== DEBUG localStorage (${label}) ==========`);
  console.log('tempBookingData:', localStorage.getItem('tempBookingData'));
  console.log('bookingData:', localStorage.getItem('bookingData'));
  console.log('tempBookingId:', localStorage.getItem('tempBookingId'));
  console.log('currentBookingId:', localStorage.getItem('currentBookingId'));
  console.log('================================================');
}

// At the start of DOMContentLoaded event handler, add debugging
document.addEventListener('DOMContentLoaded', () => {
    console.log('Document loaded, initializing payment page');
    
    // Debug localStorage at page load
    debugLocalStorage('page load');
    
    // Clear any default values immediately
    clearDefaultSummaryValues();
    
    // Check for URL parameters
    const tempBookingId = getUrlParameter('tempBookingId');
    const bookingId = getUrlParameter('bookingId');
    
    console.log('URL parameters - tempBookingId:', tempBookingId, 'bookingId:', bookingId);
    
    // Store IDs in localStorage if they exist in URL
    if (tempBookingId) {
        console.log('Storing tempBookingId in localStorage:', tempBookingId);
        localStorage.setItem('tempBookingId', tempBookingId);
    }
    
    if (bookingId) {
        console.log('Storing bookingId in localStorage:', bookingId);
        localStorage.setItem('currentBookingId', bookingId);
    }
    
    // Get any saved booking data from sessionStorage (in case localStorage failed)
    const sessionBookingData = sessionStorage.getItem('backupBookingData');
    if (sessionBookingData) {
        console.log('Found booking data in sessionStorage, restoring to localStorage');
        localStorage.setItem('tempBookingData', sessionBookingData);
        localStorage.setItem('bookingData', sessionBookingData);
    }
    
    // Debug localStorage after restoring from sessionStorage
    debugLocalStorage('after session restore');
    
    // Initialize the page
    initializePage();
    
    // Safety check - re-initialize after a delay to ensure booking data loads correctly
    setTimeout(() => {
        // Check if summary fields are still empty
        const checkInElement = document.getElementById('summary-checkin');
        if (!checkInElement || !checkInElement.textContent.trim()) {
            console.log('Summary fields still empty after initial load, trying again...');
            debugLocalStorage('retry initialization');
            initializePage();
        }
    }, 500);
    
    // Set up screenshot upload
    const screenshotInput = document.getElementById('payment-screenshot');
    const screenshotPreview = document.getElementById('screenshot-preview');
    
    if (screenshotInput && screenshotPreview) {
        screenshotInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                screenshotPreview.classList.remove('hidden');
            } else {
                screenshotPreview.classList.add('hidden');
            }
        });
    }
    
    // Set up payment method listeners
    setupPaymentMethodListeners();
    
    // Set up payment options
    setupPaymentOptions();
    
    // Check authentication state immediately
    import('../firebase.js').then(module => {
        const { auth } = module;
        auth.onAuthStateChanged(user => {
            if (user) {
                console.log('User is authenticated:', user.email);
            } else {
                console.log('No user is authenticated');
            }
        });
    });
});

// Helper function to calculate nights between two dates
function calculateNights(checkIn, checkOut) {
    console.log('Calculating nights between:', checkIn, 'and', checkOut);
    try {
        // Convert to Date objects if they're strings or timestamps
        let checkInDate = checkIn;
        let checkOutDate = checkOut;
        
        if (typeof checkIn === 'string') {
            checkInDate = new Date(checkIn);
            console.log('Converted checkIn string to Date:', checkInDate);
        } else if (checkIn && typeof checkIn === 'object' && 'seconds' in checkIn) {
            // Handle Firebase Timestamp
            checkInDate = new Date(checkIn.seconds * 1000);
            console.log('Converted checkIn Timestamp to Date:', checkInDate);
        }
        
        if (typeof checkOut === 'string') {
            checkOutDate = new Date(checkOut);
            console.log('Converted checkOut string to Date:', checkOutDate);
        } else if (checkOut && typeof checkOut === 'object' && 'seconds' in checkOut) {
            // Handle Firebase Timestamp
            checkOutDate = new Date(checkOut.seconds * 1000);
            console.log('Converted checkOut Timestamp to Date:', checkOutDate);
        }
        
        // Check if dates are valid
        if (!checkInDate || !checkOutDate || isNaN(checkInDate) || isNaN(checkOutDate)) {
            console.warn('Invalid dates for calculating nights', { checkInDate, checkOutDate });
            return 0;
        }
        
        // Calculate difference in days
        const diffTime = checkOutDate.getTime() - checkInDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        console.log('Calculated nights:', diffDays);
        return diffDays > 0 ? diffDays : 1; // Minimum 1 night
    } catch (error) {
        console.error('Error calculating nights:', error);
        return 1; // Default to 1 night on error
    }
}

// Add this new function to fetch booking data from Firebase
async function fetchDraftBookingFromFirebase(bookingId) {
  try {
    console.log('Fetching draft booking from Firebase with ID:', bookingId);
    
    // Reference to the draft booking document
    const draftBookingRef = doc(db, 'draftBookings', bookingId);
    const draftBookingDoc = await getDoc(draftBookingRef);
    
    if (draftBookingDoc.exists()) {
      const bookingData = draftBookingDoc.data();
      console.log('Found draft booking in Firebase:', bookingData);
      
      // Convert Firestore timestamps to Date objects
      if (bookingData.checkIn && typeof bookingData.checkIn.toDate === 'function') {
        bookingData.checkIn = bookingData.checkIn.toDate().toISOString();
      }
      if (bookingData.checkOut && typeof bookingData.checkOut.toDate === 'function') {
        bookingData.checkOut = bookingData.checkOut.toDate().toISOString();
      }
      if (bookingData.createdAt && typeof bookingData.createdAt.toDate === 'function') {
        bookingData.createdAt = bookingData.createdAt.toDate().toISOString();
      }
      
      // Store in localStorage as backup
      localStorage.setItem('tempBookingData', JSON.stringify(bookingData));
      
      return bookingData;
    } else {
      console.warn('No draft booking found with ID:', bookingId);
      return null;
    }
  } catch (error) {
    console.error('Error fetching draft booking:', error);
    throw error;
  }
}