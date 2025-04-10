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
    addDoc,
    setDoc,
    limit,
    startAfter
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { PageLogger } from '../js/pageLogger.js';
import { ActivityLogger } from '../ActivityLog/activityLogger.js';
import { ensureLodgeDeletionUI, verifyLodgeDeletion } from './lodge-cleanup.js';
import { markLodgeAsDeleted, isLodgeDeleted, filterDeletedLodges, syncDeletedLodges } from './deleted-lodges-tracker.js';

// Initialize Firebase Storage with existing app instance
const storage = getStorage(app);
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
        rooms: [],  // Remove default rooms, we'll fetch all from Firestore
        searchQuery: '',
        loading: true,
        selectedBooking: null,
        isAuthenticated: false,
        showAddRoomModal: false,
        showManualBookingModal: false,
        showClientRoomsModal: false, // Add this new property
        currentDate: new Date(), // Added for date navigation
        newLodge: {
            name: '',
            location: '',
            barangay: '',
            price: '',
            promoPrice: '',
            amenities: [],
            rating: 4.5,
            propertyType: '',
            description: '',
            roomNumber: '',
            coordinates: {
                lat: 16.4023, // Default Baguio City coordinates
                lng: 120.5960
            }
        },
        availableAmenities: [
            'Mountain View', 'WiFi', 'Kitchen', 'Parking', 'Fireplace', 'City View',
            'Pool', 'Restaurant', 'Spa', 'Pet Friendly', 'Fitness Center', 'Free Breakfast',
            'Room Service', 'High-speed WiFi', 'Coffee Shop', '24/7 Security', 'Air Conditioning',
            'Hot Tub', 'Garden', 'Terrace', 'TV', 'Lake View', 'Near Eatery'
        ],
        barangays: [
            'Session Road', 'Camp 7', 'Burnham-Legarda', 'Kisad', 'City Camp Central',
            'Abanao-Zandueta-Kayong-Chugum-Otek', 'Alfonso Tabora', 'Ambiong',
            'Andres Bonifacio', 'Apugan-Loakan', 'Aurora Hill North Central',
            'Aurora Hill Proper', 'Aurora Hill South Central', 'Bagong Abreza',
            'BGH Compound', 'Cabinet Hill-Teachers Camp', 'Camp 8', 'Camp Allen',
        ],
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
        selectedImages: [], // Array to store selected images
        maxImages: 5,
        maxImageSize: 5 * 1024 * 1024, // 5MB in bytes
        uploadProgress: [], // Track progress for each image upload
        availableRooms: [],
        manualBooking: {
            guestName: '',
            email: '',
            contactNumber: '',
            establishment: '',
            roomId: '',
            checkIn: '',
            checkOut: '',
            numberOfGuests: 1,
            paymentStatus: 'Pending'
            },
        clientRooms: [],
        allClientLodges: [], // Add this missing property here
        showClientRoomEditModal: false,
        selectedClientRoom: null,
        // Add new properties for pagination and view mode
        currentPage: 1,
        totalPages: 1,
        itemsPerPage: 12,
        viewMode: 'grid',
        lastVisible: null,
        defaultImage: '../images/default-room.jpg', // Changed to use an image in the AdminSide/images folder
        roomsToDisplay: [],
        roomSourceTab: 'database', // Default tab selection
        showAddRoomToLodgeModal: false,
        availableLodges: [],
        newRoom: {
            lodgeId: '',
            lodgeName: '',
            roomNumber: '',
            roomType: '',
            floorLevel: '',
            price: '',
            description: '',
            status: 'Available',
            maxOccupants: 2,
            amenities: []
        },
        roomImages: [], // Add this if missing
        roomAmenities: [
            'Wi-Fi', 'TV', 'Air Conditioning', 'Heating', 'Private Bathroom', 
            'Shower', 'Bathtub', 'Hair Dryer', 'Mini Fridge', 'Coffee Maker',
            'Safe', 'Work Desk', 'Iron', 'Balcony', 'Sea View', 'Mountain View',
            'City View', 'King Bed', 'Queen Bed', 'Twin Beds', 'Sofa Bed'
        ],
        startDate: '',
        endDate: '',
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

            // Filter by currentDate - show bookings that are checked in on the selected date
            const currentDate = new Date(this.currentDate);
            currentDate.setHours(0, 0, 0, 0); // Set to beginning of day
            
            const nextDay = new Date(currentDate);
            nextDay.setDate(nextDay.getDate() + 1); // Set to beginning of next day
            
            filtered = filtered.filter(booking => {
                const checkIn = booking.checkIn instanceof Date ? booking.checkIn : new Date(booking.checkIn);
                const checkOut = booking.checkOut instanceof Date ? booking.checkOut : new Date(booking.checkOut);
                
                // Show if booking period includes the current date
                return checkIn < nextDay && checkOut >= currentDate;
            });

            // Apply additional date filter if dates are set explicitly
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
            }

            return filtered;
        },

        minCheckInDate() {
            const now = new Date();
            return now.toISOString().slice(0, 16); // Format: YYYY-MM-DDThh:mm
        },

        calculateNights() {
            if (!this.manualBooking.checkIn || !this.manualBooking.checkOut) return 0;
            const checkIn = new Date(this.manualBooking.checkIn);
            const checkOut = new Date(this.manualBooking.checkOut);
            const diffTime = Math.abs(checkOut - checkIn);
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        },

        calculateRoomRate() {
            if (!this.manualBooking.roomId) return 0;
            const selectedRoom = this.availableRooms.find(room => room.id === this.manualBooking.roomId);
            return selectedRoom ? selectedRoom.price : 0;
        },

        calculateSubtotal() {
            return this.calculateRoomRate * this.calculateNights;
        },

        calculateServiceFee() {
            return this.calculateSubtotal * 0.10; // 10% service fee
        },

        calculateTotal() {
            return this.calculateSubtotal + this.calculateServiceFee;
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
                    `Booking status updated to ${booking.status} for ${booking.guestName}`,
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

        // Update the deleteBooking function
        async deleteBooking(booking) {
            try {
                if (!booking.id) {
                    alert('Cannot delete a room without a booking');
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

                // Delete the booking
                const bookingRef = doc(db, 'bookings', booking.id);
                await deleteDoc(bookingRef);

                // Log the deletion with detailed information
                await activityLogger.logActivity(
                    'room_deletion',
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
        },

        closeModal() {
            this.selectedBooking = null;
        },

        openAddRoomModal() {
            this.showAddRoomModal = true;
        },

        closeAddRoomModal() {
            this.showAddRoomModal = false;
        },

        async addNewLodge() {
            try {
                this.loading = true;

                if (!this.isFormValid) {
                    alert('Please fill in all required fields and add at least one image');
                    return;
                }
                
                // Import the syncLodgeToClient function
                const { syncLodgeToClient } = await import('./firebase-helper.js');

                // First, compress and upload the images using DirectUploader
                const { DirectUploader } = await import('./direct-uploader.js');
                const uploader = new DirectUploader({...this, $options: { db }});

                const newLodgeId = Date.now().toString() + Math.floor(Math.random() * 1000);
                console.log('Starting image upload with DirectUploader');
                const imageUrls = await uploader.uploadImages(newLodgeId, this.selectedImages);
                console.log(`Successfully processed ${imageUrls.length} images`);

                // Create lodge data object
                const lodgeData = {
                    id: parseInt(newLodgeId.slice(-5)),
                    name: this.newLodge.name,
                    location: this.newLodge.location,
                    barangay: this.newLodge.barangay,
                    price: parseFloat(this.newLodge.price),
                    promoPrice: this.newLodge.promoPrice ? parseFloat(this.newLodge.promoPrice) : null,
                    amenities: [...this.newLodge.amenities],
                    rating: parseFloat(this.newLodge.rating),
                    propertyType: this.newLodge.propertyType,
                    coordinates: {
                        lat: parseFloat(this.newLodge.coordinates.lat),
                        lng: parseFloat(this.newLodge.coordinates.lng)
                    },
                    description: this.newLodge.description,
                    propertyDetails: {
                        roomNumber: this.newLodge.roomNumber || 'N/A',
                        roomType: this.newLodge.propertyType,
                        name: this.newLodge.name,
                        location: this.newLodge.location
                    },
                    status: 'Available',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    showOnClient: true,
                    imageStorage: 'firestore-base64',
                    hasImages: imageUrls.length > 0
                };

                // Add to Firestore without the large image data
                const lodgesRef = collection(db, 'lodges');
                const docRef = await addDoc(lodgesRef, lodgeData);
                
                // Create a separate document for image references to avoid size limits
                if (imageUrls.length > 0) {
                    try {
                        // Create a separate document for image references
                        const imageRefsRef = collection(db, 'lodgeImages');
                        await addDoc(imageRefsRef, { 
                            lodgeId: docRef.id,
                            mainImage: imageUrls[0],
                            timestamp: Date.now()
                        });
                        
                        // Update the lodge with a reference to the first image only
                        await updateDoc(docRef, { 
                            image: imageUrls[0],
                            imageCount: imageUrls.length
                        });
                        
                        lodgeData.image = imageUrls[0];
                    } catch (imageRefError) {
                        console.error('Error storing image references:', imageRefError);
                    }
                }

                // Create a room reference in the rooms collection
                const roomsRef = collection(db, 'rooms');
                await addDoc(roomsRef, {
                    lodgeId: docRef.id,
                    ...lodgeData,
                });
                
                // Synchronize to client side
                await syncLodgeToClient(db, {
                    ...lodgeData,
                    id: docRef.id,  // Use Firestore document ID as the lodge ID for client sync
                });

                // Reset form and close modal
                this.resetNewLodgeForm();
                this.closeAddRoomModal();
                
                alert('Lodge added successfully! It will now appear on the client website.');
                await logRoomActivity('lodge_add', `Added new lodge "${lodgeData.name}" with ${imageUrls.length} images`);
                
                // Refresh the client lodges list if the modal is open
                if (this.showClientRoomsModal) {
                    await this.fetchClientLodges();
                }
            } catch (error) {
                console.error('Error adding lodge:', error);
                alert('Failed to add lodge: ' + error.message);
                await logRoomActivity('lodge_error', `Failed to add lodge: ${error.message}`);
            } finally {
                this.loading = false;
            }
        },

        resetNewLodgeForm() {
            this.newLodge = {
                name: '',
                location: '',
                barangay: '',
                price: '',
                promoPrice: '',
                amenities: [],
                rating: 4.5,
                propertyType: '',
                description: '',
                roomNumber: '',
                coordinates: {
                    lat: 16.4023, // Default Baguio City coordinates
                    lng: 120.5960
                }
            };
            this.selectedImages = [];
        },

        closeAddRoomModal() {
            this.showAddRoomModal = false;
            this.resetNewLodgeForm();
        },

        async handleImageUpload(event) {
            const files = Array.from(event.target.files);
            
            // Validate number of images
            if (this.selectedImages.length + files.length > this.maxImages) {
                alert(`You can only upload up to ${this.maxImages} images`);
                return;
            }

            // Process each file
            for (const file of files) {
                // Validate file size
                if (file.size > this.maxImageSize) {
                    alert(`Image ${file.name} is too large. Maximum size is 5MB`);
                    continue;
                }

                // Validate file type
                if (!file.type.startsWith('image/')) {
                    alert(`File ${file.name} is not an image`);
                    continue;
                }

                // Read file as DataURL for preview and PostgreSQL upload
                const reader = new FileReader();
                reader.onload = (e) => {
                    const url = URL.createObjectURL(file);
                    this.selectedImages.push({
                        file,
                        url,          // For preview (Object URL)
                        dataUrl: e.target.result,  // For PostgreSQL storage
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        progress: 0   // Upload progress
                    });
                };
                reader.readAsDataURL(file);
            }
        },

        removeImage(index) {
            URL.revokeObjectURL(this.selectedImages[index].url);
            this.selectedImages.splice(index, 1);
        },

        // Replace the uploadImages method completely with this version
        async uploadImages(roomId) {
            try {
                console.log('Using fallback direct uploader method');
                
                // Import the DirectUploader class
                const { DirectUploader } = await import('./direct-uploader.js');
                const uploader = new DirectUploader(app);
                
                // Use the direct uploader
                return await uploader.uploadImages(roomId, this.selectedImages);
            } catch (error) {
                console.error('Fatal error in direct image upload:', error);
                alert('Failed to upload images. Please try again or contact support.');
                throw error;
            }
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
                email: '',
                contactNumber: '',
                establishment: '',
                roomId: '',
                checkIn: '',
                checkOut: '',
                numberOfGuests: 1,
                paymentStatus: 'Pending'
            };
            this.availableRooms = [];
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
            if (!this.isFormValid()) {
                alert('Please fill in all required fields');
                return;
            }

            try {
                this.loading = true;
                console.log('Submitting manual booking...');

                // Create booking data
                const bookingData = {
                    propertyDetails: {
                        roomNumber: this.manualBooking.roomNumber,
                        roomType: this.manualBooking.roomType,
                        floorLevel: this.manualBooking.floorLevel,
                        name: this.manualBooking.establishment,
                        location: this.establishments[this.manualBooking.establishment].location
                    },
                    guest: {
                        name: this.manualBooking.guestName,
                        email: this.manualBooking.email,
                        contact: this.manualBooking.contactNumber
                    },
                    checkIn: Timestamp.fromDate(new Date(this.manualBooking.checkIn)),
                    checkOut: Timestamp.fromDate(new Date(this.manualBooking.checkOut)),
                    numberOfNights: this.calculateNights(),
                    nightlyRate: this.manualBooking.nightlyRate,
                    serviceFee: this.calculateServiceFee(),
                    totalPrice: this.calculateTotal(),
                    status: 'Confirmed',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    source: 'manual'
                };

                // Add booking to everlodgebookings collection
                const bookingsRef = collection(db, 'everlodgebookings');
                const docRef = await addDoc(bookingsRef, bookingData);

                console.log('Booking added with ID:', docRef.id);

                // Log the activity
                await activityLogger.logActivity(
                    'manual_booking',
                    `Manual booking created for ${this.manualBooking.guestName} in ${this.manualBooking.establishment}`,
                    'Room Management'
                );

                // Reset form and close modal
                this.resetManualBookingForm();
                this.closeManualBookingModal();

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

        // Add preloadDefaultImages method
        preloadDefaultImages() {
            const defaultImages = [
                '../images/default-room.jpg',
                '../../ClientSide/components/default-room.jpg',
                '../images/LodgeEaseLogo.png',
                '../../ClientSide/components/LodgeEaseLogo.png',
                '../../ClientSide/components/1.jpg',
                '../../ClientSide/components/3.jpg'
            ];

            defaultImages.forEach(path => {
                const img = new Image();
                img.src = path;
            });
        },

        // Add openAddRoomToLodgeModal method if missing
        openAddRoomToLodgeModal() {
            this.showAddRoomToLodgeModal = true;
            this.fetchAvailableLodges();
        },

        // Add fetchAvailableLodges method if missing
        async fetchAvailableLodges() {
            try {
                const lodgesSnapshot = await getDocs(collection(db, 'lodges'));
                this.availableLodges = lodgesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name,
                    ...doc.data()
                }));
            } catch (error) {
                console.error('Error fetching lodges:', error);
                alert('Error fetching available lodges');
            }
        },

        // Add closeAddRoomToLodgeModal method if missing
        closeAddRoomToLodgeModal() {
            this.showAddRoomToLodgeModal = false;
            this.resetRoomForm();
        },

        // Add resetRoomForm method if missing
        resetRoomForm() {
            this.newRoom = {
                lodgeId: '',
                lodgeName: '',
                roomNumber: '',
                roomType: '',
                floorLevel: '',
                price: '',
                description: '',
                status: 'Available',
                maxOccupants: 2,
                amenities: []
            };
            this.roomImages = [];
        },
    },
    async mounted() {
        // First, sync the deleted lodges list between IndexedDB and localStorage
        await syncDeletedLodges();
        // Then continue with normal initialization
        this.checkAuthState(); // This will handle auth check and fetch bookings
        
        // Preload default images
        this.preloadDefaultImages();
    }
});