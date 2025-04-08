import { 
    auth, 
    db, 
    collection, 
    addDoc,
    doc,
    deleteDoc,  // Add this import
    updateDoc,
    Timestamp,
    getDocs,
    query,
    orderBy
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
                expenses: []
            },
            bills: [],
            filteredBills: [], // Add this new property
            showViewModal: false,
            editingBill: null,
            currentBillId: null,
            sortDate: '',
            originalBills: [], // To keep a copy of unsorted bills
            currentPage: 1,
            itemsPerPage: 10,
        }
    },
    computed: {
        calculateTotal() {
            if (!this.newBill.expenses) return '0.00';
            return this.newBill.expenses
                .reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0)
                .toFixed(2);
        },
        calculateEditTotal() {
            if (!this.editingBill?.expenses) return '0.00';
            return this.editingBill.expenses
                .reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0)
                .toFixed(2);
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

        // Add logging to existing methods
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
                const billsQuery = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
                const querySnapshot = await getDocs(billsQuery);
                this.bills = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                this.originalBills = [...this.bills]; // Keep a copy
                this.filteredBills = []; // Reset filtered bills when loading new data
            } catch (error) {
                console.error('Error loading bills:', error);
            }
        },

        sortBills() {
            if (!this.sortDate) {
                this.bills = [...this.originalBills]; // Reset to original order
                return;
            }

            const selectedDate = new Date(this.sortDate);
            selectedDate.setHours(0, 0, 0, 0); // Reset time to start of day

            this.bills.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                
                // Find the difference from the selected date
                const diffA = Math.abs(dateA - selectedDate);
                const diffB = Math.abs(dateB - selectedDate);
                
                return diffA - diffB; // Sort by closest to selected date
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
                const billData = {
                    ...this.newBill,
                    totalAmount: parseFloat(this.calculateTotal),
                    createdAt: new Date(),
                    userId: auth.currentUser.uid
                };
                
                await addDoc(collection(db, 'bills'), billData);
                await logBillingActivity('create_bill', `Created new bill for ${this.newBill.customerName}`);
                
                this.closeModal();
                await this.loadBills(); // Reload bills after adding new one
            } catch (error) {
                console.error('Error creating bill:', error);
                await logBillingActivity('billing_error', `Failed to create bill: ${error.message}`);
            }
        },

        viewBill(bill) {
            this.editingBill = JSON.parse(JSON.stringify(bill)); // Deep copy
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
                const billRef = doc(db, 'bills', this.currentBillId);
                const updateData = {
                    ...this.editingBill,
                    totalAmount: parseFloat(this.calculateEditTotal),
                    updatedAt: new Date()
                };
                
                await updateDoc(billRef, updateData);
                await logBillingActivity('update_bill', `Updated bill for ${this.editingBill.customerName}`);
                
                this.closeViewModal();
                await this.loadBills();
            } catch (error) {
                console.error('Error updating bill:', error);
                await logBillingActivity('billing_error', `Failed to update bill: ${error.message}`);
            }
        },

        async deleteBill(bill) {
            try {
                if (!confirm('Are you sure you want to delete this bill?')) {
                    return;
                }

                const billRef = doc(db, 'bills', bill.id);
                await deleteDoc(billRef);
                await logBillingActivity('delete_bill', `Deleted bill for ${bill.customerName}`);
                
                // Remove from local state
                this.bills = this.bills.filter(b => b.id !== bill.id);
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
        }
    },
    async mounted() {
        this.checkAuthState();
        await this.loadBills(); // Load bills when component mounts
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

// ...rest of the existing code...
