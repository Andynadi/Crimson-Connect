// public/scripts/availability.js
document.addEventListener('DOMContentLoaded', function () {
    // Element references
    const steps = {
        email: document.getElementById('step-email'),
        locations: document.getElementById('step-locations'),
        availability: document.getElementById('step-availability'),
        filters: document.getElementById('step-filters')
    };
    const buttons = {
        nextToLocations: document.getElementById('next-to-locations'),
        nextToAvailability: document.getElementById('next-to-availability'),
        nextToFilters: document.getElementById('next-to-filters'),
        backToEmail: document.getElementById('back-to-email'),
        backToLocations: document.getElementById('back-to-locations'),
        backToAvailability: document.getElementById('back-to-availability'),
        addSlot: document.getElementById('add-slot'),
        submitSlots: document.getElementById('submit-slots')
    };
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('email-error');
    const dateInput = document.getElementById('date');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const locationCheckboxes = document.querySelectorAll('input[name="locations"]');
    const slotsList = document.getElementById('slots-list');
    const modal = document.getElementById('matching-preference-modal');

    // Show/hide steps
    function showStep(stepKey) {
        Object.values(steps).forEach(step => step.style.display = 'none');
        steps[stepKey].style.display = 'grid';
    }

    // Step navigation
    buttons.nextToLocations.addEventListener('click', () => {
        if (validateEmail(emailInput.value)) {
            fetch('/api/store-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.value })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showStep('locations');
                } else {
                    console.error('Failed to store email:', data.message);
                    emailError.style.display = 'block';
                    emailInput.setCustomValidity('Failed to store email');
                }
            })
            .catch(error => {
                console.error('Error storing email:', error);
                emailError.style.display = 'block';
                emailInput.setCustomValidity('Error storing email');
            });
        } else {
            emailError.style.display = 'block';
            emailInput.setCustomValidity('Invalid email format');
        }
    });

    buttons.backToEmail.addEventListener('click', () => showStep('email'));

    buttons.nextToAvailability.addEventListener('click', () => {
        if (getSelectedLocations().length > 0) {
            showStep('availability');
        } else {
            alert('Please select at least one location.');
        }
    });

    buttons.backToLocations.addEventListener('click', () => showStep('locations'));

    buttons.nextToFilters.addEventListener('click', () => {
        if (validateSlot()) {
            showStep('filters');
        }
    });

    buttons.backToAvailability.addEventListener('click', () => showStep('availability'));

    /** 🚨 Set Default Availability Based on Database */
    async function setDefaultAvailability() {
        try {
            const response = await fetch('/api/default-availability');
            const data = await response.json();
            dateInput.value = data.date;
            startTimeInput.value = data.startTime;
            endTimeInput.value = data.endTime;
        } catch (error) {
            console.error('❌ Error setting default availability:', error);
            const today = new Date();
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + 1);
            const defaultDate = nextDay.toISOString().split('T')[0];
            dateInput.value = defaultDate;
            startTimeInput.value = '12:00';
            endTimeInput.value = '15:00';
        }
    }
    setDefaultAvailability();

    /** 🚨 Prevent Past Dates */
    function setMinDate() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const minDate = today.toISOString().split('T')[0];
        dateInput.setAttribute("min", minDate);
    }
    setMinDate();

    /** 🔎 Validate .edu Email in REAL-TIME */
    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.edu$/.test(email.toLowerCase());
    }

    function handleEmailValidation() {
        if (validateEmail(emailInput.value)) {
            emailError.style.display = 'none';
            emailInput.setCustomValidity('');
        } else {
            emailError.style.display = 'block';
            emailInput.setCustomValidity('Invalid email format');
        }
    }
    emailInput.addEventListener('input', handleEmailValidation);
    emailInput.addEventListener('blur', handleEmailValidation);

    /** Get Selected Locations */
    function getSelectedLocations() {
        return Array.from(locationCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
    }

    /** ❌ Prevent Overlapping and Duplicate Slots */
    function timeToMinutes(time) {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
    }

    function checkForOverlap(newSlot) {
        return Array.from(slotsList.children).some(slot => {
            const existingDate = slot.dataset.date;
            const existingStartTime = slot.dataset.startTime;
            const existingEndTime = slot.dataset.endTime;
            const existingLocations = slot.dataset.locations.split(',');

            if (existingDate !== newSlot.date) return false;

            const hasLocationOverlap = newSlot.locations.some(location => 
                existingLocations.includes(location)
            );
            if (!hasLocationOverlap) return false;

            const existingStart = timeToMinutes(existingStartTime);
            const existingEnd = timeToMinutes(existingEndTime);
            const newStart = timeToMinutes(newSlot.startTime);
            const newEnd = timeToMinutes(newSlot.endTime);

            return (newStart < existingEnd && newEnd > existingStart);
        });
    }

    /** 🚦 Validate Slots Before Adding */
    function validateSlot() {
        if (!validateEmail(emailInput.value)) {
            alert("Please use a valid .edu email address");
            return false;
        }

        if (!dateInput.value || new Date(dateInput.value) < new Date().setHours(0, 0, 0, 0)) {
            alert("You cannot select a past date.");
            return false;
        }

        if (!startTimeInput.value || !endTimeInput.value || startTimeInput.value >= endTimeInput.value) {
            alert("Invalid time range. End time must be after start time.");
            return false;
        }

        const selectedLocations = getSelectedLocations();
        if (selectedLocations.length === 0) {
            alert("Please select at least one location.");
            return false;
        }

        return true;
    }

    /** 🏗️ Add New Slot */
    buttons.addSlot.addEventListener('click', function () {
        if (!validateSlot()) return;

        const selectedLocations = getSelectedLocations();
        const newSlot = {
            email: emailInput.value,
            date: dateInput.value,
            startTime: startTimeInput.value,
            endTime: endTimeInput.value,
            locations: selectedLocations
        };

        if (checkForOverlap(newSlot)) {
            alert("You have already added an overlapping or duplicate time slot for one or more selected locations.");
            return;
        }

        const li = document.createElement('li');
        li.textContent = `${newSlot.date} | ${newSlot.startTime} - ${newSlot.endTime} | ${newSlot.locations.join(', ')}`;
        li.dataset.date = newSlot.date;
        li.dataset.startTime = newSlot.startTime;
        li.dataset.endTime = newSlot.endTime;
        li.dataset.locations = newSlot.locations.join(',');

        const removeBtn = document.createElement('button');
        removeBtn.textContent = "×";
        removeBtn.className = "remove-slot";
        removeBtn.onclick = () => li.remove();
        li.appendChild(removeBtn);

        slotsList.appendChild(li);
    });

    /** 🌟 Handle Matching Preference Modal */
    const createMatchingPreferenceModal = () => {
        return new Promise((resolve) => {
            modal.style.display = 'flex';

            const matchAll = () => {
                modal.style.display = 'none';
                resolve('all');
            };
            const matchOne = () => {
                modal.style.display = 'none';
                resolve('one');
            };
            const close = () => {
                modal.style.display = 'none';
                resolve(null);
            };

            const matchAllBtn = document.getElementById('match-all-slots');
            const matchOneBtn = document.getElementById('match-one-slot');
            const closeBtn = document.getElementById('close-modal');
            matchAllBtn.removeEventListener('click', matchAll);
            matchOneBtn.removeEventListener('click', matchOne);
            closeBtn.removeEventListener('click', close);

            matchAllBtn.addEventListener('click', matchAll);
            matchOneBtn.addEventListener('click', matchOne);
            closeBtn.addEventListener('click', close);
        });
    };

    /** 🚀 Submit All Slots */
    buttons.submitSlots.addEventListener('click', async function () {
        const slots = Array.from(slotsList.children).map(slot => ({
            email: emailInput.value,
            date: slot.dataset.date,
            startTime: slot.dataset.startTime,
            endTime: slot.dataset.endTime,
            locations: slot.dataset.locations.split(',')
        }));

        if (slots.length === 0) {
            alert('Please add at least one valid time slot.');
            return;
        }

        const optOut1to1 = document.getElementById('opt-out-1to1').checked;
        const optOutRepeat = document.getElementById('opt-out-repeat').checked;
        const optOutSameSchool = document.getElementById('opt-out-same-school').checked;
        const onlyMatchSameSchool = document.getElementById('only-match-same-school').checked;
        const selectedExperiences = Array.from(document.querySelectorAll('input[name="experiences"]:checked'))
            .map(checkbox => checkbox.value);

        let matchingPreference = "one";
        if (slots.length > 1) {
            matchingPreference = await createMatchingPreferenceModal();
            if (matchingPreference === null) return;
        }

        buttons.submitSlots.disabled = true;
        buttons.submitSlots.textContent = 'Submitting...';

        try {
            const response = await fetch('http://localhost:5500/api/submit-availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: emailInput.value, 
                    slots,
                    optOut1to1,
                    optOutRepeat,
                    optOutSameSchool,
                    onlyMatchSameSchool,
                    experiences: selectedExperiences,
                    matchingPreference
                })
            });

            if (!response.ok) throw new Error(await response.text());

            alert('Availability submitted successfully!');
            slotsList.innerHTML = '';
            emailInput.value = '';
            showStep('email');
        } catch (error) {
            console.error('Submission error:', error);
            alert('Submission failed. Please try again.');
        } finally {
            buttons.submitSlots.disabled = false;
            buttons.submitSlots.textContent = 'Submit Availability';
        }
    });

    /** 🔒 Mutual Exclusivity for School Filters */
    const optOutSchool = document.getElementById("opt-out-same-school");
    const onlyMatchSchool = document.getElementById("only-match-same-school");

    optOutSchool.addEventListener("change", function() {
        if (this.checked) onlyMatchSchool.checked = false;
    });

    onlyMatchSchool.addEventListener("change", function() {
        if (this.checked) optOutSchool.checked = false;
    });
});