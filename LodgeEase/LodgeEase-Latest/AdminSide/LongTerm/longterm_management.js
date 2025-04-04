import { auth, db } from '../firebase.js';
import { collection, getDocs, query, orderBy, doc, deleteDoc, updateDoc, Timestamp, where, addDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TenantService } from './tenantService.js';

// Initialize tenant service
const tenantService = new TenantService(db);
let currentTenants = [];

// Initialize charts
async function initializeCharts() {
    try {
        // Get tenant and payment data for charts
        const tenantData = await tenantService.getTenantAnalytics();
        
        // Revenue Chart
        const revenueCtx = document.getElementById('revenueChart').getContext('2d');
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: tenantData.months,
                datasets: [{
                    label: 'Monthly Revenue',
                    data: tenantData.revenue,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12, 
                            padding: 20   
                        }
                    },
                    tooltip: {
                        bodySpacing: 12, 
                        padding: 12
                    }
                },
                layout: {
                    padding: {
                        top: 25, 
                        bottom: 25,
                        left: 15,
                        right: 15
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₱' + value.toLocaleString();
                            },
                            padding: 10 // Add padding between y-axis labels and chart
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 30, // Reduce rotation angle for better readability
                            minRotation: 0,
                            padding: 10 // Add padding between x-axis labels and chart
                        }
                    }
                }
            }
        });

        // Occupancy Chart
        const occupancyCtx = document.getElementById('occupancyChart').getContext('2d');
        new Chart(occupancyCtx, {
            type: 'line',
            data: {
                labels: tenantData.months,
                datasets: [{
                    label: 'Occupancy Rate',
                    data: tenantData.occupancyRate,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12, // Slightly increase legend box size
                            padding: 20   // Add more padding between legend items
                        }
                    },
                    tooltip: {
                        bodySpacing: 12, // Increase spacing in tooltips
                        padding: 12
                    }
                },
                layout: {
                    padding: {
                        top: 25, // Add more padding around the chart
                        bottom: 25,
                        left: 15,
                        right: 15
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            },
                            padding: 10 // Add padding between y-axis labels and chart
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 30, // Reduce rotation angle for better readability
                            minRotation: 0,
                            padding: 10 // Add padding between x-axis labels and chart
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error initializing charts:', error);
        displayErrorMessage('Failed to load chart data');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Show loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        const mainContent = document.getElementById('mainContent');

        // Initialize auth state check
        await checkAuthState();

        // Initialize all components in parallel
        await Promise.all([
            loadTenants(),
            initializeCharts(),
            initializeEventListeners()
        ]);

        // Hide loading screen and show main content
        loadingScreen.classList.add('hidden');
        mainContent.classList.remove('hidden');
    } catch (error) {
        console.error('Error initializing page:', error);
        displayErrorMessage('Failed to initialize page. Please refresh and try again.');
    }
});

// Check authentication state
function checkAuthState() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged((user) => {
            if (user) {
                resolve(user);
            } else {
                // Redirect to login if not authenticated
                window.location.href = '../Login/index.html';
                reject(new Error('Not authenticated'));
            }
        });
    });
}

async function loadTenants() {
    try {
        // Get tenants from the service
        currentTenants = await tenantService.getAllTenants();
        
        // Update the UI
        updateTenantsTable(currentTenants);
        updateStatistics(currentTenants);
        
        return currentTenants;
    } catch (error) {
        console.error('Error loading tenants:', error);
        displayErrorMessage('Failed to load tenant data');
        return [];
    }
}

function initializeEventListeners() {
    // Add search functionality
    const searchInput = document.getElementById('searchTenants');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterTenants(searchTerm);
    });

    // Initialize "Add New Tenant" button
    const addTenantBtn = document.querySelector('.add-tenant-btn');
    addTenantBtn.addEventListener('click', () => {
        showTenantModal();
    });

    // Initialize payment modal form
    const paymentForm = document.getElementById('paymentForm');
    paymentForm.addEventListener('submit', handlePaymentSubmit);

    // Initialize tenant form
    const tenantForm = document.getElementById('tenantForm');
    tenantForm.addEventListener('submit', handleTenantSubmit);

    // Add modal close buttons functionality
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = btn.closest('.modal');
            modal.classList.add('hidden');
        });
    });
}

