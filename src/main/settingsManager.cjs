const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;

class SettingsManager {
  constructor() {
    this.settingsPath = null;
    this.settings = {
      imageSavePath: ''
    };
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    await this.loadSettings();
    this.initialized = true;
  }

  async loadSettings() {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf8');
      this.settings = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, use defaults
      console.log('No settings file found, using defaults');
      await this.saveSettings(this.settings);
    }
  }

  async saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      await fs.writeFile(
        this.settingsPath,
        JSON.stringify(this.settings, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  async getSettings() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.settings;
  }

  async getSetting(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.settings[key];
  }

  async setSetting(key, value) {
    if (!this.initialized) {
      await this.initialize();
    }
    this.settings[key] = value;
    return this.saveSettings(this.settings);
  }
}

module.exports = new SettingsManager();