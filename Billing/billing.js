const billingTable = document.getElementById('billingTable').getElementsByTagName('tbody')[0];
const subtotalElement = document.getElementById('subtotal');
const totalElement = document.getElementById('total');
const discountInput = document.getElementById('discount');
const paymentMessage = document.getElementById('paymentMessage');

let charges = [];

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

// Calculates totals and updates the summary
function calculateTotal() {
    let subtotal = 0;
    Array.from(billingTable.rows).forEach(row => {
        const quantity = row.cells[1].children[0].value;
        const unitPrice = row.cells[2].children[0].value;
        const totalPrice = quantity * unitPrice || 0;

        row.cells[3].textContent = `$${totalPrice.toFixed(2)}`;
        subtotal += totalPrice;
    });

    subtotalElement.textContent = `$${subtotal.toFixed(2)}`;

    // Calculate discount and apply to subtotal
    const discount = discountInput.value / 100 || 0;
    const total = subtotal * (1 - discount);
    totalElement.textContent = `$${total.toFixed(2)}`;
}

// Removes a charge row from the table
function removeChargeRow(button) {
    billingTable.deleteRow(button.parentNode.parentNode.rowIndex - 1);
    calculateTotal();
}

// Process payment function
function processPayment() {
    if (billingTable.rows.length === 0) {
        paymentMessage.textContent = "No charges added.";
        return;
    }
    paymentMessage.textContent = "Payment processed successfully.";
    billingTable.innerHTML = ""; // Clear table
    subtotalElement.textContent = "$0.00";
    totalElement.textContent = "$0.00";
    discountInput.value = 0;
}

// Event listeners
discountInput.addEventListener('input', calculateTotal);
billingTable.addEventListener('input', calculateTotal);
