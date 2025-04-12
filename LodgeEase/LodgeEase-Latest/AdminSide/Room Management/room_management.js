import { db, auth, app } from '../firebase.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    doc, 
    updateDoc, 
    deleteDoc, 
    Timestamp,
    where,
    getDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { PageLogger } from '../js/pageLogger.js';
import { ActivityLogger } from '../ActivityLog/activityLogger.js';
// Import rate calculation module
import { calculateNights, isNightPromoEligible, calculateBookingCosts } from '../js/rateCalculation.js';

const activityLogger = new ActivityLogger();

// Add activity logging function
async function logRoomActivity(actionType, details) {
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
            module: 'Room Management'
        });
    } catch (error) {
        console.error('Error logging room activity:', error);
    }
}

// Update the deleteRoom function
async function deleteRoom(roomId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            alert('Please log in to delete rooms');
            return;
        }

        // Get room details before deletion
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        if (!roomDoc.exists()) {
            throw new Error('Room not found');
        }

        const roomData = roomDoc.data();
        const roomDetails = `${roomData.propertyDetails.name} - Room ${roomData.propertyDetails.roomNumber} (${roomData.propertyDetails.roomType})`;

        // Confirm deletion
        if (!confirm(`Are you sure you want to delete ${roomDetails}?`)) {
            return;
        }

        // Delete the room
        await deleteDoc(doc(db, 'rooms', roomId));

        // Log the deletion activity
        await activityLogger.logActivity(
            'room_deletion',
            `Room deleted: ${roomDetails}`,
            'Room Management'
        );

        // Show success message
        alert('Room deleted successfully');

    } catch (error) {
        console.error('Error deleting room:', error);
        alert('Error deleting room: ' + error.message);
    }
}

