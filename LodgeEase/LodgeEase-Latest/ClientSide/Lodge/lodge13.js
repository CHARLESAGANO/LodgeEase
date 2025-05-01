import { auth, db } from '../../AdminSide/firebase.js';
import { doc, getDoc, collection, addDoc, Timestamp, query, where, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ReviewSystem } from '../components/reviewSystem.js';
import { 
  STANDARD_RATE, 
  NIGHT_PROMO_RATE, 
  SERVICE_FEE_PERCENTAGE,
  WEEKLY_DISCOUNT,
  TWO_HOUR_RATE,
  THREE_HOUR_RATE,
  FOUR_HOUR_RATE,
  FIVE_HOUR_RATE,
  SIX_HOUR_RATE,
  SEVEN_HOUR_RATE,
  EIGHT_HOUR_RATE,
  NINE_HOUR_RATE,
  TEN_HOUR_RATE,
  ELEVEN_HOUR_RATE,
  TWELVE_HOUR_RATE,
  THIRTEEN_HOUR_RATE,
  FOURTEEN_TO_24_HOUR_RATE,
  TV_REMOTE_FEE,
  calculateNights,
  calculateHours,
  isNightPromoEligible,
  getHourlyRate,
  calculateBookingCosts
} from '../../AdminSide/js/rateCalculation.js';

// Calendar Functionality
const calendarModal = document.getElementById('calendar-modal');
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonth = document.getElementById('calendar-month');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const clearDatesBtn = document.getElementById('clear-dates');
const closeCalendarBtn = document.getElementById('close-calendar');
const checkInInput = document.getElementById('check-in-date');
const checkOutInput = document.getElementById('check-out-date');
const nightsSelected = document.getElementById('nights-selected');
const pricingDetails = document.getElementById('pricing-details');
const nightsCalculation = document.getElementById('nights-calculation');
const totalNightsPrice = document.getElementById('total-nights-price');
const totalPrice = document.getElementById('total-price');
const promoDiscountRow = document.getElementById('promo-discount-row');
const promoDiscount = document.getElementById('promo-discount');
let serviceFee = document.getElementById('service-fee');
let checkInTime = document.getElementById('check-in-time');
let bookingType = 'standard'; // Default booking type

let currentDate = new Date(); // Current date
let selectedCheckIn = null;
let selectedCheckOut = null;

// Initialize timeslot selection to determine rate
function initializeTimeSlotSelector() {
  // Get references to new UI elements
  const hourlyToggle = document.getElementById('hourlyToggle') || document.getElementById('hourly-toggle');
  const rateTypeDisplay = document.getElementById('rate-type-display');
  const rateInfo = document.getElementById('rate-info');
  const hiddenInput = document.getElementById('check-in-time'); // hidden input that stores the value
  
  // Hide hourly toggle if it exists since we no longer need it
  if (hourlyToggle) {
    const toggleContainer = hourlyToggle.closest('.toggle-container') || hourlyToggle.parentElement;
    if (toggleContainer) {
      toggleContainer.style.display = 'none';
    } else {
      hourlyToggle.style.display = 'none';
    }
  }
  
  // Set default booking type to standard
  bookingType = 'standard';
  if (hiddenInput) hiddenInput.value = 'standard';
  
  // Update rate display
  if (rateTypeDisplay) {
    rateTypeDisplay.textContent = 'Standard (₱1,300/night)';
    rateTypeDisplay.classList.remove('text-orange-600', 'text-green-600');
    rateTypeDisplay.classList.add('text-blue-700');
  }
  
  if (rateInfo) {
    rateInfo.textContent = 'Night promo rate (₱580) automatically applied for eligible one-night stays. Base rate (₱380) applies if no check-out date is selected.';
  }
}

function renderCalendar(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  
  calendarMonth.textContent = `${date.toLocaleString('default', { month: 'long' })} ${year}`;
  calendarGrid.innerHTML = '';

  // Weekday headers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdays.forEach(day => {
    const dayEl = document.createElement('div');
    dayEl.textContent = day;
    dayEl.className = 'text-xs font-medium text-gray-500';
    calendarGrid.appendChild(dayEl);
  });

  // Calculate first day of the month and previous month's last days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startingDay = firstDay.getDay();

  // Add previous month's days
  for (let i = 0; i < startingDay; i++) {
    const dayEl = document.createElement('div');
    dayEl.textContent = new Date(year, month, -startingDay + i + 1).getDate();
    dayEl.className = 'text-gray-300';
    calendarGrid.appendChild(dayEl);
  }

  // Add current month's days
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dayEl = document.createElement('div');
    dayEl.textContent = day;
    dayEl.className = 'hover-date text-gray-500 hover:bg-blue-50 rounded py-2';
    
    const currentDay = new Date(year, month, day);

    // Check if day is in range
    if (selectedCheckIn && selectedCheckOut && 
        currentDay > selectedCheckIn && 
        currentDay < selectedCheckOut) {
      dayEl.classList.add('in-range');
    }

    // Highlight selected dates
    if ((selectedCheckIn && currentDay.toDateString() === selectedCheckIn.toDateString()) ||
        (selectedCheckOut && currentDay.toDateString() === selectedCheckOut.toDateString())) {
      dayEl.classList.add('selected-date');
    }

    dayEl.addEventListener('click', () => handleDateSelection(currentDay));
    calendarGrid.appendChild(dayEl);
  }
}

