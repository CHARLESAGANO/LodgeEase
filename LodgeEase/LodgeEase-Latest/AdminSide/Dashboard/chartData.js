import { db } from '../firebase.js';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Format currency in PHP
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(amount);
};

// Enhanced helper function for date parsing to handle ALL possible formats
function parseDate(dateField) {
    if (!dateField) return null;
    
    try {
        // Handle Firestore Timestamp objects
        if (dateField && typeof dateField.toDate === 'function') {
            return dateField.toDate();
        }
        
        // Handle Date objects
        if (dateField instanceof Date) {
            return isNaN(dateField.getTime()) ? null : dateField;
        }
        
        // Handle string dates
        if (typeof dateField === 'string') {
            const parsedDate = new Date(dateField);
            return isNaN(parsedDate.getTime()) ? null : parsedDate;
        }
        
        // Handle timestamp objects with seconds and nanoseconds
        if (typeof dateField === 'object' && dateField.seconds) {
            return new Date(dateField.seconds * 1000);
        }
        
        // Handle numeric timestamps (milliseconds since epoch)
        if (typeof dateField === 'number') {
            return new Date(dateField);
        }
    } catch (error) {
        console.error('Error parsing date:', error, dateField);
    }
    
    return null;
}

// Formatting functions - keep these together and remove duplicates
function getDefaultDataset() {
    return {
        labels: [],
        datasets: {
            monthly: [],
            roomType: [],
            payment: [],
            weekday: []
        }
    };
}

function formatRevenueData(bookings) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = new Array(12).fill(0);

    console.log(`Processing ${bookings.length} bookings for revenue data`);

    bookings.forEach(booking => {
        const checkInDate = parseDate(booking.checkIn);
        if (checkInDate) {
            const monthIndex = checkInDate.getMonth();
            const price = parseFloat(booking.totalPrice) || 0;
            
            console.log(`Adding booking revenue: Month=${monthIndex}, Price=${price}`);
            monthlyRevenue[monthIndex] += price;
        }
    });

    console.log('Monthly revenue data:', monthlyRevenue);
    return {
        labels: months,
        monthly: monthlyRevenue
    };
}

function formatOccupancyData(bookings) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const totalRooms = 36;
    const monthlyBookingCounts = new Array(12).fill(0);
    
    // Count bookings by month
    bookings.forEach(booking => {
        const checkInDate = parseDate(booking.checkIn);
        if (checkInDate) {
            const monthIndex = checkInDate.getMonth();
            monthlyBookingCounts[monthIndex]++;
        }
    });
    
    // Calculate daily occupancy rates (approximate)
    // Assuming average stay duration of 2 days to calculate overlap
    const occupancyRates = monthlyBookingCounts.map(bookingCount => {
        // Days in month (approximated)
        const daysInMonth = 30;
        // Estimate occupied room-days based on booking count and average stay
        const occupiedRoomDays = bookingCount * 2; // assuming 2-day average stay
        // Calculate occupancy as percentage of total possible room-days
        const occupancyRate = (occupiedRoomDays / (totalRooms * daysInMonth)) * 100;
        // Ensure rate is reasonable and not over 100%
        return Math.min(100, occupancyRate).toFixed(1);
    });

    return {
        labels: months,
        rates: occupancyRates
    };
}

function formatRoomTypeData(bookings) {
    const roomTypeCounts = {};
    
    bookings.forEach(booking => {
        // Extract room type from booking, defaulting to 'Standard' if not found
        let roomType = 'Standard';
        
        if (booking.propertyDetails && booking.propertyDetails.roomType) {
            roomType = booking.propertyDetails.roomType;
        } else if (booking.roomType) {
            roomType = booking.roomType;
        }
        
        roomTypeCounts[roomType] = (roomTypeCounts[roomType] || 0) + 1;
    });
    
    // Ensure we have at least one room type
    if (Object.keys(roomTypeCounts).length === 0) {
        roomTypeCounts['Standard'] = 0;
    }

    console.log('Room type distribution:', roomTypeCounts);
    
    return {
        labels: Object.keys(roomTypeCounts),
        data: Object.values(roomTypeCounts)
    };
}

function formatBookingTrends(bookings) {
    const last30Days = Array(30).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    bookings.forEach(booking => {
        const bookingDate = parseDate(booking.checkIn);
        if (bookingDate) {
            const bookingDay = new Date(bookingDate);
            bookingDay.setHours(0, 0, 0, 0);
            
            const daysAgo = Math.floor((today - bookingDay) / (1000 * 60 * 60 * 24));
            if (daysAgo >= 0 && daysAgo < 30) {
                last30Days[29 - daysAgo]++;
            }
        }
    });

    const labels = Array.from({length: 30}, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
        labels,
        data: last30Days
    };
}

