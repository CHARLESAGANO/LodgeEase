/**
 * Lodge Data Service
 * This module provides access to EverLodge data without running into duplicate declaration issues
 */

// Constants for EverLodge
const STANDARD_RATE = 1300; // ₱1,300 per night standard rate
const NIGHT_PROMO_RATE = 580; // ₱580 per night night promo rate
const SERVICE_FEE_PERCENTAGE = 0.14; // 14% service fee
const WEEKLY_DISCOUNT = 0.10; // 10% weekly discount

/**
 * Get occupancy data for EverLodge by room type
 * @returns {Promise<Array>} Occupancy data by room type
 */
async function getOccupancyData() {
    try {
        // Fallback data in case the import fails
        const fallbackData = [
            { roomType: 'Standard', occupancy: 45 },
            { roomType: 'Deluxe', occupancy: 32 },
            { roomType: 'Suite', occupancy: 59 },
            { roomType: 'Family', occupancy: 27 }
        ];
        
        try {
            // Try to import EverLodgeDataService
            const { EverLodgeDataService } = await import('../../AdminSide/shared/everLodgeDataService.js');
            const data = await EverLodgeDataService.getEverLodgeData();
            return data.occupancy.byRoomType;
        } catch (serviceError) {
            console.error('Error importing EverLodgeDataService:', serviceError);
            return fallbackData;
        }
    } catch (error) {
        console.error('Error in getOccupancyData:', error);
        return [
            { roomType: 'Standard', occupancy: 45 },
            { roomType: 'Deluxe', occupancy: 32 },
            { roomType: 'Suite', occupancy: 59 },
            { roomType: 'Family', occupancy: 27 }
        ];
    }
}

/**
 * Get all lodge data needed for reporting
 * @returns {Promise<Object>} Object containing all lodge data
 */
async function getLodgeData() {
    const occupancyData = await getOccupancyData();
    
    return {
        constants: {
            STANDARD_RATE,
            NIGHT_PROMO_RATE,
            SERVICE_FEE_PERCENTAGE,
            WEEKLY_DISCOUNT
        },
        occupancy: occupancyData,
        roomCounts: {
            'Standard': 15,
            'Deluxe': 10,
            'Suite': 8,
            'Family': 7
        },
        stayLengths: {
            'Standard': 2.1,
            'Deluxe': 1.8,
            'Suite': 2.5,
            'Family': 3.2
        },
        priceMultipliers: {
            'Standard': 1.0,
            'Deluxe': 1.5,
            'Suite': 2.2,
            'Family': 2.0
        },
        revenueSources: {
            'Direct Bookings': 0.45,
            'Online Travel Agencies': 0.38,
            'Corporate Accounts': 0.12,
            'Walk-in Guests': 0.05
        }
    };
}

export default {
    getLodgeData,
    getOccupancyData,
    STANDARD_RATE,
    NIGHT_PROMO_RATE,
    SERVICE_FEE_PERCENTAGE,
    WEEKLY_DISCOUNT
}; 