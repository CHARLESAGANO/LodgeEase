// Import Firebase dependencies and other necessary modules
import { db, auth } from '../firebase.js';
import { collection, query, where, getDocs, Timestamp, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { checkAuth } from '../AInalysis/auth-check.js';
import { chartDataService } from './chartDataService.js';
import { EverLodgeDataService } from '../shared/everLodgeDataService.js';

// Add support for Ever Lodge bookings collection
const EVER_LODGE_COLLECTION = 'everlodgebookings';

// Update chart configuration with enhanced styling
const chartConfig = {
    plugins: {
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            bodyFont: { family: 'Roboto' },
            titleFont: { family: 'Montserrat' },
            padding: 12,
            displayColors: true,
            intersect: false,
            mode: 'index',
            callbacks: {
                label: function(context) {
                    if (!context || !context.dataset || context.parsed.y === null || context.parsed.y === undefined) {
                        return '';
                    }

                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }

                    const value = context.parsed.y;
                    try {
                        if (label.toLowerCase().includes('revenue')) {
                            label += '₱' + (value || 0).toLocaleString();
                        } else if (label.toLowerCase().includes('rate') || 
                                 label.toLowerCase().includes('occupancy')) {
                            label += (value || 0).toFixed(2) + '%';
                        } else {
                            label += (value || 0).toLocaleString();
                        }
                    } catch (error) {
                        console.error('Error formatting tooltip:', error);
                        label += '0';
                    }
                    return label;
                }
            }
        },
        legend: {
            position: 'bottom',
            labels: {
                boxWidth: 12,
                padding: 15,
                font: { family: 'Roboto' },
                usePointStyle: true
            }
        },
        datalabels: {
            color: '#666',
            font: { 
                weight: 'bold',
                size: 11
            },
            padding: 6,
            backgroundColor: function(context) {
                return context.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)';
            },
            borderRadius: 4,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.1)',
            anchor: 'end',
            align: 'top',
            offset: 8,
            display: function(context) {
                return context.dataset.data[context.dataIndex] > 0;
            }
        }
    },
    interaction: {
        intersect: false,
        mode: 'nearest',
        axis: 'x'
    },
    animation: {
        duration: 1000,
        easing: 'easeInOutQuart'
    },
    elements: {
        point: {
            radius: 4,
            hoverRadius: 6,
            borderWidth: 2,
            backgroundColor: 'white'
        },
        line: {
            tension: 0.4, // Increase tension for smoother curves
            borderWidth: 2,
            borderCapStyle: 'round',
            borderJoinStyle: 'round', // Add this for smoother line joins
            fill: true,
            spanGaps: true // Add this to connect points across gaps
        },
        bar: {
            borderRadius: 4,
            borderSkipped: false
        }
    },
    layout: {
        padding: {
            top: 20,
            right: 20,
            bottom: 20,
            left: 20
        }
    },
    scales: {
        x: {
            grid: {
                display: false
            },
            ticks: {
                padding: 10,
                font: {
                    size: 11,
                    family: 'Roboto'
                }
            }
        },
        y: {
            grid: {
                borderDash: [4, 4],
                color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
                padding: 10,
                font: {
                    size: 11,
                    family: 'Roboto'
                }
            }
        }
    }
};

// Update the chart configuration to enhance the trend charts
const trendChartConfig = {
    ...chartConfig,
    plugins: {
        ...chartConfig.plugins,
        annotation: {
            annotations: {
                trendLine: {
                    type: 'line',
                    borderColor: 'rgba(75, 192, 192, 0.5)',
                    borderDash: [5, 5],
                    borderWidth: 1,
                    label: {
                        enabled: true,
                        content: 'Trend',
                        position: 'start'
                    }
                }
            }
        },
        datalabels: {
            ...chartConfig.plugins.datalabels,
            formatter: (value, context) => {
                const datasetLabel = context.dataset.label.toLowerCase();
                if (datasetLabel.includes('revenue')) {
                    return '₱' + value.toLocaleString();
                } else if (datasetLabel.includes('rate') || datasetLabel.includes('occupancy')) {
                    return value.toFixed(2) + '%';
                }
                return value.toLocaleString();
            }
        }
    },
    scales: {
        ...chartConfig.scales,
        y: {
            ...chartConfig.scales.y,
            grid: {
                color: 'rgba(0, 0, 0, 0.05)',
                drawBorder: false
            }
        }
    }
};

