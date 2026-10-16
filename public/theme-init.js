/**
 * Aplica o tema ANTES do primeiro paint (elimina o flash/delay no F5).
 *
 * Fica em arquivo próprio (e não inline no index.html) para que a
 * Content-Security-Policy possa usar script-src sem 'unsafe-inline'.
 */
(function () {
  try {
    var theme = localStorage.getItem('neva_custom_theme') || 'default';
    var isDark = localStorage.getItem('neva_dark_mode');
    var isDarkMode = isDark !== 'false'; // default: true

    var activeTheme = theme === 'default' ? (isDarkMode ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', activeTheme);

    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    // localStorage bloqueado (modo privado/iframes restritos): segue com o
    // tema padrão definido no CSS.
  }
})();
