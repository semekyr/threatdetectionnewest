class NavBar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
        <nav class="topnav" id="navMenu">
            <button onclick="navigate('dashboard.html')">Dashboard</button>
            <button onclick="navigate('model-manager.html')">Model Manager</button>
            <button onclick="navigate('rules.html')">Detection Rules</button>
            <button onclick="navigate('alerts.html')">Alerts</button>
            <button onclick="navigate('logs.html')">Logs</button>
            <button onclick="navigate('cameras.html')">Camera Manager</button>
            <!-- <button onclick="logout()">Log Out</button> -->
            <a href="javascript:void(0);" class="icon" onclick="toggleMenu()">
                <span></span>
                <span></span>
                <span></span>
            </a>
        </nav>
    `;
  }
}
customElements.define('nav-bar', NavBar);

function toggleMenu() {
  const nav = document.getElementById("navMenu");
  nav.classList.toggle("responsive");
}