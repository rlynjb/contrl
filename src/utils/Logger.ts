/**
 * Logger utility for consistent logging across the application
 */
export class Logger {
  /**
   * Log an info message
   */
  public static info(message: string): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  }

  /**
   * Log a warning message
   */
  public static warn(message: string): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
  }

  /**
   * Log an error message
   */
  public static error(message: string, error?: Error): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) {
      console.error(error.stack);
    }
  }

  /**
   * Log a debug message
   */
  public static debug(message: string): void {
    if (process.env.DEBUG === 'true') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
  }
}
