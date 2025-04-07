import { db } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { EverLodgeDataService } from '../shared/everLodgeDataService.js';

export const chartDataService = {
    async getChartData(forceRefresh = false) {
        try {
            // Get data from cache if available and not forcing refresh
            if (!forceRefresh) {
                const cachedData = this.getCachedData();
                if (cachedData) return cachedData;
            }

            // For Ever Lodge, use the shared data service
            const everLodgeData = await EverLodgeDataService.getEverLodgeData(forceRefresh);

            const data = {
                roomTypes: everLodgeData.roomTypeDistribution,
                occupancy: {
                    monthly: everLodgeData.occupancy.monthly,
                    metrics: {
                        averageOccupancy: everLodgeData.occupancy.monthly.reduce((sum, month) => sum + month.rate, 0) / 
                                         (everLodgeData.occupancy.monthly.length || 1)
                    }
                },
                sales: {
                    monthly: everLodgeData.revenue.monthly,
                    metrics: {
                        totalSales: everLodgeData.revenue.total,
                        monthlyGrowth: this.calculateMonthlyGrowth(everLodgeData.revenue.monthly)
                    }
                },
                bookings: {
                    monthly: everLodgeData.bookingsData.monthly,
                    metrics: {
                        totalBookings: everLodgeData.bookingsData.total
                    }
                }
            };

            // Cache the data
            this.cacheData(data);
            return data;
        } catch (error) {
            console.error('Error fetching chart data:', error);
            return {
                roomTypes: {},
                occupancy: { monthly: [], metrics: { averageOccupancy: 0 } },
                sales: { monthly: [], metrics: { totalSales: 0, monthlyGrowth: [] } },
                bookings: { monthly: [], metrics: { totalBookings: 0 } }
            };
        }
    },

    calculateMonthlyGrowth(monthlyData) {
        try {
            const monthlyGrowth = [];
            
            for (let i = 1; i < monthlyData.length; i++) {
                const previousMonth = monthlyData[i-1].amount;
                const currentMonth = monthlyData[i].amount;
                const growth = previousMonth > 0 
                    ? ((currentMonth - previousMonth) / previousMonth) * 100
                    : 0;
                    
                monthlyGrowth.push({
                    month: monthlyData[i].month,
                    growth: parseFloat(growth.toFixed(2))
                });
            }
            
            return monthlyGrowth;
        } catch (error) {
            console.error('Error calculating monthly growth:', error);
            return [];
        }
    },

    getCachedData() {
        const cached = localStorage.getItem('chartData');
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            // Cache for 5 minutes
            if (Date.now() - timestamp < 5 * 60 * 1000) {
                return data;
            }
        }
        return null;
    },

    cacheData(data) {
        localStorage.setItem('chartData', JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    },

    processSalesData(bookings) {
        try {
            // Group bookings by month
            const monthlyData = new Map();
            let totalSales = 0;
            
            // Process each booking
            bookings.forEach(booking => {
                const checkInDate = booking.checkIn instanceof Timestamp 
                    ? new Date(booking.checkIn.seconds * 1000)
                    : typeof booking.checkIn === 'string' 
                        ? new Date(booking.checkIn) 
                        : new Date();
                    
                const month = checkInDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                const amount = booking.totalPrice || 0;
                
                totalSales += amount;
                
                if (!monthlyData.has(month)) {
                    monthlyData.set(month, { month, sales: 0, bookings: 0 });
                }
                
                const monthData = monthlyData.get(month);
                monthData.sales += amount;
                monthData.bookings++;
            });
            
            // Convert to array and sort by date
            const monthly = Array.from(monthlyData.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            // Calculate month-over-month growth
            const monthlyGrowth = this.calculateMonthlyGrowth(monthly.map(m => ({ month: m.month, amount: m.sales })));
            
            return {
                monthly: monthly,
                metrics: {
                    totalSales: totalSales,
                    monthlyGrowth: monthlyGrowth
                }
            };
        } catch (error) {
            console.error('Error processing sales data:', error);
            return {
                monthly: [],
                metrics: {
                    totalSales: 0,
                    monthlyGrowth: []
                }
            };
        }
    },
    
    processBookingData(bookings) {
        try {
            // Group bookings by month
            const monthlyData = new Map();
            let totalBookings = 0;
            
            // Process each booking
            bookings.forEach(booking => {
                const checkInDate = booking.checkIn instanceof Timestamp 
                    ? new Date(booking.checkIn.seconds * 1000)
                    : typeof booking.checkIn === 'string' 
                        ? new Date(booking.checkIn) 
                        : new Date();
                    
                const month = checkInDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                
                totalBookings++;
                
                if (!monthlyData.has(month)) {
                    monthlyData.set(month, { month, count: 0 });
                }
                
                const monthData = monthlyData.get(month);
                monthData.count++;
            });
            
            // Convert to array and sort by date
            const monthly = Array.from(monthlyData.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            // Calculate average bookings per month
            const averageBookings = monthly.length > 0 
                ? monthly.reduce((sum, data) => sum + data.count, 0) / monthly.length
                : 0;
            
            return {
                monthly: monthly,
                metrics: {
                    totalBookings: totalBookings,
                    averageBookings: averageBookings
                }
            };
        } catch (error) {
            console.error('Error processing booking data:', error);
            return {
                monthly: [],
                metrics: {
                    totalBookings: 0,
                    averageBookings: 0
                }
            };
        }
    },

    async getRoomTypeDistribution(establishment) {
        try {
            // For Ever Lodge, use the shared service
            if (establishment === 'Ever Lodge') {
                const everLodgeData = await EverLodgeDataService.getEverLodgeData();
                return everLodgeData.roomTypeDistribution;
            }
            
            console.log(`Fetching room type distribution for ${establishment}`);
            
            const roomsRef = collection(db, 'rooms');
            const q = query(roomsRef, where('propertyDetails.name', '==', establishment));
            const snapshot = await getDocs(q);
            const distribution = {};
            
            console.log(`Found ${snapshot.size} rooms for ${establishment}`);
            
            snapshot.forEach(doc => {
                const room = doc.data();
                console.log("Room data:", room);
                
                // Handle different room type data structures
                let roomType = 'Standard'; // Default fallback
                
                if (room.propertyDetails?.roomType) {
                    roomType = room.propertyDetails.roomType;
                } else if (room.roomType) {
                    roomType = room.roomType;
                }
                
                distribution[roomType] = (distribution[roomType] || 0) + 1;
            });
            
            // If no data found, provide sample distribution
            if (Object.keys(distribution).length === 0) {
                console.log(`No room types found for ${establishment}, using sample data`);
                distribution['Standard'] = 2;
                distribution['Premium Suite'] = 2; 
                distribution['Deluxe'] = 1;
                distribution['Family'] = 1;
            }
            
            console.log("Final room type distribution:", distribution);
            return distribution;
        } catch (error) {
            console.error('Error getting room type distribution:', error);
            // Return sample data on error
            return {
                'Standard': 2,
                'Premium Suite': 2,
                'Deluxe': 1,
                'Family': 1
            };
        }
    },

    async getOccupancyTrends(establishment) {
        try {
            // For Ever Lodge, use the shared service
            if (establishment === 'Ever Lodge') {
                const everLodgeData = await EverLodgeDataService.getEverLodgeData();
                
                return {
                    monthly: everLodgeData.occupancy.monthly,
                    metrics: {
                        averageOccupancy: everLodgeData.occupancy.monthly.reduce((sum, month) => sum + month.rate, 0) / 
                                        (everLodgeData.occupancy.monthly.length || 1)
                    }
                };
            }
            
            const now = new Date();
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);

            // First, get all rooms for the establishment
            const roomsRef = collection(db, 'rooms');
            const roomsQuery = query(
                roomsRef,
                where('propertyDetails.name', '==', establishment)
            );

            const roomsSnapshot = await getDocs(roomsQuery);
            const monthlyOccupancy = new Map();

            // Initialize the last 6 months
            for (let i = 0; i <= 6; i++) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyOccupancy.set(month, {
                    month: month,
                    occupiedRooms: 0,
                    totalRooms: roomsSnapshot.size,
                    rate: 0
                });
            }

            // Get bookings for the time period
            const bookingsRef = collection(db, 'bookings');
            const bookingsQuery = query(
                bookingsRef,
                where('propertyDetails.name', '==', establishment),
                where('checkIn', '>=', sixMonthsAgo)
            );

            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            // Process bookings to calculate occupancy
            bookingsSnapshot.forEach(doc => {
                const booking = doc.data();
                const checkInDate = booking.checkIn instanceof Timestamp 
                    ? new Date(booking.checkIn.seconds * 1000)
                    : new Date(booking.checkIn);
                
                const month = checkInDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                
                if (monthlyOccupancy.has(month)) {
                    const monthData = monthlyOccupancy.get(month);
                    monthData.occupiedRooms += 1;
                    monthData.rate = (monthData.occupiedRooms / monthData.totalRooms) * 100;
                }
            });

            // Convert to array and calculate metrics
            const monthly = Array.from(monthlyOccupancy.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            const averageOccupancy = monthly.reduce((sum, month) => sum + month.rate, 0) / monthly.length;

            return {
                monthly: monthly,
                metrics: {
                    averageOccupancy: averageOccupancy
                }
            };
        } catch (error) {
            console.error('Error getting occupancy trends:', error);
            return {
                monthly: [],
                metrics: {
                    averageOccupancy: 0
                }
            };
        }
    },

    async getSalesAnalysis(establishment) {
        try {
            // Always use Lodge13 data for 'Ever Lodge'
            if (establishment === 'Ever Lodge') {
                try {
                    // First try to load the module dynamically
                    const Lodge13Module = await import('../../ClientSide/Lodge/lodge13.js');
                    
                    // If we have the direct function to get booking data
                    if (Lodge13Module.getLodge13Bookings) {
                        const bookings = await Lodge13Module.getLodge13Bookings();
                        return this.processSalesData(bookings);
                    }
                    
                    // Fallback: Use the data from EverLodgeDataService which already gets data from lodge13
                    const everLodgeData = await EverLodgeDataService.getEverLodgeData(true);
                    
                    // The EverLodgeDataService already handles Lodge13 data behind the scenes
                    return {
                        monthly: everLodgeData.revenue.monthly,
                        metrics: {
                            totalSales: everLodgeData.revenue.total,
                            monthlyGrowth: this.calculateMonthlyGrowth(everLodgeData.revenue.monthly)
                        }
                    };
                } catch (moduleError) {
                    console.error('Error importing Lodge13 module:', moduleError);
                    // Directly query bookings collection filtering for Ever Lodge
                    const bookingsRef = collection(db, 'bookings');
                    const q = query(
                        bookingsRef,
                        where('propertyDetails.name', '==', 'Ever Lodge')
                    );
                    
                    const snapshot = await getDocs(q);
                    const bookings = [];
                    
                    snapshot.forEach(doc => {
                        bookings.push({ id: doc.id, ...doc.data() });
                    });
                    
                    return this.processSalesData(bookings);
                }
            }
            
            // For other establishments, use the regular approach
            const bookingsRef = collection(db, 'bookings');
            const bookingsQuery = query(
                bookingsRef, 
                where('propertyDetails.name', '==', establishment)
            );
            
            const bookingsSnapshot = await getDocs(bookingsQuery);
            const bookings = [];
            
            bookingsSnapshot.forEach(doc => {
                bookings.push({ id: doc.id, ...doc.data() });
            });
            
            // Calculate sales from bookings
            return this.processSalesData(bookings);
        } catch (error) {
            console.error('Error getting sales analysis:', error);
            return {
                monthly: [],
                metrics: {
                    totalSales: 0,
                    monthlyGrowth: []
                }
            };
        }
    },

    async getBookingTrends(establishment) {
        try {
            // For Ever Lodge, use the shared service
            if (establishment === 'Ever Lodge') {
                const everLodgeData = await EverLodgeDataService.getEverLodgeData();
                
                return {
                    monthly: everLodgeData.bookingsData.monthly,
                    metrics: {
                        totalBookings: everLodgeData.bookingsData.total
                    }
                };
            }
            
            // Fetch bookings
            const bookingsRef = collection(db, 'bookings');
            const bookingsQuery = query(
                bookingsRef, 
                where('propertyDetails.name', '==', establishment)
            );
            
            const bookingsSnapshot = await getDocs(bookingsQuery);
            const bookings = [];
            
            bookingsSnapshot.forEach(doc => {
                bookings.push({ id: doc.id, ...doc.data() });
            });
            
            // Calculate booking trends
            return this.processBookingData(bookings);
        } catch (error) {
            console.error('Error getting booking trends:', error);
            return {
                monthly: [],
                metrics: {
                    totalBookings: 0
                }
            };
        }
    }
};
