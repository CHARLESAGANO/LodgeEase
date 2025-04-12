// Rate Calculation Service
// Shared module for consistent rate calculation across Room Management and Billing

// Constants for pricing
const STANDARD_RATE = 1300; // ₱1,300 per night standard rate
const NIGHT_PROMO_RATE = 580; // ₱580 per night night promo rate
const SERVICE_FEE_PERCENTAGE = 0.14; // 14% service fee
const WEEKLY_DISCOUNT = 0.10; // 10% weekly discount

/**
 * Calculate number of nights between two dates
 * @param {Date|string} checkIn - Check-in date
 * @param {Date|string} checkOut - Check-out date
 * @returns {number} Number of nights
 */
function calculateNights(checkIn, checkOut) {
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
 * @param {string} checkInTimeSlot - 'standard' or 'night-promo'
 * @returns {number} The nightly rate
 */
function getNightlyRate(nights, checkInTimeSlot) {
    const isPromoEligible = isNightPromoEligible(nights);
    const isPromoRate = isPromoEligible && checkInTimeSlot === 'night-promo';
    return isPromoRate ? NIGHT_PROMO_RATE : STANDARD_RATE;
}

/**
 * Calculate booking costs
 * @param {number} nights - Number of nights
 * @param {string} checkInTimeSlot - 'standard' or 'night-promo'
 * @returns {Object} Calculated amounts: {subtotal, discountAmount, serviceFeeAmount, totalAmount}
 */
function calculateBookingCosts(nights, checkInTimeSlot = 'standard') {
    // Get rate based on check-in time selection
    const nightlyRate = getNightlyRate(nights, checkInTimeSlot);
    
    // Calculate base cost for the stay
    let subtotal = nightlyRate * nights;
    let discountAmount = 0;
    
    // Apply weekly discount if applicable
    if (nights >= 7) {
        discountAmount = subtotal * WEEKLY_DISCOUNT;
        subtotal -= discountAmount;
    }
    
    // Calculate service fee and total
    const serviceFeeAmount = Math.round(subtotal * SERVICE_FEE_PERCENTAGE);
    const totalAmount = subtotal + serviceFeeAmount;
    
    return {
        nightlyRate,
        subtotal,
        discountAmount,
        serviceFeeAmount,
        totalAmount,
        nights
    };
}

// Export functions and constants
export {
    STANDARD_RATE,
    NIGHT_PROMO_RATE,
    SERVICE_FEE_PERCENTAGE,
    WEEKLY_DISCOUNT,
    calculateNights,
    isNightPromoEligible,
    getNightlyRate,
    calculateBookingCosts
}; 