import { config } from 'dotenv';

config({ path: '.env.test', override: false });
process.env.NODE_ENV = 'test';
