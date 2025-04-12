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
        // Current month and year
        const currentDate = new Date();
        const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
        const currentYear = currentDate.getFullYear();
        
        // Use the exact same total sales figure as Business Analytics
        const totalSales = 43559; // ₱43,559.00 - exact match with Business Analytics
        
        // Generate mock bookings data to simulate real bookings with totalPrice
        const mockBookings = [];
        
        // Generate 30 mock bookings for current month to distribute the total sales
        const numBookings = 30;
        const avgBookingValue = totalSales / numBookings;
        
        for (let i = 0; i < numBookings; i++) {
            // Distribute room types
            const roomTypes = ['Standard', 'Premium Suite', 'Deluxe', 'Family'];
            const roomTypeIndex = Math.floor(Math.random() * roomTypes.length);
            const roomType = roomTypes[roomTypeIndex];
            
            // Random variation in price (±15% of average)
            const variation = (Math.random() * 0.3) - 0.15;
            const bookingPrice = avgBookingValue * (1 + variation);
            
            mockBookings.push({
                id: `mock-${i}`,
                propertyDetails: {
                    roomType: roomType
                },
                totalPrice: Math.round(bookingPrice),
                status: Math.random() > 0.1 ? 'confirmed' : 'cancelled' // 90% are confirmed
            });
        }
        
        // Filter out cancelled bookings
        const confirmedBookings = mockBookings.filter(booking => booking.status !== 'cancelled');
        const totalBookings = confirmedBookings.length;
        
        // Adjust totalPrice values to ensure total exactly matches 43559
        let currentTotal = confirmedBookings.reduce((total, booking) => total + booking.totalPrice, 0);
        const adjustment = totalSales / currentTotal;
        
        confirmedBookings.forEach(booking => {
            booking.totalPrice = Math.round(booking.totalPrice * adjustment);
        });
        
        // Recalculate to verify total (and make any small final adjustments)
        currentTotal = confirmedBookings.reduce((total, booking) => total + booking.totalPrice, 0);
        if (currentTotal !== totalSales) {
            // Add or subtract the difference to the first booking
            confirmedBookings[0].totalPrice += (totalSales - currentTotal);
        }
        
        // Calculate room type sales breakdown
        const roomSales = {};
        confirmedBookings.forEach(booking => {
            const roomType = booking.propertyDetails.roomType;
            if (!roomSales[roomType]) {
                roomSales[roomType] = { revenue: 0, bookings: 0 };
            }
            
            roomSales[roomType].revenue += booking.totalPrice;
            roomSales[roomType].bookings++;
        });
        
        // Calculate average booking value
        const averageBookingValue = totalSales / totalBookings;
        
        // Calculate other sales metrics
        const highestRoom = Object.entries(roomSales).sort((a, b) => b[1].revenue - a[1].revenue)[0];
        const lowestRoom = Object.entries(roomSales).sort((a, b) => a[1].revenue - b[1].revenue)[0];
        
        // Generate growth metrics (simulated)
        const monthlyGrowth = 7.5; // Consistent growth rate
        const growthIndicator = parseFloat(monthlyGrowth) >= 0 ? '📈' : '📉';
        
        // Add a breakdown of revenue sources
        const revenueSources = {
            'Direct Bookings': Math.round(totalSales * 0.45),
            'Online Travel Agencies': Math.round(totalSales * 0.38),
            'Corporate Accounts': Math.round(totalSales * 0.12),
            'Walk-in Guests': Math.round(totalSales * 0.05)
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
• Standard: ${formatCurrency(roomSales['Standard']?.revenue || 0)} (${Math.round((roomSales['Standard']?.revenue || 0)/totalSales*100)}% of total)
• Deluxe: ${formatCurrency(roomSales['Deluxe']?.revenue || 0)} (${Math.round((roomSales['Deluxe']?.revenue || 0)/totalSales*100)}% of total)
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
• Most Profitable Room: ${highestRoom[0]} (${formatCurrency(highestRoom[1].revenue)} total revenue)
• Lowest Performing Room: ${lowestRoom[0]} (${formatCurrency(lowestRoom[1].revenue)} total revenue)
• Total Revenue: ${formatCurrency(totalSales)}
• Total Confirmed Bookings: ${totalBookings}

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
            response: "I apologize, but I encountered an error while processing your query. Please try again later."
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`AInalysis Query Processor running on port ${port}`);
});

// Export for testing
module.exports = { generateSalesResponse }; 