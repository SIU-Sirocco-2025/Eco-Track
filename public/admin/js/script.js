// Show Alert Message

const showAlert = document.querySelector('[show-alert]');
if (showAlert) {
    const dataTime = parseInt(showAlert.getAttribute('data-time'));
    setTimeout(() => {
        showAlert.classList.add('alert-hidden');
    }, dataTime)
    const closeAlert = showAlert.querySelector('[close-alert]')
    if (closeAlert) {
        closeAlert.addEventListener('click', () => {
            showAlert.classList.add('alert-hidden');
        })
    }
}

// End Show Alert Message