// public/scripts/availability.js
document.addEventListener('DOMContentLoaded', function () {
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
        submitSlots: document.getElementById('submit-slots'),
        addAvailability: document.getElementById('add-availability')
    };
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('email-error');
    const locationCheckboxes = document.querySelectorAll('input[name="locations"]');
    const slotsList = document.getElementById('slots-list');
    const modal = document.getElementById('matching-preference-modal');
    const calendarInput = document.getElementById('calendar');
    const timeSlotsContainer = document.getElementById('time-slots');

    function showStep(stepKey) {
        Object.values(steps).forEach(step => step.style.display = 'none');
        steps[stepKey].style.display = 'grid';
    }

    // Initialize Flatpickr
    flatpickr('#calendar', {
        minDate: 'today',
        disableMobile: true,
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length > 0) {
                renderTimeSlots(selectedDates[0]);
            }
        }
    });

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.edu$/i.test(email.toLowerCase());
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

    buttons.nextToLocations.addEventListener('click', () => {
        console.log('Next button clicked, validating email:', emailInput.value);
        if (validateEmail(emailInput.value)) {
            console.log('Email validated, sending to /api/store-email');
            fetch('/api/store-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.value })
            })
            .then(response => {
                console.log('Fetch response:', response.status);
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                console.log('Server response:', data);
                if (data.success) {
                    showStep('locations');
                } else {
                    console.error('Failed to store email:', data.message);
                    emailError.style.display = 'block';
                    emailInput.setCustomValidity('Failed to store email');
                }
            })
            .catch(error => {
                console.error('Fetch error:', error);
                emailError.style.display = 'block';
                emailInput.setCustomValidity('Error storing email');
            });
        } else {
            console.error('Email validation failed for:', emailInput.value);
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
        const selectedSlots = Array.from(slotsList.children).map(slot => ({
            date: slot.dataset.date,
            startTime: slot.dataset.startTime,
            endTime: slot.dataset.endTime,
            locations: slot.dataset.locations.split(',')
        }));
        if (selectedSlots.length === 0) {
            alert('Please select at least one time slot.');
            return;
        }
        showStep('filters');
    });

    buttons.backToAvailability.addEventListener('click', () => showStep('availability'));

    function getSelectedLocations() {
        return Array.from(locationCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
    }

    function renderTimeSlots(date) {
        timeSlotsContainer.innerHTML = '';
        const day = date.toISOString().split('T')[0];
        const slots = [
            '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
            '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
            '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
            '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
            '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
            '23:00'
        ];

        // Fetch slot stats
        fetch('/api/slot-stats')
            .then(response => response.json())
            .then(stats => {
                slots.forEach(startTime => {
                    const endTime = addMinutes(startTime, 30);
                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'time-slot';
                    const slotStat = stats.find(s => s.date === day && s.start_time === startTime && s.end_time === endTime);
                    slotDiv.textContent = `${startTime} - ${endTime}`;
                    if (slotStat) {
                        slotDiv.textContent += `\n(${slotStat.user_count} users: ${slotStat.domains || 'N/A'})`;
                    }
                    slotDiv.dataset.date = day;
                    slotDiv.dataset.startTime = startTime;
                    slotDiv.dataset.endTime = endTime;
                    slotDiv.addEventListener('click', () => {
                        slotDiv.classList.toggle('selected');
                    });
                    timeSlotsContainer.appendChild(slotDiv);
                });
            })
            .catch(error => console.error('Error fetching slot stats:', error));
    }

    function addMinutes(time, minutes) {
        const [hours, mins] = time.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, mins, 0, 0);
        date.setMinutes(date.getMinutes() + minutes);
        return date.toTimeString().slice(0, 5);
    }

    buttons.addAvailability.addEventListener('click', () => {
        const selectedSlots = Array.from(timeSlotsContainer.querySelectorAll('.time-slot.selected'));
        const locations = getSelectedLocations();
        selectedSlots.forEach(slot => {
            const li = document.createElement('li');
            li.textContent = `${slot.dataset.date} | ${slot.dataset.startTime} - ${slot.dataset.endTime} | ${locations.join(', ')}`;
            li.dataset.date = slot.dataset.date;
            li.dataset.startTime = slot.dataset.startTime;
            li.dataset.endTime = slot.dataset.endTime;
            li.dataset.locations = locations.join(',');

            const removeBtn = document.createElement('button');
            removeBtn.textContent = "×";
            removeBtn.className = "remove-slot";
            removeBtn.onclick = () => li.remove();
            li.appendChild(removeBtn);

            slotsList.appendChild(li);
        });
        // Clear selected slots
        selectedSlots.forEach(slot => slot.classList.remove('selected'));
    });

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

    const optOutSchool = document.getElementById("opt-out-same-school");
    const onlyMatchSchool = document.getElementById("only-match-same-school");

    optOutSchool.addEventListener("change", function() {
        if (this.checked) onlyMatchSchool.checked = false;
    });

    onlyMatchSchool.addEventListener("change", function() {
        if (this.checked) optOutSchool.checked = false;
    });
});