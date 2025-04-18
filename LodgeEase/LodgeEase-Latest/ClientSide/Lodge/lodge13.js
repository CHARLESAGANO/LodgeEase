import { db, auth, addBooking } from '../../AdminSide/firebase.js';
import { doc, getDoc, collection, addDoc, Timestamp, query, where, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ReviewSystem } from '../components/reviewSystem.js';

// Constants for pricing - updated for Ever Lodge
const STANDARD_RATE = 1300; // ₱1,300 per night standard rate
const NIGHT_PROMO_RATE = 580; // ₱580 per night night promo rate
const SERVICE_FEE_PERCENTAGE = 0.14; // 14% service fee
const WEEKLY_DISCOUNT = 0.10; // 10% weekly discount

// New hourly rates
const TWO_HOUR_RATE = 320; // ₱320 for 2 hours
const THREE_HOUR_RATE = 380; // ₱380 for 3 hours
const FOUR_HOUR_RATE = 440; // ₱440 for 4 hours
const FIVE_HOUR_RATE = 500; // ₱500 for 5 hours
const SIX_HOUR_RATE = 560; // ₱560 for 6 hours
const SEVEN_HOUR_RATE = 620; // ₱620 for 7 hours
const EIGHT_HOUR_RATE = 680; // ₱680 for 8 hours
const NINE_HOUR_RATE = 740; // ₱740 for 9 hours
const TEN_HOUR_RATE = 800; // ₱800 for 10 hours
const ELEVEN_HOUR_RATE = 820; // ₱820 for 11 hours
const TWELVE_HOUR_RATE = 820; // ₱820 for 12 hours (same as 11)
const THIRTEEN_HOUR_RATE = 880; // ₱880 for 13 hours
const FOURTEEN_TO_24_HOUR_RATE = 940; // ₱940 for 14-24 hours

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

