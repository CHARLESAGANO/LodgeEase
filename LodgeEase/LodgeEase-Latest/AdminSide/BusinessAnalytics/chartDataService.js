import { db } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
            const now = new Date();
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);

            const bookingsRef = collection(db, 'bookings');
            const q = query(
                bookingsRef,
                where('propertyDetails.name', '==', establishment),
                where('checkIn', '>=', Timestamp.fromDate(sixMonthsAgo))
            );

            const snapshot = await getDocs(q);
            const monthlySales = new Map();
            let totalSales = 0;
            let peakSales = 0;

            // Initialize the last 6 months
            for (let i = 0; i <= 6; i++) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                monthlySales.set(month, {
                    month,
                    amount: 0
                });
            }

            // Process bookings
            snapshot.forEach(doc => {
                const booking = doc.data();
                if (booking.checkIn && booking.status !== 'cancelled') {
                    const date = booking.checkIn.toDate();
                    const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    const amount = parseFloat(booking.totalPrice) || 0;

                    if (monthlySales.has(month)) {
                        const monthData = monthlySales.get(month);
                        monthData.amount += amount;
                        totalSales += amount;
                        peakSales = Math.max(peakSales, monthData.amount);
                    }
                }
            });

            // Calculate monthly growth
            const monthlyData = Array.from(monthlySales.values());
            const monthlyGrowth = [];

            for (let i = 1; i < monthlyData.length; i++) {
                const currentMonth = monthlyData[i].amount;
                const previousMonth = monthlyData[i - 1].amount;
                const growth = previousMonth ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;
                monthlyGrowth.push({
                    month: monthlyData[i].month,
                    growth
                });
            }

            return {
                monthly: monthlyData,
                metrics: {
                    totalSales,
                    monthlyGrowth,
                    peakSales
                }
            };
        } catch (error) {
            console.error('Error in getSalesAnalysis:', error);
            return {
                monthly: [],
                metrics: {
                    totalSales: 0,
                    monthlyGrowth: [],
                    peakSales: 0
                }
            };
        }
    },

    async getBookingTrends(establishment) {
        try {
            const now = new Date();
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);

            const bookingsRef = collection(db, 'bookings');
            const q = query(
                bookingsRef,
                where('propertyDetails.name', '==', establishment),
                where('checkIn', '>=', Timestamp.fromDate(sixMonthsAgo))
            );

            const snapshot = await getDocs(q);
            const monthlyBookings = new Map();
            let totalBookings = 0;

            snapshot.forEach(doc => {
                const booking = doc.data();
                if (booking.checkIn) {
                    const date = booking.checkIn.toDate();
                    const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });

                    if (!monthlyBookings.has(month)) {
                        monthlyBookings.set(month, {
                            month,
                            count: 0
                        });
                    }

                    monthlyBookings.get(month).count++;
                    totalBookings++;
                }
            });

            return {
                monthly: Array.from(monthlyBookings.values()),
                metrics: {
                    totalBookings
                }
            };
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
