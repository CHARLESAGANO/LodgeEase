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
// Import updated rate calculation module
import { 
    calculateNights, 
    calculateHours,
    isNightPromoEligible, 
    getHourlyRate,
    calculateBookingCosts 
} from '../js/rateCalculation.js';

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

// Function to fetch booking data by ID
async function fetchBookingById(bookingId) {
    try {
        const bookingDocRef = doc(db, 'everlodgebookings', bookingId);
        const bookingDoc = await getDoc(bookingDocRef);
        
        if (bookingDoc.exists()) {
            return {
                id: bookingDoc.id,
                ...bookingDoc.data()
            };
        } else {
            console.log(`No booking found with ID: ${bookingId}`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching booking:', error);
        throw error;
    }
}

// Function to update booking in Room Management
async function updateBookingInRoomManagement(bookingId, updateData) {
    try {
        if (!bookingId) throw new Error('No booking ID provided');
        
        // Get the current booking data
        const bookingRef = doc(db, 'everlodgebookings', bookingId);
        const bookingDoc = await getDoc(bookingRef);
        
        if (!bookingDoc.exists()) {
            throw new Error(`Booking with ID ${bookingId} not found`);
        }
        
        // Update the booking with new data
        await updateDoc(bookingRef, updateData);
        
        return true;
    } catch (error) {
        console.error('Error updating booking in Room Management:', error);
        throw error;
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
                expenses: [],
                bookingType: 'standard', // Added: standard, night-promo, or hourly
                duration: 3, // Added: for hourly bookings
                hasTvRemote: false // Added TV remote option
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
            isEditMode: false,
            
            // Constants for billing calculations
            REMOTE_BOOKING_FEE: 50, // PHP
            TV_REMOTE_FEE: 50, // PHP
            SERVICE_FEE_PERCENTAGE: 0.05, // 5%
        }
    },
    computed: {
        calculateTotal() {
            let total = 0;
            
            // Add base cost
            total += parseFloat(this.newBill.baseCost) || 0;
            
            // Add service fee
            total += parseFloat(this.newBill.serviceFee) || 0;
            
            // Add TV remote fee if applicable
            if (this.newBill.hasTvRemote) {
                total += this.TV_REMOTE_FEE;
            }
            
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
            // Get current date for filtering with time set to start of day
            const today = new Date(this.currentDate);
            today.setHours(0, 0, 0, 0);
            
            // Get end of day for the current date
            const endOfDay = new Date(this.currentDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            return this.bills.filter(bill => {
                // Skip bills without date info
                if (!bill.date) return false;
                
                // Convert bill date to Date object if it's not already
                const billDate = bill.date instanceof Date ? bill.date : new Date(bill.date);
                
                // Check if bill date is within the current day or check-out date is within current day
                // Or if the stay spans over the current day (checked in before and checking out after)
                if (bill.checkOut) {
                    const checkOutDate = bill.checkOut instanceof Date ? bill.checkOut : new Date(bill.checkOut);
                    
                    return (
                        // Check-in is on the selected day
                        (billDate >= today && billDate <= endOfDay) ||
                        // Check-out is on the selected day
                        (checkOutDate >= today && checkOutDate <= endOfDay) ||
                        // Stay spans over the selected day
                        (billDate < today && checkOutDate > today)
                    );
                } else {
                    // If no check-out date, just check if bill date is on the current day
                    return billDate >= today && billDate <= endOfDay;
                }
            });
        },
        calculateBaseCost() {
            let baseCost = 0;
            
            // Check if dates are provided
            if (!this.newBill.date) return 0;
            
            // Get check-in date/time
            const checkInDateTime = new Date(this.newBill.date);
            const [checkInHours, checkInMinutes] = this.newBill.checkInTime.split(':').map(Number);
            checkInDateTime.setHours(checkInHours, checkInMinutes, 0);
            
            // Calculate checkout date/time
            let checkOutDateTime = null;
            
            if (this.newBill.checkOut) {
                checkOutDateTime = new Date(this.newBill.checkOut);
                const [checkOutHours, checkOutMinutes] = this.newBill.checkOutTime.split(':').map(Number);
                checkOutDateTime.setHours(checkOutHours, checkOutMinutes, 0);
            } else if (this.newBill.bookingType === 'hourly') {
                // For hourly bookings without checkout, use duration
                checkOutDateTime = new Date(checkInDateTime);
                checkOutDateTime.setHours(checkOutDateTime.getHours() + parseInt(this.newBill.duration));
            } else {
                // Default to 3 hour stay
                checkOutDateTime = new Date(checkInDateTime);
                checkOutDateTime.setHours(checkOutDateTime.getHours() + 3);
            }
            
            // Calculate nights and hours
            const nights = calculateNights(checkInDateTime, checkOutDateTime);
            const hours = this.newBill.bookingType === 'hourly' ? parseInt(this.newBill.duration) : calculateHours(checkInDateTime, checkOutDateTime);
            
            // Get calculated costs
            const bookingCosts = calculateBookingCosts(
                nights,
                this.newBill.bookingType,
                Boolean(this.newBill.checkOut), // Has checkout
                this.newBill.hasTvRemote,
                hours
            );
            
            // Return the calculated subtotal
            return bookingCosts.subtotal;
        },
        calculateServiceFee() {
            // Get base cost
            const baseCost = this.calculateBaseCost;
            
            // Calculate service fee (14%)
            return baseCost * 0.14;
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
                expenses: [],
                bookingType: 'standard',
                duration: 3,
                hasTvRemote: false
            };
        },
        addExpense() {
            this.newBill.expenses.push({ description: '', amount: 0 });
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
                    if (bill.date) {
                        if (typeof bill.date === 'object' && bill.date.seconds) {
                            // Firestore Timestamp object
                            bill.date = new Date(bill.date.seconds * 1000);
                        } else if (!(bill.date instanceof Date)) {
                            // Date string
                            bill.date = new Date(bill.date);
                        }
                    }
                    
                    if (bill.checkOut) {
                        if (typeof bill.checkOut === 'object' && bill.checkOut.seconds) {
                            // Firestore Timestamp object
                            bill.checkOut = new Date(bill.checkOut.seconds * 1000);
                        } else if (!(bill.checkOut instanceof Date)) {
                            // Date string
                            bill.checkOut = new Date(bill.checkOut);
                        }
                    }
                    
                    // Calculate stay duration for display
                    if (bill.date && bill.checkOut) {
                        const checkIn = new Date(bill.date);
                        const checkOut = new Date(bill.checkOut);
                        bill.duration = calculateNights(checkIn, checkOut);
                    } else {
                        bill.duration = 'N/A';
                    }
                    
                    return bill;
                });
                
                console.log("Processed bills:", this.bills);
                
                // Store original copy for filtering
                this.originalBills = [...this.bills];
                
                // Set loading to false
                this.loading = false;
            } catch (error) {
                console.error("Error loading bills:", error);
                alert("Failed to load billing data. Please try again.");
                this.loading = false;
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

            // Create date objects with time boundaries
            const selectedDate = new Date(this.sortDate);
            selectedDate.setHours(0, 0, 0, 0);
            
            const endOfSelectedDate = new Date(this.sortDate);
            endOfSelectedDate.setHours(23, 59, 59, 999);

            this.filteredBills = this.bills.filter(bill => {
                // Skip bills without date info
                if (!bill.date) return false;
                
                // Convert bill dates to Date objects
                const billDate = bill.date instanceof Date ? bill.date : new Date(bill.date);
                
                // Check if any part of the stay overlaps with the selected date
                if (bill.checkOut) {
                    const checkOutDate = bill.checkOut instanceof Date ? bill.checkOut : new Date(bill.checkOut);
                    
                    return (
                        // Check-in is on the selected day
                        (billDate >= selectedDate && billDate <= endOfSelectedDate) ||
                        // Check-out is on the selected day
                        (checkOutDate >= selectedDate && checkOutDate <= endOfSelectedDate) ||
                        // Stay spans over the selected day
                        (billDate < selectedDate && checkOutDate > selectedDate)
                    );
                } else {
                    // If no check-out date, just check if bill date is on the selected day
                    return billDate >= selectedDate && billDate <= endOfSelectedDate;
                }
            });

            // Reset to first page when filtering
            this.currentPage = 1;
        },

        resetFilter() {
            // Clear the date filter
            this.sortDate = '';
            this.filteredBills = [];
            this.currentPage = 1;
            
            // Reset view filter to "all"
            this.view = 'all';
        },

        formatDate(date) {
            if (!date) return 'N/A';
            
            try {
                // Convert to Date object if not already
                const dateObj = date instanceof Date ? date : new Date(date);
                
                // Check if date is valid
                if (isNaN(dateObj.getTime())) return 'Invalid date';
                
                // Format date with time
                return dateObj.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                console.error('Error formatting date:', error);
                return 'Error';
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
            this.isEditMode = false;
        },
        
        openEditModal(bill) {
            this.editingBill = {
                ...bill,
                expenses: bill.expenses ? [...bill.expenses] : [],
                bookingType: bill.bookingType || 'standard',
                duration: bill.duration || 3,
                hasTvRemote: bill.hasTvRemote || false
            };
            
            this.currentBillId = bill.id;
            this.isEditMode = true;
            this.showModal = true;
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
                this.loading = true;
                
                // Format check-in date with time
                const checkInDateTime = new Date(this.editingBill.date);
                const [checkInHours, checkInMinutes] = this.editingBill.checkInTime.split(':').map(Number);
                checkInDateTime.setHours(checkInHours, checkInMinutes, 0);
                
                // Format check-out date with time if provided
                let checkOutDateTime = null;
                if (this.editingBill.checkOut) {
                    checkOutDateTime = new Date(this.editingBill.checkOut);
                    const [checkOutHours, checkOutMinutes] = this.editingBill.checkOutTime.split(':').map(Number);
                    checkOutDateTime.setHours(checkOutHours, checkOutMinutes, 0);
                } else if (this.editingBill.bookingType === 'hourly') {
                    // For hourly bookings without checkout, calculate based on duration
                    checkOutDateTime = new Date(checkInDateTime);
                    checkOutDateTime.setHours(checkOutDateTime.getHours() + parseInt(this.editingBill.duration || 3));
                } else {
                    // Default to 3 hour stay
                    checkOutDateTime = new Date(checkInDateTime);
                    checkOutDateTime.setHours(checkOutDateTime.getHours() + 3);
                }
                
                // Calculate nights and hours
                const nights = calculateNights(checkInDateTime, checkOutDateTime);
                const hours = this.editingBill.bookingType === 'hourly' ? 
                    parseInt(this.editingBill.duration) : 
                    calculateHours(checkInDateTime, checkOutDateTime);
                
                // Get calculated costs with updated parameters
                const bookingCosts = calculateBookingCosts(
                    nights,
                    this.editingBill.bookingType,
                    Boolean(this.editingBill.checkOut),
                    this.editingBill.hasTvRemote,
                    hours
                );
                
                // Prepare the update data
                const updateData = {
                    customerName: this.editingBill.customerName,
                    date: Timestamp.fromDate(checkInDateTime),
                    checkInTime: this.editingBill.checkInTime,
                    checkOut: this.editingBill.checkOut ? Timestamp.fromDate(checkOutDateTime) : null,
                    checkOutTime: this.editingBill.checkOutTime,
                    roomNumber: this.editingBill.roomNumber,
                    roomType: this.editingBill.roomType,
                    
                    // Use the calculated values
                    baseCost: bookingCosts.subtotal,
                    serviceFee: bookingCosts.serviceFeeAmount,
                    totalAmount: bookingCosts.totalAmount,
                    
                    // Add new fields
                    bookingType: this.editingBill.bookingType,
                    duration: this.editingBill.bookingType === 'hourly' ? parseInt(this.editingBill.duration) : null,
                    hasTvRemote: this.editingBill.hasTvRemote,
                    tvRemoteFee: this.editingBill.hasTvRemote ? this.TV_REMOTE_FEE : 0,
                    
                    expenses: this.editingBill.expenses || [],
                    status: this.editingBill.status,
                    paymentStatus: this.editingBill.paymentStatus,
                    updatedAt: Timestamp.now()
                };
                
                // Calculate total amount including expenses
                let totalAmount = bookingCosts.totalAmount;
                if (this.editingBill.expenses && this.editingBill.expenses.length > 0) {
                    totalAmount += this.editingBill.expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
                }
                updateData.totalAmount = totalAmount;
                
                // Update the bill
                await updateBillingRecord(this.currentBillId, updateData);
                
                // If this record is linked to a booking, update the booking as well
                if (this.editingBill.bookingId) {
                    try {
                        const bookingUpdateData = {
                            guestName: this.editingBill.customerName,
                            checkIn: Timestamp.fromDate(checkInDateTime),
                            checkOut: this.editingBill.checkOut ? Timestamp.fromDate(checkOutDateTime) : null,
                            subtotal: bookingCosts.subtotal,
                            serviceFee: bookingCosts.serviceFeeAmount,
                            totalPrice: totalAmount,
                            bookingType: this.editingBill.bookingType,
                            duration: this.editingBill.bookingType === 'hourly' ? parseInt(this.editingBill.duration) : null,
                            hasTvRemote: this.editingBill.hasTvRemote,
                            updatedAt: Timestamp.now()
                        };
                        
                        // Update the corresponding booking
                        await updateBookingInRoomManagement(this.editingBill.bookingId, bookingUpdateData);
                        console.log(`Updated corresponding booking ${this.editingBill.bookingId}`);
                    } catch (bookingError) {
                        console.error('Error updating booking:', bookingError);
                        // Continue with bill update even if booking update fails
                    }
                }
                
                // Log the activity
                await logBillingActivity(
                    'bill_updated',
                    `Updated billing record for ${this.editingBill.customerName}, Room ${this.editingBill.roomNumber}`
                );
                
                this.showModal = false;
                this.isEditMode = false;
                this.editingBill = null;
                this.currentBillId = null;
                
                // Refresh the bills
                await this.loadBills();
                
                alert('Bill updated successfully!');
                
            } catch (error) {
                console.error('Error updating bill:', error);
                alert('Failed to update bill: ' + error.message);
            } finally {
                this.loading = false;
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
            // Reset filter selections and apply date filter
            this.sortDate = '';
            this.filteredBills = this.filteredBillsByDate;
        },
        
        goToNextDay() {
            const nextDay = new Date(this.currentDate);
            nextDay.setDate(nextDay.getDate() + 1);
            this.currentDate = nextDay;
            // Reset filter selections and apply date filter
            this.sortDate = '';
            this.filteredBills = this.filteredBillsByDate;
        },
        
        goToToday() {
            this.currentDate = new Date();
            // Reset filter selections and apply date filter
            this.sortDate = '';
            this.filteredBills = this.filteredBillsByDate;
        },
        
        filterByView(view) {
            this.view = view;
            
            // Reset to first page
            this.currentPage = 1;
            
            if (view === 'all') {
                this.filteredBills = [];
            } else if (view === 'bookings') {
                this.filteredBills = this.bills.filter(bill => bill.source === 'bookings' || bill.bookingId);
            } else if (view === 'custom') {
                this.filteredBills = this.bills.filter(bill => bill.source !== 'bookings' && !bill.bookingId);
            } else if (view === 'today') {
                this.filteredBills = this.filteredBillsByDate;
            }
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
        },

        calculateTotalAmount(booking) {
            if (!booking) return 0;
            
            let subtotal = this.calculateSubtotal(booking);
            let serviceFee = this.calculateServiceFee(booking);
            let tvRemoteFee = booking.hasTvRemote ? this.TV_REMOTE_FEE : 0;
            
            return subtotal + serviceFee + tvRemoteFee;
        },
        
        calculateServiceFee(booking) {
            if (!booking) return 0;
            
            let subtotal = this.calculateSubtotal(booking);
            return subtotal * this.SERVICE_FEE_PERCENTAGE;
        },
        
        generateInvoiceDetail(booking) {
            if (!booking) return null;
            
            let subtotal = this.calculateSubtotal(booking);
            let serviceFee = this.calculateServiceFee(booking);
            let tvRemoteFee = booking.hasTvRemote ? this.TV_REMOTE_FEE : 0;
            let total = subtotal + serviceFee + tvRemoteFee;
            
            return {
                invoiceId: this.generateInvoiceId(),
                roomNumber: booking.roomNumber,
                guestName: booking.guestName,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut || this.calculateAutoCheckout(booking.checkIn),
                stayDuration: this.calculateStayDuration(booking),
                stayType: this.determineStayType(booking),
                roomRate: this.calculateRoomRate(booking),
                subtotal: subtotal,
                serviceFee: serviceFee,
                tvRemoteFee: tvRemoteFee,
                total: total,
                paymentStatus: 'Pending',
                dateCreated: new Date().toISOString(),
                dateUpdated: new Date().toISOString()
            };
        },
        
        displayInvoice(invoice) {
            if (!invoice) return;
            
            this.currentInvoice = invoice;
            this.showInvoiceModal = true;
            
            // Prepare data for printing
            this.prepareInvoicePrintData(invoice);
        },
        
        prepareInvoicePrintData(invoice) {
            this.invoicePrintData = {
                invoiceId: invoice.invoiceId,
                invoiceDate: this.formatDateTime(invoice.dateCreated),
                guestName: invoice.guestName,
                roomNumber: invoice.roomNumber,
                checkIn: this.formatDateTime(invoice.checkIn),
                checkOut: this.formatDateTime(invoice.checkOut),
                stayDuration: invoice.stayDuration + ' ' + (invoice.stayType === 'hourly' ? 'hour(s)' : 'night(s)'),
                stayType: this.capitalizeFirstLetter(invoice.stayType),
                roomRate: this.formatCurrency(invoice.roomRate),
                subtotal: this.formatCurrency(invoice.subtotal),
                serviceFee: this.formatCurrency(invoice.serviceFee),
                tvRemoteFee: invoice.tvRemoteFee > 0 ? this.formatCurrency(invoice.tvRemoteFee) : '₱0.00',
                total: this.formatCurrency(invoice.total),
                paymentStatus: invoice.paymentStatus
            };
        },
        updateBookingTypeAndPricing() {
            // Calculate the base cost based on the selected booking type
            this.newBill.baseCost = this.calculateBaseCost;
            this.newBill.serviceFee = this.calculateServiceFee;
        },
    },
    async mounted() {
        try {
            console.log('Billing component mounted');
            
            // Check authentication
            this.checkAuthState();
            
            // Load bills data
            await this.loadBills();
            
            // Initialize with today's date filter
            this.filteredBills = this.filteredBillsByDate;
            
            console.log('Bills initialized with today\'s date filter');
        } catch (error) {
            console.error('Error during component initialization:', error);
        }
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
