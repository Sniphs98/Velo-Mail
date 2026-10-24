import { defineConfig } from 'drizzle-kit';

// Migrations ship with the app and run at startup (electron/db/index.ts).
export default defineConfig({
	dialect: 'sqlite',
	schema: './electron/db/schema.ts',
	out: './drizzle'
});
