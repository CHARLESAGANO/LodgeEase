import { EverLodgeDataService } from './everLodgeDataService.js';

// Simple test function to run from browser console or elsewhere
async function testEverLodgeDataService() {
    try {
        console.log('Testing EverLodgeDataService...');
        const data = await EverLodgeDataService.getEverLodgeData();
        
        console.log('--- EverLodgeDataService Test Results ---');
        console.log('Data retrieved successfully:', !!data);
        console.log('Room types:', data.roomTypeDistribution);
        console.log('Occupancy by room type:', data.occupancy.byRoomType);
        console.log('Monthly occupancy:', data.occupancy.monthly);
        console.log('Bookings total:', data.bookingsData.total);
        console.log('Revenue total:', data.revenue.total);
        console.log('--- End of Test ---');
        
        return data;
    } catch (error) {
        console.error('Error testing EverLodgeDataService:', error);
        throw error;
    }
}

// Export the test function
export { testEverLodgeDataService }; 