function handleDateSelection(selectedDate) {
  if (!selectedCheckIn || (selectedCheckIn && selectedCheckOut)) {
    // First selection or reset
    selectedCheckIn = selectedDate;
    selectedCheckOut = null;
    checkInInput.value = formatDate(selectedDate);
    checkOutInput.value = '';
  } else {
    // Second selection
    if (selectedDate > selectedCheckIn) {
      selectedCheckOut = selectedDate;
      checkOutInput.value = formatDate(selectedDate);

      // Calculate nights and update pricing
      updatePriceCalculation();
    } else {
      // If selected date is before check-in, reset and start over
      selectedCheckIn = selectedDate;
      selectedCheckOut = null;
      checkInInput.value = formatDate(selectedDate);
      checkOutInput.value = '';
    }
  }

  renderCalendar(currentDate);
  
  // Check if night promo is eligible after date selection
  if (selectedCheckIn && selectedCheckOut) {
    updatePromoEligibility();
  }
}

// Update the function to calculate pricing based only on check-in and check-out dates
function updatePriceCalculation() {
  if (!selectedCheckIn) return;
  
  // If no check-out date is selected, use the base rate (380 pesos)
  if (!selectedCheckOut) {
    // Use the shared rate calculation for base rate (no checkout)
    const { nightlyRate, subtotal, serviceFeeAmount, totalAmount } = calculateBookingCosts(
      0, // nights
      'standard', // doesn't matter, will use base rate
      false, // hasCheckOut is false
      false, // hasTvRemote
      0 // hours are automatically set to 3 in the calculation
    );
    
    // Update display text
    nightsSelected.textContent = `Base rate`;
    nightsCalculation.textContent = `₱${nightlyRate.toLocaleString()} base rate`;
    totalNightsPrice.textContent = `₱${subtotal.toLocaleString()}`;
    
    // Update UI with calculated values
    serviceFee.textContent = `₱${serviceFeeAmount.toLocaleString()}`;
    pricingDetails.classList.remove('hidden');
    totalPrice.textContent = `₱${totalAmount.toLocaleString()}`;
    
    // Hide promo discount row 
    if (promoDiscountRow) {
      promoDiscountRow.classList.add('hidden');
    }
    
    return;
  }
  
  // When both check-in and check-out dates are available, calculate nights
  const nights = calculateNights(selectedCheckIn, selectedCheckOut);
  nightsSelected.textContent = `${nights} nights selected`;
  
  // Check if eligible for night promo - valid for any one-night stay
  const isPromoEligible = isNightPromoEligible(nights);
  
  // Get the booking type (standard or night-promo)
  const bookingTimeSlot = isPromoEligible && bookingType === 'night-promo' ? 'night-promo' : 'standard';
  
  // Use the shared rate calculation
  const { nightlyRate, subtotal, discountAmount, serviceFeeAmount, totalAmount } = calculateBookingCosts(
    nights,
    bookingTimeSlot,
    true, // hasCheckOut
    false, // hasTvRemote
    0 // hours not needed, duration calculated from dates
  );

  // Update promo banner visibility
  const promoBanner = document.getElementById('promo-banner');
  if (promoBanner) {
    promoBanner.classList.toggle('hidden', !isPromoEligible);
  }
  
  // Update UI
  nightsCalculation.textContent = `₱${nightlyRate.toLocaleString()} x ${nights} nights`;
  totalNightsPrice.textContent = `₱${(nightlyRate * nights).toLocaleString()}`;
  
  // Show/hide discount row based on whether discount applies
  if (promoDiscountRow && promoDiscount) {
    if (discountAmount > 0) {
      promoDiscountRow.classList.remove('hidden');
      const description = nights >= 7 ? 'Weekly Discount' : 'Night Promo Discount';
      promoDiscountRow.querySelector('span:first-child').textContent = description;
      promoDiscount.textContent = `-₱${discountAmount.toLocaleString()}`;
    } else {
      promoDiscountRow.classList.add('hidden');
    }
  }
  
  serviceFee.textContent = `₱${serviceFeeAmount.toLocaleString()}`;
  pricingDetails.classList.remove('hidden');
  totalPrice.textContent = `₱${totalAmount.toLocaleString()}`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

// Event Listeners
function setupCalendarListeners() {
  checkInInput?.addEventListener('click', () => {
    calendarModal.classList.remove('hidden');
    calendarModal.classList.add('flex');
  });

  checkOutInput?.addEventListener('click', () => {
    if (selectedCheckIn) {
      calendarModal.classList.remove('hidden');
      calendarModal.classList.add('flex');
    }
  });

  closeCalendarBtn?.addEventListener('click', () => {
    calendarModal.classList.add('hidden');
    calendarModal.classList.remove('flex');
  });

  clearDatesBtn?.addEventListener('click', () => {
    selectedCheckIn = null;
    selectedCheckOut = null;
    checkInInput.value = '';
    checkOutInput.value = '';
    nightsSelected.textContent = '';
    pricingDetails.classList.add('hidden');
    renderCalendar(currentDate);
  });

  prevMonthBtn?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
  });

  nextMonthBtn?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
  });

  // Close calendar when clicking outside
  calendarModal?.addEventListener('click', (e) => {
    if (e.target === calendarModal) {
      calendarModal.classList.add('hidden');
      calendarModal.classList.remove('flex');
    }
  });
}