// Ensure user is authenticated before mounting Vue app
checkAuth().then(user => {
    if (!user) {
        window.location.href = '../Login/index.html';
        return;
    }

    const app = new Vue({
        el: '#app',
        data: {
            isAuthenticated: true,
            loading: {
                charts: true,
                data: true
            },
            user: null,
            error: null,
            selectedEstablishment: 'Ever Lodge',
            establishments: ['Ever Lodge'], // Only Ever Lodge is supported for now
            selectedDateRange: 'month',
            dateRanges: [
                { value: 'week', label: 'Last 7 Days' },
                { value: 'month', label: 'Last 30 Days' },
                { value: 'quarter', label: 'Last 90 Days' },
                { value: 'year', label: 'Last 365 Days' }
            ],
            metrics: {
                totalSales: 0,
                totalBookings: 0,
                averageOccupancy: 0,
                avgSalesPerBooking: 0,
                avgSalesGrowth: 0,
                revPAR: 0,
                performanceScore: 0,
                growthIndex: 0,
                stabilityScore: 0,
                volatilityIndex: 0,
                salesGrowth: 0,
                bookingEfficiency: 0,
                forecastedSales: 0,
                forecastGrowth: 0
            },
            charts: {},
            chartColors: {
                sales: {
                    primary: 'rgba(75, 192, 192, 0.2)',
                    secondary: 'rgba(75, 192, 192, 1)'
                },
                bookings: {
                    primary: 'rgba(153, 102, 255, 0.2)',
                    secondary: 'rgba(153, 102, 255, 1)'
                },
                occupancy: {
                    primary: 'rgba(54, 162, 235, 0.2)',
                    secondary: 'rgba(54, 162, 235, 1)'
                },
                growth: {
                    primary: 'rgba(255, 99, 132, 0.2)',
                    secondary: 'rgba(255, 99, 132, 1)'
                },
                seasonal: {
                    primary: 'rgba(255, 159, 64, 0.2)',
                    secondary: 'rgba(255, 159, 64, 1)'
                },
                forecast: {
                    primary: 'rgba(255, 193, 7, 0.2)',
                    secondary: 'rgba(255, 193, 7, 1)'
                }
            },
            notificationsActive: false,
            notifications: [],
            showSettings: false,
            currentView: 'overview',
            viewOptions: [
                { value: 'overview', label: 'Overview', icon: 'fa-chart-line' },
                { value: 'sales', label: 'Revenue', icon: 'fa-dollar-sign' },
                { value: 'bookings', label: 'Bookings', icon: 'fa-calendar-check' },
                { value: 'occupancy', label: 'Occupancy', icon: 'fa-bed' },
                { value: 'seasonal', label: 'Seasonal Trends', icon: 'fa-chart-area' }
            ],
            // Set default visualization settings
            visualizationSettings: {
                chartType: 'line',
                showLegend: true,
                showGrid: true,
                animationSpeed: 1000,
                colorScheme: 'default'
            },
            // Settings for data refresh
            refreshSettings: {
                autoRefresh: false,
                refreshInterval: 5, // in minutes
                lastRefresh: null
            },
            // Performance indicators
            performanceIndicators: {
                revenueGrowth: 0,
                occupancyTrend: 0,
                seasonalityScore: 0,
                forecastAccuracy: 0
            },
            advancedMetrics: {
                bookingScore: 0,
                revenueScore: 0,
                occupancyScore: 0,
                revPARGrowth: 0
            },
            messages: [],
            // Add Ever Lodge specific settings
            everLodgeSettings: {
                useEverLodgeBookings: true,
                dataSource: EVER_LODGE_COLLECTION,
                showAllRoomTypes: true
            },
            // Add missing properties for analysis modal
            showAnalysisModal: false,
            selectedPeriod: '',
            selectedValue: 0,
            // Add items property for chart legend
            items: [
                { text: 'Sales', fillStyle: 'rgba(75, 192, 192, 1)' },
                { text: 'Bookings', fillStyle: 'rgba(153, 102, 255, 1)' },
                { text: 'Occupancy', fillStyle: 'rgba(54, 162, 235, 1)' },
                { text: 'Growth', fillStyle: 'rgba(255, 99, 132, 1)' },
                { text: 'Seasonal', fillStyle: 'rgba(255, 159, 64, 1)' }
            ]
        },
        computed: {
            performanceClass() {
                if (this.metrics.performanceScore >= 80) return 'excellent';
                if (this.metrics.performanceScore >= 60) return 'good';
                if (this.metrics.performanceScore >= 40) return 'average';
                if (this.metrics.performanceScore >= 20) return 'fair';
                return 'poor';
            },
            formattedLastRefresh() {
                if (!this.refreshSettings.lastRefresh) return 'Never';
                const date = new Date(this.refreshSettings.lastRefresh);
                return date.toLocaleString();
            },
            timeElapsedSinceRefresh() {
                if (!this.refreshSettings.lastRefresh) return '∞';
                const elapsed = Math.floor((Date.now() - this.refreshSettings.lastRefresh) / 60000);
                return elapsed < 1 ? 'Just now' : `${elapsed} min ago`;
            }
        },
        filters: {
            formatNumber(value) {
                if (value === null || value === undefined) return '0';
                return value.toLocaleString();
            },
            formatPercent(value) {
                if (value === null || value === undefined) return '0%';
                return `${value.toFixed(2)}%`;
            }
        },
        methods: {
            // async handleLogout() {
            //     try {
            //         await signOut(auth);
            //         this.isAuthenticated = false;
            //         window.location.href = '../Login/index.html';
            //     } catch (error) {
            //         console.error('Error signing out:', error);
            //     }
            // },
            formatCurrency(value) {
                if (isNaN(value) || value === null) return '₱0.00';
                return '₱' + Number(value).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            },
            getScoreArc(score) {
                let normalizedScore = score;
                if (isNaN(normalizedScore) || normalizedScore === null || normalizedScore === undefined) {
                    normalizedScore = 0;
                }
                
                normalizedScore = Math.max(0, Math.min(100, normalizedScore));
                
                const angle = (normalizedScore / 100) * 180;
                
                const radians = (angle * Math.PI) / 180;
                
                const x = 50 - 40 * Math.cos(radians);
                const y = 50 - 40 * Math.sin(radians);
                
                const formattedX = isNaN(x) ? 50 : x.toFixed(2);
                const formattedY = isNaN(y) ? 50 : y.toFixed(2);
                
                return `M10,50 A40,40 0 ${angle > 90 ? 1 : 0},1 ${formattedX},${formattedY}`;
            },
            getScoreColor(score) {
                if (score < 30) {
                    return '#F44336';
                } else if (score < 50) {
                    return '#FF9800';
                } else if (score < 70) {
                    return '#FFEB3B';
                } else if (score < 90) {
                    return '#4CAF50';
                } else {
                    return '#2196F3';
                }
            },
            // Add methods for analysis modal
            formatMetricValue(value) {
                if (typeof value === 'number') {
                    return value.toLocaleString();
                }
                return value;
            },
            calculateGrowth(period) {
                // Return a default value for now
                return (Math.random() * 10).toFixed(2);
            },
            getContributingFactors(period) {
                // Return some default factors
                return [
                    { name: 'Occupancy', value: (70 + Math.random() * 15).toFixed(1) + '%' },
                    { name: 'Pricing', value: 'Optimal' },
                    { name: 'Market Demand', value: 'Increasing' }
                ];
            },
            async calculateActualSales() {
                try {
                    const bookingsRef = collection(db, EVER_LODGE_COLLECTION);
                    const q = query(bookingsRef, where('status', '!=', 'cancelled'));
                    const querySnapshot = await getDocs(q);
                    
                    let total = 0;
                    querySnapshot.forEach((doc) => {
                        const booking = doc.data();
                        total += booking.totalPrice || 0;
                    });
                    
                    return total;
                } catch (error) {
                    console.error('Error calculating actual sales:', error);
                    return 0;
                }
            },
            renderCharts(chartData) {
                if (!chartData) {
                    console.error('No chart data available for rendering charts');
                    return;
                }
                
                console.log('Rendering charts with data:', chartData);
                
                // Destroy existing charts if they exist
                if (this.charts.occupancy) this.charts.occupancy.destroy();
                if (this.charts.revenue) this.charts.revenue.destroy();
                if (this.charts.bookings) this.charts.bookings.destroy();
                if (this.charts.seasonal) this.charts.seasonal.destroy();
                
                // Render Occupancy Rate Chart with data from everlodgebookings
                const occupancyCtx = document.getElementById('occupancyChart');
                if (occupancyCtx) {
                    // Make sure we have the occupancy data from Ever Lodge
                    const occupancyLabels = chartData.occupancy.monthly.map(item => item.month);
                    const occupancyData = chartData.occupancy.monthly.map(item => item.rate);
                    
                    console.log('Occupancy data for chart:', {
                        labels: occupancyLabels,
                        data: occupancyData,
                        source: 'Ever Lodge Bookings'
                    });
                    
                    this.charts.occupancy = new Chart(occupancyCtx, {
                        type: 'line',
                        data: {
                            labels: occupancyLabels,
                            datasets: [
                                {
                                    label: 'Overall Occupancy Rate (%)',
                                    data: occupancyData,
                                    borderColor: '#3498db',
                                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                                    fill: true,
                                    tension: 0.4,
                                    borderWidth: 4,
                                    pointRadius: 6,
                                    pointBackgroundColor: '#3498db',
                                    pointBorderColor: '#fff',
                                    pointBorderWidth: 2,
                                    pointHoverRadius: 8,
                                    order: 0,  // Changed to 0 to ensure it's on top
                                    zIndex: 10  // Ensure this is drawn on top
                                },
                                {
                                    label: 'Online Bookings (lodge13)',
                                    data: chartData.occupancy.monthly.map(item => Math.max(0, item.onlineRate || 0)),
                                    borderColor: '#e74c3c',
                                    backgroundColor: 'rgba(231, 76, 60, 0.2)',
                                    fill: true,
                                    tension: 0.4,
                                    borderWidth: 2,
                                    pointRadius: 4,
                                    pointBackgroundColor: '#e74c3c',
                                    order: 2
                                },
                                {
                                    label: 'Manual Bookings (Room Management)',
                                    data: chartData.occupancy.monthly.map(item => Math.max(0, item.manualRate || 0)),
                                    borderColor: '#2ecc71',
                                    backgroundColor: 'rgba(46, 204, 113, 0.2)',
                                    fill: true,
                                    tension: 0.4,
                                    borderWidth: 2,
                                    pointRadius: 4,
                                    pointBackgroundColor: '#2ecc71',
                                    order: 1
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {
                                    display: false,
                                    text: 'Occupancy Rate',
                                    font: {
                                        size: 16,
                                        weight: 'bold',
                                        family: 'Montserrat'
                                    }
                                },
                                tooltip: {
                                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                                    titleFont: { 
                                        family: 'Montserrat',
                                        size: 14,
                                        weight: 'bold'
                                    },
                                    bodyFont: { 
                                        family: 'Roboto',
                                        size: 13
                                    },
                                    padding: 15,
                                    cornerRadius: 8,
                                    callbacks: {
                                        label: function(context) {
                                            let label = context.dataset.label || '';
                                            if (label) {
                                                label += ': ';
                                            }
                                            if (context.parsed.y !== null) {
                                                label += context.parsed.y.toFixed(2) + '%';
                                            }
                                            return label;
                                        },
                                        footer: function(tooltipItems) {
                                            const index = tooltipItems[0].dataIndex;
                                            const data = tooltipItems[0].chart.data;
                                            
                                            if (data.datasets.length >= 3) {
                                                const manualRate = data.datasets[2].data[index] || 0;
                                                const onlineRate = data.datasets[1].data[index] || 0;
                                                const totalRate = data.datasets[0].data[index] || 0;
                                                
                                                // Calculate the percentage contribution of each booking type
                                                const manualPercent = totalRate > 0 ? 
                                                    ((manualRate / totalRate) * 100).toFixed(1) : 0;
                                                const onlinePercent = totalRate > 0 ? 
                                                    ((onlineRate / totalRate) * 100).toFixed(1) : 0;
                                                
                                                return [
                                                    `Contribution to Total Occupancy:`,
                                                    `- Manual Bookings: ${manualPercent}%`,
                                                    `- Online Bookings: ${onlinePercent}%`
                                                ];
                                            }
                                            
                                            return '';
                                        }
                                    }
                                },
                                legend: {
                                    position: 'bottom',
                                    labels: {
                                        usePointStyle: true,
                                        padding: 20,
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        filter: function(item) {
                                            // Always show all labels
                                            return true;
                                        }
                                    }
                                },
                                datalabels: {
                                    display: false
                                }
                            },
                            scales: {
                                x: {
                                    grid: {
                                        display: false
                                    },
                                    ticks: {
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        color: '#555'
                                    }
                                },
                                y: {
                                    beginAtZero: true,
                                    min: 0,
                                    suggestedMax: 100,
                                    grid: {
                                        color: 'rgba(0, 0, 0, 0.05)',
                                        drawBorder: false
                                    },
                                    ticks: {
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        color: '#555',
                                        padding: 10,
                                        callback: function(value) {
                                            return value + '%';
                                        }
                                    }
                                }
                            },
                            interaction: {
                                mode: 'index',
                                intersect: false
                            },
                            hover: {
                                mode: 'index',
                                intersect: false
                            },
                            elements: {
                                line: {
                                    tension: 0.4
                                }
                            }
                        }
                    });
                    console.log('Occupancy chart rendered');
                } else {
                    console.error('Cannot find occupancy chart canvas element');
                }
                
                // Render Revenue Chart with forecast
                const revenueCtx = document.getElementById('revenueChart');
                if (revenueCtx) {
                    const revenueLabels = chartData.sales.monthly.map(item => item.month);
                    const revenueData = chartData.sales.monthly.map(item => item.amount);
                    
                    // Generate sales forecast for next 3 months
                    const forecastData = this.forecastSales(chartData.sales.monthly);
                    
                    // Combine actual and forecast labels
                    const combinedLabels = [...revenueLabels];
                    const forecastLabels = forecastData.map(item => item.month);
                    
                    // Add forecast labels without duplicating any existing months
                    forecastLabels.forEach(month => {
                        if (!combinedLabels.includes(month)) {
                            combinedLabels.push(month);
                        }
                    });
                    
                    // Create datasets for the chart
                    const datasets = [
                        {
                            label: 'Actual Revenue (₱)',
                            data: revenueData,
                            backgroundColor: 'rgba(29, 97, 168, 0.6)',
                            borderColor: 'rgba(29, 97, 168, 0.9)',
                            borderWidth: 1,
                            borderRadius: 8,
                            barPercentage: 0.75,
                            categoryPercentage: 0.8,
                            order: 1,
                            hoverBackgroundColor: 'rgba(29, 97, 168, 0.8)',
                            hoverBorderColor: 'rgba(29, 97, 168, 1)',
                            hoverBorderWidth: 2
                        }
                    ];
                    
                    // Add forecast dataset if we have forecast data
                    if (forecastData.length > 0) {
                        // Create a combined array with nulls for actual data points and values for forecast points
                        const forecastDataPoints = combinedLabels.map(month => {
                            const forecastPoint = forecastData.find(item => item.month === month);
                            return forecastPoint ? forecastPoint.amount : null;
                        });
                        
                        datasets.push({
                            label: 'Forecast Revenue (₱)',
                            data: forecastDataPoints,
                            backgroundColor: 'rgba(255, 193, 7, 0.65)',
                            borderColor: 'rgba(255, 193, 7, 0.9)',
                            borderWidth: 1,
                            borderRadius: 8,
                            barPercentage: 0.75,
                            categoryPercentage: 0.8,
                            type: 'bar',
                            order: 0,
                            hoverBackgroundColor: 'rgba(255, 193, 7, 0.85)',
                            hoverBorderColor: 'rgba(255, 193, 7, 1)',
                            hoverBorderWidth: 2
                        });
                        
                        // Add a line connecting actual to forecast
                        if (revenueData.length > 0 && forecastDataPoints.some(p => p !== null)) {
                            const lastActualValue = revenueData[revenueData.length - 1];
                            const lineData = combinedLabels.map((month, index) => {
                                if (index < revenueLabels.length - 1) return null;
                                if (index === revenueLabels.length - 1) return lastActualValue;
                                const forecastPoint = forecastData.find(item => item.month === month);
                                return forecastPoint ? forecastPoint.amount : null;
                            });
                            
                            // Add trend line dataset
                            datasets.push({
                                label: 'Trend',
                                data: lineData,
                                type: 'line',
                                borderColor: 'rgba(255, 99, 132, 0.8)',
                                borderWidth: 2,
                                pointRadius: 0,
                                pointHoverRadius: 5,
                                tension: 0.4,
                                fill: false,
                                order: 0,
                                hoverBorderWidth: 3,
                                hoverBorderColor: 'rgba(255, 99, 132, 1)'
                            });
                        }
                        
                        console.log('Added sales forecast to chart:', forecastData);
                    }
                    
                    this.charts.revenue = new Chart(revenueCtx, {
                        type: 'bar',
                        data: {
                            labels: combinedLabels,
                            datasets: datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {
                                    display: true,
                                    text: 'Revenue Analysis (₱)',
                                    font: {
                                        size: 16,
                                        weight: 'bold',
                                        family: 'Montserrat'
                                    },
                                    padding: {
                                        top: 10,
                                        bottom: 20
                                    }
                                },
                                legend: {
                                    position: 'top',
                                    align: 'center',
                                    labels: {
                                        boxWidth: 15,
                                        usePointStyle: true,
                                        padding: 20,
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        }
                                    }
                                },
                                tooltip: {
                                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                                    titleFont: { 
                                        family: 'Montserrat',
                                        size: 14,
                                        weight: 'bold'
                                    },
                                    bodyFont: { 
                                        family: 'Roboto',
                                        size: 13
                                    },
                                    padding: 15,
                                    cornerRadius: 8,
                                    displayColors: true,
                                    bodySpacing: 6,
                                    caretSize: 8,
                                    caretPadding: 10,
                                    intersect: false,
                                    mode: 'index',
                                    animation: {
                                        duration: 150
                                    },
                                    callbacks: {
                                        label: function(context) {
                                            if (!context || !context.dataset || context.parsed.y === null) return '';
                                            
                                            let label = context.dataset.label || '';
                                            if (label) label += ': ';
                                            
                                            return label + '₱' + context.parsed.y.toLocaleString('en-US', {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0
                                            });
                                        },
                                        footer: function(tooltipItems) {
                                            const isForecast = tooltipItems.some(item => 
                                                item.dataset.label.includes('Forecast'));
                                            
                                            if (isForecast) {
                                                return 'Forecast values are estimates based on historical data and seasonal trends';
                                            }
                                            return '';
                                        }
                                    }
                                },
                                annotation: {
                                    annotations: {
                                        line1: {
                                            type: 'line',
                                            xMin: revenueLabels.length - 0.5,
                                            xMax: revenueLabels.length - 0.5,
                                            borderColor: 'rgba(255, 99, 132, 0.7)',
                                            borderWidth: 2,
                                            borderDash: [6, 6],
                                            label: {
                                                enabled: true,
                                                content: 'Forecast Start',
                                                position: 'start',
                                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                                color: 'rgba(255, 99, 132, 1)',
                                                font: {
                                                    size: 13,
                                                    weight: 'bold'
                                                },
                                                padding: 8,
                                                borderRadius: 4,
                                                xAdjust: 0,
                                                yAdjust: -15
                                            }
                                        }
                                    }
                                },
                                datalabels: {
                                    display: function(context) {
                                        // Only show datalabels for important values to avoid clutter
                                        return context.dataIndex % 2 === 0 && context.dataset.data[context.dataIndex] > 0;
                                    },
                                    color: function(context) {
                                        return context.dataset.label.includes('Forecast') ? '#FF9800' : '#1E88E5';
                                    },
                                    font: {
                                        weight: 'bold',
                                        size: 10
                                    },
                                    formatter: function(value) {
                                        if (value === 0 || value === null) return '';
                                        return '₱' + value.toLocaleString('en-US', {
                                            notation: 'compact',
                                            compactDisplay: 'short'
                                        });
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    grid: {
                                        display: false
                                    },
                                    ticks: {
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        maxRotation: 45,
                                        minRotation: 45,
                                        color: '#555'
                                    }
                                },
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: 'rgba(0, 0, 0, 0.05)',
                                        lineWidth: 1,
                                        drawBorder: false
                                    },
                                    ticks: {
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        color: '#555',
                                        padding: 10,
                                        callback: function(value) {
                                            return '₱' + value.toLocaleString('en-US', {
                                                notation: 'compact',
                                                compactDisplay: 'short'
                                            });
                                        }
                                    }
                                }
                            },
                            animation: {
                                duration: 1500,
                                easing: 'easeOutQuart'
                            },
                            hover: {
                                mode: 'index',
                                intersect: false,
                                animationDuration: 200
                            },
                            interaction: {
                                mode: 'index',
                                intersect: false
                            },
                            layout: {
                                padding: {
                                    left: 10,
                                    right: 10,
                                    top: 20,
                                    bottom: 10
                                }
                            },
                            elements: {
                                bar: {
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    borderColor: function(context) {
                                        return context.dataset.borderColor;
                                    }
                                },
                                line: {
                                    tension: 0.4,
                                    borderWidth: 3,
                                    borderCapStyle: 'round'
                                },
                                point: {
                                    radius: 4,
                                    hoverRadius: 6,
                                    backgroundColor: 'white',
                                    hoverBorderWidth: 3
                                }
                            }
                        }
                    });
                    
                    // Update debug info
                    if (document.getElementById('revenue-chart-status')) {
                        document.getElementById('revenue-chart-status').textContent = 'Rendered with Forecast';
                    }
                    if (document.getElementById('revenue-data-points')) {
                        document.getElementById('revenue-data-points').textContent = 
                            revenueData.length + ' actual, ' + forecastData.length + ' forecast';
                    }
                    if (document.getElementById('revenue-last-update')) {
                        document.getElementById('revenue-last-update').textContent = new Date().toLocaleTimeString();
                    }
                    console.log('Revenue chart rendered with forecast');
                } else {
                    console.error('Cannot find revenue chart canvas element');
                }
                
                // Render Bookings Chart
                const bookingsCtx = document.getElementById('bookingsChart');
                if (bookingsCtx) {
                    const bookingsLabels = chartData.bookings.monthly.map(item => item.month);
                    const bookingsData = chartData.bookings.monthly.map(item => item.count);
                    
                    this.charts.bookings = new Chart(bookingsCtx, {
                        type: 'line',
                        data: {
                            labels: bookingsLabels,
                            datasets: [
                                {
                                    label: 'Total Bookings',
                                    data: bookingsData,
                                    borderColor: '#9c27b0',
                                    backgroundColor: 'rgba(156, 39, 176, 0.2)',
                                    borderWidth: 3,
                                    pointRadius: 5,
                                    pointBackgroundColor: '#9c27b0',
                                    pointBorderColor: '#fff',
                                    pointBorderWidth: 2,
                                    fill: true,
                                    tension: 0.4,
                                    order: 0,
                                    zIndex: 10
                                },
                                {
                                    label: 'Online Bookings (lodge13)',
                                    // Use data from the chartData source if available, otherwise generate
                                    data: chartData.bookings.monthly.map(item => 
                                        typeof item.onlineCount !== 'undefined' ? 
                                        item.onlineCount : 
                                        Math.round(item.count * 0.6)
                                    ),
                                    borderColor: '#e74c3c',
                                    backgroundColor: 'rgba(231, 76, 60, 0.2)',
                                    borderWidth: 2,
                                    pointRadius: 4,
                                    pointBackgroundColor: '#e74c3c',
                                    fill: true,
                                    tension: 0.4,
                                    order: 2
                                },
                                {
                                    label: 'Manual Bookings (Room Management)',
                                    // Use data from the chartData source if available, otherwise generate
                                    data: chartData.bookings.monthly.map(item => 
                                        typeof item.manualCount !== 'undefined' ? 
                                        item.manualCount : 
                                        Math.round(item.count * 0.4)
                                    ),
                                    borderColor: '#2ecc71',
                                    backgroundColor: 'rgba(46, 204, 113, 0.2)',
                                    borderWidth: 2,
                                    pointRadius: 4,
                                    pointBackgroundColor: '#2ecc71',
                                    fill: true,
                                    tension: 0.4,
                                    order: 1
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {
                                    display: true,
                                    text: 'Booking Trends',
                                    font: {
                                        size: 16, 
                                        weight: 'bold',
                                        family: 'Montserrat'
                                    },
                                    padding: {
                                        top: 10,
                                        bottom: 20
                                    }
                                },
                                tooltip: {
                                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                                    titleFont: { 
                                        family: 'Montserrat',
                                        size: 14,
                                        weight: 'bold'
                                    },
                                    bodyFont: { 
                                        family: 'Roboto',
                                        size: 13
                                    },
                                    padding: 15,
                                    cornerRadius: 8,
                                    callbacks: {
                                        label: function(context) {
                                            let label = context.dataset.label || '';
                                            if (label) {
                                                label += ': ';
                                            }
                                            if (context.parsed.y !== null) {
                                                label += context.parsed.y.toLocaleString();
                                            }
                                            return label;
                                        },
                                        footer: function(tooltipItems) {
                                            const index = tooltipItems[0].dataIndex;
                                            const data = tooltipItems[0].chart.data;
                                            
                                            if (data.datasets.length >= 3) {
                                                const manualCount = data.datasets[2].data[index] || 0;
                                                const onlineCount = data.datasets[1].data[index] || 0;
                                                const totalCount = data.datasets[0].data[index] || 0;
                                                
                                                // Calculate the percentage contribution of each booking type
                                                const manualPercent = totalCount > 0 ? 
                                                    ((manualCount / totalCount) * 100).toFixed(1) : 0;
                                                const onlinePercent = totalCount > 0 ? 
                                                    ((onlineCount / totalCount) * 100).toFixed(1) : 0;
                                                
                                                return [
                                                    `Contribution to Total Bookings:`,
                                                    `- Manual Bookings (Room Management): ${manualPercent}%`,
                                                    `- Online Bookings (lodge13): ${onlinePercent}%`
                                                ];
                                            }
                                            
                                            return '';
                                        }
                                    }
                                },
                                legend: {
                                    position: 'bottom',
                                    labels: {
                                        usePointStyle: true,
                                        padding: 20,
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        }
                                    }
                                },
                                datalabels: {
                                    display: false
                                }
                            },
                            scales: {
                                x: {
                                    grid: {
                                        display: false
                                    },
                                    ticks: {
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        color: '#555'
                                    }
                                },
                                y: {
                                    beginAtZero: true,
                                    grid: {
                                        color: 'rgba(0, 0, 0, 0.05)',
                                        drawBorder: false
                                    },
                                    ticks: {
                                        font: {
                                            size: 12,
                                            family: 'Roboto'
                                        },
                                        color: '#555',
                                        padding: 10,
                                        callback: function(value) {
                                            return value.toLocaleString();
                                        }
                                    }
                                }
                            },
                            interaction: {
                                mode: 'index',
                                intersect: false
                            },
                            hover: {
                                mode: 'index',
                                intersect: false
                            },
                            elements: {
                                line: {
                                    tension: 0.4
                                }
                            }
                        }
                    });
                    console.log('Bookings chart rendered');
                } else {
                    console.error('Cannot find bookings chart canvas element');
                }
                
                // Render Seasonal Trends Chart with data from everlodgebookings
                const seasonalCtx = document.getElementById('seasonalTrendsChart');
                if (seasonalCtx) {
                    // Use actual occupancy data from Ever Lodge for seasonal trends
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const currentMonth = new Date().getMonth();
                    
                    // Generate labels for the last 12 months
                    const seasonalLabels = [];
                    for (let i = 0; i < 12; i++) {
                        const monthIdx = (currentMonth - 11 + i + 12) % 12;
                        seasonalLabels.push(months[monthIdx]);
                    }
                    
                    // Use the exact same occupancy data from our data service as the Occupancy Rate chart
                    // This ensures both charts show the same values without any seasonal adjustments
                    const seasonalData = chartData.occupancy.monthly.map(item => item.rate);
                    
                    console.log('Seasonal data for chart:', {
                        labels: seasonalLabels,
                        data: seasonalData,
                        source: 'Ever Lodge Bookings - Same data as Occupancy Rate chart'
                    });
                    
                    this.charts.seasonal = new Chart(seasonalCtx, {
                        type: 'line',
                        data: {
                            labels: seasonalLabels,
                            datasets: [{
                                label: 'Occupancy Trend (%)',
                                data: seasonalData,
                                borderColor: this.chartColors.seasonal.secondary,
                                backgroundColor: this.chartColors.seasonal.primary,
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: trendChartConfig // Use trend chart config for better visualization
                    });
                    console.log('Seasonal chart rendered with actual Ever Lodge data');
                } else {
                    console.error('Cannot find seasonal trends chart canvas element');
                }
            },
            // Helper method to create seasonal adjustments
            getSeasonalMultiplier(monthIndex, currentMonth) {
                // Different multipliers based on typical hotel seasonal patterns
                // Higher in summer and holidays, lower in shoulder seasons
                const seasonalFactors = [
                    0.9,  // Jan - Post-holiday season
                    0.85, // Feb - Low season
                    0.95, // Mar - Starting to pick up
                    1.0,  // Apr - Spring break
                    1.05, // May - Early summer
                    1.15, // Jun - Summer peak starts
                    1.2,  // Jul - Peak summer
                    1.15, // Aug - Late summer
                    1.0,  // Sep - Post-summer
                    0.95, // Oct - Fall shoulder
                    0.9,  // Nov - Pre-holiday
                    1.1   // Dec - Holiday season
                ];
                
                // Adjust the index to align with the current month
                const adjustedIndex = (monthIndex + currentMonth) % 12;
                return seasonalFactors[adjustedIndex];
            },
            // Add this new method to forecast sales
            forecastSales(historicalData) {
                try {
                    if (!historicalData || historicalData.length < 2) {
                        // Not enough data for forecasting
                        console.warn('Not enough historical data for forecasting');
                        return [];
                    }

                    // Extract the numerical values for forecasting
                    const values = historicalData.map(item => item.amount);
                    
                    // Get the last few months for forecasting
                    const months = historicalData.map(item => item.month);
                    const lastMonth = months[months.length - 1];
                    
                    // Generate future month labels (3 months into the future)
                    const futureMonths = this.generateFutureMonths(lastMonth, 3);
                    
                    // Perform the forecast calculation
                    const forecast = this.calculateForecast(values, 3);
                    
                    // Format the results
                    return futureMonths.map((month, index) => ({
                        month,
                        amount: forecast[index]
                    }));
                } catch (error) {
                    console.error('Error forecasting sales:', error);
                    return [];
                }
            },
            
            // Helper method to generate future month labels
            generateFutureMonths(lastMonth, count) {
                const result = [];
                // Parse the last month (format: "Apr 2024")
                const [monthStr, yearStr] = lastMonth.split(' ');
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                
                let monthIndex = months.indexOf(monthStr);
                let year = parseInt(yearStr);
                
                for (let i = 0; i < count; i++) {
                    monthIndex = (monthIndex + 1) % 12;
                    if (monthIndex === 0) {
                        year++;
                    }
                    result.push(`${months[monthIndex]} ${year}`);
                }
                
                return result;
            },
            
            // Calculate forecast using simple weighted moving average
            calculateForecast(values, periods) {
                if (values.length < 2) {
                    return Array(periods).fill(values[0] || 0);
                }
                
                // Apply a weighted average growth calculation
                const recentValues = values.slice(-3); // Use last 3 months
                if (recentValues.length < 2) {
                    // Not enough data for trend calculation, use simple growth
                    const growth = 1.15; // 15% growth estimate
                    const lastValue = values[values.length - 1];
                    
                    return Array(periods).fill(0).map((_, i) => 
                        Math.round(lastValue * Math.pow(growth, i + 1))
                    );
                }
                
                // Calculate growth rates between periods
                const growthRates = [];
                for (let i = 1; i < recentValues.length; i++) {
                    if (recentValues[i-1] === 0) {
                        growthRates.push(1.1); // Default 10% growth if previous is zero
                    } else {
                        growthRates.push(recentValues[i] / recentValues[i-1]);
                    }
                }
                
                // Calculate weighted average growth rate (more recent months have higher weight)
                let weightedGrowth;
                if (growthRates.length >= 2) {
                    weightedGrowth = (growthRates[0] * 0.4 + growthRates[1] * 0.6);
                } else {
                    weightedGrowth = growthRates[0];
                }
                
                // Apply seasonal adjustments based on tourism patterns
                const seasonalFactors = this.getSeasonalFactors();
                const currentMonth = new Date().getMonth();
                
                // Generate forecast for future periods
                const lastValue = values[values.length - 1];
                const forecast = [];
                
                for (let i = 0; i < periods; i++) {
                    const monthIndex = (currentMonth + i + 1) % 12;
                    const seasonalAdjustment = seasonalFactors[monthIndex];
                    const forecastValue = Math.round(lastValue * Math.pow(weightedGrowth, i + 1) * seasonalAdjustment);
                    forecast.push(forecastValue);
                }
                
                return forecast;
            },
            
            // Get seasonal factors for tourism/hospitality
            getSeasonalFactors() {
                return [
                    0.92, // Jan
                    0.85, // Feb
                    0.95, // Mar
                    1.05, // Apr
                    1.10, // May
                    1.18, // Jun
                    1.25, // Jul
                    1.22, // Aug
                    1.07, // Sep
                    0.98, // Oct
                    0.95, // Nov
                    1.15  // Dec
                ];
            },
            changeChartType(chartName, type) {
                try {
                    // If this is the revenue chart, always use bar chart
                    if (chartName === 'revenue') {
                        type = 'bar';
                    }
                    
                    // Get the chart instance
                    const chart = this.charts[chartName];
                    if (!chart) {
                        console.warn(`Chart ${chartName} not found`);
                        return;
                    }
                    
                    // Get active tab buttons
                    const tabButtons = document.querySelectorAll(`.chart-type-tab[data-chart="${chartName}"]`);
                    tabButtons.forEach(btn => {
                        btn.classList.remove('active');
                        if (btn.textContent.toLowerCase() === type) {
                            btn.classList.add('active');
                        }
                    });
                    
                    // Store original data
                    const data = chart.data;
                    
                    // For revenue chart, we need to handle multiple datasets
                    if (chartName === 'revenue') {
                        // Check if we have forecast data
                        const hasForecast = data.datasets.length > 1;
                        const actualData = data.datasets[0];
                        
                        if (type === 'bar') {
                            // Bar chart setup
                            actualData.type = 'bar';
                            actualData.backgroundColor = 'rgba(29, 97, 168, 0.6)';
                            actualData.borderColor = 'rgba(29, 97, 168, 0.9)';
                            actualData.borderRadius = 8;
                            actualData.borderWidth = 1;
                            
                            if (hasForecast) {
                                const forecastData = data.datasets[1];
                                forecastData.type = 'bar';
                                forecastData.backgroundColor = 'rgba(255, 193, 7, 0.65)';
                                forecastData.borderColor = 'rgba(255, 193, 7, 0.9)';
                                forecastData.borderRadius = 8;
                                forecastData.borderWidth = 1;
                            }
                        } else if (type === 'line') {
                            // Line chart setup
                            actualData.type = 'line';
                            actualData.backgroundColor = 'rgba(29, 97, 168, 0.2)';
                            actualData.borderColor = 'rgba(29, 97, 168, 0.9)';
                            actualData.tension = 0.4;
                            actualData.fill = true;
                            actualData.pointRadius = 3;
                            
                            if (hasForecast) {
                                const forecastData = data.datasets[1];
                                forecastData.type = 'line';
                                forecastData.backgroundColor = 'rgba(255, 193, 7, 0.2)';
                                forecastData.borderColor = 'rgba(255, 193, 7, 0.9)';
                                forecastData.tension = 0.4;
                                forecastData.fill = true;
                                forecastData.pointRadius = 3;
                            }
                        }
                    } else {
                        // For other charts
                        const ctx = document.getElementById(`${chartName}Chart`);
                        this.charts[chartName] = new Chart(ctx, {
                            type: type,
                            data: data,
                            options: this.charts[chartName]._config.options
                        });
                    }
                    
                    // Update the chart
                    chart.update();
                    console.log(`Updated ${chartName} chart to ${type} type`);
                } catch (error) {
                    console.error(`Error changing chart type for ${chartName}:`, error);
                }
            },
        },
        async mounted() {
            try {
                console.log("Mounting Business Analytics Dashboard");
                
                // Check user authentication
                const user = await checkAuth();
                if (!user) {
                    console.log('User not authenticated, redirecting to login');
                    window.location.href = '../Login/index.html';
                    return;
                }
                
                this.user = user;
                this.isAuthenticated = true;
                
                // Add event listener for auth state changes
                onAuthStateChanged(auth, (user) => {
                    this.isAuthenticated = !!user;
                    if (!user) {
                        window.location.href = '../Login/index.html';
                    }
                });
                
                // Load data for dashboard
                try {
                    // Get data from EverLodgeDataService via chartDataService
                    console.log("Loading chart data...");
                    const chartData = await chartDataService.getChartData(true); // Force refresh
                    
                    // Update metrics from chart data
                    if (chartData) {
                        // Update sales metrics
                        if (chartData.sales && chartData.sales.metrics) {
                            this.metrics.totalSales = chartData.sales.metrics.totalSales || 0;
                            // Calculate sales growth if available
                            const monthlyGrowth = chartData.sales.metrics.monthlyGrowth || [];
                            if (monthlyGrowth.length > 0) {
                                this.metrics.salesGrowth = monthlyGrowth[monthlyGrowth.length - 1].growth || 0;
                            }
                        }
                        
                        // Update occupancy metrics
                        if (chartData.occupancy && chartData.occupancy.metrics) {
                            this.metrics.averageOccupancy = chartData.occupancy.metrics.averageOccupancy || 0;
                        }
                        
                        // Update booking metrics
                        if (chartData.bookings && chartData.bookings.metrics) {
                            this.metrics.totalBookings = chartData.bookings.metrics.totalBookings || 0;
                        }
                        
                        // Calculate avgSalesPerBooking
                        if (this.metrics.totalBookings > 0) {
                            this.metrics.avgSalesPerBooking = this.metrics.totalSales / this.metrics.totalBookings;
                        } else {
                            this.metrics.avgSalesPerBooking = 0;
                        }
                        
                        // Set avgSalesGrowth (for demonstration - you would calculate this from real data)
                        this.metrics.avgSalesGrowth = this.metrics.salesGrowth * 0.8;
                        
                        // Calculate and set forecast metrics
                        if (chartData.sales && chartData.sales.monthly && chartData.sales.monthly.length > 0) {
                            // Generate sales forecasts
                            const forecastData = this.forecastSales(chartData.sales.monthly);
                            
                            if (forecastData.length > 0) {
                                // Calculate total forecasted sales
                                const forecastTotal = forecastData.reduce((sum, item) => sum + item.amount, 0);
                                this.metrics.forecastedSales = forecastTotal;
                                
                                // Calculate forecast growth percentage compared to current total sales
                                const currentTotal = chartData.sales.monthly.reduce((sum, item) => sum + item.amount, 0);
                                if (currentTotal > 0) {
                                    this.metrics.forecastGrowth = ((forecastTotal / currentTotal) - 1) * 100;
                                } else {
                                    this.metrics.forecastGrowth = 15; // Default 15% if no current data
                                }
                                
                                console.log('Forecast metrics calculated:', {
                                    forecastedSales: this.metrics.forecastedSales,
                                    forecastGrowth: this.metrics.forecastGrowth
                                });
                            }
                        }
                        
                        // Set some default metrics for visualization
                        this.metrics.bookingEfficiency = 75 + (Math.random() * 10);
                        this.metrics.performanceScore = Math.min(100, (this.metrics.averageOccupancy * 0.4) + 
                                                            (this.metrics.bookingEfficiency * 0.3) + 
                                                            (this.metrics.salesGrowth > 0 ? this.metrics.salesGrowth * 0.6 : 0));
                        this.metrics.growthIndex = Math.max(0, this.metrics.salesGrowth * 0.7);
                        this.metrics.stabilityScore = 70 + (Math.random() * 20);
                        this.metrics.volatilityIndex = 5 + (Math.random() * 10);
                        
                        // Render the charts with the loaded data
                        this.$nextTick(() => {
                            this.loading.charts = true;
                            this.renderCharts(chartData);
                            this.loading.charts = false;
                        });
                    }
                } catch (error) {
                    console.error("Error loading chart data:", error);
                    this.error = "Failed to load chart data: " + error.message;
                }
                
                // Done loading
                this.loading.data = false;
                // Hide the initial loading overlay after charts/data are loaded
                if (window.__hideInitialOverlay) {
                    setTimeout(() => window.__hideInitialOverlay(), 100); // slight delay for smoothness
                }
                console.log("Business analytics dashboard initialized successfully");
            } catch (error) {
                console.error('Error in mounted:', error);
                this.error = 'Failed to initialize analytics dashboard: ' + error.message;
                this.loading.data = false;
                // Hide overlay even on error
                if (window.__hideInitialOverlay) {
                    setTimeout(() => window.__hideInitialOverlay(), 100);
                }
            }
        }
    });
});

// Analytics functions
async function fetchAnalyticsData(establishment, dateRange) {
    try {
        const bookingsRef = collection(db, 'bookings');
        const roomsRef = collection(db, 'rooms');
        
        // Calculate date range
        const now = new Date();
        let startDate = new Date();
        
        switch (dateRange) {
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(now.getMonth() - 1);
        }

        // Fetch all bookings and rooms
        const [bookingsSnapshot, roomsSnapshot] = await Promise.all([
            getDocs(query(bookingsRef)),
            getDocs(query(roomsRef))
        ]);

        // Process rooms first to get establishment-specific room counts
        const rooms = [];
        const roomsByEstablishment = new Map(); // Renamed from establishmentRooms
        
        roomsSnapshot.forEach(doc => {
            const data = doc.data();
            const establishmentName = data.propertyDetails?.name;
            if (establishmentName) {
                rooms.push({
                    id: doc.id,
                    roomType: data.propertyDetails?.roomType || 'Standard',
                    status: data.status || 'unknown',
                    price: data.price || 0,
                    establishment: establishmentName
                });
                
                // Count rooms per establishment
                const count = roomsByEstablishment.get(establishmentName) || 0;
                roomsByEstablishment.set(establishmentName, count + 1);
            }
        });

        // Filter rooms for specific establishment if specified
        const filteredRooms = establishment ? 
            rooms.filter(room => room.establishment === establishment) : 
            rooms;

        // Get total rooms for the selected establishment
        const totalRooms = establishment ? 
            (roomsByEstablishment.get(establishment) || 1) : 
            rooms.length || 1;

        // Process bookings with enhanced filtering
        const bookings = [];
        const monthlyData = new Map();
        
        bookingsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.checkIn && data.checkIn instanceof Timestamp) {
                const checkInDate = data.checkIn.toDate();
                const establishmentName = data.propertyDetails?.name;
                
                // Filter by date range and establishment
                if (checkInDate >= startDate && 
                    (!establishment || establishmentName === establishment)) {
                    
                    const booking = {
                        id: doc.id,
                        checkIn: checkInDate,
                        checkOut: data.checkOut instanceof Timestamp ? data.checkOut.toDate() : null,
                        totalPrice: data.totalPrice || 0,
                        status: data.status || 'unknown',
                        roomType: data.propertyDetails?.roomType || 'unknown',
                        establishment: establishmentName
                    };
                    
                    bookings.push(booking);
                    
                    // Process monthly data
                    const monthKey = checkInDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                    if (!monthlyData.has(monthKey)) {
                        monthlyData.set(monthKey, {
                            month: monthKey,
                            bookingCount: 0,
                            revenue: 0,
                            occupiedRooms: 0,
                            occupancyRate: 0
                        });
                    }
                    
                    const monthData = monthlyData.get(monthKey);
                    if (booking.status !== 'cancelled') {
                        monthData.bookingCount++;
                        monthData.revenue += booking.totalPrice;
                        monthData.occupiedRooms++;
                        monthData.occupancyRate = (monthData.occupiedRooms / totalRooms) * 100;
                    }
                }
            }
        });

        // Convert monthly data to sorted array
        const sortedMonthlyData = Array.from(monthlyData.values())
            .sort((a, b) => new Date(a.month) - new Date(b.month));

        // Calculate revenue per room type
        const revenuePerRoom = Object.entries(
            bookings.reduce((acc, booking) => {
                if (booking.status !== 'cancelled' && booking.roomType) {
                    acc[booking.roomType] = (acc[booking.roomType] || 0) + (booking.totalPrice || 0);
                }
                return acc;
            }, {})
        ).map(([roomType, revenue]) => ({
            roomType: roomType || 'Unknown',
            revenue: revenue || 0
        })).sort((a, b) => b.revenue - a.revenue);

        // Enhanced occupancy calculation with daily tracking
        const calculateOccupancyStats = (bookings, rooms, startDate, endDate) => {
            const dailyOccupancy = new Map();
            const currentDate = new Date(startDate);
            const totalRooms = rooms.length;
        
            while (currentDate <= endDate) {
                const dateKey = currentDate.toISOString().split('T')[0];
                const occupiedRooms = bookings.filter(booking => {
                    try {
                        // Safely convert checkIn to Date object
                        const checkIn = booking.checkIn instanceof Timestamp ? 
                            booking.checkIn.toDate() : 
                            new Date(booking.checkIn);
        
                        // Safely convert checkOut to Date object
                        const checkOut = booking.checkOut instanceof Timestamp ? 
                            booking.checkOut.toDate() : 
                            new Date(booking.checkOut || checkIn); // Fallback to checkIn if checkOut is missing
        
                        const currentDateTime = new Date(currentDate);
                        
                        return (
                            // Use the consistent set of active statuses
                            ['occupied', 'checked-in', 'confirmed', 'active', 'pending'].includes(booking.status?.toLowerCase()) &&
                            checkIn <= currentDateTime &&
                            checkOut >= currentDateTime &&
                            (!establishment || booking.propertyDetails?.name === establishment)
                        );
                    } catch (error) {
                        console.warn('Error processing booking dates:', error);
                        return false;
                    }
                }).length;
        
                dailyOccupancy.set(dateKey, {
                    occupied: occupiedRooms,
                    total: totalRooms,
                    rate: (occupiedRooms / totalRooms) * 100
                });
        
                currentDate.setDate(currentDate.getDate() + 1);
            }
            return dailyOccupancy;
        };

        // Group occupancy data by month with accurate calculations
        const getMonthlyOccupancy = (dailyOccupancy) => {
            const monthlyData = new Map();
            
            for (const [date, stats] of dailyOccupancy) {
                const monthKey = new Date(date).toLocaleString('default', { month: 'short', year: 'numeric' });
                if (!monthlyData.has(monthKey)) {
                    monthlyData.set(monthKey, {
                        totalOccupied: 0,
                        totalRooms: 0,
                        days: 0
                    });
                }
                
                const monthStats = monthlyData.get(monthKey);
                monthStats.totalOccupied += stats.occupied;
                monthStats.totalRooms += stats.total;
                monthStats.days += 1;
            }

            return Array.from(monthlyData.entries()).map(([month, stats]) => ({
                month,
                occupiedRooms: Math.round(stats.totalOccupied / stats.days),
                totalRooms: stats.totalRooms / stats.days,
                rate: (stats.totalOccupied / stats.totalRooms) * 100
            }));
        };

        // Calculate occupancy statistics with filtered rooms
        const occupancyStats = calculateOccupancyStats(
            bookings,
            filteredRooms, // Use filteredRooms instead of establishmentRooms
            startDate,
            now
        );

        const monthlyOccupancy = getMonthlyOccupancy(occupancyStats);

        // Return processed data with corrected occupancy metrics
        return {
            occupancy: monthlyOccupancy.map(m => ({
                month: m.month,
                rate: Math.min(Math.round(m.rate * 10) / 10, 100),
                occupiedRooms: m.occupiedRooms,
                totalRooms: Math.round(m.totalRooms)
            })),
            revenue: ensureContinuousData(sortedMonthlyData.map(m => ({
                month: m.month,
                amount: m.revenue
            }))), 
            bookings: ensureContinuousData(sortedMonthlyData.map(m => ({
                month: m.month,
                count: m.bookingCount
            }))), 
            seasonalTrends: ensureContinuousData(sortedMonthlyData.map(m => ({
                month: m.month,
                value: m.occupancyRate
            }))), 
            roomTypes: rooms.reduce((acc, room) => {
                if (room.roomType) {
                    acc[room.roomType] = (acc[room.roomType] || 0) + 1;
                }
                return acc;
            }, {}), 
            revenuePerRoom
        };

    } catch (error) {
        console.error('Error fetching analytics data:', error);
        throw error;
    }
}

