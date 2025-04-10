import { 
    auth, 
    db, 
    fetchBillingData,
    addBillingRecord,
    updateBillingRecord,
    deleteBillingRecord,
    collection, 
    addDoc,
    doc,
    deleteDoc,
    updateDoc,
    Timestamp,
    getDocs,
    query,
    orderBy,
    where
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
                checkOut: '',
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
            view: 'all' 
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
                checkOut: '',
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
                
                // Use the fetchBillingData function from firebase.js
                const bills = await fetchBillingData();
                
                // Process the bills
                this.bills = bills.map(bill => {
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

                    console.log('Processed bill:', bill);
                    return bill;
                });
                
                this.originalBills = [...this.bills];
                this.filteredBills = this.filteredBillsByDate;
                this.loading = false;
            } catch (error) {
                console.error('Error loading bills:', error);
                this.loading = false;
                alert('Failed to load billing data. Please refresh the page or try again later.');
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

        async submitBill() {
            try {
                if (!this.newBill.expenses) {
                    this.newBill.expenses = [];
                }
                
                // Add the bill record
                await addBillingRecord(this.newBill);
                
                // Reset and close modal
                this.resetNewBill();
                this.closeModal();
                
                // Reload bills to show the new one
                await this.loadBills();
                
                // Success message
                alert('Bill created successfully');
            } catch (error) {
                console.error('Error creating bill:', error);
                alert('Error creating bill: ' + error.message);
            }
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
        },
        closeViewModal() {
            this.showViewModal = false;
            this.editingBill = null;
            this.currentBillId = null;
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
                
                // Update the bill
                await updateBillingRecord(this.currentBillId, this.editingBill);
                
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

        async deleteBill(bill) {
            try {
                // Confirm before deleting
                if (!confirm(`Are you sure you want to delete the bill for ${bill.customerName}?`)) {
                    return;
                }
                
                // Delete the bill
                await deleteBillingRecord(bill.id);
                
                // Reload bills
                await this.loadBills();
                
                // Success message
                alert('Bill deleted successfully');
            } catch (error) {
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
