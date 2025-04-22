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
            
            // Fetch bookings data from everlodgebookings collection
            const bookings = await this.fetchBookings();
            
            // Fetch rooms data based on booking information
            const rooms = await this.fetchRooms(bookings);
            
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
                roomTypeDistribution: this.calculateRoomTypeDistribution(rooms, bookings),
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
     * Fetch bookings data from Firebase everlodgebookings collection
     * @returns {Promise<Array>} Array of booking objects
     */
    async fetchBookings() {
        try {
            console.log('Fetching bookings from everlodgebookings collection');
            const bookingsRef = collection(db, 'everlodgebookings');
            // Use query to get all bookings, sorted by check-in date
            const bookingsQuery = query(bookingsRef, orderBy('createdAt', 'desc'));
            
            const bookingsSnapshot = await getDocs(bookingsQuery);
            const bookings = [];
            
            console.log(`Retrieved ${bookingsSnapshot.size} bookings from everlodgebookings`);
            
            bookingsSnapshot.forEach(doc => {
                const data = doc.data();
                
                // Ensure the data has the expected structure
                const booking = {
                    id: doc.id,
                    checkIn: data.checkIn,
                    checkOut: data.checkOut,
                    createdAt: data.createdAt || Timestamp.now(),
                    status: data.status || 'pending',
                    contactNumber: data.contactNumber,
                    email: data.email,
                    guestName: data.guestName,
                    guests: data.guests || 1,
                    lodgeId: data.lodgeId || 'ever-lodge',
                    lodgeName: data.lodgeName || 'Ever Lodge',
                    nightlyRate: data.nightlyRate || 0,
                    numberOfNights: data.numberOfNights || 1,
                    paymentStatus: data.paymentStatus || 'pending',
                    // Remap property details to match expected structure
                    propertyDetails: {
                        name: data.lodgeName || 'Ever Lodge',
                        location: data.propertyDetails?.location || 'Baguio City, Philippines',
                        roomNumber: data.propertyDetails?.roomNumber,
                        roomType: data.propertyDetails?.roomType || 'Standard',
                        floorLevel: data.propertyDetails?.floorLevel
                    },
                    serviceFee: data.serviceFee || 0,
                    subtotal: data.subtotal || 0,
                    totalPrice: data.totalPrice || 0,
                    userId: data.userId
                };
                
                // Check for valid date formats and log any issues
                try {
                    if (!booking.checkIn) {
                        console.warn(`Booking ${doc.id} has no checkIn date`);
                    }
                    
                    if (!booking.checkOut) {
                        console.warn(`Booking ${doc.id} has no checkOut date`);
                    }
                    
                    bookings.push(booking);
                } catch (error) {
                    console.error(`Error processing booking ${doc.id}:`, error);
                }
            });
            
            console.log(`Successfully processed ${bookings.length} bookings`);
            
            // If no bookings are found, log a warning
            if (bookings.length === 0) {
                console.warn('No bookings found in everlodgebookings collection. Will generate sample data.');
                
                // Generate sample data for testing if no real data exists
                const now = new Date();
                for (let i = 0; i < 10; i++) {
                    const checkIn = new Date(now);
                    checkIn.setDate(now.getDate() - (30 * i)); // Last 6 months
                    
                    const checkOut = new Date(checkIn);
                    checkOut.setDate(checkIn.getDate() + 3 + Math.floor(Math.random() * 4)); // 3-7 day stays
                    
                    bookings.push({
                        id: `sample-${i}`,
                        checkIn: Timestamp.fromDate(checkIn),
                        checkOut: Timestamp.fromDate(checkOut),
                        createdAt: Timestamp.fromDate(new Date(checkIn.getTime() - (7 * 24 * 60 * 60 * 1000))), // 7 days before checkIn
                        status: Math.random() > 0.1 ? 'confirmed' : 'cancelled', // 90% confirmed
                        contactNumber: '123-456-7890',
                        email: 'sample@example.com',
                        guestName: `Sample Guest ${i}`,
                        guests: 1 + Math.floor(Math.random() * 3),
                        lodgeId: 'ever-lodge',
                        lodgeName: 'Ever Lodge',
                        nightlyRate: 3500 + (Math.floor(Math.random() * 10) * 100),
                        numberOfNights: 3 + Math.floor(Math.random() * 4),
                        paymentStatus: Math.random() > 0.2 ? 'paid' : 'pending',
                        propertyDetails: {
                            name: 'Ever Lodge',
                            location: 'Baguio City, Philippines',
                            roomNumber: `${Math.floor(Math.random() * 3) + 1}0${i % 10}`,
                            roomType: ['Standard', 'Deluxe', 'Family', 'Premium Suite'][Math.floor(Math.random() * 4)],
                            floorLevel: `${Math.floor(Math.random() * 3) + 1}`
                        },
                        serviceFee: 500,
                        subtotal: 0,
                        totalPrice: 0,
                        userId: `user-${i}`
                    });
                    
                    // Calculate the total price based on nightlyRate and numberOfNights
                    const lastBooking = bookings[bookings.length - 1];
                    lastBooking.subtotal = lastBooking.nightlyRate * lastBooking.numberOfNights;
                    lastBooking.totalPrice = lastBooking.subtotal + lastBooking.serviceFee;
                }
                
                console.log('Generated sample booking data:', bookings.length);
            }
            
            return bookings;
        } catch (error) {
            console.error('Error fetching bookings:', error);
            return [];
        }
    },
    
    /**
     * Fetch or derive rooms data from bookings
     * @param {Array} bookings Array of booking objects
     * @returns {Promise<Array>} Array of room objects
     */
    async fetchRooms(bookings = []) {
        try {
            // Extract unique rooms from bookings
            const uniqueRooms = new Map();
            
            bookings.forEach(booking => {
                if (booking.propertyDetails?.roomNumber) {
                    const roomKey = `${booking.propertyDetails.roomNumber}`;
                    
                    if (!uniqueRooms.has(roomKey)) {
                        uniqueRooms.set(roomKey, {
                            id: `room-${booking.propertyDetails.roomNumber}`,
                            roomNumber: booking.propertyDetails.roomNumber,
                            propertyDetails: {
                                name: booking.lodgeName || 'Ever Lodge',
                                roomType: booking.propertyDetails.roomType || 'Standard',
                                location: booking.propertyDetails.location || 'Baguio City, Philippines',
                                floorLevel: booking.propertyDetails.floorLevel || '1'
                            },
                            status: this.getRoomStatus(booking)
                        });
                    }
                }
            });
            
            // Convert to array
            const rooms = Array.from(uniqueRooms.values());
            
            // If no rooms found, create sample data
            if (rooms.length === 0) {
                return [
                    { id: 'room1', roomNumber: '101', propertyDetails: { name: 'Ever Lodge', roomType: 'Standard' }, status: 'occupied' },
                    { id: 'room2', roomNumber: '102', propertyDetails: { name: 'Ever Lodge', roomType: 'Premium Suite' }, status: 'available' },
                    { id: 'room3', roomNumber: '103', propertyDetails: { name: 'Ever Lodge', roomType: 'Deluxe' }, status: 'occupied' },
                    { id: 'room4', roomNumber: '104', propertyDetails: { name: 'Ever Lodge', roomType: 'Family' }, status: 'occupied' },
                    { id: 'room5', roomNumber: '105', propertyDetails: { name: 'Ever Lodge', roomType: 'Standard' }, status: 'available' },
                    { id: 'room6', roomNumber: '106', propertyDetails: { name: 'Ever Lodge', roomType: 'Premium Suite' }, status: 'occupied' }
                ];
            }
            
            return rooms;
        } catch (error) {
            console.error('Error generating rooms data:', error);
            return [];
        }
    },
    
    /**
     * Determine room status based on booking data
     * @param {Object} booking Booking object
     * @returns {string} Room status
     */
    getRoomStatus(booking) {
        try {
            if (!booking.checkIn || !booking.checkOut) {
                return 'available';
            }
            
            const now = new Date();
            const checkIn = booking.checkIn instanceof Timestamp 
                ? new Date(booking.checkIn.seconds * 1000) 
                : new Date(booking.checkIn);
                
            const checkOut = booking.checkOut instanceof Timestamp 
                ? new Date(booking.checkOut.seconds * 1000) 
                : new Date(booking.checkOut);
                
            if (booking.status === 'cancelled') {
                return 'available';
            } else if (now >= checkIn && now <= checkOut) {
                return 'occupied';
            } else if (now < checkIn) {
                return 'reserved';
            } else {
                return 'available';
            }
        } catch (error) {
            console.error('Error determining room status:', error);
            return 'available';
        }
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
                byRoomType: this.getMonthlyOccupancyByRoomType(rooms, bookings),
                byBookingType: [] // New property to store occupancy by booking type (manual vs online)
            };
            
            // Calculate monthly occupancy for last 6 months
            const totalRooms = rooms.length || 10; // Use 10 rooms as default if no room data
            const now = new Date();
            
            console.log(`Calculating occupancy with ${bookings.length} bookings and ${totalRooms} rooms`);
            
            // Count bookings by source (manual vs online)
            const manualBookings = bookings.filter(booking => booking.source === 'admin' || booking.isManualBooking === true);
            const onlineBookings = bookings.filter(booking => !booking.source || booking.source !== 'admin');
            
            console.log(`Booking sources: ${manualBookings.length} manual, ${onlineBookings.length} online`);
            
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
                        // Handle different formats of checkIn/checkOut
                        let checkIn, checkOut;
                        
                        if (booking.checkIn instanceof Timestamp) {
                            checkIn = new Date(booking.checkIn.seconds * 1000);
                        } else if (typeof booking.checkIn === 'string') {
                            checkIn = new Date(booking.checkIn);
                        } else if (booking.checkIn?.toDate) {
                            checkIn = booking.checkIn.toDate();
                        } else {
                            console.warn('Invalid checkIn format:', booking.checkIn);
                            return false;
                        }
                        
                        if (booking.checkOut instanceof Timestamp) {
                            checkOut = new Date(booking.checkOut.seconds * 1000);
                        } else if (typeof booking.checkOut === 'string') {
                            checkOut = new Date(booking.checkOut);
                        } else if (booking.checkOut?.toDate) {
                            checkOut = booking.checkOut.toDate();
                        } else {
                            console.warn('Invalid checkOut format:', booking.checkOut);
                            return false;
                        }
                        
                        // Only include active booking statuses
                        const activeStatuses = ['occupied', 'checked-in', 'confirmed', 'active', 'pending'];
                        const isActiveStatus = activeStatuses.includes(booking.status?.toLowerCase());
                        
                        // Only include valid bookings with dates that overlap with the month
                        // and have active status
                        return (checkIn <= endOfMonth && 
                               checkOut >= startOfMonth && 
                               isActiveStatus);
                    } catch (error) {
                        console.error('Error filtering booking for month:', error);
                        return false;
                    }
                });
                
                // Get manual and online bookings for this month
                const monthManualBookings = monthBookings.filter(booking => 
                    booking.source === 'admin' || booking.isManualBooking === true);
                
                const monthOnlineBookings = monthBookings.filter(booking => 
                    !booking.source || booking.source !== 'admin');
                
                // Calculate daily occupancy rates for the month
                const daysInMonth = endOfMonth.getDate();
                let totalOccupiedDays = 0;
                let manualOccupiedDays = 0;
                let onlineOccupiedDays = 0;
                
                // For each day in the month
                for (let day = 1; day <= daysInMonth; day++) {
                    const currentDate = new Date(date.getFullYear(), date.getMonth(), day);
                    
                    // Count bookings active on this day
                    const activeBookings = monthBookings.filter(booking => {
                        try {
                            const checkIn = booking.checkIn instanceof Timestamp 
                                ? new Date(booking.checkIn.seconds * 1000)
                                : new Date(booking.checkIn);
                                
                            const checkOut = booking.checkOut instanceof Timestamp 
                                ? new Date(booking.checkOut.seconds * 1000)
                                : new Date(booking.checkOut);
                                
                            return checkIn <= currentDate && checkOut >= currentDate;
                        } catch (error) {
                            return false;
                        }
                    });
                    
                    // Count manual bookings active on this day
                    const activeManualBookings = activeBookings.filter(booking => 
                        booking.source === 'admin' || booking.isManualBooking === true);
                    
                    // Count online bookings active on this day
                    const activeOnlineBookings = activeBookings.filter(booking => 
                        !booking.source || booking.source !== 'admin');
                        
                    // Calculate occupied rooms (max is total rooms)
                    const occupiedRooms = Math.min(activeBookings.length, totalRooms);
                    totalOccupiedDays += occupiedRooms;
                    
                    // Track manual and online occupancy separately (prevent double counting)
                    const manualOccupiedRooms = Math.min(activeManualBookings.length, 
                                                        totalRooms - activeOnlineBookings.length);
                    manualOccupiedDays += manualOccupiedRooms;
                    
                    const onlineOccupiedRooms = Math.min(activeOnlineBookings.length, 
                                                        totalRooms - activeManualBookings.length);
                    onlineOccupiedDays += onlineOccupiedRooms;
                }
                
                // Calculate average occupancy rate for the month
                const totalPossibleRoomDays = totalRooms * daysInMonth;
                const occupancyRate = totalPossibleRoomDays > 0 
                    ? (totalOccupiedDays / totalPossibleRoomDays) * 100
                    : 0;
                
                // Calculate manual and online occupancy rates
                const manualOccupancyRate = totalPossibleRoomDays > 0
                    ? (manualOccupiedDays / totalPossibleRoomDays) * 100
                    : 0;
                    
                const onlineOccupancyRate = totalPossibleRoomDays > 0
                    ? (onlineOccupiedDays / totalPossibleRoomDays) * 100
                    : 0;
                
                console.log(`Month ${monthYear}: ${totalOccupiedDays} occupied room days out of ${totalPossibleRoomDays} possible (${occupancyRate.toFixed(2)}%)`);
                console.log(`${monthYear} Manual: ${manualOccupancyRate.toFixed(2)}%, Online: ${onlineOccupancyRate.toFixed(2)}%`);
                
                result.monthly.push({
                    month: monthYear,
                    occupiedRoomDays: totalOccupiedDays,
                    totalPossibleRoomDays,
                    rate: parseFloat(occupancyRate.toFixed(2)),
                    manualRate: parseFloat(manualOccupancyRate.toFixed(2)),
                    onlineRate: parseFloat(onlineOccupancyRate.toFixed(2))
                });
                
                // Add to byBookingType data
                result.byBookingType.push({
                    month: monthYear,
                    manual: {
                        occupiedRoomDays: manualOccupiedDays,
                        rate: parseFloat(manualOccupancyRate.toFixed(2))
                    },
                    online: {
                        occupiedRoomDays: onlineOccupiedDays,
                        rate: parseFloat(onlineOccupancyRate.toFixed(2))
                    }
                });
            }
            
            // Sort by date
            result.monthly.sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            result.byBookingType.sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            return result;
        } catch (error) {
            console.error('Error calculating occupancy:', error);
            return {
                monthly: [],
                byRoomType: [],
                byBookingType: []
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
            // Get room types from actual data
            const roomTypes = [...new Set(rooms.map(room => room.propertyDetails?.roomType || 'Standard'))];
            
            // Get current month date range
            const currentDate = new Date();
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            
            // Count rooms by type
            const roomTypeCount = {};
            roomTypes.forEach(type => {
                roomTypeCount[type] = rooms.filter(room => room.propertyDetails?.roomType === type).length || 0;
            });
            
            // Count bookings by room type
            const bookingsByType = {};
            roomTypes.forEach(type => {
                bookingsByType[type] = 0;
            });
            
            // Process each booking
            bookings.forEach(booking => {
                try {
                    // Only include active booking statuses
                    const activeStatuses = ['occupied', 'checked-in', 'confirmed', 'active', 'pending'];
                    if (!activeStatuses.includes(booking.status?.toLowerCase())) return;
                    
                    const checkIn = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                        
                    const checkOut = booking.checkOut instanceof Timestamp 
                        ? new Date(booking.checkOut.seconds * 1000) 
                        : new Date(booking.checkOut);
                        
                    // Check if booking is in current month
                    if (checkIn <= endOfMonth && checkOut >= startOfMonth) {
                        const roomType = booking.propertyDetails?.roomType || 'Standard';
                        if (roomTypes.includes(roomType)) {
                            bookingsByType[roomType]++;
                        }
                    }
                } catch (error) {
                    console.error('Error processing booking for room type occupancy:', error);
                }
            });
            
            // Calculate occupancy rates
            const result = [];
            roomTypes.forEach(type => {
                const totalRooms = roomTypeCount[type] || 1; // Avoid division by zero
                const occupiedRooms = Math.min(bookingsByType[type] || 0, totalRooms);
                const rate = (occupiedRooms / totalRooms) * 100;
                
                result.push({
                    roomType: type,
                    occupiedRooms,
                    totalRooms,
                    rate
                });
            });
            
            return result;
        } catch (error) {
            console.error('Error calculating room type occupancy:', error);
            return [];
        }
    },
    
    /**
     * Calculate bookings data
     * @param {Array} bookings Array of booking objects
     * @returns {Object} Booking statistics
     */
    calculateBookingData(bookings) {
        try {
            // Get last 6 months
            const monthlyData = new Map();
            const now = new Date();
            
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyData.set(monthYear, { month: monthYear, count: 0 });
            }
            
            // Count bookings by month
            bookings.forEach(booking => {
                try {
                    const createdAt = booking.createdAt instanceof Timestamp 
                        ? new Date(booking.createdAt.seconds * 1000) 
                        : new Date(booking.createdAt);
                        
                    const monthYear = createdAt.toLocaleString('default', { month: 'short', year: 'numeric' });
                    
                    if (monthlyData.has(monthYear)) {
                        monthlyData.get(monthYear).count++;
                    }
                } catch (error) {
                    console.error('Error processing booking for monthly count:', error);
                }
            });
            
            // Convert to array and sort
            const monthly = Array.from(monthlyData.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            return {
                monthly,
                total: bookings.length
            };
        } catch (error) {
            console.error('Error calculating booking data:', error);
            return {
                monthly: [],
                total: 0
            };
        }
    },
    
    /**
     * Calculate revenue data
     * @param {Array} bookings Array of booking objects
     * @returns {Object} Revenue statistics
     */
    calculateRevenueData(bookings) {
        try {
            // Get last 6 months
            const monthlyData = new Map();
            const now = new Date();
            
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyData.set(monthYear, { month: monthYear, amount: 0 });
            }
            
            // Sum revenue by month and calculate total
            let total = 0;
            
            bookings.forEach(booking => {
                try {
                    // Skip cancelled bookings
                    if (booking.status === 'cancelled') return;
                    
                    const checkIn = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                        
                    const monthYear = checkIn.toLocaleString('default', { month: 'short', year: 'numeric' });
                    const amount = booking.totalPrice || 0;
                    
                    total += amount;
                    
                    if (monthlyData.has(monthYear)) {
                        monthlyData.get(monthYear).amount += amount;
                    }
                } catch (error) {
                    console.error('Error processing booking for revenue:', error);
                }
            });
            
            // Convert to array and sort
            const monthly = Array.from(monthlyData.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            return {
                monthly,
                total
            };
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
     * @param {Array} bookings Array of booking objects for fallback
     * @returns {Object} Room type distribution
     */
    calculateRoomTypeDistribution(rooms, bookings = []) {
        try {
            const distribution = {};
            
            // If we have room data, use it
            if (rooms && rooms.length > 0) {
                rooms.forEach(room => {
                    const roomType = room.propertyDetails?.roomType || 'Standard';
                    distribution[roomType] = (distribution[roomType] || 0) + 1;
                });
                return distribution;
            }
            
            // Fallback to deriving from bookings
            if (bookings && bookings.length > 0) {
                const uniqueRoomTypes = new Set();
                
                bookings.forEach(booking => {
                    const roomType = booking.propertyDetails?.roomType || 'Standard';
                    uniqueRoomTypes.add(roomType);
                });
                
                uniqueRoomTypes.forEach(type => {
                    distribution[type] = bookings.filter(b => 
                        (b.propertyDetails?.roomType || 'Standard') === type
                    ).length;
                });
                
                return distribution;
            }
            
            // If no data, return sample distribution
            return {
                'Standard': 2,
                'Premium Suite': 2,
                'Deluxe': 1,
                'Family': 1
            };
        } catch (error) {
            console.error('Error calculating room type distribution:', error);
            return { 'Standard': 1 };
        }
    }
};