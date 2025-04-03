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
            let query;

            try {
                // Try with compound index first
                query = query(bookingsRef, 
                    where('propertyDetails.name', '==', establishment),
                    where('checkIn', '>=', this.startDate),
                    orderBy('checkIn', 'asc')
                );
            } catch (indexError) {
                console.warn('Index not ready, falling back to client-side filtering');
                // Fallback to simple query
                query = query(bookingsRef);
            }

            const snapshot = await getDocs(query);
            const bookings = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                // Client-side filtering if needed
                if (!query.filters || 
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
            let query;

            try {
                // Try with compound index first
                query = query(bookingsRef, 
                    where('propertyDetails.name', '==', establishment),
                    where('checkIn', '>=', this.startDate),
                    orderBy('checkIn', 'asc')
                );
            } catch (indexError) {
                console.warn('Index not ready, falling back to client-side filtering');
                // Fallback to simple query
                query = query(bookingsRef);
            }

            const snapshot = await getDocs(query);
            const bookings = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                // Client-side filtering if needed
                if (!query.filters || 
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