// Add enhanced metrics calculations
function calculateAdvancedMetrics(data) {
    if (!data || !data.revenue || !data.occupancy || !data.bookings) {
        return {
            totalSales: 0,
            salesGrowth: 0,
            averageOccupancy: 0,
            totalBookings: 0,
            revenueGrowth: 0,
            occupancyTrend: 0,
            seasonalityScore: 0,
            performanceScore: 0,
            forecastAccuracy: 0,
            revPAR: 0,
            revPARGrowth: 0,
            bookingEfficiency: 0,
            stabilityScore: 0,
            growthIndex: 0,
            volatilityIndex: 0
        };
    }

    // Calculate total sales from all confirmed bookings
    const totalSales = data.bookings.reduce((sum, booking) => {
        const bookingDate = booking.checkIn instanceof Date ? 
            booking.checkIn : 
            booking.checkIn?.toDate();
            
        if (bookingDate && booking.status !== 'cancelled') {
            return sum + (booking.totalPrice || 0);
        }
        return sum;
    }, 0);

    // Calculate sales growth using historical data
    const salesGrowth = calculateSalesGrowth(data);

    const metrics = {
        totalSales,
        salesGrowth,
        averageOccupancy: data.occupancy?.reduce((sum, item) => sum + item.rate, 0) / (data.occupancy?.length || 1) || 0,
        totalBookings: data.bookings?.reduce((sum, item) => sum + item.count, 0) || 0,
        revenueGrowth: calculateRevenueGrowth(data.revenue),
        occupancyTrend: calculateOccupancyTrend(data.occupancy),
        seasonalityScore: calculateSeasonalityScore(data.occupancy),
        forecastAccuracy: calculateForecastAccuracy(data.revenue),
        revPAR: calculateRevPAR(data),
        bookingEfficiency: calculateBookingEfficiency(data)
    };

    // Calculate overall performance score
    metrics.performanceScore = (
        calculateRevenueScore(data.revenue) * 0.4 +
        calculateOccupancyScore(data.occupancy) * 0.4 +
        calculateBookingScore(data.bookings) * 0.2
    );

    // Calculate RevPAR growth
    metrics.revPARGrowth = calculateRevPARGrowth(data);

    // Add stability metrics
    metrics.stabilityScore = calculateStabilityScore(data);
    metrics.growthIndex = calculateGrowthIndex(data);
    metrics.volatilityIndex = calculateVolatilityIndex(data);

    return metrics;
}

