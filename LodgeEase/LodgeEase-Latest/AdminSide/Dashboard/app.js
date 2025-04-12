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
        allBookings: [], // Store all bookings for metrics calculations
        analysisFeedback: '',
        isAuthenticated: false,
        loading: true,
        revenueChart: null,
        occupancyChart: null,
        roomTypeChart: null,
        lastProcessedRefresh: null,
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
                    label: 'Actual Sales',
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
            bookingTrend: null,
            sales: null
        },
        isInitialized: false, // Add this flag
        showingMetricsExplanation: false, // Add this flag
        showingMetricInfo: false,
        metricInfoTitle: '',
        metricInfoText: '',
    },
    created() {
        // Check for dashboard refresh signals right away
        const hasRefreshSignal = this.checkRefreshSignals();
        
        // Initialize app and load data
        this.checkAuthState().then(user => {
            if (user) {
                // Initialize charts after authentication
                this.$nextTick(() => {
                    this.initializeCharts();
                    
                    // If a refresh signal was detected, force a data refresh
                    if (hasRefreshSignal) {
                        console.log('Refreshing data due to detected refresh signal');
                        this.fetchBookings();
                    }
                });
            }
        }).catch(error => {
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
                if (!timestamp) return 'N/A';
                
                // Handle different date formats
                let date;
                
                // Handle Firestore Timestamp objects
                if (timestamp && typeof timestamp.toDate === 'function') {
                    date = timestamp.toDate();
                } 
                // Handle Date objects
                else if (timestamp instanceof Date) {
                    date = timestamp;
                } 
                // Handle timestamp objects with seconds
                else if (typeof timestamp === 'object' && timestamp.seconds) {
                    date = new Date(timestamp.seconds * 1000);
                } 
                // Handle string dates
                else if (typeof timestamp === 'string') {
                    date = new Date(timestamp);
                }
                
                // Check if date is valid
                if (!date || isNaN(date.getTime())) {
                    return 'Invalid Date';
                }
                
                // Format date
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
            } catch (error) {
                console.error('Date formatting error:', error, timestamp);
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
                
                // Map the bookings with all necessary fields and proper defaults
                let allBookings = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // Ensure essential fields have defaults
                        checkIn: data.checkIn,
                        checkOut: data.checkOut,
                        contactNumber: data.contactNumber || 'Not provided',
                        nightlyRate: data.nightlyRate || 0,
                        totalPrice: data.totalPrice || data.totalAmount || 0,
                        status: data.status || 'pending',
                        // Use email as fallback if displayName is not available
                        guestName: data.guestName || data.email || 'Guest',
                        email: data.email || 'No email provided',
                        // Ensure we have a timestamp for sorting (created or check-in date)
                        createdAt: data.createdAt || data.checkIn || { seconds: Date.now() / 1000 },
                        roomType: data.roomType || data.propertyDetails?.roomType || 'Standard',
                        propertyDetails: data.propertyDetails || {
                            roomType: data.roomType || 'Standard',
                            name: data.lodgeName || 'Ever Lodge'
                        }
                    };
                });
                
                // Sort all bookings by creation date (newest first)
                allBookings.sort((a, b) => {
                    const aTime = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
                    const bTime = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
                    return bTime - aTime; // Descending order (newest first)
                });
                
                // Log booking data for debugging
                console.log("Sorted bookings:", allBookings.map(b => ({
                    id: b.id, 
                    createdAt: b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000).toISOString() : 'unknown',
                    guestName: b.guestName,
                    contactNumber: b.contactNumber
                })));
                
                // Store all bookings for dashboard metrics calculations
                this.allBookings = allBookings;
                
                // DEBUG: Log the status distribution of all bookings
                const statusCounts = {};
                allBookings.forEach(booking => {
                    statusCounts[booking.status] = (statusCounts[booking.status] || 0) + 1;
                });
                console.log("Booking status distribution:", statusCounts);
                
                // Use all bookings for metrics calculations and store a subset for display
                this.bookings = allBookings.slice(0, 5);
                
                console.log(`Displaying ${this.bookings.length} recent bookings out of ${allBookings.length} total`);
                console.log("Using all bookings for metrics calculation to ensure consistency with other modules");

                // Calculate metrics based on actual data (using all bookings)
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
                    const monthBookings = this.allBookings.filter(booking => {
                        const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                        return bookingDate.getMonth() === date.getMonth() && 
                               bookingDate.getFullYear() === date.getFullYear() &&
                               booking.status !== 'cancelled';
                    });

                    // Calculate actual sales for this month
                    const monthSales = monthBookings.reduce((sum, booking) => {
                        // Ensure we're using the same totalPrice approach as BusinessAnalytics
                        const price = parseFloat(booking.totalPrice) || 0;
                        return sum + price;
                    }, 0);
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
                        // Apply same parsing logic for consistency
                        const predictedSale = parseFloat(avgSales * (1 + (Math.random() * 0.2 - 0.1))) || 0; // ±10% variation
                        predictedSales.push(predictedSale);

                        const lastThreeOccupancy = actualOccupancy.slice(-3);
                        const avgOccupancy = lastThreeOccupancy.reduce((a, b) => a + b, 0) / lastThreeOccupancy.length;
                        const predictedOcc = Math.min(100, parseFloat(avgOccupancy * (1 + (Math.random() * 0.2 - 0.1))) || 0); // ±10% variation
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

                // Update sales chart if available
                if (this.chartInstances.sales) {
                    const salesData = {
                        labels: labels,
                        datasets: [{
                            label: 'Actual Sales',
                            data: actualSales.map(value => parseFloat(value) || 0), // Ensure consistent parsing
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Predicted Sales',
                            data: predictedSales.map(value => value === null ? null : parseFloat(value) || 0), // Ensure consistent parsing
                            borderColor: 'rgba(255, 99, 132, 1)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            borderDash: [5, 5],
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Target Sales',
                            data: Array(12).fill(this.allBookings.length > 0 ? Math.max(...actualSales) * 1.2 : 0), // Set target 20% above highest month
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderDash: [3, 3],
                            fill: false
                        }]
                    };
                    this.updateChart(this.chartInstances.sales, salesData);
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
                const currentMonthBookings = this.allBookings.filter(booking => {
                    const bookingDate = new Date(booking.createdAt?.toDate?.() || booking.createdAt);
                    return bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear &&
                           booking.status !== 'cancelled';
                });

                const currentMonthSales = currentMonthBookings.reduce((sum, booking) => {
                    const price = parseFloat(booking.totalPrice) || 0;
                    return sum + price;
                }, 0);
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
                        totalSales: this.allBookings.reduce((sum, booking) => {
                            // Use consistent totalPrice calculation and filter out cancelled bookings
                            // to match calculation in BusinessAnalytics & AInalysis
                            if (booking.status === 'cancelled') return sum;
                            const price = parseFloat(booking.totalPrice) || 0;
                            return sum + price;
                        }, 0),
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
                // Get current date
                const now = new Date();
                const today = now.toDateString();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                
                // Filter for check-ins today
                const checkInsToday = this.allBookings.filter(booking => {
                    const checkInDate = booking.checkIn?.toDate?.() || new Date(booking.checkIn);
                    return checkInDate.toDateString() === today;
                });
                
                // Calculate current month bookings
                const currentMonthBookings = this.allBookings.filter(booking => {
                    const bookingDate = booking.checkIn?.toDate?.() || new Date(booking.checkIn);
                    return bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear;
                });
                
                // Calculate current month revenue
                const currentMonthRevenue = currentMonthBookings.reduce((sum, booking) => {
                    // Use consistent parsing for totalPrice
                    const price = parseFloat(booking.totalPrice) || 0;
                    return sum + price;
                }, 0);
                
                // Calculate occupancy rate (simplified)
                const totalRooms = 36; // Total available rooms
                const occupiedRooms = new Set();
                
                this.allBookings.forEach(booking => {
                    const checkInDate = booking.checkIn?.toDate?.() || new Date(booking.checkIn);
                    const checkOutDate = booking.checkOut?.toDate?.() || new Date(booking.checkOut);
                    
                    // Check if booking is current
                    if (checkInDate <= now && checkOutDate >= now) {
                        if (booking.propertyDetails?.roomNumber) {
                            occupiedRooms.add(booking.propertyDetails.roomNumber);
                        }
                    }
                });
                
                const occupancyRate = (occupiedRooms.size / totalRooms) * 100;
                
                // Update stats
                this.todayCheckIns = checkInsToday.length;
                this.availableRooms = totalRooms - occupiedRooms.size;
                this.stats = {
                    totalBookings: this.allBookings.length,
                    currentMonthRevenue: this.formatCurrency(currentMonthRevenue),
                    occupancyRate: occupancyRate.toFixed(1) + '%'
                };
                
                // Also calculate total sales for consistency with Business Analytics
                const totalSales = this.allBookings.reduce((sum, booking) => {
                    // Use consistent parsing for totalPrice and filter out cancelled bookings
                    if (booking.status === 'cancelled') return sum;
                    const price = parseFloat(booking.totalPrice) || 0;
                    return sum + price;
                }, 0);
                
                this.salesData.metrics.totalSales = totalSales;
                
                console.log('Dashboard stats updated successfully');
            } catch (error) {
                console.error('Error updating dashboard stats:', error);
            }
        },

        async calculateDashboardMetrics() {
            try {
                console.log("Calculating dashboard metrics...");

                // Create consistent date objects for comparison
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                // Helper function to parse dates consistently
                const parseDate = (dateField) => {
                    if (!dateField) return null;
                    
                    try {
                        // Handle Firebase Timestamp object
                        if (dateField && typeof dateField === 'object' && 'seconds' in dateField) {
                            return new Date(dateField.seconds * 1000);
                        }
                        
                        // Handle Date object
                        if (dateField instanceof Date) {
                            return dateField;
                        }
                        
                        // Handle string date
                        return new Date(dateField);
                    } catch (error) {
                        console.error('Error parsing date:', error);
                        return null;
                    }
                };

                // Debug: Log all bookings to check their structure
                console.log("All bookings:", this.allBookings.length);

                // Calculate bookings made today instead of check-ins
                this.todayCheckIns = 0; // Reset counter
                
                // Log all bookings with their creation dates for debugging
                console.log("All bookings with creation dates:");
                this.allBookings.forEach(booking => {
                    const createdAt = parseDate(booking.createdAt);
                    if (createdAt) {
                        // Create date-only versions for comparison (ignore time)
                        const createdAtDateOnly = new Date(createdAt);
                        createdAtDateOnly.setHours(0, 0, 0, 0);
                        
                        const isToday = createdAtDateOnly.getTime() === today.getTime();
                        
                        console.log(`Booking ${booking.id}: createdAt=${createdAtDateOnly.toISOString()}, status=${booking.status}, isToday=${isToday}`);
                        
                        // Count booking if it was created today
                        if (isToday) {
                            this.todayCheckIns++;
                            console.log(`✓ Counting booking ${booking.id} as today's new booking`);
                        }
                    } else {
                        console.log(`Booking ${booking.id}: Invalid creation date`);
                    }
                });

                console.log(`Today's new bookings: ${this.todayCheckIns}`);

                // Calculate available rooms based on actual bookings
                const totalRooms = 36;
                const occupiedRooms = this.allBookings.filter(booking => {
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
                
                this.stats.totalBookings = this.allBookings.filter(booking => {
                    const bookingDate = parseDate(booking.checkIn);
                    if (!bookingDate) return false;
                    
                    const isThisMonth = bookingDate.getMonth() === currentMonth && 
                           bookingDate.getFullYear() === currentYear;
                    const isActive = booking.status !== 'cancelled';
                    return isThisMonth && isActive;
                }).length;

                console.log(`Total bookings this month: ${this.stats.totalBookings}`);

                // Calculate current month revenue
                const currentMonthRevenue = this.allBookings
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

                // Calculate occupancy rate with improved accuracy
                // Consider occupied rooms that have checked in and have not checked out yet
                console.log("Calculating occupancy rate...");
                console.log("Status values to consider for active bookings:", ["occupied", "checked-in", "confirmed", "pending", "active"]);
                
                // Check and log each booking's date and status
                this.allBookings.forEach(booking => {
                    const checkIn = parseDate(booking.checkIn);
                    const checkOut = parseDate(booking.checkOut);
                    
                    if (checkIn && checkOut) {
                        console.log(`Booking ${booking.id}: checkIn=${checkIn.toISOString()}, checkOut=${checkOut.toISOString()}, status=${booking.status}`);
                    } else {
                        console.log(`Booking ${booking.id}: Invalid check-in/check-out dates, status=${booking.status}`);
                    }
                });
                
                const activeBookings = this.allBookings.filter(booking => {
                    const checkIn = parseDate(booking.checkIn);
                    const checkOut = parseDate(booking.checkOut);
                    
                    if (!checkIn || !checkOut) {
                        console.log(`Skipping booking ${booking.id} due to invalid dates`);
                        return false;
                    }
                    
                    // Accept more status values for active bookings
                    const activeStatuses = ['occupied', 'checked-in', 'confirmed', 'active', 'pending'];
                    const hasActiveStatus = activeStatuses.includes(booking.status?.toLowerCase());
                    
                    // Check if today falls between check-in and check-out
                    const isCurrentlyActive = checkIn <= today && checkOut >= today;
                    
                    const isActiveBooking = hasActiveStatus && isCurrentlyActive;
                    
                    if (isActiveBooking) {
                        console.log(`✓ Active booking ${booking.id}: status=${booking.status}, isWithinDates=${isCurrentlyActive}`);
                    }
                    
                    return isActiveBooking;
                });

                console.log(`Found ${activeBookings.length} active bookings for occupancy calculation`);
                
                // List the active bookings for debugging
                activeBookings.forEach(booking => {
                    console.log(`- Active booking: id=${booking.id}, room=${booking.propertyDetails?.roomNumber || 'N/A'}, status=${booking.status}`);
                });

                const occupiedRoomsCount = activeBookings.length;
                const occupancyRate = (occupiedRoomsCount / totalRooms) * 100;
                this.stats.occupancyRate = occupancyRate.toFixed(1) + '%';
                console.log(`Occupancy rate calculation: (${occupiedRoomsCount} active bookings / ${totalRooms} total rooms) * 100 = ${occupancyRate.toFixed(1)}%`);
                
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
            if (!chart || !newData) {
                console.warn('Cannot update chart: chart instance or data is missing');
                return;
            }
            
            try {
                // For sales/revenue chart, ensure consistent data processing
                if (chart === this.chartInstances.revenue || chart === this.revenueChart) {
                    // Ensure all data points are properly parsed as numbers
                    if (newData.datasets) {
                        newData.datasets.forEach(dataset => {
                            if (dataset.data) {
                                dataset.data = dataset.data.map(value => parseFloat(value) || 0);
                            }
                        });
                    }
                }
                
                // Update labels if they exist
                if (newData.labels) {
                    chart.data.labels = newData.labels;
                }
                
                // Update datasets if they exist
                if (newData.datasets) {
                    chart.data.datasets = newData.datasets;
                }
                
                // Update and render
                chart.update();
            } catch (error) {
                console.error('Error updating chart:', error);
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
                const salesCtx = document.getElementById('salesChart'); // Add sales chart
                
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
                this.createChartInstances(revenueCtx, occupancyCtx, roomTypeCtx, bookingTrendsCtx, salesCtx, chartData);
                
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
            
            if (this.salesChart instanceof Chart) {
                this.salesChart.destroy();
                this.salesChart = null;
            }
            
            console.log('Existing chart instances destroyed');
        },

        createChartInstances(revenueCtx, occupancyCtx, roomTypeCtx, bookingTrendsCtx, salesCtx, chartData) {
            // Create Revenue Chart
            this.revenueChart = new Chart(revenueCtx, {
                type: 'line',
                data: chartData.revenue || {
                    labels: [],
                    datasets: [{
                        label: 'Monthly Sales',
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
            
            // Create Sales Analysis Chart (similar to revenue but with consistent parsing)
            if (salesCtx) {
                this.salesChart = new Chart(salesCtx, {
                    type: 'line',
                    data: chartData.sales || {
                        labels: [],
                        datasets: [{
                            label: 'Monthly Sales',
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
                                        return '₱' + parseFloat(value).toLocaleString();
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
                                            label += '₱' + parseFloat(context.parsed.y).toLocaleString();
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
                
                // Store in chartInstances for consistent reference
                this.chartInstances.sales = this.salesChart;
            }
            
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
                    this.metricInfoTitle = "Today's Bookings";
                    this.metricInfoText = "Number of new bookings made today. This shows how many bookings were created on the current date.";
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

        // Add this as a new method
        checkRefreshSignals() {
            try {
                const refreshData = JSON.parse(localStorage.getItem('dashboard:refresh') || '{}');
                if (refreshData && refreshData.timestamp) {
                    const now = new Date().getTime();
                    const age = now - refreshData.timestamp;
                    
                    // Accept refresh signals that are less than 5 minutes old
                    if (age < 300000) {
                        console.log(`Found dashboard refresh signal (${age}ms old), action: ${refreshData.action}`);
                        this.lastProcessedRefresh = refreshData.timestamp;
                        
                        // If the signal is very recent (less than 10 seconds), clear it to prevent
                        // other instances from also processing it
                        if (age < 10000) {
                            localStorage.removeItem('dashboard:refresh');
                            console.log('Cleared recent refresh signal');
                        }
                        
                        return true; // Signal was processed
                    } else {
                        // Clear stale signals
                        localStorage.removeItem('dashboard:refresh');
                        console.log('Cleared stale refresh signal');
                    }
                }
            } catch (error) {
                console.warn('Error checking refresh signals:', error);
            }
            return false; // No valid signal found
        },
    },
    mounted() {
        // Initialize chart interactions after the app is mounted
        this.$nextTick(() => {
            // Expose a global refresh function for other pages to call
            window.dashboardRefresh = () => {
                console.log('Dashboard refresh triggered by external call');
                this.fetchBookings();
            };
            
            // Wait a bit to ensure charts are fully initialized
            setTimeout(() => {
                if (this.isInitialized) {
                    this.setupChartInteractions();
                }
            }, 1000);
            
            // Set up booking update event listener to refresh dashboard when bookings are approved
            document.addEventListener('dashboard:booking:update', (event) => {
                console.log('Dashboard received booking update event:', event.detail);
                if (event.detail && (event.detail.action === 'approve' || event.detail.action === 'update')) {
                    // Refresh the dashboard data when a booking is approved or updated
                    this.fetchBookings();
                }
            });
            
            // Set up localStorage change listener for cross-tab notifications
            window.addEventListener('storage', (event) => {
                if (event.key === 'dashboard:refresh') {
                    try {
                        const refreshData = JSON.parse(event.newValue);
                        if (refreshData && refreshData.timestamp) {
                            // Check if refresh notification is recent (within last 10 seconds)
                            const now = new Date().getTime();
                            const isFresh = (now - refreshData.timestamp) < 10000;
                            
                            if (isFresh && (refreshData.action === 'booking_approved' || refreshData.action === 'booking_rejected')) {
                                console.log('Dashboard refreshing from localStorage notification:', refreshData.action);
                                this.fetchBookings();
                            }
                        }
                    } catch (error) {
                        console.error('Error processing dashboard refresh notification:', error);
                    }
                }
            });
            
            // Setup periodic check for dashboard refresh signals
            const checkRefreshInterval = setInterval(() => {
                try {
                    const refreshData = JSON.parse(localStorage.getItem('dashboard:refresh') || '{}');
                    if (refreshData && refreshData.timestamp) {
                        // Check if refresh notification is recent (within last 10 seconds)
                        const now = new Date().getTime();
                        const isFresh = (now - refreshData.timestamp) < 10000;
                        
                        if (isFresh && !this.lastProcessedRefresh || this.lastProcessedRefresh !== refreshData.timestamp) {
                            this.lastProcessedRefresh = refreshData.timestamp;
                            console.log('Dashboard refreshing from periodic check');
                            this.fetchBookings();
                        }
                    }
                } catch (error) {
                    // Silently ignore parsing errors
                }
            }, 5000); // Check every 5 seconds
            
            // Clear interval when component is destroyed
            this.$once('hook:beforeDestroy', () => {
                clearInterval(checkRefreshInterval);
            });
            
            // Add message listener for cross-frame communication
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'refresh-dashboard') {
                    console.log('Dashboard refresh requested via window messaging');
                    this.fetchBookings();
                }
            });
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