// Add check for promo eligibility when the page loads or dates change
function updatePromoEligibility() {
  const promoBanner = document.getElementById('promo-banner');
  const rateTypeDisplay = document.getElementById('rate-type-display');
  const rateInfo = document.getElementById('rate-info');
  const hiddenInput = document.getElementById('check-in-time');
  const hourlyToggle = document.getElementById('hourlyToggle') || document.getElementById('hourly-toggle');
  
  // If hourly is toggled on, don't change anything
  if (hourlyToggle && hourlyToggle.checked) {
    return;
  }
  
  if (promoBanner) {
    // By default, hide the promo banner until valid dates are selected
    promoBanner.classList.add('hidden');
  }
  
  if (selectedCheckIn && selectedCheckOut) {
    const nights = Math.round((selectedCheckOut - selectedCheckIn) / (1000 * 60 * 60 * 24));
    
    // Updated to allow any one-night stay
    const isPromoEligible = nights === 1;
    
    if (isPromoEligible) {
      if (promoBanner) {
        promoBanner.classList.remove('hidden');
      }
      
      // Automatically switch to night promo rate
      bookingType = 'night-promo';
      if (hiddenInput) hiddenInput.value = 'night-promo';
      
      // Update the display
      if (rateTypeDisplay) {
        rateTypeDisplay.textContent = 'Night Promo (₱580/night)';
        rateTypeDisplay.classList.remove('text-blue-700');
        rateTypeDisplay.classList.add('text-green-600');
      }
      
      if (rateInfo) {
        rateInfo.textContent = 'Night promo rate applied! Check-in between 10:00 PM and 8:00 AM';
      }
    } else {
      // Switch to standard rate for multiple nights
      bookingType = 'standard';
      if (hiddenInput) hiddenInput.value = 'standard';
      
      // Update the display
      if (rateTypeDisplay) {
        rateTypeDisplay.textContent = 'Standard (₱1,300/night)';
        rateTypeDisplay.classList.remove('text-green-600', 'text-orange-600');
        rateTypeDisplay.classList.add('text-blue-700');
      }
      
      if (rateInfo) {
        rateInfo.textContent = 'Night promo rate only available for one-night stays';
      }
    }
    
    // Update pricing with the new rate type
    updatePriceCalculation();
  }
}

function updateDateInputs() {
  if (checkInInput && selectedCheckIn) {
    checkInInput.value = formatDate(selectedCheckIn);
  }
  if (checkOutInput && selectedCheckOut) {
    checkOutInput.value = formatDate(selectedCheckOut);
  }
}

// Get current user data
async function getCurrentUserData() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.log('No user is signed in');
            return null;
        }

        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            return userDoc.data();
        } else {
            console.log('No user data found');
            return null;
        }
    } catch (error) {
        console.error('Error getting user data:', error);
        throw error;
    }
}

// Check if room is available for the selected dates
async function checkRoomAvailability(roomNumber, checkInDate, checkOutDate) {
    try {
        console.log(`Checking availability for room ${roomNumber} from ${checkInDate} to ${checkOutDate}`);
        
        // Get bookings from Firebase that might overlap with the selected dates
        const bookingsRef = collection(db, 'everlodgebookings');
        const bookingsQuery = query(
            bookingsRef,
            where('propertyDetails.roomNumber', '==', roomNumber),
            where('status', 'in', ['Confirmed', 'Checked In', 'pending'])
        );
        
        const bookingsSnapshot = await getDocs(bookingsQuery);
        
        // Check if any existing booking overlaps with the selected dates
        for (const doc of bookingsSnapshot.docs) {
            const booking = doc.data();
            
            // Convert Firebase timestamps to JavaScript dates, handling different formats
            let existingCheckIn, existingCheckOut;
            
            // Handle different date formats that might be stored in Firestore
            try {
                if (booking.checkIn) {
                    if (typeof booking.checkIn.toDate === 'function') {
                        existingCheckIn = booking.checkIn.toDate();
                    } else if (booking.checkIn instanceof Date) {
                        existingCheckIn = booking.checkIn;
                    } else if (typeof booking.checkIn === 'string') {
                        existingCheckIn = new Date(booking.checkIn);
                    } else {
                        console.warn('Unknown checkIn date format:', booking.checkIn);
                        continue; // Skip this booking record
                    }
                } else {
                    console.warn('Missing checkIn date in booking record');
                    continue; // Skip this booking record
                }
                
                if (booking.checkOut) {
                    if (typeof booking.checkOut.toDate === 'function') {
                        existingCheckOut = booking.checkOut.toDate();
                    } else if (booking.checkOut instanceof Date) {
                        existingCheckOut = booking.checkOut;
                    } else if (typeof booking.checkOut === 'string') {
                        existingCheckOut = new Date(booking.checkOut);
                    } else {
                        console.warn('Unknown checkOut date format:', booking.checkOut);
                        continue; // Skip this booking record
                    }
                } else {
                    console.warn('Missing checkOut date in booking record');
                    continue; // Skip this booking record
                }
                
                // Verify dates are valid
                if (isNaN(existingCheckIn.getTime()) || isNaN(existingCheckOut.getTime())) {
                    console.warn('Invalid date values in booking record:', { existingCheckIn, existingCheckOut });
                    continue; // Skip this booking record
                }
            } catch (dateError) {
                console.error('Error processing dates in booking record:', dateError);
                continue; // Skip problematic booking records
            }
            
            // Check for overlap
            // New booking starts during an existing booking
            // or new booking ends during an existing booking
            // or new booking completely spans an existing booking
            if ((checkInDate < existingCheckOut && checkInDate >= existingCheckIn) ||
                (checkOutDate > existingCheckIn && checkOutDate <= existingCheckOut) ||
                (checkInDate <= existingCheckIn && checkOutDate >= existingCheckOut)) {
                
                console.log('Room not available - Found conflicting booking:', booking);
                return {
                    available: false,
                    conflictWith: {
                        id: doc.id,
                        checkIn: existingCheckIn,
                        checkOut: existingCheckOut,
                        guestName: booking.guestName || 'Another guest'
                    }
                };
            }
        }
        
        // No overlapping bookings found
        return { available: true };
        
    } catch (error) {
        console.error('Error checking room availability:', error);
        // Return a generic availability error instead of throwing
        return { 
            available: false, 
            error: error.message || 'Unknown error checking availability',
            isSystemError: true
        };
    }
}