export async function getChartData() {
    try {
        console.log('Fetching bookings data for charts from everlodgebookings collection');
        const bookingsRef = collection(db, 'everlodgebookings');
        const q = query(bookingsRef);
        const querySnapshot = await getDocs(q);
        
        console.log(`Found ${querySnapshot.size} booking documents`);
        
        const bookings = querySnapshot.docs.map(doc => {
            const data = doc.data();
            // Add processing to ensure we have the expected fields
            return {
                id: doc.id,
                ...data,
                checkIn: data.checkIn,
                checkOut: data.checkOut,
                totalPrice: data.totalPrice || data.totalAmount || 0,
                status: data.status || 'pending',
                roomType: data.roomType || data.propertyDetails?.roomType || 'Standard',
                propertyDetails: data.propertyDetails || {
                    roomType: data.roomType || 'Standard',
                    name: data.lodgeName || 'Ever Lodge'
                }
            };
        });

        console.log('Processing bookings for chart data');
        
        // Filter out invalid bookings, but be permissive about status
        const validBookings = bookings.filter(booking => {
            const hasCheckIn = booking.checkIn != null;
            const hasPrice = parseFloat(booking.totalPrice) > 0;
            // Don't filter strictly by status to ensure we have some data
            return hasCheckIn && hasPrice;
        });

        console.log(`Valid bookings for processing: ${validBookings.length}`);
        
        if (validBookings.length === 0) {
            console.warn('No valid bookings found, using default dataset');
            return getDefaultDataset();
        }

        // Format data for charts
        const revenueData = formatRevenueData(validBookings);
        const occupancyData = formatOccupancyData(validBookings);
        const roomTypeData = formatRoomTypeData(validBookings);
        const bookingTrends = formatBookingTrends(validBookings);

        console.log('Chart data processed successfully');

        return {
            revenue: {
                labels: revenueData.labels,
                datasets: [{
                    label: 'Monthly Revenue',
                    data: revenueData.monthly,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true
                }]
            },
            occupancy: {
                labels: occupancyData.labels,
                datasets: [{
                    label: 'Occupancy Rate',
                    data: occupancyData.rates,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true
                }]
            },
            roomType: {
                labels: roomTypeData.labels,
                datasets: [{
                    label: 'Bookings by Room Type',
                    data: roomTypeData.data,
                    backgroundColor: generateColors(roomTypeData.labels.length)
                }]
            },
            bookingTrends: {
                labels: bookingTrends.labels,
                datasets: [{
                    label: 'Daily Bookings',
                    data: bookingTrends.data,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    fill: true
                }]
            }
        };
    } catch (error) {
        console.error('Error getting chart data:', error);
        return getDefaultDataset();
    }
}

// Helper function to generate forecast data
function generateRevenueForecast(monthlyData, growth) {
    const alpha = 0.3; // smoothing factor
    const forecastMonths = 3;
    const forecast = [];
    
    let lastValue = monthlyData[monthlyData.length - 1];
    for (let i = 0; i < forecastMonths; i++) {
        lastValue = lastValue * (1 + (growth / 100));
        forecast.push(Math.round(lastValue));
    }
    
    return forecast;
}

function generateOccupancyForecast(monthlyData, currentOccupancy) {
    const forecastMonths = 3;
    const forecast = [];
    
    // Calculate trend from last 3 months
    const recentMonths = monthlyData.slice(-3);
    const trend = recentMonths[2] - recentMonths[0];
    const trendFactor = trend / 2; // Dampen the trend
    
    let lastValue = currentOccupancy;
    for (let i = 0; i < forecastMonths; i++) {
        lastValue = Math.min(100, Math.max(0, lastValue + trendFactor));
        forecast.push(lastValue);
    }
    
    return forecast;
}

