export class SuggestionService {
    constructor() {
        this.recentContexts = new Set();
        this.maxRecentContexts = 3;
        
        // Core verified questions that are known to work reliably with the system
        this.verifiedQuestions = {
            'occupancy': [
                'What is our occupancy trend?',
                'Provide an occupancy forecast',
                'Which room types have the lowest occupancy this month?',
                'How does our weekday occupancy compare to weekends?'
            ],
            'sales': [
                'How has our sales changed in the last quarter?',
                'What is our quarterly sales analysis?',
                'What is our revenue breakdown by room type?',
                'What is our average daily rate?'
            ],
            'bookings': [
                'What are our booking patterns this month?',
                'Show me the booking distribution by room type',
                'What is our average lead time for bookings?',
                'Show me our booking pace for the next 30 days'
            ],
            'performance': [
                'What is our current occupancy rate?',
                'What is our total sales this month?',
                'What are the KPIs for this month?',
                'Show me the booking distribution by room type',
                'How is our overall business performing?',
                'Compare this month\'s performance with last month',
                'What is our total sales this month?'
            ],
            'predictions': [
                'What occupancy can we expect next month?',
                'Predict our revenue for the next quarter',
                'What is the booking forecast for next month?',
                'What occupancy trends can we expect this season?'
            ],
            'error': [
                'What is our current occupancy rate?',
                'Show me our booking statistics',
                'What are our key performance indicators?',
                'How is our revenue trending this quarter?'
            ]
        };
        
        this.contextMap = {
            'analytics': [
                'What metrics show our most significant growth areas?',
                'Which days of the week have our highest occupancy?',
                'What is the average length of stay for our guests?',
                'How do our weekend rates compare to weekday performance?'
            ],
            'sales': [
                'How has our sales changed in the last quarter?',
                'Which room category generates the most profit margin?',
                'Compare our sales before and after the recent marketing campaign',
                'What is our sales breakdown by source (direct vs. OTA)?'
            ],
            'occupancy': [
                'Which room types have the lowest occupancy this month?',
                'What is our occupancy trend?',
                'Provide an occupancy forecast',
                'Which seasons show our highest occupancy fluctuations?'
            ],
            'bookings': [
                'What\'s our average lead time for weekend bookings?',
                'Show me the distribution of booking sources',
                'Which booking channels have the lowest cancellation rates?',
                'What\'s the correlation between advance bookings and room rates?'
            ],
            'customers': [
                'Which guest segments have the highest spending pattern?',
                'What is the average frequency of repeat guest visits?',
                'Which demographics make the most last-minute bookings?',
                'How does guest satisfaction correlate with room type?'
            ],
            'predictions': [
                'What occupancy can we expect during the upcoming holiday season?',
                'How might a 10% rate increase affect our booking volume?',
                'What would be our optimal room allocation for next month?',
                'What sales should we forecast for Q3 based on current trends?'
            ],
            'operational': [
                'What is our average room turnaround time?',
                'Which room maintenance issues are most frequent?',
                'What is our staff-to-room ratio compared to industry standards?',
                'Which operational costs have increased the most this year?'
            ],
            'comparison': [
                'Compare this month\'s performance with the same month last year',
                'How does our sales compare to local competitors?',
                'Show me year-over-year growth across all KPIs',
                'Compare performance across our different room categories'
            ],
            'off-topic': [
                'What is our current occupancy breakdown by floor?',
                'Show me the top sales-generating amenities',
                'Which guest profiles book the longest stays?',
                'What marketing channels deliver the best ROI?',
                'Analyze our operational efficiency metrics'
            ],
            'default': [
                'What are our key performance indicators this month?',
                'Show me areas where we can improve efficiency',
                'Which operational metrics should we prioritize?',
                'What\'s the relationship between our pricing and demand?'
            ]
        };
    }

    generateSuggestions(context) {
        // Track the context to avoid immediate repetition
        this.trackContext(context);

        // Check if context exists in the map, fall back to default if not
        if (!this.contextMap[context]) {
            console.warn(`Context '${context}' not found, using default suggestions`);
            context = 'default';
        }

        // Get base suggestions for the current context
        const suggestions = this.contextMap[context] || this.contextMap.default;
        
        // Add diverse suggestions from other relevant contexts
        const diverseSuggestions = this.getDiverseSuggestions(context);
        
        // Combine and shuffle to introduce variety
        const combinedSuggestions = [...suggestions.slice(0, 2), ...diverseSuggestions];
        
        // Return only 4 shuffled suggestions
        return this.shuffleArray(combinedSuggestions)
            .slice(0, 4)
            .map(text => ({
                text,
                action: () => text
            }));
    }

