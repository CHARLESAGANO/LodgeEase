// Sample data for charts
const revenueData = {
    labels: ['January', 'February', 'March', 'April'],
    datasets: [{
        label: 'Revenue',
        data: [3000, 5000, 4000, 7000],
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
    }]
};

const occupancyData = {
    labels: ['10 AM', '12 PM', '2 PM', '4 PM'],
    datasets: [{
        label: 'Occupancy',
        data: [10, 30, 20, 50],
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
    }]
};

const guestData = {
    labels: ['Age 18-24', 'Age 25-34', 'Age 35-44', 'Age 45+'],
    datasets: [{
        data: [300, 500, 200, 100],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
    }]
};

// Chart.js initialization
const revenueCtx = document.getElementById('revenueChart').getContext('2d');
const revenueChart = new Chart(revenueCtx, {
    type: 'bar',
    data: revenueData,
    options: {
        responsive: true,
    }
});

const occupancyCtx = document.getElementById('occupancyChart').getContext('2d');
const occupancyChart = new Chart(occupancyCtx, {
    type: 'line',
    data: occupancyData,
    options: {
        responsive: true,
    }
});

// Updated guest demographics chart
const guestCtx = document.getElementById('guestChart').getContext('2d');
const guestChart = new Chart(guestCtx, {
    type: 'pie',
    data: guestData,
    options: {
        responsive: true,
    }
});
