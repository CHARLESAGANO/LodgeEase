import { db } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/9.18.0/firebase-firestore.js";

export const chartDataService = {
    async getChartData(establishment, forceRefresh = false) {
        try {
            // Get data from cache if available and not forcing refresh
            if (!forceRefresh) {
                const cachedData = this.getCachedData();
                if (cachedData) return cachedData;
            }

            const data = {
                roomTypes: await this.getRoomTypeDistribution(establishment),
                occupancy: await this.getOccupancyTrends(establishment),
                sales: await this.getSalesAnalysis(establishment),
                bookings: await this.getBookingTrends(establishment)
            };

            // Cache the data
            this.cacheData(data);
            return data;
        } catch (error) {
            console.error('Error fetching chart data:', error);
            throw error;
        }
    },

    async getRoomTypeDistribution(establishment) {
        const roomsRef = collection(db, 'rooms');
        let q = establishment !== 'all' ? 
            query(roomsRef, where('establishment', '==', establishment)) : 
            roomsRef;

        const snapshot = await getDocs(q);
        const distribution = {
            types: {},
            metrics: {
                totalRooms: 0,
                averageRate: 0,
                occupancyByType: {},
                revenueByType: {}
            }
        };

        let totalRate = 0;
        snapshot.forEach(doc => {
            const room = doc.data();
            const roomType = room.propertyDetails?.roomType || 'Standard';
            
            // Count room types
            distribution.types[roomType] = (distribution.types[roomType] || 0) + 1;
            distribution.metrics.totalRooms++;
            
            // Calculate average rate
            totalRate += room.price || 0;
            
            // Track occupancy by type
            if (room.status === 'Occupied') {
                distribution.metrics.occupancyByType[roomType] = 
                    (distribution.metrics.occupancyByType[roomType] || 0) + 1;
            }
        });

        // Calculate average rate
        distribution.metrics.averageRate = totalRate / distribution.metrics.totalRooms;

        // Calculate occupancy percentages
        Object.keys(distribution.types).forEach(type => {
            const occupied = distribution.metrics.occupancyByType[type] || 0;
            const total = distribution.types[type];
            distribution.metrics.occupancyByType[type] = (occupied / total) * 100;
        });

        return distribution;
    },

    async getOccupancyTrends(establishment) {
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);

        const bookingsRef = collection(db, 'bookings');
        let q = query(
            bookingsRef,
            where('checkIn', '>=', Timestamp.fromDate(sixMonthsAgo))
        );

        if (establishment !== 'all') {
            q = query(q, where('establishment', '==', establishment));
        }

        const snapshot = await getDocs(q);
        const monthlyOccupancy = {};
        const detailedMetrics = {
            peakOccupancy: 0,
            lowOccupancy: 100,
            averageOccupancy: 0,
            occupancyTrend: [],
            weekdayVsWeekend: {
                weekday: 0,
                weekend: 0
            }
        };

        // Get total rooms for occupancy calculation
        const roomsRef = collection(db, 'rooms');
        const roomsQuery = establishment !== 'all' ? 
            query(roomsRef, where('establishment', '==', establishment)) : 
            roomsRef;
        const roomsSnapshot = await getDocs(roomsQuery);
        const totalRooms = roomsSnapshot.size || 1; // Prevent division by zero

        // Add detailed metrics calculation
        snapshot.forEach(doc => {
            const data = doc.data();
            const checkIn = data.checkIn.toDate();
            const month = checkIn.toLocaleString('default', { month: 'short' });
            const isWeekend = checkIn.getDay() === 0 || checkIn.getDay() === 6;

            // Update occupancy metrics
            if (!monthlyOccupancy[month]) {
                monthlyOccupancy[month] = {
                    occupied: 0,
                    total: totalRooms,
                    revenue: 0,
                    bookings: 0
                };
            }

            if (data.status === 'Confirmed') {
                monthlyOccupancy[month].occupied++;
                monthlyOccupancy[month].revenue += data.totalPrice || 0;
                monthlyOccupancy[month].bookings++;

                // Update weekday/weekend metrics
                if (isWeekend) {
                    detailedMetrics.weekdayVsWeekend.weekend++;
                } else {
                    detailedMetrics.weekdayVsWeekend.weekday++;
                }
            }
        });

        // Calculate additional metrics
        Object.entries(monthlyOccupancy).forEach(([month, data]) => {
            const rate = (data.occupied / data.total) * 100;
            detailedMetrics.peakOccupancy = Math.max(detailedMetrics.peakOccupancy, rate);
            detailedMetrics.lowOccupancy = Math.min(detailedMetrics.lowOccupancy, rate);
            detailedMetrics.occupancyTrend.push({ month, rate });
        });

        detailedMetrics.averageOccupancy = 
            detailedMetrics.occupancyTrend.reduce((sum, { rate }) => sum + rate, 0) / 
            detailedMetrics.occupancyTrend.length;

        return {
            monthly: Object.entries(monthlyOccupancy).map(([month, data]) => ({
                month,
                rate: (data.occupied / data.total) * 100,
                revenue: data.revenue,
                bookings: data.bookings
            })),
            metrics: detailedMetrics
        };
    },

    async getSalesAnalysis(establishment) {
        try {
            const bookings = await this.fetchBookings(establishment);
            const monthlySales = {};
            const salesMetrics = {
                totalSales: 0,
                monthlyGrowth: 0,
                peakSales: 0,
                salesByRoomType: {},
                yearOverYearGrowth: 0
            };

            // Enhanced sales calculations
            bookings.forEach(booking => {
                const date = new Date(booking.checkIn);
                const month = date.toISOString().slice(0, 7);
                const amount = parseFloat(booking.totalPrice) || 0;
                const roomType = booking.roomType;

                monthlySales[month] = (monthlySales[month] || 0) + amount;
                salesMetrics.totalSales += amount;
                salesMetrics.peakSales = Math.max(salesMetrics.peakSales, amount);
                salesMetrics.salesByRoomType[roomType] = 
                    (salesMetrics.salesByRoomType[roomType] || 0) + amount;
            });

            // Calculate growth metrics
            const sortedMonths = Object.entries(monthlySales)
                .sort(([a], [b]) => a.localeCompare(b));

            if (sortedMonths.length >= 2) {
                const lastMonth = sortedMonths[sortedMonths.length - 1][1];
                const previousMonth = sortedMonths[sortedMonths.length - 2][1];
                salesMetrics.monthlyGrowth.push({
                    month: sortedMonths[sortedMonths.length - 1][0],
                    growth: ((lastMonth - previousMonth) / previousMonth) * 100
                });
            }
            
            return salesMetrics;
        } catch (error) {
            console.error('Error in getSalesAnalysis:', error);
            throw error;
        }
    },

    async getBookingTrends(establishment) {
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);

        const bookingsRef = collection(db, 'bookings');
        let q = query(
            bookingsRef,
            where('checkIn', '>=', Timestamp.fromDate(sixMonthsAgo))
        );

        if (establishment !== 'all') {
            q = query(q, where('establishment', '==', establishment));
        }

        const snapshot = await getDocs(q);
        const monthlyBookings = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const month = new Date(data.checkIn.toDate()).toLocaleString('default', { month: 'short' });
            if (data.status === 'Confirmed') {
                monthlyBookings[month] = (monthlyBookings[month] || 0) + 1;
            }
        });

        return Object.entries(monthlyBookings)
            .map(([month, count]) => ({
                month,
                count
            }))
            .sort((a, b) => {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return months.indexOf(a.month) - months.indexOf(b.month);
            });
    },

    cacheData(data) {
        localStorage.setItem('chartData', JSON.stringify({
            data,
            timestamp: new Date().getTime()
        }));
    },

    getCachedData() {
        const cached = localStorage.getItem('chartData');
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const now = new Date().getTime();
        
        // Cache expires after 5 minutes
        if (now - timestamp > 5 * 60 * 1000) {
            localStorage.removeItem('chartData');
            return null;
        }

        return data;
    }
};