// Add a duration selection element for hourly bookings
let hourlyDuration = document.getElementById('hourly-duration');
if (!hourlyDuration && document.getElementById('booking-options')) {
    // Create hourly duration container
    const durationContainer = document.createElement('div');
    durationContainer.id = 'hourly-duration-container';
    durationContainer.className = 'mt-4 hidden'; // Hidden by default
    
    const durationLabel = document.createElement('label');
    durationLabel.htmlFor = 'hourly-duration';
    durationLabel.className = 'block text-sm font-medium text-gray-700 mb-2';
    durationLabel.textContent = 'Duration:';
    
    // Create the select element
    hourlyDuration = document.createElement('select');
    hourlyDuration.id = 'hourly-duration';
    hourlyDuration.className = 'block w-full border border-gray-300 rounded-md p-2 mb-4';
    
    // Add options for durations
    const durationOptions = [
        { value: 2, text: '2 Hours - ₱320' },
        { value: 3, text: '3 Hours - ₱380' },
        { value: 4, text: '4 Hours - ₱440' },
        { value: 5, text: '5 Hours - ₱500' },
        { value: 6, text: '6 Hours - ₱560' },
        { value: 7, text: '7 Hours - ₱620' },
        { value: 8, text: '8 Hours - ₱680' },
        { value: 9, text: '9 Hours - ₱740' },
        { value: 10, text: '10 Hours - ₱800' },
        { value: 11, text: '11 Hours - ₱820' },
        { value: 12, text: '12 Hours - ₱820' },
        { value: 13, text: '13 Hours - ₱880' },
        { value: 24, text: '14-24 Hours - ₱940' }
    ];
    
    durationOptions.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.text;
        hourlyDuration.appendChild(optionEl);
    });
    
    // Set default value
    hourlyDuration.value = 3;
    
    // Add elements to container
    durationContainer.appendChild(durationLabel);
    durationContainer.appendChild(hourlyDuration);
    
    // Add to the DOM after booking options
    const bookingOptions = document.getElementById('booking-options');
    if (bookingOptions) {
        bookingOptions.after(durationContainer);
    }
    
    // Add event listener to update pricing when duration changes
    hourlyDuration.addEventListener('change', updatePriceCalculation);
}

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
  
  if (hourlyToggle) {
    hourlyToggle.addEventListener('change', function() {
      // Update bookingType based on toggle state
      if (this.checked) {
        bookingType = 'hourly';
        hiddenInput.value = 'hourly';
        if (rateTypeDisplay) {
          rateTypeDisplay.textContent = 'Hourly Rate';
          rateTypeDisplay.classList.remove('text-blue-700');
          rateTypeDisplay.classList.add('text-orange-600');
        }
        if (rateInfo) {
          rateInfo.textContent = 'Pay only for the hours you need, starting from ₱320 for 2 hours';
        }
      } else {
        // Reset to standard and let updatePromoEligibility determine if night promo applies
        bookingType = 'standard';
        hiddenInput.value = 'standard';
        
        // Update display based on current dates
        if (selectedCheckIn && selectedCheckOut) {
          updatePromoEligibility();
        } else {
          if (rateTypeDisplay) {
            rateTypeDisplay.textContent = 'Standard (₱1,300/night)';
            rateTypeDisplay.classList.remove('text-orange-600', 'text-green-600');
            rateTypeDisplay.classList.add('text-blue-700');
          }
          if (rateInfo) {
            rateInfo.textContent = 'Night promo rate (₱580) automatically applied for eligible one-night stays';
          }
        }
      }
      
      // Show/hide hourly duration selector based on booking type
      const hourlyDurationContainer = document.getElementById('hourly-duration-container');
      if (hourlyDurationContainer) {
        if (bookingType === 'hourly') {
          hourlyDurationContainer.classList.remove('hidden');
        } else {
          hourlyDurationContainer.classList.add('hidden');
        }
      }
      
      updatePriceCalculation();
    });
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

// Calculate hourly rate based on selected duration
function getHourlyRate(hours) {
  if (hours <= 2) return TWO_HOUR_RATE;
  if (hours <= 3) return THREE_HOUR_RATE;
  if (hours <= 4) return FOUR_HOUR_RATE;
  if (hours <= 5) return FIVE_HOUR_RATE;
  if (hours <= 6) return SIX_HOUR_RATE;
  if (hours <= 7) return SEVEN_HOUR_RATE;
  if (hours <= 8) return EIGHT_HOUR_RATE;
  if (hours <= 9) return NINE_HOUR_RATE;
  if (hours <= 10) return TEN_HOUR_RATE;
  if (hours <= 11) return ELEVEN_HOUR_RATE;
  if (hours <= 12) return TWELVE_HOUR_RATE;
  if (hours <= 13) return THIRTEEN_HOUR_RATE;
  if (hours <= 24) return FOURTEEN_TO_24_HOUR_RATE;
    
  // For stays longer than 24 hours, calculate based on number of days
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
    
  if (remainingHours === 0) {
    return days * FOURTEEN_TO_24_HOUR_RATE;
  } else if (remainingHours <= 13) {
    // Get the appropriate rate for remaining hours
    const remainingRate = getHourlyRate(remainingHours);
    return (days * FOURTEEN_TO_24_HOUR_RATE) + remainingRate;
  } else {
    // If more than 13 remaining hours, count as another day
    return (days + 1) * FOURTEEN_TO_24_HOUR_RATE;
  }
}

// Updated function to calculate pricing based on booking type, rate and nights
function updatePriceCalculation() {
  if (!selectedCheckIn) return;
  
  // For hourly bookings, we don't need a check-out date
  if (bookingType === 'hourly' && !selectedCheckOut) {
    // Get duration from select element
    const duration = parseInt(hourlyDuration?.value || 3);
    
    // Calculate rate based on hourly duration
    const hourlyRate = getHourlyRate(duration);
    
    // Update display text
    nightsSelected.textContent = `${duration} hours selected`;
    nightsCalculation.textContent = `₱${hourlyRate.toLocaleString()} for ${duration} hours`;
    totalNightsPrice.textContent = `₱${hourlyRate.toLocaleString()}`;
    
    // Calculate service fee and total
    const serviceFeeAmount = Math.round(hourlyRate * SERVICE_FEE_PERCENTAGE);
    const totalAmount = hourlyRate + serviceFeeAmount;
    
    // Update UI
    serviceFee.textContent = `₱${serviceFeeAmount.toLocaleString()}`;
    pricingDetails.classList.remove('hidden');
    totalPrice.textContent = `₱${totalAmount.toLocaleString()}`;
    
    // Hide promo discount row for hourly bookings
    if (promoDiscountRow) {
      promoDiscountRow.classList.add('hidden');
    }
    
    return;
  }
  
  // For other booking types, we need both check-in and check-out dates
  if (!selectedCheckOut) return;
  
  const nights = Math.round((selectedCheckOut - selectedCheckIn) / (1000 * 60 * 60 * 24));
  nightsSelected.textContent = `${nights} nights selected`;
  
  // Check if eligible for night promo - valid for any one-night stay
  const isPromoEligible = nights === 1;
  
  // Get the hidden input value
  const hiddenInput = document.getElementById('check-in-time');
  
  // Get rate based on booking type (now automatically set by updatePromoEligibility)
  let nightlyRate;
  
  if (bookingType === 'night-promo' && isPromoEligible) {
    nightlyRate = NIGHT_PROMO_RATE;
  } else {
    nightlyRate = STANDARD_RATE;
    
    // If night-promo is selected but not eligible, reset to standard
    if (bookingType === 'night-promo' && !isPromoEligible) {
      bookingType = 'standard';
      if (hiddenInput) hiddenInput.value = 'standard';
      
      // Also update the display
      const rateTypeDisplay = document.getElementById('rate-type-display');
      if (rateTypeDisplay) {
        rateTypeDisplay.textContent = 'Standard (₱1,300/night)';
        rateTypeDisplay.classList.remove('text-green-600');
        rateTypeDisplay.classList.add('text-blue-700');
      }
    }
  }

  // Update promo banner visibility
  const promoBanner = document.getElementById('promo-banner');
  if (promoBanner) {
    if (isPromoEligible) {
      promoBanner.classList.remove('hidden');
    } else {
      promoBanner.classList.add('hidden');
    }
  }
  
  // Apply weekly discount if applicable
  let subtotal = nightlyRate * nights;
  let discountAmount = 0;
  
  if (nights >= 7) {
    discountAmount = subtotal * WEEKLY_DISCOUNT;
    subtotal -= discountAmount;
  }
  
  const serviceFeeAmount = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
  const totalAmount = subtotal + serviceFeeAmount;
  
  // Update UI
  nightsCalculation.textContent = `₱${nightlyRate.toLocaleString()} x ${nights} nights`;
  totalNightsPrice.textContent = `₱${(nightlyRate * nights).toLocaleString()}`;
  
  // Show/hide discount row based on whether discount applies
  if (promoDiscountRow && promoDiscount) {
    if (nights >= 7 || bookingType === 'night-promo') {
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

async function saveBooking(bookingData) {
    try {
        if (!db) {
            throw new Error('Firestore is not initialized');
        }

        // Validate booking data
        const validationResult = validateBookingData(bookingData);
        if (!validationResult.isValid) {
            throw new Error(`Booking validation failed: ${validationResult.error}`);
        }

        // Add to Firestore
        const bookingsRef = collection(db, 'bookings');
        const docRef = await addDoc(bookingsRef, bookingData);
        
        console.log('Booking saved successfully with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error in saveBooking:', error);
        throw error;
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

export async function handleReserveClick(event) {
    try {
        event.preventDefault();

        // Check if user is logged in
        const user = auth.currentUser;
        
        // Get current booking type
        const hiddenInput = document.getElementById('check-in-time');
        const hourlyToggle = document.getElementById('hourlyToggle') || document.getElementById('hourly-toggle');
        
        // Update bookingType from hidden input or hourly toggle
        if (hourlyToggle && hourlyToggle.checked) {
            bookingType = 'hourly';
        } else if (hiddenInput) {
            bookingType = hiddenInput.value;
        }
        
        // Validate contact number
        const contactNumber = document.getElementById('guest-contact').value.trim();
        if (!contactNumber) {
            alert('Please enter your contact number');
            return;
        }
        if (!/^[0-9]{11}$/.test(contactNumber)) {
            alert('Please enter a valid 11-digit contact number');
            return;
        }

        // Validate guests
        const guests = document.getElementById('guests').value;
        if (!guests || guests < 1 || guests > 4) {
            alert('Please select a valid number of guests');
            return;
        }

        // Validate dates based on booking type
        if (bookingType === 'hourly') {
            // For hourly bookings, we only need check-in date
            if (!selectedCheckIn) {
                alert('Please select a check-in date');
                return;
            }
            
            // Get the duration from the selector
            const duration = parseInt(hourlyDuration?.value || 3);
            if (duration < 2) {
                alert('Please select a valid duration');
                return;
            }
        } else {
            // For standard and night-promo bookings, we need both dates
            if (!selectedCheckIn || !selectedCheckOut) {
                alert('Please select both check-in and check-out dates');
                return;
            }

            const nights = Math.round((selectedCheckOut - selectedCheckIn) / (1000 * 60 * 60 * 24));
            if (nights <= 0) {
                alert('Check-out date must be after check-in date');
                return;
            }
            
            // For night-promo, ensure it's a one-night stay
            if (bookingType === 'night-promo' && nights !== 1) {
                alert('Night promo is only available for one-night stays');
                return;
            }
        }
        
        // Room number is hardcoded in this lodge
        const roomNumber = "205";
        
        // Create check-out date for hourly bookings
        let checkOutDate;
        let duration = 0;
        
        if (bookingType === 'hourly') {
            // Calculate checkout time based on hourly duration
            duration = parseInt(hourlyDuration?.value || 3);
            checkOutDate = new Date(selectedCheckIn);
            checkOutDate.setHours(checkOutDate.getHours() + duration);
        } else {
            checkOutDate = selectedCheckOut;
        }
        
        // Check if the room is available for the selected dates
        // We only perform this check if the user is logged in to avoid unnecessary queries
        if (user) {
            try {
                const availability = await checkRoomAvailability(
                    roomNumber,
                    selectedCheckIn,
                    checkOutDate
                );
                
                if (!availability.available) {
                    // Check if it's a system error or an availability conflict
                    if (availability.isSystemError) {
                        console.error('System error checking availability:', availability.error);
                        alert(`Sorry, we couldn't verify room availability due to a system error. Please try again later or contact customer support.`);
                        return;
                    }
                    
                    // It's an availability conflict - show user-friendly message with details
                    const conflict = availability.conflictWith;
                    if (conflict) {
                        const conflictCheckIn = formatDate(conflict.checkIn);
                        const conflictCheckOut = formatDate(conflict.checkOut);
                        
                        // Create a more visually appealing dialog using messagePopup if available
                        if (typeof showMessagePopup === 'function') {
                            showMessagePopup({
                                title: 'Room Not Available',
                                message: `This room is already booked for the selected dates.`,
                                details: `The room is booked from ${conflictCheckIn} to ${conflictCheckOut}.`,
                                primaryButton: 'Select New Dates',
                                icon: 'warning'
                            });
                        } else {
                            // Fallback to standard alert
                            alert(`This room is not available for the selected dates.\n\nThe room is already booked from ${conflictCheckIn} to ${conflictCheckOut}.\n\nPlease select different dates.`);
                        }
                    } else {
                        // Generic availability message if no specific conflict details
                        alert(`Sorry, this room is not available for the selected dates. Please try different dates.`);
                    }
                    return;
                }
            } catch (availabilityError) {
                console.error('Error checking room availability:', availabilityError);
                alert('We encountered an error while checking room availability. Please try again.');
                return;
            }
        }

        // If not logged in, save details and redirect
        if (!user) {
            const bookingDetails = {
                checkIn: selectedCheckIn,
                checkOut: checkOutDate,
                bookingType: bookingType,
                duration: duration || 0,
                guests: guests,
                contactNumber: contactNumber
            };
            localStorage.setItem('pendingBooking', JSON.stringify(bookingDetails));
            
            const returnUrl = encodeURIComponent(window.location.href);
            window.location.href = `../Login/index.html?redirect=${returnUrl}`;
            return;
        }

        // Get user data for the booking
        const userData = await getCurrentUserData();
        if (!userData) {
            alert('Could not retrieve user information. Please try again.');
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
                roomType: 'Premium Suite',
                roomNumber: "205",
                floorLevel: "2"
            },
            paymentStatus: 'pending',
            status: 'pending',
            isHourlyRate: bookingType === 'hourly'
        };

        // Save booking data to localStorage for payment page
        localStorage.setItem('bookingData', JSON.stringify({
            ...bookingData,
            checkIn: bookingData.checkIn.toDate().toISOString(),
            checkOut: bookingData.checkOut.toDate().toISOString(),
            createdAt: bookingData.createdAt.toDate().toISOString()
        }));

        // Save to Firestore using the addBooking function
        try {
            const bookingId = await addBooking(bookingData);
            console.log('Booking saved to Firestore with ID:', bookingId);
            
            // Store the booking ID in localStorage for the payment page
            localStorage.setItem('currentBookingId', bookingId);
        } catch (firebaseError) {
            console.error('Failed to save booking to Firestore:', firebaseError);
            // Continue to payment page even if Firestore save fails
            // The payment page can retry the save
        }

        // Redirect to payment page
        window.location.href = '../paymentProcess/pay.html';

    } catch (error) {
        console.error('Error in handleReserveClick:', error);
        alert('An error occurred while processing your reservation. Please try again.');
    }
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

// Function to initialize all event listeners
function initializeEventListeners() {
    // Add all event initialization code here
    console.log('Initializing event listeners');
    
    // Example: Initialize reservation button event listener
    const reserveButton = document.getElementById('reserve-button');
    if (reserveButton) {
        reserveButton.addEventListener('click', handleReserveClick);
    }
    
    // Add other event listeners as needed
}

// Update the event listener setup
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('DOM loaded for Ever Lodge');
        
        // Initialize review system
        reviewSystem.initialize();
        
        // Initialize time slot selector (handles hourly toggle)
        initializeTimeSlotSelector();
        
        // Add event listener to hourly toggle
        const hourlyToggle = document.getElementById('hourlyToggle') || document.getElementById('hourly-toggle');
        if (hourlyToggle) {
            // Set initial state of hourly duration container based on toggle
            const hourlyDurationContainer = document.getElementById('hourly-duration-container');
            if (hourlyDurationContainer) {
                hourlyDurationContainer.classList.toggle('hidden', !hourlyToggle.checked);
            }
            
            // Update booking type if toggle is already checked (for page refreshes)
            if (hourlyToggle.checked) {
                bookingType = 'hourly';
                const hiddenInput = document.getElementById('check-in-time');
                if (hiddenInput) hiddenInput.value = 'hourly';
            }
        }
        
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
            
            // Restore check-in time selection if it exists
            if (bookingDetails.bookingType) {
                bookingType = bookingDetails.bookingType;
                
                // Set hourly toggle if applicable
                if (bookingType === 'hourly' && hourlyToggle) {
                    hourlyToggle.checked = true;
                    const hourlyDurationContainer = document.getElementById('hourly-duration-container');
                    if (hourlyDurationContainer) {
                        hourlyDurationContainer.classList.remove('hidden');
                    }
                    
                    // Set duration if available
                    if (bookingDetails.duration && hourlyDuration) {
                        hourlyDuration.value = bookingDetails.duration;
                    }
                }
                
                // Update hidden input
                const hiddenInput = document.getElementById('check-in-time');
                if (hiddenInput) hiddenInput.value = bookingType;
            }
            
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

// Add event listener for page load to check for pending bookings
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  // Initialize all event listeners
  initializeEventListeners();

  // Auth state observer
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = '../Login/index.html';
    }
  });

  // Add auth state observer to handle login button visibility
  auth.onAuthStateChanged((user) => {
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
      if (user) {
        loginButton.classList.add('hidden'); // Hide login button if user is logged in
      } else {
        loginButton.classList.remove('hidden'); // Show login button if user is logged out
      }
    }
  });
});

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
