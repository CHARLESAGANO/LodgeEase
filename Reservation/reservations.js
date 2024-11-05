const reservationForm = document.getElementById('reservationForm');
const reservationTable = document.getElementById('reservationTable').getElementsByTagName('tbody')[0];
const reservationMessage = document.getElementById('reservationMessage');

let reservations = [];

// Handle reservation form submission
reservationForm.addEventListener('submit', function(event) {
    event.preventDefault();

    const customerName = document.getElementById('customerName').value;
    const roomNumber = document.getElementById('roomNumber').value;
    const checkIn = document.getElementById('checkIn').value;
    const checkOut = document.getElementById('checkOut').value;
    const status = document.getElementById('reservationStatus').value;

    // Add new reservation
    reservations.push({ customerName, roomNumber, checkIn, checkOut, status });
    updateReservationTable();
    showReservationMessage(`Reservation for ${customerName} added successfully!`, 'green');

    // Clear form
    reservationForm.reset();
});

function updateReservationTable() {
    // Clear current table
    reservationTable.innerHTML = '';

    // Populate the table with reservation data
    reservations.forEach((reservation, index) => {
        const row = reservationTable.insertRow();
        row.innerHTML = `
            <td>${reservation.customerName}</td>
            <td>${reservation.roomNumber}</td>
            <td>${reservation.checkIn}</td>
            <td>${reservation.checkOut}</td>
            <td>${reservation.status}</td>
            <td>
                <button onclick="editReservation(${index})" class="button">Edit</button>
                <button onclick="removeReservation(${index})" class="button">Delete</button>
            </td>
        `;
    });
}

function removeReservation(index) {
    const customerName = reservations[index].customerName;
    reservations.splice(index, 1);
    updateReservationTable();
    showReservationMessage(`Reservation for ${customerName} removed successfully!`, 'green');
}

function editReservation(index) {
    const reservation = reservations[index];

    document.getElementById('customerName').value = reservation.customerName;
    document.getElementById('roomNumber').value = reservation.roomNumber;
    document.getElementById('checkIn').value = reservation.checkIn;
    document.getElementById('checkOut').value = reservation.checkOut;
    document.getElementById('reservationStatus').value = reservation.status;

    removeReservation(index);} // remove to re-add updated entry