const express = require('express');
const path = require('path');
const { installQuizRoutes } = require('./quiz-generation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
installQuizRoutes(app);
app.use('/vendor', express.static(path.join(__dirname, 'Betrunken-claude-move-question-banner-HZEjB', 'lib')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Mosty running on http://localhost:${PORT}`);
});
