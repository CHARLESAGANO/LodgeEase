const billingTable = document.getElementById('billingTable').getElementsByTagName('tbody')[0];
const subtotalElement = document.getElementById('subtotal');
const totalElement = document.getElementById('total');
const discountInput = document.getElementById('discount');
const paymentMessage = document.getElementById('paymentMessage');

let baseRate = 5.49; // Base rate for 2 hours
let stayCost = 0; // Store the stay cost globally

// Adds a new row for charge input
function addChargeRow() {
    const row = billingTable.insertRow();
    row.innerHTML = `
        <td><input type="text" placeholder="Description"></td>
        <td><input type="number" placeholder="Quantity" min="1" value="1"></td>
        <td><input type="number" placeholder="Unit Price" min="0.01" step="0.01"></td>
        <td class="total-price">$0.00</td>
        <td><button onclick="removeChargeRow(this)" class="button">Delete</button></td>
    `;
}

// Function to calculate the stay cost based on check-in and check-out times
function calculateStayCost() {
    const checkIn = new Date(document.getElementById('checkIn').value);
    const checkOut = new Date(document.getElementById('checkOut').value);

    stayCost = 0;
    if (checkOut > checkIn) {
        const milliseconds = checkOut - checkIn;
        const hours = milliseconds / 36e5; // Total hours
        const blocks = Math.ceil(hours / 2); // 2-hour blocks, rounded up
        stayCost = blocks * baseRate;
    }

    calculateTotal(); // Calculate the total whenever stay cost changes
}

// Function to calculate the total amount due
function calculateTotal() {
    let subtotal = stayCost;

    // Loop through billing table rows to add each additional charge
    Array.from(billingTable.rows).forEach(row => {
        const quantity = parseFloat(row.cells[1].children[0].value) || 0;
        const unitPrice = parseFloat(row.cells[2].children[0].value) || 0;
        const totalPrice = quantity * unitPrice;

        row.cells[3].textContent = `$${totalPrice.toFixed(2)}`;
        subtotal += totalPrice;
    });

    subtotalElement.textContent = `$${subtotal.toFixed(2)}`;

    // Apply discount to subtotal
    const discount = parseFloat(discountInput.value) / 100 || 0;
    const total = subtotal * (1 - discount);
    totalElement.textContent = `$${total.toFixed(2)}`;
}

// Event listeners for date and input changes
document.getElementById('checkIn').addEventListener('change', calculateStayCost);
document.getElementById('checkOut').addEventListener('change', calculateStayCost);
discountInput.addEventListener('input', calculateTotal);
billingTable.addEventListener('input', calculateTotal);

// Process payment and clear the form
function processPayment() {
    if (billingTable.rows.length === 0 && stayCost === 0) {
        paymentMessage.textContent = "No charges or stay cost added.";
        return;
    }
    paymentMessage.textContent = "Payment processed successfully.";
    billingTable.innerHTML = ""; // Clear the billing table
    subtotalElement.textContent = "$0.00";
    totalElement.textContent = "$0.00";
    discountInput.value = 0;
    stayCost = 0; // Reset stay cost
    document.getElementById('checkIn').value = "";
    document.getElementById('checkOut').value = "";
}