// Find first available room from rooms 1-36
async function findAvailableRoom(checkInDate, checkOutDate) {
    try {
        console.log(`Finding available room from rooms 1-36 for dates: ${checkInDate} to ${checkOutDate}`);
        
        // Get all bookings for Ever Lodge rooms that might conflict
        const bookingsRef = collection(db, 'everlodgebookings');
        const bookingsQuery = query(
            bookingsRef,
            where('propertyDetails.name', '==', 'Ever Lodge'),
            where('status', 'in', ['Confirmed', 'Checked In', 'pending'])
        );
        
        const bookingsSnapshot = await getDocs(bookingsQuery);
        
        // Create a set of unavailable rooms (with conflicts)
        const unavailableRooms = new Set();
        
        // Identify all rooms that have overlapping bookings
        for (const doc of bookingsSnapshot.docs) {
            const booking = doc.data();
            if (!booking.propertyDetails?.roomNumber) continue;
            
            // Convert Firebase timestamps to JavaScript dates
            let existingCheckIn, existingCheckOut;
            
            try {
                // Parse check-in date
                if (booking.checkIn) {
                    if (typeof booking.checkIn.toDate === 'function') {
                        existingCheckIn = booking.checkIn.toDate();
                    } else if (booking.checkIn instanceof Date) {
                        existingCheckIn = booking.checkIn;
                    } else if (typeof booking.checkIn === 'string') {
                        existingCheckIn = new Date(booking.checkIn);
                    } else {
                        continue; // Skip invalid date format
                    }
                } else {
                    continue; // Skip if no check-in date
                }
                
                // Parse check-out date
                if (booking.checkOut) {
                    if (typeof booking.checkOut.toDate === 'function') {
                        existingCheckOut = booking.checkOut.toDate();
                    } else if (booking.checkOut instanceof Date) {
                        existingCheckOut = booking.checkOut;
                    } else if (typeof booking.checkOut === 'string') {
                        existingCheckOut = new Date(booking.checkOut);
                    } else {
                        continue; // Skip invalid date format
                    }
                } else {
                    continue; // Skip if no check-out date
                }
                
                // Verify dates are valid
                if (isNaN(existingCheckIn.getTime()) || isNaN(existingCheckOut.getTime())) {
                    continue; // Skip invalid dates
                }
                
                // Check if booking overlaps with requested dates
                if ((checkInDate < existingCheckOut && checkInDate >= existingCheckIn) ||
                    (checkOutDate > existingCheckIn && checkOutDate <= existingCheckOut) ||
                    (checkInDate <= existingCheckIn && checkOutDate >= existingCheckOut)) {
                    
                    // Add to unavailable rooms
                    unavailableRooms.add(booking.propertyDetails.roomNumber);
                }
            } catch (error) {
                console.error('Error processing booking dates:', error);
                continue;
            }
        }
        
        // Look for the first available room from 1-36
        for (let roomNum = 1; roomNum <= 36; roomNum++) {
            const roomNumber = roomNum.toString().padStart(2, '0'); // Format as "01", "02", etc.
            
            if (!unavailableRooms.has(roomNumber)) {
                console.log(`Found available room: ${roomNumber}`);
                return {
                    available: true,
                    roomNumber: roomNumber,
                    floorLevel: Math.ceil(roomNum / 12).toString() // Assign floor based on room number
                };
            }
        }
        
        // If no rooms are available
        return {
            available: false,
            error: 'All rooms are currently booked for these dates.'
        };
        
    } catch (error) {
        console.error('Error finding available room:', error);
        return {
            available: false,
            error: error.message || 'Failed to check room availability.',
            isSystemError: true
        };
    }
}

// Replace saveBooking with a check for existing bookings function to prevent duplicates
async function checkForExistingBooking(userId, checkIn, checkOut, roomNumber) {
    try {
        // Check if a booking with the same dates and room already exists
        const bookingsRef = collection(db, 'everlodgebookings');
        const startTime = new Date(checkIn);
        startTime.setHours(0, 0, 0, 0); // Start of day
        
        const endTime = new Date(checkOut);
        endTime.setHours(23, 59, 59, 999); // End of day
        
        // First query - check for bookings with same user ID
        let q = query(
            bookingsRef,
            where('userId', '==', userId),
            where('propertyDetails.roomNumber', '==', roomNumber),
            where('checkIn', '>=', Timestamp.fromDate(startTime)),
            where('checkIn', '<=', Timestamp.fromDate(endTime))
        );
        
        let querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            console.log('Found existing booking with same user ID');
            return true;
        }
        
        // Second query - check for bookings with same room and time regardless of user
        // This catches cases where a guest booking might exist
        q = query(
            bookingsRef,
            where('propertyDetails.roomNumber', '==', roomNumber),
            where('checkIn', '>=', Timestamp.fromDate(startTime)),
            where('checkIn', '<=', Timestamp.fromDate(endTime))
        );
        
        querySnapshot = await getDocs(q);
        // Check if any of these bookings have details that match our current booking attempt
        for (const doc of querySnapshot.docs) {
            const booking = doc.data();
            // Check if this booking might be from the same person (by contact number)
            if (booking.contactNumber && booking.contactNumber === document.getElementById('guest-contact').value) {
                console.log('Found existing booking with same contact number');
                return true;
            }
        }
        
        return false; // No duplicate found
    } catch (error) {
        console.error('Error checking for existing booking:', error);
        return false; // Assume no duplicate if there's an error
    }
}

