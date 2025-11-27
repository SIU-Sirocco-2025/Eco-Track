(function() {
  const formRequest = document.getElementById('form-request-otp');
  const formVerify = document.getElementById('form-verify-register');
  const backBtn = document.getElementById('btn-back');
  const showVerifyLink = document.getElementById('show-verify-form');

  // Toggle hiển thị form verify
  if (showVerifyLink && formRequest && formVerify) {
    showVerifyLink.addEventListener('click', (e) => {
      e.preventDefault();
      formRequest.classList.add('d-none');
      formVerify.classList.remove('d-none');
    });
  }

  // Gửi OTP
  if (formRequest) {
    formRequest.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!formRequest.checkValidity()) {
        e.stopPropagation();
        formRequest.classList.add('was-validated');
        return;
      }

      const formData = new FormData(formRequest);
      const email = formData.get('email');
      const submitBtn = formRequest.querySelector('button[type="submit"]');
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang gửi...';

      try {
        const response = await fetch('/auth/register/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || 'Gửi OTP thất bại');
        }

        // Chuyển sang form xác thực
        formRequest.classList.add('d-none');
        formVerify.classList.remove('d-none');
        formVerify.querySelector('input[name="email"]').value = email;
        
        // Hiển thị thông báo
        showMessage('success', `Mã OTP đã được gửi đến ${email}. Vui lòng kiểm tra email.`);
        
      } catch (error) {
        showMessage('error', error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-send-fill me-2"></i>Gửi mã OTP';
      }
    });
  }

  // Nút quay lại
  if (backBtn && formRequest && formVerify) {
    backBtn.addEventListener('click', () => {
      formVerify.classList.add('d-none');
      formRequest.classList.remove('d-none');
      formRequest.classList.remove('was-validated');
      formVerify.classList.remove('was-validated');
    });
  }

  // Hiển thị thông báo
  function showMessage(type, text) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
      ${text}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.querySelector('.register-page-wrapper .container');
    container.insertBefore(alertDiv, container.firstChild);
    
    setTimeout(() => {
      alertDiv.classList.remove('show');
      setTimeout(() => alertDiv.remove(), 150);
    }, 5000);
  }

  // Toggle password visibility
  const toggleBtns = document.querySelectorAll('[id^="toggle"]');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('input');
      const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
      input.setAttribute('type', type);
      
      const icon = this.querySelector('i');
      icon.classList.toggle('bi-eye-slash');
      icon.classList.toggle('bi-eye');
    });
  });
})();