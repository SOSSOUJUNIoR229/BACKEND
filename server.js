const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.text());
app.use(express.static('public'));

mongoose.connect('mongodb+srv://natanaelsossou:D72O3KJ4IyEG1t0D@cluster0.nmmjnby.mongodb.net/', {
  dbName: 'rfid_system',
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connecté à MongoDB"))
.catch(err => console.error("❌ Erreur MongoDB :", err));

const userSchema = new mongoose.Schema({
  fullname: String,
  email: String,
  momo: String,
  password: String
});

const transactionSchema = new mongoose.Schema({
  phone: String,
  montant: Number,
  date: String,
  heure: String
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);

// Variables de statut
let statutPaiement = "Attente";

// ========== ROUTES ==========
app.post('/register', async (req, res) => {
  const { fullname, email, momo, password } = req.body;
  if (!fullname || !email || !momo || !password) {
    return res.status(400).json({ message: 'Champs obligatoires manquants.' });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Utilisateur déjà inscrit' });

    const newUser = new User({ fullname, email, momo, password });
    await newUser.save();
    res.status(201).json({ message: 'Inscription réussie' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

app.post('/login', async (req, res) => {
  const { fullname, password } = req.body;
  const user = await User.findOne({ fullname, password });
  if (!user) return res.status(401).json({ message: 'Nom ou mot de passe incorrect' });

  res.status(200).json({
    message: 'Connexion réussie',
    redirect: 'dashboard.html',
    user: {
      fullname: user.fullname,
      phone: user.momo
    }
  });
});

app.post("/api/transactions", async (req, res) => {
  const transaction = new Transaction(req.body);
  await transaction.save();
  res.status(201).json({ message: "Transaction enregistrée" });
});

app.get("/api/transactions/:phone", async (req, res) => {
  const transactions = await Transaction.find({ phone: req.params.phone }).sort({ date: -1, heure: -1 });
  res.json(transactions);
});

app.post('/api/check-phone', async (req, res) => {
  const { phone } = req.body;
  const user = await User.findOne({ momo: phone });
  if (!user) return res.status(404).json({ message: 'Numéro non trouvé' });
  res.status(200).json({ message: 'Numéro vérifié', user });
});

// 🚀 Reçoit "Top" de l'ESP32
app.post("/lien", (req, res) => {
  const msg = req.body;
  console.log("🔔 Reçu du module :", msg);

  if (msg === "Top") {
    statutPaiement = "EnCours";

    // ✅ Lancer le script Python
    exec('python test.py', (error, stdout, stderr) => {
      if (error) {
        console.error(`Erreur Python : ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Stderr Python : ${stderr}`);
        return;
      }
      console.log(`Résultat Python : ${stdout}`);
    });

    io.emit("start-paiement");
    res.sendStatus(200);
  } else {
    res.status(400).send("Invalide");
  }
});


// 🔄 Le frontend appelle ceci après paiement
app.post("/fin", (req, res) => {
  console.log("✅ Paiement terminé !");
  statutPaiement = "Finit";
  res.sendStatus(200);
});

// 🔁 L’ESP32 vérifie ici
app.get("/statut", (req, res) => {
  res.send(statutPaiement);
  if (statutPaiement === "Finit") {
    statutPaiement = "Attente"; // Réinitialiser
  }
});

// ========== WEBSOCKET ==========
io.on("connection", (socket) => {
  console.log("🧩 Client WebSocket connecté !");
});

server.listen(4000, () => {
  console.log("🚀 Serveur HTTP + WebSocket démarré sur http://localhost:4000");
});
