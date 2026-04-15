(function () {
  function addRipple(event) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const circle = document.createElement('span');
    const diameter = Math.max(rect.width, rect.height);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = diameter + 'px';
    circle.style.left = event.clientX - rect.left - radius + 'px';
    circle.style.top = event.clientY - rect.top - radius + 'px';
    circle.classList.add('ripple');

    const existing = target.getElementsByClassName('ripple')[0];
    if (existing) {
      existing.remove();
    }

    target.appendChild(circle);
  }

  function bindRippleButtons() {
    document.querySelectorAll('.ripple-btn').forEach(function (button) {
      if (button.dataset.rippleBound === '1') return;
      button.dataset.rippleBound = '1';
      button.addEventListener('click', addRipple);
    });
  }

  function ensureLoginButtonMarkup() {
    const loginBtn = document.getElementById('login_btn');
    if (!loginBtn || loginBtn.dataset.enhanced === '1') return;

    const original = loginBtn.textContent || 'Enter Clinical Portal';
    loginBtn.textContent = '';

    const label = document.createElement('span');
    label.className = 'btn-label';
    label.textContent = original;

    const spinner = document.createElement('span');
    spinner.className = 'login-spinner';
    spinner.setAttribute('aria-hidden', 'true');

    loginBtn.appendChild(label);
    loginBtn.appendChild(spinner);
    loginBtn.dataset.enhanced = '1';
  }

  function revealCards() {
    const cards = document.querySelectorAll('.card, .bslib-value-box');
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    cards.forEach(function (card, index) {
      card.style.transitionDelay = Math.min(index * 35, 320) + 'ms';
      observer.observe(card);
    });
  }

  function chartReveal() {
    const charts = document.querySelectorAll('.js-plotly-plot');
    charts.forEach(function (chart, index) {
      const delay = 120 + Math.min(index * 60, 360);
      setTimeout(function () {
        chart.classList.add('chart-visible');
      }, delay);
    });
  }

  function tiltCards() {
    document.querySelectorAll('.card, .whatif-card').forEach(function (card) {
      if (card.dataset.tiltBound === '1') return;
      card.dataset.tiltBound = '1';

      card.addEventListener('mousemove', function (event) {
        const rect = card.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        const rx = (0.5 - py) * 1.8;
        const ry = (px - 0.5) * 2.1;
        card.style.transform = 'translateY(-3px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  function setLoginVars(x, y) {
    const screen = document.querySelector('.login-screen');
    if (!screen) return;

    screen.style.setProperty('--pointer-x', x.toFixed(2) + 'px');
    screen.style.setProperty('--pointer-y', y.toFixed(2) + 'px');
    screen.style.setProperty('--scroll-y', screen.scrollTop.toFixed(2) + 'px');
  }

  function createLoginParticles() {
    const host = document.getElementById('login_particles');
    if (!host || host.dataset.loaded === '1') return;

    host.dataset.loaded = '1';
    const specs = [
      [16, '14%', '12%', 10, -1.2],
      [22, '24%', '20%', 12, -0.8],
      [12, '20%', '30%', 8, -2.4],
      [28, '80%', '18%', 14, -3.1],
      [14, '74%', '26%', 9, -1.9],
      [18, '66%', '32%', 11, -0.5],
      [20, '84%', '34%', 10, -2.7],
      [10, '46%', '15%', 8, -3.4]
    ];

    specs.forEach(function (item) {
      const particle = document.createElement('span');
      particle.className = 'login-particle';
      particle.style.width = item[0] + 'px';
      particle.style.height = item[0] + 'px';
      particle.style.left = item[1];
      particle.style.top = item[2];
      particle.style.setProperty('--dur', item[3] + 's');
      particle.style.setProperty('--delay', item[4] + 's');
      host.appendChild(particle);
    });
  }

  function parallaxLogin() {
    const screen = document.querySelector('.login-screen');
    if (!screen || screen.dataset.parallaxBound === '1') return;

    screen.dataset.parallaxBound = '1';
    createLoginParticles();

    const footer = document.querySelector('.login-footer-reveal');
    const updateFooterReveal = function () {
      if (!footer) return;
      const threshold = Math.max(120, Math.round(window.innerHeight * 0.25));
      if (screen.scrollTop > threshold) {
        footer.classList.add('is-visible');
      } else {
        footer.classList.remove('is-visible');
      }
    };

    screen.addEventListener('mousemove', function (event) {
      const x = (event.clientX / window.innerWidth - 0.5) * 26;
      const y = (event.clientY / window.innerHeight - 0.5) * 24;
      setLoginVars(x, y);
    });

    screen.addEventListener('scroll', function () {
      setLoginVars(0, 0);
      updateFooterReveal();
    }, { passive: true });

    window.addEventListener('resize', function () {
      setLoginVars(0, 0);
      updateFooterReveal();
    });

    updateFooterReveal();
    setLoginVars(0, 0);
  }

  function tiltLoginCard() {
    const card = document.querySelector('.login-card');
    if (!card || card.dataset.tiltBound === '1') return;

    card.dataset.tiltBound = '1';

    card.addEventListener('mousemove', function (event) {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 5.4;
      const ry = (px - 0.5) * 6.6;
      card.style.transform = 'translateY(-6px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    });

    card.addEventListener('mouseleave', function () {
      card.style.transform = '';
    });
  }

  function watchDashboardEntrance() {
    const root = document.querySelector('.login-screen');
    if (root) {
      document.body.classList.remove('dashboard-enter');
      return;
    }

    if (document.body.classList.contains('login-transitioning')) {
      document.body.classList.remove('login-transitioning');
      document.body.classList.add('dashboard-enter');
      setTimeout(function () {
        document.body.classList.remove('dashboard-enter');
      }, 850);
    }
  }

  function bindLoginTransition() {
    const loginBtn = document.getElementById('login_btn');
    if (!loginBtn || loginBtn.dataset.blurBound === '1') return;

    ensureLoginButtonMarkup();
    loginBtn.dataset.blurBound = '1';

    loginBtn.addEventListener('click', function () {
      const card = document.querySelector('.login-card');
      if (!card) return;

      loginBtn.classList.add('login-loading');
      document.body.classList.add('login-transitioning');
      card.style.opacity = '0.96';
    });

    const notifications = document.querySelector('.shiny-notification-output');
    if (notifications && notifications.dataset.loginObserver !== '1') {
      notifications.dataset.loginObserver = '1';
      const observer = new MutationObserver(function () {
        const hasInvalid = Array.from(notifications.querySelectorAll('.shiny-notification')).some(function (node) {
          return /invalid username or password/i.test(node.textContent || '');
        });

        if (hasInvalid) {
          loginBtn.classList.remove('login-loading');
          document.body.classList.remove('login-transitioning');
          const card = document.querySelector('.login-card');
          if (card) {
            card.style.opacity = '';
          }
        }
      });

      observer.observe(notifications, { childList: true, subtree: true });
    }
  }

  function initMotion() {
    bindRippleButtons();
    ensureLoginButtonMarkup();
    revealCards();
    chartReveal();
    tiltCards();
    parallaxLogin();
    tiltLoginCard();
    bindLoginTransition();
    watchDashboardEntrance();
  }

  document.addEventListener('DOMContentLoaded', initMotion);
  document.addEventListener('shiny:connected', initMotion);
  document.addEventListener('shiny:value', function () {
    setTimeout(initMotion, 100);
  });
})();