// Add error checking function
function validateBookingData(data) {
    try {
        const requiredFields = [
            'guestName',
            'email',
            'contactNumber',
            'userId',
            'checkIn',
            'checkOut',
            'createdAt',
            'propertyDetails',
            'guests',
            'numberOfNights',
            'nightlyRate',
            'subtotal',
            'serviceFee',
            'totalPrice',
            'paymentStatus',
            'status'
        ];

        for (const field of requiredFields) {
            if (!data[field]) {
                return {
                    isValid: false,
                    error: `Missing required field: ${field}`
                };
            }
        }

        // Validate property details
        const requiredPropertyFields = ['name', 'location', 'roomNumber', 'roomType', 'floorLevel'];
        for (const field of requiredPropertyFields) {
            if (!data.propertyDetails[field]) {
                return {
                    isValid: false,
                    error: `Missing required property field: ${field}`
                };
            }
        }

        // Validate dates
        if (!(data.checkIn instanceof Timestamp)) {
            return {
                isValid: false,
                error: 'Invalid checkIn date format'
            };
        }
        if (!(data.checkOut instanceof Timestamp)) {
            return {
                isValid: false,
                error: 'Invalid checkOut date format'
            };
        }
        if (!(data.createdAt instanceof Timestamp)) {
            return {
                isValid: false,
                error: 'Invalid createdAt date format'
            };
        }

        // Validate numeric fields
        if (typeof data.numberOfNights !== 'number' || data.numberOfNights <= 0) {
            return {
                isValid: false,
                error: 'Invalid number of nights'
            };
        }
        if (typeof data.nightlyRate !== 'number' || data.nightlyRate <= 0) {
            return {
                isValid: false,
                error: 'Invalid nightly rate'
            };
        }
        if (typeof data.subtotal !== 'number' || data.subtotal <= 0) {
            return {
                isValid: false,
                error: 'Invalid subtotal'
            };
        }
        if (typeof data.serviceFee !== 'number' || data.serviceFee < 0) {
            return {
                isValid: false,
                error: 'Invalid service fee'
            };
        }
        if (typeof data.totalPrice !== 'number' || data.totalPrice <= 0) {
            return {
                isValid: false,
                error: 'Invalid total price'
            };
        }

        // All validations passed
        return {
            isValid: true,
            error: null
        };
    } catch (error) {
        console.error('Error in validateBookingData:', error);
        return {
            isValid: false,
            error: 'Validation error: ' + error.message
        };
    }
}

// Function to initialize all event listeners
function initializeEventListeners() {
    // Add all event initialization code here
    console.log('Initializing event listeners');
    
    // DO NOT add event listener for reserve button here - it's already handled in the HTML file
    // This prevents the duplicate event listener that was causing double bookings
    
    // For additional safety, let's check if there are any existing listeners 
    // by temporarily replacing the addEventListener method
    const reserveBtn = document.getElementById('reserve-btn');
    if (reserveBtn) {
        console.log('Reserve button found - ensuring no duplicate handlers are attached');
        // We don't need to do anything here - event listener is handled in HTML
    }
}

// Add event listener for page load to check for pending bookings
document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('DOM loaded for Ever Lodge');
        
        // Initialize review system
        reviewSystem.initialize();
        
        // Initialize time slot selector (now just sets standard rate)
        initializeTimeSlotSelector();
        
        // Initialize auto eligibility check for night promo
        updatePromoEligibility();
        
        // Initialize calendar on page load
        if (calendarGrid) {
            renderCalendar(currentDate);
        }
        
        // Set up calendar event listeners
        setupCalendarListeners();
        
        // Check if there's a pending booking after login
        const pendingBooking = localStorage.getItem('pendingBooking');
        if (pendingBooking && auth.currentUser) {
            const bookingDetails = JSON.parse(pendingBooking);
            
            // Restore the booking details
            selectedCheckIn = new Date(bookingDetails.checkIn);
            selectedCheckOut = new Date(bookingDetails.checkOut);
            document.querySelector('select#guests').value = bookingDetails.guests;
            document.getElementById('guest-contact').value = bookingDetails.contactNumber;
            
            // Set default booking type to standard
            bookingType = 'standard';
            const hiddenInput = document.getElementById('check-in-time');
            if (hiddenInput) hiddenInput.value = 'standard';
            
            // Update the display
            updateDateInputs();
            updatePriceCalculation();
            updatePromoEligibility(); // Update rate display
            
            // Clear the pending booking
            localStorage.removeItem('pendingBooking');
        }
        
        // Add animation for promo banner
        addPromoBannerAnimation();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Track if a booking is in progress to prevent duplicates
let isBookingInProgress = false;
// Store booking ID to prevent duplicates
let lastBookingId = null;
// Create a unique transaction ID for each booking attempt
const generateTransactionId = () => {
  return 'txn_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
};
// Current transaction ID
let currentTransactionId = null;

// Add this helper function at the beginning of the file, before the isBookingInProgress variable
function resetReserveButton() {
  try {
    const reserveBtn = document.getElementById('reserve-btn');
    if (reserveBtn) {
      reserveBtn.disabled = false;
      reserveBtn.textContent = 'Reserve';
      reserveBtn.classList.remove('bg-gray-500');
      reserveBtn.setAttribute('data-clicked', 'false');
      console.log('Reserve button reset to allow rebooking');
    }
  } catch (e) {
    console.error('Error resetting reserve button:', e);
  }
}

