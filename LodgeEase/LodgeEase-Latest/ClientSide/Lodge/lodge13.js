import { 
  auth, 
  db, 
  addBooking,
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  Timestamp, 
  query, 
  where, 
  orderBy, 
  getDocs 
} from '../firebase.js';
import { ReviewSystem } from '../components/reviewSystem.js';

// Define the rate constants and functions first with default values
let STANDARD_RATE = 1300;
let NIGHT_PROMO_RATE = 580;
let SERVICE_FEE_PERCENTAGE = 0.14;
let WEEKLY_DISCOUNT = 0.10;
let TWO_HOUR_RATE = 320;
let THREE_HOUR_RATE = 380;
let FOUR_HOUR_RATE = 440;
let FIVE_HOUR_RATE = 500;
let SIX_HOUR_RATE = 560;
let SEVEN_HOUR_RATE = 620;
let EIGHT_HOUR_RATE = 680;
let NINE_HOUR_RATE = 740;
let TEN_HOUR_RATE = 800;
let ELEVEN_HOUR_RATE = 820;
let TWELVE_HOUR_RATE = 820;
let THIRTEEN_HOUR_RATE = 880;
let FOURTEEN_TO_24_HOUR_RATE = 940;
let TV_REMOTE_FEE = 100;

// Fallback functions
function calculateNights(checkIn, checkOut) {
  if (!checkOut) return 0;
  
  const checkInDate = checkIn instanceof Date ? checkIn : new Date(checkIn);
  const checkOutDate = checkOut instanceof Date ? checkOut : new Date(checkOut);
  
  if (checkInDate.getFullYear() === checkOutDate.getFullYear() && 
      checkInDate.getMonth() === checkOutDate.getMonth() && 
      checkInDate.getDate() === checkOutDate.getDate()) {
    return 0;
  }
  
  const diffTime = Math.abs(checkOutDate - checkInDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateHours(checkIn, checkOut) {
  if (!checkOut) return 0;
  
  const checkInDate = checkIn instanceof Date ? checkIn : new Date(checkIn);
  const checkOutDate = checkOut instanceof Date ? checkOut : new Date(checkOut);
  const diffTime = Math.abs(checkOutDate - checkInDate);
  return Math.ceil(diffTime / (1000 * 60 * 60));
}

function isNightPromoEligible(nights) {
  return nights === 1;
}

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
  return FOURTEEN_TO_24_HOUR_RATE;
}

function calculateBookingCosts(nights, checkInTimeSlot = 'standard', hasCheckOut = true, hasTvRemote = false, hours = 0) {
  let subtotal = 0;
  let nightlyRate = 0;
  let discountAmount = 0;
  
  if (!hasCheckOut) {
    nightlyRate = THREE_HOUR_RATE;
    subtotal = nightlyRate;
  } else if (nights === 0 && hours > 0) {
    nightlyRate = getHourlyRate(hours);
    subtotal = nightlyRate;
  } else if (checkInTimeSlot === 'night-promo') {
    nightlyRate = NIGHT_PROMO_RATE;
    subtotal = nightlyRate * (nights || 1);
  } else if (nights > 0) {
    nightlyRate = STANDARD_RATE;
    subtotal = nightlyRate * nights;
    
    if (nights >= 7) {
      discountAmount = subtotal * WEEKLY_DISCOUNT;
      subtotal -= discountAmount;
    }
  }
  
  // Add TV remote fee if applicable
  if (hasTvRemote) {
    subtotal += TV_REMOTE_FEE;
  }
  
  const serviceFeeAmount = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
  const totalAmount = subtotal + serviceFeeAmount;
  
  return {
    nightlyRate,
    subtotal,
    discountAmount,
    serviceFeeAmount,
    totalAmount
  };
}

// Try to load the real module - wrapped in an IIFE to allow use of async/await
(async function loadRateCalculation() {
  try {
    // Try to import from the ClientSide/AdminSide path
    const rateModule = await import('../AdminSide/js/rateCalculation.js').catch(e => null);
    
    if (rateModule) {
      // Assign all imported values if successful
      STANDARD_RATE = rateModule.STANDARD_RATE;
      NIGHT_PROMO_RATE = rateModule.NIGHT_PROMO_RATE;
      SERVICE_FEE_PERCENTAGE = rateModule.SERVICE_FEE_PERCENTAGE;
      WEEKLY_DISCOUNT = rateModule.WEEKLY_DISCOUNT;
      TWO_HOUR_RATE = rateModule.TWO_HOUR_RATE;
      THREE_HOUR_RATE = rateModule.THREE_HOUR_RATE;
      FOUR_HOUR_RATE = rateModule.FOUR_HOUR_RATE;
      FIVE_HOUR_RATE = rateModule.FIVE_HOUR_RATE;
      SIX_HOUR_RATE = rateModule.SIX_HOUR_RATE;
      SEVEN_HOUR_RATE = rateModule.SEVEN_HOUR_RATE;
      EIGHT_HOUR_RATE = rateModule.EIGHT_HOUR_RATE;
      NINE_HOUR_RATE = rateModule.NINE_HOUR_RATE;
      TEN_HOUR_RATE = rateModule.TEN_HOUR_RATE;
      ELEVEN_HOUR_RATE = rateModule.ELEVEN_HOUR_RATE;
      TWELVE_HOUR_RATE = rateModule.TWELVE_HOUR_RATE;
      THIRTEEN_HOUR_RATE = rateModule.THIRTEEN_HOUR_RATE;
      FOURTEEN_TO_24_HOUR_RATE = rateModule.FOURTEEN_TO_24_HOUR_RATE;
      TV_REMOTE_FEE = rateModule.TV_REMOTE_FEE;
      
      // Replace functions with the ones from the module
      calculateNights = rateModule.calculateNights;
      calculateHours = rateModule.calculateHours;
      isNightPromoEligible = rateModule.isNightPromoEligible;
      getHourlyRate = rateModule.getHourlyRate;
      calculateBookingCosts = rateModule.calculateBookingCosts;
      
      console.log('Successfully imported rateCalculation.js from ClientSide/AdminSide/js');
      return; // Exit the function if successful
    }
    
    // If the first import fails, try the second path
    const rateModule2 = await import('../../AdminSide/js/rateCalculation.js').catch(e => null);
    
    if (rateModule2) {
      // Assign all imported values if successful
      STANDARD_RATE = rateModule2.STANDARD_RATE;
      NIGHT_PROMO_RATE = rateModule2.NIGHT_PROMO_RATE;
      SERVICE_FEE_PERCENTAGE = rateModule2.SERVICE_FEE_PERCENTAGE;
      WEEKLY_DISCOUNT = rateModule2.WEEKLY_DISCOUNT;
      TWO_HOUR_RATE = rateModule2.TWO_HOUR_RATE;
      THREE_HOUR_RATE = rateModule2.THREE_HOUR_RATE;
      FOUR_HOUR_RATE = rateModule2.FOUR_HOUR_RATE;
      FIVE_HOUR_RATE = rateModule2.FIVE_HOUR_RATE;
      SIX_HOUR_RATE = rateModule2.SIX_HOUR_RATE;
      SEVEN_HOUR_RATE = rateModule2.SEVEN_HOUR_RATE;
      EIGHT_HOUR_RATE = rateModule2.EIGHT_HOUR_RATE;
      NINE_HOUR_RATE = rateModule2.NINE_HOUR_RATE;
      TEN_HOUR_RATE = rateModule2.TEN_HOUR_RATE;
      ELEVEN_HOUR_RATE = rateModule2.ELEVEN_HOUR_RATE;
      TWELVE_HOUR_RATE = rateModule2.TWELVE_HOUR_RATE;
      THIRTEEN_HOUR_RATE = rateModule2.THIRTEEN_HOUR_RATE;
      FOURTEEN_TO_24_HOUR_RATE = rateModule2.FOURTEEN_TO_24_HOUR_RATE;
      TV_REMOTE_FEE = rateModule2.TV_REMOTE_FEE;
      
      // Replace functions with the ones from the module
      calculateNights = rateModule2.calculateNights;
      calculateHours = rateModule2.calculateHours;
      isNightPromoEligible = rateModule2.isNightPromoEligible;
      getHourlyRate = rateModule2.getHourlyRate;
      calculateBookingCosts = rateModule2.calculateBookingCosts;
      
      console.log('Successfully imported rateCalculation.js from root AdminSide/js');
      return; // Exit the function if successful
    }
    
    // If both imports fail, we'll use the fallback values already defined
    console.log('Using fallback rate calculation functions - both imports failed');
    
  } catch (error) {
    console.error('Error loading rate calculation module:', error);
    console.log('Using fallback rate calculation functions due to error');
  }
})();

// Initialization validation - keeps essential checks while removing excessive logging
(function() {
  // Verify Firebase is properly loaded - critical for functionality
  if (!auth || !db) {
    console.error('Firebase initialization issue - auth or db not available. Will retry after timeout.');
    // Try to re-initialize after a short delay
    setTimeout(() => {
      if (!auth || !db) {
        console.error('Firebase still unavailable after timeout. Reserve functionality may be impaired.');
      } else {
        console.log('Firebase initialization successful after retry.');
      }
    }, 1000);
  }
  
  // Listen for DOM readiness to verify components are available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('reserve-btn')) {
        console.error('Reserve button not found in DOM');
      }
    });
  } else if (!document.getElementById('reserve-btn')) {
    console.error('Reserve button not found in DOM');
  }
})();

