import { testConnection } from './connection';
import { runMigrations } from './migrate';
import { seedExercises } from './seed-exercises';
import { seedUserProgress } from './seed-user-progress';

async function main() {
  console.log('🚀 Starting database setup...');
  
  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.error('Database connection failed. Please check your DATABASE_URL environment variable.');
    process.exit(1);
  }
  
  // Run migrations
  const migrated = await runMigrations();
  if (!migrated) {
    console.error('Database migrations failed.');
    process.exit(1);
  }
  
  // Seed data
  await seedExercises();
  await seedUserProgress();
  
  console.log('🎉 Database setup completed successfully!');
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️ Database setup interrupted');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('❌ Database setup failed:', error);
  process.exit(1);
});