    shuffleArray(array) {
        // Defensive copy to avoid modifying original array
        if (!Array.isArray(array)) {
            console.error('shuffleArray expected an array but received:', array);
            return [];
        }
        
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    getDiverseSuggestions(currentContext) {
        // Choose diverse contexts that would provide different insights
        const diverseContextPairs = {
            'analytics': ['comparison', 'predictions'],
            'sales': ['occupancy', 'comparison'],
            'occupancy': ['sales', 'predictions'],
            'bookings': ['customers', 'operational'],
            'customers': ['bookings', 'sales'],
            'predictions': ['comparison', 'sales'],
            'operational': ['analytics', 'bookings'],
            'comparison': ['predictions', 'sales'],
            'off-topic': ['analytics', 'occupancy'],
            'default': ['sales', 'occupancy']
        };

        // Use default pairs if current context doesn't have specific pairs
        const diverseContexts = diverseContextPairs[currentContext] || ['analytics', 'revenue'];
        const suggestions = [];

        // Add one suggestion from each diverse context
        for (const context of diverseContexts) {
            if (!this.recentContexts.has(context) && context !== currentContext) {
                const contextSuggestions = this.contextMap[context] || [];
                if (contextSuggestions.length > 0) {
                    suggestions.push(contextSuggestions[Math.floor(Math.random() * contextSuggestions.length)]);
                }
            }
        }

        // Fill remaining slots with suggestions from unexplored contexts if needed
        const allContexts = Object.keys(this.contextMap);
        let remainingSlots = 2 - suggestions.length;
        
        if (remainingSlots > 0) {
            const unexploredContexts = allContexts.filter(ctx => 
                !this.recentContexts.has(ctx) && 
                ctx !== currentContext && 
                !diverseContexts.includes(ctx)
            );
            
            // Shuffle unexplored contexts to ensure randomness
            const shuffledUnexplored = this.shuffleArray(unexploredContexts);
            
            for (let i = 0; i < Math.min(remainingSlots, shuffledUnexplored.length); i++) {
                const ctx = shuffledUnexplored[i];
                const ctxSuggestions = this.contextMap[ctx] || [];
                if (ctxSuggestions.length > 0) {
                    suggestions.push(ctxSuggestions[Math.floor(Math.random() * ctxSuggestions.length)]);
                }
            }
        }

        // Ensure we always return at least one suggestion
        if (suggestions.length === 0) {
            const defaultSuggestion = this.contextMap.default[0];
            suggestions.push(defaultSuggestion);
        }

        return suggestions;
    }

    trackContext(context) {
        // Skip tracking invalid contexts
        if (!context || typeof context !== 'string') {
            console.warn('Invalid context provided to trackContext:', context);
            return;
        }
        
        // Add to recent contexts
        this.recentContexts.add(context);
        
        // Limit the size of recent contexts
        if (this.recentContexts.size > this.maxRecentContexts) {
            const iterator = this.recentContexts.values();
            this.recentContexts.delete(iterator.next().value);
        }
    }

    getSuggestionsByResponse(response) {
        // Handle null or undefined response
        if (!response) {
            console.warn('Empty response provided to getSuggestionsByResponse');
            return this.generateSuggestions('default');
        }
        
        // Determine context from response
        const context = this.determineContext(response);
        return this.generateSuggestions(context);
    }

    getErrorSuggestions() {
        // When an error occurs, return only verified questions that are known to work
        return this.shuffleArray(this.verifiedQuestions.error)
            .slice(0, 4)
            .map(text => ({
                text,
                action: () => text
            }));
    }
    
    getVerifiedSuggestions(context) {
        // Default to 'performance' if context doesn't have verified questions
        const ctx = this.verifiedQuestions[context] ? context : 'performance';
        
        // Get two suggestions from the specified context
        const primarySuggestions = this.shuffleArray(this.verifiedQuestions[ctx]).slice(0, 2);
        
        // Get one suggestion each from two other contexts
        const otherContexts = Object.keys(this.verifiedQuestions)
            .filter(key => key !== ctx && key !== 'error')
            .slice(0, 2);
            
        const secondarySuggestions = otherContexts.map(key => {
            const suggestions = this.verifiedQuestions[key];
            return suggestions[Math.floor(Math.random() * suggestions.length)];
        });
        
        // Combine and shuffle all suggestions
        return this.shuffleArray([...primarySuggestions, ...secondarySuggestions])
            .map(text => ({
                text,
                action: () => text
            }));
    }

    determineContext(response) {
        // Handle null or undefined response
        if (!response) {
            return 'default';
        }
        
        // Check if this is an error response 
        if (response.includes("I apologize") && 
            (response.includes("error") || response.includes("encountered"))) {
            return 'error';
        }
        
        // Convert to string if it's not already
        const responseText = String(response).toLowerCase();
        
        // Check if this is an off-topic response
        if (responseText.includes("i'm designed to help") || 
            responseText.includes("here are some questions you might want to ask")) {
            return 'off-topic';
        }
        
        // Check for prediction/forecast content
        if (responseText.includes("predict") || 
            responseText.includes("forecast") || 
            responseText.includes("projection") ||
            responseText.includes("future")) {
            return 'predictions';
        }
        
        // Check for comparison content
        if (responseText.includes("compar") || 
            responseText.includes("versus") || 
            responseText.includes(" vs ") ||
            responseText.includes("year-over-year") ||
            responseText.includes("month-over-month")) {
            return 'comparison';
        }
        
        // Check for operational content
        if (responseText.includes("operation") || 
            responseText.includes("staff") || 
            responseText.includes("maintenance") ||
            responseText.includes("service") ||
            responseText.includes("efficiency")) {
            return 'operational';
        }
        
        const contextKeywords = {
            analytics: ['performance', 'kpi', 'metrics', 'growth', 'trend', 'analysis', 'statistic'],
            sales: ['sales', 'earnings', 'adr', 'sales', 'financial', 'profit', 'margin'],
            occupancy: ['occupancy', 'vacant', 'filled', 'capacity', 'utilization', 'rooms'],
            bookings: ['booking', 'reservation', 'cancellation', 'pace', 'lead time'],
            customers: ['customer', 'guest', 'satisfaction', 'retention', 'loyalty', 'profile']
        };

        for (const [context, keywords] of Object.entries(contextKeywords)) {
            if (keywords.some(keyword => responseText.includes(keyword))) {
                return context;
            }
        }
        
        return 'default';
    }

    // Debug helper method
    logContextFrequency() {
        const contextCounts = {};
        for (const context of this.recentContexts) {
            contextCounts[context] = (contextCounts[context] || 0) + 1;
        }
        console.log('Recent contexts:', contextCounts);
    }
}

// Add this for browser console debugging
if (typeof window !== 'undefined') {
    window.SuggestionService = SuggestionService;
}
