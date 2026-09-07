/* ═══════════════════════════════════════════════════════════════════
   NICE — Data Import / Export
   Backup and restore all NICE data as JSON.
═══════════════════════════════════════════════════════════════════ */

const DataIO = (() => {
  const PREFIX_KEYS = ['nice-', 'ns-'];
  const STATE_KEYS = ['agents', 'missions', 'spaceships', 'notifications'];

  /**
   * Export all NICE data as a downloadable JSON file.
   */
  function exportData() {
    const lsData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (PREFIX_KEYS.some(p => key.startsWith(p))) {
        lsData[key] = localStorage.getItem(key);
      }
    }

    const stateData = {};
    STATE_KEYS.forEach(k => {
      const val = State.get(k);
      if (val !== undefined && val !== null) stateData[k] = val;
    });

    const user = State.get('user');
    const envelope = {
      version: '1.0',
      app: 'NICE',
      exportDate: new Date().toISOString(),
      userEmail: user?.email || null,
      localStorage: lsData,
      stateData: stateData,
    };

    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `nice-export-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof Gamification !== 'undefined') Gamification.addXP('export_data');
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Data Exported', message: 'Your NICE data has been downloaded.', type: 'system' });
    }
  }

  /**
   * Import NICE data from a JSON file.
   * @param {File} file — JSON file from <input type="file">
   */
  function importData(file) {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const envelope = JSON.parse(e.target.result);

        if (!envelope.version || !envelope.localStorage) {
          alert('Invalid NICE export file. Missing required fields.');
          return;
        }

        const count = Object.keys(envelope.localStorage).length;
        const date = envelope.exportDate ? new Date(envelope.exportDate).toLocaleDateString() : 'unknown';
        if (!confirm(`Import NICE data from ${date}?\n\n${count} settings will be restored.\nThe page will reload after import.`)) return;

        // Restore localStorage
        Object.entries(envelope.localStorage).forEach(([key, val]) => {
          localStorage.setItem(key, val);
        });

        // Restore State data
        if (envelope.stateData) {
          Object.entries(envelope.stateData).forEach(([key, val]) => {
            State.set(key, val);
          });
        }

        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Data Imported', message: 'Reloading to apply changes...', type: 'system' });
        }

        setTimeout(() => location.reload(), 500);
      } catch (err) {
        alert('Failed to parse import file: ' + err.message);
      }
    };

    reader.readAsText(file);
  }

  return { exportData, importData };
})();
