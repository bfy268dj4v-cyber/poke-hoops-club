/* Boot: load the save from this browser and show the title screen. */
PH.game.load();
PH.ui.boot();
window.addEventListener('beforeunload', () => { if (PH.game.state()) PH.game.save(); });
