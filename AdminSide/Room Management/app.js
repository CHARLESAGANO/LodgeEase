new Vue({
    el: '#app',
    data: {
        searchQuery: '',
        rooms: [
            { roomNumber: '101', status: 'Occupied', guestName: 'Alice Johnson', checkInTime: '2023-10-25 14:00', checkOutTime: '2023-10-27 12:00' },
            { roomNumber: '102', status: 'Reserved', guestName: 'Bob Smith', checkInTime: '2023-10-24 15:00', checkOutTime: '2023-10-26 11:00' },
            { roomNumber: '103', status: 'Available', guestName: '', checkInTime: '', checkOutTime: '' },
            { roomNumber: '104', status: 'Available', guestName: '', checkInTime: '', checkOutTime: '' },
        ],
    },
    computed: {
        filteredRooms() {
            if (!this.searchQuery) return this.rooms;
            return this.rooms.filter(room => room.roomNumber.includes(this.searchQuery));
        }
    },
    methods: {
        getRoomStatusClass(status) {
            if (status === 'Occupied') {
                return 'status-column-booked';
            } else if (status === 'Reserved') {
                return 'status-column-reserved';
            } else {
                return 'status-column-available';
            }
        },
    },
});
