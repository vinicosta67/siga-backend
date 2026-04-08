import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './src/routes/authRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import permissionRoutes from './src/routes/permissionRoutes.js';
import proposalRoutes from './src/routes/proposalRoutes.js';
import visitRoutes from './src/routes/visitRoutes.js';
import xcurveRoutes from './src/routes/xcurveRoutes.js';
import agronavisRoutes from './src/routes/agronavisRoutes.js';
import searchRoutes from './src/routes/searchRoutes.js';

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
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/visitas', visitRoutes);
app.use('/api/xcurve', xcurveRoutes);
app.use('/api/agronavis', agronavisRoutes);
app.use('/api/search', searchRoutes);

app.get('/', (req, res) => {
    res.json({ message: "Servidor SIGA-Backend Online e rodando!" });
});

const PORT = process.env.PORT || 5005;

httpServer.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