export async function handleReserveClick(event) {
    try {
        event.preventDefault();

        // CRITICAL FIX: Check localStorage for in-progress booking to prevent duplicates
        const bookingInProgress = localStorage.getItem('bookingInProgress');
        const bookingTimestamp = localStorage.getItem('bookingTimestamp');
        
        // If there's a booking in progress and it's less than 30 seconds old, prevent duplicate
        if (bookingInProgress === 'true' && bookingTimestamp) {
            const timestamp = parseInt(bookingTimestamp);
            const now = Date.now();
            
            // Check if the booking was started in the last 30 seconds
            if (now - timestamp < 30000) {
                console.log('Booking already in progress (from localStorage check), preventing duplicate');
                alert('Your booking is already being processed. Please wait...');
                return;
            }
        }
        
        // Set booking in progress flag with timestamp
        localStorage.setItem('bookingInProgress', 'true');
        localStorage.setItem('bookingTimestamp', Date.now().toString());

        // Generate a new transaction ID for this booking attempt
        currentTransactionId = generateTransactionId();
        console.log('Generated transaction ID:', currentTransactionId);
        localStorage.setItem('currentTransactionId', currentTransactionId);

        // Prevent duplicate bookings by checking if a booking is already in progress
        if (isBookingInProgress) {
            console.log('Booking already in progress, preventing duplicate');
            return;
        }
        
        // Set flag to indicate booking is in progress
        isBookingInProgress = true;

        // Check if user is logged in
        const user = auth.currentUser;
        
        // Get current booking type - always standard
        bookingType = 'standard';
        
        // Validate contact number
        const contactNumber = document.getElementById('guest-contact').value.trim();
        if (!contactNumber) {
            alert('Please enter your contact number');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
            return;
        }
        if (!/^[0-9]{11}$/.test(contactNumber)) {
            alert('Please enter a valid 11-digit contact number');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
            return;
        }

        // Validate guests
        const guests = document.getElementById('guests').value;
        if (!guests || guests < 1 || guests > 4) {
            alert('Please select a valid number of guests');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
            return;
        }

        // Validate dates
        if (!selectedCheckIn) {
            alert('Please select a check-in date');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
            return;
        }
        
        // For bookings with check-out date, validate the check-out date
        if (selectedCheckOut) {
            const nights = Math.round((selectedCheckOut - selectedCheckIn) / (1000 * 60 * 60 * 24));
            if (nights <= 0) {
                alert('Check-out date must be after check-in date');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }
            
            // Check for night promo eligibility
            if (nights === 1) {
                bookingType = 'night-promo';
            }
        }
        
        // Use checkout date if provided, otherwise it will be null/undefined
        const checkOutDate = selectedCheckOut;
        
        // If not logged in, save details and redirect
        if (!user) {
            const bookingDetails = {
                checkIn: selectedCheckIn,
                checkOut: checkOutDate,
                bookingType: bookingType,
                guests: guests,
                contactNumber: contactNumber
            };
            localStorage.setItem('pendingBooking', JSON.stringify(bookingDetails));
            
            const returnUrl = encodeURIComponent(window.location.href);
            window.location.href = `../Login/index.html?redirect=${returnUrl}`;
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
            return;
        }

        // Display loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        loadingMessage.innerHTML = `
            <div class="bg-white p-5 rounded-lg shadow-lg">
                <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto mb-3"></div>
                <p class="text-center">Checking room availability...</p>
            </div>
        `;
        document.body.appendChild(loadingMessage);
        
        try {
            // Find an available room in Ever Lodge
            console.log('Finding available room in Ever Lodge...');
            const roomResult = await findAvailableRoom(selectedCheckIn, checkOutDate);
            
            // Remove loading message
            document.body.removeChild(loadingMessage);
            
            if (!roomResult.available) {
                // Handle case where no rooms are available
                if (roomResult.isSystemError) {
                    console.error('System error finding available room:', roomResult.error);
                    showUnavailabilityMessage('System Error', 'We encountered a system error while checking room availability. Please try again later.');
                } else if (roomResult.conflictDetails) {
                    // Show specific booking conflict information
                    const conflictInfo = roomResult.conflictDetails;
                    showUnavailabilityMessage(
                        'Room Not Available',
                        `The room you're trying to book is already reserved for the selected dates.`,
                        `Another booking exists from ${formatDate(conflictInfo.checkIn)} to ${formatDate(conflictInfo.checkOut)}.`
                    );
                } else {
                    showUnavailabilityMessage(
                        'No Rooms Available',
                        'All rooms at Ever Lodge are currently booked for these dates.',
                        'Please try selecting different dates or contact us for assistance.'
                    );
                }
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }
            
            // Get the available room information
            const roomNumber = roomResult.roomNumber;
            const floorLevel = roomResult.floorLevel;
            
            console.log(`Selected room ${roomNumber} on floor ${floorLevel}`);

            // Get user data for the booking
            const userData = await getCurrentUserData();
            if (!userData) {
                alert('Could not retrieve user information. Please try again.');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }

            // Calculate costs based on booking type
            let nightlyRate, subtotal, discountAmount = 0, serviceFeeAmount, totalAmount;
            let nights = 0;
            
            if (bookingType === 'hourly') {
                // For hourly bookings
                duration = parseInt(hourlyDuration?.value || 3);
                nightlyRate = getHourlyRate(duration);
                subtotal = nightlyRate;
                serviceFeeAmount = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
                totalAmount = subtotal + serviceFeeAmount;
            } else {
                // For standard or night-promo bookings
                nights = Math.round((checkOutDate - selectedCheckIn) / (1000 * 60 * 60 * 24));
                
                // For night promo
                if (bookingType === 'night-promo' && nights === 1) {
                    nightlyRate = NIGHT_PROMO_RATE;
                } else {
                    // Standard rate
                    nightlyRate = STANDARD_RATE;
                    // Reset booking type if night-promo is not applicable
                    if (bookingType === 'night-promo') bookingType = 'standard';
                }
                
                subtotal = nightlyRate * nights;
                
                // Apply weekly discount if applicable
                if (nights >= 7) {
                    discountAmount = subtotal * WEEKLY_DISCOUNT;
                    subtotal -= discountAmount;
                }
                
                serviceFeeAmount = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
                totalAmount = subtotal + serviceFeeAmount;
            }

            // Check for existing booking to prevent duplicates
            const existingBooking = await checkForExistingBooking(user.uid, selectedCheckIn, checkOutDate, roomNumber);
            if (existingBooking) {
                alert('You already have a booking for the selected dates and room. Please check your bookings.');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }

            // Create properly formatted booking data for Firestore
            const bookingData = {
                userId: user.uid,
                guestName: userData.fullname || userData.username || user.displayName || user.email,
                email: userData.email || user.email,
                contactNumber: contactNumber,
                checkIn: Timestamp.fromDate(selectedCheckIn),
                checkOut: Timestamp.fromDate(checkOutDate),
                bookingType: bookingType,
                guests: Number(guests),
                numberOfNights: nights,
                duration: bookingType === 'hourly' ? duration : 0,
                nightlyRate: nightlyRate,
                subtotal: subtotal,
                serviceFee: serviceFeeAmount,
                totalPrice: totalAmount,
                createdAt: Timestamp.now(),
                propertyDetails: {
                    name: 'Ever Lodge',
                    location: 'Baguio City, Philippines',
                    roomType: 'Standard', // Always use Standard room type
                    roomNumber: roomNumber, // Use dynamically assigned room number
                    floorLevel: floorLevel // Use dynamically assigned floor level
                },
                paymentStatus: 'pending',
                status: 'pending',
                isHourlyRate: bookingType === 'hourly',
                // Add transaction ID to prevent duplicates
                transactionId: currentTransactionId
            };

            // Save booking data to localStorage for payment page
            localStorage.setItem('bookingData', JSON.stringify({
                ...bookingData,
                checkIn: bookingData.checkIn.toDate().toISOString(),
                checkOut: bookingData.checkOut.toDate().toISOString(),
                createdAt: bookingData.createdAt.toDate().toISOString()
            }));

            // IMPORTANT FIX: Check for existing transaction before creating booking
            try {
                console.log('Checking for existing booking with transaction ID:', currentTransactionId);
                
                // First check if this transaction was already processed
                const everlodgebookingsRef = collection(db, 'everlodgebookings');
                const transactionQuery = query(
                    everlodgebookingsRef,
                    where('transactionId', '==', currentTransactionId)
                );
                
                const existingTransactions = await getDocs(transactionQuery);
                
                if (!existingTransactions.empty) {
                    // We already processed this transaction, get the booking ID
                    const existingBooking = existingTransactions.docs[0];
                    console.log('Found existing booking with same transaction ID:', existingBooking.id);
                    
                    // Store the booking ID in localStorage for the payment page
                    localStorage.setItem('currentBookingId', existingBooking.id);
                    
                    // Show success message with room information before redirecting
                    const successMessage = document.createElement('div');
                    successMessage.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                    successMessage.innerHTML = `
                        <div class="bg-white p-5 rounded-lg shadow-lg max-w-md">
                            <div class="flex items-center justify-center mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 class="text-lg font-bold text-center mb-2">Booking Already Processed</h3>
                            <p class="text-center mb-4">Your booking request has already been processed. Continuing to payment.</p>
                            <div class="text-center">
                                <button class="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">Continue to Payment</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(successMessage);
                    
                    // Add click handler to button
                    const continueButton = successMessage.querySelector('button');
                    continueButton.addEventListener('click', () => {
                        // Redirect to payment page
                        window.location.href = '../paymentProcess/pay.html';
                    });
                    
                    // Also set a timeout to auto-redirect after 3 seconds
                    setTimeout(() => {
                        window.location.href = '../paymentProcess/pay.html';
                    }, 3000);
                    
                    // Clear the booking in progress flags (success case)
                    localStorage.removeItem('bookingInProgress');
                    localStorage.removeItem('bookingTimestamp');
                    isBookingInProgress = false;
                    
                }
                
                // If we get here, no existing transaction was found, create a new booking
                console.log('No existing transaction found, creating new booking');
                // Use the imported addBooking function to avoid duplicate bookings
                const bookingId = await addBooking(bookingData);
                console.log('Booking saved to everlodgebookings with ID:', bookingId);
                
                // Store the booking ID to prevent duplicates
                lastBookingId = bookingId;
                
                // Store the booking ID in localStorage for the payment page
                localStorage.setItem('currentBookingId', bookingId);
                
                // Show success message with room information before redirecting
                const successMessage = document.createElement('div');
                successMessage.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                successMessage.innerHTML = `
                    <div class="bg-white p-5 rounded-lg shadow-lg max-w-md">
                        <div class="flex items-center justify-center mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 class="text-lg font-bold text-center mb-2">Room Reserved Successfully!</h3>
                        <p class="text-center mb-4">You've been assigned Room ${roomNumber} on Floor ${floorLevel}.</p>
                        <div class="text-center">
                            <button class="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">Continue to Payment</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(successMessage);
                
                // Add click handler to button
                const continueButton = successMessage.querySelector('button');
                continueButton.addEventListener('click', () => {
                    // Redirect to payment page
                    window.location.href = '../paymentProcess/pay.html';
                });
                
                // Also set a timeout to auto-redirect after 3 seconds
                setTimeout(() => {
                    window.location.href = '../paymentProcess/pay.html';
                }, 3000);
                
                // Clear the booking in progress flags (success case)
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                isBookingInProgress = false;
                
            } catch (firebaseError) {
                console.error('Failed to save booking to Firestore:', firebaseError);
                alert('There was an issue saving your booking. Please try again.');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
            }
        } catch (error) {
            // Remove loading message and show error
            if (document.body.contains(loadingMessage)) {
                document.body.removeChild(loadingMessage);
            }
            console.error('Error checking room availability:', error);
            alert('We encountered an error while checking room availability. Please try again.');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
        }
    } catch (error) {
        console.error('Error in handleReserveClick:', error);
        alert('An error occurred while processing your reservation. Please try again.');
        isBookingInProgress = false;
        localStorage.removeItem('bookingInProgress');
        localStorage.removeItem('bookingTimestamp');
        resetReserveButton();
    }
}