// Add new function to calculate sales growth
function calculateSalesGrowth(data) {
    if (!data || !data.bookings || data.bookings.length < 2) return 0;
    
    // Get current and previous period sales
    const currentPeriodSales = calculatePeriodSales(data.bookings, 0);
    const previousPeriodSales = calculatePeriodSales(data.bookings, -1);
    
    return previousPeriodSales ? ((currentPeriodSales - previousPeriodSales) / previousPeriodSales) * 100 : 0;
}

function calculatePeriodSales(bookings, offset = 0) {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setMonth(now.getMonth() + offset);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodStart.getMonth() + 1);

    return bookings.reduce((total, booking) => {
        const bookingDate = booking.checkIn instanceof Date ? 
            booking.checkIn : 
            booking.checkIn?.toDate();
            
        if (bookingDate && 
            bookingDate >= periodStart && 
            bookingDate < periodEnd && 
            booking.status !== 'cancelled') {
            return total + (booking.totalPrice || 0);
        }
        return total;
    }, 0);
}

// Add new metric calculation functions
function calculateRevPAR(data) {
    const totalRevenue = data.revenue.reduce((sum, item) => sum + item.amount, 0);
    const totalRoomNights = data.occupancy.length * 100; // Assuming 100 rooms for example
    return totalRevenue / totalRoomNights;
}

