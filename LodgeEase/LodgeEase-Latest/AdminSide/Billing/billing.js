import { 
    auth, 
    db, 
    fetchBillingData,
    addBillingRecord,
    updateBillingRecord,
    deleteBillingRecord,
    updateBookingBilling,
    collection, 
    addDoc,
    doc,
    deleteDoc,
    updateDoc,
    Timestamp,
    getDocs,
    query,
    orderBy,
    where,
    getDoc,
    deleteBookingRecord,
    checkAdminAuth,
    markBookingHiddenInBilling
} from '../firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/9.18.0/firebase-auth.js";
import { PageLogger } from '../js/pageLogger.js';

// Add activity logging function
async function logBillingActivity(actionType, details) {
    try {
        const user = auth.currentUser;
        if (!user) return;

        await addDoc(collection(db, 'activityLogs'), {
            userId: user.uid,
            userName: user.email,
            actionType,
            details,
            timestamp: Timestamp.now(),
            userRole: 'admin',
            module: 'Billing'
        });
    } catch (error) {
        console.error('Error logging billing activity:', error);
    }
}

new Vue({
    el: '#app',
    data() {
        return {
            isAuthenticated: false,
            loading: true,
            showModal: false,
            newBill: {
                customerName: '',
                date: '',
                checkInTime: '12:00',
                checkOut: '',
                checkOutTime: '11:00',
                roomNumber: '',
                roomType: '',
                baseCost: 0,
                serviceFee: 0,
                expenses: []
            },
            bills: [],
            filteredBills: [], 
            showViewModal: false,
            editingBill: null,
            currentBillId: null,
            sortDate: '',
            originalBills: [], 
            currentPage: 1,
            itemsPerPage: 10,
            currentDate: new Date(),
            view: 'all',
            isEditMode: false
        }
    },
    computed: {
        calculateTotal() {
            let total = 0;
            
            // Add base cost
            total += parseFloat(this.newBill.baseCost) || 0;
            
            // Add service fee
            total += parseFloat(this.newBill.serviceFee) || 0;
            
            // Add expenses
            if (this.newBill.expenses) {
                total += this.newBill.expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
            }
            
            return total.toFixed(2);
        },
        calculateEditTotal() {
            if (!this.editingBill) return '0.00';
            
            let total = 0;
            
            // Add base cost
            total += parseFloat(this.editingBill.baseCost) || 0;
            
            // Add service fee
            total += parseFloat(this.editingBill.serviceFee) || 0;
            
            // Add expenses
            if (this.editingBill.expenses) {
                total += this.editingBill.expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
            }
            
            return total.toFixed(2);
        },
        paginatedBills() {
            const billsToShow = this.filteredBills.length > 0 ? this.filteredBills : this.bills;
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return billsToShow.slice(start, end);
        },
        totalPages() {
            const totalBills = this.filteredBills.length > 0 ? this.filteredBills.length : this.bills.length;
            return Math.ceil(totalBills / this.itemsPerPage);
        },
        showNoDataMessage() {
            return this.sortDate && this.filteredBills.length === 0;
        },
        formattedCurrentDate() {
            return this.formatDisplayDate(this.currentDate);
        },
        filteredBillsByDate() {
            const today = new Date(this.currentDate);
            today.setHours(0, 0, 0, 0);
            
            return this.bills.filter(bill => {
                // Handle bills that might not have dates
                if (!bill.date) return false;
                
                const billDate = new Date(bill.date);
                billDate.setHours(0, 0, 0, 0);
                
                return billDate.getTime() === today.getTime();
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

        checkAuthState() {
            auth.onAuthStateChanged(user => {
                this.isAuthenticated = !!user;
                if (!user) {
                    window.location.href = '../Login/index.html';
                }
                this.loading = false;
            });
        },

        async processPayment() {
            try {
                // ...existing payment processing logic...
                await logBillingActivity('billing_payment', `Processed payment for ${this.customerName}`);
            } catch (error) {
                console.error('Error processing payment:', error);
                await logBillingActivity('billing_error', `Payment processing failed: ${error.message}`);
            }
        },

        async addCharge() {
            try {
                // ...existing charge addition logic...
                await logBillingActivity('billing_charge', `Added charge of ${amount} for ${description}`);
            } catch (error) {
                console.error('Error adding charge:', error);
                await logBillingActivity('billing_error', `Failed to add charge: ${error.message}`);
            }
        },

        async applyDiscount() {
            try {
                // ...existing discount logic...
                await logBillingActivity('billing_discount', `Applied ${discount}% discount`);
            } catch (error) {
                console.error('Error applying discount:', error);
                await logBillingActivity('billing_error', `Failed to apply discount: ${error.message}`);
            }
        },

        openModal() {
            console.log('Opening modal');
            this.showModal = true;
        },
        closeModal() {
            this.showModal = false;
        },
        resetNewBill() {
            this.newBill = {
                customerName: '',
                date: '',
                checkInTime: '12:00',
                checkOut: '',
                checkOutTime: '11:00',
                roomNumber: '',
                roomType: '',
                baseCost: 0,
                serviceFee: 0,
                expenses: []
            };
        },
        addExpense() {
            this.newBill.expenses.push({ description: '', amount: '' });
        },
        removeExpense(index) {
            this.newBill.expenses.splice(index, 1);
        },
        async loadBills() {
            try {
                this.loading = true;
                console.log("Loading bills from Firebase...");
                
                // Reset cached data to force a fresh load
                this.bills = [];
                this.filteredBills = [];
                
                // Fetch bill data from Firebase
                const billsData = await fetchBillingData();
                console.log("Bills data received:", billsData.length, "records");
                
                // Process each bill to ensure proper format for display
                this.bills = billsData.map(bill => {
                    // Ensure expenses array exists
                    if (!bill.expenses) {
                        bill.expenses = [];
                    }
                    
                    // Convert dates for proper display
                    if (bill.date && !(bill.date instanceof Date)) {
                        if (bill.date.seconds) {
                            bill.date = new Date(bill.date.seconds * 1000);
                        } else {
                            bill.date = new Date(bill.date);
                        }
                    }
                    
                    if (bill.checkOut && !(bill.checkOut instanceof Date)) {
                        if (bill.checkOut.seconds) {
                            bill.checkOut = new Date(bill.checkOut.seconds * 1000);
                        } else {
                            bill.checkOut = new Date(bill.checkOut);
                        }
                    }
                    
                    // Ensure room number is populated
                    if (!bill.roomNumber && bill.propertyDetails && bill.propertyDetails.roomNumber) {
                        bill.roomNumber = bill.propertyDetails.roomNumber;
                    }
                    
                    // Make sure totalAmount is a number
                    if (bill.totalAmount) {
                        bill.totalAmount = parseFloat(bill.totalAmount);
                    }
                    
                    // Make sure bookingId is set if available
                    if (bill.id && bill.source === 'bookings') {
                        bill.bookingId = bill.id;
                    }

                    console.log('Processed bill:', bill);
                    return bill;
                });
                
                // Copy and apply default filters
                this.originalBills = [...this.bills];
                this.filteredBills = this.filteredBillsByDate;
                
                this.loading = false;
                console.log("Bills loaded successfully");
            } catch (error) {
                this.loading = false;
                console.error('Error loading bills:', error);
                alert('Error loading bills: ' + error.message);
            }
        },
        sortBills() {
            if (!this.sortDate) {
                this.bills = [...this.originalBills]; 
                return;
            }

            const selectedDate = new Date(this.sortDate);
            selectedDate.setHours(0, 0, 0, 0); 
            
            this.bills.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                
                // Find the difference from the selected date
                const diffA = Math.abs(dateA - selectedDate);
                const diffB = Math.abs(dateB - selectedDate);
                
                return diffA - diffB; 
            });
        },

        filterByDate() {
            if (!this.sortDate) {
                this.filteredBills = [];
                return;
            }

            const selectedDate = new Date(this.sortDate);
            selectedDate.setHours(0, 0, 0, 0);

            this.filteredBills = this.bills.filter(bill => {
                const billDate = new Date(bill.date);
                billDate.setHours(0, 0, 0, 0);
                return billDate.getTime() === selectedDate.getTime();
            });

            // Reset to first page when filtering
            this.currentPage = 1;
        },

        resetFilter() {
            this.sortDate = '';
            this.filteredBills = [];
            this.currentPage = 1;
        },

        formatDate(date) {
            if (!date) return '';
            return new Date(date).toLocaleDateString();
        },
        viewBill(bill) {
            // Deep copy to avoid modifying the original
            this.editingBill = JSON.parse(JSON.stringify(bill));
            
            // Ensure expenses array exists
            if (!this.editingBill.expenses) {
                this.editingBill.expenses = [];
            }
            
            // Set current ID
            this.currentBillId = bill.id;
            this.showViewModal = true;
            this.isEditMode = false;
        },
        
        openEditModal(bill) {
            console.log('Open edit modal called with bill:', bill);
            
            // Deep copy to avoid modifying the original
            this.editingBill = JSON.parse(JSON.stringify(bill));
            
            // Ensure expenses array exists
            if (!this.editingBill.expenses) {
                this.editingBill.expenses = [];
            }
            
            // Format the dates for proper display in the date inputs (YYYY-MM-DD format)
            // and extract time for the time inputs
            if (this.editingBill.date) {
                const dateObj = new Date(this.editingBill.date);
                if (!isNaN(dateObj.getTime())) {
                    // Set the date part (YYYY-MM-DD)
                    this.editingBill.date = dateObj.toISOString().split('T')[0];
                    
                    // Extract and format the time part (HH:MM)
                    const hours = dateObj.getHours().toString().padStart(2, '0');
                    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
                    this.editingBill.checkInTime = `${hours}:${minutes}`;
                } else {
                    // Default time if date is invalid
                    this.editingBill.checkInTime = '12:00';
                }
            } else {
                this.editingBill.checkInTime = '12:00';
            }
            
            if (this.editingBill.checkOut) {
                const checkOutObj = new Date(this.editingBill.checkOut);
                if (!isNaN(checkOutObj.getTime())) {
                    // Set the date part (YYYY-MM-DD)
                    this.editingBill.checkOut = checkOutObj.toISOString().split('T')[0];
                    
                    // Extract and format the time part (HH:MM)
                    const hours = checkOutObj.getHours().toString().padStart(2, '0');
                    const minutes = checkOutObj.getMinutes().toString().padStart(2, '0');
                    this.editingBill.checkOutTime = `${hours}:${minutes}`;
                } else {
                    // Default time if date is invalid
                    this.editingBill.checkOutTime = '11:00';
                }
            } else {
                this.editingBill.checkOutTime = '11:00';
            }
            
            // Set current ID and enable edit mode
            this.currentBillId = bill.id;
            this.isEditMode = true;
            this.showViewModal = true;
            
            // Log for debugging
            console.log('Edit mode enabled:', this.isEditMode);
            console.log('Modal visible:', this.showViewModal);
            console.log('Formatted dates with times:', 
                this.editingBill.date, this.editingBill.checkInTime, 
                this.editingBill.checkOut, this.editingBill.checkOutTime);
        },
        
        editBill(bill) {
            console.log('Edit bill function called', bill);
            // Deep copy to avoid modifying the original
            this.editingBill = JSON.parse(JSON.stringify(bill));
            
            // Ensure expenses array exists
            if (!this.editingBill.expenses) {
                this.editingBill.expenses = [];
            }
            
            // Set current ID and source
            this.currentBillId = bill.id;
            this.showViewModal = true;
            this.isEditMode = true;
            console.log('Edit mode enabled:', this.isEditMode);
        },
        
        closeViewModal() {
            this.showViewModal = false;
            this.editingBill = null;
            this.currentBillId = null;
            this.isEditMode = false;
        },
        addEditExpense() {
            if (!this.editingBill.expenses) this.editingBill.expenses = [];
            this.editingBill.expenses.push({ description: '', amount: '' });
        },
        removeEditExpense(index) {
            this.editingBill.expenses.splice(index, 1);
        },
        async updateBill() {
            try {
                if (!this.editingBill) return;
                
                // Make sure expenses array exists
                if (!this.editingBill.expenses) {
                    this.editingBill.expenses = [];
                }
                
                // Create a copy of the editing bill to preserve the original
                const billToUpdate = JSON.parse(JSON.stringify(this.editingBill));
                
                // Combine date and time for check-in
                if (billToUpdate.date && billToUpdate.checkInTime) {
                    const [year, month, day] = billToUpdate.date.split('-');
                    const [hours, minutes] = billToUpdate.checkInTime.split(':');
                    
                    const checkInDate = new Date(year, month - 1, day, hours, minutes);
                    billToUpdate.date = checkInDate;
                }
                
                // Combine date and time for check-out
                if (billToUpdate.checkOut && billToUpdate.checkOutTime) {
                    const [year, month, day] = billToUpdate.checkOut.split('-');
                    const [hours, minutes] = billToUpdate.checkOutTime.split(':');
                    
                    const checkOutDate = new Date(year, month - 1, day, hours, minutes);
                    billToUpdate.checkOut = checkOutDate;
                }
                
                // Calculate total amount
                const totalAmount = parseFloat(this.calculateEditTotal);
                billToUpdate.totalAmount = totalAmount;
                
                // Check if this is a booking from everlodgebookings
                if (billToUpdate.source === 'bookings' && this.currentBillId) {
                    // Update in everlodgebookings collection using the dedicated function
                    await updateBookingBilling(this.currentBillId, billToUpdate);
                } else {
                    // Update the bill in everlodgebilling collection
                    await updateBillingRecord(this.currentBillId, billToUpdate);
                }
                
                // Close modal and reload
                this.closeViewModal();
                await this.loadBills();
                
                // Success message
                alert('Bill updated successfully');
            } catch (error) {
                console.error('Error updating bill:', error);
                alert('Error updating bill: ' + error.message);
            }
        },

        forceRefresh() {
            // Hard refresh of the billing data to ensure UI is in sync with Firebase
            console.log("Forcing complete refresh of billing data");
            // Reset all bill data
            this.bills = [];
            this.filteredBills = [];
            this.originalBills = [];
            
            // Clear any cached data in Vue's reactivity system
            Vue.nextTick(() => {
                // Load fresh data after Vue has updated the DOM
                this.loadBills();
            });
        },

        async deleteBill(bill) {
            try {
                console.log("Attempting to delete bill:", bill);
                
                // Check if this is a valid bill
                if (!bill) {
                    alert('Invalid bill selected');
                    return;
                }
                
                // Confirm before deleting
                if (!confirm(`Are you sure you want to delete the bill for ${bill.customerName}?`)) {
                    return;
                }
                
                this.loading = true;
                
                // Handle deletion based on the source of the bill
                if (bill.source === 'bookings') {
                    // For bills from the bookings collection
                    if (!bill.id && !bill.bookingId) {
                        console.error("Cannot delete bill - no valid ID found");
                        alert("Cannot delete this bill - no valid ID found");
                        this.loading = false;
                        return;
                    }
                    
                    // Use bookingId if bill.id is null (meaning this is a booking displayed in billing but not yet saved as a dedicated bill)
                    const bookingId = bill.id || bill.bookingId;
                    console.log("Using booking ID for deletion:", bookingId);
                    
                    // For booking-based bills, we need to check if the actual booking should be deleted
                    if (confirm('This is a booking charge. Do you want to delete the entire booking record as well?')) {
                        console.log("Deleting booking record with ID:", bookingId);
                        // Delete the booking from everlodgebookings
                        await deleteBookingRecord(bookingId);
                        console.log("Booking record deleted successfully");
                    } else {
                        // User chose not to delete the actual booking but hide it from billing view
                        console.log("Marking booking as hidden from billing view, ID:", bookingId);
                        // Create or update a flag in a separate collection to hide this booking
                        await markBookingHiddenInBilling(bookingId);
                        console.log("Booking marked as hidden");
                        alert('The booking record was preserved but hidden from billing view.');
                    }
                } else {
                    // Delete regular billing record from everlodgebilling
                    if (!bill.id) {
                        console.error("Cannot delete custom bill - no valid ID found");
                        alert("Cannot delete this bill - no valid ID found");
                        this.loading = false;
                        return;
                    }
                    
                    console.log("Deleting billing record with ID:", bill.id);
                    await deleteBillingRecord(bill.id);
                    console.log("Billing record deleted successfully");
                }
                
                console.log("Forcing refresh after deletion");
                // Use our special force refresh method to ensure UI is updated
                this.forceRefresh();
                
                // Success message
                this.loading = false;
                alert('Bill deleted successfully');
            } catch (error) {
                this.loading = false;
                console.error('Error deleting bill:', error);
                alert('Error deleting bill: ' + error.message);
            }
        },

        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
            }
        },

        // Date navigation methods
        formatDisplayDate(date) {
            if (!date) return '';
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString(undefined, options);
        },
        
        goToPreviousDay() {
            const prevDay = new Date(this.currentDate);
            prevDay.setDate(prevDay.getDate() - 1);
            this.currentDate = prevDay;
            this.filteredBills = this.filteredBillsByDate;
        },
        
        goToNextDay() {
            const nextDay = new Date(this.currentDate);
            nextDay.setDate(nextDay.getDate() + 1);
            this.currentDate = nextDay;
            this.filteredBills = this.filteredBillsByDate;
        },
        
        goToToday() {
            this.currentDate = new Date();
            this.filteredBills = this.filteredBillsByDate;
        },
        
        filterByView(view) {
            this.view = view;
            
            if (view === 'all') {
                this.filteredBills = [];
            } else if (view === 'bookings') {
                this.filteredBills = this.bills.filter(bill => bill.source === 'bookings' || bill.bookingId);
            } else if (view === 'custom') {
                this.filteredBills = this.bills.filter(bill => bill.source === 'everlodgebilling' && !bill.bookingId);
            } else {
                this.filteredBills = this.filteredBillsByDate;
            }
            
            this.currentPage = 1;
        },

        formatStatus(status) {
            if (!status) return 'N/A';
            
            // Capitalize first letter of each word
            return status.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        },
        
        getStatusClass(status) {
            if (!status) return 'status-na';
            
            status = status.toLowerCase();
            
            if (status === 'paid') return 'status-paid';
            if (status === 'unpaid') return 'status-unpaid';
            if (status === 'pending') return 'status-pending';
            if (status === 'confirmed') return 'status-confirmed';
            if (status === 'canceled' || status === 'cancelled') return 'status-canceled';
            
            return 'status-na';
        }
    },
    async mounted() {
        this.checkAuthState();
        await this.loadBills();
    }
});

// Initialize page logging through PageLogger
auth.onAuthStateChanged((user) => {
    if (user) {
        PageLogger.logNavigation('Billing');
    }
});

// Common billing operations
function addChargeRow() {
    // ...existing addChargeRow code...
    logBillingActivity('billing_add_item', 'Added new charge row');
}

function calculateTotal() {
    // ...existing calculateTotal code...
    logBillingActivity('billing_calculate', 'Recalculated bill total');
}