new Vue({
    el: '#app',
    data: {
        bookings: [],
        rooms: [],
        searchQuery: '',
        loading: true,
        selectedBooking: null,
        isAuthenticated: false,
        showManualBookingModal: false,
        currentDate: new Date(), // Added for date navigation
        establishments: {
            lodge1: {
                name: 'Pine Haven Lodge',
                location: 'Baguio City'
            },
            lodge2: {
                name: 'Mountain View Lodge',
                location: 'La Trinidad'
            }
        },
        availableRooms: [],
        manualBooking: {
            guestName: '',
            roomNumber: '',
            status: 'Confirmed',
            checkIn: '',
            checkOut: '',
            checkInTime: 'standard', // Add check-in time option
            guests: 1, // Add guests count
            contactNumber: '', // Add contact number
            email: '' // Add email
        },
        startDate: '',
        endDate: '',
        editMode: false,
        // Add these missing properties to fix Vue warnings
        showAddRoomModal: false,
        showAddRoomToLodgeModal: false,
        showClientRoomsModal: false,
    },
    computed: {
        filteredBookings() {
            // Start with a copy of the bookings array
            let filtered = [...this.bookings];

            // Apply search query filter
            const query = this.searchQuery.toLowerCase();
            if (query) {
                filtered = filtered.filter(booking => {
                    const roomNumber = (booking.propertyDetails?.roomNumber || '').toString().toLowerCase();
                    const roomType = (booking.propertyDetails?.roomType || '').toString().toLowerCase();
                    const guestName = (booking.guestName || '').toLowerCase();
                    const status = (booking.status || '').toLowerCase();
                    
                    return roomNumber.includes(query) || 
                           roomType.includes(query) ||
                           guestName.includes(query) ||
                           status.includes(query);
                });
            }

            // If explicit date range is set, use that filter
            if (this.startDate && this.endDate) {
                const start = new Date(this.startDate);
                const end = new Date(this.endDate);
                end.setHours(23, 59, 59); // Include the entire end date

                filtered = filtered.filter(booking => {
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : new Date(booking.checkIn);
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : new Date(booking.checkOut);
                    
                    // Check if the booking period overlaps with the selected date range
                    return checkIn <= end && checkOut >= start;
                });
            } else {
                // Otherwise, filter by the current date in the date navigation
                // Set start and end of the selected date
                const selectedDate = new Date(this.currentDate);
                selectedDate.setHours(0, 0, 0, 0); // Start of the selected date
                
                const endOfSelectedDate = new Date(this.currentDate);
                endOfSelectedDate.setHours(23, 59, 59, 999); // End of the selected date
                
                filtered = filtered.filter(booking => {
                    // Skip non-date bookings
                    if (!booking.checkIn || !booking.checkOut) return false;
                    
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : new Date(booking.checkIn);
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : new Date(booking.checkOut);
                    
                    // Show bookings where:
                    // 1. Check-in is on the selected date, or
                    // 2. Check-out is on the selected date, or
                    // 3. The booking spans the selected date (check-in before and check-out after)
                    return (
                        (checkIn >= selectedDate && checkIn <= endOfSelectedDate) || // Checks in on the selected date
                        (checkOut >= selectedDate && checkOut <= endOfSelectedDate) || // Checks out on the selected date
                        (checkIn < selectedDate && checkOut > endOfSelectedDate) // Spans over the selected date
                    );
                });
            }

            return filtered;
        },

        minCheckInDate() {
            const now = new Date();
            return now.toISOString().slice(0, 16); // Format: YYYY-MM-DDThh:mm
        },

        calculateNights() {
            if (!this.manualBooking.checkIn || !this.manualBooking.checkOut) return 0;
            return calculateNights(this.manualBooking.checkIn, this.manualBooking.checkOut);
        },

        isNightPromoEligible() {
            return isNightPromoEligible(this.calculateNights);
        },

        calculateRoomRate() {
            const nights = this.calculateNights;
            if (nights === 0) return 0;
            
            // Use the imported rate calculation
            const { nightlyRate } = calculateBookingCosts(nights, this.manualBooking.checkInTime);
            return nightlyRate;
        },

        calculateSubtotal() {
            const nights = this.calculateNights;
            if (nights === 0) return 0;
            
            const { subtotal } = calculateBookingCosts(nights, this.manualBooking.checkInTime);
            return subtotal;
        },

        calculateServiceFee() {
            const nights = this.calculateNights;
            if (nights === 0) return 0;
            
            const { serviceFeeAmount } = calculateBookingCosts(nights, this.manualBooking.checkInTime);
            return serviceFeeAmount;
        },

        calculateTotal() {
            const nights = this.calculateNights;
            if (nights === 0) return 0;
            
            const { totalAmount } = calculateBookingCosts(nights, this.manualBooking.checkInTime);
            return totalAmount;
        },

        previewImage() {
            if (this.selectedImages.length > 0) {
                return this.selectedImages[0].url;
            }
            return this.defaultImage; // Use the instance property
        },
        
        isPreviewBestValue() {
            // Logic to determine if this lodge should be marked as "best value"
            // For example, if it has a promo price and the discount is substantial
            if (!this.newLodge.price || !this.newLodge.promoPrice) return false;
            
            const regularPrice = parseFloat(this.newLodge.price);
            const promoPrice = parseFloat(this.newLodge.promoPrice);
            
            // If discount is more than 50%
            return promoPrice < (regularPrice * 0.5);
        },
        
        isFormValid() {
            return this.newLodge.name && 
                   this.newLodge.location && 
                   this.newLodge.barangay && 
                   this.newLodge.price && 
                   this.newLodge.propertyType && 
                   this.newLodge.description &&
                   this.newLodge.amenities.length >= 2 &&
                   this.selectedImages.length > 0;
        },
        isRoomFormValid() {
            return this.newRoom.lodgeId && 
                   this.newRoom.roomNumber && 
                   this.newRoom.roomType && 
                   this.newRoom.floorLevel && 
                   this.newRoom.price && 
                   this.newRoom.description &&
                   this.roomImages.length > 0;
        },
        
        isManualBookingFormValid() {
            return this.manualBooking.guestName.trim() !== '' &&
                this.manualBooking.checkIn !== '' &&
                this.manualBooking.checkOut !== '' &&
                this.manualBooking.roomNumber !== '' &&
                // Check if contact number is valid
                /^[0-9]{11}$/.test(this.manualBooking.contactNumber.trim()) &&
                // Validate guests
                this.manualBooking.guests >= 1 && this.manualBooking.guests <= 4;
        },
    },
    methods: {
        async fetchBookings() {
            try {
                console.log('Starting to fetch bookings...');
                this.loading = true;

                // Fetch all bookings from everlodgebookings collection
                const bookingsRef = collection(db, 'everlodgebookings');
                const bookingsQuery = query(bookingsRef, orderBy('createdAt', 'desc')); // Sort by creation date
                const bookingsSnapshot = await getDocs(bookingsQuery);

                // Map the bookings data
                this.bookings = bookingsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    console.log('Raw booking data:', data);

                    return {
                        id: doc.id,
                        ...data,
                        propertyDetails: {
                            roomNumber: data.roomNumber || data.propertyDetails?.roomNumber || 'N/A',
                            roomType: data.roomType || data.propertyDetails?.roomType || 'N/A',
                            floorLevel: data.floorLevel || data.propertyDetails?.floorLevel || 'N/A',
                            name: data.propertyName || data.propertyDetails?.name || 'N/A',
                            location: data.location || data.propertyDetails?.location || 'N/A'
                        },
                        guestName: data.guestName || data.guest?.name || 'N/A',
                        email: data.email || data.guest?.email || 'N/A',
                        contactNumber: data.contactNumber || data.guest?.contact || 'N/A',
                        checkIn: data.checkIn?.toDate?.() || new Date(data.checkIn) || null,
                        checkOut: data.checkOut?.toDate?.() || new Date(data.checkOut) || null,
                        status: this.determineStatus(data),
                        totalPrice: data.totalPrice || 0,
                        serviceFee: data.serviceFee || 0,
                    };
                });

                console.log('Fetched bookings:', this.bookings);
                this.loading = false;
            } catch (error) {
                console.error('Error fetching bookings:', error);
                this.loading = false;
                alert('Failed to fetch bookings: ' + error.message);
            }
        },

        determineStatus(booking) {
            if (!booking.checkIn || !booking.checkOut) return 'Available';
            
            const now = new Date();
            const checkIn = booking.checkIn?.toDate?.() || new Date(booking.checkIn);
            const checkOut = booking.checkOut?.toDate?.() || new Date(booking.checkOut);

            if (now < checkIn) return 'Confirmed';
            if (now >= checkIn && now <= checkOut) return 'Checked In';
            if (now > checkOut) return 'Checked Out';
            
            return booking.status || 'Pending';
        },

        formatDate(date) {
            if (!date) return '-';
            try {
                if (typeof date === 'string') date = new Date(date);
                if (date.toDate) date = date.toDate();
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                console.error('Date formatting error:', error);
                return '-';
            }
        },

        async checkAdminStatus(user) {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    return userDoc.data().role === 'admin';
                }
                return false;
            } catch (error) {
                console.error('Error checking admin status:', error);
                return false;
            }
        },

        async updateBookingStatus(booking) {
            try {
                this.loading = true;
                console.log('Updating booking status...');

                // Update booking in everlodgebookings collection
                const bookingRef = doc(db, 'everlodgebookings', booking.id);
                await updateDoc(bookingRef, {
                    status: booking.status,
                    updatedAt: Timestamp.now()
                });

                // Log the activity
                await activityLogger.logActivity(
                    'booking_status_update',
                    `Booking status updated to ${booking.status} for guest/plate: ${booking.guestName}`,
                    'Room Management'
                );

                // Refresh bookings list
                await this.fetchBookings();

                alert('Booking status updated successfully!');
            } catch (error) {
                console.error('Error updating booking status:', error);
                alert('Failed to update booking status: ' + error.message);
            } finally {
                this.loading = false;
            }
        },

        async editBooking(booking) {
            this.selectedBooking = { ...booking };
            this.editMode = true;
            
            // Open the modal with edit form
            // The HTML template has this modal already set up
        },
        
        async saveBookingChanges() {
            try {
                this.loading = true;
                console.log('Saving booking changes...');

                if (!this.selectedBooking || !this.selectedBooking.id) {
                    throw new Error('No booking selected for editing');
                }

                // Update booking in everlodgebookings collection
                const bookingRef = doc(db, 'everlodgebookings', this.selectedBooking.id);
                
                // Prepare update data
                const updateData = {
                    guestName: this.selectedBooking.guestName,
                    email: this.selectedBooking.email,
                    contactNumber: this.selectedBooking.contactNumber,
                    guests: this.selectedBooking.guests,
                    status: this.selectedBooking.status,
                    propertyDetails: {
                        roomNumber: this.selectedBooking.propertyDetails.roomNumber,
                        roomType: this.selectedBooking.propertyDetails.roomType,
                        floorLevel: this.selectedBooking.propertyDetails.floorLevel,
                        name: this.selectedBooking.propertyDetails.name,
                        location: this.selectedBooking.propertyDetails.location
                    },
                    checkIn: this.selectedBooking.checkIn,
                    checkOut: this.selectedBooking.checkOut,
                    updatedAt: Timestamp.now()
                };

                await updateDoc(bookingRef, updateData);

                // Log the activity
                await activityLogger.logActivity(
                    'booking_update',
                    `Booking updated for guest/plate: ${this.selectedBooking.guestName}`,
                    'Room Management'
                );

                // Close the modal and refresh bookings list
                this.closeModal();
                await this.fetchBookings();

                alert('Booking updated successfully!');
            } catch (error) {
                console.error('Error updating booking:', error);
                alert('Failed to update booking: ' + error.message);
            } finally {
                this.loading = false;
                this.editMode = false;
            }
        },

        // Update the deleteBooking function
        async deleteBooking(booking) {
            try {
                if (!booking.id) {
                    alert('Cannot delete a booking without an ID');
                    return;
                }

                const user = auth.currentUser;
                if (!user) {
                    alert('Please log in to delete bookings');
                    return;
                }

                // Check admin status
                const isAdmin = await this.checkAdminStatus(user);
                if (!isAdmin) {
                    alert('You need administrator privileges to delete bookings');
                    return;
                }

                if (!confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
                    return;
                }

                // Create detailed room information for logging
                const roomDetails = {
                    roomNumber: booking.propertyDetails?.roomNumber || 'Unknown',
                    propertyName: booking.propertyDetails?.name || 'Unknown Property',
                    roomType: booking.propertyDetails?.roomType || 'Unknown Type'
                };

                // Delete the booking from everlodgebookings collection
                const bookingRef = doc(db, 'everlodgebookings', booking.id); // Changed from 'bookings' to 'everlodgebookings'
                await deleteDoc(bookingRef);

                // Log the deletion with detailed information
                await activityLogger.logActivity(
                    'booking_deletion', // Changed from 'room_deletion' to 'booking_deletion'
                    `Deleted booking for ${roomDetails.propertyName} - Room ${roomDetails.roomNumber} (${roomDetails.roomType})`,
                    'Room Management'
                );

                // Remove from local state
                this.bookings = this.bookings.filter(b => b.id !== booking.id);
                
                alert('Booking deleted successfully!');
                
            } catch (error) {
                console.error('Error deleting booking:', error);
                alert('Failed to delete booking: ' + error.message);
            }
        },

        viewBookingDetails(booking) {
            this.selectedBooking = booking;
            this.editMode = false;
        },

        closeModal() {
            this.selectedBooking = null;
            this.editMode = false;
        },

        openManualBookingModal() {
            this.showManualBookingModal = true;
            this.resetManualBookingForm();
        },

        closeManualBookingModal() {
            this.showManualBookingModal = false;
            this.resetManualBookingForm();
        },

        resetManualBookingForm() {
            this.manualBooking = {
                guestName: '',
                roomNumber: '',
                status: 'Confirmed',
                checkIn: '',
                checkOut: '',
                checkInTime: 'standard',
                guests: 1,
                contactNumber: '',
                email: ''
            };
        },

        async fetchAvailableRooms() {
            if (!this.manualBooking.establishment) return;

            try {
                this.loading = true;
                console.log('Fetching available rooms for establishment:', this.manualBooking.establishment);

                // Fetch all rooms for the establishment
                const roomsRef = collection(db, 'rooms');
                const roomsQuery = query(
                    roomsRef,
                    where('propertyDetails.name', '==', this.manualBooking.establishment)
                );
                const roomsSnapshot = await getDocs(roomsQuery);
                this.availableRooms = roomsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Fetch bookings from everlodgebookings collection
                const bookingsRef = collection(db, 'everlodgebookings');
                const bookingsSnapshot = await getDocs(
                    query(
                        bookingsRef,
                        where('propertyDetails.name', '==', this.manualBooking.establishment),
                        where('status', 'in', ['Confirmed', 'Checked In'])
                    )
                );

                const bookedRoomIds = bookingsSnapshot.docs.map(doc => doc.data().roomId);
                this.availableRooms = this.availableRooms.filter(room => !bookedRoomIds.includes(room.id));

            } catch (error) {
                console.error('Error fetching available rooms:', error);
                alert('Failed to fetch available rooms');
            } finally {
                this.loading = false;
            }
        },

        async submitManualBooking() {
            if (!this.isManualBookingFormValid) {
                alert('Please fill in all required fields');
                return;
            }

            try {
                this.loading = true;
                console.log('Submitting manual booking...');
                
                // Generate check-out date if not provided
                const checkInDate = new Date(this.manualBooking.checkIn);
                let checkOutDate;
                
                if (this.manualBooking.checkOut) {
                    checkOutDate = new Date(this.manualBooking.checkOut);
                } else {
                    // Default to 1 day stay if no checkout provided
                    checkOutDate = new Date(checkInDate);
                    checkOutDate.setDate(checkOutDate.getDate() + 1);
                }
                
                // Calculate costs using our rate calculation service
                const nights = calculateNights(checkInDate, checkOutDate);
                const costs = calculateBookingCosts(nights, this.manualBooking.checkInTime);
                
                const bookingData = {
                    propertyDetails: {
                        roomNumber: this.manualBooking.roomNumber,
                        name: 'Ever Lodge',
                        location: 'Baguio City',
                        roomType: 'Premium Suite', // Default to Premium Suite
                        floorLevel: "2" // Default floor level
                    },
                    guestName: this.manualBooking.guestName,
                    email: this.manualBooking.email || 'Not provided',
                    contactNumber: this.manualBooking.contactNumber,
                    checkIn: Timestamp.fromDate(checkInDate),
                    checkOut: Timestamp.fromDate(checkOutDate),
                    checkInTime: this.manualBooking.checkInTime,
                    guests: Number(this.manualBooking.guests),
                    status: this.manualBooking.status,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    source: 'manual',
                    // Add billing information for Billing page integration
                    numberOfNights: nights,
                    nightlyRate: costs.nightlyRate,
                    subtotal: costs.subtotal,
                    serviceFee: costs.serviceFeeAmount,
                    totalPrice: costs.totalAmount,
                    paymentStatus: 'pending'
                };

                // Add booking to everlodgebookings collection
                const bookingsRef = collection(db, 'everlodgebookings');
                const docRef = await addDoc(bookingsRef, bookingData);

                console.log('Booking added with ID:', docRef.id);

                // Create corresponding billing record
                const billingData = {
                    customerName: bookingData.guestName,
                    date: bookingData.checkIn,
                    checkInTime: bookingData.checkInTime,
                    checkOut: bookingData.checkOut,
                    checkOutTime: '11:00',
                    roomNumber: bookingData.propertyDetails.roomNumber,
                    roomType: bookingData.propertyDetails.roomType,
                    baseCost: bookingData.subtotal,
                    serviceFee: bookingData.serviceFee,
                    totalAmount: bookingData.totalPrice,
                    bookingId: docRef.id,
                    source: 'bookings',
                    status: bookingData.status,
                    paymentStatus: bookingData.paymentStatus,
                    expenses: [],
                    createdAt: Timestamp.now()
                };

                // Add to billing collection
                const billingRef = collection(db, 'everlodgebilling');
                await addDoc(billingRef, billingData);

                // Log the activity
                await activityLogger.logActivity(
                    'manual_booking',
                    `Manual booking created for guest: ${this.manualBooking.guestName} in room ${this.manualBooking.roomNumber} for ${nights} nights`,
                    'Room Management'
                );

                // Reset form and close modal
                this.resetManualBookingForm();
                this.closeManualBookingModal();

                // Reset date filters to ensure new booking is visible
                this.startDate = '';
                this.endDate = '';
                
                // Set current date to match the check-in date to make the booking visible
                this.currentDate = checkInDate;

                // Refresh bookings list
                await this.fetchBookings();

                alert('Booking created successfully!');
            } catch (error) {
                console.error('Error creating booking:', error);
                alert('Failed to create booking: ' + error.message);
            } finally {
                this.loading = false;
            }
        },

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
                } else {

                    this.fetchBookings(); // Fetch bookings when user is authenticated
                }
                this.loading = false;
            });
        },

        filterByDate() {
            if (!this.startDate || !this.endDate) {
                alert('Please select both start and end dates');
                return;
            }
            this.fetchBookings(); // This will trigger the filteredBookings computed property
        },

        resetFilter() {
            this.startDate = '';
            this.endDate = '';
            this.fetchBookings();
        },

        // Date navigation methods
        formatDisplayDate(date) {
            return date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        },

        goToPreviousDay() {
            const prevDate = new Date(this.currentDate);
            prevDate.setDate(prevDate.getDate() - 1);
            this.currentDate = prevDate;
        },

        goToNextDay() {
            const nextDate = new Date(this.currentDate);
            nextDate.setDate(nextDate.getDate() + 1);
            this.currentDate = nextDate;
        },

        goToToday() {
            this.currentDate = new Date();
        },
    },
    async mounted() {
        // Then continue with normal initialization
        this.checkAuthState(); // This will handle auth check and fetch bookings
    }
});