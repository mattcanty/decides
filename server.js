var express = require('express');
var app = express();

app.use(express.static('public')).listen(process.env.PORT, process.env.IP);

console.log('Server started.');