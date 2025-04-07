import { db } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Cache management
let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const EverLodgeDataService = {
    /**
     * Gets Ever Lodge data with caching support
     * @param {boolean} forceRefresh Force a refresh of data
     * @returns {Promise<Object>} The Ever Lodge data
     */
    async getEverLodgeData(forceRefresh = false) {
        // Check if we have cached data that's still valid
        const now = Date.now();
        if (!forceRefresh && cachedData && (now - lastFetchTime) < CACHE_DURATION) {
            console.log('Using cached Ever Lodge data');
            return cachedData;
        }

        try {
            console.log('Fetching fresh Ever Lodge data');
            
            // Fetch bookings data
            const bookings = await this.fetchBookings();
            
            // Fetch rooms data
            const rooms = await this.fetchRooms();
            
            // Calculate occupancy data
            const occupancyData = this.calculateOccupancy(rooms, bookings);
            
            // Calculate bookings data
            const bookingsData = this.calculateBookingData(bookings);
            
            // Calculate revenue data
            const revenueData = this.calculateRevenueData(bookings);
            
            // Store data in cache
            cachedData = {
                bookings,
                rooms,
                occupancy: occupancyData,
                bookingsData,
                revenue: revenueData,
                roomTypeDistribution: this.calculateRoomTypeDistribution(rooms),
                lastUpdated: new Date().toISOString()
            };
            
            lastFetchTime = now;
            
            return cachedData;
        } catch (error) {
            console.error('Error fetching Ever Lodge data:', error);
            
            // If we have cached data, return it even if expired
            if (cachedData) {
                console.log('Returning expired cache due to error');
                return cachedData;
            }
            
            // Otherwise return empty data structure
            return {
                bookings: [],
                rooms: [],
                occupancy: {
                    monthly: [],
                    byRoomType: []
                },
                bookingsData: {
                    monthly: [],
                    total: 0
                },
                revenue: {
                    monthly: [],
                    total: 0
                },
                roomTypeDistribution: {},
                lastUpdated: new Date().toISOString()
            };
        }
    },
    
    /**
     * Fetch bookings data from Firebase
     * @returns {Promise<Array>} Array of booking objects
     */
    async fetchBookings() {
        try {
            // First try to get booking data from Lodge13
            try {
                const Lodge13Module = await import('../../ClientSide/Lodge/lodge13.js');
                if (Lodge13Module.getLodge13Bookings) {
                    console.log('Using actual booking data from Lodge13');
                    return await Lodge13Module.getLodge13Bookings();
                }
            } catch (moduleError) {
                console.error('Failed to import Lodge13 module:', moduleError);
                // Continue to fallback method
            }
            
            // Fallback to Firestore
            console.log('Fetching bookings from Firestore');
            const bookingsRef = collection(db, 'bookings');
            const bookingsQuery = query(
                bookingsRef,
                where('propertyDetails.name', '==', 'Ever Lodge')
            );
            
            const bookingsSnapshot = await getDocs(bookingsQuery);
            const bookings = [];
            
            bookingsSnapshot.forEach(doc => {
                const data = doc.data();
                bookings.push({
                    id: doc.id,
                    ...data
                });
            });
            
            return bookings;
        } catch (error) {
            console.error('Error fetching bookings:', error);
            return [];
        }
    },
    
    /**
     * Fetch rooms data from Firebase
     * @returns {Promise<Array>} Array of room objects
     */
    async fetchRooms() {
        const roomsRef = collection(db, 'rooms');
        const roomsQuery = query(
            roomsRef,
            where('propertyDetails.name', '==', 'Ever Lodge')
        );
        
        const roomsSnapshot = await getDocs(roomsQuery);
        const rooms = [];
        
        roomsSnapshot.forEach(doc => {
            const data = doc.data();
            rooms.push({
                id: doc.id,
                ...data
            });
        });
        
        // If no rooms found, create sample data
        if (rooms.length === 0) {
            return [
                { id: 'room1', propertyDetails: { name: 'Ever Lodge', roomType: 'Standard' }, status: 'occupied' },
                { id: 'room2', propertyDetails: { name: 'Ever Lodge', roomType: 'Premium Suite' }, status: 'available' },
                { id: 'room3', propertyDetails: { name: 'Ever Lodge', roomType: 'Deluxe' }, status: 'occupied' },
                { id: 'room4', propertyDetails: { name: 'Ever Lodge', roomType: 'Family' }, status: 'occupied' },
                { id: 'room5', propertyDetails: { name: 'Ever Lodge', roomType: 'Standard' }, status: 'available' },
                { id: 'room6', propertyDetails: { name: 'Ever Lodge', roomType: 'Premium Suite' }, status: 'occupied' }
            ];
        }
        
        return rooms;
    },
    
    /**
     * Calculate occupancy data from rooms and bookings
     * @param {Array} rooms Array of room objects
     * @param {Array} bookings Array of booking objects
     * @returns {Object} Occupancy statistics
     */
    calculateOccupancy(rooms, bookings) {
        try {
            const result = {
                monthly: [],
                byRoomType: this.getMonthlyOccupancyByRoomType(rooms, bookings)
            };
            
            // Calculate monthly occupancy for last 6 months
            const totalRooms = rooms.length || 1;
            const now = new Date();
            
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                
                // Get start and end of month
                const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
                const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                
                // Filter bookings for this month
                const monthBookings = bookings.filter(booking => {
                    try {
                        const checkIn = booking.checkIn instanceof Timestamp 
                            ? new Date(booking.checkIn.seconds * 1000) 
                            : new Date(booking.checkIn);
                            
                        const checkOut = booking.checkOut instanceof Timestamp 
                            ? new Date(booking.checkOut.seconds * 1000) 
                            : new Date(booking.checkOut);
                            
                        return (checkIn <= endOfMonth && checkOut >= startOfMonth);
                    } catch (error) {
                        return false;
                    }
                });
                
                // Calculate occupancy
                const occupiedRooms = Math.min(monthBookings.length, totalRooms);
                const rate = (occupiedRooms / totalRooms) * 100;
                
                result.monthly.push({
                    month: monthYear,
                    occupiedRooms,
                    totalRooms,
                    rate
                });
            }
            
            return result;
        } catch (error) {
            console.error('Error calculating occupancy:', error);
            return {
                monthly: [],
                byRoomType: []
            };
        }
    },
    
    /**
     * Calculate occupancy by room type for the current month
     * @param {Array} rooms Array of room objects
     * @param {Array} bookings Array of booking objects 
     * @returns {Array} Array of room type occupancy objects
     */
    getMonthlyOccupancyByRoomType(rooms, bookings) {
        try {
            // Default room types
            const roomTypes = ['Standard', 'Deluxe', 'Suite', 'Family'];
            
            // Get current month date range
            const currentDate = new Date();
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            
            // Count rooms by type
            const roomTypeCount = {};
            roomTypes.forEach(type => roomTypeCount[type] = 0);
            
            // Count rooms from data
            rooms.forEach(room => {
                const roomType = room.propertyDetails?.roomType || 'Standard';
                roomTypeCount[roomType] = (roomTypeCount[roomType] || 0) + 1;
            });
            
            // Ensure we have at least one room of each type
            roomTypes.forEach(type => {
                if (!roomTypeCount[type]) roomTypeCount[type] = 1;
            });
            
            // Count bookings by room type for current month
            const roomTypeBookings = {};
            roomTypes.forEach(type => roomTypeBookings[type] = 0);
            
            bookings.forEach(booking => {
                try {
                    const checkIn = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                        
                    const checkOut = booking.checkOut instanceof Timestamp 
                        ? new Date(booking.checkOut.seconds * 1000) 
                        : new Date(booking.checkOut);
                    
                    // Skip if booking is not in current month
                    if (checkOut < startOfMonth || checkIn > endOfMonth) return;
                    
                    const roomType = booking.propertyDetails?.roomType || 'Standard';
                    roomTypeBookings[roomType] = (roomTypeBookings[roomType] || 0) + 1;
                } catch (error) {
                    console.error('Error processing booking:', error);
                }
            });
            
            // Calculate occupancy by room type
            const result = [];
            
            Object.keys(roomTypeCount).forEach(roomType => {
                const totalRooms = roomTypeCount[roomType];
                const occupiedRooms = roomTypeBookings[roomType] || 0;
                const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
                
                result.push({
                    roomType,
                    occupancy: Math.min(100, Math.round(occupancyRate))
                });
            });
            
            // If no data, return sample data
            if (result.length === 0) {
                return [
                    { roomType: 'Standard', occupancy: 45 },
                    { roomType: 'Deluxe', occupancy: 32 },
                    { roomType: 'Suite', occupancy: 59 },
                    { roomType: 'Family', occupancy: 27 }
                ];
            }
            
            return result;
        } catch (error) {
            console.error('Error calculating room type occupancy:', error);
            return [
                { roomType: 'Standard', occupancy: 45 },
                { roomType: 'Deluxe', occupancy: 32 },
                { roomType: 'Suite', occupancy: 59 },
                { roomType: 'Family', occupancy: 27 }
            ];
        }
    },
    
    /**
     * Calculate booking data from bookings
     * @param {Array} bookings Array of booking objects
     * @returns {Object} Booking statistics 
     */
    calculateBookingData(bookings) {
        try {
            const result = {
                monthly: [],
                total: bookings.length
            };
            
            // Group bookings by month
            const monthlyBookings = new Map();
            const now = new Date();
            
            // Initialize last 6 months
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyBookings.set(monthYear, { month: monthYear, count: 0 });
            }
            
            // Count bookings by month
            bookings.forEach(booking => {
                try {
                    const checkInDate = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                    
                    const monthYear = checkInDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                    
                    if (monthlyBookings.has(monthYear)) {
                        const monthData = monthlyBookings.get(monthYear);
                        monthData.count++;
                    }
                } catch (error) {
                    console.error('Error processing booking date:', error);
                }
            });
            
            // Convert to array
            result.monthly = Array.from(monthlyBookings.values());
            
            return result;
        } catch (error) {
            console.error('Error calculating booking data:', error);
            return {
                monthly: [],
                total: 0
            };
        }
    },
    
    /**
     * Calculate revenue data from bookings
     * @param {Array} bookings Array of booking objects
     * @returns {Object} Revenue statistics
     */
    calculateRevenueData(bookings) {
        try {
            const result = {
                monthly: [],
                total: 0
            };
            
            // Group by month
            const monthlyRevenue = new Map();
            const now = new Date();
            
            // Initialize last 6 months
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyRevenue.set(monthYear, { month: monthYear, amount: 0 });
            }
            
            // Calculate revenue by month
            bookings.forEach(booking => {
                try {
                    const checkInDate = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                    
                    const monthYear = checkInDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                    const amount = booking.totalPrice || 0;
                    
                    result.total += amount;
                    
                    if (monthlyRevenue.has(monthYear)) {
                        const monthData = monthlyRevenue.get(monthYear);
                        monthData.amount += amount;
                    }
                } catch (error) {
                    console.error('Error processing booking revenue:', error);
                }
            });
            
            // Convert to array
            result.monthly = Array.from(monthlyRevenue.values());
            
            return result;
        } catch (error) {
            console.error('Error calculating revenue data:', error);
            return {
                monthly: [],
                total: 0
            };
        }
    },
    
    /**
     * Calculate room type distribution
     * @param {Array} rooms Array of room objects
     * @returns {Object} Room type distribution
     */
    calculateRoomTypeDistribution(rooms) {
        try {
            const distribution = {};
            
            rooms.forEach(room => {
                let roomType = 'Standard'; // Default
                
                if (room.propertyDetails?.roomType) {
                    roomType = room.propertyDetails.roomType;
                } else if (room.roomType) {
                    roomType = room.roomType;
                }
                
                distribution[roomType] = (distribution[roomType] || 0) + 1;
            });
            
            // If no data, provide sample distribution
            if (Object.keys(distribution).length === 0) {
                return {
                    'Standard': 2,
                    'Premium Suite': 2,
                    'Deluxe': 1,
                    'Family': 1
                };
            }
            
            return distribution;
        } catch (error) {
            console.error('Error calculating room type distribution:', error);
            return {
                'Standard': 2,
                'Premium Suite': 2,
                'Deluxe': 1,
                'Family': 1
            };
        }
    }
}; 