// Global event handlers
window.viewTenantDetails = async function(tenantId) {
    try {
        const tenant = await tenantService.getTenantById(tenantId);
        if (tenant) {
            showTenantDetailsModal(tenant);
        } else {
            displayErrorMessage('Tenant not found');
        }
    } catch (error) {
        console.error('Error fetching tenant details:', error);
        displayErrorMessage('Failed to load tenant details');
    }
};

window.showPaymentModal = async function(tenantId) {
    try {
        const tenant = await tenantService.getTenantById(tenantId);
        if (tenant) {
            const modal = document.getElementById('paymentModal');
            modal.classList.remove('hidden');
            modal.dataset.tenantId = tenantId;
            
            // Set default amount to the tenant's monthly rent
            document.getElementById('paymentAmount').value = tenant.monthlyRent;
            
            // Set today's date as default
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('paymentDate').value = today;
            
            // Show tenant name in the modal
            document.getElementById('paymentTenantName').textContent = tenant.name;
        } else {
            displayErrorMessage('Tenant not found');
        }
    } catch (error) {
        console.error('Error preparing payment modal:', error);
        displayErrorMessage('Failed to open payment form');
    }
};

window.editTenant = async function(tenantId) {
    try {
        const tenant = await tenantService.getTenantById(tenantId);
        if (tenant) {
            showTenantModal(tenant); // Pass tenant to pre-fill the form
        } else {
            displayErrorMessage('Tenant not found');
        }
    } catch (error) {
        console.error('Error fetching tenant for edit:', error);
        displayErrorMessage('Failed to load tenant data for editing');
    }
};

window.terminateContract = async function(tenantId) {
    if (confirm('Are you sure you want to terminate this contract? This cannot be undone.')) {
        try {
            await tenantService.terminateContract(tenantId);
            displaySuccessMessage('Contract terminated successfully');
            await loadTenants(); // Refresh tenant list
        } catch (error) {
            console.error('Error terminating contract:', error);
            displayErrorMessage('Failed to terminate contract');
        }
    }
};

