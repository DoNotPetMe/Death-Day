/* DEATH DAY — boot */
(function () {
  function boot() {
    DD.Game.init();
    DD.UI.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
