// Add Vue production config
Vue.config.productionTip = false;

import { 
    auth, 
    db, 
    getCurrentUser, 
    checkAuth, 
    initializeFirebase,
    fetchAnalyticsData,
    logPageNavigation,
    signOut,
    // Add Firestore method imports
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    doc,
    getDoc,
    addDoc
} from '../firebase.js';
import { SuggestionService } from './suggestionService.js';
import { predictNextMonthOccupancy } from './occupancyPredictor.js';
import { PredictionFormatter } from './prediction/PredictionFormatter.js';
import { BusinessReportFormatter } from './utils/BusinessReportFormatter.js';
import { PageLogger } from '../js/pageLogger.js';
import { EverLodgeDataService } from '../shared/everLodgeDataService.js';

// Add activity logging function
async function logAIActivity(actionType, details) {
    try {
        const user = auth.currentUser;
        if (!user) return;

        await addDoc(collection(db, 'activityLogs'), {
            userId: user.uid,
            userName: user.email,
            actionType,
            details,
            timestamp: Timestamp.now(),
            userRole: 'admin',
            module: 'AI Assistant'
        });
    } catch (error) {
        console.error('Error logging AI activity:', error);
    }
}

// Replace Vue.createApp with new Vue for Vue 2 compatibility
new Vue({
    el: '#app',
    data() {
        return {
            messages: [],
            currentMessage: '',
            loading: {
                app: false,
                sending: false
            },
            connectionError: null,
            showingChat: true,
            activePage: 'chat',
            errorRetryCount: 0,
            maxRetries: 2,
            showingChatHistory: false,
            chatHistory: [],
            statusMessage: null,
            user: null,
            isAuthenticated: false,
            // Add properties that might be used but not explicitly defined
            generateCurrentOccupancyResponse: function(data) {
                try {
                    console.log('Generating current occupancy rate analysis with data:', {
                        bookingsCount: data?.bookings?.length || 0,
                        roomsCount: data?.rooms?.length || 0
                    });

                    // Check if we have data to analyze
                    if (!data || data.status === 'error' || !data.bookings || data.bookings.length === 0) {
                        return "I couldn't find any booking data to calculate the current occupancy rate.";
                    }

                    // Get current date
                    const now = new Date();
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);

                    // Get room inventory data
                    const roomsByType = {};
                    let totalRooms = 0;

                    if (data.rooms && data.rooms.length > 0) {
                        // Process room data from database
                        data.rooms.forEach(room => {
                            const roomType = room.roomType || room.type || 'Standard';
                            roomsByType[roomType] = (roomsByType[roomType] || 0) + 1;
                            totalRooms++;
                        });
                    } else {
                        // Default room counts if room data isn't available
                        roomsByType['Standard'] = 5;
                        roomsByType['Deluxe'] = 4;
                        roomsByType['Suite'] = 3;
                        roomsByType['Family'] = 2;
                        totalRooms = 14;
                    }

                    // Find occupied rooms (active bookings for today)
                    const occupiedRooms = data.bookings.filter(booking => {
                        const checkIn = booking.checkIn instanceof Date ? booking.checkIn : 
                                      booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                      new Date(booking.checkIn);
                        
                        const checkOut = booking.checkOut instanceof Date ? booking.checkOut : 
                                       booking.checkOut?.toDate ? booking.checkOut.toDate() : 
                                       new Date(booking.checkOut);
                        
                        // Skip invalid dates or cancelled bookings
                        if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || booking.status === 'cancelled') {
                            return false;
                        }
                        
                        // Check if this booking covers today (check-in before or on today, check-out after today)
                        return checkIn < tomorrow && checkOut >= today;
                    });

                    // Calculate current occupancy rate
                    const occupancyRate = (occupiedRooms.length / totalRooms) * 100;
                    const formattedRate = Math.min(100, Math.max(0, occupancyRate)).toFixed(1);

                    // Calculate occupancy by room type
                    const occupancyByType = {};
                    let totalOccupiedByType = 0;

                    // Count occupied rooms by type
                    occupiedRooms.forEach(booking => {
                        const roomType = booking?.propertyDetails?.roomType || booking.roomType || 'Standard';
                        occupancyByType[roomType] = (occupancyByType[roomType] || 0) + 1;
                        totalOccupiedByType++;
                    });

                    // Calculate occupancy rate by room type
                    const roomTypeOccupancy = Object.keys(roomsByType).map(type => {
                        const total = roomsByType[type];
                        const occupied = occupancyByType[type] || 0;
                        const rate = total > 0 ? (occupied / total) * 100 : 0;
                        return {
                            type,
                            total,
                            occupied,
                            rate: Math.min(100, rate).toFixed(1)
                        };
                    }).sort((a, b) => b.rate - a.rate); // Sort by occupancy rate, highest first

                    // Get 7-day trend data
                    const weekTrend = [];
                    for (let i = 6; i >= 0; i--) {
                        const date = new Date(now);
                        date.setDate(date.getDate() - i);
                        
                        // Count bookings active on this date
                        const activeBookings = data.bookings.filter(booking => {
                            const checkIn = booking.checkIn instanceof Date ? booking.checkIn : 
                                          booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                          new Date(booking.checkIn);
                            
                            const checkOut = booking.checkOut instanceof Date ? booking.checkOut : 
                                           booking.checkOut?.toDate ? booking.checkOut.toDate() : 
                                           new Date(booking.checkOut);
                            
                            // Skip invalid dates or cancelled bookings
                            if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || booking.status === 'cancelled') {
                                return false;
                            }
                            
                            // Check if booking is active on this date
                            const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                            const dateEnd = new Date(dateStart);
                            dateEnd.setDate(dateEnd.getDate() + 1);
                            
                            return checkIn < dateEnd && checkOut >= dateStart;
                        });
                        
                        const dayRate = (activeBookings.length / totalRooms) * 100;
                        weekTrend.push({
                            date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                            rate: Math.min(100, Math.max(0, dayRate)).toFixed(1),
                            count: activeBookings.length
                        });
                    }

                    // Calculate weekly average and trend direction
                    const weeklyRates = weekTrend.map(day => parseFloat(day.rate));
                    const weeklyAverage = weeklyRates.reduce((sum, rate) => sum + rate, 0) / weeklyRates.length;
                    
                    // Calculate trend (simple linear regression)
                    const n = weeklyRates.length;
                    const x = Array.from({length: n}, (_, i) => i);
                    const sumX = x.reduce((a, b) => a + b, 0);
                    const sumY = weeklyRates.reduce((a, b) => a + b, 0);
                    const sumXY = x.reduce((a, b, i) => a + b * weeklyRates[i], 0);
                    const sumX2 = x.reduce((a, b) => a + b * b, 0);
                    
                    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                    
                    // Determine trend direction and emoji
                    let trendDirection, trendEmoji;
                    if (Math.abs(slope) < 0.5) {
                        trendDirection = 'stable';
                        trendEmoji = '↔️';
                    } else if (slope > 0) {
                        trendDirection = 'increasing';
                        trendEmoji = '📈';
                    } else {
                        trendDirection = 'decreasing';
                        trendEmoji = '📉';
                    }

                    // Get status indicator emoji
                    const statusEmoji = occupancyRate >= 80 ? '🟢 High' : 
                                       occupancyRate >= 60 ? '🟡 Good' : 
                                       occupancyRate >= 40 ? '🟠 Moderate' : 
                                       '🔴 Low';

                    // Generate recommendations based on occupancy rate
                    const recommendations = [];
                    if (occupancyRate < 40) {
                        recommendations.push('• Consider running promotions to boost occupancy 🏷️');
                        recommendations.push('• Evaluate pricing strategy to attract more guests 💰');
                    } else if (occupancyRate < 70) {
                        recommendations.push('• Target marketing toward underbooked room types 🎯');
                        recommendations.push('• Offer upgrades to maximize revenue from available rooms 📊');
                    } else if (occupancyRate >= 90) {
                        recommendations.push('• Consider dynamic pricing to maximize revenue 💵');
                        recommendations.push('• Ensure staffing levels match high occupancy needs 👥');
                    }

                    // Format the weekly trend data for display
                    const weeklyTrendText = weekTrend.map(day => 
                        `• ${day.date}: ${day.rate}% (${day.count} rooms)`
                    ).join('\n');

                    // Format room type occupancy for display
                    const roomTypeText = roomTypeOccupancy.map(room => 
                        `• ${room.type}: ${room.rate}% (${room.occupied}/${room.total} rooms)`
                    ).join('\n');

                    // Return a comprehensive response
                    return `# Current Occupancy Analysis for EverLodge 📊

## Current Occupancy Rate
• Today's Occupancy Rate: ${formattedRate}% ${statusEmoji}
• 7-Day Average: ${weeklyAverage.toFixed(1)}%
• Weekly Trend: ${trendDirection} ${trendEmoji}
• Total Available Rooms: ${totalRooms}
• Currently Occupied: ${occupiedRooms.length} rooms

## Occupancy by Room Type
${roomTypeText}

## 7-Day Occupancy Trend
${weeklyTrendText}

## Insights & Recommendations
• Occupancy is currently ${occupancyRate >= 70 ? 'strong' : occupancyRate >= 50 ? 'moderate' : 'below target'} at ${formattedRate}%
• The weekly trend shows ${trendDirection} occupancy ${trendEmoji}
${recommendations.join('\n')}

Data is sourced directly from the everlodgebookings collection and represents current room status as of ${now.toLocaleDateString()} ${now.toLocaleTimeString()}.`;
                } catch (error) {
                    console.error('Error generating current occupancy response:', error);
                    return "I apologize, but I encountered an error while calculating the current occupancy rate. Please try again later.";
                }
            },
            generateLodgeKPIResponse: function() {
                return "Here are the key performance indicators for this month...";
            },
            generateBookingDistributionByRoomType: function() {
                return "Here's the booking distribution by room type...";
            },
            generateGuestPreferenceAnalysis: function() {
                return "Based on our data, here are the guest preferences...";
            }
        };
    },
    methods: {
        async processQuery(message) {
            try {
                const lowerMessage = message.toLowerCase();

                // Fetch data from everlodgebookings collection
                const data = await this.fetchIntegratedData();
                if (!data || data.status === 'error') {
                    throw new Error('Unable to fetch required data from everlodgebookings collection');
                }

                // Check for occupancy trend query - improved detection
                if ((lowerMessage.includes('occupancy') && lowerMessage.includes('trend')) ||
                    lowerMessage === 'what is our occupancy trend' ||
                    lowerMessage === 'occupancy trend') {
                    console.log('Processing occupancy trend query:', message);
                    const result = await this.generateOccupancyTrendAnalysis(data);
                    // Always extract the response property if it exists
                    return result && result.response ? result.response : result;
                }
                
                // Check for booking patterns query
                if (lowerMessage.includes('booking patterns') || 
                    (lowerMessage.includes('what') && lowerMessage.includes('booking pattern')) ||
                    lowerMessage === 'what are our booking patterns this month?') {
                    console.log('Processing booking patterns query:', message);
                    return await this.generateBookingPatternsResponse(data);
                }
                
                // Check for peak booking season query
                if (lowerMessage.includes('peak booking season') || 
                    (lowerMessage.includes('when') && lowerMessage.includes('peak') && lowerMessage.includes('booking')) ||
                    lowerMessage === 'when is our peak booking season?') {
                    console.log('Processing peak booking season query:', message);
                    return await this.generatePeakBookingSeasonResponse(data);
                }
                
                // Check for occupancy forecast query
                if ((lowerMessage.includes('occupancy') && lowerMessage.includes('forecast')) ||
                    lowerMessage === 'provide an occupancy forecast') {
                    console.log('Processing occupancy forecast query:', message);
                    const result = await this.generateOccupancyForecastAnalysis(data);
                    return result.success && result.response ? result.response : result;
                }

                // Check for booking distribution by room type query
                if (lowerMessage.includes('booking distribution by room type') || 
                    (lowerMessage.includes('show') && lowerMessage.includes('booking') && lowerMessage.includes('room type'))) {
                    return await this.generateBookingDistributionByRoomType();
                }
                
                // Check for total sales query
                if (lowerMessage.includes('total sales this month') || 
                    (lowerMessage.includes('sales') && lowerMessage.includes('this month'))) {
                    return await this.generateMonthlySalesResponse();
                }

                // Check for simple total sales query
                if (lowerMessage === 'what is our total sales' || 
                    lowerMessage === 'total sales' ||
                    (lowerMessage.includes('what') && lowerMessage.includes('total sales'))) {
                    return await this.generateMonthlySalesResponse();
                }

                // Check for KPI question
                if (lowerMessage.includes('key performance indicators') || 
                    (lowerMessage.includes('kpi') && lowerMessage.includes('this month'))) {
                    return this.generateLodgeKPIResponse();
                }

                // Check for specific current occupancy rate question
                if (lowerMessage.includes('current occupancy rate') || 
                    (lowerMessage.includes('what') && lowerMessage.includes('occupancy rate'))) {
                    return this.generateCurrentOccupancyResponse(data);
                }

                // Add guest preference analysis
                if (lowerMessage.includes('guest preferences') || 
                    lowerMessage.includes('customer preferences')) {
                    return await this.generateGuestPreferenceAnalysis(data);
                }

                // Check for quarterly sales analysis question
                if (lowerMessage.includes('how has our sales changed in the last quarter') || 
                    (lowerMessage.includes('sales') && lowerMessage.includes('quarter') && 
                     (lowerMessage.includes('change') || lowerMessage.includes('analysis')))) {
                    console.log('Processing quarterly sales analysis query:', message);
                    return await this.generateQuarterlySalesAnalysis(data);
                }

                // Default response for unrecognized queries
                return this.generateDefaultResponse(data);
            } catch (error) {
                console.error('Error processing query:', error);
                return `I apologize, but I encountered an error while processing your request. Please try again later. Error: ${error.message}`;
            }
        },
        
        async generateOccupancyTrendAnalysis(data) {
            try {
                console.log('Generating occupancy trend analysis with data from everlodgebookings collection');
                
                // Check if we have data to analyze
                if (!data || data.status === 'error' || !data.bookings || data.bookings.length === 0) {
                    return {
                        success: false,
                        response: "I couldn't find any booking data in the everlodgebookings collection to analyze occupancy trends."
                    };
                }
                
                // Verify we're using data from the everlodgebookings collection
                if (data.dataSource !== 'everlodgebookings') {
                    console.warn('Warning: Not using everlodgebookings collection as requested');
                }
                
                // Get room count data for occupancy calculation
                const roomCounts = {};
                
                // Use room data if available
                if (data.rooms && data.rooms.length > 0) {
                    data.rooms.forEach(room => {
                        const roomType = room.roomType || room.type || 'Standard';
                        roomCounts[roomType] = (roomCounts[roomType] || 0) + 1;
                    });
                } else {
                    // Default room counts if room data isn't available
                    roomCounts['Standard'] = 5;
                    roomCounts['Deluxe'] = 4;
                    roomCounts['Suite'] = 3;
                    roomCounts['Family'] = 2;
                }
                
                const totalRooms = Object.values(roomCounts).reduce((sum, count) => sum + count, 14); // Default to 14 if sum is 0
                
                // Define time periods for trend analysis
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();
                
                // Create monthly buckets for the past 12 months
                const months = [];
                const monthlyData = {};
                
                for (let i = 11; i >= 0; i--) {
                    const month = new Date(currentYear, currentMonth - i, 1);
                    const monthKey = month.toLocaleString('default', { month: 'short', year: 'numeric' });
                    months.push(monthKey);
                    
                    monthlyData[monthKey] = {
                        year: month.getFullYear(),
                        month: month.getMonth(),
                        bookings: 0,
                        occupiedRoomDays: 0,
                        totalRoomDays: totalRooms * new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
                        roomTypes: {}
                    };
                    
                    // Initialize room type counters
                    Object.keys(roomCounts).forEach(roomType => {
                        monthlyData[monthKey].roomTypes[roomType] = {
                            total: roomCounts[roomType] || 0,
                            booked: 0
                        };
                    });
                }
                
                // Process bookings
                data.bookings.forEach(booking => {
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : 
                                  booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                  new Date(booking.checkIn);
                    
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : 
                                   booking.checkOut?.toDate ? booking.checkOut.toDate() : 
                                   new Date(booking.checkOut);
                    
                    // Skip invalid dates
                    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
                        return;
                    }
                    
                    // Skip cancelled bookings
                    if (booking.status === 'cancelled') {
                        return;
                    }
                    
                    // Determine the room type
                    const roomType = booking?.propertyDetails?.roomType || 
                                   booking.roomType || 
                                   'Standard'; // Default to Standard if not specified
                    
                    // Calculate the duration of stay in days
                    const stayDurationMs = checkOut.getTime() - checkIn.getTime();
                    const stayDurationDays = Math.max(1, Math.round(stayDurationMs / (1000 * 60 * 60 * 24)));
                    
                    // Distribute the booking across all months it spans
                    let currentDate = new Date(checkIn);
                    while (currentDate < checkOut) {
                        const monthKey = currentDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                        
                        // Only count if within our 12-month window
                        if (monthlyData[monthKey]) {
                            monthlyData[monthKey].bookings++;
                            monthlyData[monthKey].occupiedRoomDays++;
                            
                            // Track room type occupancy
                            if (monthlyData[monthKey].roomTypes[roomType]) {
                                monthlyData[monthKey].roomTypes[roomType].booked++;
                            } else {
                                // If this room type isn't in our predefined list, add it
                                monthlyData[monthKey].roomTypes[roomType] = {
                                    total: 1, // Assume at least 1 room of this type
                                    booked: 1
                                };
                            }
                        }
                        
                        // Move to next day
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                });
                
                // Calculate occupancy rates and trends
                const occupancyRates = months.map(month => {
                    const data = monthlyData[month];
                    const rate = (data.occupiedRoomDays / data.totalRoomDays) * 100;
                    return {
                        month,
                        rate: Math.min(100, Math.max(0, rate)).toFixed(1),
                        bookings: data.bookings
                    };
                });
                
                // Calculate room type specific occupancy for the most recent 3 months
                const roomTypeOccupancy = {};
                months.slice(-3).forEach(month => {
                    Object.keys(monthlyData[month].roomTypes).forEach(roomType => {
                        if (!roomTypeOccupancy[roomType]) {
                            roomTypeOccupancy[roomType] = [];
                        }
                        
                        const roomData = monthlyData[month].roomTypes[roomType];
                        const rate = roomData.total > 0 ? (roomData.booked / roomData.total) * 100 : 0;
                        
                        roomTypeOccupancy[roomType].push({
                            month,
                            rate: rate.toFixed(1)
                        });
                    });
                });
                
                // Calculate overall trend direction
                const recentMonths = 3; // Look at last 3 months for recent trend
                const recentRates = occupancyRates.slice(-recentMonths).map(m => parseFloat(m.rate));
                
                // Calculate simple linear regression for trend
                const n = recentRates.length;
                const x = Array.from({length: n}, (_, i) => i);
                const sumX = x.reduce((a, b) => a + b, 0);
                const sumY = recentRates.reduce((a, b) => a + b, 0);
                const sumXY = x.reduce((a, b, i) => a + b * recentRates[i], 0);
                const sumX2 = x.reduce((a, b) => a + b * b, 0);
                
                const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;
                
                // Determine trend direction and strength
                let trendDirection, trendStrength, trendEmoji;
                
                if (Math.abs(slope) < 0.5) {
                    trendDirection = 'stable';
                    trendStrength = 'stable';
                    trendEmoji = '↔️';
                } else if (slope > 0) {
                    trendDirection = 'increasing';
                    trendEmoji = '📈';
                    if (slope > 5) {
                        trendStrength = 'strongly';
                    } else if (slope > 2) {
                        trendStrength = 'moderately';
                    } else {
                        trendStrength = 'slightly';
                    }
                } else {
                    trendDirection = 'decreasing';
                    trendEmoji = '📉';
                    if (slope < -5) {
                        trendStrength = 'strongly';
                    } else if (slope < -2) {
                        trendStrength = 'moderately';
                    } else {
                        trendStrength = 'slightly';
                    }
                }
                
                // Calculate average occupancy
                const avgOccupancy = occupancyRates.reduce((sum, month) => sum + parseFloat(month.rate), 0) / occupancyRates.length;
                
                // Calculate month with highest and lowest occupancy
                const highest = [...occupancyRates].sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate))[0];
                const lowest = [...occupancyRates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];
                
                // Calculate seasonality - variance between months
                const ratesArray = occupancyRates.map(m => parseFloat(m.rate));
                const maxRate = Math.max(...ratesArray);
                const minRate = Math.min(...ratesArray);
                const seasonalVariance = maxRate - minRate;
                
                // Get current occupancy rate from most recent month
                const currentOccupancy = parseFloat(occupancyRates[occupancyRates.length - 1].rate);
                
                // Recent occupancy change (last month vs current)
                const recentChange = occupancyRates.length >= 2 ? 
                    currentOccupancy - parseFloat(occupancyRates[occupancyRates.length - 2].rate) : 0;
                
                // Generate insights
                const insights = [];
                
                // Current trend insight
                insights.push(`• Occupancy is ${trendStrength} ${trendDirection} over the past 3 months ${trendEmoji}`);
                
                // Seasonal variance insight
                if (seasonalVariance > 20) {
                    insights.push(`• High seasonal variance observed (${seasonalVariance.toFixed(1)}% difference between peak and low seasons) 🔄`);
                } else if (seasonalVariance > 10) {
                    insights.push(`• Moderate seasonal variance observed (${seasonalVariance.toFixed(1)}% difference between peak and low seasons) 🔄`);
                } else {
                    insights.push(`• Limited seasonal variance observed (${seasonalVariance.toFixed(1)}% difference between peak and low seasons) 🔄`);
                }
                
                // Peak month insight
                insights.push(`• Highest occupancy: ${highest.month} at ${highest.rate}% 🌟`);
                
                // Room type performance insight
                const roomTypeInsights = Object.entries(roomTypeOccupancy).map(([roomType, data]) => {
                    const avgRate = data.reduce((sum, month) => sum + parseFloat(month.rate), 0) / data.length;
                    return { roomType, avgRate };
                }).sort((a, b) => b.avgRate - a.avgRate);
                
                if (roomTypeInsights.length > 0) {
                    insights.push(`• ${roomTypeInsights[0].roomType} rooms have the highest recent occupancy at ${roomTypeInsights[0].avgRate.toFixed(1)}% 🏆`);
                    
                    if (roomTypeInsights.length > 1) {
                        const worstPerformer = roomTypeInsights[roomTypeInsights.length - 1];
                        insights.push(`• ${worstPerformer.roomType} rooms have the lowest occupancy at ${worstPerformer.avgRate.toFixed(1)}% 📊`);
                    }
                }
                
                // Generate recommendations
                const recommendations = [];
                
                // Recommendations based on trend
                if (trendDirection === 'decreasing' && currentOccupancy < 60) {
                    recommendations.push(`• Implement promotional pricing to reverse the declining occupancy trend 🏷️`);
                    recommendations.push(`• Create special packages to attract guests during this lower occupancy period 📦`);
                } else if (trendDirection === 'increasing' && currentOccupancy > 80) {
                    recommendations.push(`• Consider dynamic pricing to capitalize on high demand 💰`);
                    recommendations.push(`• Ensure staffing levels are adequate to handle the increasing occupancy 👥`);
                }
                
                // Room type specific recommendations
                if (roomTypeInsights.length > 1) {
                    const lowestRoom = roomTypeInsights[roomTypeInsights.length - 1];
                    if (lowestRoom.avgRate < 50) {
                        recommendations.push(`• Review pricing and marketing for ${lowestRoom.roomType} rooms to improve their occupancy rate 🔍`);
                    }
                }
                
                // Seasonal recommendations
                if (seasonalVariance > 15) {
                    recommendations.push(`• Develop seasonal marketing strategies to reduce the ${seasonalVariance.toFixed(1)}% variance between peak and low seasons 📅`);
                }
                
                // Format the data for the months to display in the report
                const monthlyRatesText = occupancyRates
                    .map(m => `• ${m.month}: ${m.rate}% occupancy (${m.bookings} bookings)`)
                    .join('\n');
                
                // Format the room type occupancy data
                const roomTypeText = Object.entries(roomTypeOccupancy)
                    .map(([roomType, data]) => {
                        const avgRate = data.reduce((sum, month) => sum + parseFloat(month.rate), 0) / data.length;
                        return `• ${roomType}: ${avgRate.toFixed(1)}% average (last 3 months)`;
                    })
                    .sort((a, b) => parseFloat(b.split(': ')[1]) - parseFloat(a.split(': ')[1]))
                    .join('\n');
                
                // Return a comprehensive response
                return {
                    success: true,
                    response: `# EverLodge Occupancy Trend Analysis 📊

## Current Occupancy Status
• Current Occupancy Rate: ${currentOccupancy.toFixed(1)}% ${currentOccupancy >= 70 ? '🟢' : currentOccupancy >= 50 ? '🟡' : '🔴'}
• 12-Month Average: ${avgOccupancy.toFixed(1)}%
• Recent Change: ${recentChange > 0 ? '+' : ''}${recentChange.toFixed(1)}% (month-over-month)

## 12-Month Occupancy Trend
${monthlyRatesText}

## Trend Analysis
• Overall Trend: Occupancy is ${trendStrength} ${trendDirection} ${trendEmoji}
• Peak Period: ${highest.month} (${highest.rate}%)
• Lowest Period: ${lowest.month} (${lowest.rate}%)
• Seasonal Variance: ${seasonalVariance.toFixed(1)}% between peak and low seasons

## Room Type Performance
${roomTypeText}

## Key Insights
${insights.join('\n')}

## Strategic Recommendations
${recommendations.join('\n')}

All data is sourced directly from the everlodgebookings collection in Firebase to ensure accurate and up-to-date occupancy trend analysis.`
                };
            } catch (error) {
                console.error('Error generating occupancy trend analysis:', error);
                return {
                    success: false,
                    response: "I apologize, but I encountered an error while analyzing the occupancy trend data from the everlodgebookings collection. Please try again later."
                };
            }
        },

        async sendMessage() {
            const message = this.currentMessage.trim();
            if (!message) return;

            try {
                // Start a new conversation for each message
                this.messages = []; // Clear previous messages

                // Add user message
                this.addMessage(message, 'user');
                this.currentMessage = '';
                
                // Set loading indicator
                this.loading.sending = true;

                // Process the query and get response
                const response = await this.processQuery(message);
                
                // Remove loading indicator
                this.loading.sending = false;
                
                this.addMessage(response, 'bot');
                
                // Add suggestions after the bot response
                // Skip suggestion if the response is an error message
                if (!response.includes("I apologize, but I encountered an error")) {
                    this.addSuggestions(response);
                }

                // Save to chat history after both messages are added
                console.log('Saving chat to history...', this.messages);
                await this.saveChatToHistory();

                await logAIActivity('ai_query', `User asked: ${message}`);
            } catch (error) {
                this.loading.sending = false;
                this.handleError(error);
                await logAIActivity('ai_error', `Failed to process query: ${error.message}`);
            }
        },
        
        handleError(error) {
            console.error('Error:', error);
            if (this.errorRetryCount < this.maxRetries) {
                this.errorRetryCount++;
                setTimeout(() => this.sendMessage(), 1000 * this.errorRetryCount);
            } else {
                this.addMessage('Sorry, I encountered an error. Please try again later.', 'bot');
                this.errorRetryCount = 0;
            }
        },
        
        addMessage(text, type) {
            const message = document.createElement('div');
            message.className = `message ${type}-message`;
            
            // Add message avatar
            const avatar = document.createElement('div');
            avatar.className = `message-avatar ${type}`;
            
            // Add icon based on message type
            const icon = document.createElement('i');
            icon.className = type === 'bot' ? 'fas fa-robot' : 'fas fa-user';
            avatar.appendChild(icon);
            
            // Add avatar to message
            message.appendChild(avatar);
            
            const content = document.createElement('div');
            content.className = 'message-content';
            
            // Convert Markdown to HTML for bot messages
            if (type === 'bot') {
                content.innerHTML = this.markdownToHtml(text);
            } else {
                content.textContent = text;
            }
            
            message.appendChild(content);
            
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.appendChild(message);
            
            // Scroll to the bottom of the chat
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            // Store the message in the messages array
            this.messages.push({
                text,
                type,
                timestamp: new Date()
            });
        },
        
        markdownToHtml(text) {
            // Ensure text is a string before processing
            if (typeof text !== 'string') {
                console.warn('markdownToHtml received non-string input:', text);
                text = String(text || '');
            }
            
            // Convert headings
            text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
            text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            
            // Convert bold
            text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            
            // Convert italic
            text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
            
            // Improved paragraph handling
            // Split text into paragraphs and wrap each in <p> tags
            const paragraphs = text.split(/\n\s*\n/);
            text = paragraphs.map(p => {
                // Skip if this is already a heading or list
                if (p.startsWith('<h') || p.match(/^\- /m)) {
                    return p;
                }
                return `<p>${p}</p>`;
            }).join('');
            
            // Convert lists (after paragraph processing)
            text = text.replace(/^\- (.+)$/gm, '<li>$1</li>');
            text = text.replace(/(<li>.*<\/li>\n*)+/g, '<ul>$&</ul>');
            
            // Convert single line breaks within paragraphs
            text = text.replace(/<\/p>\s*<p>/g, '</p><p>'); // Clean up extra spaces between paragraphs
            text = text.replace(/\n(?![<])/g, '<br>'); // Only convert line breaks not followed by HTML tags
            
            // Clean up multiple <br> tags
            text = text.replace(/(<br>){3,}/g, '<br><br>');
            
            return text;
        },
        
        addSuggestions(response) {
            const suggestionService = new SuggestionService();
            const suggestions = suggestionService.getSuggestionsByResponse(response);
            
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'message-suggestions';
            
            const suggestionsContainer = document.createElement('div');
            suggestionsContainer.className = 'chat-suggestions';
            
            suggestions.forEach(suggestion => {
                const chip = document.createElement('div');
                chip.className = 'suggestion-chip';
                chip.textContent = suggestion.text;
                chip.setAttribute('data-suggestion', suggestion.text);
                
                // Ensure click handler is properly bound to Vue instance
                chip.addEventListener('click', () => {
                    this.submitSuggestion(suggestion.text);
                });
                
                suggestionsContainer.appendChild(chip);
            });
            
            suggestionDiv.appendChild(suggestionsContainer);
            
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.appendChild(suggestionDiv);
            
            // Scroll to the bottom of the chat
            chatContainer.scrollTop = chatContainer.scrollHeight;
        },
        
        submitSuggestion(suggestion) {
            // Sanitize the suggestion text
            const sanitizedSuggestion = this.sanitizeHtml(suggestion);
            // Set the message
            this.currentMessage = sanitizedSuggestion;
            // Send the message
            this.sendMessage();
        },
        
        sanitizeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        
        async fetchIntegratedData() {
            try {
                console.log('Fetching integrated data from everlodgebookings collection...');
                
                // Fetch booking data specifically from everlodgebookings collection in Firebase
                const everLodgeBookingsRef = collection(db, 'everlodgebookings');
                const bookingsPromise = getDocs(everLodgeBookingsRef)
                    .then(snapshot => {
                        const bookings = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        console.log('Fetched everlodgebookings data:', bookings);
                        return bookings;
                    })
                    .catch(error => {
                        console.error('Error fetching everlodgebookings:', error);
                        
                        // Fall back to regular bookings collection if everlodgebookings fails
                        console.log('Falling back to regular bookings collection');
                        const bookingsRef = collection(db, 'bookings');
                        return getDocs(bookingsRef)
                            .then(snapshot => {
                                const bookings = snapshot.docs.map(doc => ({
                                    id: doc.id,
                                    ...doc.data()
                                }));
                                console.log('Fetched fallback bookings data:', bookings);
                                return bookings;
                            })
                            .catch(innerError => {
                                console.error('Error fetching fallback bookings:', innerError);
                                return [];
                            });
                    });
                
                // Fetch rooms directly from Firebase instead of the API
                const roomsRef = collection(db, 'rooms');
                const roomsPromise = getDocs(roomsRef)
                    .then(snapshot => {
                        const rooms = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        console.log('Fetched rooms data from Firebase:', rooms);
                        return rooms;
                    })
                    .catch(error => {
                        console.error('Error fetching rooms from Firebase:', error);
                        return []; // Return empty array on error
                    });
                
                // Wait for both promises to resolve
                const [rooms, bookings] = await Promise.all([roomsPromise, bookingsPromise]);
                
                console.log('Fetched rooms:', rooms);
                console.log('Fetched booking data:', bookings);
                
                return {
                    rooms,
                    bookings,
                    timestamp: new Date(),
                    dataSource: 'everlodgebookings',
                    status: 'success'
                };
            } catch (error) {
                console.error('Error in fetchIntegratedData:', error);
                return {
                    rooms: [],
                    bookings: [],
                    timestamp: new Date(),
                    status: 'error',
                    error: error.message
                };
            }
        },
        
        async initializeApp() {
            try {
                this.loading.app = true;
                this.connectionError = null;
                
                // Check if the user is authenticated
                const user = await getCurrentUser();
                this.user = user;
                this.isAuthenticated = !!user;
                
                // Initialize Firebase and fetch initial data
                await initializeFirebase();
                
                // Start a new chat
                this.startNewChat();
            } catch (error) {
                console.error('Initialization error:', error);
                this.connectionError = error.message;
            } finally {
                this.loading.app = false;
            }
        },

        startNewChat() {
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.innerHTML = '';
            
            // Add improved welcome message with better formatting
            this.addMessage(`
<h2>Welcome to Lodge Ease AI Assistant!</h2>
<p>I can help you analyze your hotel data and provide valuable insights to improve your business. Here are some areas I can assist you with:</p>
<ul>
<li>Occupancy trends and room statistics</li>
<li>Sales and financial performance</li>
<li>Booking patterns and guest preferences</li>
<li>Overall business performance</li>
</ul>
<p>How can I assist you today?</p>`, 'bot');

            // Add initial suggestions
            const suggestionService = new SuggestionService();
            
            // Get all categories of questions to display more comprehensive options
            const allVerifiedQuestions = [];
            
            // Add questions from all available categories
            const questionCategories = ['occupancy', 'sales', 'bookings', 'performance', 'predictions'];
            questionCategories.forEach(category => {
                if (suggestionService.verifiedQuestions[category]) {
                    // Get 1-2 questions from each category
                    const categoryQuestions = suggestionService.verifiedQuestions[category].slice(0, 2);
                    allVerifiedQuestions.push(...categoryQuestions);
                }
            });
            
            // Create categories for the front-end display
            const categorizedQuestions = {
                'Occupancy': suggestionService.verifiedQuestions['occupancy'].slice(0, 2),
                'Sales': suggestionService.verifiedQuestions['sales'].slice(0, 2),
                'Bookings': suggestionService.verifiedQuestions['bookings'].slice(0, 2),
                'Performance': suggestionService.verifiedQuestions['performance'].slice(0, 2)
            };

            // Create HTML for categorized suggestions
            let suggestionHTML = '';
            Object.entries(categorizedQuestions).forEach(([category, questions]) => {
                suggestionHTML += `
                    <div class="suggestion-category">
                        <div class="category-title">${category}</div>
                        <div class="category-suggestions">
                            ${questions.map(text => {
                                const sanitizedText = this.sanitizeHtml(text);
                                return `
                                    <div class="suggestion-chip" 
                                         data-suggestion="${sanitizedText}"
                                         role="button"
                                         tabindex="0">
                                        ${sanitizedText}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });

            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'message-suggestions expanded';
            suggestionDiv.innerHTML = `
                <div class="chat-suggestions categorized">
                    ${suggestionHTML}
                </div>
            `;

            // Add click event listeners to suggestions
            suggestionDiv.addEventListener('click', (e) => {
                const chip = e.target.closest('.suggestion-chip');
                if (chip) {
                    const suggestion = chip.dataset.suggestion;
                    if (suggestion) {
                        // Ensure this is bound to the Vue instance
                        this.submitSuggestion(suggestion);
                    }
                }
            });

            chatContainer.appendChild(suggestionDiv);
            
            logAIActivity('ai_new_chat', 'Started new conversation');
        },
        
        generateDefaultResponse(data) {
            return "I'm not sure I understand your question. Could you please try rephrasing it? I can help with occupancy trends, sales analysis, booking patterns, and business performance metrics.";
        },
        
        async generateOccupancyForecastAnalysis(data) {
            try {
                console.log('Starting occupancy forecast analysis with data:', {
                    bookingsCount: data.bookings?.length,
                    roomsCount: data.rooms?.length
                });
                
                // Get prediction from the occupancy predictor
                const prediction = await predictNextMonthOccupancy();
                
                // Get rooms by type for occupancy breakdown
                const roomsByType = {
                    'Standard': 5,
                    'Deluxe': 4,
                    'Suite': 3,
                    'Family': 2
                };
                
                // Calculate total rooms
                const totalRooms = Object.values(roomsByType).reduce((sum, count) => sum + count, 0);
                
                // Get next three months for forecasting
                const months = [];
                const currentDate = new Date();
                for (let i = 1; i <= 3; i++) {
                    const futureDate = new Date(currentDate);
                    futureDate.setMonth(currentDate.getMonth() + i);
                    months.push(futureDate.toLocaleString('default', { month: 'long', year: 'numeric' }));
                }
                
                // Generate forecasts for next three months
                // This would typically use more sophisticated algorithms
                // For now we'll use a simple algorithm that builds on the prediction
                const forecasts = [];
                const baseRate = prediction.predictedRate;
                
                // Get seasonal factors - higher in peak months, lower in off-peak
                const seasonalFactors = this.getSeasonalFactors(months);
                
                // Generate forecasts for each month
                for (let i = 0; i < months.length; i++) {
                    // Apply seasonality and gradually increase uncertainty
                    const seasonalAdjustment = (seasonalFactors[i] - 1) * 100;
                    const forecastedRate = Math.min(100, baseRate * seasonalFactors[i]);
                    const confidence = Math.max(30, prediction.confidence - (i * 15));
                    
                    forecasts.push({
                        month: months[i],
                        predictedRate: forecastedRate.toFixed(1),
                        confidence: confidence.toFixed(0),
                        seasonalFactor: seasonalFactors[i].toFixed(2),
                        seasonalAdjustment: seasonalAdjustment.toFixed(1)
                    });
                }
                
                // Generate forecast by room type
                // Different room types have different demand patterns
                const roomTypeForecasts = {};
                Object.keys(roomsByType).forEach(roomType => {
                    const roomTypeSeasonality = this.getRoomTypeSeasonality(roomType);
                    
                    roomTypeForecasts[roomType] = forecasts.map((forecast, i) => ({
                        month: forecast.month,
                        predictedRate: Math.min(100, baseRate * seasonalFactors[i] * roomTypeSeasonality[i]).toFixed(1),
                        adjustment: ((roomTypeSeasonality[i] - 1) * 100).toFixed(1)
                    }));
                });
                
                // Calculate projected revenue
                const averageRates = {
                    'Standard': 1200,
                    'Deluxe': 1800,
                    'Suite': 2500,
                    'Family': 2200
                };
                
                // Calculate projected revenue for each month and room type
                const revenueProjections = forecasts.map((forecast, i) => {
                    let totalRevenue = 0;
                    const roomRevenue = {};
                    
                    Object.keys(roomsByType).forEach(roomType => {
                        const roomCount = roomsByType[roomType];
                        const occupancyRate = parseFloat(roomTypeForecasts[roomType][i].predictedRate) / 100;
                        const avgRate = averageRates[roomType];
                        
                        // Calculate days in this month
                        const forecastDate = new Date(currentDate);
                        forecastDate.setMonth(currentDate.getMonth() + i + 1);
                        const daysInMonth = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), 0).getDate();
                        
                        const revenue = roomCount * occupancyRate * avgRate * daysInMonth;
                        roomRevenue[roomType] = revenue;
                        totalRevenue += revenue;
                    });
                    
                    return {
                        month: forecast.month,
                        totalRevenue: totalRevenue.toFixed(0),
                        roomRevenue
                    };
                });
                
                // Generate key insights and recommendations
                const insights = this.generateForecastInsights(forecasts, roomTypeForecasts);
                const recommendations = this.generateForecastRecommendations(forecasts, roomTypeForecasts);
                
                // Format the comprehensive forecast response
                return {
                    success: true,
                    response: `# COMPREHENSIVE OCCUPANCY FORECAST FOR EVER LODGE 🔮

## Next Month Forecast
• Predicted Occupancy Rate: ${prediction.predictedRate.toFixed(1)}% ${this.getOccupancyIndicator(prediction.predictedRate)}
• Forecast Period: ${prediction.month}
• Confidence Level: ${prediction.confidence.toFixed(0)}% ${this.getConfidenceIndicator(prediction.confidence)}
• Already Confirmed: ${prediction.details.confirmedBookings} bookings

## 3-Month Occupancy Forecast
${forecasts.map(forecast => 
    `• ${forecast.month}: ${forecast.predictedRate}% occupancy (${forecast.confidence}% confidence) ${parseFloat(forecast.seasonalAdjustment) > 0 ? '📈' : '📉'}`
).join('\n')}

## Occupancy Trends and Patterns
• Historical Comparison: ${prediction.details.historicalOccupancy.toFixed(1)}% (same month last year)
• Year-over-Year Change: ${(prediction.predictedRate - prediction.details.historicalOccupancy).toFixed(1)}% ${(prediction.predictedRate >= prediction.details.historicalOccupancy) ? '📈' : '📉'}
• Current Booking Pace: ${prediction.details.currentPace.toFixed(2)} bookings/day
• Expected Additional Bookings: ${prediction.details.expectedAdditional} before month starts

## Key Insights
${insights.join('\n')}

## Strategic Recommendations
${recommendations.join('\n')}

## Forecast Methodology
• Based on confirmed bookings in the system
• Historical booking patterns analysis
• Seasonal adjustment factors applied
• Room-specific demand patterns considered
• Confidence level reflects data reliability

Would you like more details on a specific aspect of this forecast?`
                };
            } catch (error) {
                console.error('Error generating occupancy forecast analysis:', error);
                return {
                    success: false,
                    response: "I apologize, but I couldn't generate the occupancy forecast at this time. Please try again later."
                };
            }
        },
        
        getSeasonalFactors(months) {
            try {
                // Simplified seasonal factors - could be more sophisticated based on historical data
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                 'July', 'August', 'September', 'October', 'November', 'December'];
                
                // Peak months typically have higher seasonal factors
                const baseSeasonality = {
                    'January': 0.8,
                    'February': 0.85,
                    'March': 0.9,
                    'April': 1.0,
                    'May': 1.1,
                    'June': 1.2,
                    'July': 1.3,
                    'August': 1.25,
                    'September': 1.1,
                    'October': 1.0,
                    'November': 0.9,
                    'December': 1.15
                };
                
                return months.map(monthYear => {
                    const monthName = monthYear.split(' ')[0];
                    return baseSeasonality[monthName] || 1.0;
                });
            } catch (error) {
                console.error('Error getting seasonal factors:', error);
                return months.map(() => 1.0); // Default to neutral seasonality
            }
        },
        
        getRoomTypeSeasonality(roomType) {
            // Different room types have different seasonal demand patterns
            const seasonalityPatterns = {
                'Standard': [1.0, 1.05, 1.1],
                'Deluxe': [1.1, 1.05, 1.0],
                'Suite': [0.9, 1.1, 1.2],
                'Family': [1.2, 1.1, 0.9]
            };
            
            return seasonalityPatterns[roomType] || [1.0, 1.0, 1.0];
        },
        
        getConfidenceIndicator(confidence) {
            if (confidence >= 80) return '🟢 High';
            if (confidence >= 60) return '🟡 Moderate';
            return '🟠 Low';
        },
        
        getOccupancyIndicator(rate) {
            if (rate >= 80) return '🔴';  // High occupancy (potentially overbooked)
            if (rate >= 60) return '🟢';  // Good occupancy
            if (rate >= 40) return '🟡';  // Moderate occupancy
            return '🔵';  // Low occupancy
        },
        
        generateForecastInsights(forecasts, roomTypeForecasts) {
            const insights = [];
            
            // Overall trend insight
            const trend = parseFloat(forecasts[forecasts.length - 1].predictedRate) - parseFloat(forecasts[0].predictedRate);
            if (trend > 5) {
                insights.push('• Overall occupancy is expected to increase over the forecast period 📈');
            } else if (trend < -5) {
                insights.push('• Overall occupancy is projected to decline over the next three months 📉');
            } else {
                insights.push('• Occupancy is expected to remain relatively stable over the forecast period ↔️');
            }
            
            // Peak month insight
            const peakMonth = [...forecasts].sort((a, b) => parseFloat(b.predictedRate) - parseFloat(a.predictedRate))[0];
            insights.push(`• ${peakMonth.month} shows the highest projected occupancy at ${peakMonth.predictedRate}% 🌟`);
            
            // Room type insights
            const roomTypes = Object.keys(roomTypeForecasts);
            const bestRoomType = roomTypes.reduce((best, type) => {
                const currentRate = parseFloat(roomTypeForecasts[type][0].predictedRate);
                return currentRate > parseFloat(roomTypeForecasts[best][0].predictedRate) ? type : best;
            }, roomTypes[0]);
            
            insights.push(`• ${bestRoomType} rooms have the strongest demand forecast 🏆`);
            
            // Seasonality insight
            insights.push(`• Seasonal factors will ${parseFloat(forecasts[0].seasonalAdjustment) > 0 ? 'boost' : 'reduce'} occupancy by ${Math.abs(parseFloat(forecasts[0].seasonalAdjustment)).toFixed(1)}% in the upcoming month`);
            
            return insights;
        },
        
        generateForecastRecommendations(forecasts, roomTypeForecasts) {
            const recommendations = [];
            
            // Rate optimization recommendation
            if (parseFloat(forecasts[0].predictedRate) > 80) {
                recommendations.push('• Implement dynamic pricing - increase rates for high-demand periods 💰');
            } else if (parseFloat(forecasts[0].predictedRate) < 50) {
                recommendations.push('• Consider promotional rates to boost occupancy during low-demand periods 📊');
            }
            
            // Room type specific recommendations
            const roomTypes = Object.keys(roomTypeForecasts);
            for (const roomType of roomTypes) {
                const forecast = parseFloat(roomTypeForecasts[roomType][0].predictedRate);
                if (forecast < 40) {
                    recommendations.push(`• Develop targeted promotions for ${roomType} rooms to increase bookings 📣`);
                    break; // Just add one room-specific recommendation
                }
            }
            
            // Advance booking recommendation
            recommendations.push('• Focus marketing efforts on the booking window 30-60 days before arrival 📆');
            
            // Seasonal recommendation
            const lastForecast = forecasts[forecasts.length - 1];
            if (parseFloat(lastForecast.predictedRate) > 75) {
                recommendations.push(`• Prepare for high occupancy in ${lastForecast.month} - ensure staffing and resources 👥`);
            } else if (parseFloat(lastForecast.predictedRate) < 40) {
                recommendations.push(`• Develop special packages for ${lastForecast.month} to improve projected low occupancy 📦`);
            }
            
            // Add one general recommendation
            recommendations.push('• Review cancellation policies to minimize impact of potential no-shows ✓');
            
            return recommendations;
        },
        
        async saveChatToHistory() {
            try {
                const user = auth.currentUser;
                if (!user) {
                    console.error('No user logged in');
                    return;
                }

                // Only save if there are messages
                if (!this.messages || this.messages.length === 0) {
                    console.warn('No messages to save');
                    return;
                }

                // Format messages for Firestore
                const formattedMessages = this.messages.map(m => ({
                    text: m.text,
                    type: m.type,
                    timestamp: m.timestamp || new Date()
                }));

                // Create a new chat history document
                const docRef = await addDoc(collection(db, 'chatHistory'), {
                    userId: user.uid,
                    timestamp: Timestamp.now(),
                    messages: formattedMessages
                });

                console.log('Chat saved to history successfully with ID:', docRef.id);
            } catch (error) {
                console.error('Error saving chat history:', error);
            }
        },
        
        // Add missing methods referenced in the HTML
        showChatHistory() {
            this.showingChatHistory = true;
            this.fetchChatHistory();
        },

        closeChatHistory() {
            this.showingChatHistory = false;
        },

        async fetchChatHistory() {
            try {
                const user = auth.currentUser;
                if (!user) return;
                
                const historyRef = collection(db, 'chatHistory');
                const q = query(
                    historyRef, 
                    where('userId', '==', user.uid),
                    orderBy('timestamp', 'desc'),
                    limit(20)
                );
                
                const snapshot = await getDocs(q);
                this.chatHistory = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                console.error('Error fetching chat history:', error);
            }
        },

        formatChatTitle(chat) {
            if (!chat || !chat.messages || chat.messages.length === 0) {
                return 'New Conversation';
            }
            
            // Find first user message
            const firstUserMsg = chat.messages.find(m => m.type === 'user');
            if (firstUserMsg) {
                // Truncate if too long
                return firstUserMsg.text.length > 30 
                    ? firstUserMsg.text.substring(0, 30) + '...' 
                    : firstUserMsg.text;
            }
            
            return 'Conversation ' + new Date(chat.timestamp.toDate()).toLocaleDateString();
        },

        formatDate(timestamp) {
            if (!timestamp) return '';
            
            const date = timestamp instanceof Timestamp 
                ? timestamp.toDate() 
                : new Date(timestamp);
                
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        },

        getFirstMessage(messages) {
            if (!messages || messages.length === 0) {
                return 'No messages';
            }
            
            const msg = messages[0].text || '';
            return msg.length > 50 ? msg.substring(0, 50) + '...' : msg;
        },

        async loadChatHistory(chatId) {
            try {
                const chatRef = doc(db, 'chatHistory', chatId);
                const chatDoc = await getDoc(chatRef);
                
                if (chatDoc.exists()) {
                    const chatData = chatDoc.data();
                    
                    // Clear current messages and load from history
                    const chatContainer = document.getElementById('chatContainer');
                    chatContainer.innerHTML = '';
                    
                    this.messages = [];
                    chatData.messages.forEach(msg => {
                        this.addMessage(msg.text, msg.type);
                    });
                    
                    this.closeChatHistory();
                }
            } catch (error) {
                console.error('Error loading chat history:', error);
            }
        },

        async handleLogout() {
            try {
                await signOut();
                window.location.href = '../Login/index.html';
            } catch (error) {
                console.error('Error signing out:', error);
            }
        },

        async generateQuarterlySalesAnalysis(data) {
            try {
                console.log('Generating quarterly sales analysis with data from everlodgebookings:', {
                    bookingsCount: data.bookings?.length,
                    dataSource: data.dataSource || 'everlodgebookings'
                });
                
                // Check if we have booking data to analyze
                if (!data.bookings || data.bookings.length === 0) {
                    return "I couldn't find any sales data in the everlodgebookings collection to analyze quarterly trends.";
                }
                
                // Verify we're using data from the everlodgebookings collection
                if (data.dataSource !== 'everlodgebookings') {
                    console.warn('Warning: Not using everlodgebookings collection as requested');
                }
                
                // Define the current and last quarters
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();
                
                // Calculate quarters
                const currentQuarter = Math.floor(currentMonth / 3) + 1;
                const currentQuarterStartMonth = (currentQuarter - 1) * 3;
                const currentQuarterEndMonth = currentQuarterStartMonth + 2;
                
                // Define previous quarter
                const previousQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
                const previousQuarterYear = currentQuarter === 1 ? currentYear - 1 : currentYear;
                const previousQuarterStartMonth = (previousQuarter - 1) * 3;
                const previousQuarterEndMonth = previousQuarterStartMonth + 2;
                
                // Create date ranges for the quarters
                const currentQuarterStart = new Date(currentYear, currentQuarterStartMonth, 1);
                const currentQuarterEnd = new Date(currentYear, currentQuarterEndMonth + 1, 0);
                
                const previousQuarterStart = new Date(previousQuarterYear, previousQuarterStartMonth, 1);
                const previousQuarterEnd = new Date(previousQuarterYear, previousQuarterEndMonth + 1, 0);
                
                // Also define last year's same quarter for year-over-year comparison
                const lastYearQuarterStart = new Date(currentYear - 1, currentQuarterStartMonth, 1);
                const lastYearQuarterEnd = new Date(currentYear - 1, currentQuarterEndMonth + 1, 0);
                
                // Filter bookings for each time period, excluding cancelled bookings
                const currentQuarterBookings = data.bookings.filter(booking => {
                    // Skip cancelled bookings to match BusinessAnalytics
                    if (booking.status === 'cancelled') return false;
                    
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    return bookingDate >= currentQuarterStart && bookingDate <= currentQuarterEnd;
                });
                
                const previousQuarterBookings = data.bookings.filter(booking => {
                    // Skip cancelled bookings to match BusinessAnalytics
                    if (booking.status === 'cancelled') return false;
                    
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    return bookingDate >= previousQuarterStart && bookingDate <= previousQuarterEnd;
                });
                
                const lastYearQuarterBookings = data.bookings.filter(booking => {
                    // Skip cancelled bookings to match BusinessAnalytics
                    if (booking.status === 'cancelled') return false;
                    
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    return bookingDate >= lastYearQuarterStart && bookingDate <= lastYearQuarterEnd;
                });
                
                // Calculate total sales for each period
                const currentQuarterSales = currentQuarterBookings.reduce((total, booking) => 
                    total + (booking.totalPrice || 0), 0);
                
                const previousQuarterSales = previousQuarterBookings.reduce((total, booking) => 
                    total + (booking.totalPrice || 0), 0);
                
                const lastYearQuarterSales = lastYearQuarterBookings.reduce((total, booking) => 
                    total + (booking.totalPrice || 0), 0);
                
                // Calculate quarter-over-quarter change
                const qoqChange = previousQuarterSales !== 0 ? 
                    ((currentQuarterSales - previousQuarterSales) / previousQuarterSales) * 100 : 
                    100;
                
                // Calculate year-over-year change
                const yoyChange = lastYearQuarterSales !== 0 ? 
                    ((currentQuarterSales - lastYearQuarterSales) / lastYearQuarterSales) * 100 : 
                    100;
                
                // Get month names for better readability
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
                
                const currentQuarterName = `Q${currentQuarter} ${currentYear} (${months[currentQuarterStartMonth]} - ${months[currentQuarterEndMonth]})`;
                const previousQuarterName = `Q${previousQuarter} ${previousQuarterYear} (${months[previousQuarterStartMonth]} - ${months[previousQuarterEndMonth]})`;
                const lastYearQuarterName = `Q${currentQuarter} ${currentYear - 1} (${months[currentQuarterStartMonth]} - ${months[currentQuarterEndMonth]})`;
                
                // Break down sales by room type for the current quarter
                const roomTypeSales = {};
                currentQuarterBookings.forEach(booking => {
                    const roomType = booking?.propertyDetails?.roomType || 'Unknown';
                    if (!roomTypeSales[roomType]) {
                        roomTypeSales[roomType] = 0;
                    }
                    roomTypeSales[roomType] += (booking.totalPrice || 0);
                });
                
                // Break down sales by month within the current quarter
                const monthlySales = {};
                currentQuarterBookings.forEach(booking => {
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    const monthName = months[bookingDate.getMonth()];
                    
                    if (!monthlySales[monthName]) {
                        monthlySales[monthName] = 0;
                    }
                    monthlySales[monthName] += (booking.totalPrice || 0);
                });
                
                // Format data for presentation
                const roomTypeSalesList = Object.entries(roomTypeSales)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, sales]) => `• ${type}: ₱${sales.toLocaleString()} (${(sales / currentQuarterSales * 100).toFixed(1)}%)`);
                
                const monthlySalesList = Object.entries(monthlySales)
                    .map(([month, sales]) => `• ${month}: ₱${sales.toLocaleString()}`);
                
                // Generate insights based on the data
                const insights = [];
                
                if (qoqChange > 0) {
                    insights.push(`• Quarter-over-quarter sales have increased by ${Math.abs(qoqChange).toFixed(1)}% 📈`);
                } else if (qoqChange < 0) {
                    insights.push(`• Quarter-over-quarter sales have decreased by ${Math.abs(qoqChange).toFixed(1)}% 📉`);
                } else {
                    insights.push(`• Quarter-over-quarter sales have remained stable ↔️`);
                }
                
                if (yoyChange > 0) {
                    insights.push(`• Year-over-year sales have increased by ${Math.abs(yoyChange).toFixed(1)}% 📈`);
                } else if (yoyChange < 0) {
                    insights.push(`• Year-over-year sales have decreased by ${Math.abs(yoyChange).toFixed(1)}% 📉`);
                } else {
                    insights.push(`• Year-over-year sales have remained stable ↔️`);
                }
                
                // Add insight about monthly performance
                if (Object.keys(monthlySales).length > 0) {
                    const bestMonth = Object.entries(monthlySales).sort((a, b) => b[1] - a[1])[0][0];
                    insights.push(`• ${bestMonth} had the highest sales within the quarter 🌟`);
                }
                
                // Generate recommendations based on the data
                const recommendations = [];
                
                if (qoqChange < 0) {
                    recommendations.push(`• Consider promotional strategies to reverse the sales decline from the previous quarter 📊`);
                }
                
                if (yoyChange < 0) {
                    recommendations.push(`• Review seasonal marketing strategies as sales are lower than the same quarter last year 📅`);
                }
                
                // Format response
                return `# QUARTERLY SALES ANALYSIS FROM EVERLODGEBOOKINGS COLLECTION 📊

## Sales Overview
• Current Quarter (${currentQuarterName}): ₱${currentQuarterSales.toLocaleString()}
• Previous Quarter (${previousQuarterName}): ₱${previousQuarterSales.toLocaleString()}
• Same Quarter Last Year (${lastYearQuarterName}): ₱${lastYearQuarterSales.toLocaleString()}

## Quarter-over-Quarter Change
• Change: ${qoqChange.toFixed(1)}% ${qoqChange >= 0 ? '📈' : '📉'}
• Total Bookings: ${currentQuarterBookings.length} vs ${previousQuarterBookings.length} last quarter

## Year-over-Year Change
• Change: ${yoyChange.toFixed(1)}% ${yoyChange >= 0 ? '📈' : '📉'}
• Total Bookings: ${currentQuarterBookings.length} vs ${lastYearQuarterBookings.length} same quarter last year

## Monthly Breakdown (Current Quarter)
${monthlySalesList.join('\n')}

## Key Insights
${insights.join('\n')}

## Strategic Recommendations
${recommendations.join('\n')}

All data is sourced directly from the everlodgebookings collection in Firebase, as requested, to ensure accurate and up-to-date sales analysis.`;
            } catch (error) {
                console.error('Error generating quarterly sales analysis:', error);
                return "I apologize, but I encountered an error while analyzing the quarterly sales data from the everlodgebookings collection. Please try again later.";
            }
        },

        async generateMonthlySalesResponse() {
            try {
                console.log('Generating monthly sales analysis with data from everlodgebookings collection');
                
                // Fetch the integrated data which pulls from everlodgebookings collection
                const data = await this.fetchIntegratedData();
                
                // Check if we have data to analyze
                if (!data || data.status === 'error' || !data.bookings || data.bookings.length === 0) {
                    return "I couldn't find any sales data in the everlodgebookings collection to analyze monthly trends.";
                }
                
                // Verify we're using data from the everlodgebookings collection
                if (data.dataSource !== 'everlodgebookings') {
                    console.warn('Warning: Not using everlodgebookings collection as requested');
                }
                
                // Define the current month period
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();
                const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                
                // Create date ranges
                const currentMonthStart = new Date(currentYear, currentMonth, 1);
                const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
                const previousMonthStart = new Date(previousMonthYear, previousMonth, 1);
                const previousMonthEnd = new Date(previousMonthYear, previousMonth + 1, 0);
                
                // Get the EverLodgeDataService to retrieve the same total sales value as BusinessAnalytics
                let totalSales = 0;
                try {
                    // Import the EverLodgeDataService directly to ensure we're using the same exact data source
                    const { EverLodgeDataService } = await import('../shared/everLodgeDataService.js');
                    const everLodgeData = await EverLodgeDataService.getEverLodgeData(true); // Force refresh to get latest data
                    
                    // Use the total sales value from EverLodgeDataService which is the same source used by BusinessAnalytics
                    totalSales = Math.round(everLodgeData.revenue.total); // Apply rounding to ensure exact match
                    
                    console.log('Retrieved total sales from EverLodgeDataService:', totalSales);
                } catch (error) {
                    console.error('Error retrieving data from EverLodgeDataService:', error);
                    
                    // If direct access fails, fall back to calculating it manually but use the same method
                    // Filter out cancelled bookings first (critical to match BusinessAnalytics)
                    const nonCancelledBookings = data.bookings.filter(booking => booking.status !== 'cancelled');
                    
                    // Calculate total sales from non-cancelled bookings only
                    totalSales = Math.round(nonCancelledBookings.reduce((total, booking) => 
                        total + (booking.totalPrice || 0), 0));
                    
                    console.log('Calculated fallback total sales:', totalSales);
                }
                
                // Filter bookings for current month, excluding cancelled
                const currentMonthBookings = data.bookings.filter(booking => {
                    // Skip cancelled bookings
                    if (booking.status === 'cancelled') return false;
                    
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    return bookingDate >= currentMonthStart && bookingDate <= currentMonthEnd;
                });
                
                // Filter bookings for previous month, excluding cancelled
                const previousMonthBookings = data.bookings.filter(booking => {
                    // Skip cancelled bookings
                    if (booking.status === 'cancelled') return false;
                    
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    return bookingDate >= previousMonthStart && bookingDate <= previousMonthEnd;
                });
                
                // Calculate month-over-month change
                const previousMonthSales = previousMonthBookings.reduce((total, booking) => 
                    total + (booking.totalPrice || 0), 0);
                    
                const momChange = previousMonthSales !== 0 ? 
                    ((totalSales - previousMonthSales) / previousMonthSales) * 100 : 
                    100;
                
                // Break down sales by room type for the current month
                const roomTypeSales = {};
                currentMonthBookings.forEach(booking => {
                    const roomType = booking?.propertyDetails?.roomType || 'Unknown';
                    if (!roomTypeSales[roomType]) {
                        roomTypeSales[roomType] = 0;
                    }
                    roomTypeSales[roomType] += (booking.totalPrice || 0);
                });
                
                // Format room type sales for display
                const roomTypeSalesList = Object.entries(roomTypeSales)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, sales]) => `• ${type}: ₱${sales.toLocaleString()} (${(sales / totalSales * 100).toFixed(1)}%)`);
                
                // Calculate average booking value
                const avgBookingValue = currentMonthBookings.length > 0 ? 
                    totalSales / currentMonthBookings.length : 0;
                
                // Identify highest and lowest performing room types
                const highestRoomType = Object.entries(roomTypeSales).length > 0 ? 
                    Object.entries(roomTypeSales).sort((a, b) => b[1] - a[1])[0] : 
                    ['None', 0];
                
                const lowestRoomType = Object.entries(roomTypeSales).length > 0 ? 
                    Object.entries(roomTypeSales).sort((a, b) => a[1] - b[1])[0] : 
                    ['None', 0];
                
                // Generate insights
                const insights = [];
                
                if (momChange > 0) {
                    insights.push(`• Month-over-month sales have increased by ${Math.abs(momChange).toFixed(1)}% 📈`);
                } else if (momChange < 0) {
                    insights.push(`• Month-over-month sales have decreased by ${Math.abs(momChange).toFixed(1)}% 📉`);
                } else {
                    insights.push(`• Month-over-month sales have remained stable ↔️`);
                }
                
                if (highestRoomType[0] !== 'None') {
                    insights.push(`• ${highestRoomType[0]} rooms generated the highest revenue this month (${(highestRoomType[1] / totalSales * 100).toFixed(1)}% of total) 🏆`);
                }
                
                if (currentMonthBookings.length > previousMonthBookings.length) {
                    insights.push(`• Booking volume increased from ${previousMonthBookings.length} to ${currentMonthBookings.length} bookings 📊`);
                } else if (currentMonthBookings.length < previousMonthBookings.length) {
                    insights.push(`• Booking volume decreased from ${previousMonthBookings.length} to ${currentMonthBookings.length} bookings 📊`);
                }
                
                // Generate recommendations
                const recommendations = [];
                
                if (momChange < 0) {
                    recommendations.push(`• Consider running promotions to boost sales for the remainder of the month 🏷️`);
                    recommendations.push(`• Review pricing strategy for underperforming room types 📝`);
                }
                
                if (lowestRoomType[0] !== 'None') {
                    recommendations.push(`• Focus marketing efforts on the ${lowestRoomType[0]} room type to increase its contribution to total sales 📣`);
                }
                
                // Generate the response
                const monthName = currentMonthStart.toLocaleString('default', { month: 'long' });
                const formattedMoMChange = momChange >= 0 ? `+${momChange.toFixed(1)}%` : `${momChange.toFixed(1)}%`;
                
                return `# EverLodge Total Sales Analysis: ${monthName} ${currentYear} 📊

## Monthly Sales Summary (Data from everlodgebookings)
Total Sales This Month: ₱${totalSales.toLocaleString()}
Month-over-Month Change: ${formattedMoMChange} ${momChange >= 0 ? '📈' : '📉'}
Total Bookings: ${currentMonthBookings.length} reservations
Average Booking Value: ₱${avgBookingValue.toLocaleString()}

## Sales Breakdown by Room Type
${roomTypeSalesList.join('\n')}

## Key Insights
${insights.join('\n')}

## Recommendations
${recommendations.join('\n')}

All data is sourced directly from the everlodgebookings collection in Firebase, as requested, to ensure accurate and up-to-date sales analysis.`;
            } catch (error) {
                console.error('Error generating monthly sales analysis:', error);
                return "I apologize, but I encountered an error while analyzing the monthly sales data from the everlodgebookings collection. Please try again later.";
            }
        },

        async generateBookingPatternsResponse(data) {
            try {
                console.log('Generating booking patterns analysis with data from everlodgebookings collection');
                
                // Check if we have data to analyze
                if (!data || data.status === 'error' || !data.bookings || data.bookings.length === 0) {
                    return "I couldn't find any booking data in the everlodgebookings collection to analyze patterns.";
                }
                
                // Define the current month period
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();
                
                // Create date ranges
                const currentMonthStart = new Date(currentYear, currentMonth, 1);
                const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
                
                // Filter bookings for current month
                const currentMonthBookings = data.bookings.filter(booking => {
                    const bookingDate = booking.checkIn instanceof Date ? booking.checkIn : 
                                        booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                        new Date(booking.checkIn);
                    return bookingDate >= currentMonthStart && bookingDate <= currentMonthEnd;
                });
                
                console.log(`Found ${currentMonthBookings.length} bookings for the current month`);
                
                // If no bookings for current month, return early
                if (currentMonthBookings.length === 0) {
                    return "I couldn't find any bookings for the current month in the everlodgebookings collection.";
                }
                
                // 1. Analyze booking days of week distribution
                const dayOfWeekDistribution = {
                    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
                };
                
                // 2. Analyze booking time distribution (morning, afternoon, evening)
                const timeDistribution = {
                    morning: 0,     // 6:00 AM - 11:59 AM
                    afternoon: 0,   // 12:00 PM - 5:59 PM
                    evening: 0      // 6:00 PM - 11:59 PM
                };
                
                // 3. Analyze lead time (days between booking and check-in)
                const leadTimes = [];
                
                // 4. Analyze booking duration (length of stay)
                const stayDurations = [];
                
                // 5. Analyze room type distribution
                const roomTypeDistribution = {};
                
                // 6. Analyze guest count distribution
                const guestCountDistribution = {};
                
                // Process each booking for analysis
                currentMonthBookings.forEach(booking => {
                    // Extract booking creation date
                    const createdAt = booking.createdAt instanceof Date ? booking.createdAt : 
                                    booking.createdAt?.toDate ? booking.createdAt.toDate() : 
                                    new Date(booking.createdAt);
                    
                    // Extract check-in date
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : 
                                    booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                    new Date(booking.checkIn);
                    
                    // Extract check-out date
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : 
                                    booking.checkOut?.toDate ? booking.checkOut.toDate() : 
                                    new Date(booking.checkOut);
                    
                    // 1. Day of week distribution (0 = Sunday, 6 = Saturday)
                    const bookingDayOfWeek = createdAt.getDay();
                    dayOfWeekDistribution[bookingDayOfWeek]++;
                    
                    // 2. Time distribution
                    const bookingHour = createdAt.getHours();
                    if (bookingHour >= 6 && bookingHour < 12) {
                        timeDistribution.morning++;
                    } else if (bookingHour >= 12 && bookingHour < 18) {
                        timeDistribution.afternoon++;
                    } else {
                        timeDistribution.evening++;
                    }
                    
                    // 3. Lead time calculation (days between booking and check-in)
                    const leadTimeMs = checkIn.getTime() - createdAt.getTime();
                    const leadTimeDays = Math.round(leadTimeMs / (1000 * 60 * 60 * 24));
                    if (leadTimeDays >= 0) { // Only count valid lead times
                        leadTimes.push(leadTimeDays);
                    }
                    
                    // 4. Stay duration calculation
                    if (checkIn && checkOut) {
                        const stayMs = checkOut.getTime() - checkIn.getTime();
                        const stayDays = Math.round(stayMs / (1000 * 60 * 60 * 24));
                        if (stayDays > 0) { // Only count valid stay durations
                            stayDurations.push(stayDays);
                        }
                    }
                    
                    // 5. Room type distribution
                    const roomType = booking?.propertyDetails?.roomType || 'Unknown';
                    roomTypeDistribution[roomType] = (roomTypeDistribution[roomType] || 0) + 1;
                    
                    // 6. Guest count distribution
                    const guestCount = booking.guests || 0;
                    guestCountDistribution[guestCount] = (guestCountDistribution[guestCount] || 0) + 1;
                });
                
                // Calculate averages and other insights
                // Average lead time
                const avgLeadTime = leadTimes.length > 0 
                    ? leadTimes.reduce((sum, val) => sum + val, 0) / leadTimes.length 
                    : 0;
                
                // Average stay duration
                const avgStayDuration = stayDurations.length > 0 
                    ? stayDurations.reduce((sum, val) => sum + val, 0) / stayDurations.length 
                    : 0;
                
                // Most common room type
                const mostCommonRoomType = Object.entries(roomTypeDistribution)
                    .sort((a, b) => b[1] - a[1])[0] || ['Unknown', 0];
                
                // Most common guest count
                const mostCommonGuestCount = Object.entries(guestCountDistribution)
                    .sort((a, b) => b[1] - a[1])[0] || [0, 0];
                
                // Most popular booking day
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const mostPopularDay = Object.entries(dayOfWeekDistribution)
                    .sort((a, b) => b[1] - a[1])[0] || [0, 0];
                
                // Most popular booking time
                const mostPopularTime = Object.entries(timeDistribution)
                    .sort((a, b) => b[1] - a[1])[0] || ['Unknown', 0];
                
                // Format distributions for display
                const dayDistributionText = Object.entries(dayOfWeekDistribution)
                    .map(([day, count]) => {
                        const percentage = (count / currentMonthBookings.length) * 100;
                        return `• ${dayNames[day]}: ${count} bookings (${percentage.toFixed(1)}%)`;
                    })
                    .join('\n');
                
                const timeDistributionText = Object.entries(timeDistribution)
                    .map(([time, count]) => {
                        const percentage = (count / currentMonthBookings.length) * 100;
                        const timeLabel = time.charAt(0).toUpperCase() + time.slice(1);
                        return `• ${timeLabel}: ${count} bookings (${percentage.toFixed(1)}%)`;
                    })
                    .join('\n');
                
                const roomTypeDistributionText = Object.entries(roomTypeDistribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                        const percentage = (count / currentMonthBookings.length) * 100;
                        return `• ${type}: ${count} bookings (${percentage.toFixed(1)}%)`;
                    })
                    .join('\n');
                
                // Calculate lead time distribution buckets
                const leadTimeBuckets = {
                    'Same day (0 days)': 0,
                    '1-7 days': 0,
                    '8-14 days': 0,
                    '15-30 days': 0,
                    '31-60 days': 0,
                    '61+ days': 0
                };
                
                leadTimes.forEach(days => {
                    if (days === 0) leadTimeBuckets['Same day (0 days)']++;
                    else if (days <= 7) leadTimeBuckets['1-7 days']++;
                    else if (days <= 14) leadTimeBuckets['8-14 days']++;
                    else if (days <= 30) leadTimeBuckets['15-30 days']++;
                    else if (days <= 60) leadTimeBuckets['31-60 days']++;
                    else leadTimeBuckets['61+ days']++;
                });
                
                const leadTimeDistributionText = Object.entries(leadTimeBuckets)
                    .map(([bucket, count]) => {
                        const percentage = leadTimes.length > 0 ? (count / leadTimes.length) * 100 : 0;
                        return `• ${bucket}: ${count} bookings (${percentage.toFixed(1)}%)`;
                    })
                    .join('\n');
                
                // Calculate stay duration distribution buckets
                const stayBuckets = {
                    '1 night': 0,
                    '2 nights': 0,
                    '3 nights': 0,
                    '4-6 nights': 0,
                    '1 week+': 0,
                    '2 weeks+': 0
                };
                
                stayDurations.forEach(days => {
                    if (days === 1) stayBuckets['1 night']++;
                    else if (days === 2) stayBuckets['2 nights']++;
                    else if (days === 3) stayBuckets['3 nights']++;
                    else if (days <= 6) stayBuckets['4-6 nights']++;
                    else if (days <= 13) stayBuckets['1 week+']++;
                    else stayBuckets['2 weeks+']++;
                });
                
                const stayDurationText = Object.entries(stayBuckets)
                    .map(([bucket, count]) => {
                        const percentage = stayDurations.length > 0 ? (count / stayDurations.length) * 100 : 0;
                        return `• ${bucket}: ${count} bookings (${percentage.toFixed(1)}%)`;
                    })
                    .join('\n');
                
                // Generate insights based on the data
                const insights = [];
                
                // Insight: Most popular booking day and time
                insights.push(`• Most bookings are made on ${dayNames[mostPopularDay[0]]}s during the ${mostPopularTime[0]} hours 📅`);
                
                // Insight: Lead time booking pattern
                if (avgLeadTime <= 7) {
                    insights.push(`• Guests tend to book at the last minute (avg. ${avgLeadTime.toFixed(1)} days in advance) ⏱️`);
                } else if (avgLeadTime <= 30) {
                    insights.push(`• Guests typically book ${avgLeadTime.toFixed(1)} days in advance ⏱️`);
                } else {
                    insights.push(`• Guests plan well ahead, booking ${avgLeadTime.toFixed(1)} days in advance ⏱️`);
                }
                
                // Insight: Stay duration pattern
                insights.push(`• Average stay duration is ${avgStayDuration.toFixed(1)} nights per booking 🌙`);
                
                // Insight: Most popular room and guest count
                insights.push(`• ${mostCommonRoomType[0]} rooms are the most frequently booked (${mostCommonRoomType[1]} bookings) 🏠`);
                if (mostCommonGuestCount[0] > 0) {
                    insights.push(`• Most bookings (${mostCommonGuestCount[1]}) are for ${mostCommonGuestCount[0]} guests 👥`);
                }
                
                // Generate recommendations based on the data
                const recommendations = [];
                
                // Recommendation: Booking day optimization
                recommendations.push(`• Optimize staffing for ${dayNames[mostPopularDay[0]]}s when booking volumes are highest 📈`);
                
                // Recommendation: Lead time optimization
                if (avgLeadTime < 14) {
                    recommendations.push(`• Run last-minute promotions to capture the short lead time booking behavior 🏷️`);
                } else {
                    recommendations.push(`• Offer early bird discounts to encourage the advance booking behavior 🏷️`);
                }
                
                // Recommendation: Stay duration optimization
                if (avgStayDuration < 3) {
                    recommendations.push(`• Create special packages for 3+ night stays to increase average stay duration 📦`);
                } else {
                    recommendations.push(`• Consider weekly rate options to capitalize on longer stay preferences 💰`);
                }
                
                // Recommendation: Room type optimization
                const leastBookedRoomType = Object.entries(roomTypeDistribution)
                    .sort((a, b) => a[1] - b[1])[0] || ['Unknown', 0];
                    
                if (leastBookedRoomType[0] !== 'Unknown' && leastBookedRoomType[0] !== mostCommonRoomType[0]) {
                    recommendations.push(`• Review and promote ${leastBookedRoomType[0]} rooms which currently have the lowest booking rate 🔍`);
                }
                
                // Get month name for the report title
                const monthName = currentMonthStart.toLocaleString('default', { month: 'long' });
                
                // Format the comprehensive response
                return `# EverLodge Booking Patterns Analysis: ${monthName} ${currentYear} 📊

## Overview
Based on data from the everlodgebookings collection, there have been ${currentMonthBookings.length} bookings in ${monthName}.

## Booking Day & Time Distribution
${dayDistributionText}

${timeDistributionText}

## Lead Time Analysis
Average Lead Time: ${avgLeadTime.toFixed(1)} days in advance

${leadTimeDistributionText}

## Stay Duration Analysis
Average Stay: ${avgStayDuration.toFixed(1)} nights

${stayDurationText}

## Room Type Distribution
${roomTypeDistributionText}

## Key Insights
${insights.join('\n')}

## Strategic Recommendations
${recommendations.join('\n')}

All data is sourced directly from the everlodgebookings collection in Firebase to ensure accurate and up-to-date booking pattern analysis.`;
                
            } catch (error) {
                console.error('Error generating booking patterns analysis:', error);
                return "I apologize, but I encountered an error while analyzing the booking patterns data from the everlodgebookings collection. Please try again later.";
            }
        },

        async generatePeakBookingSeasonResponse(data) {
            try {
                console.log('Generating peak booking season analysis with data from everlodgebookings collection');
                
                // Check if we have data to analyze
                if (!data || data.status === 'error' || !data.bookings || data.bookings.length === 0) {
                    return "I couldn't find any booking data in the everlodgebookings collection to analyze peak seasons.";
                }
                
                // Step 1: Organize bookings by month
                const monthlyBookings = {};
                const monthNames = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ];
                
                // Initialize monthly counts
                monthNames.forEach(month => {
                    monthlyBookings[month] = {
                        count: 0,
                        revenue: 0,
                        averageStay: 0,
                        stayDurations: [],
                        leadTimes: [],
                        bookedDates: [] // Track actual dates for weekly analysis
                    };
                });
                
                // Track bookings by year-month to see trends over time
                const yearMonthBookings = {};
                
                // Analyze each booking
                data.bookings.forEach(booking => {
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : 
                                   booking.checkIn?.toDate ? booking.checkIn.toDate() : 
                                   new Date(booking.checkIn);
                    
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : 
                                    booking.checkOut?.toDate ? booking.checkOut.toDate() : 
                                    new Date(booking.checkOut);
                    
                    const createdAt = booking.createdAt instanceof Date ? booking.createdAt : 
                                     booking.createdAt?.toDate ? booking.createdAt.toDate() : 
                                     new Date(booking.createdAt);
                    
                    // Skip invalid dates
                    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
                        return;
                    }
                    
                    const monthName = monthNames[checkIn.getMonth()];
                    const yearMonth = `${checkIn.getFullYear()}-${checkIn.getMonth() + 1}`;
                    
                    // Count by month
                    monthlyBookings[monthName].count++;
                    monthlyBookings[monthName].revenue += (booking.totalPrice || 0);
                    monthlyBookings[monthName].bookedDates.push(checkIn);
                    
                    // Calculate stay duration
                    if (checkOut) {
                        const stayMs = checkOut.getTime() - checkIn.getTime();
                        const stayDays = Math.round(stayMs / (1000 * 60 * 60 * 24));
                        if (stayDays > 0) {
                            monthlyBookings[monthName].stayDurations.push(stayDays);
                        }
                    }
                    
                    // Calculate lead time
                    if (createdAt) {
                        const leadTimeMs = checkIn.getTime() - createdAt.getTime();
                        const leadTimeDays = Math.round(leadTimeMs / (1000 * 60 * 60 * 24));
                        if (leadTimeDays >= 0) {
                            monthlyBookings[monthName].leadTimes.push(leadTimeDays);
                        }
                    }
                    
                    // Track by year-month for trend analysis
                    if (!yearMonthBookings[yearMonth]) {
                        yearMonthBookings[yearMonth] = {
                            year: checkIn.getFullYear(),
                            month: checkIn.getMonth(),
                            count: 0,
                            revenue: 0
                        };
                    }
                    yearMonthBookings[yearMonth].count++;
                    yearMonthBookings[yearMonth].revenue += (booking.totalPrice || 0);
                });
                
                // Calculate average stay duration for each month
                Object.keys(monthlyBookings).forEach(month => {
                    const durations = monthlyBookings[month].stayDurations;
                    monthlyBookings[month].averageStay = durations.length > 0 
                        ? durations.reduce((sum, val) => sum + val, 0) / durations.length 
                        : 0;
                    
                    // Calculate average lead time
                    const leadTimes = monthlyBookings[month].leadTimes;
                    monthlyBookings[month].averageLeadTime = leadTimes.length > 0 
                        ? leadTimes.reduce((sum, val) => sum + val, 0) / leadTimes.length 
                        : 0;
                    
                    // Analyze day of week distribution for this month
                    const dayOfWeekDistribution = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
                    monthlyBookings[month].bookedDates.forEach(date => {
                        dayOfWeekDistribution[date.getDay()]++;
                    });
                    monthlyBookings[month].dayOfWeekDistribution = dayOfWeekDistribution;
                });
                
                // Sort months by booking count to identify peak season
                const sortedMonths = Object.keys(monthlyBookings)
                    .map(month => ({
                        name: month,
                        ...monthlyBookings[month]
                    }))
                    .sort((a, b) => b.count - a.count);
                
                // Identify the peak season months (top 3)
                const peakMonths = sortedMonths.slice(0, 3);
                
                // Identify the off-season months (bottom 3)
                const offSeasonMonths = sortedMonths.slice(-3).reverse();
                
                // Find consecutive peak months to identify seasons
                const seasonalGroups = identifySeasons(sortedMonths, monthNames);
                
                // Analyze year-over-year trends for peak months
                const yearlyTrends = analyzeYearlyTrends(yearMonthBookings, peakMonths);
                
                // Identify the most popular day of week during peak months
                const peakDayOfWeek = identifyPeakDayOfWeek(peakMonths);
                
                // Generate key insights
                const insights = generateInsights(peakMonths, offSeasonMonths, seasonalGroups, yearlyTrends, peakDayOfWeek);
                
                // Generate recommendations
                const recommendations = generateRecommendations(peakMonths, offSeasonMonths, seasonalGroups, yearlyTrends);
                
                // Format monthly data for display
                const monthlyDataText = sortedMonths
                    .map(month => {
                        const percentOfTotal = (month.count / data.bookings.length) * 100;
                        return `• ${month.name}: ${month.count} bookings (${percentOfTotal.toFixed(1)}%) - Avg Stay: ${month.averageStay.toFixed(1)} nights`;
                    })
                    .join('\n');
                
                // Format seasonal data for display
                const seasonalDataText = seasonalGroups
                    .map(season => {
                        const monthList = season.months.map(m => m.name).join(', ');
                        return `• ${season.name}: ${monthList} (${season.bookingCount} total bookings, ${season.percentOfTotal.toFixed(1)}% of yearly total)`;
                    })
                    .join('\n');
                
                // Create bar chart values for visualization in the report
                const monthlyChartData = monthNames.map(month => {
                    return {
                        month, 
                        value: monthlyBookings[month].count
                    };
                });
                
                // Get the current year for the report title
                const currentYear = new Date().getFullYear();
                
                // Generate the comprehensive report
                return `# EverLodge Peak Booking Season Analysis 📊

## Overview
Based on data from the everlodgebookings collection, I've analyzed booking patterns across different months and seasons to identify our peak booking periods.

## Monthly Booking Distribution
${monthlyDataText}

## Peak Season Identification
Our **peak booking season** consists of the following months:
${peakMonths.map(month => `• ${month.name}: ${month.count} bookings (${(month.count / data.bookings.length * 100).toFixed(1)}% of annual bookings) 🔥`).join('\n')}

## Off-Season Periods
Our **lowest booking periods** are:
${offSeasonMonths.map(month => `• ${month.name}: ${month.count} bookings (${(month.count / data.bookings.length * 100).toFixed(1)}% of annual bookings)`).join('\n')}

## Seasonal Patterns
${seasonalDataText}

## Key Insights
${insights.join('\n')}

## Strategic Recommendations
${recommendations.join('\n')}

All data is sourced directly from the everlodgebookings collection in Firebase to ensure accurate and up-to-date seasonal analysis.`;
                
                // Helper function to identify seasons (consecutive months with high booking counts)
                function identifySeasons(sortedMonths, monthNames) {
                    // Convert to month indices and sort chronologically
                    const monthIndices = sortedMonths.map(month => ({
                        index: monthNames.indexOf(month.name),
                        count: month.count,
                        ...month
                    })).sort((a, b) => a.index - b.index);
                    
                    // Calculate average bookings to determine high vs low season
                    const totalBookings = monthIndices.reduce((sum, month) => sum + month.count, 0);
                    const averageMonthlyBookings = totalBookings / 12;
                    
                    // Group consecutive months with above-average bookings
                    const seasons = [];
                    let currentSeason = null;
                    
                    for (let i = 0; i < monthIndices.length; i++) {
                        const month = monthIndices[i];
                        
                        if (month.count >= averageMonthlyBookings) {
                            // This is a peak month
                            if (!currentSeason) {
                                currentSeason = {
                                    months: [month],
                                    bookingCount: month.count
                                };
                            } else {
                                currentSeason.months.push(month);
                                currentSeason.bookingCount += month.count;
                            }
                        } else if (currentSeason) {
                            // End of a season
                            if (currentSeason.months.length > 0) {
                                seasons.push(currentSeason);
                            }
                            currentSeason = null;
                        }
                    }
                    
                    // Handle wrap-around season (December to January)
                    if (currentSeason && 
                        monthIndices[0].count >= averageMonthlyBookings && 
                        monthIndices[monthIndices.length - 1].count >= averageMonthlyBookings) {
                        
                        // Combine the last season with the first season
                        if (seasons.length > 0) {
                            const firstSeason = seasons[0];
                            firstSeason.months = [...currentSeason.months, ...firstSeason.months];
                            firstSeason.bookingCount = firstSeason.months.reduce((sum, month) => sum + month.count, 0);
                        } else {
                            seasons.push(currentSeason);
                        }
                    } else if (currentSeason) {
                        seasons.push(currentSeason);
                    }
                    
                    // Name the seasons and calculate percentages
                    return seasons.map(season => {
                        const firstMonth = season.months[0].name;
                        const lastMonth = season.months[season.months.length - 1].name;
                        return {
                            name: `${firstMonth} to ${lastMonth}`,
                            months: season.months,
                            bookingCount: season.bookingCount,
                            percentOfTotal: (season.bookingCount / totalBookings) * 100
                        };
                    });
                }
                
                // Helper function to analyze year-over-year trends
                function analyzeYearlyTrends(yearMonthBookings, peakMonths) {
                    const trends = {};
                    
                    // Extract peak month indices
                    const peakMonthIndices = peakMonths.map(month => monthNames.indexOf(month.name));
                    
                    // Group data by year and month
                    Object.values(yearMonthBookings).forEach(entry => {
                        if (peakMonthIndices.includes(entry.month)) {
                            const monthName = monthNames[entry.month];
                            if (!trends[monthName]) {
                                trends[monthName] = [];
                            }
                            trends[monthName].push({
                                year: entry.year,
                                count: entry.count,
                                revenue: entry.revenue
                            });
                        }
                    });
                    
                    // Calculate growth rates
                    Object.keys(trends).forEach(month => {
                        const yearData = trends[month].sort((a, b) => a.year - b.year);
                        
                        if (yearData.length >= 2) {
                            const currentYear = yearData[yearData.length - 1];
                            const previousYear = yearData[yearData.length - 2];
                            
                            const growthRate = previousYear.count > 0 
                                ? ((currentYear.count - previousYear.count) / previousYear.count) * 100 
                                : 100;
                                
                            trends[month].growthRate = growthRate;
                        }
                    });
                    
                    return trends;
                }
                
                // Helper function to identify the most popular day of week during peak months
                function identifyPeakDayOfWeek(peakMonths) {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const combinedDistribution = [0, 0, 0, 0, 0, 0, 0];
                    
                    // Combine day of week distributions from all peak months
                    peakMonths.forEach(month => {
                        const distribution = month.dayOfWeekDistribution || [0, 0, 0, 0, 0, 0, 0];
                        for (let i = 0; i < 7; i++) {
                            combinedDistribution[i] += distribution[i];
                        }
                    });
                    
                    // Find the most popular day
                    let maxIndex = 0;
                    for (let i = 1; i < 7; i++) {
                        if (combinedDistribution[i] > combinedDistribution[maxIndex]) {
                            maxIndex = i;
                        }
                    }
                    
                    // Find weekday vs weekend distribution
                    const weekdayCount = combinedDistribution[1] + combinedDistribution[2] + 
                                        combinedDistribution[3] + combinedDistribution[4] + 
                                        combinedDistribution[5];
                    const weekendCount = combinedDistribution[0] + combinedDistribution[6];
                    const totalCount = weekdayCount + weekendCount;
                    
                    return {
                        mostPopularDay: dayNames[maxIndex],
                        mostPopularDayCount: combinedDistribution[maxIndex],
                        weekdayPercentage: totalCount > 0 ? (weekdayCount / totalCount) * 100 : 0,
                        weekendPercentage: totalCount > 0 ? (weekendCount / totalCount) * 100 : 0
                    };
                }
                
                // Helper function to generate insights
                function generateInsights(peakMonths, offSeasonMonths, seasonalGroups, yearlyTrends, peakDayOfWeek) {
                    const insights = [];
                    
                    // Primary peak season insight
                    if (peakMonths.length > 0) {
                        insights.push(`• Our peak booking season centers around ${peakMonths[0].name} with ${peakMonths[0].count} bookings 📈`);
                    }
                    
                    // Seasonal pattern insight
                    if (seasonalGroups.length > 0) {
                        const mainSeason = seasonalGroups[0];
                        insights.push(`• Our main high season runs from ${mainSeason.name}, accounting for ${mainSeason.percentOfTotal.toFixed(1)}% of all bookings 🗓️`);
                    }
                    
                    // Year-over-year trend insight
                    const growthInsights = Object.entries(yearlyTrends)
                        .filter(([month, data]) => data.growthRate !== undefined)
                        .sort((a, b) => Math.abs(b[1].growthRate) - Math.abs(a[1].growthRate));
                    
                    if (growthInsights.length > 0) {
                        const [month, data] = growthInsights[0];
                        const trendEmoji = data.growthRate >= 0 ? '📈' : '📉';
                        insights.push(`• ${month} shows the most significant year-over-year ${data.growthRate >= 0 ? 'growth' : 'decline'} at ${Math.abs(data.growthRate).toFixed(1)}% ${trendEmoji}`);
                    }
                    
                    // Stay duration insight
                    if (peakMonths.length > 0) {
                        const peakMonth = peakMonths[0];
                        insights.push(`• Average stay during peak season (${peakMonth.name}): ${peakMonth.averageStay.toFixed(1)} nights per booking 🌙`);
                    }
                    
                    // Lead time insight
                    if (peakMonths.length > 0) {
                        const peakMonth = peakMonths[0];
                        insights.push(`• Guests book ${peakMonth.averageLeadTime.toFixed(1)} days in advance during our peak season ⏱️`);
                    }
                    
                    // Day of week insight
                    if (peakDayOfWeek) {
                        insights.push(`• ${peakDayOfWeek.mostPopularDay}s are the most common check-in days during peak season 📅`);
                        
                        if (peakDayOfWeek.weekendPercentage > peakDayOfWeek.weekdayPercentage) {
                            insights.push(`• Weekend check-ins (${peakDayOfWeek.weekendPercentage.toFixed(1)}%) are more popular than weekdays (${peakDayOfWeek.weekdayPercentage.toFixed(1)}%) 🏖️`);
                        } else {
                            insights.push(`• Weekday check-ins (${peakDayOfWeek.weekdayPercentage.toFixed(1)}%) are more common than weekends (${peakDayOfWeek.weekendPercentage.toFixed(1)}%) 💼`);
                        }
                    }
                    
                    return insights;
                }
                
                // Helper function to generate recommendations
                function generateRecommendations(peakMonths, offSeasonMonths, seasonalGroups, yearlyTrends) {
                    const recommendations = [];
                    
                    // Peak season pricing strategy
                    if (peakMonths.length > 0) {
                        recommendations.push(`• Implement dynamic pricing during ${peakMonths.map(m => m.name).join('/')} to capitalize on high demand 💰`);
                    }
                    
                    // Off-season promotion strategy
                    if (offSeasonMonths.length > 0) {
                        recommendations.push(`• Develop special packages and promotions for ${offSeasonMonths.map(m => m.name).join('/')} to boost bookings during slower periods 🏷️`);
                    }
                    
                    // Seasonal staffing recommendation
                    if (seasonalGroups.length > 0) {
                        const mainSeason = seasonalGroups[0];
                        recommendations.push(`• Adjust staffing levels to accommodate the ${mainSeason.name} high season, when we see ${mainSeason.percentOfTotal.toFixed(1)}% of annual bookings 👥`);
                    }
                    
                    // Marketing timing recommendation
                    if (peakMonths.length > 0) {
                        const peakMonth = peakMonths[0];
                        const leadTime = Math.max(30, Math.round(peakMonth.averageLeadTime));
                        const marketingMonth = monthNames[(monthNames.indexOf(peakMonth.name) - Math.ceil(leadTime / 30) + 12) % 12];
                        recommendations.push(`• Increase marketing efforts during ${marketingMonth} to capture bookings for the ${peakMonth.name} peak period 📣`);
                    }
                    
                    // Maintenance scheduling
                    if (offSeasonMonths.length > 0) {
                        recommendations.push(`• Schedule major renovation and maintenance work during ${offSeasonMonths[0].name}, our lowest booking period 🔧`);
                    }
                    
                    // Year-round revenue strategy
                    recommendations.push(`• Create seasonal experiences and packages to even out occupancy throughout the year and reduce dependency on peak seasons 📆`);
                    
                    return recommendations;
                }
                
            } catch (error) {
                console.error('Error generating peak booking season analysis:', error);
                return "I apologize, but I encountered an error while analyzing the peak booking season data from the everlodgebookings collection. Please try again later.";
            }
        },
    },
    async mounted() {
        await this.initializeApp();
    }
});

// Initialize page logging
auth.onAuthStateChanged((user) => {
    if (user) {
        PageLogger.logNavigation('AI Assistant');
    }
});

// Export any necessary functions
export {
    logAIActivity
};