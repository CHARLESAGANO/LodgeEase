import { db } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { EverLodgeDataService } from '../shared/everLodgeDataService.js';

// Define the collection for Ever Lodge bookings
const EVER_LODGE_COLLECTION = 'everlodgebookings';

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
            
            // First try to get booking data from everlodgebookings
            const bookingsRef = collection(db, EVER_LODGE_COLLECTION);
            const bookingsQuery = query(bookingsRef);
            const snapshot = await getDocs(bookingsQuery);
            
            const distribution = {};
            
            snapshot.forEach(doc => {
                const booking = doc.data();
                const roomType = booking.propertyDetails?.roomType || 'Standard';
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
            
            return distribution;
        } catch (error) {
            console.error('Error fetching room type distribution:', error);
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
                    byRoomType: everLodgeData.occupancy.byRoomType,
                    metrics: {
                        averageOccupancy: everLodgeData.occupancy.monthly.reduce((sum, month) => sum + month.rate, 0) / 
                                         (everLodgeData.occupancy.monthly.length || 1)
                    }
                };
            }
            
            // Get bookings data
            const bookingsRef = collection(db, EVER_LODGE_COLLECTION);
            const bookingsQuery = query(bookingsRef);
            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            // Extract dates for analysis
            const now = new Date();
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            
            // Calculate occupancy
            const monthlyOccupancy = new Map();
            
            // Initialize last 6 months
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyOccupancy.set(monthYear, { month: monthYear, occupiedRooms: 0, totalRooms: 5, rate: 0 });
            }
            
            // Count occupied rooms per month
            bookingsSnapshot.forEach(doc => {
                const booking = doc.data();
                
                // Use consistent active booking statuses
                const activeStatuses = ['occupied', 'checked-in', 'confirmed', 'active', 'pending'];
                if (!activeStatuses.includes(booking.status?.toLowerCase())) return;
                
                try {
                    const checkIn = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                        
                    const checkOut = booking.checkOut instanceof Timestamp 
                        ? new Date(booking.checkOut.seconds * 1000) 
                        : new Date(booking.checkOut);
                    
                    // Only consider bookings in the last 6 months
                    if (checkIn >= sixMonthsAgo) {
                        const monthYear = checkIn.toLocaleString('default', { month: 'short', year: 'numeric' });
                        
                        if (monthlyOccupancy.has(monthYear)) {
                            const data = monthlyOccupancy.get(monthYear);
                            data.occupiedRooms += 1;
                        }
                    }
                } catch (error) {
                    console.warn('Error processing booking for occupancy:', error);
                }
            });
            
            // Calculate occupancy rates
            for (const [month, data] of monthlyOccupancy.entries()) {
                data.rate = (data.occupiedRooms / data.totalRooms) * 100;
            }
            
            // Convert to array and sort by date
            const monthly = Array.from(monthlyOccupancy.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            // Calculate average occupancy
            const averageOccupancy = monthly.reduce((sum, month) => sum + month.rate, 0) / monthly.length;
            
            // Calculate occupancy by room type
            const roomTypesOccupancy = [];
            const roomTypes = ['Standard', 'Premium Suite', 'Deluxe', 'Family'];
            
            roomTypes.forEach(type => {
                const matchingBookings = Array.from(bookingsSnapshot.docs)
                    .map(doc => doc.data())
                    .filter(booking => {
                        const activeStatuses = ['occupied', 'checked-in', 'confirmed', 'active', 'pending'];
                        return booking.propertyDetails?.roomType === type && 
                               activeStatuses.includes(booking.status?.toLowerCase());
                    });
                
                const rate = matchingBookings.length > 0 ? (matchingBookings.length / 2) * 100 : 0;
                
                roomTypesOccupancy.push({
                    roomType: type,
                    occupiedRooms: matchingBookings.length,
                    totalRooms: 2,
                    rate
                });
            });
            
            return {
                monthly,
                byRoomType: roomTypesOccupancy,
                metrics: {
                    averageOccupancy
                }
            };
        } catch (error) {
            console.error('Error fetching occupancy trends:', error);
            return {
                monthly: [],
                byRoomType: [],
                metrics: {
                    averageOccupancy: 0
                }
            };
        }
    },
    
    async getSalesAnalysis(establishment) {
        try {
            // For Ever Lodge, use the shared service
            if (establishment === 'Ever Lodge') {
                const everLodgeData = await EverLodgeDataService.getEverLodgeData();
                return {
                    monthly: everLodgeData.revenue.monthly,
                    metrics: {
                        totalSales: everLodgeData.revenue.total,
                        monthlyGrowth: this.calculateMonthlyGrowth(everLodgeData.revenue.monthly)
                    }
                };
            }
            
            // Get bookings data
            const bookingsRef = collection(db, EVER_LODGE_COLLECTION);
            const bookingsQuery = query(bookingsRef);
            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            // Extract dates for analysis
            const now = new Date();
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            
            // Calculate sales per month
            const monthlySales = new Map();
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlySales.set(monthYear, { month: monthYear, amount: 0 });
            }
            
            let totalSales = 0;
            
            // Calculate sales per month
            bookingsSnapshot.forEach(doc => {
                const booking = doc.data();
                
                // Use consistent active booking statuses
                const activeStatuses = ['occupied', 'checked-in', 'confirmed', 'active', 'pending'];
                if (!activeStatuses.includes(booking.status?.toLowerCase())) return;
                
                try {
                    const checkIn = booking.checkIn instanceof Timestamp 
                        ? new Date(booking.checkIn.seconds * 1000) 
                        : new Date(booking.checkIn);
                    
                    // Only consider bookings in the last 6 months
                    if (checkIn >= sixMonthsAgo) {
                        const monthYear = checkIn.toLocaleString('default', { month: 'short', year: 'numeric' });
                        const amount = booking.totalPrice || 0;
                        
                        totalSales += amount;
                        
                        if (monthlySales.has(monthYear)) {
                            const data = monthlySales.get(monthYear);
                            data.amount += amount;
                        }
                    }
                } catch (error) {
                    console.warn('Error processing booking for sales:', error);
                }
            });
            
            // Convert to array and sort by date
            const monthly = Array.from(monthlySales.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            // Calculate monthly growth
            const monthlyGrowth = this.calculateMonthlyGrowth(monthly);
            
            return {
                monthly,
                metrics: {
                    totalSales,
                    monthlyGrowth
                }
            };
        } catch (error) {
            console.error('Error fetching sales analysis:', error);
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
            
            // Get bookings data
            const bookingsRef = collection(db, EVER_LODGE_COLLECTION);
            const bookingsQuery = query(bookingsRef);
            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            // Extract dates for analysis
            const now = new Date();
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            
            // Calculate monthly bookings
            const monthlyBookings = new Map();
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(now.getMonth() - i);
                const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlyBookings.set(monthYear, { month: monthYear, count: 0 });
            }
            
            // Count bookings per month based on creation date
            bookingsSnapshot.forEach(doc => {
                const booking = doc.data();
                
                try {
                    const createdAt = booking.createdAt instanceof Timestamp 
                        ? new Date(booking.createdAt.seconds * 1000) 
                        : new Date(booking.createdAt);
                    
                    // Only consider bookings in the last 6 months
                    if (createdAt >= sixMonthsAgo) {
                        const monthYear = createdAt.toLocaleString('default', { month: 'short', year: 'numeric' });
                        
                        if (monthlyBookings.has(monthYear)) {
                            const data = monthlyBookings.get(monthYear);
                            data.count += 1;
                        }
                    }
                } catch (error) {
                    console.warn('Error processing booking for trends:', error);
                }
            });
            
            // Convert to array and sort by date
            const monthly = Array.from(monthlyBookings.values()).sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA - dateB;
            });
            
            // Calculate total bookings
            const totalBookings = monthly.reduce((sum, month) => sum + month.count, 0);
            
            return {
                monthly,
                metrics: {
                    totalBookings
                }
            };
        } catch (error) {
            console.error('Error fetching booking trends:', error);
            return {
                monthly: [],
                metrics: {
                    totalBookings: 0
                }
            };
        }
    }
};