// Global synchronization function for jQuery datepicker integration
// IMPORTANT: Define this function early to ensure it's available when datepicker initializes
window.syncDateVariables = function(checkInDate, checkOutDate) {
  console.log('Module syncDateVariables called with:', { 
    checkIn: checkInDate ? new Date(checkInDate).toISOString() : null,
    checkOut: checkOutDate ? new Date(checkOutDate).toISOString() : null 
  });
  
  // Update the module-level variables with values from jQuery datepicker
  if (checkInDate) {
    selectedCheckIn = new Date(checkInDate);
  }
  if (checkOutDate) {
    selectedCheckOut = new Date(checkOutDate);
  }
  
  try {
    if (typeof updatePriceCalculation === 'function') {
      updatePriceCalculation();
      console.log('Price calculation updated during sync');
    } else {
      console.warn("updatePriceCalculation not available during sync");
    }
  } catch (err) {
    console.warn("Error in updatePriceCalculation during sync:", err);
  }
  
  // Process any pending sync from the placeholder
  if (window._pendingSync) {
    console.log('Found pending sync data, clearing');
    window._pendingSync = null;
  }
};

// Helper function for hourly rate calculation - early definition to avoid reference errors
function getHourlyRateValue(hours) {
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
  
  // For stays longer than 24 hours
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  if (remainingHours === 0) {
    return days * FOURTEEN_TO_24_HOUR_RATE;
  } else if (remainingHours <= 13) {
    const remainingRate = getHourlyRateValue(remainingHours);
    return (days * FOURTEEN_TO_24_HOUR_RATE) + remainingRate;
  } else {
    return (days + 1) * FOURTEEN_TO_24_HOUR_RATE;
  }
}

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
// IMPORTANT: These variables are used by multiple functions
// and need to be initialized at module level
let selectedCheckIn = null;
let selectedCheckOut = null;

