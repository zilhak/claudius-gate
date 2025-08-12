import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';

export interface AppSettings {
  imageSavePath?: string;
  claudeApiKey?: string;
  claudeModel?: string;
}

class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings = {};

  constructor() {
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf-8');
      this.settings = JSON.parse(data);
    } catch (error) {
      // Settings file doesn't exist or is invalid, use defaults
      this.settings = {};
    }
  }

  async saveSettings(): Promise<void> {
    try {
      const userDataPath = app.getPath('userData');
      await fs.mkdir(userDataPath, { recursive: true });
      await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  get(key: keyof AppSettings): any {
    return this.settings[key];
  }

  async set(key: keyof AppSettings, value: any): Promise<void> {
    this.settings[key] = value;
    await this.saveSettings();
  }

  getAll(): AppSettings {
    return { ...this.settings };
  }

  async setAll(settings: AppSettings): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await this.saveSettings();
  }
}

export default new SettingsManager();