function calculateBookingEfficiency(data) {
    const confirmedBookings = data.bookings.reduce((sum, item) => sum + item.count, 0);
    const totalInquiries = confirmedBookings * 1.5; // Assuming 50% conversion rate
    return (confirmedBookings / totalInquiries) * 100;
}

function calculatePerformanceScore(data) {
    const revenueScore = calculateRevenueScore(data.revenue);
    const occupancyScore = calculateOccupancyScore(data.occupancy);
    const bookingScore = calculateBookingScore(data.bookings);
    
    return (revenueScore * 0.4 + occupancyScore * 0.4 + bookingScore * 0.2);
}

function calculateRevenueGrowth(revenue) {
    if (!revenue || revenue.length < 2) return 0;
    const lastMonth = revenue[revenue.length - 1].amount;
    const previousMonth = revenue[revenue.length - 2].amount;
    return previousMonth ? ((lastMonth - previousMonth) / previousMonth) * 100 : 0;
}

function calculateOccupancyTrend(occupancy) {
    if (!occupancy || occupancy.length < 2) return 0;
    const lastMonth = occupancy[occupancy.length - 1].rate;
    const previousMonth = occupancy[occupancy.length - 2].rate;
    return previousMonth ? ((lastMonth - previousMonth) / previousMonth) * 100 : 0;
}