// Initialize timeslot selection to determine rate
function initializeTimeSlotSelector() {
  // Get references to new UI elements
  const hourlyToggle = document.getElementById('hourly-toggle');
  const hourlyOptions = document.getElementById('hourly-options');
  const hourlyDuration = document.getElementById('hourly-duration');
  const rateTypeDisplay = document.getElementById('rate-type-display');
  const rateInfo = document.getElementById('rate-info');
  const hiddenInput = document.getElementById('rate-type-value'); // hidden input that stores the value
  const checkInTimeSelect = document.getElementById('check-in-time');
  
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
    rateInfo.textContent = 'Night promo rate (₱580) applied for one-night stays with check-in at 10PM and check-out between 3AM-8AM.';
  }
  
  // Set default times if not set
  if (checkInTimeSelect && !checkInTimeSelect.value) {
    checkInTimeSelect.value = '14:00'; // Default check-in at 2:00 PM
  }
  
  const checkOutTimeSelect = document.getElementById('check-out-time');
  if (checkOutTimeSelect && !checkOutTimeSelect.value) {
    checkOutTimeSelect.value = '12:00'; // Default check-out at 12:00 PM
  }
  
  // Handle hourly toggle
  if (hourlyToggle) {
    hourlyToggle.addEventListener('change', function() {
      if (this.checked) {
        // Switch to hourly rate
        bookingType = 'hourly';
        if (hiddenInput) hiddenInput.value = 'hourly';
        
        // Show hourly options
        if (hourlyOptions) hourlyOptions.classList.remove('hidden');
        
        // Update the display
        if (rateTypeDisplay) {
          const hours = hourlyDuration ? parseInt(hourlyDuration.value) : 2;
          const rate = getHourlyRate(hours);
          rateTypeDisplay.textContent = `Hourly (₱${rate})`;
          rateTypeDisplay.classList.remove('text-blue-700', 'text-green-600');
          rateTypeDisplay.classList.add('text-orange-600');
        }
        
        if (rateInfo) {
          rateInfo.textContent = 'Base rate: ₱320 for 2 hours, with hourly rates based on duration';
        }
        
        // Update pricing with the new rate type
        updatePriceCalculation();
      } else {
        // Switch back to standard rate
        bookingType = 'standard';
        if (hiddenInput) hiddenInput.value = 'standard';
        
        // Hide hourly options
        if (hourlyOptions) hourlyOptions.classList.add('hidden');
        
        // Update the display
        if (rateTypeDisplay) {
          rateTypeDisplay.textContent = 'Standard (₱1,300/night)';
          rateTypeDisplay.classList.remove('text-orange-600', 'text-green-600');
          rateTypeDisplay.classList.add('text-blue-700');
        }
        
        if (rateInfo) {
          rateInfo.textContent = 'Night promo rate (₱580) applied for one-night stays with check-in at 10PM and check-out between 3AM-8AM.';
        }
        
        // Re-check night promo eligibility
        updatePromoEligibility();
      }
    });
  }
  
  // Handle hourly duration change
  if (hourlyDuration) {
    hourlyDuration.addEventListener('change', function() {
      if (bookingType === 'hourly') {
        const hours = parseInt(this.value);
        const rate = getHourlyRate(hours);
        
        // Update the display
        if (rateTypeDisplay) {
          rateTypeDisplay.textContent = `Hourly (₱${rate})`;
        }
        
        // Update pricing with the new duration
        updatePriceCalculation();
      }
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

// Update the function to calculate pricing based only on check-in and check-out dates
function updatePriceCalculation() {
  if (!selectedCheckIn) return;
  
  // Get hourly duration if in hourly mode
  const hourlyToggle = document.getElementById('hourly-toggle');
  const hourlyDuration = document.getElementById('hourly-duration');
  const isHourlyMode = hourlyToggle && hourlyToggle.checked;
  
  // If no check-out date is selected in standard mode, use the base rate (380 pesos)
  if (!selectedCheckOut && !isHourlyMode) {
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
  
  if (isHourlyMode) {
    // Calculate hourly rate
    const hours = hourlyDuration ? parseInt(hourlyDuration.value) : 2;
    const hourlyRate = getHourlyRate(hours);
    
    // Calculate service fee
    const serviceFeeAmount = Math.round(hourlyRate * SERVICE_FEE_PERCENTAGE);
    const totalAmount = hourlyRate + serviceFeeAmount;
    
    // Update UI
    nightsSelected.textContent = `${hours} hours selected`;
    nightsCalculation.textContent = `₱${hourlyRate.toLocaleString()} for ${hours} hours`;
    totalNightsPrice.textContent = `₱${hourlyRate.toLocaleString()}`;
    
    // Hide discount row for hourly rates
    if (promoDiscountRow) {
      promoDiscountRow.classList.add('hidden');
    }
    
    // Update service fee and total
    serviceFee.textContent = `₱${serviceFeeAmount.toLocaleString()}`;
    pricingDetails.classList.remove('hidden');
    totalPrice.textContent = `₱${totalAmount.toLocaleString()}`;
    
    return;
  }
  
  // Special handling for same-day bookings - treat as hourly if on the same calendar date
  const isSameDay = selectedCheckIn.getFullYear() === selectedCheckOut.getFullYear() && 
                   selectedCheckIn.getMonth() === selectedCheckOut.getMonth() && 
                   selectedCheckIn.getDate() === selectedCheckOut.getDate();
                   
  if (isSameDay) {
    // Get check-in and check-out times
    const checkInTimeSelect = document.getElementById('check-in-time');
    const checkOutTimeSelect = document.getElementById('check-out-time');
    const checkInTimeValue = checkInTimeSelect ? checkInTimeSelect.value : '14:00';
    const checkOutTimeValue = checkOutTimeSelect ? checkOutTimeSelect.value : '12:00';
    
    // Parse the hours to calculate the duration
    let checkInHours = 14, checkOutHours = 12;
    
    try {
      if (checkInTimeValue) {
        const [hours] = checkInTimeValue.split(':').map(Number);
        checkInHours = hours;
      }
      
      if (checkOutTimeValue) {
        const [hours] = checkOutTimeValue.split(':').map(Number);
        checkOutHours = hours;
      }
    } catch (err) {
      console.warn('Error parsing time values:', err);
    }
    
    // Calculate duration (handle overnight case)
    let duration = checkOutHours >= checkInHours ? 
        checkOutHours - checkInHours : 
        (24 - checkInHours) + checkOutHours;
    
    // Minimum stay of 2 hours
    duration = Math.max(2, duration);
    
    // Calculate hourly rate and fees
    const hourlyRate = getHourlyRateValue(duration);
    const serviceFeeAmount = Math.round(hourlyRate * SERVICE_FEE_PERCENTAGE);
    const totalAmount = hourlyRate + serviceFeeAmount;
    
    // Update UI
    nightsSelected.textContent = `${duration} hours selected`;
    nightsCalculation.textContent = `₱${hourlyRate.toLocaleString()} for ${duration} hours`;
    totalNightsPrice.textContent = `₱${hourlyRate.toLocaleString()}`;
    
    // Hide discount row for hourly rates
    if (promoDiscountRow) {
      promoDiscountRow.classList.add('hidden');
    }
    
    // Update service fee and total
    serviceFee.textContent = `₱${serviceFeeAmount.toLocaleString()}`;
    pricingDetails.classList.remove('hidden');
    totalPrice.textContent = `₱${totalAmount.toLocaleString()}`;
    
    return;
  }
  
  // When both check-in and check-out dates are available on different days, calculate nights
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

// Make updatePriceCalculation available as a global function for jQuery code
window.updatePriceCalculation = updatePriceCalculation;

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
  const nightPromoPopup = document.getElementById('night-promo-popup');
  const rateTypeDisplay = document.getElementById('rate-type-display');
  const rateInfo = document.getElementById('rate-info');
  const hiddenInput = document.getElementById('rate-type-value');
  const checkInTimeSelect = document.getElementById('check-in-time');
  const checkOutTimeSelect = document.getElementById('check-out-time');
  const hourlyToggle = document.getElementById('hourly-toggle');
  
  // If hourly is toggled on, don't change anything
  if (hourlyToggle && hourlyToggle.checked) {
    return;
  }
  
  if (promoBanner) {
    // By default, hide the promo banner until valid dates are selected
    promoBanner.classList.add('hidden');
  }
  
  if (nightPromoPopup) {
    // By default, hide the night promo popup
    nightPromoPopup.classList.add('hidden');
  }
  
  if (selectedCheckIn && selectedCheckOut) {
    const nights = Math.round((selectedCheckOut - selectedCheckIn) / (1000 * 60 * 60 * 24));
    
    // Get the check-in time value if it's selected
    const checkInTime = checkInTimeSelect ? checkInTimeSelect.value : '';
    const checkOutTime = checkOutTimeSelect ? checkOutTimeSelect.value : '';
    
    // Night promo only applies for check-in at 10PM (22:00) and check-out between 3AM and 8AM (03:00-08:00)
    const isNightCheckIn = checkInTime === '22:00';
    const validCheckOutTimes = ['03:00', '04:00', '05:00', '06:00', '07:00', '08:00'];
    const isEarlyCheckOut = validCheckOutTimes.includes(checkOutTime);
    
    // Updated to check for one-night stay AND specific check-in/check-out times
    const isPromoEligible = nights === 1 && isNightCheckIn && isEarlyCheckOut;
    
    if (isPromoEligible) {
      if (promoBanner) {
        promoBanner.classList.remove('hidden');
      }
      
      if (nightPromoPopup) {
        nightPromoPopup.classList.remove('hidden');
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
        rateInfo.textContent = 'Night promo rate applied! Check-in at 10:00 PM with check-out between 3:00 AM and 8:00 AM';
      }
    } else if (nights === 1 && (checkInTime || checkOutTime)) {
      // One night stay but not eligible for night promo due to time
      if (nightPromoPopup) {
        nightPromoPopup.classList.add('hidden');
      }
      
      // Switch to standard rate
      bookingType = 'standard';
      if (hiddenInput) hiddenInput.value = 'standard';
      
      // Update the display
      if (rateTypeDisplay) {
        rateTypeDisplay.textContent = 'Standard (₱1,300/night)';
        rateTypeDisplay.classList.remove('text-green-600', 'text-orange-600');
        rateTypeDisplay.classList.add('text-blue-700');
      }
      
      if (rateInfo) {
        rateInfo.textContent = 'Check-in at 10:00 PM with check-out between 3:00 AM - 8:00 AM for night promo rate';
      }
    } else {
      // Multiple nights or not set up yet
      if (nightPromoPopup) {
        nightPromoPopup.classList.add('hidden');
      }
      
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
        rateInfo.textContent = nights > 1 ? 
          'Night promo rate only available for one-night stays' : 
          'Select check-in and check-out dates';
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

// Fix the checkForExistingBooking function to avoid index issues
async function checkForExistingBooking(userId, checkIn, checkOut, roomNumber) {
    try {
        // Check if a booking with the same dates and room already exists
        const bookingsRef = collection(db, 'everlodgebookings');
        
        // Modified query to avoid index issues by not using multiple inequality operators
        // First, get all bookings for this room number with relevant statuses
        let q = query(
            bookingsRef,
            where('propertyDetails.roomNumber', '==', roomNumber),
            where('status', 'in', ['Confirmed', 'Checked In', 'pending'])
        );
        
        let querySnapshot = await getDocs(q);
        
        // Then manually filter the results in JavaScript
        for (const doc of querySnapshot.docs) {
            const booking = doc.data();
            
            // Get booking check-in and check-out dates
            const bookingCheckIn = booking.checkIn instanceof Timestamp ? 
                booking.checkIn.toDate() : new Date(booking.checkIn);
                
            const bookingCheckOut = booking.checkOut instanceof Timestamp ? 
                booking.checkOut.toDate() : new Date(booking.checkOut);
            
            // Check if dates overlap
            if ((checkIn < bookingCheckOut && checkOut > bookingCheckIn)) {
                // If user ID matches or contact number matches
                if (booking.userId === userId) {
                    console.log('Found existing booking with same user ID');
                    return true;
                }
                
                // Also check for bookings with same contact number
                const contactNumber = document.getElementById('guest-contact').value;
                if (contactNumber && booking.contactNumber === contactNumber) {
                    console.log('Found existing booking with same contact number');
                    return true;
                }
            }
        }
        
        return false; // No duplicate found
    } catch (error) {
        console.error('Error checking for existing booking:', error);
        // Don't throw the error - just return false to allow the booking to proceed
        return false;
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
    
    // Event listener for time inputs to check for night promo eligibility
    const checkInTimeSelect = document.getElementById('check-in-time');
    const checkOutTimeSelect = document.getElementById('check-out-time');
    
    if (checkInTimeSelect) {
        checkInTimeSelect.addEventListener('change', updatePromoEligibility);
    }
    
    if (checkOutTimeSelect) {
        checkOutTimeSelect.addEventListener('change', updatePromoEligibility);
    }
}

// Add event listener for DOM ready to set up reserve button functionality
document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log('DOM loaded for Ever Lodge');
    
    // Initialize reserve button click handler
    const reserveBtn = document.getElementById('reserve-btn');
    if (reserveBtn) {
      reserveBtn.addEventListener('click', handleReserveClick);
      console.log('Reserve button click handler initialized');
    } else {
      console.error('Reserve button not found in DOM');
    }
    
    // Check for any pending sync operations from jQuery
    if (window._pendingSync) {
      console.log('Found pending sync from jQuery, processing');
      const { checkInDate, checkOutDate } = window._pendingSync;
      if (checkInDate) selectedCheckIn = new Date(checkInDate);
      if (checkOutDate) selectedCheckOut = new Date(checkOutDate);
      updatePriceCalculation();
      window._pendingSync = null;
    }
    
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
    
    // Initialize time input event listeners
    initializeEventListeners();
    
    // Check if there's a pending booking after login
    const pendingBooking = localStorage.getItem('pendingBooking');
    if (pendingBooking && auth.currentUser) {
        const bookingDetails = JSON.parse(pendingBooking);
        
        // Restore the booking details
        selectedCheckIn = new Date(bookingDetails.checkIn);
        selectedCheckOut = new Date(bookingDetails.checkOut);
        document.querySelector('select#guests').value = bookingDetails.guests;
        document.getElementById('guest-contact').value = bookingDetails.contactNumber;
        
        // Set check-in time if available
        if (bookingDetails.checkInTime) {
            const checkInTimeSelect = document.getElementById('check-in-time');
            if (checkInTimeSelect) {
                checkInTimeSelect.value = bookingDetails.checkInTime;
            }
        }
        
        // Set check-out time if available
        if (bookingDetails.checkOutTime) {
            const checkOutTimeSelect = document.getElementById('check-out-time');
            if (checkOutTimeSelect) {
                checkOutTimeSelect.value = bookingDetails.checkOutTime;
            }
        }
        
        // Set hourly mode if applicable
        if (bookingDetails.isHourly) {
            const hourlyToggle = document.getElementById('hourly-toggle');
            const hourlyOptions = document.getElementById('hourly-options');
            const hourlyDuration = document.getElementById('hourly-duration');
            
            if (hourlyToggle) {
                hourlyToggle.checked = true;
            }
            
            if (hourlyOptions) {
                hourlyOptions.classList.remove('hidden');
            }
            
            if (hourlyDuration && bookingDetails.hourlyDuration) {
                hourlyDuration.value = bookingDetails.hourlyDuration;
            }
            
            // Set default booking type to hourly
            bookingType = 'hourly';
            const hiddenInput = document.getElementById('rate-type-value');
            if (hiddenInput) hiddenInput.value = 'hourly';
            
            // Update rate display
            const rateTypeDisplay = document.getElementById('rate-type-display');
            if (rateTypeDisplay) {
                const hours = bookingDetails.hourlyDuration || 2;
                const rate = getHourlyRate(hours);
                rateTypeDisplay.textContent = `Hourly (₱${rate})`;
                rateTypeDisplay.classList.remove('text-blue-700', 'text-green-600');
                rateTypeDisplay.classList.add('text-orange-600');
            }
            
            const rateInfo = document.getElementById('rate-info');
            if (rateInfo) {
                rateInfo.textContent = 'Base rate: ₱320 for 2 hours, with hourly rates based on duration';
            }
        } else {
            // Set default booking type to standard
            bookingType = 'standard';
            const hiddenInput = document.getElementById('rate-type-value');
            if (hiddenInput) hiddenInput.value = 'standard';
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
    
    // Add animation for night promo popup
    const nightPromoPopup = document.getElementById('night-promo-popup');
    if (nightPromoPopup) {
        setInterval(() => {
            nightPromoPopup.classList.toggle('animate-pulse');
        }, 3000);
    }
    
    // Set up modal close handlers for reservation modals
    setupReservationModalHandlers();
    
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});

// Set up event handlers for reservation modals
function setupReservationModalHandlers() {
  // Set up close handlers for error modal
  const errorModal = document.getElementById('reservation-error-modal');
  if (errorModal) {
    // Close on clicking the overlay
    errorModal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.add('hidden');
      }
    });
    
    // Close on clicking close button
    const closeButtons = errorModal.querySelectorAll('.close-modal');
    closeButtons.forEach(button => {
      button.addEventListener('click', function() {
        errorModal.classList.add('hidden');
      });
    });
  }
  
  // Set up proceed button for success modal
  const successModal = document.getElementById('reservation-success-modal');
  const proceedButton = document.getElementById('proceed-to-payment');
  if (successModal && proceedButton) {
    proceedButton.addEventListener('click', function() {
      window.location.href = '../paymentProcess/pay.html';
    });
  }
}

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

// Function to ensure date variables are properly initialized
function ensureDateVariables() {
  // If selectedCheckIn input has value but variable doesn't, initialize it
  try {
    const checkInInputEl = document.getElementById('check-in-date');
    const checkOutInputEl = document.getElementById('check-out-date');
    
    if (checkInInputEl && checkInInputEl.value && !selectedCheckIn) {
      selectedCheckIn = new Date(checkInInputEl.value);
      console.log('Initialized selectedCheckIn from input value:', selectedCheckIn);
    }
    
    if (checkOutInputEl && checkOutInputEl.value && !selectedCheckOut) {
      selectedCheckOut = new Date(checkOutInputEl.value);
      console.log('Initialized selectedCheckOut from input value:', selectedCheckOut);
    }
  } catch (e) {
    console.error('Error ensuring date variables:', e);
  }
}

// Global synchronization function for jQuery datepicker integration
window.syncDateVariables = function(checkInDate, checkOutDate) {
  // Update the module-level variables with values from jQuery datepicker
  if (checkInDate) {
    selectedCheckIn = new Date(checkInDate);
  }
  if (checkOutDate) {
    selectedCheckOut = new Date(checkOutDate);
  }
  updatePriceCalculation();
};

export async function handleReserveClick(event) {
    try {
        event.preventDefault();

        // Reset any previous error states
        const contactError = document.getElementById('contact-error');
        if (contactError) contactError.classList.add('hidden');
        
        // Ensure date variables are properly initialized
        ensureDateVariables();

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
                showErrorMessage('Your booking is already being processed. Please wait...');
                resetReserveButton();
                return;
            } else {
                // Clear stale booking progress flags (older than 30 seconds)
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
            }
        }
        
        // Validate all required fields before proceeding
        // 1. Check if dates are selected
        if (!selectedCheckIn) {
            showErrorMessage('Please select a check-in date');
            resetReserveButton();
            return;
        }

        // 2. Validate contact number
        const contactNumber = document.getElementById('guest-contact').value.trim();
        if (!contactNumber) {
            showErrorMessage('Please enter your contact number');
            if (contactError) contactError.classList.remove('hidden');
            resetReserveButton();
            return;
        }
        if (!/^[0-9]{11}$/.test(contactNumber)) {
            showErrorMessage('Please enter a valid 11-digit contact number');
            if (contactError) contactError.classList.remove('hidden');
            resetReserveButton();
            return;
        }

        // 3. Validate guests
        const guests = document.getElementById('guests').value;
        if (!guests || guests < 1 || guests > 4) {
            showErrorMessage('Please select a valid number of guests (1-4)');
            resetReserveButton();
            return;
        }

        // 4. Validate check-in time
        const checkInTimeSelect = document.getElementById('check-in-time');
        const checkInTime = checkInTimeSelect?.value || '';
        if (!checkInTime) {
            showErrorMessage('Please select a check-in time');
            resetReserveButton();
            return;
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
            showErrorMessage('A booking is already in progress. Please wait...');
            resetReserveButton();
            return;
        }
        
        // Set flag to indicate booking is in progress
        isBookingInProgress = true;

        // Check if user is logged in
        const user = auth.currentUser;
        
        // Check if in hourly mode
        const hourlyToggle = document.getElementById('hourly-toggle');
        const hourlyDuration = document.getElementById('hourly-duration');
        const isHourlyMode = hourlyToggle && hourlyToggle.checked;
        
        // Get check-out time from dropdown
        const checkOutTimeSelect = document.getElementById('check-out-time');
        const checkOutTime = checkOutTimeSelect?.value || '';
        
        // Get current booking type
        const rateTypeInput = document.getElementById('rate-type-value');
        bookingType = rateTypeInput?.value || 'standard';
        
        // For hourly rate, override booking type
        if (isHourlyMode) {
            bookingType = 'hourly';
        }
        
        // Create full check-in date with time
        const fullCheckInDate = new Date(selectedCheckIn);
        if (checkInTime) {
            const [hours, minutes] = checkInTime.split(':').map(Number);
            fullCheckInDate.setHours(hours, minutes, 0, 0);
        }
        
        // For hourly bookings, set check-out time based on duration
        let fullCheckOutDate = null;
        const checkOutDate = selectedCheckOut;
        
        if (isHourlyMode) {
            // For hourly bookings, calculate check-out time based on duration
            const duration = hourlyDuration ? parseInt(hourlyDuration.value) : 2;
            fullCheckOutDate = new Date(fullCheckInDate);
            fullCheckOutDate.setHours(fullCheckOutDate.getHours() + duration);
        } else if (selectedCheckOut) {
            // For standard bookings with check-out date
            if (!checkOutTime) {
                showErrorMessage('Please select a check-out time');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }
            
            // Create full check-out date with time
            fullCheckOutDate = new Date(selectedCheckOut);
            if (checkOutTime) {
                const [hours, minutes] = checkOutTime.split(':').map(Number);
                fullCheckOutDate.setHours(hours, minutes, 0, 0);
            }
            
            // FIX: Use the full datetime objects for comparison instead of just dates
            if (fullCheckOutDate <= fullCheckInDate) {
                showErrorMessage('Check-out time must be after check-in time');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }
            
            // Keep the existing night calculation for pricing purposes
            const nights = Math.round((selectedCheckOut - selectedCheckIn) / (1000 * 60 * 60 * 24));
            
            // Check for night promo eligibility
            if (nights === 1) {
                // Check if check-in time is 10PM and check-out time is between 3AM and 8AM
                const isNightCheckIn = checkInTime === '22:00';
                const validCheckOutTimes = ['03:00', '04:00', '05:00', '06:00', '07:00', '08:00'];
                const isEarlyCheckOut = validCheckOutTimes.includes(checkOutTime);
                
                // Only apply night promo if both conditions are met
                if (isNightCheckIn && isEarlyCheckOut) {
                    bookingType = 'night-promo';
                }
            }
        } else {
            // If it's a standard booking without check-out date, use same day check-out
            fullCheckOutDate = new Date(fullCheckInDate);
            // Show error for missing checkout date
            showErrorMessage('Please select a check-out date');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
            return;
        }

        // If not logged in, save details and redirect
        if (!user) {
            const bookingDetails = {
                checkIn: selectedCheckIn,
                checkOut: checkOutDate,
                checkInTime: checkInTime,
                checkOutTime: checkOutTime,
                bookingType: bookingType,
                isHourly: isHourlyMode,
                hourlyDuration: isHourlyMode ? (hourlyDuration ? parseInt(hourlyDuration.value) : 2) : 0,
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
            const roomResult = await findAvailableRoom(fullCheckInDate, fullCheckOutDate || fullCheckInDate);
            
            // Remove loading message
            document.body.removeChild(loadingMessage);
            
            if (!roomResult.available) {
                // Handle case where no rooms are available
                if (roomResult.isSystemError) {
                    console.error('System error finding available room:', roomResult.error);
                    showErrorMessage('We encountered a system error while checking room availability. Please try again later.');
                } else if (roomResult.conflictDetails) {
                    // Show specific booking conflict information
                    const conflictInfo = roomResult.conflictDetails;
                    showErrorMessage(
                        `The room you're trying to book is already reserved for the selected dates. Another booking exists from ${formatDate(conflictInfo.checkIn)} to ${formatDate(conflictInfo.checkOut)}.`
                    );
                } else {
                    showErrorMessage(
                        'All rooms at Ever Lodge are currently booked for these dates. Please try selecting different dates or contact us for assistance.'
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
                showErrorMessage('Could not retrieve user information. Please try again.');
                isBookingInProgress = false;
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                resetReserveButton();
                return;
            }

            // Calculate costs based on booking type
            let nightlyRate, subtotal, discountAmount = 0, serviceFeeAmount, totalAmount;
            let nights = 0;
            let duration = 0;
            
            if (bookingType === 'hourly') {
                // For hourly bookings
                duration = hourlyDuration ? parseInt(hourlyDuration.value) : 2;
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
            const existingBooking = await checkForExistingBooking(user.uid, fullCheckInDate, fullCheckOutDate || fullCheckInDate, roomNumber);
            if (existingBooking) {
                showErrorMessage('You already have a booking for the selected dates and room. Please check your bookings.');
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
                checkIn: Timestamp.fromDate(fullCheckInDate),
                checkOut: Timestamp.fromDate(fullCheckOutDate || fullCheckInDate),
                checkInTime: checkInTime,
                checkOutTime: isHourlyMode ? `${(fullCheckOutDate.getHours() < 10 ? '0' : '') + fullCheckOutDate.getHours()}:${(fullCheckOutDate.getMinutes() < 10 ? '0' : '') + fullCheckOutDate.getMinutes()}` : checkOutTime,
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
                    
                    // Show success message with room information
                    showSuccessMessage(`Your room (Room ${roomNumber} on Floor ${floorLevel}) has been reserved successfully! Continuing to payment.`);
                    
                    // Set up event listener for the proceed to payment button
                    setupPaymentRedirect();
                    
                    // Clear the booking in progress flags (success case)
                    localStorage.removeItem('bookingInProgress');
                    localStorage.removeItem('bookingTimestamp');
                    isBookingInProgress = false;
                    
                    return; // Exit the function early since we already processed this booking
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
                
                // Show success message with room information
                showSuccessMessage(`Your room (Room ${roomNumber} on Floor ${floorLevel}) has been reserved successfully!`);
                
                // Set up event listener for the proceed to payment button
                setupPaymentRedirect();
                
                // Clear the booking in progress flags (success case)
                localStorage.removeItem('bookingInProgress');
                localStorage.removeItem('bookingTimestamp');
                isBookingInProgress = false;
                
            } catch (firebaseError) {
                console.error('Failed to save booking to Firestore:', firebaseError);
                showErrorMessage('There was an issue saving your booking. Please try again.');
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
            showErrorMessage('We encountered an error while checking room availability. Please try again.');
            isBookingInProgress = false;
            localStorage.removeItem('bookingInProgress');
            localStorage.removeItem('bookingTimestamp');
            resetReserveButton();
        }
    } catch (error) {
        console.error('Error in handleReserveClick:', error);
        showErrorMessage('An error occurred while processing your reservation. Please try again.');
        isBookingInProgress = false;
        localStorage.removeItem('bookingInProgress');
        localStorage.removeItem('bookingTimestamp');
        resetReserveButton();
    }
}

// Function to show error message modal
function showErrorMessage(message) {
    const modal = document.getElementById('reservation-error-modal');
    const messageEl = document.getElementById('reservation-error-message');
    
    if (modal && messageEl) {
        messageEl.textContent = message;
        modal.classList.remove('hidden');
        
        // Add click event to close button
        const closeButtons = modal.querySelectorAll('.close-modal');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        });
        
        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    } else {
        // Fallback to alert if modal elements don't exist
        alert(message);
    }
}

// Function to show success message modal
function showSuccessMessage(message) {
    const modal = document.getElementById('reservation-success-modal');
    const messageEl = document.getElementById('reservation-success-message');
    
    if (modal && messageEl) {
        messageEl.textContent = message;
        modal.classList.remove('hidden');
    } else {
        // Fallback to alert if modal elements don't exist
        alert(message);
    }
}

// Function to set up event listener for payment page redirect
function setupPaymentRedirect() {
    const paymentButton = document.getElementById('proceed-to-payment');
    if (paymentButton) {
        paymentButton.addEventListener('click', () => {
            window.location.href = '../paymentProcess/pay.html';
        });
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
    window.location.href = `../Dashboard/Dashboard.html?bookingId=${bookingId}&collection=${collection}`;
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
