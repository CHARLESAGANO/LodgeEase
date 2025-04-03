// Import Firebase functions
import { auth, db } from '../firebase.js';
import { collection, getDocs, query, where, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { checkAuth } from '../AInalysis/auth-check.js';
import { chartDataService } from './chartDataService.js';

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
                            label += (value || 0).toFixed(1) + '%';
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
                    return value.toFixed(1) + '%';
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
            establishment: 'Ever Lodge',
            dateRange: 'month',
            loading: {
                data: false,
                charts: false,
                analysis: false
            },
            error: null,
            charts: {
                occupancy: null,
                revenue: null,
                bookings: null,
                seasonalTrends: null,
                roomTypes: null,
                revenuePerRoom: null
            },
            metrics: {
                totalSales: 0,
                salesGrowth: 0,
                averageOccupancy: 0,
                revPAR: 0,
                revPARGrowth: 0,
                bookingEfficiency: 0,
                performanceScore: 0,
                growthIndex: 0,
                stabilityScore: 0,
                volatilityIndex: 0
            },
            analysis: {
                period: '',
                value: 0,
                trend: '',
                growth: 0,
                factors: []
            },
            showAnalysisModal: false,
            selectedPeriod: null,
            selectedValue: null,
            analysisData: {
                trendData: [],
                growth: 0,
                contributingFactors: []
            },
            items: [] // For chart legend items
        },
        methods: {
            formatCurrency(value) {
                if (typeof value !== 'number') return '0.00';
                return value.toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            },
            
            async handleLogout() {
                try {
                    await signOut(auth);
                    window.location.href = '../Login/index.html';
                } catch (error) {
                    console.error('Error signing out:', error);
                    this.error = 'Failed to sign out. Please try again.';
                }
            },

            async refreshCharts() {
                try {
                    this.loading.charts = true;
                    const data = await chartDataService.getChartData();
                    await this.initializeCharts(data);
                    this.updateMetrics(data);
                } catch (error) {
                    console.error('Error refreshing charts:', error);
                    this.error = 'Failed to load analytics data';
                } finally {
                    this.loading.charts = false;
                }
            },

            handleDateRangeChange(event) {
                this.dateRange = event.target.value;
                this.refreshCharts();
            },

            async initializeCharts(data) {
                const ctx = document.getElementById('occupancyChart').getContext('2d');
                this.charts.occupancy = this.initializeOccupancyChart(ctx, data.occupancy);

                const salesCtx = document.getElementById('revenueChart').getContext('2d');
                this.charts.revenue = this.initializeSalesChart(salesCtx, data.sales);

                const bookingsCtx = document.getElementById('bookingsChart').getContext('2d');
                this.charts.bookings = this.initializeBookingsChart(bookingsCtx, data.bookings);

                const seasonalCtx = document.getElementById('seasonalTrendsChart').getContext('2d');
                this.charts.seasonalTrends = this.initializeSeasonalTrendsChart(seasonalCtx, data.occupancy);

                const roomTypeCtx = document.getElementById('roomTypeChart').getContext('2d');
                this.charts.roomTypes = this.initializeRoomTypeChart(roomTypeCtx, data.roomTypes);

                const salesPerRoomCtx = document.getElementById('revenuePerRoomChart').getContext('2d');
                this.charts.revenuePerRoom = this.initializeSalesPerRoomChart(salesPerRoomCtx, data.sales);
            },

            updateMetrics(data) {
                // Update metrics with safe defaults if data is missing
                this.metrics = {
                    totalSales: data.sales?.metrics?.totalSales || 0,
                    salesGrowth: data.sales?.metrics?.monthlyGrowth?.[0]?.growth || 0,
                    averageOccupancy: data.occupancy?.metrics?.averageOccupancy || 0,
                    revPAR: this.calculateRevPAR(data) || 0,
                    revPARGrowth: 0, // Calculate this based on your needs
                    bookingEfficiency: 85, // Default value, update based on your calculation
                    performanceScore: 75, // Default value, update based on your calculation
                    growthIndex: data.sales?.metrics?.yearOverYearGrowth || 0,
                    stabilityScore: 80, // Default value, update based on your calculation
                    volatilityIndex: 20 // Default value, update based on your calculation
                };
            },

            calculateRevPAR(data) {
                if (!data?.sales?.metrics?.totalSales || !data?.roomTypes?.metrics?.totalRooms) {
                    return 0;
                }
                const totalRevenue = data.sales.metrics.totalSales;
                const totalRoomNights = data.roomTypes.metrics.totalRooms * 30; // Assuming 30 days
                return totalRevenue / totalRoomNights;
            },

            initializeOccupancyChart(ctx, data) {
                if (!data || !data.monthly) {
                    console.warn('No occupancy data available');
                    data = { monthly: [] };
                }

                const continuousData = ensureContinuousData(data.monthly);
                const movingAverage = this.calculateMovingAverage(continuousData.map(d => d.rate || 0), 3);
                const targetLine = Array(continuousData.length).fill(80);
                
                // Calculate trend line
                const trendline = this.calculateTrendLine(continuousData.map(d => d.rate || 0));
                const trendData = continuousData.map((_, i) => trendline.slope * i + trendline.intercept);
                
                return new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: continuousData.map(item => item.month),
                        datasets: [{
                            label: 'Occupancy Rate',
                            data: continuousData.map(item => item.rate),
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointStyle: 'circle',
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            order: 2
                        }, {
                            label: 'Moving Average',
                            data: movingAverage,
                            borderColor: '#2196F3',
                            borderDash: [5, 5],
                            tension: 0.4,
                            fill: false,
                            pointStyle: 'triangle',
                            pointRadius: 4,
                            order: 1
                        }, {
                            label: 'Target Occupancy',
                            data: targetLine,
                            borderColor: '#FF9800',
                            borderDash: [2, 2],
                            pointStyle: false,
                            fill: false,
                            order: 0
                        }]
                    },
                    options: {
                        ...trendChartConfig,
                        scales: {
                            x: {
                                grid: {
                                    display: false
                                }
                            },
                            y: {
                                min: 0,
                                max: 100,
                                ticks: {
                                    stepSize: 20,
                                    callback: value => value + '%'
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            }
                        },
                        plugins: {
                            ...trendChartConfig.plugins,
                            tooltip: {
                                ...trendChartConfig.plugins.tooltip,
                                callbacks: {
                                    label: function(context) {
                                        const datasetLabel = context.dataset.label;
                                        const value = context.parsed.y;
                                        const item = continuousData[context.dataIndex];
                                        if (datasetLabel === 'Occupancy Rate') {
                                            return [
                                                `${datasetLabel}: ${value.toFixed(1)}%`,
                                                `Occupied Rooms: ${item.occupiedRooms}/${item.totalRooms}`,
                                                `Vacancy Rate: ${(100 - value).toFixed(1)}%`
                                            ];
                                        }
                                        return `${datasetLabel}: ${value.toFixed(1)}%`;
                                    }
                                }
                            }
                        }
                    }
                });
            },

            initializeSalesChart(ctx, data) {
                if (!data || !data.monthly) {
                    console.warn('No sales data available');
                    data = { monthly: [] };
                }

                const continuousData = ensureContinuousData(data.monthly);
                const movingAverage = this.calculateMovingAverage(continuousData.map(d => d.amount || 0), 3);
                const yearlyAverage = this.calculateYearlyAverage(continuousData);
                
                const gradientFill = ctx.createLinearGradient(0, 0, 0, 400);
                gradientFill.addColorStop(0, 'rgba(33, 150, 243, 0.3)');
                gradientFill.addColorStop(1, 'rgba(33, 150, 243, 0.0)');

                return new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: continuousData.map(item => item.month),
                        datasets: [{
                            label: 'Total Sales',
                            data: continuousData.map(item => item.amount || 0),
                            borderColor: '#2196F3',
                            backgroundColor: gradientFill,
                            fill: true,
                            tension: 0.4,
                            pointStyle: 'circle',
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            datalabels: {
                                display: false
                            }
                        }, {
                            label: '3-Month Moving Average',
                            data: movingAverage,
                            borderColor: '#4CAF50',
                            borderDash: [5, 5],
                            tension: 0.4,
                            fill: false,
                            pointStyle: 'triangle',
                            pointRadius: 4,
                            datalabels: {
                                display: false
                            }
                        }, {
                            label: 'Yearly Average',
                            data: Array(continuousData.length).fill(yearlyAverage),
                            borderColor: '#FF9800',
                            borderDash: [10, 5],
                            borderWidth: 2,
                            pointStyle: false,
                            fill: false,
                            datalabels: {
                                display: false
                            }
                        }]
                    },
                    options: {
                        ...trendChartConfig,
                        plugins: {
                            ...trendChartConfig.plugins,
                            datalabels: {
                                display: false
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: function(context) {
                                        return `${context.dataset.label}: ₱${context.parsed.y.toLocaleString()}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            ...trendChartConfig.scales,
                            y: {
                                ...trendChartConfig.scales.y,
                                ticks: {
                                    callback: value => '₱' + value.toLocaleString()
                                }
                            }
                        },
                        hover: {
                            mode: 'nearest',
                            intersect: false
                        }
                    }
                });
            },

            initializeBookingsChart(ctx, data) {
                const continuousData = ensureContinuousData(data);
                const maxBookings = Math.max(...continuousData.map(item => item.count));
                const stepSize = Math.ceil(maxBookings / 5); // Show roughly 5 steps on y-axis
                
                return new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: continuousData.map(item => item.month),
                        datasets: [{
                            label: 'Number of Bookings',
                            data: continuousData.map(item => item.count),
                            borderColor: '#FF9800',
                            backgroundColor: 'rgba(255, 152, 0, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointStyle: 'circle',
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#fff',
                            pointBorderColor: '#FF9800',
                            pointBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
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
                                        size: 11,
                                        weight: 'bold'
                                    },
                                    color: '#666'
                                },
                                title: {
                                    display: true,
                                    text: 'Time Period',
                                    font: {
                                        size: 12,
                                        weight: 'bold'
                                    },
                                    padding: {top: 20}
                                }
                            },
                            y: {
                                beginAtZero: true,
                                suggestedMax: maxBookings + stepSize,
                                ticks: {
                                    stepSize: stepSize,
                                    padding: 10,
                                    font: {
                                        size: 11,
                                        weight: 'bold'
                                    },
                                    color: '#666',
                                    callback: function(value) {
                                        return value + ' bookings';
                                    }
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)',
                                    drawBorder: false
                                },
                                title: {
                                    display: true,
                                    text: 'Number of Bookings',
                                    font: {
                                        size: 12,
                                        weight: 'bold'
                                    },
                                    padding: {bottom: 20}
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleFont: {
                                    size: 13,
                                    weight: 'bold'
                                },
                                bodyFont: {
                                    size: 12
                                },
                                padding: 15,
                                callbacks: {
                                    label: function(context) {
                                        return `Bookings: ${context.raw}`;
                                    },
                                    afterLabel: function(context) {
                                        const data = context.dataset.data;
                                        const index = context.dataIndex;
                                        let change = '';
                                        
                                        if (index > 0) {
                                            const currentValue = data[index];
                                            const previousValue = data[index - 1];
                                            const percentChange = ((currentValue - previousValue) / previousValue * 100).toFixed(1);
                                            change = `Change from previous: ${percentChange}%`;
                                        }
                                        
                                        return change;
                                    }
                                }
                            }
                        }
                    }
                });
            },

            initializeSeasonalTrendsChart(ctx, data) {
                const continuousData = ensureContinuousData(data);
                const seasonalityScore = this.calculateSeasonalityScore(continuousData);
                const peakMonths = this.identifyPeakMonths(continuousData);
                
                return new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: continuousData.map(item => item.month),
                        datasets: [{
                            label: 'Seasonal Pattern',
                            data: continuousData.map(item => item.value),
                            borderColor: '#9C27B0',
                            backgroundColor: 'rgba(156, 39, 176, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: context => {
                                const index = context.dataIndex;
                                return peakMonths.includes(index) ? '#FF4081' : '#9C27B0';
                            },
                            pointRadius: context => {
                                const index = context.dataIndex;
                                return peakMonths.includes(index) ? 6 : 4;
                            },
                            pointHoverRadius: 8
                        }]
                    },
                    options: {
                        ...trendChartConfig,
                        scales: {
                            x: {
                                grid: { display: false }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: value => value + '%'
                                }
                            }
                        },
                        plugins: {
                            ...trendChartConfig.plugins,
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return `Occupancy: ${context.parsed.y.toFixed(1)}%`;
                                    },
                                    afterBody: function() {
                                        return `\nSeasonality Score: ${seasonalityScore.toFixed(1)}`;
                                    }
                                }
                            }
                        }
                    }
                });
            },

            initializeRoomTypeChart(ctx, data) {
                const labels = Object.keys(data);
                const values = Object.values(data);
                
                return new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: values,
                            backgroundColor: [
                                '#4CAF50',
                                '#2196F3',
                                '#FF9800',
                                '#9C27B0',
                                '#F44336'
                            ]
                        }]
                    },
                    options: {
                        ...chartConfig,
                        cutout: '65%',
                        plugins: {
                            ...chartConfig.plugins,
                            legend: {
                                position: 'right',
                                labels: {
                                    usePointStyle: true,
                                    padding: 20,
                                    font: {
                                        size: 11,
                                        family: 'Roboto'
                                    }
                                }
                            }
                        }
                    }
                });
            },

            initializeSalesPerRoomChart(ctx, data) {
                if (!data || !data.monthly || !data.metrics) {
                    console.warn('No sales per room data available');
                    return new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: ['No Data'],
                            datasets: [{
                                data: [0],
                                backgroundColor: '#2196F3'
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            }
                        }
                    });
                }

                // Calculate sales per room type from monthly data
                const salesByRoomType = {};
                data.monthly.forEach(month => {
                    if (month.roomTypeSales) {
                        Object.entries(month.roomTypeSales).forEach(([roomType, amount]) => {
                            salesByRoomType[roomType] = (salesByRoomType[roomType] || 0) + amount;
                        });
                    }
                });

                // Convert to array and sort by sales
                const sortedData = Object.entries(salesByRoomType)
                    .map(([roomType, amount]) => ({ roomType, amount }))
                    .sort((a, b) => b.amount - a.amount);

                const colors = ['#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#F44336', '#00BCD4'];
                
                // Calculate percentage of total for each room type
                const totalSales = sortedData.reduce((sum, item) => sum + item.amount, 0);
                const dataWithPercentages = sortedData.map(item => ({
                    ...item,
                    percentage: totalSales > 0 ? (item.amount / totalSales) * 100 : 0
                }));

                return new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: dataWithPercentages.map(item => item.roomType),
                        datasets: [{
                            label: 'Sales per Room Type',
                            data: dataWithPercentages.map(item => item.amount),
                            backgroundColor: dataWithPercentages.map((_, i) => colors[i % colors.length]),
                            borderColor: 'rgba(255, 255, 255, 0.8)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                beginAtZero: true,
                                grid: { display: false },
                                ticks: {
                                    callback: value => '₱' + value.toLocaleString()
                                }
                            },
                            y: {
                                grid: { display: false }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const item = dataWithPercentages[context.dataIndex];
                                        return [
                                            `Sales: ₱${item.amount.toLocaleString()}`,
                                            `Share: ${item.percentage.toFixed(1)}%`
                                        ];
                                    }
                                }
                            },
                            datalabels: {
                                color: '#fff',
                                font: { weight: 'bold' },
                                formatter: (_, context) => {
                                    const item = dataWithPercentages[context.dataIndex];
                                    return `₱${item.amount.toLocaleString()} (${item.percentage.toFixed(1)}%)`;
                                }
                            }
                        }
                    }
                });
            },

            calculateMovingAverage(data, window) {
                return data.map((_, index) => {
                    const start = Math.max(0, index - window + 1);
                    const values = data.slice(start, index + 1);
                    return values.reduce((sum, val) => sum + val, 0) / values.length;
                });
            },

            calculateYearlyAverage(data) {
                return data.map((item, index) => {
                    if (index >= 12) {
                        const prevYear = data[index - 12].amount;
                        return ((item.amount - prevYear) / prevYear) * 100;
                    }
                    return null;
                });
            },

            calculateRevenueProjection(data) {
                const values = data.map(item => item.amount);
                const trend = this.calculateTrendLine(values);
                return values.map((_, index) => trend.slope * index + trend.intercept);
            },

            calculateTrendLine(values) {
                const n = values.length;
                if (n < 2) return { slope: 0, intercept: values[0] || 0 };

                const xValues = Array.from({ length: n }, (_, i) => i);
                const xMean = xValues.reduce((a, b) => a + b) / n;
                const yMean = values.reduce((a, b) => a + b) / n;

                const numerator = xValues.reduce((sum, x, i) => sum + (x - xMean) * (values[i] - yMean), 0);
                const denominator = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);

                const slope = numerator / denominator;
                const intercept = yMean - slope * xMean;

                return { slope, intercept };
            },

            // Add interaction handlers
            handleChartClick(chart, event) {
                const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
                if (points.length) {
                    const point = points[0];
                    this.showDetailedAnalysis(chart.data.labels[point.index], chart.data.datasets[point.datasetIndex].data[point.index]);
                }
            },

            showDetailedAnalysis(period, value) {
                // Implementation of detailed analysis modal/popup
                // This would be connected to a modal component in your HTML
                this.selectedPeriod = period;
                this.selectedValue = value;
                this.showAnalysisModal = true;
            },

            updateDateRange(range) {
                this.dateRange = range;
                this.refreshCharts();
            },

            formatMetricValue(value) {
                if (value === undefined || value === null) return '0';
                if (typeof value === 'number') {
                    if (this.selectedPeriod?.toLowerCase().includes('revenue')) {
                        return '₱' + this.formatCurrency(value);
                    }
                    return value.toFixed(1) + (this.selectedPeriod?.toLowerCase().includes('percentage') ? '%' : '');
                }
                return value;
            },

            calculateGrowth(period) {
                if (!period || !this.analysisData) return 0;
                return this.analysisData.growth.toFixed(1);
            },

            getContributingFactors(period) {
                if (!period || !this.analysisData) return [];
                return this.analysisData.contributingFactors;
            },

            async showDetailedAnalysis(period, value) {
                try {
                    this.loading.analysis = true;
                    this.selectedPeriod = period;
                    this.selectedValue = value;
                    
                    // Calculate analysis data
                    this.analysisData = await this.calculateAnalysisData(period, value);
                    
                    // Initialize trend chart in modal
                    this.$nextTick(() => {
                        const ctx = this.$refs.trendChart?.getContext('2d');
                        if (ctx) {
                            new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: this.analysisData.trendData.map(d => d.period),
                                    datasets: [{
                                        label: 'Trend',
                                        data: this.analysisData.trendData.map(d => d.value),
                                        borderColor: '#1e3c72',
                                        tension: 0.3
                                    }]
                                },
                                options: {
                                    ...chartConfig,
                                    interaction: {
                                        mode: 'nearest',
                                        axis: 'x',
                                        intersect: false
                                    }
                                }
                            });
                        }
                    });

                    this.showAnalysisModal = true;
                } catch (error) {
                    console.error('Error showing analysis:', error);
                    this.error = 'Failed to load detailed analysis';
                } finally {
                    this.loading.analysis = false;
                }
            },

            async calculateAnalysisData(period, value) {
                // Implement your analysis logic here
                return {
                    trendData: this.calculateTrendData(period, value),
                    growth: this.calculateHistoricalGrowth(period, value),
                    contributingFactors: this.identifyContributingFactors(period, value)
                };
            },

            calculateTrendData(period, value) {
                // Example implementation - replace with your actual logic
                const data = [];
                const now = new Date();
                for (let i = 6; i >= 0; i--) {
                    const date = new Date(now);
                    date.setMonth(date.getMonth() - i);
                    data.push({
                        period: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                        value: value * (0.8 + Math.random() * 0.4) // Simulate historical data
                    });
                }
                return data;
            },

            calculateHistoricalGrowth(period, value) {
                // Example implementation - replace with your actual logic
                return ((value - value * 0.8) / (value * 0.8)) * 100;
            },

            identifyContributingFactors(period, value) {
                // Example implementation - replace with your actual logic
                return [
                    { name: 'Seasonal Impact', value: '+15%' },
                    { name: 'Market Conditions', value: '-5%' },
                    { name: 'Pricing Strategy', value: '+8%' }
                ];
            },

            closeAnalysisModal() {
                this.showAnalysisModal = false;
                this.selectedPeriod = null;
                this.selectedValue = null;
                this.analysisData = {
                    trendData: [],
                    growth: 0,
                    contributingFactors: []
                };
            },

            getScoreArc(score) {
                if (score === undefined || score === null) score = 0;
                const normalizedScore = Math.min(Math.max(score, 0), 100);
                const angle = (normalizedScore / 100) * Math.PI;
                const x = 50 - 40 * Math.cos(angle);
                const y = 50 - 40 * Math.sin(angle);
                return `M 10,50 A 40,40 0 ${angle > Math.PI/2 ? 1 : 0},1 ${x},${y}`;
            },

            getScoreColor(score) {
                if (score === undefined || score === null) return '#F44336';
                if (score >= 80) return '#4CAF50';
                if (score >= 60) return '#FFC107';
                return '#F44336';
            },

            calculatePeriodRevPAR(data, periodOffset) {
                const period = data.revenue.slice(periodOffset)[0];
                if (!period) return 0;
                
                const roomCount = Object.values(data.roomTypes || {}).reduce((sum, count) => sum + count, 0) || 1;
                return period.amount / (roomCount * getDaysInMonth(period.month));
            },

            getDaysInMonth(monthStr) {
                const [month, year] = monthStr.split(' ');
                const monthIndex = new Date(Date.parse(month + " 1, " + year)).getMonth();
                return new Date(year, monthIndex + 1, 0).getDate();
            },

            calculateYearlyAverage(data) {
                if (!data || data.length === 0) return 0;
                const total = data.reduce((sum, item) => sum + (item.amount || 0), 0);
                return total / data.length;
            },

            // Add helper method for yearly averages by month
            calculateMonthlyAverages(data) {
                const monthlyTotals = {};
                const monthlyCounts = {};
                
                data.forEach(item => {
                    const month = item.month.split(' ')[0]; // Get just the month name
                    if (!monthlyTotals[month]) {
                        monthlyTotals[month] = 0;
                        monthlyCounts[month] = 0;
                    }
                    monthlyTotals[month] += item.amount || 0;
                    monthlyCounts[month]++;
                });

                return Object.keys(monthlyTotals).map(month => ({
                    month,
                    average: monthlyTotals[month] / monthlyCounts[month]
                }));
            },

            calculateSeasonalityScore(data) {
                if (!data || data.length === 0) return 0;
                const values = data.map(d => d.value);
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
                return Math.sqrt(variance);
            },

            identifyPeakMonths(data) {
                if (!data || data.length === 0) return [];
                const values = data.map(d => d.value);
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                const threshold = mean * 1.15; // 15% above average
                return values.map((v, i) => v > threshold ? i : -1).filter(i => i !== -1);
            }
        },
        async mounted() {
            try {
                await this.refreshCharts();
            } catch (error) {
                console.error('Error in mounted:', error);
                this.error = 'Failed to initialize analytics dashboard';
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
                            booking.status?.toLowerCase() === 'confirmed' &&
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
if (typeof Chart !== 'undefined' && Chart.register) {
    Chart.register(ChartDataLabels);
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