function calculateSeasonalityScore(occupancy) {
    if (!occupancy || occupancy.length === 0) return 0;
    const rates = occupancy.map(o => o.rate);
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / rates.length;
    return Math.sqrt(variance);
}

function calculateForecastAccuracy(revenue) {
    if (!revenue || revenue.length < 2) return 0;
    // Simple implementation - can be enhanced with actual forecast comparison
    return 85; // Default accuracy score
}

function calculateBookingScore(bookings) {
    if (!bookings || bookings.length === 0) return 0;
    const totalBookings = bookings.reduce((sum, b) => sum + b.count, 0);
    const avgBookings = totalBookings / bookings.length;
    return Math.min((avgBookings / 10) * 100, 100); // Normalize to 0-100
}

function calculateRevenueScore(revenue) {
    if (!revenue || revenue.length === 0) return 0;
    const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
    const targetRevenue = 1000000; // Example target
    return Math.min((totalRevenue / targetRevenue) * 100, 100);
}

function calculateOccupancyScore(occupancy) {
    if (!occupancy || occupancy.length === 0) return 0;
    const avgOccupancy = occupancy.reduce((sum, o) => sum + o.rate, 0) / occupancy.length;
    return Math.min(avgOccupancy, 100);
}

function calculateRevPARGrowth(data) {
    if (!data || !data.revenue || data.revenue.length < 2) return 0;
    
    // Calculate current and previous RevPAR
    const currentRevPAR = calculatePeriodRevPAR(data, -1);
    const previousRevPAR = calculatePeriodRevPAR(data, -2);
    
    // Calculate growth percentage
    return previousRevPAR ? ((currentRevPAR - previousRevPAR) / previousRevPAR) * 100 : 0;
}

