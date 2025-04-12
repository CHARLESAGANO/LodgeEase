// Rate Calculation Service
// Shared module for consistent rate calculation across Room Management and Billing

// Constants for pricing
const STANDARD_RATE = 1300; // ₱1,300 per night standard rate

// New hourly rates
const NIGHT_PROMO_RATE = 580; // ₱580 for night promo (10PM-8AM)
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
 * Calculate number of hours between two dates/times
 * @param {Date|string} checkIn - Check-in date and time
 * @param {Date|string} checkOut - Check-out date and time 
 * @returns {number} Number of hours
 */
function calculateHours(checkIn, checkOut) {
    if (!checkOut) return 0;
    
    const checkInDate = checkIn instanceof Date ? checkIn : new Date(checkIn);
    const checkOutDate = checkOut instanceof Date ? checkOut : new Date(checkOut);
    const diffTime = Math.abs(checkOutDate - checkInDate);
    return Math.ceil(diffTime / (1000 * 60 * 60));
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
 * Get hourly rate based on hours of stay
 * @param {number} hours - Duration of stay in hours
 * @returns {number} The rate for the duration
 */
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
    // and add the hourly rate for remaining hours if applicable
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

/**
 * Calculate the rate based on length of stay and time slot
 * @param {number} nights - Number of nights
 * @param {string} checkInTimeSlot - 'standard' or 'night-promo'
 * @returns {number} The nightly rate
 */
function getNightlyRate(nights, checkInTimeSlot) {
    // For night promo (10PM-8AM)
    if (checkInTimeSlot === 'night-promo') {
        return NIGHT_PROMO_RATE;
    }
    
    // For standard check-in
    return STANDARD_RATE;
}

/**
 * Calculate booking costs
 * @param {number} nights - Number of nights
 * @param {string} checkInTimeSlot - 'standard', 'night-promo', or 'hourly'
 * @param {boolean} hasCheckOut - Whether the booking has a check-out date
 * @param {boolean} hasTvRemote - Whether the booking includes a TV remote
 * @param {number} hours - Optional: Duration in hours (for hourly bookings)
 * @returns {Object} Calculated amounts: {subtotal, discountAmount, serviceFeeAmount, totalAmount}
 */
function calculateBookingCosts(nights, checkInTimeSlot = 'standard', hasCheckOut = true, hasTvRemote = false, hours = 0) {
    let subtotal = 0;
    let nightlyRate = 0;
    let discountAmount = 0;
    let isHourlyRate = false;
    
    // Calculate based on booking type
    if (checkInTimeSlot === 'hourly' && hours > 0) {
        // Use hourly rates
        nightlyRate = getHourlyRate(hours);
        subtotal = nightlyRate;
        isHourlyRate = true;
    } else if (checkInTimeSlot === 'night-promo') {
        // Night promo rate (10PM-8AM)
        nightlyRate = NIGHT_PROMO_RATE;
        subtotal = nightlyRate * (nights || 1); // Ensure at least 1 night
    } else if (!hasCheckOut) {
        // Default to 3-hour rate if no checkout specified and not explicitly hourly
        nightlyRate = THREE_HOUR_RATE;
        subtotal = nightlyRate;
        isHourlyRate = true;
    } else {
        // Standard overnight rate
        nightlyRate = STANDARD_RATE;
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
        hours: isHourlyRate ? hours || 3 : 0, // Default to 3 hours for short stays
        isHourlyRate,
        hasTvRemote: hasTvRemote,
        tvRemoteFee: tvRemoteFee
    };
}

// Export functions and constants
export {
    STANDARD_RATE,
    NIGHT_PROMO_RATE,
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
    SERVICE_FEE_PERCENTAGE,
    WEEKLY_DISCOUNT,
    calculateNights,
    calculateHours,
    isNightPromoEligible,
    getNightlyRate,
    getHourlyRate,
    calculateBookingCosts
}; 