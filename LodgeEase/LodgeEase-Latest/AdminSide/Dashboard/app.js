// Import Firebase modules
import { db, auth } from '../firebase.js';
import { collection, getDocs, query, orderBy, limit, doc, deleteDoc, updateDoc, Timestamp, where, addDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getChartData } from './chartData.js';

// Vue app for the dashboard
new Vue({
    el: '#app',
    data: {
        todayCheckIns: 0,
        availableRooms: 36, // Update initial value to 36 rooms
        searchQuery: '',
        bookings: [],
        analysisFeedback: '',
        isAuthenticated: false,
        loading: true,
        revenueChart: null,
        occupancyChart: null,
        roomTypeChart: null,
        stats: {
            totalBookings: 0,
            currentMonthRevenue: '₱0.00',
            occupancyRate: '0.0'
        },
        // Add salesData
        salesData: {
            metrics: {
                totalSales: 0,
                monthlyGrowth: 0,
                yearOverYearGrowth: 0,
                currentMonthSales: 0,
                previousMonthSales: 0
            },
            forecast: []
        },
        chartData: {
            revenue: {
                labels: [],
                datasets: []
            },
            occupancy: {
                labels: [],
                datasets: []
            },
            roomType: {
                labels: [],
                datasets: []
            }
        },
        forecastData: {
            occupancyPrediction: [],
            revenueForecast: [],
            demandTrends: [],
            seasonalityPatterns: []
        },
        aiInsights: [],
        updateInterval: null,
        forecastInterval: null,
        revenueData: {
            labels: [],
            datasets: {
                monthly: [{
                    label: 'Actual Revenue',
                    data: [],
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true
                }, {
                    label: 'Forecast',
                    data: [],
                    borderColor: 'rgba(255, 159, 64, 1)',
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    borderDash: [5, 5],
                    fill: true
                }]
            },
            metrics: {
                totalRevenue: 0,
                monthlyGrowth: 0,
                yearOverYearGrowth: 0,
                currentMonthRevenue: 0,
                previousMonthRevenue: 0,
                forecast: []
            }
        },
        occupancyData: {
            labels: [],
            datasets: [],
            metrics: {
                averageOccupancy: 0,
                currentOccupancy: 0,
                forecast: []
            }
        },
        showingChartInfo: false,
        chartInfoTitle: '',
        chartInfoText: '',
        chartInfo: {
            revenue: {
                title: 'Revenue Analysis Chart',
                text: 'This chart displays the historical and predicted revenue trends. The blue line shows actual revenue, while the orange dashed line shows predicted future revenue. The chart helps identify seasonal patterns, growth trends, and potential future earnings based on historical data and AI predictions.'
            },
            occupancy: {
                title: 'Occupancy Analysis Chart',
                text: 'The occupancy chart shows room occupancy rates over time. It displays actual occupancy (red line), predicted occupancy (green dashed line), and target occupancy rate (purple dashed line). This helps track capacity utilization and forecast future demand patterns.'
            },
            bookings: {
                title: 'Booking Trends Chart',
                text: 'This chart combines bar and line representations to show booking patterns. The bars represent actual bookings, while the lines show predictions and historical comparisons. It helps identify peak booking periods and seasonal trends in guest reservations.'
            },
            rooms: {
                title: 'Room Distribution Chart',
                text: 'The doughnut chart shows the distribution of room types and their relative occupancy. Each segment represents a different room type, with the size indicating the proportion of rooms. Hover over segments to see detailed statistics including sales generation per room type.'
            },
            sales: {
                title: 'Sales Analysis Chart',
                text: 'The sales analysis chart provides a comprehensive view of your sales performance. It shows actual sales data (blue line) and predicted future sales (orange dashed line). The chart helps identify sales patterns, growth trends, and potential sales opportunities. The target line (purple dashed) indicates your revenue goals. Use this chart to track performance against targets and make data-driven decisions about pricing and marketing strategies.'
            }
        },
        showingExplanation: false,
        explanationTitle: '',
        explanationText: '',
        chartInitializationAttempted: false, // Add this flag
        chartInstances: {
            revenue: null,
            occupancy: null,
            roomType: null,
            bookingTrend: null
        },
        isInitialized: false, // Add this flag
        showingMetricsExplanation: false, // Add this flag
        showingMetricInfo: false,
        metricInfoTitle: '',
        metricInfoText: '',
    },
    created() {
        // Call checkAuthState when the component is created
        this.checkAuthState().catch(error => {
            console.error('Error checking auth state:', error);
            this.loading = false;
        });
    },
    computed: {
        filteredBookings() {
            if (!this.searchQuery) {
                return this.bookings;
            }
            
            const query = this.searchQuery.toLowerCase();
            return this.bookings.filter(booking => {
                // Search by guest name
                if (booking.guestName && booking.guestName.toLowerCase && booking.guestName.toLowerCase().includes(query)) {
                    return true;
                }
                
                // Search by room number
                if (booking.propertyDetails && booking.propertyDetails.roomNumber && 
                    booking.propertyDetails.roomNumber.toString().includes(query)) {
                    return true;
                }
                
                // Search by room type
                if (booking.propertyDetails && booking.propertyDetails.roomType && 
                    booking.propertyDetails.roomType.toLowerCase && booking.propertyDetails.roomType.toLowerCase().includes(query)) {
                    return true;
                }
                
                // Search by status
                if (booking.status && booking.status.toLowerCase && booking.status.toLowerCase().includes(query)) {
                    return true;
                }
                
                // Search by payment status
                if (booking.paymentStatus && booking.paymentStatus.toLowerCase && booking.paymentStatus.toLowerCase().includes(query)) {
                    return true;
                }
                
                return false;
            });
        }
    },
    methods: {
        async handleLogout() {
            try {
                await signOut(auth);
                window.location.href = '../Login/index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                alert('Error signing out. Please try again.');
            }
        },

        async checkAuthState() {
            return new Promise((resolve) => {
                auth.onAuthStateChanged(async (user) => {
                    this.loading = false;
                    if (user) {
                        this.isAuthenticated = true;
                        this.user = user;
                        // Only fetch bookings here, remove initializeCharts call
                        await this.fetchBookings();
                    } else {
                        this.isAuthenticated = false;
                        this.user = null;
                    }
                    resolve(user);
                });
            });
        },

        analyzeData() {
            const totalBookings = this.bookings.length;
            const pendingBookings = this.bookings.filter(b => b.status === 'pending').length;
            const occupiedBookings = this.bookings.filter(b => b.status === 'occupied').length;
            const completedBookings = this.bookings.filter(b => b.status === 'completed').length;
            
            this.analysisFeedback = `
                Total Bookings: ${totalBookings}
                Pending Bookings: ${pendingBookings}
                Occupied Rooms: ${occupiedBookings}
                Completed Bookings: ${completedBookings}
                Available Rooms: ${this.availableRooms}
                Occupancy Rate: ${((occupiedBookings / 36) * 100).toFixed(1)}%
            `;
        },

        formatDate(timestamp) {
            try {
                if (!timestamp || !timestamp.toDate) return 'N/A';
                return timestamp.toDate().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
            } catch (error) {
                console.error('Date formatting error:', error);
                return 'N/A';
            }
        },

        formatDateForChart(date) {
            try {
                // Handle different date formats
                const dateObj = date instanceof Date ? date : 
                               (date?.toDate ? date.toDate() : 
                               (typeof date === 'string' ? new Date(date) : null));

                if (!dateObj || isNaN(dateObj.getTime())) {
                    throw new Error('Invalid date input');
                }

                return dateObj.toLocaleString('default', { 
                    month: 'short', 
                    year: '2-digit'
                });
            } catch (error) {
                console.error('Date formatting error:', error, 'Input:', date);
                return 'Invalid Date';
            }
        },

        async fetchBookings() {
            try {
                console.log("Fetching bookings from everlodgebookings collection");
                const bookingsRef = collection(db, 'everlodgebookings');
                const q = query(bookingsRef);
                const querySnapshot = await getDocs(q);
                
                console.log(`Found ${querySnapshot.size} booking documents`);
                
                if (querySnapshot.empty) {
                    console.warn("No bookings found in everlodgebookings collection");
                    // Set default values if no bookings are found
                    this.todayCheckIns = 0;
                    this.availableRooms = 36;
                    this.stats = {
                        totalBookings: 0,
                        currentMonthRevenue: this.formatCurrency(0),
                        occupancyRate: '0.0%'
                    };
                    return;
                }
                
                this.bookings = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // Ensure essential fields have defaults
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
                
                console.log(`Processed ${this.bookings.length} bookings`);

                // Calculate metrics based on actual data
                await this.calculateDashboardMetrics();
                await this.updateDashboardStats();
                
                // Force Vue to refresh the UI
                this.$forceUpdate();
                
                console.log("Booking data processing complete");
            } catch (error) {
                console.error('Error fetching bookings:', error);
                // Set default values on error
                this.todayCheckIns = 0;
                this.availableRooms = 36;
                this.stats = {
                    totalBookings: 0,
                    currentMonthRevenue: this.formatCurrency(0),
                    occupancyRate: '0.0%'
                };
                // Force Vue to refresh the UI even on error
                this.$forceUpdate();
            }
        },

        async calculateSalesMetrics() {
            try {
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const lastMonth = new Date(currentYear, currentMonth - 1);
                const lastYear = new Date(currentYear - 1, currentMonth);

                // Generate labels for the last 12 months
                const labels = [];
                const actualSales = [];
                const predictedSales = [];
                const actualOccupancy = [];
                const predictedOccupancy = [];
                const targetOccupancy = [];

                for (let i = 11; i >= 0; i--) {
                    const date = new Date(currentYear, currentMonth - i, 1);
                    labels.push(date.toLocaleString('default', { month: 'short', year: '2-digit' }));

                    // Filter bookings for this month
                    const monthBookings = this.bookings.filter(booking => {
                        const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                        return bookingDate.getMonth() === date.getMonth() && 
                               bookingDate.getFullYear() === date.getFullYear();
                    });

                    // Calculate actual sales for this month
                    const monthSales = monthBookings.reduce((sum, booking) => sum + (booking.totalPrice || 0), 0);
                    actualSales.push(monthSales);

                    // Calculate actual occupancy for this month
                    const occupiedDays = monthBookings.length;
                    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                    const occupancyRate = (occupiedDays / (10 * daysInMonth)) * 100; // 10 rooms total
                    actualOccupancy.push(occupancyRate);

                    // For future months (next 3 months), generate predictions
                    if (i < 3) {
                        // Predict based on average of last 3 months with some variation
                        const lastThreeMonths = actualSales.slice(-3);
                        const avgSales = lastThreeMonths.reduce((a, b) => a + b, 0) / lastThreeMonths.length;
                        const predictedSale = avgSales * (1 + (Math.random() * 0.2 - 0.1)); // ±10% variation
                        predictedSales.push(predictedSale);

                        const lastThreeOccupancy = actualOccupancy.slice(-3);
                        const avgOccupancy = lastThreeOccupancy.reduce((a, b) => a + b, 0) / lastThreeOccupancy.length;
                        const predictedOcc = Math.min(100, avgOccupancy * (1 + (Math.random() * 0.2 - 0.1))); // ±10% variation
                        predictedOccupancy.push(predictedOcc);
                    } else {
                        predictedSales.push(null);
                        predictedOccupancy.push(null);
                    }

                    // Set target occupancy at 80%
                    targetOccupancy.push(80);
                }

                // Update chart data
                if (this.chartInstances.revenue) {
                    const revenueData = {
                        labels: labels,
                        datasets: [{
                            label: 'Actual Sales',
                            data: actualSales,
                            borderColor: 'rgba(54, 162, 235, 1)',
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Predicted Sales',
                            data: predictedSales,
                            borderColor: 'rgba(255, 159, 64, 1)',
                            backgroundColor: 'rgba(255, 159, 64, 0.2)',
                            borderDash: [5, 5],
                            fill: true,
                            tension: 0.4
                        }]
                    };
                    this.updateChart(this.chartInstances.revenue, revenueData);
                }

                if (this.chartInstances.occupancy) {
                    const occupancyData = {
                        labels: labels,
                        datasets: [{
                            label: 'Actual Occupancy',
                            data: actualOccupancy,
                            borderColor: 'rgba(255, 99, 132, 1)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Predicted Occupancy',
                            data: predictedOccupancy,
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            borderDash: [5, 5],
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Target Rate',
                            data: targetOccupancy,
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderDash: [3, 3],
                            fill: false
                        }]
                    };
                    this.updateChart(this.chartInstances.occupancy, occupancyData);
                }

                // Calculate current month metrics
                const currentMonthBookings = this.bookings.filter(booking => {
                    const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                    return bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear;
                });

                const currentMonthSales = currentMonthBookings.reduce((sum, booking) => sum + (booking.totalPrice || 0), 0);
                const lastMonthSales = actualSales[actualSales.length - 2] || 0;
                const lastYearSales = actualSales[0] || 0;

                // Calculate growth rates
                const monthlyGrowth = lastMonthSales > 0 ? 
                    ((currentMonthSales - lastMonthSales) / lastMonthSales) * 100 : 0;
                const yearOverYearGrowth = lastYearSales > 0 ? 
                    ((currentMonthSales - lastYearSales) / lastYearSales) * 100 : 0;

                // Update sales data
                this.salesData = {
                    metrics: {
                        totalSales: this.bookings.reduce((sum, booking) => sum + (booking.totalPrice || 0), 0),
                        monthlyGrowth: monthlyGrowth,
                        yearOverYearGrowth: yearOverYearGrowth,
                        currentMonthSales: currentMonthSales,
                        previousMonthSales: lastMonthSales
                    },
                    forecast: predictedSales.filter(val => val !== null)
                };

                console.log('Sales metrics calculated:', this.salesData);
                console.log('Charts updated with new data');

            } catch (error) {
                console.error('Error calculating sales metrics:', error);
            }
        },

        async deleteBooking(bookingId) {
            if (!this.isAuthenticated) {
                alert('Please log in to delete bookings');
                return;
            }

            if (!bookingId) {
                console.error('No booking ID provided');
                return;
            }

            try {
                if (!confirm('Are you sure you want to delete this booking?')) {
                    return;
                }

                const bookingRef = doc(db, 'bookings', bookingId);
                await deleteDoc(bookingRef);
                
                // Remove from local state
                this.bookings = this.bookings.filter(booking => booking.id !== bookingId);
                this.updateDashboardStats();
                
                alert('Booking deleted successfully!');
            } catch (error) {
                console.error('Error deleting booking:', error);
                if (error.code === 'permission-denied') {
                    alert('You do not have permission to delete this booking');
                } else {
                    alert('Error deleting booking. Please try again.');
                }
            }
        },

        async editBooking(booking) {
            if (!this.isAuthenticated) {
                alert('Please log in to edit bookings');
                return;
            }

            if (!booking || !booking.id) {
                console.error('Invalid booking data');
                return;
            }

            console.log('Editing booking:', booking); // Debug log

            try {
                const modalHTML = `
                    <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
                            <h2 class="text-xl font-bold mb-4">Edit Booking</h2>
                            <form id="edit-booking-form" class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
                                    <input 
                                        name="roomNumber" 
                                        type="text" 
                                        value="${booking.propertyDetails?.roomNumber || ''}"
                                        class="w-full p-2 border rounded-md"
                                        required
                                    >
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
                                    <input 
                                        name="roomType" 
                                        type="text" 
                                        value="${booking.propertyDetails?.roomType || ''}"
                                        class="w-full p-2 border rounded-md"
                                        required
                                    >
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Floor Level</label>
                                    <input 
                                        name="floorLevel" 
                                        type="text" 
                                        value="${booking.propertyDetails.floorLevel}"
                                        class="w-full p-2 border rounded-md"
                                        required
                                    >
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
                                    <input 
                                        name="guestName" 
                                        type="text" 
                                        value="${booking.guestName}"
                                        class="w-full p-2 border rounded-md"
                                        required
                                    >
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select name="status" class="w-full p-2 border rounded-md" required>
                                        <option value="pending" ${booking.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        <option value="occupied" ${booking.status === 'occupied' ? 'selected' : ''}>Occupied</option>
                                        <option value="completed" ${booking.status === 'completed' ? 'selected' : ''}>Completed</option>
                                    </select>
                                </div>
                                <div class="flex justify-end space-x-3 mt-6">
                                    <button type="button" class="cancel-edit px-4 py-2 bg-gray-200 text-gray-800 rounded">Cancel</button>
                                    <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded">Save Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                `;

                const modalContainer = document.createElement('div');
                modalContainer.innerHTML = modalHTML;
                document.body.appendChild(modalContainer);

                const form = document.getElementById('edit-booking-form');
                const cancelBtn = modalContainer.querySelector('.cancel-edit');

                cancelBtn.addEventListener('click', () => {
                    modalContainer.remove();
                });

                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const formData = new FormData(form);

                    try {
                        const bookingRef = doc(db, 'bookings', booking.id);
                        const updateData = {
                            'propertyDetails.roomNumber': formData.get('roomNumber'),
                            'propertyDetails.roomType': formData.get('roomType'),
                            'floorLevel': formData.get('floorLevel'),
                            guestName: formData.get('guestName'),
                            status: formData.get('status'),
                            updatedAt: Timestamp.fromDate(new Date())
                        };

                        console.log('Updating with data:', updateData); // Debug log
                        await updateDoc(bookingRef, updateData);

                        await this.fetchBookings();
                        modalContainer.remove();
                        alert('Booking updated successfully!');
                    } catch (error) {
                        console.error('Error updating booking:', error);
                        alert('Error updating booking. Please try again.');
                    }
                });

            } catch (error) {
                console.error('Error opening edit modal:', error);
                alert('Error opening edit form. Please try again.');
            }
        },

        async updateDashboardStats() {
            try {
                // Initialize charts if not already done
                if (!this.isInitialized) {
                    await this.initializeCharts();
                }

                const data = await getChartData();
                if (!data) {
                    console.error('No data received from getChartData');
                    return;
                }
                
                console.log('Updating dashboard with new data:', data);
                
                // Update metrics from data
                if (data.metrics) {
                    const metrics = data.metrics;
                    this.stats = {
                        totalBookings: parseInt(metrics.totalBookings || 0, 10),
                        currentMonthRevenue: this.formatCurrency(parseFloat(metrics.currentMonthRevenue || 0)),
                        occupancyRate: parseFloat(metrics.occupancyRate || 0).toFixed(1) + '%'
                    };
                }
                
                // Skip chart updates if charts aren't initialized yet
                if (!this.isInitialized) {
                    console.log('Charts not initialized, skipping updates');
                    return;
                }
                
                // Update each chart with new data if available
                try {
                    if (this.revenueChart && data.revenue) {
                        console.log('Updating revenue chart with new data');
                        this.revenueChart.data = data.revenue;
                        this.revenueChart.update();
                    }
                    
                    if (this.occupancyChart && data.occupancy) {
                        console.log('Updating occupancy chart with new data');
                        this.occupancyChart.data = data.occupancy;
                        this.occupancyChart.update();
                    }
                    
                    if (this.roomTypeChart && data.roomType) {
                        console.log('Updating room type chart with new data');
                        this.roomTypeChart.data = data.roomType;
                        this.roomTypeChart.update();
                    }
                    
                    if (this.bookingTrendsChart && data.bookingTrends) {
                        console.log('Updating booking trends chart with new data');
                        this.bookingTrendsChart.data = data.bookingTrends;
                        this.bookingTrendsChart.update();
                    }
                    
                    console.log('Dashboard charts updated successfully');
                } catch (chartError) {
                    console.error('Error updating charts:', chartError);
                }
            } catch (error) {
                console.error('Error updating dashboard:', error);
            }
        },

        async calculateDashboardMetrics() {
            try {
                console.log("Calculating dashboard metrics");
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Helper function to parse dates consistently
                const parseDate = (dateField) => {
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
                };

                // Calculate today's check-ins
                this.todayCheckIns = this.bookings.filter(booking => {
                    const checkInDate = parseDate(booking.checkIn);
                    if (!checkInDate) return false;
                    
                    checkInDate.setHours(0, 0, 0, 0);
                    const isToday = checkInDate.getTime() === today.getTime();
                    const isActive = booking.status !== 'cancelled' && booking.status !== 'completed';
                    return isToday && isActive;
                }).length;

                console.log(`Today's check-ins: ${this.todayCheckIns}`);

                // Calculate available rooms based on actual bookings
                const totalRooms = 36; // Total number of rooms in the lodge
                const occupiedRooms = this.bookings.filter(booking => {
                    const checkIn = parseDate(booking.checkIn);
                    const checkOut = parseDate(booking.checkOut);
                    
                    if (!checkIn || !checkOut) return false;
                    
                    const isActive = booking.status !== 'cancelled' && booking.status !== 'completed';
                    return checkIn <= today && checkOut >= today && isActive;
                }).length;
                
                this.availableRooms = totalRooms - occupiedRooms;
                console.log(`Available rooms: ${this.availableRooms} (${occupiedRooms} occupied out of ${totalRooms} total)`);

                // Calculate total bookings for current month
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();
                
                this.stats.totalBookings = this.bookings.filter(booking => {
                    const bookingDate = parseDate(booking.checkIn);
                    if (!bookingDate) return false;
                    
                    const isThisMonth = bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear;
                    const isActive = booking.status !== 'cancelled';
                    return isThisMonth && isActive;
                }).length;

                console.log(`Total bookings this month: ${this.stats.totalBookings}`);

                // Calculate current month revenue
                const currentMonthRevenue = this.bookings
                    .filter(booking => {
                        const bookingDate = parseDate(booking.checkIn);
                        if (!bookingDate) return false;
                        
                        const isThisMonth = bookingDate.getMonth() === currentMonth && 
                               bookingDate.getFullYear() === currentYear;
                        const isActive = booking.status !== 'cancelled';
                        return isThisMonth && isActive;
                    })
                    .reduce((total, booking) => {
                        const price = parseFloat(booking.totalPrice) || 0;
                        return total + price;
                    }, 0);

                this.stats.currentMonthRevenue = this.formatCurrency(currentMonthRevenue);
                console.log(`Current month revenue: ${this.stats.currentMonthRevenue}`);

                // Calculate occupancy rate
                const occupancyRate = (occupiedRooms / totalRooms) * 100;
                this.stats.occupancyRate = occupancyRate.toFixed(1) + '%';
                console.log(`Occupancy rate: ${this.stats.occupancyRate}`);
                
                // Force a UI update after all metrics have been calculated
                this.$forceUpdate();

            } catch (error) {
                console.error('Error calculating dashboard metrics:', error);
                // Set default values on error
                this.todayCheckIns = 0;
                this.availableRooms = 36;
                this.stats = {
                    totalBookings: 0,
                    currentMonthRevenue: this.formatCurrency(0),
                    occupancyRate: '0.0%'
                };
                // Force UI update even after error
                this.$forceUpdate();
            }
        },

        formatCurrency(amount) {
            try {
                return new Intl.NumberFormat('en-PH', {
                    style: 'currency',
                    currency: 'PHP'
                }).format(amount);
            } catch (error) {
                console.error('Error formatting currency:', error);
                return '₱0.00';
            }
        },

        generateBookingTrendData(bookings) {
            try {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const currentDate = new Date();
                const labels = [];
                const actualData = [];
                const predictedData = [];
                const previousPeriodData = [];
                
                // Generate last 6 months of data
                for (let i = 5; i >= 0; i--) {
                    const month = new Date(currentDate);
                    month.setMonth(currentDate.getMonth() - i);
                    const monthLabel = `${months[month.getMonth()]}-${month.getFullYear().toString().substr(2)}`;
                    labels.push(monthLabel);
                    
                    // Count actual bookings for this month
                    const bookingsInMonth = bookings.filter(booking => {
                        if (!booking.checkIn || !booking.checkIn.toDate) return false;
                        const checkIn = booking.checkIn.toDate();
                        return checkIn.getMonth() === month.getMonth() && 
                               checkIn.getFullYear() === month.getFullYear();
                    }).length;
                    
                    actualData.push(bookingsInMonth);
                    
                    // Generate predicted data (slightly different from actual for visualization)
                    const predicted = Math.max(0, bookingsInMonth * (1 + (Math.random() * 0.4 - 0.2)));
                    predictedData.push(Math.round(predicted));
                    
                    // Generate previous period data (from one year ago)
                    const prevYearBookingsCount = bookings.filter(booking => {
                        if (!booking.checkIn || !booking.checkIn.toDate) return false;
                        const checkIn = booking.checkIn.toDate();
                        return checkIn.getMonth() === month.getMonth() && 
                               checkIn.getFullYear() === month.getFullYear() - 1;
                    }).length;
                    
                    previousPeriodData.push(prevYearBookingsCount);
                }
                
                // Add future months for prediction
                for (let i = 1; i <= 3; i++) {
                    const month = new Date(currentDate);
                    month.setMonth(currentDate.getMonth() + i);
                    const monthLabel = `${months[month.getMonth()]}-${month.getFullYear().toString().substr(2)}`;
                    labels.push(monthLabel);
                    
                    // For future months, actual data is null
                    actualData.push(null);
                    
                    // Generate forecast based on previous year trend and recent months
                    const lastValue = actualData[actualData.length - 2] || 0;
                    const prevYearValue = previousPeriodData[previousPeriodData.length - 1] || 0;
                    const seasonalFactor = prevYearValue > 0 ? prevYearValue / 5 : 1;
                    
                    // Predict with some randomness and seasonal factor
                    const predicted = Math.max(1, lastValue * seasonalFactor * (1 + (Math.random() * 0.3 - 0.1)));
                    predictedData.push(Math.round(predicted));
                    
                    // Previous period data continues with random values for future months
                    const randomPrevValue = Math.round(Math.random() * 5);
                    previousPeriodData.push(randomPrevValue);
                }
                
                return {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Actual Bookings',
                            type: 'bar',
                            data: actualData,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1,
                            order: 2
                        },
                        {
                            label: 'Predicted Bookings',
                            type: 'line',
                            data: predictedData,
                            borderColor: 'rgba(255, 159, 64, 1)',
                            backgroundColor: 'rgba(255, 159, 64, 0.2)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.4,
                            order: 1
                        },
                        {
                            label: 'Previous Period',
                            type: 'line',
                            data: previousPeriodData,
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderWidth: 1,
                            borderDash: [3, 3],
                            fill: false,
                            tension: 0.4,
                            order: 0
                        }
                    ]
                };
            } catch (error) {
                console.error('Error generating booking trend data:', error);
                // Return default chart data structure
                return {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [
                        {
                            label: 'Actual Bookings',
                            type: 'bar',
                            data: [3, 5, 4, 6, 5, 7],
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1
                        }
                    ]
                };
            }
        },

        updateChart(chart, newData) {
            if (!chart) {
                console.warn('Chart instance is missing');
                return;
            }
            
            try {
                console.log(`Updating chart (${chart.id}) with:`, newData);
                
                // Defensive check: ensure newData has proper structure
                if (!newData || typeof newData !== 'object') {
                    throw new Error('Invalid chart data provided');
                }
                
                // Ensure newData.datasets exists and is usable
                if (!newData.datasets) {
                    newData.datasets = [{
                        label: 'No Data',
                        data: [],
                        borderColor: 'rgba(200, 200, 200, 1)',
                        backgroundColor: 'rgba(200, 200, 200, 0.2)'
                    }];
                }
                
                // Special handling for mixed chart types (like bookingTrend)
                if (chart.id === 'bookingTrendChart') {
                    // For mixed charts, we need to handle each dataset individually
                    chart.data.labels = newData.labels || [];
                    
                    if (Array.isArray(newData.datasets)) {
                        chart.data.datasets = newData.datasets.map(dataset => ({
                            ...dataset,
                            label: dataset.label || 'Unnamed Dataset',
                            data: Array.isArray(dataset.data) ? dataset.data : [],
                            borderColor: dataset.borderColor || 'rgba(200, 200, 200, 1)',
                            backgroundColor: dataset.backgroundColor || 'rgba(200, 200, 200, 0.2)',
                            borderDash: dataset.borderDash || [],
                            tension: dataset.tension !== undefined ? dataset.tension : 0.4,
                            fill: dataset.fill !== undefined ? dataset.fill : false,
                            order: dataset.order !== undefined ? dataset.order : 0
                        }));
                    }
                } else {
                    // Standard charts
                    const defaultData = {
                        labels: [],
                        datasets: []
                    };

                    // Handle both array and object-based datasets
                    let datasets = [];
                    
                    if (Array.isArray(newData.datasets)) {
                        datasets = newData.datasets;
                    } else if (typeof newData.datasets === 'object') {
                        datasets = newData.datasets[chart.config.type] || [];
                    }

                    // Ensure datasets is an array
                    if (!Array.isArray(datasets)) {
                        console.warn('Invalid datasets structure:', datasets);
                        datasets = defaultData.datasets;
                    }

                    // Merge provided data with defaults
                    chart.data = {
                        labels: newData.labels || defaultData.labels,
                        datasets: datasets.map(dataset => ({
                            label: dataset.label || 'Unnamed Dataset',
                            data: Array.isArray(dataset.data) ? dataset.data : [],
                            borderColor: dataset.borderColor || 'rgba(200, 200, 200, 1)',
                            backgroundColor: dataset.backgroundColor || 'rgba(200, 200, 200, 0.2)',
                            borderDash: dataset.borderDash || [],
                            tension: 0.4,
                            fill: dataset.fill !== undefined ? dataset.fill : true
                        }))
                    };
                }

                // Update chart options
                if (!chart.options.plugins) {
                    chart.options.plugins = {};
                }

                if (!chart.options.plugins.tooltip) {
                    chart.options.plugins.tooltip = {};
                }

                chart.options.plugins.tooltip.callbacks = {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const value = context.raw;
                        
                        if (value === null || value === undefined) return null;
                        
                        if (label.toLowerCase().includes('revenue')) {
                            return `${label}: ${new Intl.NumberFormat('en-PH', {
                                style: 'currency',
                                currency: 'PHP'
                            }).format(value)}`;
                        }
                        
                        if (label.toLowerCase().includes('occupancy')) {
                            return `${label}: ${value.toFixed(1)}%`;
                        }
                        
                        return `${label}: ${value}`;
                    }
                };

                chart.update('none');
                console.log(`Updated chart "${chart.id}" successfully`);
            } catch (error) {
                console.error('Error updating chart:', error);
                
                // Attempt recovery with a minimal update
                try {
                    chart.data = {
                        labels: [],
                        datasets: [{
                            label: 'No Data Available',
                            data: [],
                            backgroundColor: 'rgba(200, 200, 200, 0.2)',
                            borderColor: 'rgba(200, 200, 200, 1)'
                        }]
                    };
                    chart.update('none');
                    console.log(`Recovered chart "${chart.id}" with empty data`);
                } catch (recoveryError) {
                    console.error('Failed to recover chart:', recoveryError);
                }
            }
        },

        async initializeCharts() {
            // If charts are already initialized, don't reinitialize
            if (this.isInitialized) {
                console.log('Charts already initialized, skipping initialization');
                return;
            }
            
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.error('Chart.js is not loaded, cannot initialize charts');
                return;
            }
            
            try {
                console.log('Initializing dashboard charts');
                
                // First, destroy any existing chart instances to avoid conflicts
                this.destroyExistingCharts();
                
                // Get canvas elements
                const revenueCtx = document.getElementById('revenueChart');
                const occupancyCtx = document.getElementById('occupancyChart');
                const roomTypeCtx = document.getElementById('roomTypeChart');
                const bookingTrendsCtx = document.getElementById('bookingTrendChart');
                
                if (!revenueCtx || !occupancyCtx || !roomTypeCtx || !bookingTrendsCtx) {
                    console.error('Chart canvas elements not found, cannot initialize charts');
                    return;
                }
                
                // Import chart data
                const chartData = await getChartData();
                console.log('Chart data received:', chartData);
                
                if (!chartData) {
                    console.error('Failed to get chart data');
                    return;
                }
                
                // Create chart instances with default data structure
                this.createChartInstances(revenueCtx, occupancyCtx, roomTypeCtx, bookingTrendsCtx, chartData);
                
                // Mark charts as initialized
                this.isInitialized = true;
                console.log('All charts initialized successfully');
            } catch (error) {
                console.error('Error initializing charts:', error);
                // Reset initialization flag on error
                this.isInitialized = false;
            }
        },

        destroyExistingCharts() {
            if (this.revenueChart instanceof Chart) {
                this.revenueChart.destroy();
                this.revenueChart = null;
            }
            
            if (this.occupancyChart instanceof Chart) {
                this.occupancyChart.destroy();
                this.occupancyChart = null;
            }
            
            if (this.roomTypeChart instanceof Chart) {
                this.roomTypeChart.destroy();
                this.roomTypeChart = null;
            }
            
            if (this.bookingTrendsChart instanceof Chart) {
                this.bookingTrendsChart.destroy();
                this.bookingTrendsChart = null;
            }
            
            console.log('Existing chart instances destroyed');
        },

        createChartInstances(revenueCtx, occupancyCtx, roomTypeCtx, bookingTrendsCtx, chartData) {
            // Create Revenue Chart
            this.revenueChart = new Chart(revenueCtx, {
                type: 'line',
                data: chartData.revenue || {
                    labels: [],
                    datasets: [{
                        label: 'Monthly Revenue',
                        data: [],
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 30,
                            right: 30,
                            bottom: 30,
                            left: 30
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                        includeInvisible: true
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '₱' + value.toLocaleString();
                                },
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            },
                            grid: {
                                drawBorder: false
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            padding: 12,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += '₱' + context.parsed.y.toLocaleString();
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: {
                                padding: 25,
                                usePointStyle: true,
                                font: {
                                    size: 13
                                }
                            }
                        }
                    },
                    elements: {
                        point: {
                            radius: 4,
                            hoverRadius: 8,
                            borderWidth: 2,
                            hoverBorderWidth: 2,
                            hoverBorderColor: '#ffffff'
                        },
                        line: {
                            tension: 0.3
                        }
                    }
                }
            });
            
            // Create Occupancy Chart
            this.occupancyChart = new Chart(occupancyCtx, {
                type: 'line',
                data: chartData.occupancy || {
                    labels: [],
                    datasets: [{
                        label: 'Occupancy Rate',
                        data: [],
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                        includeInvisible: true
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            padding: 12,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y.toFixed(1) + '%';
                                    }
                                    return label;
                                },
                                afterLabel: function(context) {
                                    // Calculate if rate is good, fair, or needs improvement
                                    const rate = context.parsed.y;
                                    let status = '';
                                    
                                    if (rate >= 80) status = '✓ Excellent';
                                    else if (rate >= 60) status = '✓ Good';
                                    else if (rate >= 40) status = '⚠️ Fair';
                                    else status = '⚠️ Needs Improvement';
                                    
                                    return [
                                        `Status: ${status}`,
                                        `Industry Avg: 65%`
                                    ];
                                }
                            }
                        },
                        hover: {
                            mode: 'nearest',
                            intersect: false
                        }
                    },
                    elements: {
                        point: {
                            radius: 3,
                            hoverRadius: 7,
                            borderWidth: 2,
                            hoverBorderWidth: 2,
                            hoverBorderColor: '#ffffff'
                        },
                        line: {
                            tension: 0.3
                        }
                    }
                }
            });
            
            // Create Room Type Chart
            this.roomTypeChart = new Chart(roomTypeCtx, {
                type: 'pie',
                data: chartData.roomType || {
                    labels: [],
                    datasets: [{
                        label: 'Bookings by Room Type',
                        data: [],
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.7)',
                            'rgba(54, 162, 235, 0.7)',
                            'rgba(255, 206, 86, 0.7)',
                            'rgba(75, 192, 192, 0.7)',
                            'rgba(153, 102, 255, 0.7)',
                            'rgba(255, 159, 64, 0.7)'
                        ],
                        hoverBackgroundColor: [
                            'rgba(255, 99, 132, 0.9)',
                            'rgba(54, 162, 235, 0.9)',
                            'rgba(255, 206, 86, 0.9)',
                            'rgba(75, 192, 192, 0.9)',
                            'rgba(153, 102, 255, 0.9)',
                            'rgba(255, 159, 64, 0.9)'
                        ],
                        borderWidth: 2,
                        hoverBorderWidth: 3,
                        hoverBorderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.formattedValue;
                                    const dataset = context.dataset;
                                    const total = dataset.data.reduce((acc, curr) => acc + curr, 0);
                                    const percentage = Math.round((context.raw / total) * 100);
                                    
                                    return `${label}: ${value} (${percentage}%)`;
                                },
                                afterLabel: function(context) {
                                    // Just an example - this would need to be populated with real data
                                    const roomTypes = ['Deluxe', 'Standard', 'Suite', 'Family', 'Executive', 'Budget'];
                                    const revenues = [120000, 95000, 180000, 150000, 210000, 75000];
                                    
                                    const index = context.dataIndex % roomTypes.length;
                                    return [
                                        `Avg. Rate: ₱${(revenues[index] / 30).toFixed(0)}/night`,
                                        `Revenue: ₱${revenues[index].toLocaleString()}`
                                    ];
                                }
                            }
                        }
                    },
                    animation: {
                        animateRotate: true,
                        animateScale: true
                    }
                }
            });
            
            // Create Booking Trends Chart
            this.bookingTrendsChart = new Chart(bookingTrendsCtx, {
                type: 'line',
                data: chartData.bookingTrends || {
                    labels: [],
                    datasets: [{
                        label: 'Daily Bookings',
                        data: [],
                        borderColor: 'rgba(153, 102, 255, 1)',
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    scales: {
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            padding: 12,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y + ' bookings';
                                    }
                                    return label;
                                },
                                afterLabel: function(context) {
                                    // This would be populated with real data in production
                                    const value = context.parsed.y;
                                    let trend = '';
                                    
                                    // Example condition for trends
                                    if (value > 10) trend = '↑ High demand';
                                    else if (value > 5) trend = '→ Average demand';
                                    else trend = '↓ Low demand';
                                    
                                    return [
                                        `Day: ${context.chart.data.labels[context.dataIndex]}`,
                                        `Trend: ${trend}`
                                    ];
                                }
                            }
                        },
                        hover: {
                            mode: 'nearest',
                            intersect: false
                        }
                    },
                    elements: {
                        point: {
                            radius: 3,
                            hoverRadius: 7,
                            borderWidth: 2,
                            hoverBorderWidth: 2,
                            hoverBorderColor: '#ffffff'
                        },
                        line: {
                            tension: 0.3
                        }
                    }
                }
            });
        },

        // Add methods for metric information
        showMetricInfo(metricType) {
            switch(metricType) {
                case 'checkins':
                    this.metricInfoTitle = "Today's Check-ins";
                    this.metricInfoText = "Number of guests scheduled to check in today. This is based on bookings with today's date.";
                    break;
                case 'rooms':
                    this.metricInfoTitle = "Available Rooms";
                    this.metricInfoText = "Current number of rooms that are not occupied and available for booking.";
                    break;
                case 'bookings':
                    this.metricInfoTitle = "Total Bookings";
                    this.metricInfoText = "Total number of bookings for the current month.";
                    break;
                case 'occupancy':
                    this.metricInfoTitle = "Occupancy Rate";
                    this.metricInfoText = "Percentage of rooms currently occupied out of total rooms available.";
                    break;
                default:
                    this.metricInfoTitle = "Metric Information";
                    this.metricInfoText = "This metric provides insights into your property's performance.";
            }
            this.showingMetricInfo = true;
        },

        closeMetricInfo() {
            this.showingMetricInfo = false;
        },

        // Add methods for chart information
        showChartInfo(chartType) {
            if (this.chartInfo[chartType]) {
                this.chartInfoTitle = this.chartInfo[chartType].title;
                this.chartInfoText = this.chartInfo[chartType].text;
                this.showingChartInfo = true;
            }
        },

        closeChartInfo() {
            this.showingChartInfo = false;
        },

        // Add method for explaining chart content
        explainChartContent(chartType) {
            this.explanationTitle = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Analysis`;
            
            switch(chartType) {
                case 'sales':
                    this.explanationText = `The sales data shows your sales performance over time. Based on the current trends, your property is ${this.salesData.metrics.monthlyGrowth > 0 ? 'growing' : 'experiencing some challenges'} compared to last month.`;
                    break;
                case 'occupancy':
                    const rate = parseFloat(this.stats.occupancyRate);
                    this.explanationText = `Your current occupancy rate is ${rate}%. ${rate > 70 ? 'This is a healthy occupancy level.' : 'There may be opportunity to increase bookings.'}`;
                    break;
                case 'rooms':
                    this.explanationText = 'The room distribution chart shows the breakdown of your property by room type. This helps identify which room types are most common in your inventory.';
                    break;
                case 'bookings':
                    this.explanationText = 'The booking trends chart shows patterns in reservation activity. Understanding these patterns can help with staffing and resource planning.';
                    break;
                default:
                    this.explanationText = 'This chart provides visualization of your property data.';
            }
            
            this.showingExplanation = true;
        },

        closeExplanation() {
            this.showingExplanation = false;
        },

        // Close metrics explanation modal
        closeMetricsExplanation() {
            this.showingMetricsExplanation = false;
        },

        // Add method to handle chart interactions
        setupChartInteractions() {
            const charts = [
                { instance: this.revenueChart, container: document.querySelector('.sales-chart') },
                { instance: this.occupancyChart, container: document.querySelector('.occupancy-chart') },
                { instance: this.roomTypeChart, container: document.querySelector('.room-type-chart') },
                { instance: this.bookingTrendsChart, container: document.querySelector('.booking-trend-chart') }
            ];

            // Remove any active class from all charts
            const removeActiveClass = () => {
                charts.forEach(chart => {
                    if (chart.container) {
                        chart.container.classList.remove('active');
                    }
                });
            };

            // Add click handlers for each chart
            charts.forEach(chart => {
                if (chart.instance && chart.container) {
                    const canvas = chart.container.querySelector('canvas');
                    
                    if (canvas) {
                        // Add click handler for the chart container to add active class
                        chart.container.addEventListener('click', () => {
                            removeActiveClass();
                            chart.container.classList.add('active');
                        });

                        // Add hover enter/leave for container
                        chart.container.addEventListener('mouseenter', () => {
                            canvas.style.opacity = '1';
                        });

                        chart.container.addEventListener('mouseleave', () => {
                            canvas.style.opacity = '0.95';
                            // Optional: remove active class on mouse leave
                            // chart.container.classList.remove('active');
                        });

                        // Optional: Click handler for canvas to show detailed view
                        canvas.addEventListener('click', (event) => {
                            const points = chart.instance.getElementsAtEventForMode(
                                event, 
                                'nearest', 
                                { intersect: true }, 
                                false
                            );
                            
                            if (points.length) {
                                const firstPoint = points[0];
                                const datasetIndex = firstPoint.datasetIndex;
                                const index = firstPoint.index;
                                
                                // Get the clicked data
                                const label = chart.instance.data.labels[index];
                                const value = chart.instance.data.datasets[datasetIndex].data[index];
                                
                                console.log(`Clicked on ${label}: ${value}`);
                                
                                // You could show a modal with detailed info about this data point
                                // or trigger an animation, etc.
                                
                                // Example: highlighting the clicked point by modifying its properties
                                const dataset = chart.instance.data.datasets[datasetIndex];
                                
                                // Reset all points to normal size
                                if (dataset.pointRadius) {
                                    dataset.pointRadius = dataset.pointRadius.map(() => 3);
                                } else {
                                    dataset.pointRadius = Array(dataset.data.length).fill(3);
                                }
                                
                                // Highlight the clicked point
                                dataset.pointRadius[index] = 8;
                                dataset.pointBackgroundColor = Array(dataset.data.length).fill(dataset.borderColor);
                                dataset.pointBackgroundColor[index] = '#ff6384';
                                
                                chart.instance.update();
                            }
                        });
                    }
                }
            });
        },
    },
    mounted() {
        // Initialize chart interactions after the app is mounted
        this.$nextTick(() => {
            // Wait a bit to ensure charts are fully initialized
            setTimeout(() => {
                if (this.isInitialized) {
                    this.setupChartInteractions();
                }
            }, 1000);
        });
    },
    watch: {
        // Watch for isInitialized changes to set up interactions
        isInitialized(newVal) {
            if (newVal === true) {
                // Wait a bit to ensure charts are fully rendered
                setTimeout(() => {
                    this.setupChartInteractions();
                }, 500);
            }
        }
    }
});
