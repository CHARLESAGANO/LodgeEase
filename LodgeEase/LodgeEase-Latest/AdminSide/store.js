import { createStore } from 'vuex';

const store = createStore({
  state() {
    return {
      rooms: [],
      reservations: [],
      dashboardData: {
        availableRooms: 0,
        occupiedRooms: 0,
        sales: 0,
        checkInsToday: 0,
        recentBookings: [],
      },
    };
  },
  mutations: {
    setRooms(state, rooms) {
      state.rooms = rooms;
      this.commit('updateDashboardData');
    },
    setReservations(state, reservations) {
      state.reservations = reservations;
      this.commit('updateDashboardData');
    },
    updateDashboardData(state) {
      state.dashboardData.availableRooms = state.rooms.filter(room => room.status === 'available').length;
      state.dashboardData.occupiedRooms = state.rooms.filter(room => room.status === 'occupied').length;
      state.dashboardData.sales = state.reservations.reduce((acc, reservation) => acc + reservation.amount, 0);
      state.dashboardData.checkInsToday = state.reservations.filter(res => {
        return new Date(res.checkInDate).toDateString() === new Date().toDateString();
      }).length;
      state.dashboardData.recentBookings = state.reservations.slice(0, 5); // Top 5 recent bookings
    },
  },
  actions: {
    async fetchRooms({ commit }) {
      // Simulate fetching rooms from Firebase or API
      const rooms = [
        { roomNumber: '101', status: 'available', roomType: 'Standard' },
        { roomNumber: '102', status: 'occupied', roomType: 'Suite' },
        // More rooms...
      ];
      commit('setRooms', rooms);
    },
    async fetchReservations({ commit }) {
      // Simulate fetching reservations from Firebase or API
      const reservations = [
        { customerName: 'John Doe', roomNumber: '101', checkInDate: '2024-11-12', checkOutDate: '2024-11-15', amount: 100 },
        { customerName: 'Jane Doe', roomNumber: '102', checkInDate: '2024-11-13', checkOutDate: '2024-11-16', amount: 150 },
        // More reservations...
      ];
      commit('setReservations', reservations);
    },
  },
});

export default store;