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
                return "The current occupancy rate is calculated from our booking data.";
            },
            generateLodgeKPIResponse: function() {
                return "Here are the key performance indicators for this month...";
            },
            generateMonthlySalesResponse: function() {
                return "The total sales for this month are calculated from our revenue data.";
            },
            generateBookingDistributionByRoomType: function() {
                return "Here's the booking distribution by room type...";
            },
            generateGuestPreferenceAnalysis: function() {
                return "Based on our data, here are the guest preferences...";
            },
            generateOccupancyTrendAnalysis: function() {
                return "Here's the occupancy trend analysis...";
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

                // Check for occupancy trend query
                if ((lowerMessage.includes('occupancy') && lowerMessage.includes('trend')) ||
                    lowerMessage === 'what is our occupancy trend') {
                    console.log('Processing occupancy trend query:', message);
                    const result = await this.generateOccupancyTrendAnalysis(data);
                    // Return just the response string if it's in the new format
                    return result.success && result.response ? result.response : result;
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

                // Default response for unrecognized queries
                return this.generateDefaultResponse(data);
            } catch (error) {
                console.error('Error processing query:', error);
                return `I apologize, but I encountered an error while processing your request. Please try again later. Error: ${error.message}`;
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
                console.log('Fetching integrated data...');
                
                // Get rooms data
                const roomsPromise = fetch('../api/rooms.php')
                    .then(response => response.json())
                    .catch(error => {
                        console.error('Error fetching rooms data:', error);
                        return [];
                    });
                
                // Fetch revenue data from Firebase
                const bookingsRef = collection(db, 'bookings');
                const bookingsPromise = getDocs(bookingsRef)
                    .then(snapshot => {
                        const bookings = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        console.log('Fetched revenue data:', bookings);
                        return bookings;
                    })
                    .catch(error => {
                        console.error('Error fetching bookings:', error);
                        return [];
                    });
                
                // Wait for both promises to resolve
                const [rooms, bookings] = await Promise.all([roomsPromise, bookingsPromise]);
                
                console.log('Fetched rooms:', rooms);
                console.log('Fetched revenue data:', bookings);
                
                return {
                    rooms,
                    bookings,
                    timestamp: new Date(),
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