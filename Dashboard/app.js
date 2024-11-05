new Vue({
    el: '#app',
    data: {
        todayCheckIns: 10,
        availableRooms: 23,
        occupiedRooms: 20,
        analysisFeedback: '',
        searchQuery: '',
        bookings: [
            { id: 1, guestName: 'Alice Johnson', roomNumber: '101', checkInDate: '2023-10-25', checkOutDate: '2023-10-27' },
            { id: 2, guestName: 'Bob Smith', roomNumber: '102', checkInDate: '2023-10-24', checkOutDate: '2023-10-26' },
            { id: 3, guestName: 'Charlie Brown', roomNumber: '103', checkInDate: '2023-10-23', checkOutDate: '2023-10-25' },
            // Add more bookings as needed
        ],
    },
    computed: {
        filteredBookings() {
            if (!this.searchQuery) return this.bookings;
            return this.bookings.filter(booking => {
                const lowerCaseQuery = this.searchQuery.toLowerCase();
                return booking.guestName.toLowerCase().includes(lowerCaseQuery) || 
                       booking.roomNumber.includes(lowerCaseQuery); // Check room number
            });
        }
    },    
    methods: {
        analyzeData() {
            this.analysisFeedback = "AI analysis is complete! Suggestion: Increase room prices during peak season.";
        },
        renderCharts() {
            const ctxAnalytics = document.getElementById('analyticsChart').getContext('2d');
            const analyticsChart = new Chart(ctxAnalytics, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'User Engagement',
                        data: [120, 150, 180, 220, 200, 250],
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 2,
                        fill: false,
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });

            const ctxRevenue = document.getElementById('revenueChart').getContext('2d');
            const revenueChart = new Chart(ctxRevenue, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Monthly Revenue',
                        data: [5000, 7000, 8000, 6000, 9000, 10000],
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 1,
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    },
    mounted() {
        this.renderCharts(); // Call renderCharts when the component is mounted
    }
});
