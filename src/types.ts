export interface Message {
  id: string;
  content: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: Date;
  images?: string[];
}

export interface Settings {
  imageSavePath: string;
}