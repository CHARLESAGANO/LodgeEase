import { db } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export const chartDataService = {
    async getChartData(forceRefresh = false) {
        try {
            // Get data from cache if available and not forcing refresh
            if (!forceRefresh) {
                const cachedData = this.getCachedData();
                if (cachedData) return cachedData;
            }

            const data = {
                roomTypes: await this.getRoomTypeDistribution('Ever Lodge'),
                occupancy: await this.getOccupancyTrends('Ever Lodge'),
                sales: await this.getSalesAnalysis('Ever Lodge'),
                bookings: await this.getBookingTrends('Ever Lodge')
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
            const monthlyGrowth = [];
            for (let i = 1; i < monthly.length; i++) {
                const previousMonth = monthly[i-1].sales;
                const currentMonth = monthly[i].sales;
                const growth = previousMonth > 0 
                    ? ((currentMonth - previousMonth) / previousMonth) * 100
                    : 0;
                    
                monthlyGrowth.push({
                    month: monthly[i].month,
                    growth: growth
                });
            }
            
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
            const roomsRef = collection(db, 'rooms');
            const q = query(roomsRef, where('propertyDetails.name', '==', establishment));
            const snapshot = await getDocs(q);
            const distribution = {};

            snapshot.forEach(doc => {
                const room = doc.data();
                const roomType = room.propertyDetails?.roomType || 'Standard';
                distribution[roomType] = (distribution[roomType] || 0) + 1;
            });

            return distribution;
        } catch (error) {
            console.error('Error getting room type distribution:', error);
            return {};
        }
    },

    async getOccupancyTrends(establishment) {
        try {
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
                    month,
                    occupiedRooms: 0,
                    totalRooms: roomsSnapshot.size,
                    rate: 0
                });
            }

            // Process each room's status
            roomsSnapshot.forEach(doc => {
                const room = doc.data();
                const currentMonth = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
                const monthData = monthlyOccupancy.get(currentMonth);
                
                if (monthData && room.status === 'occupied') {
                    monthData.occupiedRooms++;
                }
            });

            // Calculate rates
            monthlyOccupancy.forEach(data => {
                data.rate = (data.occupiedRooms / data.totalRooms) * 100;
            });

            const occupancyData = Array.from(monthlyOccupancy.values());
            const averageOccupancy = occupancyData.reduce((sum, data) => sum + data.rate, 0) / occupancyData.length;

            return {
                monthly: occupancyData,
                metrics: {
                    averageOccupancy: averageOccupancy || 0
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
            const bookingsRef = collection(db, 'bookings');
            let firestoreQuery;

            try {
                // Try with compound index first
                firestoreQuery = query(bookingsRef, 
                    where('propertyDetails.name', '==', establishment),
                    where('checkIn', '>=', this.startDate),
                    orderBy('checkIn', 'asc')
                );
            } catch (indexError) {
                console.warn('Index not ready, falling back to client-side filtering');
                // Fallback to simple query
                firestoreQuery = query(bookingsRef);
            }

            const snapshot = await getDocs(firestoreQuery);
            const bookings = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                // Client-side filtering if needed
                if (!firestoreQuery.filters || 
                    (data.propertyDetails?.name === establishment && 
                     data.checkIn >= this.startDate)) {
                    bookings.push({
                        id: doc.id,
                        ...data
                    });
                }
            });

            return this.processSalesData(bookings);
        } catch (error) {
            console.error('Error in getSalesAnalysis:', error);
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
            const bookingsRef = collection(db, 'bookings');
            let firestoreQuery;

            try {
                // Try with compound index first
                firestoreQuery = query(bookingsRef, 
                    where('propertyDetails.name', '==', establishment),
                    where('checkIn', '>=', this.startDate),
                    orderBy('checkIn', 'asc')
                );
            } catch (indexError) {
                console.warn('Index not ready, falling back to client-side filtering');
                // Fallback to simple query
                firestoreQuery = query(bookingsRef);
            }

            const snapshot = await getDocs(firestoreQuery);
            const bookings = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                // Client-side filtering if needed
                if (!firestoreQuery.filters || 
                    (data.propertyDetails?.name === establishment && 
                     data.checkIn >= this.startDate)) {
                    bookings.push({
                        id: doc.id,
                        ...data
                    });
                }
            });

            return this.processBookingData(bookings);
        } catch (error) {
            console.error('Error getting booking trends:', error);
            return {
                monthly: [],
                metrics: {
                    totalBookings: 0,
                    averageBookings: 0
                }
            };
        }
    }
};