function calculatePeriodRevPAR(data, periodOffset) {
    if (!data || !data.revenue) return 0;
    const period = data.revenue.slice(periodOffset)[0];
    if (!period) return 0;
    
    const roomCount = Object.values(data.roomTypes || {}).reduce((sum, count) => sum + count, 0) || 1;
    return period.amount / (roomCount * getDaysInMonth(period.month));
}

function getDaysInMonth(monthStr) {
    if (!monthStr) return 30; // Default fallback
    const [month, year] = monthStr.split(' ');
    const monthIndex = new Date(Date.parse(month + " 1, " + year)).getMonth();
    return new Date(year, monthIndex + 1, 0).getDate();
}

// Add this helper function to ensure continuous data
function ensureContinuousData(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        // Return 6 months of empty data
        const result = [];
        for (let i = 0; i <= 6; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            result.push({
                month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                rate: 0,
                amount: 0,
                count: 0,
                value: 0,
                occupiedRooms: 0,
                totalRooms: 0
            });
        }
        return result.reverse();
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const result = [];
    
    // Get the range of months we need to fill
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    // Create a map of existing data
    const dataMap = new Map(data.map(item => [item.month, item]));

    // Fill in all months in the range
    let currentDate = new Date(sixMonthsAgo);
    while (currentDate <= now) {
        const monthKey = currentDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        if (dataMap.has(monthKey)) {
            result.push(dataMap.get(monthKey));
        } else {
            // Add empty data point
            result.push({
                month: monthKey,
                rate: 0,
                amount: 0,
                count: 0,
                value: 0,
                occupiedRooms: 0,
                totalRooms: data[0]?.totalRooms || 0
            });
        }
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return result;
}

// Initialize Chart.js
Chart.defaults.font.family = 'Roboto, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#666';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.8)';
Chart.defaults.plugins.tooltip.titleFont = { size: 13, weight: 'bold' };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
Chart.defaults.plugins.tooltip.cornerRadius = 4;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.plugins.tooltip.boxPadding = 4;