// Helper function to generate chart colors
function generateColors(count) {
    const baseColors = [
        'rgba(54, 162, 235, 0.8)',   // blue
        'rgba(255, 99, 132, 0.8)',   // red
        'rgba(255, 206, 86, 0.8)',   // yellow
        'rgba(75, 192, 192, 0.8)',   // green
        'rgba(153, 102, 255, 0.8)',  // purple
        'rgba(255, 159, 64, 0.8)'    // orange
    ];
    
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

// Rest of the calculation functions
function calculateAreaDistribution(lodgesData) {
    const areas = {
        'Session Road Area': {
            subAreas: ['Upper Session', 'Lower Session', 'Leonard Wood'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Mines View': {
            subAreas: ['Mines View Proper', 'Gibraltar', 'Temple Drive'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Burnham Park': {
            subAreas: ['Harrison Road', 'Magsaysay Avenue', 'Lake Drive'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Camp John Hay': {
            subAreas: ['Country Club', 'Manor', 'Scout Hill'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Teachers Camp': {
            subAreas: ['Teachers Camp Proper', 'South Drive', 'Military Circle'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Upper General Luna': {
            subAreas: ['General Luna Road', 'Assumption Road', 'Cabinet Hill'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Military Cut-off': {
            subAreas: ['Cut-off Road', 'Santo Tomas', 'Loakan Road'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Legarda Road': {
            subAreas: ['Upper Legarda', 'Lower Legarda', 'City Hall Area'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        },
        'Baguio City Market': {
            subAreas: ['Public Market', 'Maharlika', 'Kayang Street'],
            priceRange: { min: 0, max: 0 },
            density: 0,
            types: new Map()
        }
    };

    // Process lodge data
    lodgesData.forEach(lodge => {
        const area = lodge.area?.trim();
        if (areas[area]) {
            // Update lodge count
            areas[area].density++;
            
            // Update price ranges
            const price = parseFloat(lodge.basePrice) || 0;
            if (price > 0) {
                if (areas[area].priceRange.min === 0 || price < areas[area].priceRange.min) {
                    areas[area].priceRange.min = price;
                }
                if (price > areas[area].priceRange.max) {
                    areas[area].priceRange.max = price;
                }
            }

            // Track lodge types
            const type = lodge.type || 'Unspecified';
            areas[area].types.set(type, (areas[area].types.get(type) || 0) + 1);
        }
    });

    // Calculate density percentages
    const totalLodges = Object.values(areas).reduce((sum, area) => sum + area.density, 0);
    Object.values(areas).forEach(area => {
        area.densityPercentage = ((area.density / totalLodges) * 100).toFixed(1);
    });

    // Prepare chart data
    return {
        labels: Object.keys(areas),
        datasets: [{
            label: 'Lodge Density',
            data: Object.values(areas).map(area => area.density),
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2
        }, {
            label: 'Average Price Range',
            data: Object.values(areas).map(area => 
                area.priceRange.max > 0 ? 
                (area.priceRange.min + area.priceRange.max) / 2 : 0
            ),
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2
        }],
        metadata: Object.entries(areas).reduce((acc, [areaName, data]) => {
            acc[areaName] = {
                subAreas: data.subAreas,
                priceRange: {
                    min: formatCurrency(data.priceRange.min),
                    max: formatCurrency(data.priceRange.max)
                },
                density: data.density,
                densityPercentage: data.densityPercentage,
                types: Object.fromEntries(data.types)
            };
            return acc;
        }, {})
    };
}

function calculateRevenueData(months, bookings, payments) {
    const revenueData = {
        monthly: new Array(12).fill(0),
        byRoomType: {},
        byPaymentMethod: {},
        growth: new Array(12).fill(0),
        forecast: new Array(3).fill(0),
        metrics: {
            totalRevenue: 0,
            averageRevenue: 0,
            peakMonth: '',
            lowestMonth: '',
            yearOverYearGrowth: 0
        }
    };
    
    const currentDate = new Date();
    const bookingPayments = new Map();
    
    // Map payments to bookings
    payments.forEach(payment => {
        if (payment.bookingId && payment.amount) {
            const existing = bookingPayments.get(payment.bookingId) || { 
                total: 0, 
                methods: {}
            };
            existing.total += parseFloat(payment.amount);
            existing.methods[payment.method] = (existing.methods[payment.method] || 0) + parseFloat(payment.amount);
            bookingPayments.set(payment.bookingId, existing);
        }
    });
    
    // Process bookings for revenue data
    bookings.forEach(booking => {
        if (booking.status === 'completed' && booking.checkOut) {
            const checkOutDate = parseDate(booking.checkOut);
            if (!checkOutDate) return;
            
            const monthDiff = (currentDate.getMonth() + 12 * currentDate.getFullYear()) - 
                            (checkOutDate.getMonth() + 12 * checkOutDate.getFullYear());
            
            if (monthDiff >= 0 && monthDiff < 12) {
                const payment = bookingPayments.get(booking.id);
                const revenue = payment?.total || parseFloat(booking.totalAmount) || 0;
                const monthIndex = 11 - monthDiff;
                
                // Monthly revenue
                revenueData.monthly[monthIndex] += revenue;
                
                // Revenue by room type
                if (booking.roomType) {
                    revenueData.byRoomType[booking.roomType] = 
                        (revenueData.byRoomType[booking.roomType] || 0) + revenue;
                }
                
                // Revenue by payment method
                if (payment?.methods) {
                    Object.entries(payment.methods).forEach(([method, amount]) => {
                        revenueData.byPaymentMethod[method] = 
                            (revenueData.byPaymentMethod[method] || 0) + amount;
                    });
                }
            }
        }
    });
    
    // Calculate growth rates
    for (let i = 1; i < 12; i++) {
        const previousMonth = revenueData.monthly[i - 1] || 1;
        revenueData.growth[i] = ((revenueData.monthly[i] - previousMonth) / previousMonth) * 100;
    }
    
    // Calculate forecast using exponential smoothing
    const alpha = 0.3;
    let forecast = revenueData.monthly[11];
    for (let i = 0; i < 3; i++) {
        forecast = alpha * revenueData.monthly[11] + (1 - alpha) * forecast;
        revenueData.forecast[i] = forecast;
    }
    
    // Calculate metrics
    const nonZeroMonths = revenueData.monthly.filter(x => x > 0);
    revenueData.metrics = {
        totalRevenue: revenueData.monthly.reduce((a, b) => a + b, 0),
        averageRevenue: nonZeroMonths.reduce((a, b) => a + b, 0) / nonZeroMonths.length,
        peakMonth: months[revenueData.monthly.indexOf(Math.max(...revenueData.monthly))],
        lowestMonth: months[revenueData.monthly.indexOf(Math.min(...nonZeroMonths))],
        yearOverYearGrowth: calculateYearOverYearGrowth(revenueData.monthly)
    };
    
    return revenueData;
}

function calculateOccupancyData(months, bookings, rooms) {
    const occupancyData = {
        monthly: new Array(12).fill(0),
        byRoomType: {},
        byWeekday: new Array(7).fill(0),
        forecast: new Array(3).fill(0),
        metrics: {
            averageOccupancy: 0,
            peakOccupancy: 0,
            lowOccupancy: 100,
            stabilityIndex: 0
        }
    };
    
    const currentDate = new Date();
    const totalRooms = rooms.length || 1;
    const dailyOccupancy = new Map();
    const roomTypeOccupancy = new Map();
    
    // Calculate daily occupancy
    bookings.forEach(booking => {
        if (booking.status !== 'cancelled' && booking.checkIn && booking.checkOut && booking.roomId) {
            const checkIn = parseDate(booking.checkIn);
            const checkOut = parseDate(booking.checkOut);
            if (!checkIn || !checkOut) return;
            
            const currentDay = new Date(checkIn);
            while (currentDay < checkOut) {
                const dateKey = currentDay.toISOString().split('T')[0];
                const occupied = dailyOccupancy.get(dateKey) || new Set();
                occupied.add(booking.roomId);
                dailyOccupancy.set(dateKey, occupied);
                
                // Track room type occupancy
                if (booking.roomType) {
                    const roomTypeKey = `${dateKey}-${booking.roomType}`;
                    roomTypeOccupancy.set(roomTypeKey, 
                        (roomTypeOccupancy.get(roomTypeKey) || 0) + 1);
                }
                
                // Track weekday occupancy
                occupancyData.byWeekday[currentDay.getDay()] += 1;
                
                currentDay.setDate(currentDay.getDate() + 1);
            }
        }
    });
    
    // Calculate monthly averages
    const monthlyOccupancyDays = new Map();
    dailyOccupancy.forEach((occupied, dateStr) => {
        const date = new Date(dateStr);
        const monthDiff = (currentDate.getMonth() + 12 * currentDate.getFullYear()) - 
                         (date.getMonth() + 12 * date.getFullYear());
        
        if (monthDiff >= 0 && monthDiff < 12) {
            const monthIndex = 11 - monthDiff;
            const rate = (occupied.size / totalRooms) * 100;
            
            occupancyData.monthly[monthIndex] = 
                (occupancyData.monthly[monthIndex] || 0) + rate;
            monthlyOccupancyDays.set(monthIndex, 
                (monthlyOccupancyDays.get(monthIndex) || 0) + 1);
            
            // Update metrics
            occupancyData.metrics.peakOccupancy = Math.max(occupancyData.metrics.peakOccupancy, rate);
            occupancyData.metrics.lowOccupancy = Math.min(occupancyData.metrics.lowOccupancy, rate);
        }
    });
    
    // Calculate room type occupancy rates
    rooms.forEach(room => {
        if (room.type) {
            const totalTypeRooms = rooms.filter(r => r.type === room.type).length;
            const typeOccupancy = Array.from(roomTypeOccupancy.entries())
                .filter(([key]) => key.includes(room.type))
                .reduce((sum, [, count]) => sum + count, 0);
            
            occupancyData.byRoomType[room.type] = 
                (typeOccupancy / (totalTypeRooms * 365)) * 100;
        }
    });
    
    // Calculate averages and forecast
    occupancyData.monthly = occupancyData.monthly.map((total, index) => {
        const days = monthlyOccupancyDays.get(index) || 1;
        return Math.min(100, Math.round(total / days));
    });
    
    // Calculate forecast using weighted moving average
    const weights = [0.5, 0.3, 0.2];
    const lastThreeMonths = occupancyData.monthly.slice(-3);
    const forecast = weights.reduce((sum, weight, i) => 
        sum + (lastThreeMonths[i] || 0) * weight, 0);
    
    occupancyData.forecast = new Array(3).fill(forecast);
    
    // Calculate stability index (standard deviation of occupancy rates)
    const average = occupancyData.monthly.reduce((a, b) => a + b, 0) / 12;
    const variance = occupancyData.monthly.reduce((sum, rate) => 
        sum + Math.pow(rate - average, 2), 0) / 12;
    
    occupancyData.metrics.averageOccupancy = average;
    occupancyData.metrics.stabilityIndex = 100 - (Math.sqrt(variance) / average * 100);
    
    return occupancyData;
}

function calculateRoomTypeData(bookings, rooms) {
    const roomTypes = {};
    const revenue = {};
    
    // First, get all available room types from rooms collection
    rooms.forEach(room => {
        if (room.type || room.roomType) {
            const type = room.type || room.roomType;
            roomTypes[type] = (roomTypes[type] || 0) + 1;
            revenue[type] = 0;
        }
    });

    // Then calculate bookings and revenue for each type
    bookings.forEach(booking => {
        const type = booking.propertyDetails?.roomType || booking.roomType;
        if (type && booking.totalAmount) {
            revenue[type] = (revenue[type] || 0) + parseFloat(booking.totalAmount);
        }
    });

    return {
        labels: Object.keys(roomTypes),
        datasets: [{
            data: Object.values(roomTypes),
            backgroundColor: [
                'rgba(255, 99, 132, 0.8)',
                'rgba(54, 162, 235, 0.8)',
                'rgba(255, 206, 86, 0.8)',
                'rgba(75, 192, 192, 0.8)',
                'rgba(153, 102, 255, 0.8)'
            ],
            revenue: Object.values(revenue)
        }]
    };
}

function calculateBookingTrends(months, bookings) {
    const monthlyBookings = new Array(12).fill(0);
    const predictedBookings = new Array(12).fill(0);
    const industryAverage = new Array(12).fill(0);
    const currentDate = new Date();
    
    // Calculate current month's index (0-11)
    const currentMonthIndex = currentDate.getMonth();
    
    // Calculate actual bookings starting from current month
    bookings.forEach(booking => {
        const bookingDate = parseDate(booking.checkIn);
        if (bookingDate) {
            const monthDiff = (bookingDate.getMonth() + 12 * bookingDate.getFullYear()) -
                            (currentMonthIndex + 12 * currentDate.getFullYear());
            if (monthDiff >= -6 && monthDiff <= 5) { // -6 to 5 gives us last 6 months and next 6 months
                const arrayIndex = monthDiff + 6; // Shift index to 0-11 range
                monthlyBookings[arrayIndex]++;
            }
        }
    });

    // Calculate predicted bookings
    const seasonalFactors = calculateSeasonalFactors(bookings);
    for (let i = 0; i < 12; i++) {
        const monthIndex = (currentMonthIndex + i - 6) % 12; // Adjust to get proper month index
        const trend = calculateTrendValue(monthlyBookings);
        const seasonal = seasonalFactors[monthIndex >= 0 ? monthIndex : monthIndex + 12] || 1;
        
        if (i < 6) { // Historical data (past 6 months)
            predictedBookings[i] = monthlyBookings[i];
        } else { // Future predictions (next 6 months)
            const baseValue = trend * seasonal;
            predictedBookings[i] = Math.round(baseValue * (1 + (Math.random() * 0.2 - 0.1)));
        }
        
        // Simulate industry average
        industryAverage[i] = Math.round(predictedBookings[i] * (1 + (Math.random() * 0.3 - 0.15)));
    }

    // Generate labels starting from 6 months ago to 5 months ahead
    const monthLabels = [];
    for (let i = -6; i <= 5; i++) {
        const labelDate = new Date(currentDate.getFullYear(), currentMonthIndex + i, 1);
        monthLabels.push(labelDate.toLocaleString('default', { month: 'short', year: '2-digit' }));
    }

    return {
        labels: monthLabels,
        datasets: [{
            label: 'Actual Bookings',
            data: monthlyBookings,
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            fill: true
        }, {
            label: 'Predicted Bookings',
            data: predictedBookings,
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: true
        }, {
            label: 'Industry Average',
            data: industryAverage,
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1,
            borderDash: [3, 3],
            fill: false
        }]
    };
}

// Helper function to calculate seasonal factors
function calculateSeasonalFactors(bookings) {
    const monthlyTotals = new Array(12).fill(0);
    const monthlyCount = new Array(12).fill(0);

    bookings.forEach(booking => {
        const date = parseDate(booking.checkIn);
        if (date) {
            const month = date.getMonth();
            monthlyTotals[month]++;
            monthlyCount[month]++;
        }
    });

    const average = monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.filter(x => x > 0).length;
    return monthlyTotals.map((total, index) => 
        monthlyCount[index] ? total / monthlyCount[index] / average : 1
    );
}

// Helper function to calculate trend value
function calculateTrendValue(data) {
    const validData = data.filter(x => x > 0);
    if (validData.length === 0) return 0;
    
    const sum = validData.reduce((a, b) => a + b, 0);
    const avg = sum / validData.length;
    
    // Calculate trend based on recent values
    const recentValues = validData.slice(-3);
    const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    
    return (avg + recentAvg) / 2;
}

function calculateMetrics(bookings, payments, rooms) {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Filter current month's data
    const currentMonthBookings = bookings.filter(booking => {
        const bookingDate = parseDate(booking.checkIn);
        return bookingDate.getMonth() === currentMonth && 
               bookingDate.getFullYear() === currentYear;
    });

    const currentMonthPayments = payments.filter(payment => {
        const paymentDate = payment.timestamp.toDate();
        return paymentDate.getMonth() === currentMonth && 
               paymentDate.getFullYear() === currentYear;
    });

    // Calculate metrics
    const totalRevenue = currentMonthPayments.reduce((sum, payment) => 
        sum + (parseFloat(payment.amount) || 0), 0);
    
    const averageStayDuration = currentMonthBookings.reduce((sum, booking) => {
        if (booking.checkIn && booking.checkOut) {
            const duration = (parseDate(booking.checkOut) - parseDate(booking.checkIn)) / 
                           (1000 * 60 * 60 * 24);
            return sum + duration;
        }
        return sum;
    }, 0) / currentMonthBookings.length || 0;

    return {
        currentMonthRevenue: formatCurrency(totalRevenue),
        averageStayDuration: averageStayDuration.toFixed(1) + ' days',
        totalBookings: currentMonthBookings.length,
        occupancyRate: ((calculateOccupiedRooms(bookings) / rooms.length) * 100).toFixed(1) + '%'
    };
}

// Helper functions
function calculateTodayCheckIns(bookings) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return bookings.filter(booking => {
        const checkIn = parseDate(booking.checkIn);
        if (!checkIn) return false;
        
        checkIn.setHours(0, 0, 0, 0);
        return checkIn.getTime() === today.getTime() && 
               (booking.status === 'pending' || booking.status === 'confirmed');
    }).length;
}

function calculateAvailableRooms(bookings, rooms) {
    const totalRooms = rooms.length;
    const unavailableRooms = bookings.filter(booking => 
        booking.status === 'occupied' || booking.status === 'checked-in'
    ).length;
    const maintenanceRooms = rooms.filter(room => room.status === 'maintenance').length;
    
    return totalRooms - unavailableRooms - maintenanceRooms;
}

function calculateOccupiedRooms(bookings) {
    return bookings.filter(booking => 
        booking.status === 'occupied' || booking.status === 'checked-in'
    ).length;
}

function calculateSeasonalEvents(bookings) {
    const events = {
        'Panagbenga Festival': { 
            month: 1, 
            duration: 30,
            description: 'Annual flower festival',
            expectedOccupancy: 90
        },
        'Christmas Season': { 
            month: 11, 
            duration: 45,
            description: 'Holiday peak season',
            expectedOccupancy: 85
        },
        'Summer Break': { 
            month: 3, 
            duration: 90,
            description: 'Summer vacation period',
            expectedOccupancy: 75
        },
        'Holy Week': { 
            month: 3, 
            duration: 7,
            description: 'Easter holiday period',
            expectedOccupancy: 80
        },
        'New Year': { 
            month: 0, 
            duration: 15,
            description: 'New Year celebrations',
            expectedOccupancy: 85
        }
    };

    const eventStats = {};
    Object.keys(events).forEach(event => {
        const eventBookings = bookings.filter(booking => {
            const date = parseDate(booking.checkIn);
            return isDateInEvent(date, events[event]);
        });

        const averageRate = calculateAverageRate(eventBookings);
        const occupancyIncrease = calculateOccupancyIncrease(bookings, eventBookings, events[event]);

        eventStats[event] = {
            totalBookings: eventBookings.length,
            averageRate: formatCurrency(averageRate),
            occupancyIncrease: occupancyIncrease.toFixed(1) + '%',
            expectedOccupancy: events[event].expectedOccupancy + '%',
            description: events[event].description,
            duration: events[event].duration + ' days',
            performance: (occupancyIncrease >= 0 ? 'Positive' : 'Negative'),
            revenueImpact: calculateRevenueImpact(eventBookings, averageRate)
        };
    });

    return eventStats;
}

function calculateAmenitiesAnalysis(lodges) {
    const amenities = {
        wifi: { count: 0, rating: 0 },
        parking: { count: 0, rating: 0 },
        aircon: { count: 0, rating: 0 },
        kitchen: { count: 0, rating: 0 },
        tv: { count: 0, rating: 0 },
        security: { count: 0, rating: 0 },
        housekeeping: { count: 0, rating: 0 }
    };

    lodges.forEach(lodge => {
        Object.keys(amenities).forEach(amenity => {
            if (lodge.amenities?.[amenity]) {
                amenities[amenity].count++;
                amenities[amenity].rating += (lodge.amenityRatings?.[amenity] || 0);
            }
        });
    });

    // Calculate averages and percentages
    const totalLodges = lodges.length;
    Object.keys(amenities).forEach(amenity => {
        amenities[amenity].percentage = (amenities[amenity].count / totalLodges) * 100;
        amenities[amenity].averageRating = amenities[amenity].count > 0 ? 
            amenities[amenity].rating / amenities[amenity].count : 0;
    });

    return amenities;
}

function calculatePriceTrends(bookings, rooms) {
    const trends = {
        monthly: new Array(12).fill(0).map(() => ({ total: 0, count: 0 })),
        roomTypes: {},
        seasonalAdjustments: {},
        priceRanges: {
            economy: { min: Infinity, max: 0, count: 0 },
            standard: { min: Infinity, max: 0, count: 0 },
            premium: { min: Infinity, max: 0, count: 0 }
        }
    };

    bookings.forEach(booking => {
        const date = parseDate(booking.checkIn);
        if (date && booking.totalAmount) {
            const month = date.getMonth();
            const amount = parseFloat(booking.totalAmount);
            
            // Monthly trends
            trends.monthly[month].total += amount;
            trends.monthly[month].count++;

            // Room type trends
            if (booking.roomType) {
                if (!trends.roomTypes[booking.roomType]) {
                    trends.roomTypes[booking.roomType] = { total: 0, count: 0 };
                }
                trends.roomTypes[booking.roomType].total += amount;
                trends.roomTypes[booking.roomType].count++;
            }

            // Price range categorization
            categorizePriceRange(trends.priceRanges, amount);
        }
    });

    return trends;
}

function calculateGuestDemographics(guests) {
    return {
        ageGroups: calculateAgeDistribution(guests),
        purposeOfStay: aggregatePurposeOfStay(guests),
        repeatBookings: calculateRepeatBookings(guests),
        averageGroupSize: calculateAverageGroupSize(guests),
        locationOrigin: aggregateGuestOrigins(guests)
    };
}

function calculateCheckInDistribution(bookings) {
    const hourlyDistribution = new Array(24).fill(0);
    const weekdayDistribution = new Array(7).fill(0);

    bookings.forEach(booking => {
        const checkIn = parseDate(booking.checkIn);
        if (checkIn) {
            hourlyDistribution[checkIn.getHours()]++;
            weekdayDistribution[checkIn.getDay()]++;
        }
    });

    return {
        hourly: hourlyDistribution,
        weekday: weekdayDistribution,
        peakHours: findPeakHours(hourlyDistribution),
        preferredDays: findPreferredDays(weekdayDistribution)
    };
}

// Add these helper functions before calculateSeasonalEvents function:

function calculateAverageRate(bookings) {
    if (!bookings || bookings.length === 0) return 0;
    
    const totalAmount = bookings.reduce((sum, booking) => {
        const amount = parseFloat(booking.totalAmount) || 0;
        const duration = calculateDuration(booking.checkIn, booking.checkOut);
        return sum + (amount / (duration || 1));
    }, 0);
    
    return totalAmount / bookings.length;
}

function calculateOccupancyIncrease(allBookings, eventBookings, eventPeriod) {
    // Calculate normal occupancy rate
    const normalOccupancy = calculateAverageOccupancy(allBookings, 36);
    
    // Calculate event period occupancy rate
    const eventOccupancy = calculateAverageOccupancy(eventBookings, 36);
    
    // Calculate percentage increase
    if (normalOccupancy === 0) return 0;
    return ((eventOccupancy - normalOccupancy) / normalOccupancy) * 100;
}

function calculateAverageOccupancy(bookings, totalRooms = 36) {
    if (!bookings || bookings.length === 0) return 0;
    
    const occupancyByDay = new Map();
    
    bookings.forEach(booking => {
        const checkIn = parseDate(booking.checkIn);
        const checkOut = parseDate(booking.checkOut);
        
        if (checkIn && checkOut) {
            const currentDay = new Date(checkIn);
            while (currentDay < checkOut) {
                const dateKey = currentDay.toISOString().split('T')[0];
                occupancyByDay.set(dateKey, (occupancyByDay.get(dateKey) || 0) + 1);
                currentDay.setDate(currentDay.getDate() + 1);
            }
        }
    });
    
    const totalOccupancy = Array.from(occupancyByDay.values()).reduce((sum, count) => sum + count, 0);
    return (totalOccupancy / (occupancyByDay.size || 1)) / totalRooms * 100;
}

function calculateDuration(checkIn, checkOut) {
    const startDate = parseDate(checkIn);
    const endDate = parseDate(checkOut);
    
    if (!startDate || !endDate) return 0;
    
    const duration = (endDate - startDate) / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.round(duration));
}

function findPreferredDays(distribution) {
    const threshold = Math.max(...distribution) * 0.7;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return distribution.reduce((preferred, count, index) => {
        if (count >= threshold) {
            preferred.push({
                day: days[index],
                count: count,
                percentage: ((count / distribution.reduce((a, b) => a + b, 0)) * 100).toFixed(1)
            });
        }
        return preferred;
    }, []);
}

// Add helper functions for the new calculations
function isDateInEvent(date, event) {
    if (!date) return false;
    const eventStart = new Date(date.getFullYear(), event.month, 1);
    const eventEnd = new Date(date.getFullYear(), event.month, event.duration);
    return date >= eventStart && date <= eventEnd;
}

function categorizePriceRange(ranges, amount) {
    if (amount <= 1000) updatePriceRange(ranges.economy, amount);
    else if (amount <= 3000) updatePriceRange(ranges.standard, amount);
    else updatePriceRange(ranges.premium, amount);
}

function updatePriceRange(range, amount) {
    range.min = Math.min(range.min, amount);
    range.max = Math.max(range.max, amount);
    range.count++;
}

function findPeakHours(distribution) {
    const threshold = Math.max(...distribution) * 0.8;
    return distribution.reduce((peaks, count, hour) => {
        if (count >= threshold) peaks.push(hour);
        return peaks;
    }, []);
}

// Add this helper function for revenue impact calculation
function calculateRevenueImpact(eventBookings, averageRate) {
    const totalRevenue = eventBookings.reduce((sum, booking) => 
        sum + (parseFloat(booking.totalAmount) || 0), 0);
    
    return {
        total: formatCurrency(totalRevenue),
        average: formatCurrency(averageRate),
        impact: ((totalRevenue / (averageRate || 1)) * 100).toFixed(1) + '%'
    };
}

// Add these functions before calculateGuestDemographics:

function calculateAgeDistribution(guests) {
    const ageGroups = {
        '18-24': 0,
        '25-34': 0,
        '35-44': 0,
        '45-54': 0,
        '55-64': 0,
        '65+': 0
    };

    guests.forEach(guest => {
        const age = calculateAge(guest.birthDate);
        if (age >= 18) {
            if (age < 25) ageGroups['18-24']++;
            else if (age < 35) ageGroups['25-34']++;
            else if (age < 45) ageGroups['35-44']++;
            else if (age < 55) ageGroups['45-54']++;
            else if (age < 65) ageGroups['55-64']++;
            else ageGroups['65+']++;
        }
    });

    return {
        labels: Object.keys(ageGroups),
        data: Object.values(ageGroups),
        total: guests.length
    };
}

function aggregatePurposeOfStay(guests) {
    const purposes = {
        'Leisure': 0,
        'Business': 0,
        'Family Visit': 0,
        'Medical': 0,
        'Education': 0,
        'Other': 0
    };

    guests.forEach(guest => {
        const purpose = guest.purposeOfStay || 'Other';
        if (purposes.hasOwnProperty(purpose)) {
            purposes[purpose]++;
        } else {
            purposes['Other']++;
        }
    });

    return {
        labels: Object.keys(purposes),
        data: Object.values(purposes),
        topPurpose: Object.entries(purposes)
            .reduce((a, b) => b[1] > a[1] ? b : a)[0]
    };
}

function calculateRepeatBookings(guests) {
    const repeatData = {
        firstTime: 0,
        repeat: 0,
        frequent: 0 // More than 3 stays
    };

    guests.forEach(guest => {
        const bookingCount = guest.bookingHistory?.length || 0;
        if (bookingCount <= 1) repeatData.firstTime++;
        else if (bookingCount <= 3) repeatData.repeat++;
        else repeatData.frequent++;
    });

    const total = guests.length || 1;
    return {
        counts: repeatData,
        percentages: {
            firstTime: ((repeatData.firstTime / total) * 100).toFixed(1),
            repeat: ((repeatData.repeat / total) * 100).toFixed(1),
            frequent: ((repeatData.frequent / total) * 100).toFixed(1)
        }
    };
}

function calculateAverageGroupSize(guests) {
    const groupSizes = guests.map(guest => guest.groupSize || 1);
    const total = groupSizes.reduce((sum, size) => sum + size, 0);
    return {
        average: (total / (guests.length || 1)).toFixed(1),
        distribution: {
            single: groupSizes.filter(size => size === 1).length,
            couple: groupSizes.filter(size => size === 2).length,
            family: groupSizes.filter(size => size >= 3 && size <= 5).length,
            group: groupSizes.filter(size => size > 5).length
        }
    };
}

function aggregateGuestOrigins(guests) {
    const origins = {};
    
    guests.forEach(guest => {
        const location = guest.location || 'Unknown';
        origins[location] = (origins[location] || 0) + 1;
    });

    const sortedOrigins = Object.entries(origins)
        .sort(([,a], [,b]) => b - a)
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});

    return {
        data: sortedOrigins,
        topOrigins: Object.entries(sortedOrigins)
            .slice(0, 5)
            .map(([location, count]) => ({
                location,
                count,
                percentage: ((count / guests.length) * 100).toFixed(1)
            }))
    };
}

function calculateAge(birthDate) {
    if (!birthDate) return 0;
    
    const birth = parseDate(birthDate);
    if (!birth) return 0;
    
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
}

// Helper function for year-over-year growth calculation
function calculateYearOverYearGrowth(monthlyData) {
    try {
        // Get last 12 months and previous 12 months
        const currentYear = monthlyData.slice(-12);
        const previousYear = monthlyData.slice(-24, -12);
        
        // Calculate totals for non-zero values only
        const currentTotal = currentYear.reduce((a, b) => a + (b || 0), 0);
        const previousTotal = previousYear.reduce((a, b) => a + (b || 0), 0);
        
        // Calculate growth percentage
        if (previousTotal <= 0) return 0;
        const growth = ((currentTotal - previousTotal) / previousTotal) * 100;
        
        // Return rounded value
        return Number(growth.toFixed(1));
    } catch (error) {
        console.error('Error calculating year-over-year growth:', error);
        return 0;
    }
}

// Add this new function after calculateYearOverYearGrowth function
function calculateImprovedYearlyGrowth(monthlyData, currentMonth) {
    try {
        console.log('Calculating year-over-year growth with improved method');
        
        // Method 1: If we have at least 6 months of data, compare first half to second half
        const firstHalf = monthlyData.slice(0, 6);
        const secondHalf = monthlyData.slice(6);
        
        const firstHalfTotal = firstHalf.reduce((a, b) => a + b, 0);
        const secondHalfTotal = secondHalf.reduce((a, b) => a + b, 0);
        
        if (firstHalfTotal > 0 && secondHalfTotal > 0) {
            const growth = ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
            console.log(`Year growth (half-year comparison): ${growth.toFixed(1)}%`);
            return Number(growth.toFixed(1));
        }
        
        // Method 2: Use trend from consecutive months with data
        const nonZeroMonths = monthlyData.map((value, index) => ({ value, index }))
                                         .filter(item => item.value > 0)
                                         .sort((a, b) => a.index - b.index);
        
        if (nonZeroMonths.length >= 2) {
            const first = nonZeroMonths[0].value;
            const last = nonZeroMonths[nonZeroMonths.length - 1].value;
            const growth = ((last - first) / first) * 100;
            console.log(`Year growth (trend-based): ${growth.toFixed(1)}%`);
            return Number(growth.toFixed(1));
        }
        
        // Method 3: If current month has data, use quarter comparison
        if (monthlyData[currentMonth] > 0) {
            // Get average of available data
            const avgRevenue = monthlyData.filter(v => v > 0).reduce((a, b) => a + b, 0) / 
                              monthlyData.filter(v => v > 0).length;
            
            // Calculate growth from average to current
            const growth = ((monthlyData[currentMonth] - avgRevenue) / avgRevenue) * 100;
            console.log(`Year growth (average-based): ${growth.toFixed(1)}%`);
            return Number(growth.toFixed(1));
        }
        
        // Default fallback
        console.log('Unable to calculate meaningful yearly growth, using default of 0');
        return 0;
    } catch (error) {
        console.error('Error calculating improved yearly growth:', error);
        return 0;
    }
}

// ...rest of existing code...

function calculateAverageStayDuration(bookings) {
    const completedBookings = bookings.filter(booking => 
        booking.checkIn && booking.checkOut && booking.status === 'completed'
    );
    
    if (completedBookings.length === 0) return 0;

    const totalDays = completedBookings.reduce((sum, booking) => {
        const checkIn = booking.checkIn.toDate();
        const checkOut = booking.checkOut.toDate();
        const days = (checkOut - checkIn) / (1000 * 60 * 60 * 24);
        return sum + days;
    }, 0);

    return (totalDays / completedBookings.length).toFixed(1);
}
