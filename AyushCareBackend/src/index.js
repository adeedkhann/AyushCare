import 'dotenv/config';
import { app } from './app.js';
import pool from './database/dbConnection.js';
import { initializeSchema } from './database/initSchema.js';
import http from 'http';
import { initSocket } from './services/socketService.js';

const startServer = async () => {
    try {
        await pool.query('SELECT NOW()');
        console.log('Successfully connected to Neon PostgreSQL.');
        await initializeSchema();
        console.log('Database tables successfully initialized.');
        const PORT = process.env.PORT || 8000;
        const httpServer = http.createServer(app);
        initSocket(httpServer);
        httpServer.listen(PORT, () => console.log(`Server is running at port : ${PORT}`));
    } catch (err) {
        console.error('Neon Database Connection failed: ', err);
        process.exit(1);
    }
};
startServer();