// Register Chart.js plugins if not already registered
try {
    if (typeof Chart !== 'undefined') {
        if (window.ChartDataLabels) {
            Chart.register(window.ChartDataLabels);
            console.log('ChartDataLabels plugin registered successfully');
        } else {
            console.warn('ChartDataLabels not found, some chart features may be limited');
        }
    }
} catch (error) {
    console.error('Error registering Chart.js plugins:', error);
}

function calculateStabilityScore(data) {
    if (!data.revenue || !data.occupancy) return 0;
    
    const revenueStability = calculateMetricStability(data.revenue.map(r => r.amount));
    const occupancyStability = calculateMetricStability(data.occupancy.map(o => o.rate));
    
    // Weighted average of stability scores
    return (revenueStability * 0.6 + occupancyStability * 0.4);
}

function calculateMetricStability(values) {
    if (!values.length) return 0;
    
    // Calculate moving average
    const movingAvg = calculateMovingAverage(values, 3);
    
    // Calculate deviation from moving average
    const deviations = values.map((value, i) => {
        if (movingAvg[i] === undefined) return 0;
        return Math.abs((value - movingAvg[i]) / movingAvg[i]);
    });
    
    // Convert deviations to stability score (100 - average deviation percentage)
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
    return Math.max(0, 100 - (avgDeviation * 100));
}

function calculateGrowthIndex(data) {
    if (!data.revenue || data.revenue.length < 2) return 0;
    
    // Calculate various growth indicators
    const revenueGrowth = calculateCompoundGrowthRate(data.revenue.map(r => r.amount));
    const bookingGrowth = calculateCompoundGrowthRate(data.bookings.map(b => b.count));
    const occupancyGrowth = calculateCompoundGrowthRate(data.occupancy.map(o => o.rate));
    
    // Weighted average of growth indicators
    return (revenueGrowth * 0.5 + bookingGrowth * 0.3 + occupancyGrowth * 0.2);
}

function calculateCompoundGrowthRate(values) {
    if (values.length < 2) return 0;
    
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const periods = values.length - 1;
    
    if (firstValue <= 0) return 0;
    
    // Calculate compound growth rate
    const growthRate = Math.pow(lastValue / firstValue, 1 / periods) - 1;
    return growthRate * 100;
}

function calculateVolatilityIndex(data) {
    if (!data.revenue || !data.revenue.length) return 0;
    
    // Calculate standard deviation of percentage changes
    const revenueChanges = calculatePercentageChanges(data.revenue.map(r => r.amount));
    const occupancyChanges = calculatePercentageChanges(data.occupancy.map(o => o.rate));
    
    const revenueVolatility = calculateStandardDeviation(revenueChanges);
    const occupancyVolatility = calculateStandardDeviation(occupancyChanges);
    
    // Normalize and combine volatility scores
    return Math.min(100, ((revenueVolatility + occupancyVolatility) / 2));
}

function calculatePercentageChanges(values) {
    return values.slice(1).map((value, index) => {
        const previousValue = values[index];
        if (previousValue === 0) return 0;
        return ((value - previousValue) / previousValue) * 100;
    });
}

function calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(variance);
}

function calculateMovingAverage(values, window) {
    return values.map((_, index) => {
        const start = Math.max(0, index - window + 1);
        const windowValues = values.slice(start, index + 1);
        return windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length;
    });
}
