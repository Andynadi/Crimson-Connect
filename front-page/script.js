document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('availabilityForm');
    form.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent the default form submission
        // Display the thank you message
        const message = document.createElement('p');
        message.textContent = 'Thank you for using the crimson-connect, we will email you once we find appropriate matches';
        form.parentNode.replaceChild(message, form); // Replace the form with the message
    });
});