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
import { getMonthlyOccupancyByRoomType } from '../../ClientSide/Lodge/lodge13.js';

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

new Vue({
    el: '#app',
    data: {
        // Keep only chat-related data
        isAuthenticated: false,
        loading: false,
        currentMessage: '',
        messages: [],
        suggestions: [
            { label: 'Occupancy Analysis', text: 'Show me detailed occupancy trends for the last 6 months' },
            { label: 'Sales Analysis', text: 'What is our revenue performance compared to last year?' },
            { label: 'Booking Patterns', text: 'Show booking patterns and peak hours' },
            { label: 'Performance Report', text: 'Give me a full business performance report' },
            { label: 'Customer Satisfaction', text: 'What are the current customer satisfaction metrics?' }
        ],
        messageCache: new Map(),
        errorRetryCount: 0,
        maxRetries: 3,
        firebaseInitialized: false,
        connectionError: null,
        analyticsData: {
            occupancyRate: 0,
            revenue: 0,
            bookings: 0,
            satisfaction: 0
        },
        integratedData: {
            rooms: [],
            bookings: [],
            revenue: [],
            customers: [],
            activities: []
        },
        predictions: {
            occupancy: null,
            loading: false,
            error: null
        }
    },
    methods: {
        // Add this new method
        addMessage(text, type = 'bot', visualData = null) {
            const message = {
                id: Date.now(),
                text: text,
                type: type,
                timestamp: new Date(),
                visualData: visualData
            };
            
            const chatContainer = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}`;
            
            let messageContent = `
                <div class="message-avatar ${type}">
                    <i class="fas ${type === 'bot' ? 'fa-robot' : 'fa-user'}"></i>
                </div>
                <div class="message-content">
                    ${text}
                </div>
            `;
            
            messageDiv.innerHTML = messageContent;
            chatContainer.appendChild(messageDiv);
            
            // Add visualization if provided
            if (visualData && type === 'bot') {
                this.addVisualization(messageDiv, visualData);
            }
            
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            this.messages.push(message);
        },

        addVisualization(messageDiv, visualData) {
            // Create container for the chart
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            
            // Add canvas for chart.js
            const canvas = document.createElement('canvas');
            canvas.id = `chart-${Date.now()}`;
            canvas.width = 500;
            canvas.height = 300;
            chartContainer.appendChild(canvas);
            
            // Add chart container to the message
            messageDiv.querySelector('.message-content').appendChild(chartContainer);
            
            // Initialize chart.js
            new Chart(canvas, visualData);
        },

        // Keep only chat-related methods
        // Remove all chart and visualization methods
        async handleLogout() {
            try {
                await signOut(auth);
                window.location.href = '../Login/index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                alert('Error signing out. Please try again.');
            }
        },

        checkAuthState() {
            return new Promise((resolve, reject) => {
                const user = auth.currentUser;
                console.log('Current user in checkAuthState:', user?.email);
                
                if (!user) {
                    this.isAuthenticated = false;
                    window.location.href = '../Login/index.html';
                    reject(new Error('Not authenticated'));
                    return;
                }

                this.isAuthenticated = true;
                this.loading = false;
                resolve(user);
            });
        },

        async initializeApp() {
            try {
                this.loading = true;
                // Initialize Firebase
                const initialized = await initializeFirebase();
                if (!initialized) {
                    throw new Error('Failed to initialize Firebase');
                }
                this.firebaseInitialized = true;

                // Check authentication
                const user = await getCurrentUser();
                if (!user) {
                    window.location.href = '../Login/index.html';
                    return;
                }

                this.isAuthenticated = true;
                await logPageNavigation(user.uid, 'AI Analysis');

                // Start new chat after successful initialization
                this.startNewChat();
            } catch (error) {
                console.error('Initialization error:', error);
                this.connectionError = error.message;
            } finally {
                this.loading = false;
            }
        },

        async processQuery(message) {
            try {
                const lowerMessage = message.toLowerCase();

                // Fetch data first to avoid multiple fetches
                const data = await this.fetchIntegratedData();
                if (!data || data.status === 'error') {
                    throw new Error('Unable to fetch required data');
                }

                // Add guest preference analysis
                if (lowerMessage.includes('guest') && 
                    (lowerMessage.includes('preference') || lowerMessage.includes('prefer'))) {
                    return await this.generateGuestPreferenceAnalysis(data);
                }

                // Check for quarterly sales analysis
                if (lowerMessage.includes('quarter') && 
                    (lowerMessage.includes('sales') || lowerMessage.includes('revenue'))) {
                    return await this.generateQuarterlyAnalysis(data);
                }

                // Check for year-over-year or month-over-month comparison
                if (lowerMessage.includes('compare') || 
                    lowerMessage.includes('vs') || 
                    lowerMessage.includes('versus') ||
                    lowerMessage.includes('last year') ||
                    lowerMessage.includes('previous year')) {
                    return await this.generateHistoricalComparison(data, lowerMessage);
                }

                // Check for competitor comparison
                if (lowerMessage.includes('competitor') || 
                    (lowerMessage.includes('compare') && lowerMessage.includes('local'))) {
                    return await this.generateCompetitorAnalysis(data);
                }

                // Check for prediction/forecast queries
                if (lowerMessage.includes('expect') || 
                    lowerMessage.includes('predict') || 
                    lowerMessage.includes('forecast') ||
                    lowerMessage.includes('upcoming')) {
                    return await this.generatePrediction(data, lowerMessage);
                }

                // Check for business performance query
                if (lowerMessage.includes('business performance') || 
                    lowerMessage.includes('overall performance') ||
                    (lowerMessage.includes('how') && lowerMessage.includes('performing'))) {
                    
                    console.log('Processing business performance query:', message);
                    const data = await this.fetchIntegratedData();
                    return await this.generateBusinessPerformanceAnalysis(data);
                }

                // Check for occupancy trend query - simplified pattern matching
                if ((lowerMessage.includes('occupancy') && lowerMessage.includes('trend')) ||
                    lowerMessage === 'what is our occupancy trend' ||
                    lowerMessage.includes('occupancy') && 
                    (lowerMessage.includes('past') || lowerMessage.includes('months'))) {
                    
                    console.log('Processing occupancy trend query:', message);
                    
                    try {
                        const data = await this.fetchIntegratedData();
                        if (!data || !data.bookings) {
                            console.error('No booking data available');
                            throw new Error('Booking data not available');
                        }
                        return await this.generateOccupancyTrendAnalysis(data);
                    } catch (error) {
                        console.error('Error in occupancy trend analysis:', error);
                        // Fallback to basic occupancy data if available
                        const occupancyData = getMonthlyOccupancyByRoomType();
                        if (occupancyData && occupancyData.length > 0) {
                            return this.generateOccupancyAnalysis(occupancyData);
                        }
                        throw error;
                    }
                }

                // Check for growth metrics query
                if (lowerMessage.includes('metrics') && lowerMessage.includes('growth')) {
                    const data = await this.fetchIntegratedData();
                    return await this.generateGrowthAnalysis(data);
                }

                // Check for occupancy query
                if (lowerMessage.includes('lowest occupancy') && lowerMessage.includes('room')) {
                    const occupancyData = getMonthlyOccupancyByRoomType();
                    return this.generateOccupancyAnalysis(occupancyData);
                }

                // 1. Occupancy Queries
                if (this.isOccupancyQuery(lowerMessage)) {
                    const occupancyData = getMonthlyOccupancyByRoomType();
                    return await this.generateOccupancyResponse(occupancyData, lowerMessage);
                }

                // 2. Sales Queries
                if (this.isSalesQuery(lowerMessage)) {
                    const data = await this.fetchIntegratedData();
                    return await this.generateQuarterlySalesAnalysis(data);
                }

                // 3. Booking Queries
                if (this.isBookingQuery(lowerMessage)) {
                    const data = await this.fetchIntegratedData();
                    return await this.generateBookingAnalysis(data, lowerMessage);
                }

                // 4. Performance Queries
                if (this.isPerformanceQuery(lowerMessage)) {
                    const data = await this.fetchIntegratedData();
                    return await this.generatePerformanceAnalysis(data, lowerMessage);
                }

                // 5. Prediction Queries
                if (this.isPredictionQuery(lowerMessage)) {
                    return await this.handlePredictionQuery(message);
                }

                // Then check if it's off-topic
                if (this.isOffTopicQuery(message)) {
                    return this.generateRelevantSuggestions();
                }

                // Default response if no specific handler matches
                return this.generateDefaultResponse();
            } catch (error) {
                console.error('Error in processQuery:', error);
                return "I apologize, but I encountered an error processing your query. Please try again or rephrase your question.";
            }
        },

        // Helper methods to identify query types
        isOccupancyQuery(message) {
            return message.includes('occupancy') || 
                   message.includes('vacant') || 
                   message.includes('room type') ||
                   /(?:weekend|weekday).*compare/i.test(message);
        },

        isSalesQuery(message) {
            return /(?:sales|revenue|profit).*(?:quarter|trend|margin)/i.test(message) ||
                   message.includes('quarterly sales') ||
                   message.includes('sales performance');
        },

        isBookingQuery(message) {
            return message.includes('booking') ||
                   message.includes('lead time') ||
                   message.includes('cancellation') ||
                   message.includes('reservation');
        },

        isPerformanceQuery(message) {
            return message.includes('performance') ||
                   message.includes('kpi') ||
                   message.includes('compare') ||
                   message.includes('year-over-year');
        },

        isPredictionQuery(message) {
            return message.includes('predict') ||
                   message.includes('forecast') ||
                   message.includes('expect') ||
                   message.includes('upcoming');
        },

        isOffTopicQuery(message) {
            // Core suggested questions that should never be off-topic
            const validQuestions = [
                // Occupancy questions
                'Which room types have the lowest occupancy this month?',
                'What is our occupancy trend for the past six months?',
                'How does our weekday occupancy compare to weekends?',
                
                // Sales questions
                'How has our sales changed in the last quarter?',
                'What is our quarterly sales',
                'Which room category generates the most profit margin?',
                
                // Booking questions
                'What\'s our average lead time for weekend bookings?',
                'Show me the distribution of booking sources',
                'Which booking channels have the lowest cancellation rates?',
                
                // Performance questions
                'What are our key performance indicators this month?',
                'Compare this month\'s performance with the same month last year',
                'Show me year-over-year growth across all KPIs',
                
                // Prediction questions
                'What occupancy can we expect during the upcoming holiday season?',
                'What sales should we forecast for Q3 based on current trends?'
            ];
            
            // Check for exact matches first
            if (validQuestions.some(q => message.toLowerCase() === q.toLowerCase())) {
                return false;
            }

            // Patterns for valid queries
            const validPatterns = [
                // Occupancy patterns
                /occupancy.*(?:trend|rate|compare|lowest|highest)/i,
                /(?:weekend|weekday).*occupancy/i,
                
                // Sales patterns
                /(?:quarterly|quarter).*sales/i,
                /sales.*(?:quarter|trend|performance|forecast)/i,
                /profit.*margin/i,
                
                // Booking patterns
                /booking.*(?:source|channel|rate|trend)/i,
                /lead.*time/i,
                /cancellation.*rate/i,
                
                // Performance patterns
                /performance.*(?:compare|trend|analysis)/i,
                /kpi|key.*performance/i,
                /year.*over.*year/i,
                
                // Prediction patterns
                /forecast|predict|expect/i
            ];

            if (validPatterns.some(pattern => pattern.test(message.toLowerCase()))) {
                return false;
            }

            // Rest of the isOffTopicQuery method remains the same
            const lowerMessage = message.toLowerCase();
            
            // Define hotel/property management related keywords with expanded vocabulary
            const hotelKeywords = [
                // Basic hotel terms
                'room', 'booking', 'reservation', 'occupancy', 'revenue', 'hotel',
                'property', 'guest', 'stay', 'check-in', 'check-out', 'availability',
                'rate', 'adr', 'revpar', 'performance', 'analytics', 'forecast',
                'trend', 'metric', 'kpi', 'hospitality', 'accommodation', 'lodging',
                'billing', 'payment', 'report', 'maintenance', 'housekeeping', 'customer',
                'retention', 'satisfaction', 'analysis', 'business', 'income', 'management',
                'month', 'year', 'growth', 'comparison', 'statistics', 'data', 'pattern',
                'optimization', 'strategy', 'pricing', 'long-term', 'short-term', 'vacancy',
                
                // Hotel operations specific terms
                'front desk', 'reception', 'lobby', 'concierge', 'amenities', 'facilities',
                'service', 'turnover', 'housekeeping', 'cleaning', 'linen', 'towel', 
                'minibar', 'key card', 'breakfast', 'dinner', 'restaurant', 'bar',
                'conference', 'meeting room', 'event', 'function', 'banquet',
                
                // Business metrics
                'profit', 'loss', 'expense', 'cost', 'budget', 'investment', 'roi', 
                'turnover', 'cash flow', 'occupancy rate', 'length of stay', 'los',
                'daily rate', 'average rate', 'seasonal', 'peak season', 'off season',
                
                // Property types and features
                'suite', 'single', 'double', 'twin', 'king', 'queen', 'executive',
                'standard', 'deluxe', 'premium', 'economy', 'luxury', 'view', 'balcony',
                'bathroom', 'shower', 'bed', 'pillow', 'mattress', 'air conditioning',
                'heating', 'wheelchair', 'accessible', 'pet-friendly', 'smoking', 'non-smoking',
                
                // Distribution channels
                'ota', 'website', 'booking engine', 'travel agent', 'corporate', 'direct',
                'walk-in', 'commission', 'channel manager', 'gds', 'global distribution',
                
                // Customer relationship
                'review', 'rating', 'feedback', 'complaint', 'loyalty', 'member', 'program',
                'vip', 'repeat guest', 'lifetime value', 'clv', 'acquisition', 'retention'
            ];
            
            // Define contexts that the AI can understand
            const hotelContexts = [
                // Occupancy queries
                {
                    context: 'occupancy',
                    patterns: [
                        /\b(?:occupancy|vacancy|empty|full|available)\b/i,
                        /\broom(?:s)? (?:status|availability)\b/i,
                        /\bhow (?:many|much) (?:rooms?|occupancy)\b/i,
                        /\bwhat is (?:our|the) occupancy\b/i
                    ]
                },
                // Revenue queries
                {
                    context: 'revenue',
                    patterns: [
                        /\b(?:revenue|income|earnings|money|profit|financial)\b/i,
                        /\bhow much (?:revenue|money|profit)\b/i,
                        /\b(?:daily|weekly|monthly|annual) (?:revenue|income|earnings)\b/i,
                        /\brevenue (?:per|by|for|from)\b/i
                    ]
                },
                // Booking queries
                {
                    context: 'bookings',
                    patterns: [
                        /\b(?:booking|reservation|check-in|checkout|arrival|departure)\b/i,
                        /\b(?:confirmed|pending|canceled) (?:bookings?|reservations?)\b/i,
                        /\bbooking (?:pace|status|trend|pattern)\b/i,
                        /\bhow many (?:bookings|reservations|guests|arrivals|departures)\b/i
                    ]
                },
                // Business performance queries
                {
                    context: 'performance',
                    patterns: [
                        /\b(?:performance|kpi|metric|benchmark|comparison)\b/i,
                        /\b(?:business|hotel|property) (?:performance|health|status)\b/i,
                        /\bhow (?:is|are) (?:we|the hotel|our property) (?:doing|performing)\b/i,
                        /\b(?:show|tell|give) me (?:the|our|a) (?:performance|report|summary|overview)\b/i
                    ]
                },
                // Forecasting queries
                {
                    context: 'forecasting',
                    patterns: [
                        /\b(?:forecast|predict|projection|future|expect|anticipate)\b/i,
                        /\bnext (?:day|week|month|year|quarter)\b/i,
                        /\bwhat will (?:happen|be) (?:next|in|during)\b/i,
                        /\bhow (?:will|would|might) (?:we|the hotel) (?:do|perform)\b/i
                    ]
                }
            ];
            
            // Check if the message contains any hotel-related keywords
            const containsHotelKeyword = hotelKeywords.some(keyword => 
                lowerMessage.includes(keyword)
            );
            
            // Check if the message matches any hotel context patterns
            const matchesContextPattern = hotelContexts.some(context => 
                context.patterns.some(pattern => pattern.test(lowerMessage))
            );
            
            // If message is too short or doesn't contain any hotel keywords/patterns, consider it off-topic
            if (message.length < 3 || (!containsHotelKeyword && !matchesContextPattern && message.split(' ').length > 2)) {
                return true;
            }
            
            // Check for common off-topic patterns
            const offTopicPatterns = [
                /how are you/i,
                /tell me about yourself/i,
                /what can you do/i,
                /who are you/i,
                /hello|hi|hey/i,
                /weather|news|sports|politics/i,
                /tell me a joke|funny/i,
                /what is your name/i,
                /what's your name/i,
                /can you help me with/i,
                /thank you|thanks/i,
                /bye|goodbye/i,
                /how old are you/i,
                /where are you from/i,
                /are you human|are you a robot|are you real|are you ai/i,
                /what time is it|what day is it|what is today/i,
                /who made you|who created you|who built you/i,
                /what do you think about|what's your opinion/i
            ];
            
            return offTopicPatterns.some(pattern => pattern.test(lowerMessage));
        },

        generateRelevantSuggestions() {
            // Log this interaction
            logAIActivity('ai_off_topic', 'User asked an off-topic question');
            
            // Create a helpful message that guides the user back to hotel-related topics
            return `I'm designed to help with hotel management analytics and insights for Lodge Ease. 

I can assist you with questions about:
• Occupancy rates and room availability
• Revenue analysis and financial metrics
• Booking trends and patterns
• Guest statistics and satisfaction
• Business performance analytics
• Forecasts and predictions

Here are some questions you might want to ask:
• "What is our current occupancy rate?"
• "Show me sales trends for this month"
• "What are our peak booking hours?"
• "Analyze our business performance"
• "Predict next month's occupancy"
• "Compare this month's revenue with last month"`;
        },

        async calculateCurrentOccupancy(rooms, bookings) {
            console.log('Calculating current occupancy with:', { rooms, bookings });
            const now = new Date();

            // Get active bookings
            const activeBookings = bookings.filter(booking => {
                const checkIn = new Date(booking.checkIn);
                const checkOut = new Date(booking.checkOut);
                return booking.status === 'confirmed' && checkIn <= now && checkOut >= now;
            });

            // Count room statuses
            const roomStatuses = {
                occupied: rooms.filter(r => r.status === 'occupied').length,
                available: rooms.filter(r => r.status === 'available').length,
                maintenance: rooms.filter(r => r.status === 'maintenance').length
            };

            // Count room types
            const roomTypes = rooms.reduce((acc, room) => {
                const type = room.type || 'Standard';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});

            // Calculate average stay duration for active bookings
            const avgStayDuration = activeBookings.reduce((sum, booking) => {
                const checkIn = new Date(booking.checkIn);
                const checkOut = new Date(booking.checkOut);
                return sum + (checkOut - checkIn) / (1000 * 60 * 60 * 24);
            }, 0) / (activeBookings.length || 1);

            const totalRooms = rooms.length || 1;
            const occupancyRate = (roomStatuses.occupied / totalRooms) * 100;

            console.log('Occupancy calculation result:', {
                roomStatuses,
                roomTypes,
                occupancyRate,
                avgStayDuration
            });

            return {
                rate: Number(occupancyRate.toFixed(1)),
                occupied: roomStatuses.occupied,
                available: roomStatuses.available,
                maintenance: roomStatuses.maintenance,
                popularType: Object.entries(roomTypes)
                    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Standard',
                avgStayDuration: Number(avgStayDuration.toFixed(1))
            };
        },

        async calculateCurrentRevenue(revenue, bookings) {
            try {
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                // Get confirmed bookings with case-insensitive status check
                const confirmedBookings = bookings.filter(b => 
                    b.status?.toLowerCase() === 'confirmed'
                );

                // Get current month's bookings
                const currentMonthBookings = confirmedBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn);
                    return bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear;
                });

                // Get last month's bookings with proper date comparison
                const lastMonthBookings = confirmedBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn);
                    const isLastMonth = bookingDate.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1);
                    const isLastYear = currentMonth === 0 ? 
                        bookingDate.getFullYear() === currentYear - 1 : 
                        bookingDate.getFullYear() === currentYear;
                    return isLastMonth && isLastYear;
                });

                // Calculate revenues
                const currentMonthRevenue = currentMonthBookings.reduce((sum, booking) => 
                    sum + (booking.totalPrice || 0), 0);

                const lastMonthRevenue = lastMonthBookings.reduce((sum, booking) => 
                    sum + (booking.totalPrice || 0), 0);

                // Calculate total revenue from all confirmed bookings
                const totalRevenue = confirmedBookings.reduce((sum, booking) => 
                    sum + (booking.totalPrice || 0), 0);

                // Calculate growth rate with proper validation
                const growthRate = lastMonthRevenue > 0 ? 
                    ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 
                    currentMonthRevenue > 0 ? 100 : 0;

                // Log calculations for debugging
                console.log('Revenue calculations:', {
                    totalRevenue,
                    currentMonthRevenue,
                    lastMonthRevenue,
                    currentMonthBookings: currentMonthBookings.length,
                    lastMonthBookings: lastMonthBookings.length,
                    growthRate
                });

                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                
                return {
                    total: totalRevenue,
                    currentMonth: currentMonthRevenue,
                    dailyAverage: currentMonthRevenue / daysInMonth,
                    perRoom: currentMonthRevenue / (confirmedBookings.length || 1),
                    growthRate
                };
            } catch (error) {
                console.error('Error calculating revenue:', error);
                throw error;
            }
        },

        async calculateCurrentBookings(bookings) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Enhanced booking calculations
            const activeBookings = bookings.filter(b => b.status === 'confirmed');
            const pendingBookings = bookings.filter(b => b.status === 'pending');
            const cancelledBookings = bookings.filter(b => b.status === 'cancelled');

            // Calculate conversion rates
            const totalRequests = activeBookings.length + pendingBookings.length + cancelledBookings.length;
            const conversionRate = (activeBookings.length / (totalRequests || 1)) * 100;
            const cancellationRate = (cancelledBookings.length / (totalRequests || 1)) * 100;

            // Enhanced check-in/out analysis
            const todayCheckins = bookings.filter(booking => {
                const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                return checkIn >= today && checkIn < tomorrow;
            });

            const todayCheckouts = bookings.filter(booking => {
                const checkOut = new Date(booking.checkOut?.toDate?.() || booking.checkOut);
                return checkOut >= today && checkOut < tomorrow;
            });

            // Calculate average length of stay
            const avgStayDuration = this.calculateAverageStayDuration(activeBookings);

            // Enhanced booking time analysis
            const bookingTimeAnalysis = this.analyzeBookingPatterns(bookings);

            // Calculate room type distribution
            const roomTypeDistribution = this.calculateRoomTypeDistribution(activeBookings);

            // Calculate revenue metrics
            const revenueMetrics = this.calculateBookingRevenue(activeBookings);

            return {
                active: activeBookings.length,
                pending: pendingBookings.length,
                todayCheckins: todayCheckins.length,
                todayCheckouts: todayCheckouts.length,
                peakHours: bookingTimeAnalysis.peakHours,
                popularRoom: this.findPopularRoom(bookings),
                conversionRate,
                cancellationRate,
                avgStayDuration,
                bookingPatterns: bookingTimeAnalysis,
                roomTypes: roomTypeDistribution,
                revenue: revenueMetrics
            };
        },

        async generateLivePerformanceReport(data) {
            const occupancy = await this.calculateCurrentOccupancy(data.rooms, data.bookings);
            const revenue = await this.calculateCurrentRevenue(data.revenue, data.bookings);
            const bookings = await this.calculateCurrentBookings(data.bookings);
            
            // Calculate historical and market data
            const historicalData = await this.calculateHistoricalMetrics(data);
            const marketMetrics = await this.calculateMarketMetrics(data);

            return BusinessReportFormatter.formatPerformanceReport({
                occupancy: {
                    ...occupancy,
                    total: data.rooms.length
                },
                revenue,
                bookings,
                historicalData,
                marketMetrics
            });
        },

        async calculateHistoricalMetrics(data) {
            // Add historical data calculations
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            
            const historicalBookings = data.bookings.filter(b => 
                new Date(b.createdAt) <= lastMonth
            );

            return {
                averageLeadTime: this.calculateAverageLeadTime(historicalBookings),
                averageOccupancy: this.calculateHistoricalOccupancy(data),
                averageRevenue: this.calculateHistoricalRevenue(data)
            };
        },

        async calculateMarketMetrics(data) {
            // In a real implementation, this would fetch market data
            // For now, return estimated values
            return {
                averageOccupancy: 65,
                averageRate: 100,
                totalRooms: 100
            };
        },

        generateDefaultResponse(data) {
            const activeBookings = data.bookings.filter(b => b.status === 'confirmed').length;
            const availableRooms = data.rooms.filter(r => r.status === 'available').length;
            
            return `Current Hotel Status:\n` +
                   `- Available Rooms: ${availableRooms}\n` +
                   `- Active Bookings: ${activeBookings}\n` +
                   `- Today's Operations are Normal\n\n` +
                   `I can help you analyze:\n` +
                   `- Current occupancy and room availability\n` +
                   `- Today's sales and financial metrics\n` +
                   `- Active bookings and check-ins/outs\n` +
                   `- Overall performance metrics\n\n` +
                   `What would you like to know about?`;
        },

        findPopularRoom(bookings) {
            const roomCounts = bookings.reduce((acc, booking) => {
                const roomType = booking.propertyDetails?.roomType || 'Standard';
                acc[roomType] = (acc[roomType] || 0) + 1;
                return acc;
            }, {});

            return Object.entries(roomCounts)
                .sort((a, b) => b[1] - a[1])[0][0];
        },

        // Add helper method to safely format numbers
        formatNumber(value) {
            return (value || 0).toLocaleString();
        },

        generateTrendAnalysis() {
            try {
                const occupancyRate = this.analyticsData.occupancyRate || 0;
                const revenue = this.analyticsData.revenue || 0;
                const bookings = this.analyticsData.bookings || 0;

                return `Based on our analysis:
                - Current Occupancy: ${occupancyRate}%
                - Total Revenue: $${this.formatNumber(revenue)}
                - Total Bookings: ${bookings}
                - Peak booking times: 2PM - 6PM
                - Most popular room type: Deluxe
                - Average stay duration: 3.5 days
                - Customer satisfaction rate: 4.2/5`;
            } catch (error) {
                console.error('Error generating trend analysis:', error);
                return 'Unable to generate trend analysis at this moment.';
            }
        },

        async sendMessage() {
            const message = this.currentMessage.trim();
            
            if (!message) return;

            try {
                const cacheKey = this.currentMessage.trim();
                if (this.messageCache.has(cacheKey)) {
                    this.addMessage(this.messageCache.get(cacheKey), 'bot');
                    return;
                }

                // Add user message
                this.addMessage(message, 'user');
                
                // Clear input
                this.currentMessage = '';

                // Show typing indicator
                this.addTypingIndicator();

                // Process the query and get response
                const response = await this.processQuery(message);

                // Cache successful responses
                this.messageCache.set(cacheKey, response);
                
                // Clear old cache entries if cache gets too large
                if (this.messageCache.size > 100) {
                    const firstKey = this.messageCache.keys().next().value;
                    this.messageCache.delete(firstKey);
                }

                // Remove typing indicator and add bot response
                this.removeTypingIndicator();
                this.addMessage(response, 'bot');

                // Check if response is from the off-topic handler and ensure suggestions are appropriate
                if (response.includes("I'm designed to help with hotel management analytics")) {
                    // Add specific recommendations for off-topic queries
                    this.addOffTopicSuggestions();
                } else {
                    // Add follow-up suggestions based on the response
                    this.addSuggestions(response);
                }

                await logAIActivity('ai_query', `User asked: ${message}`);
            } catch (error) {
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

        sanitizeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        submitSuggestion(suggestion) {
            // Sanitize the suggestion text
            const sanitizedSuggestion = this.sanitizeHtml(suggestion);
            // Set the message
            this.currentMessage = sanitizedSuggestion;
            // Send the message
            this.sendMessage();
        },

        startNewChat() {
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.innerHTML = '';
            
            // Add welcome message
            this.addMessage(`Welcome to Lodge Ease AI Assistant! I can help you analyze:
- Occupancy trends and room statistics
- Sales and financial performance
- Booking patterns and guest preferences
- Overall business performance

How can I assist you today?`, 'bot');

            // Add diverse initial suggestions using the SuggestionService
            const suggestionService = new SuggestionService();
            // Generate suggestions from multiple contexts for diversity
            const initialSuggestions = [
                ...suggestionService.contextMap.occupancy.slice(0, 1),
                ...suggestionService.contextMap.sales.slice(0, 1),
                ...suggestionService.contextMap.bookings.slice(0, 1),
                ...suggestionService.contextMap.analytics.slice(0, 1)
            ];

            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'message-suggestions';
            suggestionDiv.innerHTML = `
                <div class="chat-suggestions">
                    ${initialSuggestions.map(text => {
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
            `;

            // Add click event listeners to suggestions
            suggestionDiv.addEventListener('click', (e) => {
                const chip = e.target.closest('.suggestion-chip');
                if (chip) {
                    const suggestion = chip.dataset.suggestion;
                    this.submitSuggestion(suggestion);
                }
            });

            chatContainer.appendChild(suggestionDiv);

            logAIActivity('ai_new_chat', 'Started new conversation');
        },

        async fetchInitialData() {
            try {
                console.log('Starting to fetch initial data...');
                const [rooms, bookings] = await Promise.all([
                    this.fetchRoomData(),
                    this.fetchBookingData()
                ]);

                console.log('Raw room data:', rooms);
                console.log('Raw booking data:', bookings);

                const processedData = {
                    roomTypes: this.processRoomTypes(rooms),
                    occupancy: this.processOccupancy(bookings),
                    bookings: this.processBookings(bookings),
                    satisfaction: this.processSatisfaction(bookings)
                };

                console.log('Processed data:', processedData);
                return processedData;
            } catch (error) {
                console.error('Error in fetchInitialData:', error);
                return null;
            }
        },

        async fetchRoomData() {
            try {
                console.log('Fetching room data...');
                const roomsRef = collection(db, 'rooms');
                const snapshot = await getDocs(roomsRef);
                const rooms = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        roomNumber: data.propertyDetails?.roomNumber || data.roomNumber,
                        type: this.normalizeRoomType(data.propertyDetails?.roomType || data.roomType),
                        status: (data.status || 'Available').toLowerCase(),
                        price: data.price || 0,
                        establishment: data.establishment,
                        propertyDetails: data.propertyDetails || {}
                    };
                });
                console.log('Fetched rooms:', rooms);
                return rooms;
            } catch (error) {
                console.error('Error fetching room data:', error);
                throw error;
            }
        },

        async fetchBookingData() {
            try {
                console.log('Fetching booking data...');
                const bookingsRef = collection(db, 'bookings');
                const snapshot = await getDocs(bookingsRef);
                const bookings = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        checkIn: data.checkIn?.toDate?.() || new Date(data.checkIn),
                        checkOut: data.checkOut?.toDate?.() || new Date(data.checkOut),
                        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
                        status: data.status || 'Pending',
                        propertyDetails: data.propertyDetails || {},
                        totalPrice: data.totalPrice || 0,
                        nightlyRate: data.nightlyRate || 0,
                        numberOfNights: data.numberOfNights || 0,
                        guestName: data.guestName,
                        bookingType: data.bookingType,
                        paymentStatus: data.paymentStatus,
                        establishment: data.establishment
                    };
                });
                console.log('Fetched bookings:', bookings);
                return bookings;
            } catch (error) {
                console.error('Error fetching booking data:', error);
                throw error;
            }
        },

        processRoomTypes(rooms) {
            return rooms.reduce((acc, room) => {
                const type = this.normalizeRoomType(room.type || room.propertyDetails?.roomType);
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {
                'Standard': 0,
                'Deluxe': 0,
                'Suite': 0,
                'Family': 0
            });
        },

        async fetchRealTimeData() {
            // Fetch data from other admin pages
            const bookingsRef = collection(db, 'bookings');
            const revenueRef = collection(db, 'revenue');
            const customersRef = collection(db, 'customers');

            const [bookings, revenue, customers] = await Promise.all([
                getDocs(query(bookingsRef, orderBy('date', 'desc'), limit(100))),
                getDocs(query(revenueRef, orderBy('date', 'desc'), limit(100))),
                getDocs(query(customersRef, orderBy('date', 'desc'), limit(100)))
            ]);

            return this.processRealTimeData(bookings, revenue, customers);
        },

        async fetchIntegratedData() {
            if (this.integratedData.rooms.length > 0) {
                console.log('Using cached integrated data');
                return this.integratedData;
            }
            try {
                // Fetch data from different collections
                const [rooms, bookings, revenue, customers, activities] = await Promise.all([
                    this.fetchRoomData(),
                    this.fetchBookingData(),
                    this.fetchRevenueData(),
                    this.fetchCustomerData(),
                    this.fetchActivityData()
                ]);

                const integratedData = {
                    rooms: rooms || [],
                    bookings: bookings || [],
                    revenue: revenue || [],
                    customers: customers || [],
                    activities: activities || [],
                    status: 'success'
                };

                // Cache the data
                this.integratedData = integratedData;
                return integratedData;
            } catch (error) {
                console.error('Error fetching integrated data:', error);
                return {
                    rooms: [],
                    bookings: [],
                    revenue: [],
                    customers: [],
                    activities: [],
                    status: 'error',
                    error: error.message
                };
            }
        },

        async fetchCustomerData() {
            try {
                const customersRef = collection(db, 'customers');
                const snapshot = await getDocs(customersRef);
                return snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                console.error('Error fetching customer data:', error);
                return [];
            }
        },

        async fetchActivityData() {
            try {
                const activitiesRef = collection(db, 'activityLogs');
                const snapshot = await getDocs(activitiesRef);
                return snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                console.error('Error fetching activity data:', error);
                return [];
            }
        },

        async calculateModuleMetrics() {
            try {
                // Check if we have data to process
                if (!this.integratedData.bookings || !this.integratedData.rooms) {
                    throw new Error('Required data is missing');
                }

                // Calculate booking metrics
                const bookingMetrics = {
                    total: this.integratedData.bookings.length,
                    pending: this.integratedData.bookings.filter(b => b.status === 'pending').length,
                    confirmed: this.integratedData.bookings.filter(b => b.status === 'confirmed').length,
                    canceled: this.integratedData.bookings.filter(b => b.status === 'cancelled').length,
                    revenue: this.integratedData.bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0)
                };

                // Calculate room metrics
                const roomMetrics = {
                    total: this.integratedData.rooms.length,
                    available: this.integratedData.rooms.filter(r => r.status === 'available').length,
                    occupied: this.integratedData.rooms.filter(r => r.status === 'occupied').length,
                    maintenance: this.integratedData.rooms.filter(r => r.status === 'maintenance').length,
                    occupancyRate: (this.integratedData.rooms.filter(r => r.status === 'occupied').length / 
                                  this.integratedData.rooms.length) * 100
                };

                // Calculate revenue metrics
                const revenueMetrics = {
                    total: this.integratedData.revenue.reduce((sum, r) => sum + (r.amount || 0), 0),
                    average: this.integratedData.revenue.reduce((sum, r) => sum + (r.amount || 0), 0) / 
                            this.integratedData.revenue.length || 0,
                    transactions: this.integratedData.revenue.length
                };

                // Calculate activity metrics
                const activityMetrics = {
                    total: this.integratedData.activities.length,
                    byType: this.groupActivitiesByType(this.integratedData.activities),
                    recentActivities: this.integratedData.activities.slice(0, 10)
                };

                this.moduleMetrics = {
                    bookingMetrics,
                    roomMetrics,
                    revenueMetrics,
                    activityMetrics
                };

                // Update charts with new data
                this.updateChartsWithIntegratedData();
            } catch (error) {
                console.error('Error calculating metrics:', error);
                this.handleError(error, 'metrics-calculation');
            }
        },

        groupActivitiesByType(activities) {
            return activities.reduce((acc, activity) => {
                acc[activity.actionType] = (acc[activity.actionType] || 0) + 1;
                return acc;
            }, {});
        },

        async analyzeRoomData() {
            try {
                const roomData = await fetchRoomAnalytics();
                this.roomAnalytics = roomData.analytics;
                this.updateRoomCharts();
                return roomData;
            } catch (error) {
                console.error('Error analyzing room data:', error);
                this.handleError(error, 'room-analysis');
            }
        },

        generateRoomAnalysisResponse(roomData) {
            const { analytics } = roomData;
            const mostPopular = analytics.popularRooms[0];
            
            return `Room Analysis:
                - Total Rooms: ${analytics.totalRooms}
                - Currently Occupied: ${analytics.occupiedRooms}
                - Available: ${analytics.availableRooms}
                - Under Maintenance: ${analytics.maintenanceRooms}
                - Overall Occupancy Rate: ${analytics.occupancyRate.toFixed(1)}%
                - Most Popular Room: ${mostPopular.roomNumber} (${mostPopular.roomType})
                - Total Bookings for Most Popular: ${mostPopular.bookingCount}
                - Revenue Generated: $${mostPopular.revenue.toLocaleString()}`;
        },

        async fetchAndProcessRoomData() {
            try {
                const [roomsSnapshot, bookingsSnapshot] = await Promise.all([
                    getDocs(collection(db, 'rooms')),
                    getDocs(collection(db, 'bookings'))
                ]);

                // Process room types
                const rooms = roomsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        floor: data.floor || '',
                        roomNumber: data.roomNumber || '',
                        status: data.status || 'Available',
                        type: this.normalizeRoomType(data.type || data.propertyDetails?.roomType || 'Standard')
                    };
                });

                // Process bookings
                const bookings = bookingsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        checkIn: data.checkIn?.toDate?.() || new Date(data.checkIn),
                        checkOut: data.checkOut?.toDate?.() || new Date(data.checkOut),
                        status: data.status || 'pending',
                        guestName: data.guestName,
                        propertyDetails: data.propertyDetails || {}
                    };
                });

                // Calculate room type distribution
                const roomTypeData = rooms.reduce((acc, room) => {
                    const type = room.type;
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {
                    'Standard': 0,
                    'Deluxe': 0,
                    'Suite': 0,
                    'Family': 0
                });

                // Calculate occupancy trends
                const now = new Date();
                const last12Months = this.getLast12Months();
                const occupancyTrends = last12Months.map(month => {
                    const monthlyBookings = bookings.filter(booking => {
                        const bookingMonth = booking.checkIn.toLocaleString('default', { month: 'short' });
                        return bookingMonth === month && booking.status === 'confirmed';
                    });
                    return {
                        month,
                        occupancyRate: (monthlyBookings.length / rooms.length) * 100 || 0
                    };
                });

                // Calculate booking trends
                const bookingTrends = new Array(24).fill(0);
                bookings.forEach(booking => {
                    const hour = booking.checkIn.getHours();
                    bookingTrends[hour]++;
                });

                // Calculate satisfaction metrics
                const satisfactionData = [0, 0, 0, 0]; // Excellent, Good, Average, Poor
                bookings.forEach(booking => {
                    switch(booking.status) {
                        case 'confirmed': satisfactionData[0]++; break;
                        case 'completed': satisfactionData[1]++; break;
                        case 'pending': satisfactionData[2]++; break;
                        case 'cancelled': satisfactionData[3]++; break;
                    }
                });

                // Log processed data for debugging
                console.log('Processed Data:', {
                    roomTypes: roomTypeData,
                    occupancy: occupancyTrends,
                    bookings: bookingTrends,
                    satisfaction: satisfactionData
                });

                // Update analytics state
                this.analyticsData = {
                    ...this.analyticsData,
                    roomTypes: roomTypeData,
                    occupancyTrend: occupancyTrends,
                    bookingTrends,
                    satisfactionMetrics: satisfactionData,
                    totalRooms: rooms.length,
                    occupiedRooms: rooms.filter(r => r.status === 'Occupied').length,
                    availableRooms: rooms.filter(r => r.status === 'Available').length
                };

                // Update charts with validated data
                const chartData = {
                    roomTypes: roomTypeData,
                    occupancy: occupancyTrends,
                    bookingTrends,
                    satisfaction: satisfactionData
                };

                await this.updateAllCharts(chartData);

                return {
                    rooms,
                    bookings,
                    analytics: chartData
                };

            } catch (error) {
                console.error('Error processing data:', error);
                this.handleError(error, 'data-processing');
            }
        },

        async analyzeBookingData() {
            try {
                const bookingsRef = collection(db, 'bookings');
                const snapshot = await getDocs(bookingsRef);
                const bookings = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Process booking data
                const bookingAnalytics = {
                    totalBookings: bookings.length,
                    statusDistribution: this.calculateBookingStatusDistribution(bookings),
                    averageStayDuration: this.calculateAverageStayDuration(bookings),
                    revenueByMonth: this.calculateRevenueByMonth(bookings),
                    bookingTrends: this.calculateBookingTrends(bookings),
                    popularCheckInDays: this.calculatePopularCheckInDays(bookings),
                    repeatCustomers: this.analyzeRepeatCustomers(bookings)
                };

                // Update charts with new booking data
                this.updateBookingCharts(bookingAnalytics);
                return bookingAnalytics;
            } catch (error) {
                console.error('Error analyzing booking data:', error);
                this.handleError(error, 'booking-analysis');
            }
        },

        calculateBookingStatusDistribution(bookings) {
            return bookings.reduce((acc, booking) => {
                acc[booking.status] = (acc[booking.status] || 0) + 1;
                return acc;
            }, {});
        },

        calculateAverageStayDuration(bookings) {
            const durations = bookings.map(booking => {
                const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                const checkOut = new Date(booking.checkOut?.toDate?.() || booking.checkOut);
                return (checkOut - checkIn) / (1000 * 60 * 60 * 24); // Convert to days
            });
            return durations.reduce((acc, curr) => acc + curr, 0) / durations.length;
        },

        calculateRevenueByMonth(bookings) {
            return bookings.reduce((acc, booking) => {
                const month = new Date(booking.checkIn?.toDate?.() || booking.checkIn)
                    .toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + (booking.totalAmount || 0);
                return acc;
            }, {});
        },

        calculateBookingTrends(bookings) {
            const trends = {
                daily: new Array(24).fill(0),
                weekly: new Array(7).fill(0),
                monthly: {}
            };

            bookings.forEach(booking => {
                const date = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                trends.daily[date.getHours()]++;
                trends.weekly[date.getDay()]++;
                
                const month = date.toLocaleString('default', { month: 'short' });
                trends.monthly[month] = (trends.monthly[month] || 0) + 1;
            });

            return trends;
        },

        calculatePopularCheckInDays(bookings) {
            const dayCount = new Array(7).fill(0);
            bookings.forEach(booking => {
                const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                dayCount[checkIn.getDay()]++;
            });
            return dayCount;
        },

        analyzeRepeatCustomers(bookings) {
            const customerBookings = bookings.reduce((acc, booking) => {
                acc[booking.userId] = (acc[booking.userId] || 0) + 1;
                return acc;
            }, {});

            return {
                total: Object.keys(customerBookings).length,
                repeat: Object.values(customerBookings).filter(count => count > 1).length
            };
        },

        generateBookingAnalysisResponse(stats) {
            const performanceIndicator = stats.conversionRate >= 70 ? '🟢' : 
                                        stats.conversionRate >= 50 ? '🟡' : '🔴';

            return `Booking Analysis Dashboard ${performanceIndicator}

Current Booking Status:
• Active Bookings: ${stats.active} (${stats.conversionRate.toFixed(1)}% conversion rate)
• Pending Requests: ${stats.pending}
• Cancellation Rate: ${stats.cancellationRate.toFixed(1)}%

Today's Operations:
• Check-ins: ${stats.todayCheckins}
• Check-outs: ${stats.todayCheckouts}
• Net Room Change: ${stats.todayCheckins - stats.todayCheckouts}

Booking Patterns:
• Average Lead Time: ${stats.bookingPatterns.avgLeadTime} days
• Peak Booking Hours: ${stats.bookingPatterns.peakHours.map(h => 
    `${h.period}:00 (${h.percentage}%)`).join(', ')}
• Most Active Days: ${stats.bookingPatterns.peakDays.map(d => 
    `${this.getDayName(d.period)}`).join(', ')}

Room Type Distribution:
${stats.roomTypes.map(rt => `• ${rt.type}: ${rt.count} bookings (${rt.percentage}%)`).join('\n')}

Sales Metrics:
• Total Sales: $${stats.revenue.total.toLocaleString()}
• Average per Booking: $${stats.revenue.average.toFixed(2)}
• Projected Sales: $${stats.revenue.projected.toLocaleString()}

${this.generateBookingInsights(stats)}`;
        },

        generateBookingInsights(stats) {
            const insights = [];
            
            if (stats.conversionRate < 60) {
                insights.push("• Review booking approval process to improve conversion");
            }
            if (stats.cancellationRate > 15) {
                insights.push("• Analyze cancellation patterns to reduce rate");
            }
            if (stats.todayCheckins > stats.active * 0.2) {
                insights.push("• High check-in volume today - ensure adequate staffing");
            }
            if (stats.bookingPatterns.avgLeadTime < 7) {
                insights.push("• Short lead times - consider early booking incentives");
            }

            return insights.length > 0 
                ? '\nRecommendations:\n' + insights.join('\n')
                : '';
        },

        generateRevenueAnalysisResponse(analytics) {
            try {
                const {
                    total = 0,
                    currentMonth = 0,
                    dailyAverage = 0,
                    perRoom = 0,
                    growthRate = 0
                } = analytics;

                const performanceIndicator = growthRate >= 0 ? '📈' : '📉';
                const performanceLevel = this.getPerformanceLevel(growthRate);
                const marketPosition = this.calculateMarketPosition(analytics);
                const revenueSources = this.analyzeRevenueSources(analytics);

                return `Revenue Analysis Dashboard ${performanceIndicator}

Financial Overview:
• Total Revenue: $${total.toLocaleString()}
• Current Month: $${currentMonth.toLocaleString()}
• Daily Average: $${dailyAverage.toFixed(2)}
• Revenue per Room: $${perRoom.toFixed(2)}

Performance Metrics:
• Growth Rate: ${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}%
• Market Position: ${marketPosition}
• Performance Level: ${performanceLevel}

Revenue Distribution:
${this.formatRevenueSources(revenueSources)}

Key Performance Indicators:
• Average Length of Stay: ${this.calculateAverageStay(analytics)} days
• RevPAR Trend: ${this.calculateRevPARTrend(analytics)}
• Booking Window: ${this.calculateBookingWindow(analytics)} days

${this.generateRevenueInsights(analytics)}

${this.generateActionableRecommendations(analytics)}`;
            } catch (error) {
                console.error('Error generating revenue response:', error);
                return "I apologize, but I'm having trouble analyzing the revenue data.";
            }
        },

        calculateMarketPosition(analytics) {
            const avgRevenue = analytics.perRoom;
            if (avgRevenue > 200) return "Premium Market 🌟";
            if (avgRevenue > 150) return "Upper Midscale ⭐";
            if (avgRevenue > 100) return "Midscale 📊";
            return "Economy Segment";
        },

        analyzeRevenueSources(analytics) {
            return {
                roomRevenue: analytics.total * 0.75,
                foodBeverage: analytics.total * 0.15,
                otherServices: analytics.total * 0.10
            };
        },

        formatRevenueSources(sources) {
            return Object.entries(sources).map(([source, amount]) => {
                const percentage = (amount / Object.values(sources).reduce((a, b) => a + b, 0) * 100).toFixed(1);
                const sourceName = source.replace(/([A-Z])/g, ' $1').trim();
                return `• ${sourceName}: $${amount.toLocaleString()} (${percentage}%)`;
            }).join('\n');
        },

        calculateAverageStay(analytics) {
            return ((analytics.total / analytics.perRoom) / analytics.currentMonth * 30).toFixed(1);
        },

        calculateRevPARTrend(data) {
            try {
                // Validate input data
                if (!data || !Array.isArray(data.revenue) || !Array.isArray(data.rooms)) {
                    console.warn('Invalid data for RevPAR calculation:', data);
                    return 'Data unavailable';
                }

                const last6Months = this.getLast6Months();
                const revparTrends = [];
                
                // Calculate RevPAR for each month with null checks
                last6Months.forEach(month => {
                    try {
                        const monthRevenue = (data.revenue || [])
                            .filter(r => {
                                if (!r?.date) return false;
                                const revDate = new Date(r.date?.toDate?.() || r.date);
                                return revDate.toLocaleString('default', { month: 'long' }) === month;
                            })
                            .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
                        
                        const roomCount = (data.rooms || []).length || 1;
                        const revpar = monthRevenue / roomCount;
                        revparTrends.push({ month, revpar });
                    } catch (error) {
                        console.warn(`Error calculating RevPAR for ${month}:`, error);
                        revparTrends.push({ month, revpar: 0 });
                    }
                });

                // Calculate trend percentages with safety checks
                const trends = revparTrends.map((current, index, array) => {
                    if (index === 0) return { ...current, change: 0 };
                    const previous = array[index - 1];
                    const change = previous.revpar ? 
                        ((current.revpar - previous.revpar) / previous.revpar) * 100 : 
                        0;
                    return { ...current, change };
                });

                return this.formatRevPARTrendResponse(trends);
            } catch (error) {
                console.error('Error calculating RevPAR trend:', error);
                return 'Unable to calculate RevPAR trend at this moment.';
            }
        },

        // Add helper method to format RevPAR trend response
        formatRevPARTrendResponse(trends) {
            try {
                return `RevPAR (Revenue Per Available Room) Analysis 📊\n
Monthly Performance:
${trends.map(t => `• ${t.month}: $${t.revpar.toFixed(2)} ${this.getTrendIndicator(t.change)}`).join('\n')}

Trend Analysis:
• Current RevPAR: $${(trends[trends.length - 1]?.revpar ||
            0).toFixed(2)}
• Monthly Change: ${trends[trends.length - 1]?.change.toFixed(1)}%
• Overall Trend: ${this.calculateOverallTrend(trends)}

${this.generateRevPARRecommendations(trends)}`;
            } catch (error) {
                console.error('Error formatting RevPAR trend response:', error);
                return 'Unable to format RevPAR trend response at this moment.';
            }
        },

        getTrendIndicator(change) {
            if (change > 5) return '📈';
            if (change < -5) return '📉';
            return '➡️';
        },

        calculateOverallTrend(trends) {
            const changes = trends.map(t => t.change);
            const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
            
            if (avgChange > 5) return 'Strong Upward Trend 🌟';
            if (avgChange > 0) return 'Slight Upward Trend ⭐';
            if (avgChange > -5) return 'Stable 📊';
            return 'Downward Trend ⚠️';
        },

        generateRevPARRecommendations(trends) {
            const recommendations = [];
            const latestTrend = trends[trends.length - 1];
            
            if (latestTrend.change < 0) {
                recommendations.push("• Review pricing strategy");
                recommendations.push("• Consider demand-based pricing adjustments");
            }
            if (this.detectSeasonalPattern(trends)) {
                recommendations.push("• Implement seasonal pricing strategies");
                recommendations.push("• Plan promotions for low-demand periods");
            }
            
            return recommendations.length > 0
                ? '\nRecommendations:\n' + recommendations.join('\n')
                : '';
        },

        detectSeasonalPattern(trends) {
            // Simple pattern detection
            const changes = trends.map(t => t.change);
            const alternating = changes.some((change, i) => 
                i > 0 && Math.sign(change) !== Math.sign(changes[i - 1])
            );
            return alternating;
        },

        getLast6Months() {
            return Array.from({length: 6}, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                return date.toLocaleString('default', { month: 'long' });
            }).reverse();
        },

        calculateBookingWindow(analytics) {
            return Math.round(analytics.currentMonth / analytics.dailyAverage);
        },

        generateCustomerAnalysisResponse(analytics) {
            return `Customer Analysis:
            - Total Unique Customers: ${analytics.repeatCustomers.total}
            - Repeat Customers: ${analytics.repeatCustomers.repeat}
            - Customer Loyalty Rate: ${((analytics.repeatCustomers.repeat / analytics.repeatCustomers.total) * 100).toFixed(1)}%`;
        },

        getDayName(index) {
            return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index];
        },

        findPeakHours(hourlyData) {
            const peakHours = hourlyData
                .map((count, hour) => ({ hour, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
                .map(({ hour }) => `${hour}:00`);
            return peakHours.join(', ');
        },

        // Add this helper method to normalize room types
        normalizeRoomType(type) {
            if (!type) return 'Standard';
            
            // Convert to string and normalize
            const normalizedInput = String(type).trim().toLowerCase();
            
            // Mapping of variations to standard types
            const typeMap = {
                'standard': 'Standard',
                'std': 'Standard',
                'deluxe': 'Deluxe',
                'dlx': 'Deluxe',
                'suite': 'Suite',
                'ste': 'Suite',
                'family': 'Family',
                'fam': 'Family',
                'standard room': 'Standard',
                'deluxe room': 'Deluxe',
                'suite room': 'Suite',
                'family room': 'Family'
            };

            return typeMap[normalizedInput] || 'Standard';
        },

        async fetchRoomTypeDistribution() {
            try {
                const roomsRef = collection(db, 'rooms');
                const snapshot = await getDocs(roomsRef);
                
                const distribution = {
                    'Standard': 0,
                    'Deluxe': 0,
                    'Suite': 0,
                    'Family': 0
                };
        
                snapshot.docs.forEach(doc => {
                    const roomData = doc.data();
                    const type = this.normalizeRoomType(roomData.type || roomData.propertyDetails?.roomType);
                    if (distribution.hasOwnProperty(type)) {
                        distribution[type]++;
                    }
                });
        
                // Check if chart exists and is valid
                if (this.charts.roomTypes && typeof this.charts.roomTypes.update === 'function') {
                    this.charts.roomTypes.data.datasets[0].data = Object.values(distribution);
                    this.charts.roomTypes.update();
                } else {
                    console.warn('Room types chart not properly initialized');
                    this.error = 'Chart initialization error';
                }
        
                return distribution;
            } catch (error) {
                console.error('Error fetching room type distribution:', error);
                this.error = 'Failed to fetch room type data';
                return null;
            }
        },

        processOccupancy(bookings) {
            const months = this.getLast12Months();
            const occupancyData = months.map(month => {
                const monthlyBookings = bookings.filter(booking => {
                    const bookingMonth = new Date(booking.checkIn).toLocaleString('default', { month: 'short' });
                    return bookingMonth === month;
                });
                return {
                    month,
                    rate: (monthlyBookings.length > 0) ? 
                        (monthlyBookings.filter(b => b.status === 'confirmed').length / monthlyBookings.length) * 100 : 0
                };
            });
            return occupancyData;
        },

        processBookings(bookings) {
            const hourlyDistribution = new Array(24).fill(0);
            bookings.forEach(booking => {
                const hour = new Date(booking.checkIn).getHours();
                hourlyDistribution[hour]++;
            });
            return hourlyDistribution;
        },

        processSatisfaction(bookings) {
            const ratings = [0, 0, 0, 0]; // [Excellent, Good, Average, Poor]
            bookings.forEach(booking => {
                if (!booking.rating) return;
                if (booking.rating >= 4.5) ratings[0]++;
                else if (booking.rating >= 3.5) ratings[1]++;
                else if (booking.rating >= 2.5) ratings[2]++;
                else ratings[3]++;
            });
            return ratings;
        },

        async fetchInitialData() {
            try {
                console.log('Fetching initial data...');
                const [rooms, bookings] = await Promise.all([
                    this.fetchRoomData(),
                    this.fetchBookingData()
                ]);

                if (!rooms || !bookings) {
                    throw new Error('Failed to fetch rooms or bookings data');
                }

                console.log('Processing data...');
                const processedData = {
                    roomTypes: this.processRoomTypes(rooms),
                    occupancy: this.processOccupancy(bookings),
                    bookings: this.processBookings(bookings),
                    satisfaction: this.processSatisfaction(bookings)
                };

                console.log('Processed data:', processedData);
                return processedData;
            } catch (error) {
                console.error('Error in fetchInitialData:', error);
                return null;
            }
        },

        async fetchRevenueData() {
            try {
                console.log('Fetching revenue data...');
                const revenueRef = collection(db, 'bookings'); // Change to bookings collection since revenue is stored there
                const snapshot = await getDocs(revenueRef);
                const revenue = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        amount: data.totalPrice || data.totalAmount || 0, // Consider both possible field names
                        date: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(data.checkIn),
                        status: data.status
                    };
                }).filter(r => r.amount > 0 && r.status === 'confirmed'); // Only include confirmed bookings with valid amounts

                console.log('Fetched revenue data:', revenue);
                return revenue;
            } catch (error) {
                console.error('Error fetching revenue data:', error);
                return [];
            }
        },

        addTypingIndicator() {
            const chatContainer = document.getElementById('chatContainer');
            const typingDiv = document.createElement('div');
            typingDiv.className = 'message bot typing-indicator';
            typingDiv.innerHTML = `
                <div class="message-avatar bot">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">
                    <div class="typing-dots">
                        <span>.</span><span>.</span><span>.</span>
                    </div>
                </div>
            `;
            chatContainer.appendChild(typingDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        },

        removeTypingIndicator() {
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        },

        addSuggestions(response) {
            // Get suggestions based on response context
            const suggestions = new SuggestionService().getSuggestionsByResponse(response);
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'message-suggestions';
            
            suggestionDiv.innerHTML = `
                <div class="chat-suggestions">
                    ${suggestions.map(s => {
                        const sanitizedText = this.sanitizeHtml(s.text);
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
            `;

            // Add click event listeners to suggestions
            suggestionDiv.addEventListener('click', (e) => {
                const chip = e.target.closest('.suggestion-chip');
                if (chip) {
                    const suggestion = chip.dataset.suggestion;
                    this.submitSuggestion(suggestion);
                }
            });

            document.getElementById('chatContainer').appendChild(suggestionDiv);
        },

        addOffTopicSuggestions() {
            // Create diverse suggestions that cover different hotel management aspects
            const suggestionService = new SuggestionService();
            // Force 'off-topic' context to get diverse, on-topic suggestions
            const suggestions = suggestionService.generateSuggestions('off-topic');
            
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'message-suggestions';
            suggestionDiv.innerHTML = `
                <div class="chat-suggestions">
                    ${suggestions.map(s => {
                        const sanitizedText = this.sanitizeHtml(s.text);
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
            `;

            // Add click event listeners to suggestions
            suggestionDiv.addEventListener('click', (e) => {
                const chip = e.target.closest('.suggestion-chip');
                if (chip) {
                    const suggestion = chip.dataset.suggestion;
                    this.submitSuggestion(suggestion);
                }
            });

            document.getElementById('chatContainer').appendChild(suggestionDiv);
        },

        // Add new analytics methods
        async calculateKPIs(data) {
            const { bookings, rooms, revenue } = data;
            
            return {
                occupancyRate: this.calculateOccupancyRate(rooms),
                revPAR: this.calculateRevPAR(revenue, rooms),
                adr: this.calculateADR(revenue, bookings),
                bookingPace: this.calculateBookingPace(bookings),
                customerRetention: this.calculateRetentionRate(bookings)
            };
        },

        async processAnalyticsQuery(message) {
            try {
                const data = await this.fetchIntegratedData();
                if (data.status === 'error') {
                    throw new Error(data.error || 'Failed to fetch analytics data');
                }

                // Check if we have the minimum required data
                if (!data.bookings || !data.rooms || !data.revenue) {
                    return "I apologize, but I don't have enough data to provide a meaningful analysis at this moment.";
                }

                const kpis = await this.calculateKPIs(data);
                const trends = this.analyzeBusinessTrends(data);
                
                if (message.includes('performance') || message.includes('kpi')) {
                    return this.formatKPIResponse(kpis);
                } else if (message.includes('trend') || message.includes('growth')) {
                    return this.formatTrendResponse(trends);
                } else if (message.includes('compare')) {
                    return this.generateComparison(data);
                }
                
                return this.generateGeneralAnalytics(data, kpis);
            } catch (error) {
                console.error('Analytics query error:', error);
                return "I apologize, but I'm having trouble analyzing the data right now. Please try again in a moment.";
            }
        },

        generateGeneralAnalytics(data, kpis) {
            try {
                const activeBookings = data.bookings.filter(b => b.status === 'confirmed').length;
                const occupancyTrend = this.calculateOccupancyTrend(data.bookings, data.rooms);
                const revenueTrend = this.calculateRevenueTrend(data.revenue);

                // Calculate weekly change
                const weeklyChange = this.calculateWeeklyChange(data.bookings);
                const peakDays = this.calculatePeakDays(data.bookings);

                return `Comprehensive Hotel Analytics Summary 📊

Occupancy Metrics:
• Current Occupancy: ${kpis.occupancyRate}% ${this.getOccupancyTrend(kpis.occupancyRate)}
• Weekly Trend: ${weeklyChange.occupancy}% ${weeklyChange.occupancy > 0 ? '📈' : '📉'}
• Peak Days: ${peakDays.join(', ')}

Financial Performance:
• RevPAR: $${kpis.revPAR} (Revenue Per Available Room)
• ADR: $${kpis.adr} (Average Daily Rate)
• Monthly Revenue Growth: ${revenueTrend[revenueTrend.length - 1]?.growth.toFixed(1)}%

Booking Statistics:
• Active Bookings: ${activeBookings}
• Booking Pace: ${kpis.bookingPace} bookings/day
• Customer Retention: ${kpis.customerRetention}%
• Forward Bookings: ${this.calculateForwardBookings(data.bookings)} (next 30 days)

Inventory Status:
• Total Rooms: ${data.rooms.length}
• Available: ${data.rooms.filter(r => r.status === 'available').length}
• Under Maintenance: ${data.rooms.filter(r => r.status === 'maintenance').length}

${this.generateMarketInsights(data, kpis)}`;
            } catch (error) {
                console.error('Error generating analytics:', error);
                return "I apologize, but I'm having trouble generating the analysis.";
            }
        },

        calculateWeeklyChange(bookings) {
            const thisWeek = bookings.filter(b => {
                const bookingDate = new Date(b.createdAt);
                return (Date.now() - bookingDate) <= 7 * 24 * 60 * 60 * 1000;
            }).length;

            const lastWeek = bookings.filter(b => {
                const bookingDate = new Date(b.createdAt);
                const diff = Date.now() - bookingDate;
                return diff > 7 * 24 * 60 * 60 * 1000 && diff <= 14 * 24 * 60 * 60 * 1000;
            }).length;

            return {
                occupancy: ((thisWeek - lastWeek) / (lastWeek || 1)) * 100,
                thisWeek,
                lastWeek
            };
        },

        calculatePeakDays(bookings) {
            const dayCount = new Array(7).fill(0);
            bookings.forEach(booking => {
                const day = new Date(booking.checkIn).getDay();
                dayCount[day]++;
            });

            return dayCount
                .map((count, index) => ({ count, day: this.getDayName(index) }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 3)
                .map(({ day }) => day);
        },

        calculateForwardBookings(bookings) {
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            return bookings.filter(booking => {
                const checkIn = new Date(booking.checkIn);
                return checkIn >= now && checkIn <= thirtyDaysFromNow && booking.status === 'confirmed';
            }).length;
        },

        generateMarketInsights(data, kpis) {
            const insights = [];
            
            // Occupancy insights
            if (kpis.occupancyRate < 50) {
                insights.push("• Consider dynamic pricing strategies to boost occupancy");
                insights.push("• Evaluate distribution channel effectiveness");
            } else if (kpis.occupancyRate > 80) {
                insights.push("• Opportunity to optimize room rates");
                insights.push("• Review upselling strategies for premium rooms");
            }

            // Revenue insights
            if (kpis.revPAR < data.rooms[0]?.price * 0.5) {
                insights.push("• RevPAR below market potential - review pricing strategy");
            }

            // Booking pace insights
            if (kpis.bookingPace < 2) {
                insights.push("• Lower than optimal booking pace - consider promotional activities");
            }

            return insights.length > 0 
                ? '\nStrategic Recommendations:\n' + insights.join('\n')
                : '';
        },

        // Analytics helper methods
        calculateOccupancyRate(rooms) {
            const occupied = rooms.filter(r => r.status === 'occupied').length;
            return (occupied / rooms.length * 100).toFixed(1);
        },

        calculateRevPAR(revenue, rooms) {
            const totalRevenue = revenue.reduce((sum, r) => sum + (r.amount || 0), 0);
            return (totalRevenue / rooms.length).toFixed(2);
        },

        calculateADR(revenue, bookings) {
            const totalRevenue = revenue.reduce((sum, r) => sum + (r.amount || 0), 0);
            const roomNights = bookings.reduce((sum, b) => {
                const nights = this.calculateNights(b.checkIn, b.checkOut);
                return sum + nights;
            }, 0);
            return (totalRevenue / roomNights).toFixed(2);
        },

        calculateBookingPace(bookings) {
            const recent = bookings.filter(b => {
                const bookingDate = new Date(b.createdAt);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return bookingDate >= thirtyDaysAgo;
            }).length;
            return (recent / 30).toFixed(1);
        },

        calculateRetentionRate(bookings) {
            const customerBookings = bookings.reduce((acc, booking) => {
                acc[booking.userId] = (acc[booking.userId] || 0) + 1;
                return acc;
            }, {});
            const repeatCustomers = Object.values(customerBookings).filter(count => count > 1).length;
            return (repeatCustomers / Object.keys(customerBookings).length * 100).toFixed(1);
        },

        analyzeBusinessTrends(data) {
            const { bookings, rooms, revenue } = data;
            return {
                occupancyTrend: this.calculateOccupancyTrend(bookings, rooms),
                revenueTrend: this.calculateRevenueTrend(revenue),
                bookingTrend: this.calculateBookingTrend(bookings),
                seasonality: this.analyzeSeasonality(bookings)
            };
        },

        calculateOccupancyTrend(bookings, rooms) {
            const last6Months = new Array(6).fill(0).map((_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                return date.toLocaleString('default', { month: 'short' });
            }).reverse();

            return last6Months.map(month => {
                const monthlyBookings = bookings.filter(b => {
                    const bookingMonth = new Date(b.checkIn).toLocaleString('default', { month: 'short' });
                    return bookingMonth === month;
                });
                const occupiedRooms = monthlyBookings.length;
                return {
                    month,
                    rate: (occupiedRooms / rooms.length) * 100
                };
            });
        },

        calculateRevenueTrend(revenue) {
            const monthlyRevenue = revenue.reduce((acc, r) => {
                const month = new Date(r.date).toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + r.amount;
                return acc;
            }, {});

            return Object.entries(monthlyRevenue).map(([month, amount]) => ({
                month,
                amount,
                growth: this.calculateGrowthRate(month, monthlyRevenue)
            }));
        },

        calculateGrowthRate(currentMonth, revenueData) {
            try {
                if (!revenueData || typeof revenueData !== 'object') {
                    console.warn('Invalid revenue data in calculateGrowthRate:', revenueData);
                    return 0;
                }
        
                const months = Object.keys(revenueData);
                if (!months.length) return 0;
        
                const currentIndex = months.indexOf(currentMonth);
                if (currentIndex <= 0) return 0;
                
                const currentRevenue = revenueData[currentMonth] || 0;
                const previousRevenue = revenueData[months[currentIndex - 1]] || 0;
                
                return previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
            } catch (error) {
                console.error('Error in calculateGrowthRate:', error);
                return 0;
            }
        },

        calculateBookingTrend(bookings) {
            const last30Days = new Array(30).fill(0);
            bookings.forEach(booking => {
                const bookingDate = new Date(booking.createdAt);
                const daysAgo = Math.floor((Date.now() - bookingDate) / (1000 * 60 * 60 * 24));
                if (daysAgo < 30) {
                    last30Days[daysAgo]++;
                }
            });
            return last30Days;
        },

        analyzeSeasonality(bookings) {
            const seasonalData = {
                spring: 0,
                summer: 0,
                fall: 0,
                winter: 0
            };

            bookings.forEach(booking => {
                const month = new Date(booking.checkIn).getMonth();
                if (month >= 2 && month <= 4) seasonalData.spring++;
                else if (month >= 5 && month <= 7) seasonalData.summer++;
                else if (month >= 8 && month <= 10) seasonalData.fall++;
                else seasonalData.winter++;
            });

            return seasonalData;
        },

        formatKPIResponse(kpis) {
            return `Key Performance Indicators:\n
- Occupancy Rate: ${kpis.occupancyRate}%
- Revenue per Available Room (RevPAR): $${kpis.revPAR}
- Average Daily Rate (ADR): $${kpis.adr}
- Booking Pace: ${kpis.bookingPace} bookings/day
- Customer Retention Rate: ${kpis.customerRetention}%`;
        },

        formatTrendResponse(trends) {
            const { occupancyTrend, revenueTrend } = trends;
            
            const occupancySummary = occupancyTrend
                .map(t => `${t.month}: ${t.rate.toFixed(1)}%`)
                .join('\n');

            const revenueSummary = revenueTrend
                .map(t => `${t.month}: $${t.amount.toLocaleString()} (${t.growth > 0 ? '+' : ''}${t.growth.toFixed(1)}%)`)
                .join('\n');

            return `Business Trends Analysis:\n
Occupancy Trends:
${occupancySummary}\n
Revenue Trends:
${revenueSummary}\n
Seasonality Impact:
${this.formatSeasonality(trends.seasonality)}`;
        },

        formatSeasonality(seasonality) {
            return Object.entries(seasonality)
                .map(([season, count]) => `${season}: ${count} bookings`)
                .join('\n');
        },

        generateComparison(data) {
            const currentMonth = new Date().toLocaleString('default', { month: 'short' });
            const prevMonth = new Date(new Date().setMonth(new Date().getMonth() - 1))
                .toLocaleString('default', { month: 'short' });

            const currentMetrics = this.calculateMonthlyMetrics(data, currentMonth);
            const prevMetrics = this.calculateMonthlyMetrics(data, prevMonth);

            return `Month-over-Month Comparison (${prevMonth} vs ${currentMonth}):\n
Revenue: ${this.formatComparison(prevMetrics.revenue, currentMetrics.revenue, true)}
Occupancy: ${this.formatComparison(prevMetrics.occupancy, currentMetrics.occupancy)}%
Bookings: ${this.formatComparison(prevMetrics.bookings, currentMetrics.bookings)}
Average Rate: ${this.formatComparison(prevMetrics.avgRate, currentMetrics.avgRate, true)}`;
        },

        calculateMonthlyMetrics(data, month) {
            const { bookings, revenue } = data;
            const monthlyBookings = bookings.filter(b => 
                new Date(b.checkIn).toLocaleString('default', { month: 'short' }) === month
            );

            const monthlyRevenue = revenue.filter(r => 
                new Date(r.date).toLocaleString('default', { month: 'short' }) === month
            ).reduce((sum, r) => sum + r.amount, 0);

            return {
                revenue: monthlyRevenue,
                bookings: monthlyBookings.length,
                occupancy: (monthlyBookings.length / data.rooms.length) * 100,
                avgRate: monthlyBookings.length ? monthlyRevenue / monthlyBookings.length : 0
            };
        },

        formatComparison(prev, current, isCurrency = false) {
            const change = ((current - prev) / prev * 100).toFixed(1);
            const formatter = new Intl.NumberFormat('en-US', {
                style: isCurrency ? 'currency' : 'decimal',
                currency: 'USD'
            });

            return `${formatter.format(current)} (${change > 0 ? '+' : ''}${change}%)`;
        },

        // Add missing analytics methods
        calculateOccupancyStats(rooms, bookings) {
            const occupied = rooms.filter(r => r.status === 'occupied').length;
            const available = rooms.filter(r => r.status === 'available').length;
            const total = rooms.length;
            
            const monthlyBookings = this.groupBookingsByMonth(bookings);
            const peakMonth = Object.entries(monthlyBookings)
                .sort((a, b) => b[1] - a[1])[0][0];
            
            const avgStayDuration = this.calculateAverageStayDuration(bookings);
            
            return {
                rate: (occupied / total) * 100,
                occupied,
                available,
                peakMonth,
                avgStayDuration
            };
        },

        calculateRevenueStats(revenue, bookings) {
            const total = revenue.reduce((sum, r) => sum + (r.amount || 0), 0);
            const monthlyRevenue = this.groupRevenueByMonth(revenue);
            const bestMonth = Object.entries(monthlyRevenue)
                .sort((a, b) => b[1] - a[1])[0][0];
            
            const prevYearRevenue = this.calculatePreviousYearRevenue(revenue);
            const yoyGrowth = ((total - prevYearRevenue) / prevYearRevenue) * 100;
            
            return {
                total,
                avgPerBooking: total / bookings.length,
                bestMonth,
                trend: this.determineRevenueTrend(monthlyRevenue),
                yoyGrowth
            };
        },

        calculateBookingStats(bookings) {
            const active = bookings.filter(b => b.status === 'confirmed').length;
            const hourlyDistribution = this.calculateHourlyDistribution(bookings);
            const peakHours = this.findPeakHours(hourlyDistribution);
            const popularRoomType = this.findPopularRoomType(bookings);
            const avgValue = this.calculateAverageBookingValue(bookings);
            
            return {
                total: bookings.length,
                active,
                peakHours,
                popularRoomType,
                avgValue
            };
        },

        // Helper methods
        groupBookingsByMonth(bookings) {
            return bookings.reduce((acc, booking) => {
                const month = new Date(booking.checkIn).toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + 1;
                return acc;
            }, {});
        },

        groupRevenueByMonth(revenue) {
            return revenue.reduce((acc, r) => {
                const month = new Date(r.date).toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + (r.amount || 0);
                return acc;
            }, {});
        },

        calculateHourlyDistribution(bookings) {
            const distribution = new Array(24).fill(0);
            bookings.forEach(booking => {
                const hour = new Date(booking.checkIn).getHours();
                distribution[hour]++;
            });
            return distribution;
        },

        findPopularRoomType(bookings) {
            const typeCounts = bookings.reduce((acc, booking) => {
                const type = booking.propertyDetails?.roomType || 'Standard';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});

            return Object.entries(typeCounts)
                .sort((a, b) => b[1] - a[1])[0][0];
        },

        calculateAverageBookingValue(bookings) {
            const total = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
            return total / bookings.length;
        },

        determineRevenueTrend(monthlyRevenue) {
            const values = Object.values(monthlyRevenue);
            const lastThreeMonths = values.slice(-3);
            if (lastThreeMonths.every((v, i) => i === 0 || v > lastThreeMonths[i - 1])) {
                return 'Increasing';
            }
            if (lastThreeMonths.every((v, i) => i === 0 || v < lastThreeMonths[i - 1])) {
                return 'Decreasing';
            }
            return 'Stable';
        },

        calculatePreviousYearRevenue(revenue) {
            const lastYear = new Date();
            lastYear.setFullYear(lastYear.getFullYear() - 1);
            return revenue
                .filter(r => new Date(r.date) <= lastYear)
                .reduce((sum, r) => sum + (r.amount || 0), 0);
        },

        getLast12Months() {
            return new Array(12).fill(0).map((_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                return date.toLocaleString('default', { month: 'short' });
            }).reverse();
        },

        calculateNights(checkIn, checkOut) {
            const start = new Date(checkIn);
            const end = new Date(checkOut);
            return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        },

        // Generate performance report
        async generatePerformanceReport(rooms, bookings, revenue) {
            const occupancyStats = this.calculateOccupancyStats(rooms, bookings);
            const revenueStats = this.calculateRevenueStats(revenue, bookings);
            const bookingStats = this.calculateBookingStats(bookings);

            return `Performance Report:
            
Occupancy Metrics:
- Current Occupancy Rate: ${occupancyStats.rate.toFixed(1)}%
- Occupied Rooms: ${occupancyStats.occupied}
- Available Rooms: ${occupancyStats.available}
- Peak Month: ${occupancyStats.peakMonth}

Revenue Metrics:
- Total Revenue: $${revenueStats.total.toLocaleString()}
- Average Revenue per Booking: $${revenueStats.avgPerBooking.toFixed(2)}
- Best Performing Month: ${revenueStats.bestMonth}
- Revenue Trend: ${revenueStats.trend}
- Year-over-Year Growth: ${revenueStats.yoyGrowth.toFixed(1)}%

Booking Metrics:
- Total Bookings: ${bookingStats.total}
- Active Bookings: ${bookingStats.active}
- Peak Booking Hours: ${bookingStats.peakHours.join(', ')}
- Most Popular Room Type: ${bookingStats.popularRoomType}
- Average Booking Value: $${bookingStats.avgValue.toFixed(2)}`;
        },

        // Remove duplicate methods and fix syntax errors...
        // ...existing methods...
        async handlePredictionQuery(message) {
            try {
                this.predictions.loading = true;
                this.predictions.error = null;

                const prediction = await predictNextMonthOccupancy();
                const formattedPrediction = PredictionFormatter.formatOccupancyPrediction(prediction);
                
                return formattedPrediction;
            } catch (error) {
                console.error('Prediction error:', error);
                return "I apologize, but I'm having trouble generating predictions at the moment.";
            } finally {
                this.predictions.loading = false;
            }
        },

        getOccupancyTrend(rate) {
            if (rate >= 80) return '(Very High) 📈';
            if (rate >= 60) return '(Good) ⭐';
            if (rate >= 40) return '(Moderate) 📊';
            if (rate >= 20) return '(Low) ⚠️';
            return '(Critical) ⚡';
        },

        generateOccupancyInsights(stats) {
            const insights = [];
            
            if (stats.rate < 40) {
                insights.push("• Consider promotional rates to increase occupancy");
                insights.push("• Review pricing strategy for low-demand periods");
            }
            
            if (stats.available < 2) {
                insights.push("• Near full capacity - optimize pricing for remaining rooms");
                insights.push("• Consider waitlist for potential cancellations");
            }
            
            if (stats.maintenance > 0) {
                insights.push("• Expedite maintenance to increase available inventory");
            }
            
            if (stats.avgStayDuration < 2) {
                insights.push("• Opportunity to promote extended stay packages");
            }

            return insights.length > 0 
                ? `\nRecommendations:\n${insights.join('\n')}`
                : '';
        },

        getPerformanceLevel(growthRate) {
            if (growthRate >= 20) return "Exceptional Growth 🌟";
            if (growthRate >= 10) return "Strong Performance ⭐";
            if (growthRate >= 0) return "Stable Performance 📊";
            if (growthRate >= -10) return "Needs Attention ⚠️";
            return "Requires Immediate Action ⚡";
        },

        generateRevenueInsights(analytics) {
            const insights = [];
            
            if (analytics.growthRate > 20) {
                insights.push("• Exceptional revenue growth - consider expanding capacity");
                insights.push("• Evaluate pricing strategy for sustainability");
            }
            if (analytics.dailyAverage > analytics.perRoom) {
                insights.push("• Strong per-room performance - potential for upselling");
            }
            if (analytics.growthRate < 0) {
                insights.push("• Review pricing and marketing strategies");
                insights.push("• Analyze competitor rates and market conditions");
            }
            if (analytics.currentMonth < analytics.total / 12) {
                insights.push("• Current month performing below annual average");
            }

            return insights.length > 0 
                ? `\nInsights & Recommendations:\n${insights.join('\n')}`
                : '';
        },

        generateActionableRecommendations(analytics) {
            const recommendations = [];
            const monthlyAverage = analytics.total / 12;

            if (analytics.currentMonth < monthlyAverage) {
                recommendations.push("• Implement seasonal pricing adjustments");
                recommendations.push("• Launch targeted marketing campaigns");
            }
            if (analytics.perRoom < analytics.dailyAverage) {
                recommendations.push("• Optimize room inventory mix");
                recommendations.push("• Review room pricing tiers");
            }
            if (analytics.growthRate < 5) {
                recommendations.push("• Develop promotional packages");
                recommendations.push("• Enhance value-added services");
            }

            return recommendations.length > 0
                ? `\nAction Plan:\n${recommendations.join('\n')}`
                : '';
        },

        // Add new helper methods
        analyzeBookingPatterns(bookings) {
            const hourlyDistribution = new Array(24).fill(0);
            const dailyDistribution = new Array(7).fill(0);
            const leadTimes = [];

            bookings.forEach(booking => {
                const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                const checkInDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                
                hourlyDistribution[bookingDate.getHours()]++;
                dailyDistribution[bookingDate.getDay()]++;
                
                // Calculate lead time in days
                const leadTime = Math.ceil((checkInDate - bookingDate) / (1000 * 60 * 60 * 24));
                leadTimes.push(leadTime);
            });

            const peakHours = this.findPeakPeriods(hourlyDistribution, 3);
            const peakDays = this.findPeakPeriods(dailyDistribution, 3);
            const avgLeadTime = leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length;

            return {
                peakHours,
                peakDays,
                avgLeadTime: Math.round(avgLeadTime),
                hourlyDistribution,
                dailyDistribution
            };
        },

        calculateRoomTypeDistribution(bookings) {
            const distribution = bookings.reduce((acc, booking) => {
                const roomType = booking.propertyDetails?.roomType || 'Standard';
                acc[roomType] = (acc[roomType] || 0) + 1;
                return acc;
            }, {});

            return Object.entries(distribution).map(([type, count]) => ({
                type,
                count,
                percentage: (count / bookings.length * 100).toFixed(1)
            })).sort((a, b) => b.count - a.count);
        },

        calculateBookingRevenue(bookings) {
            try {
                if (!Array.isArray(bookings)) {
                    console.warn('Invalid bookings data in calculateBookingRevenue');
                    return {
                        total: 0,
                        average: 0,
                        projected: 0
                    };
                }
        
                const totalRevenue = bookings.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);
                const avgRevenuePerBooking = bookings.length ? totalRevenue / bookings.length : 0;
                
                // Calculate growth rate safely
                const currentBookings = bookings.filter(b => {
                    const date = new Date(b.createdAt?.toDate?.() || b.createdAt);
                    return date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                });
                
                const previousBookings = bookings.filter(b => {
                    const date = new Date(b.createdAt?.toDate?.() || b.createdAt);
                    return date >= new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) &&
                           date < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                });
        
                const growthRate = previousBookings.length ? 
                    ((currentBookings.length - previousBookings.length) / previousBookings.length) : 
                    0;
                
                return {
                    total: totalRevenue,
                    average: avgRevenuePerBooking,
                    projected: totalRevenue * (1 + growthRate)
                };
            } catch (error) {
                console.error('Error in calculateBookingRevenue:', error);
                return {
                    total: 0,
                    average: 0,
                    projected: 0
                };
            }
        },

        findPeakPeriods(distribution, count) {
            return distribution
                .map((value, index) => ({ index, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, count)
                .map(({ index, value }) => ({
                    period: index,
                    count: value,
                    percentage: (value / distribution.reduce((sum, val) => sum + val, 0) * 100).toFixed(1)
                }));
        },

        // Add missing helper methods for historical calculations
        calculateAverageLeadTime(bookings) {
            if (!bookings || bookings.length === 0) return 0;

            const leadTimes = bookings.map(booking => {
                const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                const checkInDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                return Math.ceil((checkInDate - bookingDate) / (1000 * 60 * 60 * 24));
            });

            return leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;
        },

        calculateHistoricalOccupancy(data) {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            const historicalBookings = data.bookings.filter(booking => {
                const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                return checkIn <= lastMonth && booking.status === 'confirmed';
            });

            return (historicalBookings.length / data.rooms.length) * 100;
        },

        calculateHistoricalRevenue(data) {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            const historicalRevenue = data.revenue
                .filter(r => new Date(r.date) <= lastMonth)
                .reduce((sum, r) => sum + (r.amount || 0), 0);

            return historicalRevenue;
        },

        async generateMonthlyComparisonReport(data) {
            try {
                // Get current and previous month data
                const now = new Date();
                const currentMonthName = now.toLocaleString('default', { month: 'long' });
                const currentMonthShort = now.toLocaleString('default', { month: 'short' });
                const currentYear = now.getFullYear();
                
                // Calculate previous month
                const prevMonth = new Date(now);
                prevMonth.setMonth(now.getMonth() - 1);
                const prevMonthName = prevMonth.toLocaleString('default', { month: 'long' });
                const prevMonthShort = prevMonth.toLocaleString('default', { month: 'short' });
                const prevMonthYear = prevMonth.getFullYear();
                
                // Log period boundaries for debugging
                console.log('Generating comparison for:', {
                    currentMonth: currentMonthName,
                    currentYear,
                    prevMonth: prevMonthName,
                    prevMonthYear
                });
                
                // Calculate metrics for current month
                const currentMonthMetrics = await this.calculateMonthMetrics(data, currentMonthShort, currentYear);
                
                // Calculate metrics for previous month
                const prevMonthMetrics = await this.calculateMonthMetrics(data, prevMonthShort, prevMonthYear);
                
                // Calculate percentage changes
                const changes = {
                    occupancy: this.calculateChange(prevMonthMetrics.occupancy, currentMonthMetrics.occupancy),
                    revenue: this.calculateChange(prevMonthMetrics.revenue, currentMonthMetrics.revenue),
                    adr: this.calculateChange(prevMonthMetrics.adr, currentMonthMetrics.adr),
                    revpar: this.calculateChange(prevMonthMetrics.revpar, currentMonthMetrics.revpar),
                    bookingCount: this.calculateChange(prevMonthMetrics.bookings.count, currentMonthMetrics.bookings.count),
                    cancelRate: this.calculateChange(prevMonthMetrics.bookings.cancelRate, currentMonthMetrics.bookings.cancelRate),
                    avgStay: this.calculateChange(prevMonthMetrics.bookings.avgStayLength, currentMonthMetrics.bookings.avgStayLength)
                };
                
                // Generate performance indicators
                const indicators = {
                    overall: this.determineOverallPerformance(changes),
                    occupancy: this.getChangeIndicator(changes.occupancy),
                    revenue: this.getChangeIndicator(changes.revenue),
                    adr: this.getChangeIndicator(changes.adr),
                    revpar: this.getChangeIndicator(changes.revpar),
                    bookings: this.getChangeIndicator(changes.bookingCount),
                    cancelRate: this.getChangeIndicator(-changes.cancelRate) // Reverse indicator for cancellation rate
                };
                
                // Generate insights based on changes
                const insights = this.generateComparisonInsights(currentMonthMetrics, prevMonthMetrics, changes);
                
                // Generate recommendations
                const recommendations = this.generateMonthlyComparisonRecommendations(changes, currentMonthMetrics);
                
                // Format the response
                return `Monthly Performance Comparison: ${prevMonthName} vs ${currentMonthName} ${indicators.overall}\n
Overall Performance Summary:
• ${this.formatPerformanceStatus(indicators.overall, changes)}

Occupancy Metrics ${indicators.occupancy}:
• Current Month: ${currentMonthMetrics.occupancy.toFixed(1)}% occupancy
• Previous Month: ${prevMonthMetrics.occupancy.toFixed(1)}% occupancy
• Change: ${this.formatChange(changes.occupancy)}% ${this.getChangeDescription(changes.occupancy, "occupancy")}

Revenue Performance ${indicators.revenue}:
• Current Month: $${this.formatNumber(currentMonthMetrics.revenue)}
• Previous Month: $${this.formatNumber(prevMonthMetrics.revenue)}
• Change: ${this.formatChange(changes.revenue)}% (${this.formatCurrencyDifference(currentMonthMetrics.revenue - prevMonthMetrics.revenue)})

Key Performance Indicators:
• ADR: $${currentMonthMetrics.adr.toFixed(2)} ${this.formatChange(changes.adr, true)}%
• RevPAR: $${currentMonthMetrics.revpar.toFixed(2)} ${this.formatChange(changes.revpar, true)}%
• Booking Volume: ${currentMonthMetrics.bookings.count} bookings ${this.formatChange(changes.bookingCount, true)}%
• Cancellation Rate: ${currentMonthMetrics.bookings.cancelRate.toFixed(1)}% ${this.formatChange(-changes.cancelRate, true)}%
• Average Stay Length: ${currentMonthMetrics.bookings.avgStayLength.toFixed(1)} days ${this.formatChange(changes.avgStay, true)}%

Room Type Performance:
${this.formatRoomTypeComparison(currentMonthMetrics.roomTypes, prevMonthMetrics.roomTypes)}

Channel Distribution:
${this.formatChannelComparison(currentMonthMetrics.channels, prevMonthMetrics.channels)}

${insights}

${recommendations}

${this.generateMarketComparisonNote(currentMonthMetrics, changes)}`;
            } catch (error) {
                console.error('Error generating monthly comparison report:', error);
                return "I apologize, but I encountered an issue generating the monthly comparison report. Please try again later.";
            }
        },

        async calculateMonthMetrics(data, monthShort, year) {
            // Filter data for the specified month
            const monthBookings = data.bookings.filter(booking => {
                const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                return bookingDate.toLocaleString('default', { month: 'short' }) === monthShort && 
                       bookingDate.getFullYear() === year;
            });
            
            const confirmedBookings = monthBookings.filter(b => 
                b.status?.toLowerCase() === 'confirmed' || b.status?.toLowerCase() === 'completed'
            );
            
            const cancelledBookings = monthBookings.filter(b => 
                b.status?.toLowerCase() === 'cancelled'
            );
            
            // Calculate room occupancy
            const occupancyRate = data.rooms.length ? 
                (confirmedBookings.length / data.rooms.length) * 100 : 0;
            
            // Calculate revenue
            const totalRevenue = confirmedBookings.reduce((sum, booking) => 
                sum + (booking.totalPrice || booking.totalAmount || 0), 0);
            
            // Calculate ADR (Average Daily Rate)
            const totalRoomNights = confirmedBookings.reduce((sum, booking) => {
                const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                const checkOut = new Date(booking.checkOut?.toDate?.() || booking.checkOut);
                const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                return sum + nights;
            }, 0);
            
            const adr = totalRoomNights ? totalRevenue / totalRoomNights : 0;
            
            // Calculate RevPAR (Revenue Per Available Room)
            const totalRooms = data.rooms.length;
            const daysInMonth = new Date(year, monthShort === 'Feb' ? 2 : (new Date().getMonth() + 1), 0).getDate();
            const totalRoomNightsAvailable = totalRooms * daysInMonth;
            
            const revpar = totalRoomNightsAvailable ? totalRevenue / totalRoomNightsAvailable : 0;
            
            // Calculate average stay length
            const avgStayLength = confirmedBookings.length ? totalRoomNights / confirmedBookings.length : 0;
            
            // Calculate room type distribution
            const roomTypes = this.calculateRoomTypeDistribution(confirmedBookings);
            
            // Calculate booking channel distribution
            const channels = this.calculateChannelDistribution(confirmedBookings);
            
            // Calculate cancellation rate
            const cancelRate = monthBookings.length ? 
                (cancelledBookings.length / monthBookings.length) * 100 : 0;
            
            return {
                occupancy: occupancyRate,
                revenue: totalRevenue,
                adr: adr,
                revpar: revpar,
                bookings: {
                    count: confirmedBookings.length,
                    cancelled: cancelledBookings.length,
                    cancelRate: cancelRate,
                    avgStayLength: avgStayLength
                },
                roomTypes: roomTypes,
                channels: channels
            };
        },

        calculateChannelDistribution(bookings) {
            // Default channels
            const channels = {
                'Direct': 0,
                'OTA': 0,
                'Corporate': 0,
                'Travel Agent': 0,
                'Other': 0
            };
            
            bookings.forEach(booking => {
                const channel = booking.bookingChannel || booking.bookingSource || 'Other';
                
                if (channels.hasOwnProperty(channel)) {
                    channels[channel]++;
                } else if (channel.includes('book') || channel.includes('expedia') || 
                          channel.includes('airbnb') || channel.includes('trip') ||
                          channel.includes('hotels') || channel.includes('travel')) {
                    channels['OTA']++;
                } else if (channel.includes('corp') || channel.includes('business')) {
                    channels['Corporate']++;
                } else if (channel.includes('agent') || channel.includes('agency')) {
                    channels['Travel Agent']++;
                } else {
                    channels['Other']++;
                }
            });
            
            // Calculate percentages
            const total = Object.values(channels).reduce((sum, count) => sum + count, 0);
            
            if (total > 0) {
                Object.keys(channels).forEach(key => {
                    channels[key] = {
                        count: channels[key],
                        percentage: (channels[key] / total * 100)
                    };
                });
            } else {
                Object.keys(channels).forEach(key => {
                    channels[key] = {
                        count: 0,
                        percentage: 0
                    };
                });
            }
            
            return channels;
        },

        calculateChange(prevValue, currentValue) {
            if (prevValue === 0) {
                return currentValue > 0 ? 100 : 0;
            }
            
            return ((currentValue - prevValue) / Math.abs(prevValue)) * 100;
        },

        getChangeIndicator(change) {
            if (change > 15) return '📈';
            if (change > 5) return '⬆️';
            if (change > -5) return '↔️';
            if (change > -15) return '⬇️';
            return '📉';
        },

        formatChange(change, withSymbol = false) {
            const formatted = Math.abs(change).toFixed(1);
            if (withSymbol) {
                return change >= 0 ? `+${formatted}` : `-${formatted}`;
            }
            return formatted;
        },

        formatCurrencyDifference(difference) {
            const prefix = difference >= 0 ? '+$' : '-$';
            return `${prefix}${Math.abs(difference).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        },

        getChangeDescription(change, metric) {
            if (change > 15) return `significant increase in ${metric}`;
            if (change > 5) return `moderate increase in ${metric}`;
            if (change > -5 && change < 5) return `stable ${metric}`;
            if (change > -15) return `moderate decrease in ${metric}`;
            return `significant decrease in ${metric}`;
        },

        determineOverallPerformance(changes) {
            // Weight the KPIs
            const weightedScore = 
                (changes.revenue * 0.35) + 
                (changes.occupancy * 0.25) + 
                (changes.revpar * 0.2) + 
                (changes.adr * 0.1) + 
                (changes.bookingCount * 0.1) - 
                (changes.cancelRate * 0.05);  // Cancellation rate is inverse
            
            if (weightedScore > 15) return '🌟';
            if (weightedScore > 5) return '📈';
            if (weightedScore > -5) return '📊';
            if (weightedScore > -15) return '📉';
            return '⚠️';
        },

        formatPerformanceStatus(indicator, changes) {
            const revenueStatus = changes.revenue > 0 ? "increased" : "decreased";
            const occupancyStatus = changes.occupancy > 0 ? "higher" : "lower";
            
            switch(indicator) {
                case '🌟':
                    return `Outstanding performance with ${Math.abs(changes.revenue).toFixed(1)}% ${revenueStatus} revenue and ${Math.abs(changes.occupancy).toFixed(1)}% ${occupancyStatus} occupancy`;
                case '📈':
                    return `Strong performance with ${Math.abs(changes.revenue).toFixed(1)}% ${revenueStatus} revenue and ${Math.abs(changes.occupancy).toFixed(1)}% ${occupancyStatus} occupancy`;
                case '📊':
                    return `Stable performance with ${Math.abs(changes.revenue).toFixed(1)}% ${revenueStatus} revenue and ${Math.abs(changes.occupancy).toFixed(1)}% ${occupancyStatus} occupancy`;
                case '📉':
                    return `Declining performance with ${Math.abs(changes.revenue).toFixed(1)}% ${revenueStatus} revenue and ${Math.abs(changes.occupancy).toFixed(1)}% ${occupancyStatus} occupancy`;
                case '⚠️':
                    return `Significant decline with ${Math.abs(changes.revenue).toFixed(1)}% ${revenueStatus} revenue and ${Math.abs(changes.occupancy).toFixed(1)}% ${occupancyStatus} occupancy`;
                default:
                    return `Performance changed with ${Math.abs(changes.revenue).toFixed(1)}% ${revenueStatus} revenue and ${Math.abs(changes.occupancy).toFixed(1)}% ${occupancyStatus} occupancy`;
            }
        },

        formatRoomTypeComparison(current, previous) {
            const lines = [];
            
            // Merge all room types from current and previous
            const allRoomTypes = new Set([...Object.keys(current), ...Object.keys(previous)]);
            
            allRoomTypes.forEach(roomType => {
                const currentData = current[roomType] || { count: 0, percentage: 0 };
                const prevData = previous[roomType] || { count: 0, percentage: 0 };
                const change = this.calculateChange(prevData.percentage, currentData.percentage);
                const indicator = this.getChangeIndicator(change);
                
                lines.push(`• ${roomType}: ${currentData.percentage.toFixed(1)}% of bookings ${indicator} (${this.formatChange(change, true)}%)`);
            });
            
            return lines.join('\n');
        },

        formatChannelComparison(current, previous) {
            const lines = [];
            
            // Show only top channels with changes
            const topChannels = Object.keys(current)
                .sort((a, b) => current[b].count - current[a].count)
                .slice(0, 3);
            
            topChannels.forEach(channel => {
                const currentData = current[channel];
                const prevData = previous[channel] || { count: 0, percentage: 0 };
                const change = this.calculateChange(prevData.percentage, currentData.percentage);
                const indicator = this.getChangeIndicator(change);
                
                lines.push(`• ${channel}: ${currentData.percentage.toFixed(1)}% of bookings ${indicator} (${this.formatChange(change, true)}%)`);
            });
            
            return lines.join('\n');
        },

        generateComparisonInsights(current, previous, changes) {
            const insights = [];
            
            // RevPAR vs Occupancy analysis
            if (changes.revpar > 0 && changes.occupancy < 0) {
                insights.push("• Revenue per room has increased despite lower occupancy, indicating successful rate optimization");
            } else if (changes.revpar < 0 && changes.occupancy > 0) {
                insights.push("• Despite higher occupancy, revenue per room has decreased, suggesting potential rate strategy issues");
            }
            
            // ADR analysis
            if (changes.adr > 10) {
                insights.push("• Significant increase in average daily rate suggests successful premium pricing or shift to higher-value room types");
            } else if (changes.adr < -10) {
                insights.push("• Notable decrease in average daily rate may indicate pricing pressure or competitive market conditions");
            }
            
            // Cancellation analysis
            if (changes.cancelRate > 15) {
                insights.push("• Rising cancellation rate deserves attention - consider reviewing booking policies or pre-arrival communications");
            } else if (changes.cancelRate < -15) {
                insights.push("• Improved cancellation rate indicates more committed bookings - policy changes or guest communications are working well");
            }
            
            // Length of stay analysis
            if (changes.avgStay > 10) {
                insights.push("• Increased average stay length is improving operational efficiency and reducing turnover costs");
            } else if (changes.avgStay < -10) {
                insights.push("• Shorter average stays are increasing operational demands and turnover costs");
            }
            
            // Channel mix analysis
            const directChannel = current.channels['Direct'];
            const prevDirectChannel = previous.channels['Direct'] || { percentage: 0 };
            if (directChannel && prevDirectChannel) {
                const directChange = this.calculateChange(prevDirectChannel.percentage, directChannel.percentage);
                if (directChange > 10) {
                    insights.push("• Direct bookings have increased significantly, reducing commission costs and improving margins");
                } else if (directChange < -10) {
                    insights.push("• Decrease in direct bookings is increasing reliance on third-party channels and related commissions");
                }
            }
            
            // Add seasonal context if appropriate
            const now = new Date();
            const currentMonth = now.getMonth();
            if ((currentMonth === 11 || currentMonth === 0) && changes.occupancy < 0) {
                insights.push("• Seasonal fluctuations may be affecting current performance metrics during this holiday period");
            } else if ((currentMonth === 5 || currentMonth === 6) && changes.occupancy > 0) {
                insights.push("• Current performance is benefiting from peak summer travel season");
            }
            
            if (insights.length === 0) {
                insights.push("• Performance metrics are showing stability across key indicators");
                insights.push("• No significant anomalies or trends requiring immediate attention");
            }
            
            return `Key Insights:\n${insights.join('\n')}`;
        },

        generateMonthlyComparisonRecommendations(changes, currentMetrics) {
            const recommendations = [];
            
            // Occupancy-based recommendations
            if (changes.occupancy < -10) {
                recommendations.push("• Implement targeted promotions or packages to boost occupancy for remaining days this month");
                recommendations.push("• Review competitor pricing and adjust rate strategy if market conditions have shifted");
            } else if (changes.occupancy > 15) {
                recommendations.push("• Consider opportunities to increase rates during high-demand periods");
                recommendations.push("• Analyze high-occupancy patterns to optimize staffing and operational efficiency");
            }
            
            // Revenue-based recommendations
            if (changes.revenue < -10) {
                recommendations.push("• Evaluate ancillary revenue opportunities to offset room revenue declines");
                recommendations.push("• Consider length-of-stay incentives to maximize total guest value");
            } else if (changes.revenue > 15 && changes.occupancy < 5) {
                recommendations.push("• Current pricing strategy is effective - continue optimizing rates based on demand patterns");
            }
            
            // Room type recommendations
            const roomTypes = Object.entries(currentMetrics.roomTypes)
                .sort((a, b) => a[1].percentage - b[1].percentage);
            
            if (roomTypes.length > 0) {
                const leastPopular = roomTypes[0];
                if (leastPopular[1].percentage < 10) {
                    recommendations.push(`• Review pricing and positioning of ${leastPopular[0]} rooms which are underperforming in the mix`);
                }
            }
            
            // Channel recommendations
            const direct = currentMetrics.channels['Direct'];
            if (direct && direct.percentage < 20) {
                recommendations.push("• Focus on enhancing direct booking incentives to reduce commission costs and improve margins");
            }
            
            // Seasonal recommendations
            const now = new Date();
            const currentMonth = now.getMonth();
            const lookingTowardsPeak = (currentMonth >= 2 && currentMonth <= 4) || (currentMonth >= 9 && currentMonth <= 10);
            if (lookingTowardsPeak) {
                recommendations.push("• Begin advance planning for upcoming peak season with anticipatory rate strategies");
            }
            
            if (recommendations.length === 0) {
                recommendations.push("• Continue monitoring current performance trends");
                recommendations.push("• Maintain successful pricing and distribution strategies");
            }
            
            return `Strategic Recommendations:\n${recommendations.join('\n')}`;
        },

        generateMarketComparisonNote(currentMetrics, changes) {
            // This could be enhanced with actual market data when available
            const marketOccupancy = 62.5; // Example industry average
            const marketADR = 124.75;     // Example industry average
            
            const occupancyDiff = currentMetrics.occupancy - marketOccupancy;
            const adrDiff = currentMetrics.adr - marketADR;
            
            let note = "Market Position:\n";
            
            if (occupancyDiff > 5 && adrDiff > 5) {
                note += "• Outperforming market in both occupancy and rate - maintaining premium position";
            } else if (occupancyDiff > 5 && adrDiff < 0) {
                note += "• Higher than market occupancy but lower rates - potential opportunity for rate optimization";
            } else if (occupancyDiff < 0 && adrDiff > 5) {
                note += "• Maintaining premium rates with lower occupancy compared to market averages";
            } else if (occupancyDiff < -5 && adrDiff < -5) {
                note += "• Currently below market performance in both occupancy and rate - review competitive positioning";
            } else {
                note += "• Performance generally aligned with estimated market averages";
            }
            
            return note;
        },

        async generateQuarterlySalesAnalysis(data) {
            try {
                // Get current date info
                const now = new Date();
                const currentQuarter = Math.floor(now.getMonth() / 3);
                const currentYear = now.getFullYear();

                // Calculate quarter date ranges
                const quarterStart = new Date(currentYear, currentQuarter * 3, 1);
                const quarterEnd = new Date(currentYear, (currentQuarter + 1) * 3, 0);
                const prevQuarterStart = new Date(currentYear, (currentQuarter - 1) * 3, 1);
                const prevQuarterEnd = new Date(currentYear, currentQuarter * 3, 0);

                // Filter bookings for Ever Lodge only
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Filter for current and previous quarters
                const currentQuarterBookings = everLodgeBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate >= quarterStart && bookingDate <= quarterEnd;
                });

                const prevQuarterBookings = everLodgeBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate >= prevQuarterStart && bookingDate <= prevQuarterEnd;
                });

                // Calculate sales metrics using Ever Lodge rates
                const STANDARD_RATE = 1300; // ₱1,300 per night standard rate
                const NIGHT_PROMO_RATE = 580; // ₱580 per night promo rate

                const calculateBookingSales = (booking) => {
                    const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    const checkOut = new Date(booking.checkOut?.toDate?.() || booking.checkOut);
                    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                    
                    // Use the appropriate rate based on booking type
                    const rate = booking.checkInTime === 'night-promo' ? NIGHT_PROMO_RATE : STANDARD_RATE;
                    const baseSales = rate * nights;
                    
                    // Apply weekly discount if applicable
                    if (nights >= 7) {
                        return baseSales * 0.9; // 10% weekly discount
                    }
                    return baseSales;
                };

                // Calculate total sales for each quarter
                const currentQuarterSales = currentQuarterBookings.reduce((sum, booking) => 
                    sum + calculateBookingSales(booking), 0);
                const prevQuarterSales = prevQuarterBookings.reduce((sum, booking) => 
                    sum + calculateBookingSales(booking), 0);

                const quarterlyGrowth = prevQuarterSales ? 
                    ((currentQuarterSales - prevQuarterSales) / prevQuarterSales) * 100 : 0;

                // Calculate room type sales distribution
                const roomTypeSales = {};
                currentQuarterBookings.forEach(booking => {
                    const roomType = booking.propertyDetails?.roomType || 'Standard';
                    const sales = calculateBookingSales(booking);
                    roomTypeSales[roomType] = (roomTypeSales[roomType] || 0) + sales;
                });

                // Calculate average daily rate (ADR)
                const currentADR = currentQuarterBookings.length ? 
                    currentQuarterSales / currentQuarterBookings.length : 0;
                const prevADR = prevQuarterBookings.length ? 
                    prevQuarterSales / prevQuarterBookings.length : 0;
                const adrGrowth = prevADR ? ((currentADR - prevADR) / prevADR) * 100 : 0;

                // Generate performance indicator
                const performanceIndicator = this.getChangeIndicator(quarterlyGrowth);
                const performanceLevel = this.getPerformanceLevel(quarterlyGrowth);

                // Format the response
                return `Quarterly Sales Analysis for Ever Lodge ${performanceIndicator}\n
Sales Performance:
• Current Quarter: ₱${this.formatNumber(currentQuarterSales)}
• Previous Quarter: ₱${this.formatNumber(prevQuarterSales)}
• Growth Rate: ${quarterlyGrowth.toFixed(1)}% ${this.getChangeDescription(quarterlyGrowth, "sales")}

Booking Performance:
• Current Quarter Bookings: ${currentQuarterBookings.length}
• Previous Quarter Bookings: ${prevQuarterBookings.length}
• Average Daily Rate: ₱${this.formatNumber(currentADR)} (${adrGrowth > 0 ? '+' : ''}${adrGrowth.toFixed(1)}% change)

Sales Distribution by Room Type:
${Object.entries(roomTypeSales)
    .sort((a, b) => b[1] - a[1])
    .map(([type, sales]) => `• ${type}: ₱${this.formatNumber(sales)} (${((sales/currentQuarterSales)*100).toFixed(1)}%)`)
    .join('\n')}

Performance Assessment:
• Overall Status: ${performanceLevel}
${this.generateQuarterlyInsights(quarterlyGrowth, currentQuarterBookings, prevQuarterBookings)}

${this.generateQuarterlyRecommendations(quarterlyGrowth, currentADR, adrGrowth)}

Would you like to explore specific aspects of our quarterly performance or analyze other time periods?`;

            } catch (error) {
                console.error('Error generating quarterly sales analysis:', error);
                return "I apologize, but I'm having trouble analyzing the quarterly sales data at the moment.";
            }
        },

        formatNumber(value) {
            return value.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },

        generateQuarterlyInsights(growth, currentBookings, prevBookings) {
            const insights = [];
            
            // Sales-based insights
            if (growth > 15) {
                insights.push("• Strong quarter-over-quarter sales growth indicates successful pricing strategies");
                insights.push("• Current marketing and promotional initiatives are delivering results");
            } else if (growth < -15) {
                insights.push("• Significant decline in quarterly sales requires immediate attention");
                insights.push("• Review pricing strategy and market positioning");
            } else if (growth > 0) {
                insights.push("• Moderate sales growth shows stable market performance");
            } else {
                insights.push("• Sales stabilization measures may be needed");
            }

            // Booking volume insights
            const bookingGrowth = ((currentBookings.length - prevBookings.length) / (prevBookings.length || 1)) * 100;
            if (Math.abs(bookingGrowth - growth) > 10) {
                insights.push("• Booking volume and sales growth are misaligned - review pricing strategy");
            }

            return insights.join('\n');
        },

        generateQuarterlyRecommendations(growth, currentADR, adrGrowth) {
            const recommendations = [];

            if (growth < 0) {
                recommendations.push("• Consider implementing promotional packages to boost sales");
                recommendations.push("• Review and optimize booking channels");
            }

            if (adrGrowth < 0) {
                recommendations.push("• Evaluate room rate structure and market positioning");
                recommendations.push("• Consider value-added services to maintain average daily rate");
            }

            if (growth > 15) {
                recommendations.push("• Capitalize on strong performance with premium room packages");
                recommendations.push("• Consider strategic rate adjustments during peak periods");
            }

            return "Strategic Recommendations:\n" + recommendations.join('\n');
        },

        async generateBookingAnalysis(data, queryType) {
            try {
                // Filter for Ever Lodge bookings only
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Calculate weekend vs weekday bookings
                const weekendBookings = everLodgeBookings.filter(booking => {
                    const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return checkIn.getDay() === 0 || checkIn.getDay() === 6; // Sunday = 0, Saturday = 6
                });

                const weekdayBookings = everLodgeBookings.filter(booking => {
                    const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return checkIn.getDay() > 0 && checkIn.getDay() < 6;
                });

                // Calculate lead times
                const calculateLeadTime = (booking) => {
                    const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                    const checkInDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return Math.ceil((checkInDate - bookingDate) / (1000 * 60 * 60 * 24)); // Convert to days
                };

                const weekendLeadTimes = weekendBookings.map(calculateLeadTime);
                const weekdayLeadTimes = weekdayBookings.map(calculateLeadTime);

                const avgWeekendLeadTime = weekendLeadTimes.length ? 
                    weekendLeadTimes.reduce((a, b) => a + b, 0) / weekendLeadTimes.length : 0;
                const avgWeekdayLeadTime = weekdayLeadTimes.length ? 
                    weekdayLeadTimes.reduce((a, b) => a + b, 0) / weekdayLeadTimes.length : 0;

                // Calculate cancellation rates by channel
                const bookingChannels = {};
                everLodgeBookings.forEach(booking => {
                    const channel = booking.bookingChannel || 'Direct';
                    if (!bookingChannels[channel]) {
                        bookingChannels[channel] = {
                            total: 0,
                            cancelled: 0
                        };
                    }
                    bookingChannels[channel].total++;
                    if (booking.status?.toLowerCase() === 'cancelled') {
                        bookingChannels[channel].cancelled++;
                    }
                });

                // Calculate channel statistics
                const channelStats = Object.entries(bookingChannels).map(([channel, stats]) => ({
                    channel,
                    total: stats.total,
                    cancelled: stats.cancelled,
                    cancellationRate: (stats.cancelled / stats.total) * 100
                })).sort((a, b) => a.cancellationRate - b.cancellationRate);

                // Generate appropriate response based on query type
                if (queryType.includes('lead time') && queryType.includes('weekend')) {
                    return `Weekend Booking Lead Time Analysis for Ever Lodge 📊

Lead Time Statistics:
• Average Weekend Lead Time: ${avgWeekendLeadTime.toFixed(1)} days
• Average Weekday Lead Time: ${avgWeekdayLeadTime.toFixed(1)} days
• Weekend vs Weekday Difference: ${(avgWeekendLeadTime - avgWeekdayLeadTime).toFixed(1)} days

Booking Volume:
• Weekend Bookings: ${weekendBookings.length}
• Weekday Bookings: ${weekdayBookings.length}
• Weekend Booking Ratio: ${((weekendBookings.length / everLodgeBookings.length) * 100).toFixed(1)}%

Lead Time Distribution:
• Short Notice (1-3 days): ${weekendLeadTimes.filter(t => t <= 3).length} bookings
• Medium Notice (4-7 days): ${weekendLeadTimes.filter(t => t > 3 && t <= 7).length} bookings
• Long Notice (>7 days): ${weekendLeadTimes.filter(t => t > 7).length} bookings

Recommendations:
• ${avgWeekendLeadTime > avgWeekdayLeadTime ? 
    'Consider early booking incentives for weekday stays to increase advance bookings' : 
    'Implement weekend advance booking promotions to encourage earlier reservations'}
• Optimize pricing strategy for ${avgWeekendLeadTime < 5 ? 'last-minute weekend bookings' : 'early bird weekend bookings'}
• Focus marketing efforts ${avgWeekendLeadTime > 7 ? 'on immediate availability' : 'on advance planning periods'}

Would you like to explore more specific booking patterns or analyze other metrics?`;
                } else if (queryType.includes('cancellation')) {
                    return `Booking Channel Cancellation Analysis for Ever Lodge 📊

Channel Performance Summary:
${channelStats.map(channel => 
`• ${channel.channel}: ${channel.cancellationRate.toFixed(1)}% cancellation rate (${channel.cancelled}/${channel.total} bookings)`
).join('\n')}

Best Performing Channels:
• Lowest Cancellation: ${channelStats[0].channel} (${channelStats[0].cancellationRate.toFixed(1)}%)
• Highest Volume: ${channelStats.sort((a, b) => b.total - a.total)[0].channel} (${channelStats.sort((a, b) => b.total - a.total)[0].total} bookings)

Recommendations:
• Focus on expanding ${channelStats[0].channel} bookings due to lower cancellation rates
• Review policies for ${channelStats[channelStats.length-1].channel} to reduce cancellations
• Consider implementing stricter cancellation policies for high-risk channels
• Develop retention strategies for channels with high cancellation rates

Would you like to explore specific channel performance metrics or analyze other booking patterns?`;
                } else {
                    // General booking analysis
                    return `General Booking Analysis for Ever Lodge 📊

Booking Volume:
• Total Bookings: ${everLodgeBookings.length}
• Weekend Bookings: ${weekendBookings.length} (${((weekendBookings.length / everLodgeBookings.length) * 100).toFixed(1)}%)
• Weekday Bookings: ${weekdayBookings.length} (${((weekdayBookings.length / everLodgeBookings.length) * 100).toFixed(1)}%)

Lead Time Analysis:
• Overall Average Lead Time: ${((weekendLeadTimes.concat(weekdayLeadTimes).reduce((a, b) => a + b, 0)) / everLodgeBookings.length).toFixed(1)} days
• Weekend Average: ${avgWeekendLeadTime.toFixed(1)} days
• Weekday Average: ${avgWeekdayLeadTime.toFixed(1)} days

Channel Distribution:
${Object.entries(bookingChannels)
    .map(([channel, stats]) => `• ${channel}: ${stats.total} bookings (${((stats.total / everLodgeBookings.length) * 100).toFixed(1)}%)`)
    .join('\n')}

Would you like to explore specific aspects of these booking patterns?`;
                }
            } catch (error) {
                console.error('Error generating booking analysis:', error);
                return "I apologize, but I encountered an error while analyzing the booking data. Please try again.";
            }
        },

        generateOccupancyAnalysis(occupancyData) {
            try {
                // Sort occupancy data from lowest to highest
                occupancyData.sort((a, b) => a.occupancy - b.occupancy);
                
                // Calculate average occupancy
                const avgOccupancy = occupancyData.reduce((sum, room) => sum + room.occupancy, 0) / occupancyData.length;
                
                // Calculate occupancy variance
                const variance = Math.max(...occupancyData.map(room => room.occupancy)) - 
                               Math.min(...occupancyData.map(room => room.occupancy));

                return `Room Occupancy Analysis for Ever Lodge 📊

Occupancy Breakdown by Room Type:
• ${occupancyData[0].roomType} Rooms: ${occupancyData[0].occupancy}% occupancy (Lowest) ⚠️
• ${occupancyData[1].roomType} Rooms: ${occupancyData[1].occupancy}% occupancy 📊
• ${occupancyData[2].roomType} Rooms: ${occupancyData[2].occupancy}% occupancy 📈
• ${occupancyData[3].roomType} Rooms: ${occupancyData[3].occupancy}% occupancy (Highest) ⭐

Key Insights:
• ${occupancyData[0].roomType} rooms are currently underperforming with the lowest occupancy rate of ${occupancyData[0].occupancy}%
• There's a ${variance.toFixed(1)}% occupancy gap between highest and lowest performing room types
• Average occupancy across all room types is ${avgOccupancy.toFixed(1)}%
• ${occupancyData[3].roomType} rooms are showing strongest performance at ${occupancyData[3].occupancy}%

Recommendations:
• Implement targeted promotions for ${occupancyData[0].roomType} rooms to boost occupancy
• Review pricing strategy for ${occupancyData[0].roomType} and ${occupancyData[1].roomType} rooms
• Investigate guest feedback for lower-performing room types
• Consider seasonal packages for ${occupancyData[0].roomType} rooms
• Apply successful strategies from ${occupancyData[3].roomType} rooms to other types

Would you like to explore specific room type performance or analyze other occupancy metrics?`;
            } catch (error) {
                console.error('Error generating occupancy analysis:', error);
                return "I apologize, but I encountered an error analyzing the occupancy data. Please try again.";
            }
        },

        async generateGrowthAnalysis(data) {
            try {
                // Filter for Ever Lodge data
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Calculate current and previous month dates
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                
                const currentMonthBookings = everLodgeBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear;
                });

                const prevMonthBookings = everLodgeBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1) && 
                           bookingDate.getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear);
                });

                // Calculate key metrics
                const currentMonthRevenue = currentMonthBookings.reduce((sum, booking) => {
                    const nights = Math.ceil(
                        (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                         new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                    );
                    const rate = booking.checkInTime === 'night-promo' ? 580 : 1300; // Ever Lodge rates
                    return sum + (nights * rate);
                }, 0);

                const prevMonthRevenue = prevMonthBookings.reduce((sum, booking) => {
                    const nights = Math.ceil(
                        (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                         new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                    );
                    const rate = booking.checkInTime === 'night-promo' ? 580 : 1300;
                    return sum + (nights * rate);
                }, 0);

                // Calculate growth rates
                const revenueGrowth = prevMonthRevenue ? 
                    ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 100;
                const bookingGrowth = prevMonthBookings.length ? 
                    ((currentMonthBookings.length - prevMonthBookings.length) / prevMonthBookings.length) * 100 : 100;

                // Calculate room type growth
                const roomTypeGrowth = {};
                const currentRoomTypes = this.calculateRoomTypeDistribution(currentMonthBookings);
                const prevRoomTypes = this.calculateRoomTypeDistribution(prevMonthBookings);

                Object.keys(currentRoomTypes).forEach(type => {
                    const currentCount = currentRoomTypes[type] || 0;
                    const prevCount = prevRoomTypes[type] || 0;
                    roomTypeGrowth[type] = prevCount ? 
                        ((currentCount - prevCount) / prevCount) * 100 : 
                        currentCount ? 100 : 0;
                });

                return `Growth Analysis for Ever Lodge 📈

Sales Growth:
• Current Month Sales: ₱${this.formatNumber(currentMonthRevenue)}
• Previous Month Sales: ₱${this.formatNumber(prevMonthRevenue)}
• Month-over-Month Growth: ${revenueGrowth.toFixed(1)}% ${this.getGrowthIndicator(revenueGrowth)}

Booking Volume Growth:
• Current Month Bookings: ${currentMonthBookings.length}
• Previous Month Bookings: ${prevMonthBookings.length}
• Booking Growth Rate: ${bookingGrowth.toFixed(1)}% ${this.getGrowthIndicator(bookingGrowth)}

Room Type Performance:
${Object.entries(roomTypeGrowth)
    .sort((a, b) => b[1] - a[1])
    .map(([type, growth]) => `• ${type}: ${growth.toFixed(1)}% growth ${this.getGrowthIndicator(growth)}`)
    .join('\n')}

Key Growth Areas:
• ${this.identifyTopGrowthArea(revenueGrowth, bookingGrowth, roomTypeGrowth)}
• ${this.identifySecondaryGrowthArea(revenueGrowth, bookingGrowth, roomTypeGrowth)}

Recommendations:
${this.generateGrowthRecommendations(revenueGrowth, bookingGrowth, roomTypeGrowth)}

Would you like to explore specific growth metrics or analyze other performance indicators?`;
            } catch (error) {
                console.error('Error generating growth analysis:', error);
                return "I apologize, but I encountered an error analyzing the growth metrics. Please try again.";
            }
        },

        calculateRoomTypeDistribution(bookings) {
            return bookings.reduce((acc, booking) => {
                const roomType = booking.propertyDetails?.roomType || 'Standard';
                acc[roomType] = (acc[roomType] || 0) + 1;
                return acc;
            }, {});
        },

        getGrowthIndicator(growth) {
            if (growth > 20) return '🚀';
            if (growth > 10) return '📈';
            if (growth > 0) return '⬆️';
            if (growth > -10) return '↔️';
            if (growth > -20) return '⬇️';
            return '📉';
        },

        identifyTopGrowthArea(revenueGrowth, bookingGrowth, roomTypeGrowth) {
            const metrics = [
                { name: 'Revenue', growth: revenueGrowth },
                { name: 'Booking Volume', growth: bookingGrowth },
                ...Object.entries(roomTypeGrowth).map(([type, growth]) => ({ 
                    name: `${type} Room Bookings`, growth 
                }))
            ].sort((a, b) => b.growth - a.growth);

            return `${metrics[0].name} shows strongest growth at ${metrics[0].growth.toFixed(1)}%`;
        },

        identifySecondaryGrowthArea(revenueGrowth, bookingGrowth, roomTypeGrowth) {
            const metrics = [
                { name: 'Revenue', growth: revenueGrowth },
                { name: 'Booking Volume', growth: bookingGrowth },
                ...Object.entries(roomTypeGrowth).map(([type, growth]) => ({ 
                    name: `${type} Room Bookings`, growth 
                }))
            ].sort((a, b) => b.growth - a.growth);

            return `${metrics[1].name} follows with ${metrics[1].growth.toFixed(1)}% growth`;
        },

        generateGrowthRecommendations(revenueGrowth, bookingGrowth, roomTypeGrowth) {
            const recommendations = [];

            if (revenueGrowth < bookingGrowth) {
                recommendations.push('• Focus on upselling and premium room promotions to improve revenue per booking');
            }

            const lowestGrowthType = Object.entries(roomTypeGrowth)
                .sort((a, b) => a[1] - b[1])[0];
            recommendations.push(`• Develop targeted marketing for ${lowestGrowthType[0]} rooms to improve performance`);

            if (revenueGrowth < 0 || bookingGrowth < 0) {
                recommendations.push('• Review pricing strategy and implement seasonal promotions');
                recommendations.push('• Enhance marketing efforts in underperforming channels');
            }

            if (revenueGrowth > 10 || bookingGrowth > 10) {
                recommendations.push('• Capitalize on growth momentum with loyalty programs');
                recommendations.push('• Consider strategic price adjustments to maximize revenue');
            }

            return recommendations.join('\n');
        },

        async generateOccupancyTrendAnalysis(data) {
            try {
                console.log('Starting occupancy trend analysis with data:', {
                    bookingsCount: data.bookings?.length,
                    hasData: !!data
                });

                // Filter for Ever Lodge bookings
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                console.log('Filtered Ever Lodge bookings:', everLodgeBookings.length);

                // Get last 6 months data
                const months = [];
                const monthlyOccupancy = [];
                const monthlyRoomTypeOccupancy = {
                    'Standard': [],
                    'Deluxe': [],
                    'Suite': [],
                    'Family': []
                };

                // Calculate for each of the last 6 months
                for (let i = 5; i >= 0; i--) {
                    const targetDate = new Date();
                    targetDate.setMonth(targetDate.getMonth() - i);
                    const monthName = targetDate.toLocaleString('default', { month: 'long' });
                    months.push(monthName);

                    // Filter bookings for this month
                    const monthBookings = everLodgeBookings.filter(booking => {
                        const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                        return bookingDate.getMonth() === targetDate.getMonth() &&
                               bookingDate.getFullYear() === targetDate.getFullYear();
                    });

                    console.log(`${monthName} bookings:`, monthBookings.length);

                    // Calculate overall occupancy for this month
                    const totalRooms = 20; // Ever Lodge total rooms
                    const occupancyRate = (monthBookings.length / totalRooms) * 100;
                    monthlyOccupancy.push(occupancyRate);

                    // Calculate occupancy by room type
                    const roomTypeBookings = {
                        'Standard': 0,
                        'Deluxe': 0,
                        'Suite': 0,
                        'Family': 0
                    };

                    monthBookings.forEach(booking => {
                        const roomType = booking.propertyDetails?.roomType || 'Standard';
                        roomTypeBookings[roomType]++;
                    });

                    // Calculate and store room type occupancy rates
                    Object.keys(roomTypeBookings).forEach(type => {
                        const typeOccupancy = (roomTypeBookings[type] / 5) * 100; // 5 rooms per type
                        monthlyRoomTypeOccupancy[type].push(typeOccupancy);
                    });
                }

                console.log('Monthly occupancy rates:', monthlyOccupancy);

                // Calculate trends
                const currentOccupancy = monthlyOccupancy[5];
                const prevOccupancy = monthlyOccupancy[4];
                const occupancyTrend = ((currentOccupancy - prevOccupancy) / prevOccupancy) * 100;

                // Find best and worst performing months
                const bestMonth = months[monthlyOccupancy.indexOf(Math.max(...monthlyOccupancy))];
                const worstMonth = months[monthlyOccupancy.indexOf(Math.min(...monthlyOccupancy))];

                // Calculate room type trends
                const roomTypeTrends = {};
                Object.keys(monthlyRoomTypeOccupancy).forEach(type => {
                    const current = monthlyRoomTypeOccupancy[type][5];
                    const prev = monthlyRoomTypeOccupancy[type][4];
                    roomTypeTrends[type] = prev ? ((current - prev) / prev) * 100 : 0;
                });

                return `6-Month Occupancy Trend Analysis for Ever Lodge 📊

Monthly Occupancy Rates:
${months.map((month, i) => `• ${month}: ${monthlyOccupancy[i].toFixed(1)}% ${this.getOccupancyIndicator(monthlyOccupancy[i])}`).join('\n')}

Current Performance:
• Latest Month (${months[5]}): ${monthlyOccupancy[5].toFixed(1)}%
• Month-over-Month Change: ${occupancyTrend.toFixed(1)}% ${this.getGrowthIndicator(occupancyTrend)}
• Best Performing Month: ${bestMonth} (${Math.max(...monthlyOccupancy).toFixed(1)}%)
• Lowest Performing Month: ${worstMonth} (${Math.min(...monthlyOccupancy).toFixed(1)}%)

Room Type Trends (Current Month):
${Object.entries(roomTypeTrends)
    .sort((a, b) => b[1] - a[1])
    .map(([type, trend]) => `• ${type}: ${trend.toFixed(1)}% change ${this.getGrowthIndicator(trend)}`)
    .join('\n')}

Key Insights:
• ${this.generateOccupancyTrendInsight(monthlyOccupancy, occupancyTrend)}
• ${this.generateRoomTypeTrendInsight(roomTypeTrends)}
• Overall trend is ${this.getOccupancyTrendDescription(monthlyOccupancy)}

Recommendations:
${this.generateOccupancyTrendRecommendations(monthlyOccupancy, roomTypeTrends)}

Would you like to explore specific month's performance or analyze other occupancy metrics?`;

            } catch (error) {
                console.error('Detailed error in occupancy trend analysis:', error);
                throw new Error(`Failed to analyze occupancy trends: ${error.message}`);
            }
        },

        getOccupancyIndicator(rate) {
            if (rate >= 80) return '🌟';
            if (rate >= 60) return '⭐';
            if (rate >= 40) return '📊';
            return '⚠️';
        },

        generateOccupancyTrendInsight(monthlyOccupancy, currentTrend) {
            const avg = monthlyOccupancy.reduce((a, b) => a + b, 0) / monthlyOccupancy.length;
            const current = monthlyOccupancy[5];
            
            if (current > avg) {
                return `Current occupancy (${current.toFixed(1)}%) is above 6-month average (${avg.toFixed(1)}%)`;
            } else {
                return `Current occupancy (${current.toFixed(1)}%) is below 6-month average (${avg.toFixed(1)}%)`;
            }
        },

        generateRoomTypeTrendInsight(roomTypeTrends) {
            const trends = Object.entries(roomTypeTrends).sort((a, b) => b[1] - a[1]);
            return `${trends[0][0]} rooms show strongest growth at ${trends[0][1].toFixed(1)}%, while ${trends[trends.length-1][0]} rooms show ${trends[trends.length-1][1] < 0 ? 'decline' : 'lowest growth'} at ${trends[trends.length-1][1].toFixed(1)}%`;
        },

        getOccupancyTrendDescription(monthlyOccupancy) {
            const changes = monthlyOccupancy.slice(1).map((curr, i) => curr - monthlyOccupancy[i]);
            const positiveChanges = changes.filter(c => c > 0).length;
            
            if (positiveChanges >= 4) return 'consistently improving 📈';
            if (positiveChanges <= 1) return 'showing decline 📉';
            return 'showing mixed performance with opportunities for improvement 📊';
        },

        generateOccupancyTrendRecommendations(monthlyOccupancy, roomTypeTrends) {
            const recommendations = [];
            const current = monthlyOccupancy[5];
            const trend = ((current - monthlyOccupancy[4]) / monthlyOccupancy[4]) * 100;

            if (current < 60) {
                recommendations.push('• Implement dynamic pricing strategies to boost occupancy rates');
            }

            const lowestPerforming = Object.entries(roomTypeTrends)
                .sort((a, b) => a[1] - b[1])[0];
            recommendations.push(`• Focus on improving ${lowestPerforming[0]} room performance through targeted marketing`);

            if (trend < 0) {
                recommendations.push('• Review and adjust current marketing strategies');
                recommendations.push('• Consider seasonal promotions to increase bookings');
            }

            if (Math.min(...monthlyOccupancy) < 40) {
                recommendations.push('• Develop special packages for low-occupancy periods');
            }

            return recommendations.join('\n');
        },

        async generateBusinessPerformanceAnalysis(data) {
            try {
                console.log('Starting business performance analysis');

                // Filter for Ever Lodge data
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Get current month and previous month
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                // Filter bookings by month with safer date handling
                const currentMonthBookings = everLodgeBookings.filter(booking => {
                    try {
                        const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                        return bookingDate.getMonth() === currentMonth && 
                               bookingDate.getFullYear() === currentYear;
                    } catch (e) {
                        console.warn('Invalid booking date:', e);
                        return false;
                    }
                });

                const prevMonthBookings = everLodgeBookings.filter(booking => {
                    try {
                        const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                        return bookingDate.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1) && 
                               bookingDate.getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear);
                    } catch (e) {
                        console.warn('Invalid booking date:', e);
                        return false;
                    }
                });

                // Calculate key metrics with safer calculations
                const currentMonthRevenue = this.calculateMonthlyRevenue(currentMonthBookings);
                const prevMonthRevenue = this.calculateMonthlyRevenue(prevMonthBookings);
                const revenueGrowth = prevMonthRevenue > 0 ? 
                    ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;

                // Get occupancy data
                const occupancyData = getMonthlyOccupancyByRoomType();
                const averageOccupancy = occupancyData.length > 0 ? 
                    occupancyData.reduce((sum, room) => sum + (room.occupancy || 0), 0) / occupancyData.length : 0;

                // Calculate booking metrics
                const bookingGrowth = prevMonthBookings.length > 0 ?
                    ((currentMonthBookings.length - prevMonthBookings.length) / prevMonthBookings.length) * 100 : 0;

                // Calculate average daily rate (ADR)
                const currentADR = this.calculateADR(currentMonthBookings);
                const prevADR = this.calculateADR(prevMonthBookings);
                const adrGrowth = prevADR > 0 ? ((currentADR - prevADR) / prevADR) * 100 : 0;

                // Simplified performance status
                const performanceStatus = this.getSimplePerformanceStatus(revenueGrowth, averageOccupancy);

                return `Business Performance Summary for Ever Lodge ${performanceStatus}

Revenue:
• This Month: ₱${this.formatNumber(currentMonthRevenue)}
• Change from Last Month: ${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}% ${this.getGrowthIndicator(revenueGrowth)}

Occupancy:
• Current Rate: ${averageOccupancy.toFixed(1)}% ${this.getOccupancyIndicator(averageOccupancy)}
• Most Popular Room: ${this.getMostPopularRoom(occupancyData)}

Bookings:
• This Month: ${currentMonthBookings.length} bookings
• Average Rate: ₱${this.formatNumber(currentADR)}

${this.getSimpleRecommendations(revenueGrowth, averageOccupancy, currentMonthBookings.length)}`;

            } catch (error) {
                console.error('Error generating business performance analysis:', error);
                return 'I apologize, but I encountered an error while analyzing the business performance. Please try again or contact support if the issue persists.';
            }
        },

        getSimplePerformanceStatus(revenueGrowth, occupancy) {
            if (revenueGrowth > 10 && occupancy > 70) return '🌟';
            if (revenueGrowth > 0 && occupancy > 50) return '📈';
            if (revenueGrowth < 0 || occupancy < 40) return '⚠️';
            return '📊';
        },

        getMostPopularRoom(occupancyData) {
            if (!occupancyData || occupancyData.length === 0) return 'Data not available';
            const sorted = [...occupancyData].sort((a, b) => (b.occupancy || 0) - (a.occupancy || 0));
            return `${sorted[0].roomType} (${sorted[0].occupancy?.toFixed(1) || 0}% occupied)`;
        },

        getSimpleRecommendations(revenueGrowth, occupancy, bookingCount) {
            const recommendations = ['Detailed Action Plan:'];
            
            // Revenue-focused recommendations
            if (revenueGrowth < 0) {
                recommendations.push('\nRevenue Optimization:');
                recommendations.push('• Implement dynamic pricing based on demand patterns');
                recommendations.push('  - Higher rates during peak hours (6 PM - 9 PM)');
                recommendations.push('  - Promotional rates for early bookings');
                recommendations.push('• Create value-added packages:');
                recommendations.push('  - Extended stay discounts (10% off for 3+ nights)');
                recommendations.push('  - Business traveler packages with workspace amenities');
            } else if (revenueGrowth < 5) {
                recommendations.push('\nRevenue Enhancement:');
                recommendations.push('• Introduce upselling opportunities:');
                recommendations.push('  - Room upgrades at check-in');
                recommendations.push('  - Premium amenity packages');
                recommendations.push('• Optimize rate structure:');
                recommendations.push('  - Review competitor pricing');
                recommendations.push('  - Adjust rates for high-demand periods');
            }

            // Occupancy-focused recommendations
            if (occupancy < 50) {
                recommendations.push('\nOccupancy Improvement:');
                recommendations.push('• Launch targeted marketing campaigns:');
                recommendations.push('  - Social media promotions highlighting amenities');
                recommendations.push('  - Email campaigns to past guests');
                recommendations.push('• Enhance online visibility:');
                recommendations.push('  - Update photos and descriptions on booking platforms');
                recommendations.push('  - Encourage guest reviews and ratings');
            } else if (occupancy < 70) {
                recommendations.push('\nOccupancy Optimization:');
                recommendations.push('• Focus on low-occupancy periods:');
                recommendations.push('  - Create weekday special offers');
                recommendations.push('  - Target local corporate clients');
                recommendations.push('• Improve booking experience:');
                recommendations.push('  - Streamline online booking process');
                recommendations.push('  - Offer flexible cancellation policies');
            }

            // Booking volume recommendations
            if (bookingCount < 20) {
                recommendations.push('\nBooking Volume Growth:');
                recommendations.push('• Expand distribution channels:');
                recommendations.push('  - Partner with additional OTAs');
                recommendations.push('  - Develop corporate booking partnerships');
                recommendations.push('• Implement booking incentives:');
                recommendations.push('  - Early bird discounts (15% off for 30+ days advance)');
                recommendations.push('  - Loyalty program rewards');
            } else if (bookingCount < 30) {
                recommendations.push('\nBooking Enhancement:');
                recommendations.push('• Optimize existing channels:');
                recommendations.push('  - Improve ranking on OTA platforms');
                recommendations.push('  - Update property descriptions and amenities');
                recommendations.push('• Reduce cancellation rates:');
                recommendations.push('  - Send pre-stay engagement emails');
                recommendations.push('  - Offer check-in time flexibility');
            }

            // If performance is good across all metrics
            if (revenueGrowth > 5 && occupancy > 70 && bookingCount >= 30) {
                recommendations.push('\nSustain Growth:');
                recommendations.push('• Maintain service excellence:');
                recommendations.push('  - Regular staff training programs');
                recommendations.push('  - Proactive maintenance schedules');
                recommendations.push('• Plan for expansion:');
                recommendations.push('  - Evaluate room upgrade opportunities');
                recommendations.push('  - Consider additional amenity offerings');
                recommendations.push('• Build long-term loyalty:');
                recommendations.push('  - Enhance guest recognition program');
                recommendations.push('  - Implement personalized guest services');
            }

            // Add seasonal considerations
            const currentMonth = new Date().getMonth();
            if (currentMonth >= 10 || currentMonth <= 1) { // Winter months
                recommendations.push('\nSeasonal Strategy:');
                recommendations.push('• Winter season optimization:');
                recommendations.push('  - Promote indoor amenities and features');
                recommendations.push('  - Create holiday season packages');
            } else if (currentMonth >= 5 && currentMonth <= 7) { // Summer months
                recommendations.push('\nSeasonal Strategy:');
                recommendations.push('• Summer season optimization:');
                recommendations.push('  - Highlight air conditioning and comfort features');
                recommendations.push('  - Create family vacation packages');
            }

            // Add implementation timeline if there are multiple recommendations
            if (recommendations.length > 2) {
                recommendations.push('\nImplementation Priority:');
                recommendations.push('• Immediate (24-48 hours):');
                recommendations.push('  - Update pricing and promotional offers');
                recommendations.push('  - Adjust online listings and availability');
                recommendations.push('• Short-term (1-2 weeks):');
                recommendations.push('  - Launch marketing campaigns');
                recommendations.push('  - Implement new packages and promotions');
                recommendations.push('• Long-term (1-3 months):');
                recommendations.push('  - Develop loyalty programs');
                recommendations.push('  - Establish new partnerships');
            }

            return recommendations.join('\n');
        },

        calculateMonthlyRevenue(bookings) {
            return bookings.reduce((sum, booking) => {
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                const rate = booking.checkInTime === 'night-promo' ? 580 : 1300; // Ever Lodge rates
                return sum + (nights * rate);
            }, 0);
        },

        calculateADR(bookings) {
            const totalRevenue = this.calculateMonthlyRevenue(bookings);
            const totalNights = bookings.reduce((sum, booking) => {
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                return sum + nights;
            }, 0);
            return totalNights ? totalRevenue / totalNights : 0;
        },

        calculateAverageStayDuration(bookings) {
            if (!bookings.length) return 0;
            const totalNights = bookings.reduce((sum, booking) => {
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                return sum + nights;
            }, 0);
            return totalNights / bookings.length;
        },

        getBusinessHealthStatus(revenueGrowth, occupancy, bookingGrowth) {
            const score = (revenueGrowth * 0.4) + (occupancy * 0.4) + (bookingGrowth * 0.2);
            if (score >= 15) return 'Excellent 🌟';
            if (score >= 5) return 'Good ⭐';
            if (score >= -5) return 'Stable 📊';
            if (score >= -15) return 'Needs Attention ⚠️';
            return 'Requires Immediate Action 🔴';
        },

        identifyTopPerformingMetric(revenueGrowth, occupancy, bookingGrowth) {
            const metrics = [
                { name: 'Sales Growth', value: revenueGrowth },
                { name: 'Occupancy Rate', value: occupancy },
                { name: 'Booking Growth', value: bookingGrowth }
            ].sort((a, b) => b.value - a.value);

            return `${metrics[0].name} at ${metrics[0].value.toFixed(1)}%`;
        },

        identifyAreaNeedingAttention(revenueGrowth, occupancy, bookingGrowth) {
            const metrics = [
                { name: 'Sales Growth', value: revenueGrowth },
                { name: 'Occupancy Rate', value: occupancy },
                { name: 'Booking Growth', value: bookingGrowth }
            ].sort((a, b) => a.value - b.value);

            return `${metrics[0].name} at ${metrics[0].value.toFixed(1)}%`;
        },

        generateBusinessRecommendations(revenueGrowth, occupancy, bookingGrowth, adrGrowth) {
            const recommendations = ['Recommendations:'];

            if (revenueGrowth < 0) {
                recommendations.push('• Review pricing strategy and implement revenue optimization measures');
            }
            if (occupancy < 60) {
                recommendations.push('• Develop targeted marketing campaigns to increase occupancy');
            }
            if (bookingGrowth < 0) {
                recommendations.push('• Enhance booking channels and improve conversion rates');
            }
            if (adrGrowth < 0) {
                recommendations.push('• Evaluate room rates and consider value-added packages');
            }
            if (recommendations.length === 1) {
                recommendations.push('• Maintain current successful strategies');
                recommendations.push('• Consider expansion or premium service offerings');
            }

            return recommendations.join('\n');
        },

        async generateQuarterlyAnalysis(data) {
            try {
                const now = new Date();
                const currentQuarter = Math.floor(now.getMonth() / 3);
                const currentYear = now.getFullYear();

                // Calculate quarter date ranges
                const quarterRanges = this.calculateQuarterRanges(currentQuarter, currentYear);
                
                // Filter bookings for current and previous quarters
                const currentQuarterBookings = this.filterBookingsByDateRange(
                    data.bookings, 
                    quarterRanges.current.start, 
                    quarterRanges.current.end
                );
                
                const prevQuarterBookings = this.filterBookingsByDateRange(
                    data.bookings, 
                    quarterRanges.previous.start, 
                    quarterRanges.previous.end
                );

                // Calculate metrics
                const currentMetrics = this.calculateQuarterMetrics(currentQuarterBookings);
                const prevMetrics = this.calculateQuarterMetrics(prevQuarterBookings);
                
                // Calculate growth rates
                const growth = {
                    revenue: this.calculateGrowthRate(prevMetrics.revenue, currentMetrics.revenue),
                    bookings: this.calculateGrowthRate(prevMetrics.bookingCount, currentMetrics.bookingCount),
                    adr: this.calculateGrowthRate(prevMetrics.adr, currentMetrics.adr)
                };

                return `Quarterly Sales Analysis (Q${currentQuarter + 1} ${currentYear}) ${this.getGrowthIndicator(growth.revenue)}

Revenue Performance:
• Current Quarter: ₱${this.formatNumber(currentMetrics.revenue)}
• Previous Quarter: ₱${this.formatNumber(prevMetrics.revenue)}
• Growth Rate: ${growth.revenue >= 0 ? '+' : ''}${growth.revenue.toFixed(1)}% ${this.getGrowthIndicator(growth.revenue)}

Booking Performance:
• Current Quarter: ${currentMetrics.bookingCount} bookings
• Previous Quarter: ${prevMetrics.bookingCount} bookings
• Growth Rate: ${growth.bookings >= 0 ? '+' : ''}${growth.bookings.toFixed(1)}% ${this.getGrowthIndicator(growth.bookings)}

Average Daily Rate (ADR):
• Current Quarter: ₱${this.formatNumber(currentMetrics.adr)}
• Previous Quarter: ₱${this.formatNumber(prevMetrics.adr)}
• Change: ${growth.adr >= 0 ? '+' : ''}${growth.adr.toFixed(1)}%

Top Performing Months:
${this.getTopPerformingMonths(currentQuarterBookings)}

${this.generateQuarterlyRecommendations(growth, currentMetrics)}`;
            } catch (error) {
                console.error('Error in generateQuarterlyAnalysis:', error);
                return "I apologize, but I encountered an error analyzing quarterly performance. Please try again later.";
            }
        },

        async generateHistoricalComparison(data, query) {
            try {
                // Validate input data
                if (!data || !data.bookings || !Array.isArray(data.bookings)) {
                    throw new Error('Invalid or missing booking data');
                }

                const now = new Date();
                let comparisonType = query.toLowerCase().includes('year') ? 'year' : 'month';
                
                // Calculate period boundaries
                const currentPeriod = {
                    start: new Date(now.getFullYear(), now.getMonth(), 1),
                    end: now
                };

                const previousPeriod = {
                    start: new Date(
                        comparisonType === 'year' ? now.getFullYear() - 1 : now.getFullYear(),
                        comparisonType === 'year' ? now.getMonth() : now.getMonth() - 1,
                        1
                    ),
                    end: new Date(
                        comparisonType === 'year' ? now.getFullYear() - 1 : now.getFullYear(),
                        comparisonType === 'year' ? now.getMonth() + 1 : now.getMonth(),
                        0
                    )
                };

                // Filter Ever Lodge bookings
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Filter bookings for current and previous periods
                const currentBookings = everLodgeBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate >= currentPeriod.start && bookingDate <= currentPeriod.end;
                });

                const previousBookings = everLodgeBookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate >= previousPeriod.start && bookingDate <= previousPeriod.end;
                });

                // Calculate metrics
                const currentMetrics = this.calculatePeriodMetrics(currentBookings);
                const previousMetrics = this.calculatePeriodMetrics(previousBookings);

                // Calculate growth rates
                currentMetrics.growth = previousMetrics.revenue ? 
                    ((currentMetrics.revenue - previousMetrics.revenue) / previousMetrics.revenue) * 100 : 0;

                const periodName = comparisonType === 'year' ? 'Year' : 'Month';
                const previousPeriodName = comparisonType === 'year' ? 
                    previousPeriod.start.getFullYear().toString() :
                    previousPeriod.start.toLocaleString('default', { month: 'long', year: 'numeric' });

                // Generate the comparison report
                return `${periodName}-over-${periodName} Comparison ${this.getGrowthIndicator(currentMetrics.growth)}

Performance Overview:
• Current Period Revenue: ₱${this.formatNumber(currentMetrics.revenue)}
• Previous Period Revenue: ₱${this.formatNumber(previousMetrics.revenue)}
• Growth Rate: ${currentMetrics.growth >= 0 ? '+' : ''}${currentMetrics.growth.toFixed(1)}%

Occupancy Comparison:
• Current Period: ${currentMetrics.occupancy.toFixed(1)}%
• Previous Period: ${previousMetrics.occupancy.toFixed(1)}%
• Change: ${(currentMetrics.occupancy - previousMetrics.occupancy).toFixed(1)}%

Booking Performance:
• Current Bookings: ${currentMetrics.bookingCount}
• Previous Bookings: ${previousMetrics.bookingCount}
• Volume Change: ${((currentMetrics.bookingCount - previousMetrics.bookingCount) / (previousMetrics.bookingCount || 1) * 100).toFixed(1)}%

Average Daily Rate (ADR):
• Current ADR: ₱${this.formatNumber(currentMetrics.adr)}
• Previous ADR: ₱${this.formatNumber(previousMetrics.adr)}
• Change: ${((currentMetrics.adr - previousMetrics.adr) / (previousMetrics.adr || 1) * 100).toFixed(1)}%

${this.generateHistoricalInsights(currentMetrics, previousMetrics)}

${this.generateHistoricalRecommendations(currentMetrics, previousMetrics)}`;

            } catch (error) {
                console.error('Error in generateHistoricalComparison:', error);
                throw new Error(`Failed to generate historical comparison: ${error.message}`);
            }
        },

        generateHistoricalInsights(current, previous) {
            const insights = ['Key Insights:'];
            
            // Revenue insights
            if (current.revenue > previous.revenue) {
                insights.push(`• Sales increased by ₱${this.formatNumber(current.revenue - previous.revenue)}`);
                if (current.bookingCount <= previous.bookingCount) {
                    insights.push('• Higher sales despite similar or lower booking volume indicates successful rate optimization');
                }
            } else {
                insights.push(`• Sales decreased by ₱${this.formatNumber(previous.revenue - current.revenue)}`);
            }

            // Occupancy insights
            if (current.occupancy > previous.occupancy) {
                insights.push(`• Occupancy improved by ${(current.occupancy - previous.occupancy).toFixed(1)}%`);
            } else {
                insights.push(`• Occupancy declined by ${(previous.occupancy - current.occupancy).toFixed(1)}%`);
            }

            // ADR insights
            if (current.adr > previous.adr) {
                insights.push(`• ADR increased by ₱${this.formatNumber(current.adr - previous.adr)}`);
            } else {
                insights.push(`• ADR decreased by ₱${this.formatNumber(previous.adr - current.adr)}`);
            }

            return insights.join('\n');
        },

        generateHistoricalRecommendations(current, previous) {
            const recommendations = ['Recommendations:'];
            
            // Revenue-based recommendations
            if (current.revenue < previous.revenue) {
                recommendations.push('• Review pricing strategy and consider implementing dynamic pricing');
                recommendations.push('• Analyze successful promotions from previous period');
            }

            // Occupancy-based recommendations
            if (current.occupancy < previous.occupancy) {
                recommendations.push('• Develop targeted marketing campaigns to boost occupancy');
                recommendations.push('• Consider adjusting rates to stimulate demand');
            }

            // ADR-based recommendations
            if (current.adr < previous.adr) {
                recommendations.push('• Evaluate room pricing and package offerings');
                recommendations.push('• Focus on upselling and premium room promotions');
            }

            // Add general recommendations if performing well
            if (current.revenue > previous.revenue && current.occupancy > previous.occupancy) {
                recommendations.push('• Continue successful pricing and marketing strategies');
                recommendations.push('• Consider opportunities for premium service offerings');
            }

            return recommendations.join('\n');
        },

        async generateCompetitorAnalysis(data) {
            try {
                // Validate input data
                if (!data || !data.bookings || !Array.isArray(data.bookings)) {
                    throw new Error('Invalid or missing booking data');
                }

                // Filter Ever Lodge bookings
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Calculate current metrics
                const currentMetrics = this.calculateCurrentCompetitiveMetrics(everLodgeBookings);

                // Industry benchmarks for local market (Ever Lodge segment)
                const industryBenchmarks = {
                    occupancyRate: 65, // 65% average occupancy
                    adr: 1200,        // ₱1,200 average daily rate
                    revpar: 780,      // ₱780 revenue per available room
                    weekendPremium: 15, // 15% weekend rate premium
                    cancelRate: 12     // 12% cancellation rate
                };

                return `Competitive Market Analysis 📊

Performance vs. Market Average:

Occupancy Rate:
• Ever Lodge: ${currentMetrics.occupancy.toFixed(1)}%
• Market Average: ${industryBenchmarks.occupancyRate}%
• Variance: ${(currentMetrics.occupancy - industryBenchmarks.occupancyRate).toFixed(1)}% ${this.getCompetitiveIndicator(currentMetrics.occupancy, industryBenchmarks.occupancyRate)}

Average Daily Rate (ADR):
• Ever Lodge: ₱${this.formatNumber(currentMetrics.adr)}
• Market Average: ₱${this.formatNumber(industryBenchmarks.adr)}
• Variance: ${((currentMetrics.adr - industryBenchmarks.adr) / industryBenchmarks.adr * 100).toFixed(1)}% ${this.getCompetitiveIndicator(currentMetrics.adr, industryBenchmarks.adr)}

Revenue Per Available Room (RevPAR):
• Ever Lodge: ₱${this.formatNumber(currentMetrics.revpar)}
• Market Average: ₱${this.formatNumber(industryBenchmarks.revpar)}
• Variance: ${((currentMetrics.revpar - industryBenchmarks.revpar) / industryBenchmarks.revpar * 100).toFixed(1)}% ${this.getCompetitiveIndicator(currentMetrics.revpar, industryBenchmarks.revpar)}

Other Metrics:
• Cancellation Rate: ${currentMetrics.cancelRate.toFixed(1)}% vs. Market ${industryBenchmarks.cancelRate}% ${this.getCompetitiveIndicator(industryBenchmarks.cancelRate, currentMetrics.cancelRate)}
• Weekend Premium: ${currentMetrics.weekendPremium.toFixed(1)}% vs. Market ${industryBenchmarks.weekendPremium}% ${this.getCompetitiveIndicator(currentMetrics.weekendPremium, industryBenchmarks.weekendPremium)}

${this.generateCompetitiveInsights(currentMetrics, industryBenchmarks)}

${this.generateCompetitiveRecommendations(currentMetrics, industryBenchmarks)}

Note: Market averages are based on local competitive set data in the same segment.`;

            } catch (error) {
                console.error('Error in generateCompetitorAnalysis:', error);
                throw new Error(`Failed to generate competitor analysis: ${error.message}`);
            }
        },

        calculateCurrentCompetitiveMetrics(bookings) {
            try {
                const now = new Date();
                const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

                // Filter recent bookings
                const recentBookings = bookings.filter(booking => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate >= thirtyDaysAgo;
                });

                // Calculate total rooms and room nights
                const totalRooms = 20; // Ever Lodge total rooms
                const totalNights = 30; // Analysis period
                const totalRoomNights = totalRooms * totalNights;

                // Calculate occupancy
                const occupiedNights = recentBookings.reduce((sum, booking) => {
                    const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    const checkOut = new Date(booking.checkOut?.toDate?.() || booking.checkOut);
                    return sum + Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                }, 0);

                const occupancy = (occupiedNights / totalRoomNights) * 100;

                // Calculate ADR
                const totalRevenue = recentBookings.reduce((sum, booking) => {
                    const nights = Math.ceil(
                        (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                         new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                    );
                    const rate = booking.checkInTime === 'night-promo' ? 580 : 1300;
                    return sum + (nights * rate);
                }, 0);

                const adr = occupiedNights > 0 ? totalRevenue / occupiedNights : 0;

                // Calculate RevPAR
                const revpar = totalRevenue / totalRoomNights;

                // Calculate weekend premium
                const weekendBookings = recentBookings.filter(booking => {
                    const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return checkIn.getDay() === 0 || checkIn.getDay() === 6;
                });

                const weekendADR = this.calculateADR(weekendBookings);
                const weekdayADR = this.calculateADR(recentBookings.filter(b => !weekendBookings.includes(b)));
                const weekendPremium = weekdayADR > 0 ? ((weekendADR - weekdayADR) / weekdayADR) * 100 : 0;

                // Calculate cancellation rate
                const cancelledBookings = recentBookings.filter(b => b.status?.toLowerCase() === 'cancelled');
                const cancelRate = (cancelledBookings.length / recentBookings.length) * 100;

                return {
                    occupancy,
                    adr,
                    revpar,
                    weekendPremium,
                    cancelRate,
                    totalRevenue,
                    bookingCount: recentBookings.length
                };
            } catch (error) {
                console.error('Error calculating competitive metrics:', error);
                throw error;
            }
        },

        getCompetitiveIndicator(current, benchmark) {
            const variance = ((current - benchmark) / benchmark) * 100;
            if (variance > 10) return '🌟 Excellent';
            if (variance > 0) return '📈 Above Market';
            if (variance > -10) return '📊 At Market';
            return '⚠️ Below Market';
        },

        generateCompetitiveInsights(metrics, benchmarks) {
            const insights = ['Competitive Position:'];
            
            // Analyze occupancy
            if (metrics.occupancy > benchmarks.occupancyRate) {
                insights.push('• Strong market demand and guest preference');
                if (metrics.adr > benchmarks.adr) {
                    insights.push('• Successfully commanding premium rates while maintaining high occupancy');
                }
            } else {
                insights.push('• Opportunity to improve market share');
            }

            // Analyze ADR
            if (metrics.adr > benchmarks.adr) {
                insights.push('• Premium pricing position in the market');
            } else if (metrics.adr < benchmarks.adr) {
                insights.push('• Room rates are positioned below market average');
            }

            // Analyze RevPAR
            if (metrics.revpar > benchmarks.revpar) {
                insights.push('• Strong overall revenue performance');
            } else {
                insights.push('• Revenue optimization opportunity identified');
            }

            return insights.join('\n');
        },

        generateCompetitiveRecommendations(metrics, benchmarks) {
            const recommendations = ['Strategic Recommendations:'];
            
            // Occupancy-based recommendations
            if (metrics.occupancy < benchmarks.occupancyRate) {
                recommendations.push('• Review competitive pricing strategy');
                recommendations.push('• Enhance marketing presence in key channels');
            }

            // ADR-based recommendations
            if (metrics.adr < benchmarks.adr) {
                recommendations.push('• Evaluate room rate structure against competition');
                recommendations.push('• Develop value-added packages to justify higher rates');
            }

            // RevPAR-based recommendations
            if (metrics.revpar < benchmarks.revpar) {
                recommendations.push('• Implement revenue management strategies');
                recommendations.push('• Focus on optimal balance between occupancy and rate');
            }

            // Add general recommendations if performing well
            if (metrics.occupancy > benchmarks.occupancyRate && metrics.adr > benchmarks.adr) {
                recommendations.push('• Maintain premium market position');
                recommendations.push('• Consider opportunities for further rate optimization');
            }

            return recommendations.join('\n');
        },

        async generatePrediction(data, query) {
            try {
                const predictedMetrics = await this.calculatePredictedMetrics(data, query);
                const seasonalFactors = this.analyzeSeasonalFactors(query);
                const confidenceLevel = this.calculateConfidenceLevel(data, query);

                return `Future Performance Prediction ${this.getPredictionConfidenceIndicator(confidenceLevel)}

Expected Performance Metrics:
• Projected Occupancy: ${predictedMetrics.occupancy.toFixed(1)}% ${this.getTrendIndicator(predictedMetrics.occupancyTrend)}
• Projected Revenue: ₱${this.formatNumber(predictedMetrics.revenue)} ${this.getTrendIndicator(predictedMetrics.revenueTrend)}
• Estimated Bookings: ${predictedMetrics.bookings} ${this.getTrendIndicator(predictedMetrics.bookingsTrend)}

Seasonal Considerations:
${this.formatSeasonalFactors(seasonalFactors)}

Confidence Level: ${confidenceLevel.toFixed(1)}%
${this.getConfidenceExplanation(confidenceLevel)}

Key Factors Influencing Prediction:
${this.formatPredictionFactors(predictedMetrics.factors)}

Recommended Preparations:
${this.generatePredictionBasedRecommendations(predictedMetrics, seasonalFactors)}

Note: Predictions are based on historical data patterns and seasonal trends. Actual results may vary.`;
            } catch (error) {
                console.error('Error in generatePrediction:', error);
                return "I apologize, but I encountered an error generating predictions. Please try again later.";
            }
        },

        // Helper methods for the new functions
        calculateQuarterRanges(quarter, year) {
            return {
                current: {
                    start: new Date(year, quarter * 3, 1),
                    end: new Date(year, (quarter + 1) * 3, 0)
                },
                previous: {
                    start: new Date(quarter === 0 ? year - 1 : year, quarter === 0 ? 9 : (quarter - 1) * 3, 1),
                    end: new Date(quarter === 0 ? year - 1 : year, quarter === 0 ? 12 : quarter * 3, 0)
                }
            };
        },

        filterBookingsByDateRange(bookings, startDate, endDate) {
            return bookings.filter(booking => {
                try {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    return bookingDate >= startDate && bookingDate <= endDate;
                } catch (e) {
                    console.warn('Invalid booking date:', e);
                    return false;
                }
            });
        },

        calculateQuarterMetrics(bookings) {
            const totalRevenue = bookings.reduce((sum, booking) => {
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                const rate = booking.checkInTime === 'night-promo' ? 580 : 1300;
                return sum + (nights * rate);
            }, 0);

            const totalNights = bookings.reduce((sum, booking) => {
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                return sum + nights;
            }, 0);

            return {
                revenue: totalRevenue,
                bookingCount: bookings.length,
                adr: totalNights > 0 ? totalRevenue / totalNights : 0
            };
        },

        getTopPerformingMonths(bookings) {
            const monthlyRevenue = {};
            bookings.forEach(booking => {
                const month = new Date(booking.checkIn?.toDate?.() || booking.checkIn)
                    .toLocaleString('default', { month: 'long' });
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                const rate = booking.checkInTime === 'night-promo' ? 580 : 1300;
                monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (nights * rate);
            });

            return Object.entries(monthlyRevenue)
                .sort((a, b) => b[1] - a[1])
                .map(([month, revenue]) => `• ${month}: ₱${this.formatNumber(revenue)}`)
                .join('\n');
        },

        calculatePredictedMetrics(data, query) {
            // Implementation of prediction logic using historical data patterns
            // This would typically involve more complex statistical analysis
            const historicalData = this.getHistoricalData(data);
            const seasonalPatterns = this.analyzeSeasonalPatterns(historicalData);
            const trends = this.analyzeTrends(historicalData);
            
            return {
                occupancy: this.predictOccupancy(historicalData, seasonalPatterns),
                revenue: this.predictRevenue(historicalData, trends),
                bookings: this.predictBookings(historicalData, seasonalPatterns),
                occupancyTrend: this.calculateTrend(historicalData.occupancy),
                revenueTrend: this.calculateTrend(historicalData.revenue),
                bookingsTrend: this.calculateTrend(historicalData.bookings),
                factors: this.identifyInfluencingFactors(historicalData, seasonalPatterns)
            };
        },

        calculatePeriodMetrics(bookings) {
            const totalRevenue = bookings.reduce((sum, booking) => {
                const nights = Math.ceil(
                    (new Date(booking.checkOut?.toDate?.() || booking.checkOut) - 
                     new Date(booking.checkIn?.toDate?.() || booking.checkIn)) / (1000 * 60 * 60 * 24)
                );
                const rate = booking.checkInTime === 'night-promo' ? 580 : 1300;
                return sum + (nights * rate);
            }, 0);

            const totalRooms = 20; // Ever Lodge total rooms
            const daysInPeriod = 30; // Assuming monthly comparison
            const occupancy = (bookings.length / (totalRooms * daysInPeriod)) * 100;

            return {
                revenue: totalRevenue,
                occupancy: occupancy,
                bookingCount: bookings.length,
                adr: bookings.length > 0 ? totalRevenue / bookings.length : 0,
                growth: 0 // Will be calculated later
            };
        },

        identifyKeyImprovements(current, previous) {
            const improvements = [];
            
            if (current.revenue > previous.revenue) {
                improvements.push(`• Revenue increased by ₱${this.formatNumber(current.revenue - previous.revenue)}`);
            }
            if (current.occupancy > previous.occupancy) {
                improvements.push(`• Occupancy improved by ${(current.occupancy - previous.occupancy).toFixed(1)}%`);
            }
            if (current.bookingCount > previous.bookingCount) {
                improvements.push(`• Booking volume increased by ${current.bookingCount - previous.bookingCount} bookings`);
            }
            if (current.adr > previous.adr) {
                improvements.push(`• Average daily rate improved by ₱${this.formatNumber(current.adr - previous.adr)}`);
            }

            return improvements.length > 0 ? improvements.join('\n') : '• No significant improvements in this period';
        },

        identifyAreasForImprovement(current, previous) {
            const areas = [];
            
            if (current.revenue < previous.revenue) {
                areas.push(`• Revenue decreased by ₱${this.formatNumber(previous.revenue - current.revenue)}`);
            }
            if (current.occupancy < previous.occupancy) {
                areas.push(`• Occupancy declined by ${(previous.occupancy - current.occupancy).toFixed(1)}%`);
            }
            if (current.bookingCount < previous.bookingCount) {
                areas.push(`• Booking volume decreased by ${previous.bookingCount - current.bookingCount} bookings`);
            }
            if (current.adr < previous.adr) {
                areas.push(`• Average daily rate decreased by ₱${this.formatNumber(previous.adr - current.adr)}`);
            }

            return areas.length > 0 ? areas.join('\n') : '• No significant areas requiring immediate attention';
        },

        analyzeMarketPosition(metrics, benchmarks) {
            const positions = [];
            
            // Analyze occupancy position
            const occupancyDiff = metrics.occupancy - benchmarks.occupancyRate;
            if (Math.abs(occupancyDiff) <= 5) {
                positions.push('• Occupancy rate is aligned with market average');
            } else if (occupancyDiff > 5) {
                positions.push('• Strong occupancy performance above market average');
            } else {
                positions.push('• Opportunity to improve occupancy to match market average');
            }

            // Analyze ADR position
            const adrDiff = ((metrics.adr - benchmarks.adr) / benchmarks.adr) * 100;
            if (Math.abs(adrDiff) <= 5) {
                positions.push('• Room rates are competitive with market average');
            } else if (adrDiff > 5) {
                positions.push('• Premium pricing position in the market');
            } else {
                positions.push('• Room rates are below market average - potential for adjustment');
            }

            return positions.join('\n');
        },

        identifyCompetitiveAdvantages(metrics, benchmarks) {
            const advantages = [];
            
            if (metrics.occupancy > benchmarks.occupancyRate) {
                advantages.push('• Strong market demand and guest preference');
            }
            if (metrics.adr > benchmarks.adr) {
                advantages.push('• Ability to command premium rates');
            }
            if (metrics.revpar > benchmarks.revpar) {
                advantages.push('• Superior revenue generation per room');
            }
            if (advantages.length === 0) {
                advantages.push('• Competitive rates attractive to value-conscious guests');
            }

            return advantages.join('\n');
        },

        analyzeSeasonalFactors(query) {
            const now = new Date();
            const month = now.getMonth();
            const factors = [];

            // Peak season (December-February)
            if (month >= 11 || month <= 1) {
                factors.push({
                    season: 'Peak Season (Holiday Period)',
                    impact: 'High',
                    expectedOccupancy: '80-90%',
                    rateAdjustment: '+20%'
                });
            }
            // Shoulder season (March-May, September-November)
            else if ((month >= 2 && month <= 4) || (month >= 8 && month <= 10)) {
                factors.push({
                    season: 'Shoulder Season',
                    impact: 'Moderate',
                    expectedOccupancy: '60-70%',
                    rateAdjustment: '+10%'
                });
            }
            // Low season (June-August)
            else {
                factors.push({
                    season: 'Low Season',
                    impact: 'Lower',
                    expectedOccupancy: '40-50%',
                    rateAdjustment: 'Standard'
                });
            }

            return factors;
        },

        formatSeasonalFactors(factors) {
            return factors.map(factor => 
                `• ${factor.season}:\n` +
                `  - Expected Impact: ${factor.impact}\n` +
                `  - Typical Occupancy: ${factor.expectedOccupancy}\n` +
                `  - Recommended Rate: ${factor.rateAdjustment}`
            ).join('\n\n');
        },

        calculateConfidenceLevel(data, query) {
            let confidence = 70; // Base confidence level

            // Adjust based on data quality
            if (data.bookings && data.bookings.length > 100) confidence += 10;
            if (data.bookings && data.bookings.length > 500) confidence += 5;

            // Adjust based on seasonality match
            const now = new Date();
            const queryMonth = now.getMonth();
            if (data.bookings && data.bookings.some(b => {
                const bookingMonth = new Date(b.checkIn?.toDate?.() || b.checkIn).getMonth();
                return bookingMonth === queryMonth;
            })) {
                confidence += 10;
            }

            // Cap confidence level
            return Math.min(confidence, 90);
        },

        getConfidenceExplanation(confidence) {
            if (confidence >= 80) {
                return 'High confidence based on substantial historical data and clear seasonal patterns';
            } else if (confidence >= 60) {
                return 'Moderate confidence based on available data and typical trends';
            } else {
                return 'Lower confidence due to limited historical data or unusual patterns';
            }
        },

        formatPredictionFactors(factors) {
            if (!factors || factors.length === 0) {
                return '• No significant factors identified';
            }
            return factors.map(factor => 
                `• ${factor.name}: ${factor.impact} impact (${factor.confidence}% confidence)`
            ).join('\n');
        },

        getPredictionConfidenceIndicator(confidence) {
            if (confidence >= 80) return '🎯';
            if (confidence >= 60) return '📊';
            return '📈';
        },

        getTrendIndicator(trend) {
            if (trend > 10) return '🚀';
            if (trend > 0) return '📈';
            if (trend > -10) return '↔️';
            return '📉';
        },

        getComparisonIndicator(current, benchmark) {
            const diff = ((current - benchmark) / benchmark) * 100;
            if (diff > 10) return '🌟';
            if (diff > 0) return '📈';
            if (diff > -10) return '↔️';
            return '⚠️';
        },

        async generateGuestPreferenceAnalysis(data) {
            try {
                // Validate input data
                if (!data || !data.bookings || !Array.isArray(data.bookings)) {
                    throw new Error('Invalid or missing booking data');
                }

                // Filter Ever Lodge bookings
                const everLodgeBookings = data.bookings.filter(booking => 
                    booking.propertyDetails?.name === 'Ever Lodge' || 
                    booking.establishment === 'Ever Lodge'
                );

                // Analyze room type preferences
                const roomTypePreferences = everLodgeBookings.reduce((acc, booking) => {
                    const roomType = booking.propertyDetails?.roomType || 'Standard';
                    acc[roomType] = (acc[roomType] || 0) + 1;
                    return acc;
                }, {});

                // Analyze check-in time preferences
                const checkInPreferences = everLodgeBookings.reduce((acc, booking) => {
                    const checkInTime = booking.checkInTime || 'standard';
                    acc[checkInTime] = (acc[checkInTime] || 0) + 1;
                    return acc;
                }, {});

                // Analyze length of stay
                const stayDurations = everLodgeBookings.map(booking => {
                    const checkIn = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    const checkOut = new Date(booking.checkOut?.toDate?.() || booking.checkOut);
                    return Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                });

                const avgStayDuration = stayDurations.reduce((sum, duration) => sum + duration, 0) / stayDurations.length;

                // Analyze booking patterns
                const bookingPatterns = everLodgeBookings.reduce((acc, booking) => {
                    const bookingDate = new Date(booking.checkIn?.toDate?.() || booking.checkIn);
                    const isWeekend = bookingDate.getDay() === 0 || bookingDate.getDay() === 6;
                    acc[isWeekend ? 'weekend' : 'weekday']++;
                    return acc;
                }, { weekend: 0, weekday: 0 });

                // Calculate percentages
                const totalBookings = everLodgeBookings.length;
                const roomTypePercentages = Object.entries(roomTypePreferences)
                    .map(([type, count]) => ({
                        type,
                        count,
                        percentage: (count / totalBookings * 100).toFixed(1)
                    }))
                    .sort((a, b) => b.count - a.count);

                const checkInPercentages = Object.entries(checkInPreferences)
                    .map(([time, count]) => ({
                        time,
                        count,
                        percentage: (count / totalBookings * 100).toFixed(1)
                    }))
                    .sort((a, b) => b.count - a.count);

                return `Guest Preference Analysis 📊

Room Type Preferences:
${roomTypePercentages.map(({type, count, percentage}) => 
    `• ${type}: ${percentage}% (${count} bookings)`
).join('\n')}

Check-in Time Preferences:
${checkInPercentages.map(({time, count, percentage}) => 
    `• ${time === 'night-promo' ? 'Night Check-in' : 'Standard Check-in'}: ${percentage}% (${count} bookings)`
).join('\n')}

Stay Duration:
• Average Length of Stay: ${avgStayDuration.toFixed(1)} days
• Most Common Duration: ${this.findMostCommonDuration(stayDurations)} days

Booking Patterns:
• Weekend Preference: ${((bookingPatterns.weekend / totalBookings) * 100).toFixed(1)}%
• Weekday Preference: ${((bookingPatterns.weekday / totalBookings) * 100).toFixed(1)}%

Key Insights:
${this.generateGuestPreferenceInsights(roomTypePercentages, checkInPercentages, avgStayDuration, bookingPatterns)}

Recommendations:
${this.generateGuestPreferenceRecommendations(roomTypePercentages, checkInPercentages, avgStayDuration, bookingPatterns)}`;

            } catch (error) {
                console.error('Error in generateGuestPreferenceAnalysis:', error);
                throw new Error(`Failed to analyze guest preferences: ${error.message}`);
            }
        },

        findMostCommonDuration(durations) {
            const durationCount = durations.reduce((acc, duration) => {
                acc[duration] = (acc[duration] || 0) + 1;
                return acc;
            }, {});
            
            return Object.entries(durationCount)
                .sort((a, b) => b[1] - a[1])[0][0];
        },

        generateGuestPreferenceInsights(roomTypes, checkIns, avgStay, patterns) {
            const insights = [];
            
            // Room type insights
            const topRoom = roomTypes[0];
            insights.push(`• ${topRoom.type} rooms are most popular, accounting for ${topRoom.percentage}% of bookings`);
            
            // Check-in time insights
            const preferredCheckIn = checkIns[0];
            insights.push(`• ${preferredCheckIn.time === 'night-promo' ? 'Night check-in' : 'Standard check-in'} is preferred by ${preferredCheckIn.percentage}% of guests`);
            
            // Stay duration insights
            if (avgStay < 2) {
                insights.push('• Most guests prefer short stays (1-2 days)');
            } else if (avgStay < 4) {
                insights.push('• Medium-length stays (2-4 days) are most common');
            } else {
                insights.push('• Extended stays (4+ days) are common among guests');
            }
            
            // Booking pattern insights
            const weekendPercentage = (patterns.weekend / (patterns.weekend + patterns.weekday)) * 100;
            if (weekendPercentage > 60) {
                insights.push('• Strong preference for weekend stays');
            } else if (weekendPercentage < 40) {
                insights.push('• Higher weekday booking tendency');
            } else {
                insights.push('• Balanced distribution between weekday and weekend stays');
            }
            
            return insights.join('\n');
        },

        generateGuestPreferenceRecommendations(roomTypes, checkIns, avgStay, patterns) {
            const recommendations = [];
            
            // Room type recommendations
            const topRoom = roomTypes[0];
            const leastPopularRoom = roomTypes[roomTypes.length - 1];
            recommendations.push(`• Optimize ${topRoom.type} room inventory based on high demand`);
            recommendations.push(`• Review and enhance ${leastPopularRoom.type} room offerings to increase appeal`);
            
            // Check-in time recommendations
            const preferredCheckIn = checkIns[0];
            if (preferredCheckIn.time === 'night-promo') {
                recommendations.push('• Consider expanding night check-in availability');
                recommendations.push('• Optimize staffing for night check-in periods');
            } else {
                recommendations.push('• Focus on streamlining standard check-in processes');
                recommendations.push('• Consider promotional rates for off-peak check-in times');
            }
            
            // Stay duration recommendations
            if (avgStay < 2) {
                recommendations.push('• Develop packages to encourage longer stays');
                recommendations.push('• Implement multi-night discounts');
            } else if (avgStay > 4) {
                recommendations.push('• Create extended-stay amenities and services');
                recommendations.push('• Consider weekly rate options');
            }
            
            // Booking pattern recommendations
            const weekendPercentage = (patterns.weekend / (patterns.weekend + patterns.weekday)) * 100;
            if (weekendPercentage > 60) {
                recommendations.push('• Implement weekday special rates to balance occupancy');
                recommendations.push('• Develop weekday-specific packages');
            } else if (weekendPercentage < 40) {
                recommendations.push('• Create attractive weekend packages');
                recommendations.push('• Consider weekend events or promotions');
            }
            
            return recommendations.join('\n');
        }
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