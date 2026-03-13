import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './src/routes/authRoutes.js';
import permissionRoutes from './src/routes/permissionRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log(`Cliente conectado via WebSockets: ${socket.id}`);

    socket.on("disconnect", () => {
        console.log(`Cliente desconectado: ${socket.id}`);
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/permissions', permissionRoutes);

app.get('/', (req, res) => {
    res.json({ message: "Servidor SIGA-Backend Online e rodando!" });
});

const PORT = process.env.PORT || 5005;

httpServer.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
