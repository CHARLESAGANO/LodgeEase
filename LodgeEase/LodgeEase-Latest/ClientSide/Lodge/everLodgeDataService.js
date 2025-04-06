/**
 * ClientSide wrapper for EverLodgeDataService
 * This file serves as a compatibility layer that imports and re-exports the AdminSide EverLodgeDataService
 */

// Simply re-export the AdminSide service
// This allows lodge13.js to import from this location while using the same data service
export { EverLodgeDataService } from '../../AdminSide/shared/everLodgeDataService.js';

// Constants shared with lodge13.js
const STANDARD_RATE = 1300; // ₱1,300 per night standard rate
const NIGHT_PROMO_RATE = 580; // ₱580 per night night promo rate
const SERVICE_FEE_PERCENTAGE = 0.14; // 14% service fee
const WEEKLY_DISCOUNT = 0.10; // 10% weekly discount

// Export lodge-specific constants for consistency across files
export const lodgeConstants = {
    STANDARD_RATE,
    NIGHT_PROMO_RATE,
    SERVICE_FEE_PERCENTAGE,
    WEEKLY_DISCOUNT
};

// Default occupancy data to use as fallback
export const defaultOccupancyData = [
    { roomType: 'Standard', occupancy: 45 },
    { roomType: 'Deluxe', occupancy: 32 },
    { roomType: 'Suite', occupancy: 59 },
    { roomType: 'Family', occupancy: 27 }
]; 