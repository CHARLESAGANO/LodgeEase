// Rate Calculation Service
// Shared module for consistent rate calculation across Room Management and Billing

// Constants for pricing
const STANDARD_RATE = 1300; // ₱1,300 per night standard rate
const NIGHT_PROMO_RATE = 580; // ₱580 per night night promo rate
const SHORT_STAY_RATE = 650; // ₱650 for 3-hour short stay
const TV_REMOTE_FEE = 100; // ₱100 fee for TV remote
const SERVICE_FEE_PERCENTAGE = 0.14; // 14% service fee
const WEEKLY_DISCOUNT = 0.10; // 10% weekly discount

/**
 * Calculate number of nights between two dates
 * @param {Date|string} checkIn - Check-in date
 * @param {Date|string} checkOut - Check-out date
 * @returns {number} Number of nights
 */
function calculateNights(checkIn, checkOut) {
    if (!checkOut) return 0; // Handle case with no check-out date
    
    const checkInDate = checkIn instanceof Date ? checkIn : new Date(checkIn);
    const checkOutDate = checkOut instanceof Date ? checkOut : new Date(checkOut);
    const diffTime = Math.abs(checkOutDate - checkInDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine if a booking is eligible for night promo
 * @param {number} nights - Number of nights
 * @returns {boolean} Whether eligible for night promo
 */
function isNightPromoEligible(nights) {
    // Night promo is valid for any 1-night stay
    return nights === 1;
}

/**
 * Calculate the rate based on length of stay and time slot
 * @param {number} nights - Number of nights
 * @param {string} checkInTimeSlot - 'standard' or 'night-promo' (no longer used for decision-making)
 * @returns {number} The nightly rate
 */
function getNightlyRate(nights, checkInTimeSlot) {
    // Night promo is automatically applied for 1-night stays
    const isPromoEligible = isNightPromoEligible(nights);
    return isPromoEligible ? NIGHT_PROMO_RATE : STANDARD_RATE;
}

/**
 * Calculate booking costs
 * @param {number} nights - Number of nights
 * @param {string} checkInTimeSlot - 'standard' or 'night-promo'
 * @param {boolean} hasCheckOut - Whether the booking has a check-out date
 * @param {boolean} hasTvRemote - Whether the booking includes a TV remote
 * @returns {Object} Calculated amounts: {subtotal, discountAmount, serviceFeeAmount, totalAmount}
 */
function calculateBookingCosts(nights, checkInTimeSlot = 'standard', hasCheckOut = true, hasTvRemote = false) {
    let subtotal = 0;
    let nightlyRate = 0;
    let discountAmount = 0;
    
    // Handle short stay for bookings without check-out date
    if (!hasCheckOut) {
        // Apply the 3-hour short stay rate
        subtotal = SHORT_STAY_RATE;
        nightlyRate = SHORT_STAY_RATE;
    } else {
        // Get rate based on check-in time selection
        nightlyRate = getNightlyRate(nights, checkInTimeSlot);
        
        // Calculate base cost for the stay
        subtotal = nightlyRate * nights;
        
        // Apply weekly discount if applicable
        if (nights >= 7) {
            discountAmount = subtotal * WEEKLY_DISCOUNT;
            subtotal -= discountAmount;
        }
    }
    
    // Add TV remote fee if applicable
    const tvRemoteFee = hasTvRemote ? TV_REMOTE_FEE : 0;
    subtotal += tvRemoteFee;
    
    // Calculate service fee and total
    const serviceFeeAmount = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
    const totalAmount = subtotal + serviceFeeAmount;
    
    return {
        nightlyRate,
        subtotal,
        discountAmount,
        serviceFeeAmount,
        totalAmount,
        nights,
        isShortStay: !hasCheckOut,
        hasTvRemote: hasTvRemote,
        tvRemoteFee: tvRemoteFee
    };
}

// Export functions and constants
export {
    STANDARD_RATE,
    NIGHT_PROMO_RATE,
    SHORT_STAY_RATE,
    TV_REMOTE_FEE,
    SERVICE_FEE_PERCENTAGE,
    WEEKLY_DISCOUNT,
    calculateNights,
    isNightPromoEligible,
    getNightlyRate,
    calculateBookingCosts
}; 