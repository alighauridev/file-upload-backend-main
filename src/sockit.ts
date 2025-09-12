import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
export interface ChatMessage {
   id: string;
   user: string;
   text: string;
   timestamp: number;
}

export interface User {
   id: string;
   name: string;
}

export interface Room {
   id: string;
   name: string;
   users: User[];
}
export default function setupSocketIO(httpServer: HttpServer): SocketIOServer {
   const io = new SocketIOServer(httpServer, {
      cors: {
         origin: "*", // In production, specify your client's URL
         methods: ["GET", "POST"]
      }
   });

   // Store active users
   const activeUsers: Map<string, User> = new Map();

   // Store messages (in a real app, you'd use a database)
   const messages: ChatMessage[] = [];

   // Socket.IO event handlers
   io.on("connection", (socket) => {
      console.log(`User connected: ${socket.id}`);

      // Handle user joining
      socket.on("user:join", (userData: { name: string }) => {
         const user: User = {
            id: socket.id,
            name: userData.name
         };

         // Store user
         activeUsers.set(socket.id, user);

         // Broadcast user joined to everyone
         io.emit("user:joined", user);

         // Send active users list to the new user
         socket.emit("users:active", Array.from(activeUsers.values()));

         // Send recent messages to the new user
         socket.emit("messages:history", messages.slice(-50));

         console.log(`User ${userData.name} joined with ID: ${socket.id}`);
      });

      // Handle chat messages
      socket.on("message:send", (messageData: { text: string }) => {
         const user = activeUsers.get(socket.id);

         if (user) {
            const message: ChatMessage = {
               id: Date.now().toString(),
               user: user.name,
               text: messageData.text,
               timestamp: Date.now()
            };

            // Store message
            messages.push(message);

            // If we want to limit stored messages
            if (messages.length > 100) {
               messages.shift();
            }

            // Broadcast message to all clients
            io.emit("message:new", message);
         }
      });

      // Handle typing indicator
      socket.on("user:typing", (isTyping: boolean) => {
         const user = activeUsers.get(socket.id);
         if (user) {
            socket.broadcast.emit("user:typing", {
               user: user.name,
               isTyping
            });
         }
      });

      // Handle disconnection
      socket.on("disconnect", () => {
         const user = activeUsers.get(socket.id);

         if (user) {
            // Remove user from active users
            activeUsers.delete(socket.id);

            // Broadcast user left to everyone
            io.emit("user:left", user);

            console.log(`User disconnected: ${user.name} (${socket.id})`);
         }
      });
   });

   return io;
}