// Helper function to show unavailability message with custom content
function showUnavailabilityMessage(title, message, details = '') {
    const messageEl = document.createElement('div');
    messageEl.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    messageEl.innerHTML = `
        <div class="bg-white p-5 rounded-lg shadow-lg max-w-md">
            <div class="flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h3 class="text-lg font-bold text-center mb-2">${title}</h3>
            <p class="text-center mb-2">${message}</p>
            ${details ? `<p class="text-sm text-gray-600 text-center mb-4">${details}</p>` : ''}
            <div class="text-center">
                <button class="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(messageEl);
    
    // Add click handler to close button
    const closeButton = messageEl.querySelector('button');
    closeButton.addEventListener('click', () => {
        document.body.removeChild(messageEl);
    });
    
    // Also close when clicking outside the message
    messageEl.addEventListener('click', (e) => {
        if (e.target === messageEl) {
            document.body.removeChild(messageEl);
        }
    });
}

// Add subtle animation to promo banner
function addPromoBannerAnimation() {
  const promoBanner = document.querySelector('#promo-banner');
  if (promoBanner) {
    // Add a subtle pulse animation
    setInterval(() => {
      promoBanner.classList.add('scale-105');
      setTimeout(() => {
        promoBanner.classList.remove('scale-105');
      }, 1000);
    }, 5000);
  }
}

// Review System Instance
const reviewSystem = new ReviewSystem('ever-lodge');

export function getMonthlyOccupancyByRoomType() {
    // Temporarily simulating this month's occupancy data:
    const occupancyData = [
        { roomType: 'Standard', occupancy: 45 },
        { roomType: 'Deluxe', occupancy: 32 },
        { roomType: 'Suite', occupancy: 59 },
        { roomType: 'Family', occupancy: 27 }
    ];
    return occupancyData;
}

// Function to show bookings modal
export function showBookingsModal() {
    const bookingsPopup = document.getElementById('bookingsPopup');
    if (bookingsPopup) {
        bookingsPopup.classList.remove('hidden');
    } else {
        console.error('Bookings popup not found');
    }
}

// Improved initializeBookingsModal function with bookingHistory support
export function initializeBookingsModal() {
    // Create bookings popup if it doesn't exist
    if (!document.getElementById('bookingsPopup')) {
        const bookingsPopup = document.createElement('div');
        bookingsPopup.id = 'bookingsPopup';
        bookingsPopup.className = 'fixed inset-0 bg-black bg-opacity-50 hidden z-[70]';
        
        // Create the bookings modal structure
        bookingsPopup.innerHTML = `
            <div class="fixed right-0 top-0 w-96 h-full bg-white shadow-xl overflow-y-auto">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-2xl font-bold text-gray-900">My Bookings</h3>
                        <button id="closeBookingsPopup" class="text-gray-500 hover:text-gray-700">
                            <i class="ri-close-line text-2xl"></i>
                        </button>
                    </div>
                    
                    <!-- Booking Tabs -->
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

        // Add the modal to the body
        document.body.appendChild(bookingsPopup);
        
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
        
        // Fetch user bookings if user is authenticated
        if (auth.currentUser) {
            fetchUserBookings(auth.currentUser.uid);

            // Load booking history using our external module
            import('../Homepage/bookingHistory.js')
                .then(({ loadBookingHistory }) => {
                    loadBookingHistory(auth.currentUser.uid, db);
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
        }
    }
}

// Update fetchUserBookings function to match the implementation in rooms.js
async function fetchUserBookings(userId) {
    try {
        console.log('Fetching bookings for user:', userId);
        
        // Import the booking service
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

// Add the displayBookings function from rooms.js
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
        // Format dates - properly handle Firestore Timestamp objects
        const checkInDate = booking.checkIn ? 
            (booking.checkIn.toDate ? formatDate(booking.checkIn.toDate()) : formatDate(new Date(booking.checkIn))) : 
            'N/A';
        
        const checkOutDate = booking.checkOut ? 
            (booking.checkOut.toDate ? formatDate(booking.checkOut.toDate()) : formatDate(new Date(booking.checkOut))) : 
            'N/A';
        
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

// Helper function for status styling
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
    // Navigate to the dashboard with bookingId parameter
    window.location.href = `../Dashboard/dashboard.html?bookingId=${bookingId}&collection=${collection}`;
}

// Initialize event listeners for drawer
document.addEventListener('DOMContentLoaded', () => {
    // Initialize bookings modal
    initializeBookingsModal();

    // Set up auth state listener to load bookings when user is authenticated
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('User authenticated, fetching bookings');
            // If the popup exists, fetch bookings
            const bookingsPopup = document.getElementById('bookingsPopup');
            if (bookingsPopup) {
                fetchUserBookings(user.uid);
                
                // Also load booking history if tab exists
                const historyTab = bookingsPopup.querySelector('[data-tab="history"]');
                if (historyTab) {
                    import('../Homepage/bookingHistory.js')
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
                }
            }
        } else {
            console.log('No user logged in, booking data not loaded');
        }
    });
    
    // Add click handler for the showBookingsBtn
    document.addEventListener('click', (e) => {
        if (e.target.closest('#showBookingsBtn')) {
            console.log('Show bookings button clicked');
            showBookingsModal();
            
            // Close the user drawer
            const userDrawer = document.getElementById('userDrawer');
            if (userDrawer) {
                userDrawer.classList.add('translate-x-full');
            }
            
            // Hide overlay
            const drawerOverlay = document.getElementById('drawerOverlay');
            if (drawerOverlay) {
                drawerOverlay.classList.add('hidden');
            }
        }
    });
});