function updateTenantsTable(tenants) {
    const tbody = document.querySelector('table tbody');
    tbody.innerHTML = '';
    
    if (tenants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                    No tenants found
                </td>
            </tr>
        `;
        return;
    }

    tenants.forEach(tenant => {
        // Format the due date
        let dueDate = 'Not set';
        if (tenant.dueDate) {
            const dueDateObj = tenant.dueDate instanceof Date ? 
                tenant.dueDate : 
                (tenant.dueDate.toDate ? tenant.dueDate.toDate() : new Date(tenant.dueDate));
            dueDate = dueDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        // Format contract period
        let contractPeriod = 'Not specified';
        let duration = 'N/A';
        
        if (tenant.startDate && tenant.endDate) {
            const startDate = tenant.startDate instanceof Date ? 
                tenant.startDate : 
                (tenant.startDate.toDate ? tenant.startDate.toDate() : new Date(tenant.startDate));
                
            const endDate = tenant.endDate instanceof Date ? 
                tenant.endDate : 
                (tenant.endDate.toDate ? tenant.endDate.toDate() : new Date(tenant.endDate));
            
            contractPeriod = `${startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
            
            // Calculate duration in months
            const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                           (endDate.getMonth() - startDate.getMonth());
            duration = `${months} month${months !== 1 ? 's' : ''}`;
        }

        // Create row
        const row = `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 h-10 w-10">
                            <img class="h-10 w-10 rounded-full user-avatar" 
                                 src="${tenant.avatar || '../images/default-avatar.png'}" 
                                 alt="User avatar"
                                 onerror="this.src='../images/default-avatar.png'">
                        </div>
                        <div class="ml-4">
                            <div class="text-sm font-medium text-gray-900">${tenant.name}</div>
                            <div class="text-sm text-gray-500">${tenant.email}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">Room ${tenant.roomNumber}</div>
                    <div class="text-sm text-gray-500">${tenant.roomType}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${contractPeriod}</div>
                    <div class="text-sm text-gray-500">${duration}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">₱${parseFloat(tenant.monthlyRent).toLocaleString()}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        tenant.paymentStatus === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }">
                        ${tenant.paymentStatus}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${dueDate}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-blue-600 hover:text-blue-900 mr-3" title="View Details" onclick="viewTenantDetails('${tenant.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="text-green-600 hover:text-green-900 mr-3 record-payment-btn" 
                            title="Record Payment" 
                            onclick="showPaymentModal('${tenant.id}')">
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                    <button class="text-yellow-600 hover:text-yellow-900 mr-3" 
                            title="Edit Tenant"
                            onclick="editTenant('${tenant.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-600 hover:text-red-900" title="Terminate Contract" onclick="terminateContract('${tenant.id}')">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

function updateStatistics(tenants) {
    // Calculate statistics from tenant data
    const activeTenants = tenants.filter(t => t.status === 'active' || !t.status).length;
    const pendingPayments = tenants.filter(t => t.paymentStatus === 'Pending').length;
    
    // Calculate monthly revenue
    const monthlyRevenue = tenants.reduce((sum, tenant) => {
        return sum + (tenant.paymentStatus === 'Paid' ? parseFloat(tenant.monthlyRent) : 0);
    }, 0);
    
    // Calculate occupancy rate
    const occupancyRate = tenants.length > 0 ? 
        Math.round((activeTenants / tenantService.getTotalLongTermRooms()) * 100) : 0;
    
    // Update the UI
    document.querySelector('.metrics-dashboard .metric-card:nth-child(1) .metric-value').textContent = activeTenants;
    document.querySelector('.metrics-dashboard .metric-card:nth-child(2) .metric-value').textContent = pendingPayments;
    document.querySelector('.metrics-dashboard .metric-card:nth-child(3) .metric-value').textContent = '₱' + monthlyRevenue.toLocaleString();
    document.querySelector('.metrics-dashboard .metric-card:nth-child(4) .metric-value').textContent = occupancyRate + '%';
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    
    try {
        const modal = document.getElementById('paymentModal');
        const tenantId = modal.dataset.tenantId;
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const paymentDate = document.getElementById('paymentDate').value;
        const paymentMethod = document.getElementById('paymentMethod').value;
        
        // Validate inputs
        if (!tenantId || isNaN(amount) || !paymentDate || !paymentMethod) {
            throw new Error('All fields are required');
        }
        
        // Record payment
        await tenantService.recordPayment({
            tenantId,
            amount,
            date: new Date(paymentDate),
            method: paymentMethod
        });
        
        // Close modal
        modal.classList.add('hidden');
        
        // Update UI
        displaySuccessMessage('Payment recorded successfully');
        await loadTenants(); // Refresh tenant data
        
    } catch (error) {
        console.error('Error recording payment:', error);
        displayErrorMessage('Failed to record payment: ' + error.message);
    }
}

async function handleTenantSubmit(e) {
    e.preventDefault();
    
    try {
        const form = e.target;
        const tenantId = form.dataset.tenantId; // If exists, we're editing
        
        const tenantData = {
            name: form.tenantName.value,
            email: form.tenantEmail.value,
            phone: form.tenantPhone.value,
            roomNumber: form.roomNumber.value,
            roomType: form.roomType.value,
            monthlyRent: parseFloat(form.monthlyRent.value),
            startDate: new Date(form.startDate.value),
            endDate: new Date(form.endDate.value),
            paymentStatus: form.paymentStatus.value,
            dueDate: new Date(form.dueDate.value),
            isLongTerm: true,
            status: 'active'
        };
        
        if (tenantId) {
            // Update existing tenant
            await tenantService.updateTenant(tenantId, tenantData);
            displaySuccessMessage('Tenant updated successfully');
        } else {
            // Create new tenant
            await tenantService.addTenant(tenantData);
            displaySuccessMessage('Tenant added successfully');
        }
        
        // Close modal
        document.getElementById('tenantModal').classList.add('hidden');
        
        // Refresh tenant list
        await loadTenants();
        
    } catch (error) {
        console.error('Error saving tenant:', error);
        displayErrorMessage('Failed to save tenant: ' + error.message);
    }
}

function showTenantModal(tenant = null) {
    const modal = document.getElementById('tenantModal');
    const form = document.getElementById('tenantForm');
    
    // Set title based on whether we're editing or creating
    document.getElementById('tenantModalTitle').textContent = tenant ? 'Edit Tenant' : 'Add New Tenant';
    
    // Clear form
    form.reset();
    
    // Set tenant ID data attribute if editing
    if (tenant) {
        form.dataset.tenantId = tenant.id;
        
        // Fill form with tenant data
        form.tenantName.value = tenant.name;
        form.tenantEmail.value = tenant.email;
        form.tenantPhone.value = tenant.phone || '';
        form.roomNumber.value = tenant.roomNumber;
        form.roomType.value = tenant.roomType;
        form.monthlyRent.value = tenant.monthlyRent;
        
        // Format dates for input fields
        if (tenant.startDate) {
            const startDate = tenant.startDate instanceof Date ? 
                tenant.startDate : 
                (tenant.startDate.toDate ? tenant.startDate.toDate() : new Date(tenant.startDate));
            form.startDate.value = startDate.toISOString().split('T')[0];
        }
        
        if (tenant.endDate) {
            const endDate = tenant.endDate instanceof Date ? 
                tenant.endDate : 
                (tenant.endDate.toDate ? tenant.endDate.toDate() : new Date(tenant.endDate));
            form.endDate.value = endDate.toISOString().split('T')[0];
        }
        
        if (tenant.dueDate) {
            const dueDate = tenant.dueDate instanceof Date ? 
                tenant.dueDate : 
                (tenant.dueDate.toDate ? tenant.dueDate.toDate() : new Date(tenant.dueDate));
            form.dueDate.value = dueDate.toISOString().split('T')[0];
        }
        
        form.paymentStatus.value = tenant.paymentStatus;
    } else {
        // Remove tenant ID for new tenant
        delete form.dataset.tenantId;
        
        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        form.startDate.value = today;
        
        // Default end date to 12 months from today
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 12);
        form.endDate.value = endDate.toISOString().split('T')[0];
        
        // Default due date to 1st of next month
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + 1);
        dueDate.setDate(1);
        form.dueDate.value = dueDate.toISOString().split('T')[0];
        
        // Default payment status
        form.paymentStatus.value = 'Pending';
    }
    
    // Show modal
    modal.classList.remove('hidden');
}

function showTenantDetailsModal(tenant) {
    const modal = document.getElementById('tenantDetailsModal');
    
    // Format dates
    let startDate = 'Not set';
    if (tenant.startDate) {
        const dateObj = tenant.startDate instanceof Date ? 
            tenant.startDate : 
            (tenant.startDate.toDate ? tenant.startDate.toDate() : new Date(tenant.startDate));
        startDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    let endDate = 'Not set';
    if (tenant.endDate) {
        const dateObj = tenant.endDate instanceof Date ? 
            tenant.endDate : 
            (tenant.endDate.toDate ? tenant.endDate.toDate() : new Date(tenant.endDate));
        endDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    let dueDate = 'Not set';
    if (tenant.dueDate) {
        const dateObj = tenant.dueDate instanceof Date ? 
            tenant.dueDate : 
            (tenant.dueDate.toDate ? tenant.dueDate.toDate() : new Date(tenant.dueDate));
        dueDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    // Fill tenant details in the modal
    document.getElementById('detailsTenantName').textContent = tenant.name;
    document.getElementById('detailsTenantEmail').textContent = tenant.email;
    document.getElementById('detailsTenantPhone').textContent = tenant.phone || 'Not provided';
    document.getElementById('detailsRoomNumber').textContent = `Room ${tenant.roomNumber}`;
    document.getElementById('detailsRoomType').textContent = tenant.roomType;
    document.getElementById('detailsMonthlyRent').textContent = `₱${parseFloat(tenant.monthlyRent).toLocaleString()}`;
    document.getElementById('detailsStartDate').textContent = startDate;
    document.getElementById('detailsEndDate').textContent = endDate;
    document.getElementById('detailsDueDate').textContent = dueDate;
    document.getElementById('detailsPaymentStatus').textContent = tenant.paymentStatus;
    
    // Set payment status class
    const statusElement = document.getElementById('detailsPaymentStatus');
    statusElement.className = tenant.paymentStatus === 'Paid' ? 
        'text-green-600 font-semibold' : 'text-red-600 font-semibold';
    
    // Load payment history if available
    const paymentHistoryContainer = document.getElementById('paymentHistoryContainer');
    
    // Clear previous payment history
    paymentHistoryContainer.innerHTML = '<div class="text-gray-500 text-center">Loading payment history...</div>';
    
    // Load payment history from service
    tenantService.getPaymentHistory(tenant.id)
        .then(payments => {
            if (payments.length === 0) {
                paymentHistoryContainer.innerHTML = '<div class="text-gray-500 text-center">No payment history found</div>';
                return;
            }
            
            // Create payment history table
            const tableHtml = `
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="px-4 py-2 text-left">Date</th>
                            <th class="px-4 py-2 text-left">Amount</th>
                            <th class="px-4 py-2 text-left">Method</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.map(payment => `
                            <tr>
                                <td class="border px-4 py-2">${payment.date.toDate().toLocaleDateString()}</td>
                                <td class="border px-4 py-2">₱${parseFloat(payment.amount).toLocaleString()}</td>
                                <td class="border px-4 py-2">${payment.method}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            paymentHistoryContainer.innerHTML = tableHtml;
        })
        .catch(error => {
            console.error('Error fetching payment history:', error);
            paymentHistoryContainer.innerHTML = '<div class="text-red-500 text-center">Failed to load payment history</div>';
        });
    
    // Show modal
    modal.classList.remove('hidden');
}

function filterTenants(searchTerm) {
    if (!searchTerm) {
        // If search term is empty, show all tenants
        updateTenantsTable(currentTenants);
        return;
    }
    
    // Filter tenants that match the search term
    const filteredTenants = currentTenants.filter(tenant => {
        return (
            tenant.name.toLowerCase().includes(searchTerm) ||
            tenant.email.toLowerCase().includes(searchTerm) ||
            tenant.roomNumber.toString().includes(searchTerm) ||
            tenant.roomType.toLowerCase().includes(searchTerm)
        );
    });
    
    // Update table with filtered tenants
    updateTenantsTable(filteredTenants);
}

// Utility functions for notifications
function displaySuccessMessage(message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alert = document.createElement('div');
    alert.className = 'bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4 relative';
    alert.innerHTML = `
        <p>${message}</p>
        <button class="absolute top-0 right-0 mr-2 mt-2 text-green-700" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 5000);
}

function displayErrorMessage(message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alert = document.createElement('div');
    alert.className = 'bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 relative';
    alert.innerHTML = `
        <p>${message}</p>
        <button class="absolute top-0 right-0 mr-2 mt-2 text-red-700" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 5000);
}