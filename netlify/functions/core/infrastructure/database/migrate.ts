import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from './connection';

export async function runMigrations() {
  try {
    console.log('🚀 Running database migrations...');
    
    // Read and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSQL = readFileSync(schemaPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await sql([statement] as any);
        } catch (error) {
          console.error(`Error executing statement: ${statement.substring(0, 100)}...`);
          throw error;
        }
      }
    }
    
    console.log('✅ Database migrations completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return false;
  }
}
