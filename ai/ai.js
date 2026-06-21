/**
 * ai/ai.js
 * Ananya AI Management page logic.
 * Stats are static mock values, same as the original app, preserved as-is per scope.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Ananya AI', userEmail: user.email, notifCount: 3 });

  document.getElementById('disable-ai-btn').addEventListener('click', () => {
    Toast.show('Disable AI Assistant — hook this up to your AI config when ready.');
  });
  document.getElementById('view-logs-btn').addEventListener('click', () => {
    Toast.show('Conversation logs — hook this up when ready.');
  });
  document.getElementById('export-feedback-btn').addEventListener('click', () => {
    Toast.show('Export feedback report — hook this up when ready.');
  });
})();
