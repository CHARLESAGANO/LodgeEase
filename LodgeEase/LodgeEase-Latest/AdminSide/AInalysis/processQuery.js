// Simple Express server for testing queries
const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// Required middleware
app.use(cors());
app.use(express.json());

// Mock implementation of the AInalysis methods
const occupancyData = [
    { roomType: 'Standard', occupancy: 45 },
    { roomType: 'Deluxe', occupancy: 32 },
    { roomType: 'Suite', occupancy: 59 },
    { roomType: 'Family', occupancy: 27 }
];

// Simulated sales response
function generateSalesResponse() {
    try {
        // Constants
        const standardRate = 1300; 
        const nightPromoRate = 580;
        
        // Calculate total sales based on room types, occupancy, and average stay duration
        const roomSales = {};
        let totalSales = 0;
        let totalBookings = 0;
        
        // Current month and year
        const currentDate = new Date();
        const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
        const currentYear = currentDate.getFullYear();
        
        // Simulate days in month
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        
        // Simulate rooms per type and average stay length
        const roomCounts = {
            'Standard': 15,
            'Deluxe': 10,
            'Suite': 8,
            'Family': 7
        };
        
        const stayLengths = {
            'Standard': 2.1,
            'Deluxe': 1.8,
            'Suite': 2.5,
            'Family': 3.2
        };
        
        // Calculate room type price multipliers
        const priceMultipliers = {
            'Standard': 1.0,
            'Deluxe': 1.5,
            'Suite': 2.2,
            'Family': 2.0
        };
        
        // Calculate sales by room type
        occupancyData.forEach(room => {
            const roomCount = roomCounts[room.roomType] || 10;
            const occupancyRate = room.occupancy / 100;
            const avgStayLength = stayLengths[room.roomType] || 2;
            const priceMultiplier = priceMultipliers[room.roomType] || 1;
            
            // Calculate base price for this room type
            const basePrice = standardRate * priceMultiplier;
            
            // Estimate bookings for the month
            const estimatedBookings = Math.round((roomCount * daysInMonth * occupancyRate) / avgStayLength);
            
            // Calculate revenue from this room type
            const roomRevenue = estimatedBookings * basePrice * avgStayLength;
            
            roomSales[room.roomType] = {
                revenue: roomRevenue,
                bookings: estimatedBookings,
                avgStay: avgStayLength,
                avgPrice: basePrice
            };
            
            totalSales += roomRevenue;
            totalBookings += estimatedBookings;
        });
        
        // Calculate other sales metrics
        const averageBookingValue = totalSales / totalBookings;
        const highestRoom = Object.entries(roomSales).sort((a, b) => b[1].revenue - a[1].revenue)[0];
        const lowestRoom = Object.entries(roomSales).sort((a, b) => a[1].revenue - b[1].revenue)[0];
        
        // Generate growth metrics (simulated)
        const monthlyGrowth = ((Math.random() * 20) - 5).toFixed(1);
        const growthIndicator = parseFloat(monthlyGrowth) >= 0 ? '📈' : '📉';
        
        // Add a breakdown of revenue sources
        const revenueSources = {
            'Direct Bookings': (totalSales * 0.45).toFixed(0),
            'Online Travel Agencies': (totalSales * 0.38).toFixed(0),
            'Corporate Accounts': (totalSales * 0.12).toFixed(0),
            'Walk-in Guests': (totalSales * 0.05).toFixed(0)
        };
        
        // Calculate night promo revenue impact
        const nightPromoImpact = Math.round(totalSales * 0.15); // Assuming 15% of revenue comes from night promo
        const standardRateRevenue = totalSales - nightPromoImpact;
        const promoRateRevenue = nightPromoImpact;
        
        // Calculate recommendations based on the sales data
        const recommendations = [
            '• Consider promotional campaigns to boost direct bookings',
            '• Review pricing strategy for underperforming room types',
            '• Consider strategies to increase direct bookings and reduce OTA commissions'
        ];
        
        // Format currency for better readability
        const formatCurrency = (amount) => {
            return '₱' + parseInt(amount).toLocaleString();
        };
        
        return {
            success: true,
            response: `EverLodge Total Sales Analysis (${currentMonth} ${currentYear}) 📊

Total Sales This Month: ${formatCurrency(totalSales)} ${growthIndicator}
Monthly Growth: ${monthlyGrowth}% compared to last month
Total Bookings: ${totalBookings} reservations
Average Booking Value: ${formatCurrency(averageBookingValue)}

Revenue by Room Type:
• ${highestRoom[0]}: ${formatCurrency(highestRoom[1].revenue)} (${Math.round(highestRoom[1].revenue/totalSales*100)}% of total) ⭐
• Standard: ${formatCurrency(roomSales['Standard'].revenue)} (${Math.round(roomSales['Standard'].revenue/totalSales*100)}% of total)
• Deluxe: ${formatCurrency(roomSales['Deluxe'].revenue)} (${Math.round(roomSales['Deluxe'].revenue/totalSales*100)}% of total)
• ${lowestRoom[0]}: ${formatCurrency(lowestRoom[1].revenue)} (${Math.round(lowestRoom[1].revenue/totalSales*100)}% of total) ⚠️

Revenue by Source:
• Direct Bookings: ${formatCurrency(revenueSources['Direct Bookings'])} (45%)
• Online Travel Agencies: ${formatCurrency(revenueSources['Online Travel Agencies'])} (38%)
• Corporate Accounts: ${formatCurrency(revenueSources['Corporate Accounts'])} (12%)
• Walk-in Guests: ${formatCurrency(revenueSources['Walk-in Guests'])} (5%)

Rate Categories:
• Standard Rate Revenue: ${formatCurrency(standardRateRevenue)} (85%)
• Night Promo Rate Revenue: ${formatCurrency(promoRateRevenue)} (15%)

Key Sales Metrics:
• Most Profitable Room: ${highestRoom[0]} (Avg. Rate: ${formatCurrency(highestRoom[1].avgPrice)}/night)
• Longest Average Stay: ${Object.entries(stayLengths).sort((a, b) => b[1] - a[1])[0][0]} (${Object.entries(stayLengths).sort((a, b) => b[1] - a[1])[0][1]} nights)
• Standard Rate: ${formatCurrency(standardRate)}/night
• Night Promo Rate: ${formatCurrency(nightPromoRate)}/night (Special rate)
• Occupancy Rate: ${(occupancyData.reduce((sum, room) => sum + room.occupancy, 0) / occupancyData.length).toFixed(1)}%

Recommendations:
${recommendations.join('\n')}`
        };
    } catch (error) {
        console.error('Error generating sales response:', error);
        return {
            success: false,
            error: error.message,
            response: "I apologize, but I'm having trouble generating the sales analysis at this moment. Please try again later."
        };
    }
}

// API endpoint for processing queries
app.post('/query', (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing query parameter'
            });
        }
        
        console.log('Processing query:', message);
        
        const lowerMessage = message.toLowerCase();
        
        // Check for total sales query
        if (lowerMessage === 'what is our total sales' ||
            lowerMessage === 'total sales' ||
            lowerMessage.includes('what') && lowerMessage.includes('total sales')) {
            
            return res.json(generateSalesResponse());
        }
        
        // Default response
        return res.json({
            success: true,
            response: "I don't have a specific answer for that query. Please try asking about total sales."
        });
        
    } catch (error) {
        console.error('Error processing query:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            response: "I apologize, but I encountered an error processing your query. Please try again later."
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Query test server listening at http://localhost:${port}`);
}); 