import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

// Создаём папку logs, если её нет
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatMessage(level: LogLevel, message: string, meta?: any): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

function writeLog(level: LogLevel, message: string, meta?: any) {
  const logLine = formatMessage(level, message, meta);
  // Вывод в консоль
  if (level === 'ERROR') {
    console.error(logLine.trim());
  } else if (level === 'WARN') {
    console.warn(logLine.trim());
  } else {
    console.log(logLine.trim());
  }
  // Запись в файл
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

export const logger = {
  info: (message: string, meta?: any) => writeLog('INFO', message, meta),
  warn: (message: string, meta?: any) => writeLog('WARN', message, meta),
  error: (message: string, meta?: any) => writeLog('ERROR', message, meta),
  debug: (message: string, meta?: any) => writeLog('DEBUG', message, meta),
};
