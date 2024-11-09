document.addEventListener("DOMContentLoaded", () => {
    const addRoomButton = document.getElementById("button-rooms-add");
    const modal = document.getElementById("roomFormModal");
    const closeModalButton = document.getElementById("closeModal");
    const roomForm = document.getElementById("roomForm");
    const roomsTableBody = document.querySelector(".rooms-table tbody");

    // Show modal when 'Add Room' button is clicked
    addRoomButton.addEventListener("click", () => {
        modal.style.display = "flex";
    });

    // Close modal when 'X' button is clicked
    closeModalButton.addEventListener("click", () => {
        modal.style.display = "none";
    });

    // Close modal when clicking outside of it
    window.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });

    // Handle form submission
    roomForm.addEventListener("submit", (event) => {
        event.preventDefault();

        // Get input values
        const roomNumber = document.getElementById("room-number").value;
        const roomType = document.getElementById("room-type").value;
        const roomFloor = document.getElementById("room-floor").value;
        const guestName = document.getElementById("guest-name").value || "N/A";
        const checkIn = document.getElementById("check-in").value || "N/A";
        const checkOut = document.getElementById("check-out").value || "N/A";
        const roomStatus = document.getElementById("room-status").value;

        // Create a new row and add to the table
        const newRow = document.createElement("tr");
        newRow.innerHTML = `
            <td>${roomNumber}</td>
            <td>${roomType}</td>
            <td>${roomFloor}</td>
            <td>${guestName}</td>
            <td>${checkIn}</td>
            <td>${checkOut}</td>
            <td>${roomStatus}</td>
            <td>
                <button class="edit-button">Edit</button>
                <button class="delete-button">Delete</button>
            </td>
        `;
        roomsTableBody.appendChild(newRow);

        // Clear form and close modal
        roomForm.reset();
        modal.style.display = "none";
    });
});
