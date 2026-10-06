const path = require('path');
const express = require('express');
const app = require('./app');
app.use(express.static(path.join(__dirname, 'public')));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Flashcard chạy tại http://localhost:${port}`));
