import { Server } from 'socket.io';

let io;

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        console.log(`[Socket.io] Client connected: ${socket.id}`);
        socket.on('disconnect', (reason) => {
            console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
        });
    });

    return io;
};

export const emitEvent = (event, data) => {
    if (!io) {
        console.warn(`[Socket.io] Event skipped before initialization: ${event}`);
        return false;
    }

    io.emit(event, data);
    return true;
};

export const getSocket = () => io;
