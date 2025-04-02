// Import Firebase modules
import { db, auth } from '../firebase.js';
import { collection, getDocs, query, orderBy, limit, doc, deleteDoc, updateDoc, Timestamp, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getChartData } from './chartData.js';

// Vue app for the dashboard
new Vue({
    el: '#app',
    data: {
        todayCheckIns: 0,
        availableRooms: 10,
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
        // Add salesViewMode and salesData
        salesViewMode: 'monthly',
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
        // Remove this line
        // baguioWebChart: null,
        // Add new data properties for revenue and occupancy
        revenueViewMode: 'monthly',
        occupancyViewMode: 'monthly',
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
                }],
                roomType: [],
                payment: []
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
                text: 'The doughnut chart shows the distribution of room types and their relative occupancy. Each segment represents a different room type, with the size indicating the proportion of rooms. Hover over segments to see detailed statistics including revenue generation per room type.'
            },
            sales: {
                title: 'Sales Analysis Chart',
                text: 'The sales analysis chart provides a comprehensive view of your revenue performance. It shows actual sales data (blue line) and predicted future sales (orange dashed line). The chart helps identify sales patterns, growth trends, and potential revenue opportunities. The target line (purple dashed) indicates your revenue goals. Use this chart to track performance against targets and make data-driven decisions about pricing and marketing strategies.'
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
                Occupancy Rate: ${((occupiedBookings / 10) * 100).toFixed(1)}%
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
                if (!db) {
                    throw new Error('Firestore instance not initialized');
                }
                
                const bookingsRef = collection(db, 'bookings');
                if (!bookingsRef) {
                    throw new Error('Failed to create bookings collection reference');
                }
                
                // First get all bookings ordered by creation date
                const q = query(bookingsRef, orderBy('createdAt', 'desc'));
                const querySnapshot = await getDocs(q);
                
                // Filter Ever Lodge bookings in memory
                this.bookings = querySnapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        // Only include if it's an Ever Lodge booking
                        if (data.propertyDetails?.name !== 'Ever Lodge') {
                            return null;
                        }
                        
                        // Ensure price is a valid number with explicit fallback to 0
                        const totalPrice = parseFloat(data.totalPrice) || parseFloat(data.totalAmount) || 0;
                        
                        return {
                            id: doc.id,
                            propertyDetails: {
                                roomNumber: data.propertyDetails?.roomNumber || data.roomNumber || 'N/A',
                                roomType: data.propertyDetails?.roomType || data.roomType || 'N/A'
                            },
                            floorLevel: data.floorLevel || 'N/A',
                            guestName: data.guestName || 'Guest',
                            checkIn: data.checkIn,
                            checkOut: data.checkOut,
                            status: data.status || 'pending',
                            totalAmount: totalPrice,
                            totalPrice: totalPrice,
                            createdAt: data.createdAt
                        };
                    })
                    .filter(booking => booking !== null); // Remove null entries

                console.log('Total Ever Lodge bookings fetched:', this.bookings.length);
                
                // Calculate sales metrics
                await this.calculateSalesMetrics();
                
                // Immediately calculate key metrics after fetching bookings
                await this.calculateDashboardMetrics();
            } catch (error) {
                console.error('Error fetching bookings:', error);
                throw error;
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
                    this.isInitialized = true;
                }
        
                const data = await getChartData();
                if (!data) {
                    console.error('No data received from getChartData');
                    return;
                }
                
                // Create default data structure for each chart
                const defaultChartData = {
                    labels: [],
                    datasets: [{
                        label: 'No Data',
                        data: [],
                        borderColor: 'rgba(200, 200, 200, 1)',
                        backgroundColor: 'rgba(200, 200, 200, 0.2)'
                    }]
                };
        
                // Update charts with data validation
                Object.entries(this.chartInstances).forEach(([type, chart]) => {
                    if (chart && data[`${type}Data`]) {
                        this.updateChart(chart, data[`${type}Data`]);
                    }
                });
                
                // Specifically handle bookingTrend chart if not updated by the above
                if (this.chartInstances.bookingTrend && !data.bookingTrendData) {
                    // Generate booking trend data from bookings if not provided
                    const bookingTrendData = this.generateBookingTrendData(this.bookings);
                    this.updateChart(this.chartInstances.bookingTrend, bookingTrendData);
                }
                
                // Update the revenueData property 
                if (data.revenueData) {
                    this.revenueData = {
                        ...this.revenueData,
                        labels: data.revenueData.labels || [],
                        datasets: data.revenueData.datasets || this.revenueData.datasets,
                        metrics: {
                            totalRevenue: data.revenueData.metrics?.totalRevenue || 0,
                            currentMonthRevenue: data.revenueData.metrics?.currentMonthRevenue || 0,
                            previousMonthRevenue: data.revenueData.metrics?.previousMonthRevenue || 0,
                            monthlyGrowth: data.revenueData.metrics?.monthlyGrowth || 0,
                            yearOverYearGrowth: data.revenueData.metrics?.yearOverYearGrowth || 0,
                            forecast: data.revenueData.metrics?.forecast || []
                        }
                    };
                    console.log('Updated revenueData:', this.revenueData);
                }
                
                // Improved metrics handling with better parsing and validation
                const metrics = data.metrics || {};
                // Update other stats with proper parsing and formatting
                this.stats = {
                    totalBookings: parseInt(metrics.totalBookings || 0, 10),
                    currentMonthRevenue: this.formatCurrency(parseFloat(metrics.currentMonthRevenue || 0)),
                    occupancyRate: parseFloat(metrics.occupancyRate || 0).toFixed(1)
                };
                
            } catch (error) {
                console.error('Error updating dashboard:', error);
                // Fallback values...
            }
        },

        calculateDashboardMetrics() {
            try {
                if (!this.bookings || !Array.isArray(this.bookings)) {
                    console.warn('No bookings data available for metrics calculation');
                    return;
                }
                
                // Get current date for calculations
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                
                // Create a clean date object for today (date only, no time)
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                today.setHours(0, 0, 0, 0); // Ensure hours are explicitly set to 0
                
                console.log('Current date for check-ins:', today);
                
                // Reset the count
                this.todayCheckIns = 0;
                
                // Track processed bookings for debugging
                let processedBookings = 0;
                
                // Count check-ins with improved logging
                for (const booking of this.bookings) {
                    try {
                        processedBookings++;
                        if (!booking.checkIn) continue;
                        
                        // Extract date and normalize it
                        let checkInDate;
                        if (booking.checkIn.toDate && typeof booking.checkIn.toDate === 'function') {
                            checkInDate = booking.checkIn.toDate();
                        } else if (booking.checkIn instanceof Date) {
                            checkInDate = booking.checkIn;
                        } else if (typeof booking.checkIn === 'string') {
                            checkInDate = new Date(booking.checkIn);
                        } else {
                            continue;
                        }
                        
                        // Create date object with only date components (no time)
                        const checkInDateOnly = new Date(
                            checkInDate.getFullYear(),
                            checkInDate.getMonth(), 
                            checkInDate.getDate()
                        );
                        checkInDateOnly.setHours(0, 0, 0, 0);
                        
                        // Check if dates match (using getTime() for accurate comparison)
                        const isCheckInToday = checkInDateOnly.getTime() === today.getTime();
                        
                        // Include all non-cancelled bookings (broader status check)
                        const validStatus = booking.status && 
                            !['cancelled', 'completed'].includes(booking.status.toLowerCase());
                        
                        if (isCheckInToday && validStatus) {
                            console.log(`Found check-in for today: ${booking.guestName}, Status: ${booking.status}`);
                            this.todayCheckIns++;
                        }
                    } catch (err) {
                        console.error('Error processing check-in date:', err, booking);
                    }
                }
                
                console.log(`Processed ${processedBookings} bookings, found ${this.todayCheckIns} check-ins for today`);
                
                // Calculate available rooms and occupancy rate
                const totalRooms = 10; // Total room count
                
                // Count active bookings more accurately
                const activeBookings = this.bookings.filter(booking => {
                    try {
                        if (!booking.checkIn || !booking.checkOut) return false;
                        
                        let checkInDate, checkOutDate;
                        // Convert checkIn to Date object
                        if (booking.checkIn.toDate && typeof booking.checkIn.toDate === 'function') {
                            checkInDate = booking.checkIn.toDate();
                        } else if (booking.checkIn instanceof Date) {
                            checkInDate = booking.checkIn;
                        } else if (typeof booking.checkIn === 'string') {
                            checkInDate = new Date(booking.checkIn);
                        } else {
                            return false;
                        }
                        
                        // Convert checkOut to Date object
                        if (booking.checkOut.toDate && typeof booking.checkOut.toDate === 'function') {
                            checkOutDate = booking.checkOut.toDate();
                        } else if (booking.checkOut instanceof Date) {
                            checkOutDate = booking.checkOut;
                        } else if (typeof booking.checkOut === 'string') {
                            checkOutDate = new Date(booking.checkOut);
                        } else {
                            return false;
                        }
                        
                        // Check if the booking is currently active
                        return checkInDate <= now && checkOutDate >= now && 
                            booking.status && booking.status.toLowerCase() !== 'cancelled';
                    } catch (err) {
                        console.error('Error processing booking dates:', err, booking);
                        return false;
                    }
                });
                
                const occupiedRooms = activeBookings.length;
                this.availableRooms = Math.max(0, totalRooms - occupiedRooms);
                
                // Calculate occupancy rate
                const occupancyRate = (occupiedRooms / totalRooms) * 100;
                
                // Calculate total bookings this month (improved calculation)
                const currentMonthBookings = this.bookings.filter(booking => {
                    try {
                        if (!booking.checkIn) return false;
                        
                        let checkInDate;
                        if (booking.checkIn.toDate && typeof booking.checkIn.toDate === 'function') {
                            checkInDate = booking.checkIn.toDate();
                        } else if (booking.checkIn instanceof Date) {
                            checkInDate = booking.checkIn;
                        } else if (typeof booking.checkIn === 'string') {
                            checkInDate = new Date(booking.checkIn);
                        } else {
                            return false;
                        }
                        
                        return (
                            checkInDate.getMonth() === currentMonth &&
                            checkInDate.getFullYear() === currentYear
                        );
                    } catch (err) {
                        console.error('Error processing monthly check-in date:', err);
                        return false;
                    }
                });
                
                // Calculate monthly revenue
                const currentMonthRevenue = currentMonthBookings.reduce((sum, booking) => {
                    const amount = parseFloat(booking.totalAmount || booking.totalPrice || 0);
                    return sum + (isNaN(amount) ? 0 : amount);
                }, 0);
                
                // Update stats immediately
                this.$set(this, 'stats', {
                    totalBookings: currentMonthBookings.length,
                    currentMonthRevenue: this.formatCurrency(currentMonthRevenue),
                    occupancyRate: occupancyRate.toFixed(1)
                });
                
                console.log('Dashboard metrics calculated:', {
                    todayCheckIns: this.todayCheckIns,
                    availableRooms: this.availableRooms,
                    occupancyRate: occupancyRate.toFixed(1) + '%',
                    totalBookings: currentMonthBookings.length,
                    activeBookings: occupiedRooms
                });

                // Initialize charts if not already done
                if (!this.isInitialized) {
                    this.initializeCharts();
                }
                
                // Force Vue to re-render the cards by "touching" the reactive properties
                this.todayCheckIns = this.todayCheckIns;
                this.availableRooms = this.availableRooms;
                this.stats = { ...this.stats };
                
            } catch (error) {
                console.error('Error calculating dashboard metrics:', error);
                // Set fallback values
                this.stats = {
                    totalBookings: 0,
                    currentMonthRevenue: this.formatCurrency(0),
                    occupancyRate: '0.0'
                };
                this.todayCheckIns = 0;
                this.availableRooms = 10;
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
            if (this.isInitialized) {
                console.log('Charts already initialized');
                return;
            }

            this.chartInitializationAttempted = true;

            try {
                // Ensure chart elements exist in DOM before initializing
                await this.$nextTick();
                
                // Create DOM element references
                const revenueCanvas = document.getElementById('revenueChart');
                const occupancyCanvas = document.getElementById('occupancyChart');
                const roomTypeCanvas = document.getElementById('roomTypeChart');
                const bookingTrendCanvas = document.getElementById('bookingTrendChart');

                // Check if all required canvas elements exist
                if (!revenueCanvas || !occupancyCanvas || !roomTypeCanvas || !bookingTrendCanvas) {
                    console.error('Chart canvas elements not found. Will retry on next update cycle.');
                    return; // Don't set isInitialized flag if elements aren't ready
                }

                // Check if Chart.js is available
                if (typeof Chart === 'undefined') {
                    console.error('Chart.js not loaded. Will retry on next update cycle.');
                    return;
                }

                // Initialize Revenue Chart (Sales Analysis)
                this.chartInstances.revenue = new Chart(revenueCanvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Actual Sales',
                            data: [],
                            borderColor: 'rgba(54, 162, 235, 1)',
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Predicted Sales',
                            data: [],
                            borderColor: 'rgba(255, 159, 64, 1)',
                            backgroundColor: 'rgba(255, 159, 64, 0.2)',
                            borderDash: [5, 5],
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        aspectRatio: 2,
                        interaction: {
                            mode: 'nearest',
                            intersect: false,
                            axis: 'x'
                        },
                        plugins: {
                            tooltip: {
                                enabled: true,
                                mode: 'nearest',
                                intersect: false,
                                position: 'nearest',
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: 'white',
                                titleFont: {
                                    size: 14,
                                    weight: 'bold',
                                    family: "'Roboto', sans-serif"
                                },
                                bodyColor: 'white',
                                bodyFont: {
                                    size: 13,
                                    family: "'Roboto', sans-serif"
                                },
                                padding: 12,
                                cornerRadius: 8,
                                displayColors: true,
                                callbacks: {
                                    label: function(context) {
                                        if (!context.parsed.y && context.parsed.y !== 0) return null;
                                        const label = context.dataset.label || '';
                                        const value = context.parsed.y;
                                        return `${label}: ${new Intl.NumberFormat('en-PH', {
                                            style: 'currency',
                                            currency: 'PHP'
                                        }).format(value)}`;
                                    }
                                }
                            },
                            legend: {
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    padding: 20,
                                    font: {
                                        family: "'Roboto', sans-serif"
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    maxRotation: 45,
                                    minRotation: 45,
                                    padding: 10,
                                    font: {
                                        family: "'Roboto', sans-serif"
                                    }
                                }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: value => '₱' + value.toLocaleString('en-PH'),
                                    padding: 10,
                                    font: {
                                        family: "'Roboto', sans-serif"
                                    }
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            }
                        },
                        layout: {
                            padding: {
                                top: 20,
                                right: 25,
                                bottom: 25,
                                left: 25
                            }
                        }
                    }
                });

                // Initialize Occupancy Chart
                this.chartInstances.occupancy = new Chart(occupancyCanvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Actual Occupancy',
                            data: [],
                            borderColor: 'rgba(255, 99, 132, 1)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Predicted Occupancy',
                            data: [],
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            borderDash: [5, 5],
                            fill: true,
                            tension: 0.4
                        }, {
                            label: 'Target Rate',
                            data: [],
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderDash: [3, 3],
                            fill: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        aspectRatio: 2,
                        interaction: {
                            mode: 'nearest',
                            intersect: false,
                            axis: 'x'
                        },
                        plugins: {
                            tooltip: {
                                enabled: true,
                                mode: 'nearest',
                                intersect: false,
                                position: 'nearest',
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: 'white',
                                titleFont: {
                                    size: 14,
                                    weight: 'bold',
                                    family: "'Roboto', sans-serif"
                                },
                                bodyColor: 'white',
                                bodyFont: {
                                    size: 13,
                                    family: "'Roboto', sans-serif"
                                },
                                padding: 12,
                                cornerRadius: 8,
                                displayColors: true,
                                callbacks: {
                                    label: function(context) {
                                        if (!context.parsed.y && context.parsed.y !== 0) return null;
                                        const label = context.dataset.label || '';
                                        return `${label}: ${context.parsed.y.toFixed(1)}%`;
                                    }
                                }
                            },
                            legend: {
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    padding: 20,
                                    font: {
                                        family: "'Roboto', sans-serif"
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    maxRotation: 45,
                                    minRotation: 45,
                                    padding: 10,
                                    font: {
                                        family: "'Roboto', sans-serif"
                                    }
                                }
                            },
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: {
                                    callback: value => value + '%',
                                    padding: 10,
                                    font: {
                                        family: "'Roboto', sans-serif"
                                    }
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            }
                        },
                        layout: {
                            padding: {
                                top: 20,
                                right: 25,
                                bottom: 25,
                                left: 25
                            }
                        }
                    }
                });

                // Initialize Room Type Chart
                this.chartInstances.roomType = new Chart(roomTypeCanvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: [],
                        datasets: [{
                            data: [],
                            backgroundColor: [
                                'rgba(255, 99, 132, 0.8)',
                                'rgba(54, 162, 235, 0.8)',
                                'rgba(255, 206, 86, 0.8)',
                                'rgba(75, 192, 192, 0.8)',
                                'rgba(153, 102, 255, 0.8)',
                            ],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });

                // Initialize Booking Trend Chart
                this.chartInstances.bookingTrend = new Chart(bookingTrendCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: [],
                        datasets: [
                            {
                                label: 'Actual Bookings',
                                type: 'bar',
                                data: [],
                                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                                borderColor: 'rgba(75, 192, 192, 1)',
                                borderWidth: 1,
                                order: 2
                            },
                            {
                                label: 'Predicted Bookings',
                                type: 'line',
                                data: [],
                                borderColor: 'rgba(255, 159, 64, 1)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                fill: false,
                                tension: 0.4,
                                order: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    stepSize: 1
                                }
                            }
                        },
                        plugins: {
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            }
                        }
                    }
                });

                this.isInitialized = true;
                console.log('Charts initialized successfully');

                // Generate initial data for the charts
                const bookingTrendData = this.generateBookingTrendData(this.bookings);
                this.updateChart(this.chartInstances.bookingTrend, bookingTrendData);

                // Update sales and occupancy charts with current data
                await this.updateDashboardStats();

            } catch (error) {
                console.error('Error initializing charts:', error);
                this.chartInitializationAttempted = false;
            }
        },

        async generateAIForecasts() {
            try {
                const historicalData = await this.fetchHistoricalBookings();
                
                if (!historicalData || historicalData.length === 0) {
                    console.warn('No historical data available');
                    return;
                }

                const bookingPatterns = await this.analyzeBookingPatterns(historicalData);
                const seasonalTrends = await this.analyzeSeasonality(historicalData);
                const demandIndicators = await this.analyzeDemandFactors(historicalData);

                const predictions = this.generatePredictions(bookingPatterns, seasonalTrends, demandIndicators);
                
                if (predictions) {
                    await this.savePredictionsToFirebase(predictions);
                    this.updateChartsWithPredictions(predictions);
                    this.generateInsights(predictions);
                    console.log('AI forecasts generated successfully');
                }
            } catch (error) {
                console.error('Error generating forecasts:', error);
            }
        },

        async fetchHistoricalBookings() {
            const bookingsRef = collection(db, 'bookings');
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const q = query(
                bookingsRef,
                where('checkIn', '>=', sixMonthsAgo),
                orderBy('checkIn', 'desc')
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        },

        async analyzeBookingPatterns(historicalData) {
            // Group bookings by date
            const bookingsByDate = historicalData.reduce((acc, booking) => {
                const date = this.formatDate(booking.checkIn);
                if (!acc[date]) acc[date] = [];
                acc[date].push(booking);
                return acc;
            }, {});

            // Calculate daily stats
            const dailyStats = Object.entries(bookingsByDate).map(([date, bookings]) => ({
                date,
                count: bookings.length,
                revenue: bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
                occupancyRate: (bookings.length / this.availableRooms) * 100
            }));

            return {
                dailyStats,
                averageOccupancy: this.calculateAverageFromStats(dailyStats, 'occupancyRate'),
                averageRevenue: this.calculateAverageFromStats(dailyStats, 'revenue'),
                trendLine: this.calculateTrendLine(dailyStats)
            };
        },

        async analyzeSeasonality(historicalData) {
            if (!Array.isArray(historicalData) || historicalData.length === 0) {
                console.warn('No historical data available for seasonality analysis');
                return [];
            }
            
            const monthlyData = historicalData.reduce((acc, booking) => {
                try {
                    if (!booking || !booking.checkIn) return acc;
                    
                    let checkInDate;
                    if (booking.checkIn instanceof Date) {
                        checkInDate = booking.checkIn;
                    } else if (booking.checkIn.toDate && typeof booking.checkIn.toDate === 'function') {
                        checkInDate = booking.checkIn.toDate();
                    } else if (typeof booking.checkIn === 'string') {
                        checkInDate = new Date(booking.checkIn);
                    } else {
                        console.warn('Invalid checkIn format:', booking.checkIn);
                        return acc;
                    }
                    
                    if (!isNaN(checkInDate.getTime())) {
                        const month = checkInDate.getMonth();
                        if (!acc[month]) {
                            acc[month] = {
                                bookings: 0,
                                revenue: 0,
                                occupancyRate: 0
                            };
                        }
                        acc[month].bookings++;
                        acc[month].revenue += parseFloat(booking.totalPrice || booking.totalAmount || 0);
                    }
                    return acc;
                } catch (error) {
                    console.error('Error processing booking for seasonality:', error, booking);
                    return acc;
                }
            }, {});
        
            for (let i = 0; i < 12; i++) {
                if (!monthlyData[i]) {
                    monthlyData[i] = {
                        bookings: 0,
                        revenue: 0,
                        occupancyRate: 0
                    };
                }
            }
        
            const totalBookings = Object.values(monthlyData).reduce((sum, data) => sum + data.bookings, 0);
            const averageBookingsPerMonth = totalBookings / 12 || 1;
            
            return Object.entries(monthlyData).map(([month, data]) => ({
                month: parseInt(month),
                seasonalIndex: data.bookings / averageBookingsPerMonth || 1,
                avgRevenue: data.bookings > 0 ? data.revenue / data.bookings : 0,
                occupancyRate: (data.bookings / (this.availableRooms * 30)) * 100
            }));
        },

        async savePredictionsToFirebase(predictions) {
            try {
                if (!predictions || !predictions.revenue || !predictions.occupancy) {
                    console.warn('Invalid predictions data - cannot save to Firebase');
                    return null;
                }
                
                const cleanPredictions = {
                    occupancy: predictions.occupancy.map(p => ({
                        date: p.date instanceof Date ? Timestamp.fromDate(p.date) : 
                              (typeof p.date === 'string' ? Timestamp.fromDate(new Date(p.date)) : Timestamp.now()),
                        rate: parseFloat(p.rate || 0)
                    })),
                    revenue: predictions.revenue.map(p => ({
                        date: p.date instanceof Date ? Timestamp.fromDate(p.date) : 
                              (typeof p.date === 'string' ? Timestamp.fromDate(new Date(p.date)) : Timestamp.now()),
                        amount: parseFloat(p.amount || 0)
                    }))
                };
        
                const predictionData = {
                    predictions: cleanPredictions,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    userId: auth.currentUser?.uid || 'system',
                    status: 'active'
                };
        
                const forecastRef = collection(db, 'forecasts');
                const docRef = await addDoc(forecastRef, predictionData);
                console.log('Predictions saved with ID:', docRef.id);
                return docRef.id;
            } catch (error) {
                console.error('Error saving predictions:', error);
                return null;
            }
        },

        calculateTrend(values) {
            if (!Array.isArray(values) || values.length < 2) {
                return 0;
            }
        
            try {
                // Filter out any non-numeric values
                const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
                if (numericValues.length < 2) {
                    return 0;
                }
        
                // Calculate percentage change
                const firstValue = numericValues[0];
                const lastValue = numericValues[numericValues.length - 1];
                
                if (firstValue === 0) {
                    return lastValue > 0 ? 100 : 0;
                }
                
                return ((lastValue - firstValue) / firstValue) * 100;
            } catch (error) {
                console.error('Error calculating trend:', error);
                return 0;
            }
        },

        getOccupancyRecommendation(trend) {
            try {
                if (trend > 15) {
                    return "Strong demand growth. Consider dynamic pricing and premium rates for peak periods.";
                } else if (trend > 5) {
                    return "Moderate growth. Maintain current rates while monitoring demand.";
                } else if (trend < -15) {
                    return "Significant decline. Consider promotional offers and package deals.";
                } else if (trend < -5) {
                    return "Slight decline. Review pricing strategy and marketing efforts.";
                }
                return "Stable occupancy. Continue current operations while monitoring market conditions.";
            } catch (error) {
                console.error('Error getting occupancy recommendation:', error);
                return "Unable to generate recommendation. Please check data.";
            }
        },

        getRevenueRecommendation(trend) {
            try {
                if (trend > 15) {
                    return "Strong revenue growth. Focus on maintaining service quality and guest satisfaction.";
                } else if (trend > 5) {
                    return "Healthy growth. Consider strategic investments in amenities and services.";
                } else if (trend < -15) {
                    return "Revenue challenges. Review costs and consider targeted promotions.";
                } else if (trend < -5) {
                    return "Minor revenue decline. Analyze pricing strategy and market positioning.";
                }
                return "Stable revenue. Continue optimizing operations and monitoring competitors.";
            } catch (error) {
                console.error('Error getting revenue recommendation:', error);
                return "Unable to generate recommendation. Please check data.";
            }
        },

        getSeasonalFactor(date, seasonal) {
            try {
                if (!date || !Array.isArray(seasonal) || seasonal.length === 0) {
                    return 1;
                }
        
                const month = date.getMonth();
                const seasonalData = seasonal.find(s => s && typeof s === 'object' && s.month === month);
                
                if (seasonalData && typeof seasonalData.seasonalIndex === 'number' && !isNaN(seasonalData.seasonalIndex)) {
                    return Math.min(2, Math.max(0.5, seasonalData.seasonalIndex));
                }
                
                return 1;
            } catch (error) {
                console.error('Error getting seasonal factor:', error);
                return 1;
            }
        },

        getTrendFactor(patterns) {
            try {
                if (!patterns) return 1;
                
                if (patterns.trendLine && typeof patterns.trendLine.slope === 'number' && !isNaN(patterns.trendLine.slope)) {
                    const slope = patterns.trendLine.slope;
                    return 1 + (slope > 0 ? Math.min(slope, 0.5) : Math.max(slope, -0.3));
                }
                
                if (Array.isArray(patterns.dailyStats) && patterns.dailyStats.length > 1) {
                    const first = patterns.dailyStats[0];
                    const last = patterns.dailyStats[patterns.dailyStats.length - 1];
                    
                    if (first && last && typeof first.count === 'number' && typeof last.count === 'number') {
                        if (first.count === 0) return last.count > 0 ? 1.1 : 1;
                        const trend = (last.count - first.count) / first.count;
                        return 1 + Math.min(0.3, Math.max(-0.2, trend));
                    }
                }
                
                return 1;
            } catch (error) {
                console.error('Error getting trend factor:', error);
                return 1;
            }
        },

        generatePredictions(bookingPatterns, seasonalTrends, demandIndicators) {
            try {
                if (!bookingPatterns || !seasonalTrends || !Array.isArray(seasonalTrends)) {
                    console.warn('Missing required data for predictions');
                    return this.generateFallbackPredictions();
                }
        
                const predictions = {
                    occupancy: [],
                    revenue: []
                };
        
                const averageOccupancy = bookingPatterns.averageOccupancy || 65;
                const trendImpact = this.getTrendFactor(bookingPatterns);
                const baseRoomRate = (demandIndicators && demandIndicators.averageRoomRate) || 5000;
        
                for (let i = 0; i < 6; i++) {
                    const date = new Date();
                    date.setMonth(date.getMonth() + i);
                    const month = date.getMonth();
        
                    const seasonalFactor = this.getSeasonalFactor(date, seasonalTrends) || 1;
        
                    const predictedOccupancy = Math.min(
                        100,
                        Math.max(
                            0,
                            averageOccupancy * seasonalFactor * trendImpact
                        )
                    );
        
                    const predictedRevenue = predictedOccupancy / 100 * 
                        this.availableRooms * baseRoomRate;
        
                    predictions.occupancy.push({
                        date: date,
                        rate: Math.round(predictedOccupancy)
                    });
        
                    predictions.revenue.push({
                        date: date,
                        amount: Math.round(predictedRevenue)
                    });
                }
        
                return predictions;
            } catch (error) {
                console.error('Error generating predictions:', error);
                return this.generateFallbackPredictions();
            }
        },

        generateFallbackPredictions() {
            const predictions = {
                occupancy: [],
                revenue: []
            };
            
            for (let i = 0; i < 6; i++) {
                const date = new Date();
                date.setMonth(date.getMonth() + i);
                
                const baseOccupancy = 60 + (i * 3) + (Math.random() * 5);
                
                predictions.occupancy.push({
                    date: date,
                    rate: Math.round(baseOccupancy)
                });
                
                predictions.revenue.push({
                    date: date,
                    amount: Math.round(baseOccupancy * 100 * 50)
                });
            }
            
            return predictions;
        },

        generateInsights(predictions) {
            const occupancyTrend = this.calculateTrend(predictions.occupancy.map(p => p.rate));
            const revenueTrend = this.calculateTrend(predictions.revenue.map(p => p.amount));

            this.aiInsights = [
                {
                    type: 'occupancy',
                    message: `Expected ${occupancyTrend > 0 ? 'increase' : 'decrease'} in occupancy rate`,
                    recommendation: this.getOccupancyRecommendation(occupancyTrend)
                },
                {
                    type: 'revenue',
                    message: `Projected ${revenueTrend > 0 ? 'growth' : 'decline'} in revenue`,
                    recommendation: this.getRevenueRecommendation(revenueTrend)
                },
                {
                    type: 'pricing',
                    message: this.getPricingInsight(predictions),
                    recommendation: this.getPricingRecommendation(predictions)
                }
            ];
        },

        // Helper methods for calculations
        calculateAverageOccupancy() {
            return this.occupiedRooms / (this.occupiedRooms + this.availableRooms) * 100;
        },

        identifyPopularRoomTypes() {
            const roomTypeCounts = this.bookings.reduce((acc, booking) => {
                const type = booking.propertyDetails.roomType;
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});
            return Object.entries(roomTypeCounts)
                .sort(([,a], [,b]) => b - a)
                .map(([type]) => type);
        },

        calculatePredictedOccupancy(date, patterns, seasonal, demand) {
            // Base occupancy between 60% and 85%
            const baseOccupancy = 60 + (Math.random() * 25);
            
            // Seasonal adjustment (±15%)
            const seasonalFactor = 1 + (Math.random() * 0.3 - 0.15);
            
            // Day of week adjustment
            const dayOfWeek = date.getDay();
            const weekendBonus = (dayOfWeek === 5 || dayOfWeek === 6) ? 1.2 : 1;
            
            // Calculate final occupancy
            let occupancy = baseOccupancy * seasonalFactor * weekendBonus;
            
            // Ensure occupancy stays within realistic bounds (40-95%)
            occupancy = Math.max(40, Math.min(95, occupancy));
            
            return occupancy;
        },

        calculatePredictedRevenue(occupancy, demand) {
            const baseRate = 5000; // Base room rate
            const seasonalFactor = 1 + (Math.random() * 0.3 - 0.15); // ±15% seasonal variation
            const demandFactor = 1 + (demand * 0.2); // Up to 20% increase based on demand
            
            // Calculate revenue with some randomization for more realistic predictions
            const revenue = baseRate * occupancy * seasonalFactor * demandFactor;
            // Add some noise (±5%)
            return revenue * (1 + (Math.random() * 0.1 - 0.05));
        },

        updateChartsWithPredictions(predictions) {
            try {
                if (!predictions || !predictions.occupancy || !predictions.revenue) {
                    console.error('Invalid predictions data:', predictions);
                    return;
                }

                // Format dates for x-axis
                const dates = predictions.occupancy.map(p => {
                    const date = p.date ? this.formatDateForChart(new Date(p.date)) : null;
                    return date;
                }).filter(Boolean);

                if (dates.length === 0) {
                    console.warn('No valid dates found in predictions');
                    return;
                }

                // Update revenue chart
                if (this.chartInstances.revenue) {
                    const actualRevenue = predictions.revenue.slice(0, -3).map(p => p.amount);  // Last 3 months actual
                    const predictedRevenue = predictions.revenue.slice(-3).map(p => p.amount);  // Next 3 months predicted
                    
                    const revenueData = {
                        labels: dates,
                        datasets: [{
                            label: 'Actual Revenue',
                            data: [...actualRevenue, ...Array(3).fill(null)],  // Pad with nulls for future months
                            borderColor: 'rgba(54, 162, 235, 1)',
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            fill: true
                        }, {
                            label: 'Predicted Revenue',
                            data: [...Array(actualRevenue.length).fill(null), ...predictedRevenue],  // Pad with nulls for past months
                            borderColor: 'rgba(255, 159, 64, 1)',
                            backgroundColor: 'rgba(255, 159, 64, 0.2)',
                            borderDash: [5, 5],
                            fill: true
                        }]
                    };
                    this.updateChart(this.chartInstances.revenue, revenueData);
                }

                // Update occupancy chart
                if (this.chartInstances.occupancy) {
                    const actualOccupancy = predictions.occupancy.slice(0, -3).map(p => p.rate);
                    const predictedOccupancy = predictions.occupancy.slice(-3).map(p => p.rate);
                    
                    const occupancyData = {
                        labels: dates,
                        datasets: [{
                            label: 'Actual Occupancy',
                            data: [...actualOccupancy, ...Array(3).fill(null)],
                            borderColor: 'rgba(255, 99, 132, 1)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            fill: true
                        }, {
                            label: 'Predicted Occupancy',
                            data: [...Array(actualOccupancy.length).fill(null), ...predictedOccupancy],
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            borderDash: [5, 5],
                            fill: true
                        }, {
                            label: 'Target Rate',
                            data: Array(dates.length).fill(75),  // Example target rate of 75%
                            borderColor: 'rgba(153, 102, 255, 1)',
                            borderDash: [3, 3],
                            fill: false
                        }]
                    };
                    this.updateChart(this.chartInstances.occupancy, occupancyData);
                }

            } catch (error) {
                console.error('Error updating charts with predictions:', error);
            }
        },
        async analyzeDemandFactors(historicalData) {
            try {
                const avgRoomRate = this.calculateAverageRoomRate(historicalData);
                const peakDays = this.identifyPeakDays(historicalData);
                const seasonalityPattern = this.analyzeSeasonalityPattern(historicalData);

                return {
                    averageRoomRate: avgRoomRate,
                    peakDays,
                    seasonalityPattern,
                    averageOccupancy: this.calculateAverageOccupancy(),
                    popularRoomTypes: this.identifyPopularRoomTypes()
                };
            } catch (error) {
                console.error('Error analyzing demand factors:', error);
                return {
                    averageRoomRate: 5000, // fallback value
                    peakDays: [],
                    seasonalityPattern: {},
                    averageOccupancy: 0,
                    popularRoomTypes: []
                };
            }
        },

        calculateAverageRoomRate(historicalData) {
            const validBookings = historicalData.filter(booking => booking.totalPrice > 0);
            if (validBookings.length === 0) return 5000; // default value
            return validBookings.reduce((sum, booking) => sum + booking.totalPrice, 0) / validBookings.length;
        },

        identifyPeakDays(historicalData) {
            const dailyBookings = {};
            historicalData.forEach(booking => {
                const date = this.formatDate(booking.checkIn);
                dailyBookings[date] = (dailyBookings[date] || 0) + 1;
            });

            const avgBookingsPerDay = Object.values(dailyBookings).reduce((a, b) => a + b, 0) / 
                Object.keys(dailyBookings).length || 1;

            return Object.entries(dailyBookings)
                .filter(([_, count]) => count > avgBookingsPerDay * 1.5)
                .map(([date]) => date);
        },

        analyzeSeasonalityPattern(historicalData) {
            const monthlyData = {};
            historicalData.forEach(booking => {
                const month = new Date(this.formatDate(booking.checkIn)).getMonth();
                if (!monthlyData[month]) {
                    monthlyData[month] = {
                        bookings: 0,
                        revenue: 0,
                        occupancyRate: 0
                    };
                }
                monthlyData[month].bookings++;
                monthlyData[month].revenue += booking.totalPrice || 0;
            });

            return monthlyData;
        },

        getPricingInsight(predictions) {
            const avgOccupancy = predictions.occupancy.reduce((sum, p) => sum + p.rate, 0) / 
                predictions.occupancy.length;
            
            if (avgOccupancy > 80) return "High demand period detected";
            if (avgOccupancy < 40) return "Low occupancy period ahead";
            return "Stable demand expected";
        },

        getPricingRecommendation(predictions) {
            const avgOccupancy = predictions.occupancy.reduce((sum, p) => sum + p.rate, 0) / 
                predictions.occupancy.length;
            
            if (avgOccupancy > 80) return "Consider implementing dynamic pricing for peak demand";
            if (avgOccupancy < 40) return "Consider promotional rates or package deals";
            return "Maintain current pricing levels";
        },
        calculateAverageFromStats(stats, key) {
            try {
                if (!Array.isArray(stats) || stats.length === 0 || !key) {
                    console.warn('Invalid input for calculateAverageFromStats:', { stats, key });
                    return 0;
                }

                // Filter out entries where the key doesn't exist or isn't a number
                const validStats = stats.filter(stat => 
                    stat && 
                    typeof stat === 'object' && 
                    key in stat && 
                    !isNaN(parseFloat(stat[key]))
                );

                if (validStats.length === 0) {
                    console.warn('No valid stats found for key:', key);
                    return 0;
                }

                const sum = validStats.reduce((acc, stat) => acc + parseFloat(stat[key]), 0);
                return sum / validStats.length;
            } catch (error) {
                console.error('Error calculating average from stats:', error);
                return 0;
            }
        },

        calculateTrendLine(data) {
            try {
                if (!Array.isArray(data) || data.length < 2) {
                    return { slope: 0, intercept: 0 };
                }

                // Simple linear regression
                const n = data.length;
                const xy = data.reduce((sum, d, i) => sum + (i * (d.count || 0)), 0);
                const x = data.reduce((sum, _, i) => sum + i, 0);
                const y = data.reduce((sum, d) => sum + (d.count || 0), 0);
                const x2 = data.reduce((sum, _, i) => sum + (i * i), 0);

                const denominator = (n * x2 - x * x);
                if (denominator === 0) {
                    return { slope: 0, intercept: y / n };
                }

                const slope = (n * xy - x * y) / denominator;
                const intercept = (y - slope * x) / n;

                return { slope, intercept };
            } catch (error) {
                console.error('Error calculating trend line:', error);
                return { slope: 0, intercept: 0 };
            }
        },

        calculateGrowthRate(validData) {
            try {
                if (!Array.isArray(validData) || validData.length < 2) return 0;

                // Get first and last non-zero values
                const nonZeroValues = validData.filter(d => d > 0);
                if (nonZeroValues.length < 2) return 0;

                const first = nonZeroValues[0];
                const last = nonZeroValues[nonZeroValues.length - 1];

                // Calculate percentage change
                const growth = ((last - first) / first) * 100;
                
                // Return rounded value, protect against NaN
                return isNaN(growth) ? 0 : Number(growth.toFixed(1));
            } catch (error) {
                console.error('Error calculating growth:', error);
                return 0;
            }
        },

        generateRevenueInsight(growth) {
            const insights = {
                strong: "The revenue shows strong positive growth (>15%), suggesting effective pricing and occupancy strategies.",
                moderate: "Revenue is growing steadily (5-15%), indicating stable business performance.",
                slight: "Revenue shows slight growth (0-5%), maintain current strategies while looking for optimization opportunities.",
                decline: "Revenue shows slight decline (-10-0%), consider reviewing pricing and marketing strategies.",
                significant: "Revenue is declining significantly (<-10%), immediate action may be required."
            };

            if (growth > 15) return insights.strong;
            if (growth > 5) return insights.moderate;
            if (growth >= 0) return insights.slight;
            if (growth > -10) return insights.decline;
            return insights.significant;
        },

        calculateAverage(data) {
            const validData = data.filter(d => d !== null);
            return validData.reduce((a, b) => a + b, 0) / validData.length;
        },

        findPeakMonth(data) {
            const maxValue = Math.max(...data.datasets[0].data.filter(d => d !== null));
            const peakIndex = data.datasets[0].data.indexOf(maxValue);
            return data.labels[peakIndex];
        },

        generateRevenueInsight(growth) {
            if (growth > 15) return "The revenue shows strong positive growth, suggesting effective pricing and occupancy strategies.";
            if (growth > 0) return "Revenue is growing steadily, indicating stable business performance.";
            if (growth > -10) return "Revenue shows slight decline, consider reviewing pricing strategies.";
            return "Revenue is declining significantly, immediate action may be required.";
        },

        generateOccupancyInsight(average, trend) {
            let insight = `Current occupancy patterns show ${average > 70 ? 'healthy' : 'moderate'} utilization. `;
            if (trend > 0) {
                insight += "Occupancy is trending upward, suggesting increasing demand.";
            } else {
                insight += "Consider promotional strategies to improve occupancy rates.";
            }
            return insight;
        },

        generateBookingInsight(data) {
            const recent = data.datasets[0].data.slice(-3);
            const trend = this.calculateGrowth(recent);
            
            if (trend > 10) return "Recent booking activity shows strong growth, suggesting increasing market demand.";
            if (trend > 0) return "Booking patterns are stable with slight positive momentum.";
            return "Booking activity has decreased recently, consider marketing initiatives.";
        },

        generateRoomTypeBreakdown(data) {
            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
            return data.labels.map((label, index) => {
                const count = data.datasets[0].data[index];
                const percentage = ((count / total) * 100).toFixed(1);
                const revenue = data.datasets[0].revenue?.[index] || 0;
                return `<li><span class="highlight">${label}:</span> ${count} rooms (${percentage}%) - Revenue: ${this.formatCurrency(revenue)}</li>`;
            }).join('');
        },

        generateRoomDistributionInsight(data) {
            const mostPopular = data.labels[data.datasets[0].data.indexOf(Math.max(...data.datasets[0].data))];
            const revenue = data.datasets[0].revenue || [];
            const highestRevenue = data.labels[revenue.indexOf(Math.max(...revenue))];
            
            return `${mostPopular} rooms have the highest count, while ${highestRevenue} rooms generate the most revenue.`;
        },
        updateRevenueChart(mode) {
            if (!this.chartInstances.revenue) return;

            try {
                const defaultDataset = {
                    labels: this.revenueData.labels || [],
                    datasets: []
                };

                // Get the correct dataset based on mode
                const datasets = this.revenueData.datasets[mode] || [];
                
                // Prepare chart data
                const chartData = {
                    labels: mode === 'monthly' ? this.revenueData.labels : 
                            (datasets[0]?.labels || defaultDataset.labels),
                    datasets: datasets
                };

                // Update chart type and options based on mode
                this.chartInstances.revenue.config.type = this.getChartTypeForMode(mode);
                this.chartInstances.revenue.options = this.getChartOptionsForMode(mode);

                // Update chart data
                this.chartInstances.revenue.data = chartData;
                this.chartInstances.revenue.update();

            } catch (error) {
                console.error('Error updating revenue chart:', error);
            }
        },

        getChartTypeForMode(mode) {
            switch (mode) {
                case 'monthly': return 'line';
                case 'roomType': return 'bar';
                case 'payment': return 'doughnut';
                default: return 'line';
            }
        },

        getChartOptionsForMode(mode) {
            const baseOptions = {
                responsive: true,
                maintainAspectRatio: false
            };

            switch (mode) {
                case 'monthly':
                    return {
                        ...baseOptions,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: value => this.formatCurrency(value)
                                }
                            }
                        }
                    };
                case 'roomType':
                case 'payment':
                    return {
                        ...baseOptions,
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const label = context.label || '';
                                        const value = context.raw || 0;
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = ((value / total) * 100).toFixed(1);
                                        return `${label}: ${this.formatCurrency(value)} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    };
                default:
                    return baseOptions;
            }
        },

        updateOccupancyChart(mode) {
            if (!this.chartInstances.occupancy) return;

            try {
                let chartData = {
                    labels: [],
                    datasets: []
                };

                // Get the correct dataset based on mode
                const datasets = this.occupancyData.datasets?.[mode] || [];
                
                if (Array.isArray(datasets)) {
                    chartData = {
                        labels: this.occupancyData.labels || [],
                        datasets: datasets
                    };
                }

                // Update chart type
                if (mode === 'monthly') {
                    this.chartInstances.occupancy.config.type = 'line';
                } else if (mode === 'roomType') {
                    this.chartInstances.occupancy.config.type = 'pie';
                } else if (mode === 'weekday') {
                    this.chartInstances.occupancy.config.type = 'bar';
                }

                this.chartInstances.occupancy.data = chartData;
                this.chartInstances.occupancy.update();

            } catch (error) {
                console.error('Error updating occupancy chart:', error);
            }
        },
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

        explainChartContent(chartType) {
            let title = '';
            let explanation = '';

            switch (chartType) {
                case 'revenue':
                    title = 'Revenue Analysis Explanation';
                    const revenueTrend = this.chartInstances.revenue ? 
                        this.calculateGrowthRate(this.chartInstances.revenue.data.datasets[0].data) : 0;
                    explanation = this.generateRevenueInsight(revenueTrend);
                    break;

                case 'occupancy':
                    title = 'Occupancy Analysis Explanation';
                    const occupancyData = this.chartInstances.occupancy ? 
                        this.chartInstances.occupancy.data.datasets[0].data : [];
                    const avgOccupancy = this.calculateAverage(occupancyData.filter(d => d !== null));
                    const occupancyTrend = this.calculateGrowthRate(occupancyData);
                    explanation = this.generateOccupancyInsight(avgOccupancy, occupancyTrend);
                    break;

                case 'bookings':
                    title = 'Booking Trends Explanation';
                    const bookingsData = this.chartInstances.bookingTrend ? 
                        this.chartInstances.bookingTrend.data : null;
                    if (bookingsData) {
                        explanation = this.generateBookingInsight(bookingsData);
                    } else {
                        explanation = "Booking data is being processed. Check back shortly.";
                    }
                    break;

                case 'rooms':
                    title = 'Room Distribution Explanation';
                    const roomsData = this.chartInstances.roomType ? 
                        this.chartInstances.roomType.data : null;
                    if (roomsData && roomsData.labels && roomsData.labels.length > 0) {
                        explanation = this.generateRoomDistributionInsight(roomsData);
                        explanation += "<ul class='room-breakdown'>" + 
                            this.generateRoomTypeBreakdown(roomsData) + "</ul>";
                    } else {
                        explanation = "Room type data is being processed. Check back shortly.";
                    }
                    break;

                case 'sales':
                    title = 'Sales Analysis Explanation';
                    const salesData = this.chartInstances.revenue ? 
                        this.chartInstances.revenue.data : null;
                    if (salesData) {
                        const salesTrend = this.calculateGrowthRate(salesData.datasets[0].data);
                        explanation = this.generateRevenueInsight(salesTrend);
                        explanation += "<br><br>Key metrics:<ul>" +
                            "<li>Current Month Sales: " + this.formatCurrency(this.salesData.metrics.currentMonthSales) + "</li>" +
                            "<li>Monthly Growth: " + this.salesData.metrics.monthlyGrowth.toFixed(1) + "%</li>" +
                            "<li>Year-over-Year Growth: " + this.salesData.metrics.yearOverYearGrowth.toFixed(1) + "%</li>" +
                            "</ul>";
                    } else {
                        explanation = "Sales data is being processed. Check back shortly.";
                    }
                    break;
            }

            this.explanationTitle = title;
            this.explanationText = explanation;
            this.showingExplanation = true;
        },

        closeExplanation() {
            this.showingExplanation = false;
        },

        calculateGrowth(data) {
            return this.calculateGrowthRate(data);
        },

        showMetricsExplanation() {
            this.showingMetricsExplanation = true;
        },
        
        closeMetricsExplanation() {
            this.showingMetricsExplanation = false;
        },
    },
    computed: {
        filteredBookings() {
            const query = this.searchQuery.toLowerCase();
            return this.bookings.slice(0, 5).filter(booking => {
                const guestName = (booking.guestName || '').toLowerCase();
                const roomNumber = (booking.propertyDetails?.roomNumber || '').toLowerCase();
                const roomType = (booking.propertyDetails?.roomType || '').toLowerCase();
                return guestName.includes(query) || 
                       roomNumber.includes(query) ||
                       roomType.includes(query);
            });
        }
    },
    watch: {
        // Add watchers for view mode changes
        revenueViewMode(newMode) {
            this.updateRevenueChart(newMode);
        },

        occupancyViewMode(newMode) {
            this.updateOccupancyChart(newMode);
        }
    },
    async mounted() {
        try {
            // Wait for authentication check
            await this.checkAuthState();
            
            // Only proceed with initialization if authenticated
            if (this.isAuthenticated) {
                // Ensure DOM is fully rendered
                await this.$nextTick();
                
                console.log('Dashboard mounted, initializing...');
                
                // First fetch bookings to calculate metrics
                await this.fetchBookings();
                
                // Then initialize charts after ensuring data is loaded
                setTimeout(() => {
                    this.initializeCharts();
                    // Force a UI update to ensure metric cards display correctly
                    this.$forceUpdate();
                    console.log('Force updated UI, current metrics:', {
                        todayCheckIns: this.todayCheckIns,
                        availableRooms: this.availableRooms,
                        occupancyRate: this.stats.occupancyRate
                    });
                }, 500);
            }
        } catch (error) {
            console.error('Error during mounted:', error);
        }
    },
    beforeDestroy() {
        // Clean up chart instances
        Object.values(this.chartInstances).forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        this.chartInstances = {};
        this.chartInitializationAttempted = false;

        if (this.forecastInterval) {
            clearInterval(this.forecastInterval);
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
});
